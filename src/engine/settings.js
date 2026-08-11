// src/engine/settings.js
// Purpose: The one module that owns all persisted state — settings,
// campaign progress, and high scores. Every later feature (difficulty,
// accessibility toggles, volume, keybindings, "intro seen", endings,
// hint flags) reads and writes through this API so persistence lives in
// exactly one place.
// Dependencies: none (must stay import-clean — it loads before the engine
// and is used by headless tests without a renderer).

const KEYS = {
    settings: 'vsbeu.settings',
    progress: 'vsbeu.progress',
    scores: 'vsbeu.scores'
};

export const SETTING_DEFAULTS = {
    difficulty: 'medium',        // legacy preference only; run mode lives in campaign progress
    masterVolume: 1,
    sfxVolume: 1,
    musicVolume: 1,
    reduceFlashing: false,
    reduceMotion: false,
    reduceHorrorAudio: false,    // mutes whisper / softens sub-bass, never text
    // Collapse stereo placement to centre. NOT a preference — for a player
    // with hearing in one ear, a cue panned to the deaf side is not quieter,
    // it is gone: measured at PAN_LIMIT 0.85 the far channel carries 0.033 rms
    // against 0.406 unplaced, about -22dB. Stereo placement makes wind-ups
    // easier to locate for most players and deletes them for that one, so the
    // feature ships with its own off switch. Distance rolloff is kept — it
    // carries the same information in one channel.
    //
    // DEFAULTED ON, and the asymmetry is the whole argument. A two-eared
    // player running mono loses the direction of a wind-up and keeps its
    // distance, timing and existence: the fight is still completely playable.
    // A one-eared player running stereo loses roughly half the wind-ups in the
    // game outright, and cannot discover why, because a cue that never arrives
    // leaves nothing to notice. When one default is a downgrade and the other
    // is a silent hole, you do not put the hole on by default and wait for the
    // player to find the menu — especially not on a game whose own controls
    // doc claims most of combat is readable with your eyes shut.
    monoAudio: true,
    alwaysShowDialogue: false,   // replay intro/boss intros even when seen
    keybindings: null,           // null = input.js defaults; else {action: code}
    lastHero: 0
};

const PROGRESS_DEFAULTS = {
    highestLevel: 1,
    heroCompletions: {},         // heroId -> true once the campaign is cleared
    introSeen: false,
    bossIntroSeen: [],           // bossIds whose intro dialogue has played
    contentWarningAck: false,
    hintsSeen: [],               // onboarding hint ids
    storySeen: [],               // story-panel line ids already heard (Phase G)
    tutorialDone: false,
    // Phase G — `unlockedEndings` is GONE, and this comment is the tombstone.
    //
    // It held 'destroyer' | 'liberator' | 'merged', it was written by nothing,
    // and `setSetting` — the only writer — was called nowhere in the codebase.
    // Every player who has ever finished this game got the same nine-line
    // epilogue. The field was not a feature that needed finishing; it was a
    // promise in the save schema that the game had no way to keep, and leaving
    // it there means the next reader spends an hour working out why their
    // ending never changes.
    //
    // Trap 4 applies: deleting the CALL is not deleting the feature. The field
    // is out of the schema, out of `resetAll`, out of the reload guard, and
    // `settings.spec.mjs` now fails if it comes back.
};

const MAX_SCORES = 10;

