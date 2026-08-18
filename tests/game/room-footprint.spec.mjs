// tests/game/room-footprint.spec.mjs — a room outline that is not a square.
//
// 108 rooms, 108 squares: `buildPerimeterWithDoors` walked a ring derived from
// one `half`, so a square was not a choice any room made. This spec holds the
// outline system that changed that, and — more importantly — holds the 102
// rooms that did NOT change to being exactly what they were.
//
// WHAT IS HELD HERE
//   1. An unshaped room builds the IDENTICAL set of wall cells it always did.
//      This is the whole risk of the change and it is checked against the old
//      algorithm restated, not against the new one paraphrased.
//   2. Cut authoring: the corner shorthand lands where it says, and a cut that
//      overruns the room is clamped rather than accepted.
//   3. Validation refuses every way a cut can break a room — a buried door, a
//      buried spawn, a buried body, an outline in two pieces, a room cut down
//      to a corridor, and a ring severed by a BLOCKER the outline cannot see.
//   4. Every shaped room in the shipped campaign passes that validation.
//   5. Boss arenas are not shaped, because the arena clamp is the bounding box.

import fs from 'node:fs';
import * as THREE from 'three';
import { CollisionWorld } from '../../src/engine/collision.js';
import { createDungeon } from '../../src/game/world/room-graph.js';
import {
    roomCuts, roomFootprint, validateFootprint, doorApron, isShaped,
    DOOR_APRON, MIN_AREA,
} from '../../src/game/world/room-footprint.js';
import { doorCells } from '../../src/game/world/room-graph.js';
import { BEAT_LIST, BEAT_DEFS } from './_beat-defs.mjs';

/** Minimal key store, as the qa probes use — nothing found, nothing opened. */
function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

const CR = String.fromCharCode(13);
const read = (p) => fs.readFileSync(p, 'utf8').split(CR).join('');

/**
 * The wall ring as `buildPerimeterWithDoors` built it BEFORE outlines existed,
 * restated from the commit that is being replaced.
 *
 * This is a refactor guard, not a second copy of the new arithmetic: it is the
 * old specification, and the new implementation has to agree with it on every
 * room that did not ask to change.
 */
function legacyRing(room) {
    const half = room.half;
    const out = new Set();
    for (let x = -half; x <= half; x++) { out.add(`${x},${-half}`); out.add(`${x},${half}`); }
    for (let z = -half; z <= half; z++) { out.add(`${-half},${z}`); out.add(`${half},${z}`); }
    return out;
}

/** What the new builder will fill, from the footprint predicate. */
function footprintWalls(room) {
    const fp = roomFootprint(room);
    const out = new Set();
    for (let x = -fp.half; x <= fp.half; x++) {
        for (let z = -fp.half; z <= fp.half; z++) if (fp.blocks(x, z)) out.add(`${x},${z}`);
    }
    return out;
}

const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

