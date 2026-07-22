// Nested sovereignProgress under engine getProgress/setProgress (D4).

import { getProgress, setProgress } from '../../engine/settings.js';
import { createLivesState } from './lives.js';
import { createScoreState } from './score.js';
import { normalizeRunMode } from './run-mode.js';

function createRunId() {
    return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_SOVEREIGN = (mode = 'medium') => {
    const runMode = normalizeRunMode(mode);
    return {
    version: 3,
    // C1: a fresh game begins on the overworld, LttP-style
    currentBeat: 'overworld',
    unlockedBeats: ['overworld', 'beat-01-crypt', 'sandbox-combat'],
    inventory: null,
    hp: 6,
    maxHp: 6,
    playTime: 0,
    deaths: 0,
    bossesDefeated: [],
    mood: 'crust',
    dungeons: {},
    overworld: { pos: null, state: 'crust', visited: [] },
    runMode,
    runId: createRunId(),
    runStatus: 'living',
    lives: createLivesState(runMode),
    thread: null,
    score: createScoreState(runMode),
    bankedShards: 0,
    deathEcho: null,
    upgrades: {},
    campaignComplete: false,
};
};

/** One-shot migration. Fill new campaign systems without wiping old progress. */
function migrateToV3(s) {
    const runMode = normalizeRunMode(s.runMode || s.settings?.difficulty || 'medium');
    const defaults = DEFAULT_SOVEREIGN(runMode);
    return {
        ...defaults,
        ...s,
        version: 3,
        runMode,
        runStatus: s.runStatus || 'living',
        lives: { ...defaults.lives, ...(s.lives || {}) },
        score: { ...defaults.score, ...(s.score || {}), mode: runMode },
        dungeons: s.dungeons || {},
        overworld: { pos: null, state: 'crust', visited: [], ...(s.overworld || {}) },
    };
}

export function loadSovereignProgress() {
    const p = getProgress() || {};
    let s = p.sovereignProgress || {};
    if (Object.keys(s).length && (s.version || 1) < 3) {
        s = migrateToV3(s);
        setProgress({ sovereignProgress: s });
    }
    if (Object.keys(s).length && !s.runId) {
        s = { ...s, runId: createRunId() };
        setProgress({ sovereignProgress: s });
    }
    const mode = normalizeRunMode(s.runMode || 'medium');
    return { ...DEFAULT_SOVEREIGN(mode), ...s, runMode: mode };
}

export function saveSovereignProgress(patch) {
    const cur = loadSovereignProgress();
    const safe = { ...(patch || {}) };
    // Run mode is a campaign contract. Only resetSovereignProgress creates it.
    delete safe.runMode;
    const next = { ...cur, ...safe, runMode: cur.runMode };
    setProgress({ sovereignProgress: next });
    return next;
}

export function unlockBeat(id) {
    const cur = loadSovereignProgress();
    const unlocked = new Set(cur.unlockedBeats || []);
    unlocked.add(id);
    return saveSovereignProgress({ unlockedBeats: [...unlocked] });
}

/** True only when normal campaign progression has opened this level. */
export function isBeatUnlocked(id, progress = loadSovereignProgress()) {
    return new Set(progress.unlockedBeats || []).has(id);
}

export function recordBossDefeat(id) {
    const cur = loadSovereignProgress();
    const bosses = new Set(cur.bossesDefeated || []);
    bosses.add(id);
    return saveSovereignProgress({ bossesDefeated: [...bosses] });
}

export function resetSovereignProgress(mode = 'medium') {
    const cur = loadSovereignProgress();
    const next = {
        ...DEFAULT_SOVEREIGN(mode),
        settings: cur.settings,
        lastRun: cur.lastRun,
    };
    setProgress({ sovereignProgress: next });
    return next;
}

/** One durable write seals Survival before any death presentation begins. */
export function sealSurvivalRun(finalScore, patch = {}) {
    const cur = loadSovereignProgress();
    if (cur.runMode !== 'survival') return cur;
    const next = {
        ...cur,
        ...patch,
        runStatus: 'dead',
        lives: { ...(cur.lives || createLivesState('survival')), charges: 0, status: 'dead' },
        finalScore: { ...(finalScore || {}), completed: false },
        hp: 0,
    };
    setProgress({ sovereignProgress: next });
    return next;
}