// localStorage may be absent (file://, some headless contexts) or throw
// (privacy modes). Everything funnels through these two guards; when
// storage is unavailable the module still works, it just doesn't persist.
function readJSON(key) {
    try {
        if (!window.localStorage) return null;
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function writeJSON(key, value) {
    try {
        if (window.localStorage) {
            window.localStorage.setItem(key, JSON.stringify(value));
        }
    } catch (e) {
        // persistence is a convenience, not a requirement
    }
}

// In-memory copies are the source of truth for the session; storage is a
// mirror. Unknown keys from older/newer saves are preserved on write but
// never returned past the defaults filter.
let settings = Object.assign({}, SETTING_DEFAULTS, readJSON(KEYS.settings) || {});
let progress = Object.assign({}, PROGRESS_DEFAULTS, readJSON(KEYS.progress) || {});
let scores = Array.isArray(readJSON(KEYS.scores)) ? readJSON(KEYS.scores) : [];

const listeners = new Set();

export function getSetting(key) {
    return settings[key];
}

/** Persist a setting and notify subscribers ({key, value} per change). */
export function setSetting(key, value) {
    if (settings[key] === value) return;
    settings[key] = value;
    writeJSON(KEYS.settings, settings);
    for (const fn of listeners) {
        try { fn(key, value); } catch (e) { /* listener errors stay local */ }
    }
}

/** Subscribe to setting changes; returns an unsubscribe function. */
export function onSettingChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function getProgress() {
    return progress;
}

/**
 * Merge a partial progress update and persist.
 *
 * Re-reads disk before merging. `progress` normally never drifts from disk —
 * every call here writes both together — but a tab restored from the
 * back/forward cache (or a second tab open on the same save) resumes with
 * whatever `progress` held at the moment it was frozen, not what is on disk
 * now. Merging the patch straight into that stale in-memory copy would write
 * it back and silently erase anything a fresher tab saved in between: a
 * player who explored screens, then briefly left and returned to a
 * bfcache-restored tab, would see that exploration vanish the next time
 * anything else here calls setProgress. Reading disk first means only a
 * genuinely concurrent write in the same instant can still race.
 */
export function setProgress(patch) {
    const onDisk = readJSON(KEYS.progress);
    if (onDisk) Object.assign(progress, onDisk, patch);
    else Object.assign(progress, patch);
    writeJSON(KEYS.progress, progress);
}

/** Convenience: append to a progress array field without duplicates. */
export function markProgressFlag(arrayField, id) {
    const arr = progress[arrayField];
    if (!Array.isArray(arr)) return;
    if (!arr.includes(id)) {
        arr.push(id);
        writeJSON(KEYS.progress, progress);
    }
}

export function getScores(filter = null) {
    let out = scores.slice();
    if (filter?.runMode) out = out.filter((s) => s.runMode === filter.runMode);
    if (filter?.scoreVersion != null) out = out.filter((s) => s.scoreVersion === filter.scoreVersion);
    return out.sort((a, b) => b.score - a.score);
}

/** Record a run; keeps a separate top ten for each mode and score version. */
export function addScore(entry) {
    if (entry.runId && scores.some((score) => score.runId === entry.runId)) {
        return getScores({ runMode: entry.runMode || 'medium', scoreVersion: entry.scoreVersion || 1 });
    }
    const stored = {
        score: entry.score | 0,
        hero: entry.hero || '',
        ending: entry.ending || null,
        runMode: entry.runMode || 'medium',
        completed: !!entry.completed,
        beatReached: entry.beatReached || null,
        bosses: entry.bosses | 0,
        secrets: entry.secrets | 0,
        deaths: entry.deaths | 0,
        playTime: Number(entry.playTime) || 0,
        scoreVersion: entry.scoreVersion || 1,
        eligible: entry.eligible !== false,
        runId: entry.runId || null,
        date: entry.date || new Date().toISOString().slice(0, 10),
    };
    scores.push(stored);
    const group = (s) => `${s.runMode || 'medium'}:${s.scoreVersion || 1}`;
    const key = group(stored);
    const keep = scores.filter((s) => group(s) === key)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SCORES);
    scores = scores.filter((s) => group(s) !== key).concat(keep);
    writeJSON(KEYS.scores, scores);
    return getScores({ runMode: stored.runMode, scoreVersion: stored.scoreVersion });
}

/**
 * Difficulty scalars (Phase 3). Applied where enemies/bosses are created —
 * never to story beats. The Phase-0A audit numbers are the 'normal' curve.
 */
export function difficultyMultipliers() {
    const d = settings.difficulty;
    if (d === 'easy') return { enemyHp: 0.7, enemyDmg: 0.6 };
    if (d === 'hard') return { enemyHp: 1.2, enemyDmg: 1.35 };
    return { enemyHp: 1, enemyDmg: 1 };
}

/** Test/debug helper: reset everything to defaults (and clear storage). */
export function resetAll() {
    settings = Object.assign({}, SETTING_DEFAULTS);
    progress = Object.assign({}, PROGRESS_DEFAULTS,
        // fresh arrays/objects — the defaults object must never be mutated
        { heroCompletions: {}, bossIntroSeen: [], hintsSeen: [], storySeen: [] });
    scores = [];
    try {
        if (window.localStorage) {
            for (const k of Object.values(KEYS)) window.localStorage.removeItem(k);
        }
    } catch (e) { /* ignore */ }
}

// Reload guard: a stale save from before a field existed gets the default
// (Object.assign above), but arrays shared with PROGRESS_DEFAULTS would
// alias across resetAll — make sure the live copies are always our own.
if (progress.bossIntroSeen === PROGRESS_DEFAULTS.bossIntroSeen) progress.bossIntroSeen = [];
if (progress.hintsSeen === PROGRESS_DEFAULTS.hintsSeen) progress.hintsSeen = [];
if (progress.storySeen === PROGRESS_DEFAULTS.storySeen) progress.storySeen = [];
if (progress.heroCompletions === PROGRESS_DEFAULTS.heroCompletions) progress.heroCompletions = {};

// Debug/test handle (matches gameWorld's convention in game.js).
if (typeof window !== 'undefined') {
    window.vsbeuSettings = { getSetting, setSetting, getProgress, setProgress, addScore, getScores, resetAll, markProgressFlag };
}
