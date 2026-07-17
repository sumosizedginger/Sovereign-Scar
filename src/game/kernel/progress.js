// Nested sovereignProgress under engine getProgress/setProgress (D4).

import { getProgress, setProgress } from '../../engine/settings.js';

const DEFAULT_SOVEREIGN = () => ({
    version: 2,
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
    // Phase W (v2): world state — present in the default so New Game resets it
    dungeons: {},
    overworld: { pos: null, state: 'crust', visited: [] },
});

/** W8: one-shot v1 → v2 migration — fill the Phase W fields, never wipe. */
function migrateToV2(s) {
    return {
        ...s,
        version: 2,
        dungeons: s.dungeons || {},
        overworld: { pos: null, state: 'crust', visited: [], ...(s.overworld || {}) },
    };
}

export function loadSovereignProgress() {
    const p = getProgress() || {};
    let s = p.sovereignProgress || {};
    if (Object.keys(s).length && (s.version || 1) < 2) {
        s = migrateToV2(s);
        setProgress({ sovereignProgress: { ...DEFAULT_SOVEREIGN(), ...s } });
    }
    return { ...DEFAULT_SOVEREIGN(), ...s };
}

export function saveSovereignProgress(patch) {
    const cur = loadSovereignProgress();
    const next = { ...cur, ...patch };
    setProgress({ sovereignProgress: next });
    return next;
}

export function unlockBeat(id) {
    const cur = loadSovereignProgress();
    const unlocked = new Set(cur.unlockedBeats || []);
    unlocked.add(id);
    return saveSovereignProgress({ unlockedBeats: [...unlocked] });
}

export function recordBossDefeat(id) {
    const cur = loadSovereignProgress();
    const bosses = new Set(cur.bossesDefeated || []);
    bosses.add(id);
    return saveSovereignProgress({ bossesDefeated: [...bosses] });
}

export function resetSovereignProgress() {
    return saveSovereignProgress(DEFAULT_SOVEREIGN());
}