export function run(t) {
    // ── 1. THE 102 ROOMS THAT DID NOT CHANGE ───────────────────────────────
    //
    // The single most important assertion in this file. Every room without a
    // `cut` must produce exactly the ring it produced before, or this landed a
    // shape system by quietly rebuilding the whole campaign.
    {
        let checked = 0, mismatched = [];
        for (const def of BEAT_LIST) {
            for (const [rid, room] of Object.entries(def.rooms)) {
                if (isShaped(room)) continue;
                checked++;
                if (!sameSet(footprintWalls(room), legacyRing(room))) {
                    mismatched.push(`${def.id}/${rid}`);
                }
            }
        }
        t.ok('every unshaped room builds the identical wall ring it always did',
            mismatched.length === 0 && checked > 90,
            `${checked} checked, ${mismatched.length} changed: ${mismatched.slice(0, 4).join(', ')}`);
        // …and the comparison has to be capable of noticing. A cut room must
        // NOT match its own legacy ring, or the check above is vacuous.
        const shaped = BEAT_LIST.flatMap((d) => Object.values(d.rooms)).filter(isShaped);
        t.ok('the campaign actually contains shaped rooms', shaped.length > 0,
            `${shaped.length} shaped`);
        t.ok('…and a shaped room does NOT match the legacy ring',
            shaped.every((r) => !sameSet(footprintWalls(r), legacyRing(r))));
    }

    // ── 2. CUT AUTHORING ───────────────────────────────────────────────────
    {
        // half 11 -> play 10. NE means +x, -z.
        const ne = roomCuts({ half: 11, cut: [{ corner: 'NE', w: 5, d: 4 }] })[0];
        t.ok('a NE corner cut takes the +x, -z corner',
            ne.x0 === 6 && ne.x1 === 10 && ne.z0 === -10 && ne.z1 === -7,
            JSON.stringify(ne));
        const sw = roomCuts({ half: 11, cut: [{ corner: 'SW', w: 5, d: 4 }] })[0];
        t.ok('…and SW takes the -x, +z one',
            sw.x0 === -10 && sw.x1 === -6 && sw.z0 === 7 && sw.z1 === 10,
            JSON.stringify(sw));
        t.ok('w runs along X and d along Z',
            (ne.x1 - ne.x0 + 1) === 5 && (ne.z1 - ne.z0 + 1) === 4);

        // An explicit rect survives, in either winding.
        const ex = roomCuts({ half: 9, cut: [{ x0: 5, x1: 2, z0: 1, z1: -3 }] })[0];
        t.ok('an explicit rect is normalised, whichever way round it is written',
            ex.x0 === 2 && ex.x1 === 5 && ex.z0 === -3 && ex.z1 === 1, JSON.stringify(ex));

        // Overrun is clamped, never accepted: a cut may not eat the wall ring.
        const big = roomCuts({ half: 6, cut: [{ corner: 'NE', w: 50, d: 50 }] })[0];
        t.ok('a cut that overruns the room is clamped to the playable square',
            big.x0 === -5 && big.x1 === 5 && big.z0 === -5 && big.z1 === 5,
            JSON.stringify(big));
        t.ok('…and the wall ring is never inside a cut',
            roomCuts({ half: 6, cut: [{ x0: -99, x1: 99, z0: -99, z1: 99 }] })
                .every((c) => c.x0 >= -5 && c.x1 <= 5 && c.z0 >= -5 && c.z1 <= 5));

        t.ok('no cut means not shaped', !isShaped({ half: 8 }) && !isShaped({ half: 8, cut: [] }));
    }

    // ── 3. has() AND blocks() ARE COMPLEMENTS ──────────────────────────────
    //
    // The builder fills `blocks`; everything else asks `has`. A gap between
    // them is a cell that is neither floor nor wall — a hole in the world.
    {
        const room = { half: 9, cut: [{ corner: 'NE', w: 4, d: 3 }] };
        const fp = roomFootprint(room);
        let gap = 0, overlap = 0;
        for (let x = -fp.half; x <= fp.half; x++) {
            for (let z = -fp.half; z <= fp.half; z++) {
                const h = fp.has(x, z), b = fp.blocks(x, z);
                if (!h && !b) gap++;
                if (h && b) overlap++;
            }
        }
        t.ok('every cell in the bounding box is either floor or wall, never neither',
            gap === 0, `${gap} cells are nothing`);
        t.ok('…and never both', overlap === 0, `${overlap} cells are both`);
        t.ok('the cut really removes area',
            fp.area === fp.fullArea - 12, `${fp.area} vs ${fp.fullArea} - 12`);
    }

    // ── 4. VALIDATION REFUSES THE FOUR WAYS A CUT BREAKS A ROOM ────────────
    {
        const base = {
            half: 9,
            doors: [{ to: 'a', side: 'S', at: 0 }, { to: 'b', side: 'N', at: 0 }],
            spawn: { x: 0, z: 4 },
            enemies: [{ x: 4, z: 4, kind: 'brood' }],
        };
        t.ok('a sane cut passes',
            validateFootprint({ ...base, cut: [{ corner: 'NW', w: 4, d: 4 }] }).ok);

        // A door buried.
        const buriedDoor = validateFootprint({
            ...base, cut: [{ x0: -2, x1: 2, z0: -8, z1: -5 }],
        });
        t.ok('a cut over a door apron is refused', !buriedDoor.ok,
            buriedDoor.reasons.join(' ; '));
        t.ok('…and says which door', /door N->b/.test(buriedDoor.reasons.join(' ')),
            buriedDoor.reasons.join(' ; '));

        // THE APRON'S SECOND CELL, ON ITS OWN.
        //
        // The case above is also caught by the connectivity flood, so it does
        // not prove the apron rule does anything — deleting the apron check
        // left the sweep green. This cut takes ONLY the second cell inward of
        // the N door, on the door's own two columns. The room stays in one
        // piece and every other door is fine; the doorway just becomes a slot
        // you can stand in and not turn around in. Nothing but `DOOR_APRON`
        // refuses it.
        const shallowDoor = validateFootprint({
            ...base, enemies: [], cut: [{ x0: -1, x1: 0, z0: -7, z1: -7 }],
        });
        t.ok('a doorway with only one cell of depth is refused',
            !shallowDoor.ok, shallowDoor.reasons.join(' ; '));
        t.ok('…for being shallow, not for being disconnected',
            /apron/.test(shallowDoor.reasons.join(' '))
            && !/two or more pieces/.test(shallowDoor.reasons.join(' ')),
            shallowDoor.reasons.join(' ; '));
        t.ok('…and the same room with the full apron is fine',
            validateFootprint({ ...base, enemies: [], cut: [{ x0: -1, x1: 0, z0: -6, z1: -6 }] }).ok);

        // A body buried.
        const buriedFoe = validateFootprint({
            ...base, cut: [{ x0: 3, x1: 7, z0: 3, z1: 7 }],
        });
        t.ok('a cut over an authored enemy is refused', !buriedFoe.ok);
        t.ok('…and names it', /enemy brood/.test(buriedFoe.reasons.join(' ')),
            buriedFoe.reasons.join(' ; '));

        // The spawn buried.
        const buriedSpawn = validateFootprint({
            ...base, enemies: [], cut: [{ x0: -2, x1: 2, z0: 2, z1: 6 }],
        });
        t.ok('a cut over the spawn is refused', !buriedSpawn.ok,
            buriedSpawn.reasons.join(' ; '));

        // Split in two: a full-width band across the middle.
        const split = validateFootprint({
            ...base, enemies: [], spawn: null, cut: [{ x0: -8, x1: 8, z0: -1, z1: 1 }],
        });
        t.ok('an outline in two pieces is refused', !split.ok, split.reasons.join(' ; '));
        t.ok('…and says so, rather than blaming a door',
            /two or more pieces/.test(split.reasons.join(' ')), split.reasons.join(' ; '));

        // Cut down to a corridor. The cut leaves rows z=4,5 across the full
        // width — 22 cells, just under the minimum — and deliberately spares
        // the door apron at z=5,4, so this fails on AREA and nothing else.
        const tiny = validateFootprint({
            half: 6,
            doors: [{ to: 'a', side: 'S', at: 0 }],
            cut: [{ x0: -5, x1: 5, z0: -5, z1: 3 }],
        });
        t.ok('a room cut down below the minimum area is refused', !tiny.ok,
            tiny.reasons.join(' ; '));
        t.ok(`…at ${MIN_AREA} cells`, /playable cells left/.test(tiny.reasons.join(' ')),
            tiny.reasons.join(' ; '));
    }

    // ── 5. THE BLOCKER CASE — THE ONE THAT SHIPPED ─────────────────────────
    //
    // beat 06's `goldgash` is a 9x9 secret whose floor is a ONE-CELL RING
    // around a `caster_dark` blocker. Two corner cuts severed that ring and
    // islanded the door; the validator passed it because a blocker is not part
    // of an outline, and `tests/qa/door-reach.mjs` caught it in the built world.
    {
        const gash = {
            half: 5,
            doors: [{ to: 'deepcut', side: 'E', at: -3, width: 1 }],
            blockers: [{ type: 'caster_dark', rect: { x0: -3, x1: 3, z0: -3, z1: 3 } }],
        };
        t.ok('the uncut blocker room is fine', validateFootprint({ ...gash, cut: [] }).ok);
        const severed = validateFootprint({
            ...gash, cut: [{ corner: 'SW', w: 3, d: 3 }, { corner: 'NW', w: 3, d: 2 }],
        });
        t.ok('a cut that severs a ring around a BLOCKER is refused', !severed.ok,
            severed.reasons.join(' ; '));
        // And the blocker is only rock for the WALKING question. Counting it as
        // outline would build its walls twice and shrink the reported area.
        t.ok('…but the blocker is not part of the drawn outline',
            roomFootprint(gash).area > roomFootprint(gash, { withBlockers: true }).area,
            `${roomFootprint(gash).area} vs ${roomFootprint(gash, { withBlockers: true }).area}`);
    }

    // ── 6. THE APRON ───────────────────────────────────────────────────────
    {
        const room = { half: 8, doors: [{ to: 'x', side: 'N', at: 0 }] };
        const apron = doorApron(room, room.doors[0]);
        const gap = doorCells(room, room.doors[0]);
        t.ok('the apron is inward of the door gap, not the gap itself',
            apron.every((c) => !gap.some((g) => g.x === c.x && g.z === c.z)));
        t.ok('…and is two cells deep, so a doorway can be turned around in',
            new Set(apron.map((c) => c.z)).size === DOOR_APRON,
            `${DOOR_APRON} deep, z values ${[...new Set(apron.map((c) => c.z))].join(',')}`);
        t.ok('…on the inward side', apron.every((c) => c.z > -room.half));
    }

    // ── 7. THE SHIPPED CAMPAIGN ────────────────────────────────────────────
    {
        const bad = [];
        let shaped = 0;
        for (const def of BEAT_LIST) {
            for (const [rid, room] of Object.entries(def.rooms)) {
                if (!isShaped(room)) continue;
                shaped++;
                const v = validateFootprint(room);
                if (!v.ok) bad.push(`${def.id}/${rid}: ${v.reasons.join('; ')}`);
            }
        }
        t.ok('every shaped room in the campaign is a room you can play',
            bad.length === 0, bad.slice(0, 3).join(' | '));
        t.ok('…and there are some', shaped >= 6, `${shaped} shaped rooms`);
    }

    // ── 8. BOSS ARENAS STAY SQUARE ─────────────────────────────────────────
    //
    // `api.halfSize = room.half` is the arena clamp, and it is the bounding
    // box. Cutting a boss room would leave a fourteen-metre body a legal place
    // to stand that is solid rock.
    {
        const shapedBosses = [];
        for (const def of BEAT_LIST) {
            for (const [rid, room] of Object.entries(def.rooms)) {
                if (room.boss && isShaped(room)) shapedBosses.push(`${def.id}/${rid}`);
            }
        }
        t.ok('no boss arena is shaped', shapedBosses.length === 0, shapedBosses.join(', '));
    }

    // ── 8b. TEST THE BAKE, NOT THE TABLE ───────────────────────────────────
    //
    // THE HOLE THIS CLOSES. Everything above reads the room definition, and a
    // dungeon's keys, altars, sutures and caches are not in it — they are
    // placed by `onBake` from world coordinates. So moving `quarryfloor`'s cut
    // from NW to SW, which buries its small key under nine metres of rock,
    // passed every assertion in this file. The counterfactual sweep caught
    // that, and the answer is to bake the dungeon and ask the world.
    //
    // Beat 06 only. This is the shaped dungeon; baking all fourteen to check
    // the ten that are still plain squares would cost the unit suite seconds
    // to learn nothing.
    {
        const cw = new CollisionWorld();
        const def = BEAT_DEFS['beat-06-quarry'];
        let level = null, bakeError = null;
        try {
            level = createDungeon(
                { scene: new THREE.Scene(), collisionWorld: cw, particles: null },
                { ...def, prebake: true },
                { keyStore: keyStoreStub() },
            );
        } catch (e) { bakeError = e.message; }
        t.ok('the shaped dungeon bakes', !!level, bakeError || '');

        if (level) {
            /**
             * The top of every surface in a column a body could stand on.
             *
             * ASKED PER HEIGHT, NOT AT THE FLOOR, and getting that wrong nearly
             * had this spec report a working dungeon as broken. Beat 06's Heavy
             * Mallet reads as buried if you test the ground plane: there is a
             * one-cell kit prop in its column. It is not buried — the terrace
             * lift raised it ON TOP of that prop, a one-cell step is exactly
             * what the physics body climbs, and a mallet sitting on a crate is
             * better placement than a mallet on the floor.
             *
             * Bottom-up, and matching `walkableCells`: the lowest surface with a
             * body's worth of room above it is the floor you stand on, not the
             * highest surface in the column.
             */
            const surfaces = (x, z) => {
                const out = [];
                for (let top = 1; top <= 8; top++) {
                    if (!level.getVoxelAt(x, top - 0.5, z)) continue;
                    if (level.getVoxelAt(x, top + 0.5, z)) continue;
                    if (level.getVoxelAt(x, top + 1.5, z)) continue;
                    out.push(top);
                }
                return out;
            };
            /** Is there somewhere to stand within reach of this height? */
            const reachableAt = (x, z, y) => surfaces(x, z).some((s) => Math.abs(s - y) <= 1.5);

            const buried = [];
            for (const p of level.pickups || []) {
                const pos = p.position || p.mesh?.position || p;
                if (!pos || !Number.isFinite(pos.x)) continue;
                if (!reachableAt(pos.x, pos.z, pos.y)) {
                    buried.push(`${p.label || p.id || 'pickup'} @ `
                        + `(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)})`);
                }
            }
            t.ok('every pickup the shaped dungeon places can be stood next to',
                buried.length === 0,
                `${(level.pickups || []).length} pickups, unreachable: ${buried.join(' | ')}`);
            // The check has to be capable of saying no, or it is decoration.
            t.ok('…and the reach test can fail',
                !reachableAt(1e6, 1e6, 1.2), 'a point outside the world reads unreachable');
            t.ok('…and does not just say yes to any height',
                !reachableAt((level.pickups || [])[0]?.position?.x ?? 0,
                    (level.pickups || [])[0]?.position?.z ?? 0, 40));

            const foes = [];
            for (const e of level.enemies || []) {
                const pos = e.root?.position;
                if (!pos) continue;
                if (!reachableAt(pos.x, pos.z, pos.y)) {
                    foes.push(`${e.kind || '?'} @ (${pos.x.toFixed(1)},${pos.z.toFixed(1)})`);
                }
            }
            t.ok('…and every body it spawns is standing on something',
                foes.length === 0, `${(level.enemies || []).length} enemies, in rock: ${foes.join(' | ')}`);
        }
    }

    // ── 9. THE BUILDER ACTUALLY ASKS THE FOOTPRINT ─────────────────────────
    //
    // Every assertion above is satisfiable by a module nothing calls.
    {
        const rg = read('src/game/world/room-graph.js');
        t.ok('room-graph imports the footprint',
            /import \{[^}]*roomFootprint[^}]*\} from '\.\/room-footprint\.js'/.test(rg));
        const start = rg.indexOf('export function buildPerimeterWithDoors');
        const body = rg.slice(start, rg.indexOf('\n}', start));
        t.ok('the perimeter builder asks it what is solid',
            /fp\.blocks\(x, z\)/.test(body), body.slice(-200));
        t.ok('…and no longer walks the four edges of a square',
            !/for \(let x = -half; x <= half; x\+\+\) \{ put\(x, -half\); put\(x, half\); \}/.test(body));
    }
}
