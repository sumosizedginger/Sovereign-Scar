// W7: pure blocker helpers + build-time map edits.

import {
    insideRect, grappleAimOk, ledgeHopTarget, applyBlockerToMap,
} from '../../src/game/world/blockers.js';

/** Mirror of blockers.js reverse-anchor fallback (keep in sync). */
function mirrorAnchor(anchor, rect) {
    const rx = (rect.x0 + rect.x1) / 2;
    const rz = (rect.z0 + rect.z1) / 2;
    return { x: rx - (anchor.x - rx), z: rz - (anchor.z - rz) };
}

export function run(t) {
    const r = { x0: 0, x1: 4, z0: 0, z1: 2 };
    t.ok('insideRect in', insideRect({ x: 2, z: 1 }, r));
    t.ok('insideRect out', !insideRect({ x: 5, z: 1 }, r));

    // grappleAimOk: aimed straight at the anchor within reach
    t.ok('aim ok straight', grappleAimOk(
        { x: 0, z: 0 }, { x: 0, z: -1 }, { x: 0, z: -6 }, 10));
    t.ok('aim fails sideways', !grappleAimOk(
        { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: -6 }, 10));
    t.ok('aim fails out of reach', !grappleAimOk(
        { x: 0, z: 0 }, { x: 0, z: -1 }, { x: 0, z: -20 }, 10));
    t.ok('aim fails too close', !grappleAimOk(
        { x: 0, z: 0 }, { x: 0, z: -1 }, { x: 0, z: -0.2 }, 10));

    // ledgeHopTarget: ledge strip z∈[4,5], approach from north moving south
    const ledge = { x0: -9, x1: 10, z0: 4, z1: 5 };
    const hopS = ledgeHopTarget(ledge, { x: 0, z: 3.2 }, { x: 0, z: 1 });
    t.ok('hop over southward', hopS && hopS.z > 5, JSON.stringify(hopS));
    const hopN = ledgeHopTarget(ledge, { x: 0, z: 5.8 }, { x: 0, z: -1 });
    t.ok('hop back northward', hopN && hopN.z < 4, JSON.stringify(hopN));
    t.ok('no hop when far away', ledgeHopTarget(ledge, { x: 0, z: 0 }, { x: 0, z: 1 }) === null);
    t.ok('no hop moving away', ledgeHopTarget(ledge, { x: 0, z: 3.2 }, { x: 0, z: -1 }) === null);

    // applyBlockerToMap: chasm carves floor; ledge stamps a 2-high wall
    const map = new Map();
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) map.set(`${x},0,${z}`, 1);
    applyBlockerToMap(map, { type: 'grapple_gap', rect: { x0: -1, x1: 1, z0: -1, z1: 1 } });
    t.ok('chasm carved', !map.has('0,0,0') && !map.has('1,0,-1'));
    t.ok('chasm rim intact', map.has('2,0,0') && map.has('-2,0,2'));

    const map2 = new Map();
    applyBlockerToMap(map2, { type: 'boot_ledge', rect: { x0: 0, x1: 2, z0: 0, z1: 0 } });
    t.ok('ledge stamped 2 high', map2.has('0,1,0') && map2.has('2,2,0') && !map2.has('0,3,0'));

    t.ok('caster_dark leaves map alone', (() => {
        const m = new Map([['0,0,0', 1]]);
        applyBlockerToMap(m, { type: 'caster_dark', rect: { x0: 0, x1: 1, z0: 0, z1: 1 } });
        return m.size === 1;
    })());

    // Auto reverse peg: single south anchor mirrors north of a Z-chasm so
    // return trips (post-boss exit) stay in grapple range.
    const chasm = { x0: -10, x1: 10, z0: -3, z1: -1 };
    const south = { x: 0, z: 0 };
    const north = mirrorAnchor(south, chasm);
    t.ok('mirror places reverse peg north of gap', north.z < chasm.z0, JSON.stringify(north));
    t.ok('mirror span is short enough for base grapple',
        Math.abs(north.z - south.z) <= 8, `span=${Math.abs(north.z - south.z)}`);
}
