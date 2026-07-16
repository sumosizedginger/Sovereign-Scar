// W3: per-dungeon lock-and-key state, persisted under
// sovereignProgress.dungeons[dungeonId] (read-modify-write — G13: the
// top-level save only shallow-merges).
//
// Schema: dungeons[id] = {
//   smallKeys: number, bossKey: bool,
//   opened: [doorKey], visited: [roomId], taken: [pickupId],
//   mapPickup: bool,
// }

import { loadSovereignProgress, saveSovereignProgress } from '../kernel/progress.js';

const EMPTY = () => ({
    smallKeys: 0,
    bossKey: false,
    opened: [],
    visited: [],
    taken: [],
    mapPickup: false,
});

export function getDungeonState(dungeonId) {
    const all = loadSovereignProgress().dungeons || {};
    return { ...EMPTY(), ...(all[dungeonId] || {}) };
}

function patchDungeon(dungeonId, patch) {
    const all = loadSovereignProgress().dungeons || {};
    const cur = { ...EMPTY(), ...(all[dungeonId] || {}) };
    const next = { ...cur, ...patch };
    saveSovereignProgress({ dungeons: { ...all, [dungeonId]: next } });
    return next;
}

export function grantSmallKey(dungeonId) {
    const s = getDungeonState(dungeonId);
    return patchDungeon(dungeonId, { smallKeys: s.smallKeys + 1 });
}

/** @returns {boolean} true if a key was available and spent */
export function useSmallKey(dungeonId) {
    const s = getDungeonState(dungeonId);
    if (s.smallKeys <= 0) return false;
    patchDungeon(dungeonId, { smallKeys: s.smallKeys - 1 });
    return true;
}

export function grantBossKey(dungeonId) {
    return patchDungeon(dungeonId, { bossKey: true });
}

export function hasBossKey(dungeonId) {
    return getDungeonState(dungeonId).bossKey === true;
}

export function openDoor(dungeonId, doorKey) {
    const s = getDungeonState(dungeonId);
    if (s.opened.includes(doorKey)) return s;
    return patchDungeon(dungeonId, { opened: [...s.opened, doorKey] });
}

export function isDoorOpen(dungeonId, doorKey) {
    return getDungeonState(dungeonId).opened.includes(doorKey);
}

export function markVisited(dungeonId, roomId) {
    const s = getDungeonState(dungeonId);
    if (s.visited.includes(roomId)) return s;
    return patchDungeon(dungeonId, { visited: [...s.visited, roomId] });
}

export function isPickupTaken(dungeonId, pickupId) {
    return getDungeonState(dungeonId).taken.includes(pickupId);
}

export function markPickupTaken(dungeonId, pickupId) {
    const s = getDungeonState(dungeonId);
    if (s.taken.includes(pickupId)) return s;
    return patchDungeon(dungeonId, { taken: [...s.taken, pickupId] });
}

export function markMapPickup(dungeonId) {
    return patchDungeon(dungeonId, { mapPickup: true });
}

/**
 * Adapter matching createDungeon's keyStore interface, persistent. Reads
 * come from an in-memory cache (the HUD polls every frame); every mutation
 * writes through to sovereignProgress and refreshes the cache.
 */
export function makeKeyStore(dungeonId) {
    let cache = getDungeonState(dungeonId);
    const refresh = () => { cache = getDungeonState(dungeonId); };
    return {
        isOpen: (dk) => cache.opened.includes(dk),
        open: (dk) => { openDoor(dungeonId, dk); refresh(); },
        trySpendSmallKey: () => { const ok = useSmallKey(dungeonId); refresh(); return ok; },
        grantSmallKey: () => { grantSmallKey(dungeonId); refresh(); },
        hasBossKey: () => cache.bossKey === true,
        grantBossKey: () => { grantBossKey(dungeonId); refresh(); },
        smallKeys: () => cache.smallKeys,
        isPickupTaken: (pid) => cache.taken.includes(pid),
        markPickupTaken: (pid) => { markPickupTaken(dungeonId, pid); refresh(); },
        markVisited: (roomId) => { markVisited(dungeonId, roomId); refresh(); },
        visited: () => cache.visited.slice(),
        mapPickup: () => cache.mapPickup === true,
        markMapPickup: () => { markMapPickup(dungeonId); refresh(); },
    };
}

// ── Overworld state (W4/W5) ────────────────────────────────────────────────
// sovereignProgress.overworld = { pos: {screen, x, z}, state: 'crust'|'abyss',
// visited: [screenId] }

const EMPTY_OVERWORLD = () => ({ pos: null, state: 'crust', visited: [] });

export function getOverworldState() {
    const o = loadSovereignProgress().overworld || {};
    return { ...EMPTY_OVERWORLD(), ...o };
}

export function patchOverworld(patch) {
    const cur = getOverworldState();
    const next = { ...cur, ...patch };
    saveSovereignProgress({ overworld: next });
    return next;
}

export function markScreenVisited(screenId) {
    const cur = getOverworldState();
    if (cur.visited.includes(screenId)) return cur;
    return patchOverworld({ visited: [...cur.visited, screenId] });
}

/**
 * Persistent key pickup: skipped entirely if already taken; granting marks
 * it taken so it never respawns. type: 'small' | 'boss'.
 */
export function addKeyPickup(level, dungeonId, pickupId, worldPos, type = 'small') {
    // Route through the level's keyStore when present so its cache stays
    // coherent (module-level writes would leave cached reads stale).
    const store = level.keyStore || makeKeyStore(dungeonId);
    if (store.isPickupTaken(pickupId)) return null;
    return level.addPickup(worldPos, {
        color: type === 'boss' ? 0xff5060 : 0xffd060,
        label: type === 'boss' ? 'Boss key' : 'Small key',
        onPickup(game) {
            store.markPickupTaken(pickupId);
            if (type === 'boss') {
                store.grantBossKey();
                game.hud?.toast?.('Boss key acquired');
            } else {
                store.grantSmallKey();
                game.hud?.toast?.('Small key acquired');
            }
        },
    });
}
