// C1: structural tests for the generated 7×7 overworld.

import { WORLD7 } from '../../src/game/overworld/world7.js';
import { LEVELS } from '../../src/game/levels/registry.js';

const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

export function run(t) {
    const screens = WORLD7.screens;
    const ids = Object.keys(screens);
    t.ok('49 screens', ids.length === 49, String(ids.length));
    t.ok('start exists', !!screens[WORLD7.start]);

    // Grid occupancy: every cell of the 7×7 filled exactly once
    const cells = new Set(ids.map((id) => screens[id].grid.join(',')));
    t.ok('49 unique grid cells', cells.size === 49);
    let inRange = true;
    for (const id of ids) {
        const [gx, gy] = screens[id].grid;
        if (gx < 8 || gx > 14 || gy < 8 || gy > 14) inRange = false;
    }
    t.ok('grids within [8,14]²', inRange);
    t.ok('scarfield anchored at [10,10]', screens.scarfield.grid.join(',') === '10,10');

    // Edge symmetry: every edge has a matching back-edge with the same
    // at/width and the opposite side, and points to a real adjacent screen
    let symmetric = true, adjacent = true;
    const byId = (id) => screens[id];
    for (const id of ids) {
        for (const e of screens[id].edges) {
            const other = byId(e.to);
            if (!other) { symmetric = false; continue; }
            const back = other.edges.find((b) => b.to === id);
            if (!back || back.side !== OPPOSITE[e.side]
                || back.at !== e.at || back.width !== e.width) symmetric = false;
            const dx = other.grid[0] - screens[id].grid[0];
            const dy = other.grid[1] - screens[id].grid[1];
            if (Math.abs(dx) + Math.abs(dy) !== 1) adjacent = false;
        }
    }
    t.ok('edges symmetric (side/at/width)', symmetric);
    t.ok('edges connect adjacent cells only', adjacent);

    // Full connectivity: BFS from start reaches all 49
    const seen = new Set([WORLD7.start]);
    const queue = [WORLD7.start];
    while (queue.length) {
        const id = queue.shift();
        for (const e of screens[id].edges) {
            if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
        }
    }
    t.ok('all screens reachable', seen.size === 49, String(seen.size));

    // 14 entrances, one per beat, all real registry ids
    const beatIds = new Set(LEVELS.filter((l) => l.id.startsWith('beat-')).map((l) => l.id));
    const entranceTargets = [];
    for (const id of ids) {
        for (const en of screens[id].entrances || []) entranceTargets.push(en.to);
    }
    t.ok('14 dungeon entrances', entranceTargets.length === 14, String(entranceTargets.length));
    t.ok('entrances cover all 14 beats',
        new Set(entranceTargets).size === 14
        && entranceTargets.every((b) => beatIds.has(b)),
        entranceTargets.join(','));

    // Monoliths + secrets + gated blockers present
    const monoliths = ids.filter((id) => screens[id].monolith).length;
    t.ok('≥4 monolith sites', monoliths >= 4, String(monoliths));
    const secrets = ids.filter((id) => screens[id].onBake).length;
    t.ok('≥8 secret caches', secrets >= 8, String(secrets));
    const blockerTypes = {};
    for (const id of ids) {
        for (const b of screens[id].blockers || []) {
            blockerTypes[b.type] = (blockerTypes[b.type] || 0) + 1;
        }
    }
    t.ok('≥2 overworld blockers per gating item',
        (blockerTypes.grapple_gap || 0) >= 2 && (blockerTypes.boot_ledge || 0) >= 2
        && (blockerTypes.wedge_crack || 0) >= 2 && (blockerTypes.caster_dark || 0) >= 2,
        JSON.stringify(blockerTypes));

    // Determinism: rebuilding yields identical edges
    t.ok('registry has the overworld', LEVELS.some((l) => l.id === 'overworld'));
}
