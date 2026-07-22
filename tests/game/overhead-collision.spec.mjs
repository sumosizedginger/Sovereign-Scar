// tests/game/overhead-collision.spec.mjs
// A column may only wall off the XZ plane where it is solid at BODY height.
// Standing on a floor whose top is y=1, the hero spans ~y=1..2.9 — cells 1
// and 2. Geometry that exists only overhead (an arch lintel, a bone canopy, a
// suspended bar, a cantilevered shelf) must be walked UNDER, not treated as a
// full-height wall. Regression guard for Beat 08's bone arches, which were
// blocking the player across the whole dungeon.

import { meshAndCollide } from '../../src/game/world/level-builder.js';
import { fillBox } from '../../src/voxel/helpers.js';
import { buildBoneArch, stampMap } from '../../src/game/assets/props.js';

function fakeWorld() {
    return { solids: [], addSolid(s) { this.solids.push(s); }, removeSolid() {} };
}

/** Build `map` and return the set of "x,z" cells registered as XZ walls. */
function solidCells(map) {
    const cw = fakeWorld();
    const built = meshAndCollide(map, null, cw, { solidPrefix: 't' });
    const out = new Set();
    for (const s of cw.solids) out.add(s.id.replace(/^t:/, ''));
    built.dispose();
    return out;
}

export function run(t) {
    // --- synthetic arch ---
    const m = new Map();
    fillBox(m, -8, 8, 0, 0, -8, 8, 0x404040);   // floor everywhere (y=0)
    fillBox(m, -2, -2, 1, 4, 0, 0, 0x808080);   // arch upright (west)
    fillBox(m, 2, 2, 1, 4, 0, 0, 0x808080);     // arch upright (east)
    fillBox(m, -2, 2, 5, 5, 0, 0, 0x808080);    // arch lintel (overhead span)
    fillBox(m, -8, 8, 1, 4, 5, 5, 0x808080);    // a real wall
    fillBox(m, 7, 7, 1, 1, 7, 7, 0x808080);     // a 1-high step

    const solids = solidCells(m);
    t.ok('arch uprights are walls', solids.has('-2,0') && solids.has('2,0'));
    t.ok('arch opening is walkable (lintel overhead only)',
        !solids.has('-1,0') && !solids.has('0,0') && !solids.has('1,0'),
        [...solids].filter((s) => s.endsWith(',0')).join(' '));
    t.ok('a real wall still blocks', solids.has('0,5') && solids.has('-8,5'));
    t.ok('a 1-high step stays standable (not a wall)', !solids.has('7,7'));
    t.ok('bare floor is not a wall', !solids.has('4,4'));

    // A shelf hovering at y=3..4 leaves the body band clear → walk under.
    const m2 = new Map();
    fillBox(m2, -8, 8, 0, 0, -8, 8, 0x404040);
    fillBox(m2, 0, 3, 3, 4, 0, 1, 0x808080);
    const s2 = solidCells(m2);
    t.ok('cantilevered shelf is walkable underneath', !s2.has('1,0') && !s2.has('2,1'));

    // A block occupying y=2 IS at body height and must block.
    const m3 = new Map();
    fillBox(m3, -8, 8, 0, 0, -8, 8, 0x404040);
    fillBox(m3, 0, 0, 2, 3, 0, 0, 0x808080);
    t.ok('a block at body height (y=2) blocks', solidCells(m3).has('0,0'));

    // --- the real Beat 08 bone arch, stamped exactly as the level does ---
    const m4 = new Map();
    fillBox(m4, -12, 12, 0, 0, -12, 12, 0x404040);
    stampMap(m4, buildBoneArch(0, -3, 4, 5), 0, 1, 0); // level uses +1 y offset
    const s4 = solidCells(m4);
    t.ok('bone arch uprights block', s4.has('-4,-3') && s4.has('4,-3'));
    let openWalkable = true;
    for (let x = -3; x <= 3; x++) if (s4.has(`${x},-3`)) openWalkable = false;
    t.ok('bone arch opening is walkable end to end', openWalkable,
        [...s4].filter((s) => s.endsWith(',-3')).join(' '));
}
