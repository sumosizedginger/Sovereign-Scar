import { shatterConnectedKeys } from '../../src/game/world/destructible-voxel-mesh.js';
import { vkey } from '../../src/voxel/core.js';

export function run(t) {
    const map = new Map();
    for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) map.set(vkey(x, 0, z), 0x888888);
    }
    map.set(vkey(3, 0, 1), 0xff0000);
    map.set(vkey(4, 0, 1), 0xff0000);

    const removed = shatterConnectedKeys(map, 1, 0, 1, 8);
    t.ok('removed 9 gray', removed.length === 9, `got ${removed.length}`);
    t.ok('red survives', map.has(vkey(3, 0, 1)));
    t.ok('red2 survives', map.has(vkey(4, 0, 1)));
    t.ok('only reds left', map.size === 2);

    const map2 = new Map();
    for (let x = 0; x < 10; x++) map2.set(vkey(x, 0, 0), 0x111111);
    const r2 = shatterConnectedKeys(map2, 0, 0, 0, 2);
    t.ok('radius capped', r2.length < 10, `removed=${r2.length}`);
    t.ok('some remain outside radius', map2.size > 0);

    const map3 = new Map();
    t.ok('empty no-op', shatterConnectedKeys(map3, 0, 0, 0).length === 0);
}
