// Nested sovereignProgress under engine getProgress/setProgress (D4).

import { getProgress, setProgress } from '../../engine/settings.js';

const DEFAULT_SOVEREIGN = () => ({
    version: 1,
    currentBeat: 'beat-01-crypt',
    unlockedBeats: ['beat-01-crypt', 'sandbox-combat'],
    inventory: null,
    hp: 6,
    maxHp: 6,
    playTime: 0,
    deaths: 0,
    bossesDefeated: [],
    mood: 'crust',
});

export function loadSovereignProgress() {
    const p = getProgress() || {};
    const s = p.sovereignProgress || {};
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
