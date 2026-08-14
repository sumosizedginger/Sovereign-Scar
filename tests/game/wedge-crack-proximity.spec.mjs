// tests/game/wedge-crack-proximity.spec.mjs — a blocker speaks only where it is.
//
// THE BUG THIS EXISTS TO PIN
//
// `blockers.js` wraps a `wedge_crack` in a weapon filter:
//
//     shatterAtWorld(x, y, z, r) {
//         const active = ctx.player?.inventory?.activeWeapon;
//         if (active !== 'tectonic_wedge') {
//             hud.toast('Too dense — needs the Tectonic Wedge');
//             return 0;
//         }
//         ...
//     }
//
// The weapon was checked FIRST and the message emitted on failure, with the
// strike coordinates sitting right there unused. `player.js` walks EVERY
// destructible in the level on each swing that shatters, and rooms are
// prebaked — so all of them are live all of the time.
//
// The result: one swing of the Heavy Mallet ANYWHERE in a dungeon that contains
// a crack announced "Too dense — needs the Tectonic Wedge". Not near the crack.
// Anywhere. The owner reported it in beat 08; it had been true since beat 06,
// which is simply the first beat where they held the mallet and a crack existed
// at the same time.
//
// It also would not go away, because `hud.toast` refreshes an identical
// message's dwell on every call — 1200ms of dwell against a 0.5s mallet
// cooldown pins it on screen for as long as you keep swinging.
//
// THE FIX AND WHY IT IS SHAPED LIKE THIS
//
// `DestructibleVoxelMesh.shatterAtWorld` already contained the spatial test —
// it searches a small neighbourhood and returns 0 when the blow landed nowhere
// near the body. The filter simply returned before ever reaching it. So the
// search is extracted as `nearestVoxelToWorld` and the filter asks it FIRST.
//
// The message now fires under exactly the condition that makes it true: the
// wedge, swung from right here, WOULD have broken this. One search, one answer
// — a second copy of that arithmetic in the caller could drift, and then "it
// said I need the wedge" and "the wedge would have worked here" stop being the
// same statement.
//
// BOTH DIRECTIONS. A filter that never speaks is worse than one that speaks too
// often, because the crack is then a wall with no explanation. The tests below
// pin the silence AND the message.

import fs from 'fs';
import * as THREE from 'three';
import { DestructibleVoxelMesh } from '../../src/game/world/destructible-voxel-mesh.js';
import { createBlockerRuntime } from '../../src/game/world/blockers.js';

/** A crack of the same shape `blockers.js` builds, at a known origin. */
function makeCrack(origin = { x: 0, y: 0.5, z: 0 }) {
    const map = new Map();
    for (let x = 0; x <= 2; x++) for (let y = 1; y <= 2; y++) map.set(`${x},${y},0`, 0x8a5a3a);
    return new DestructibleVoxelMesh(
        map,
        new THREE.MeshStandardMaterial({ vertexColors: true }),
        null, null, 'test:crack',
        { origin, scene: null, voxelSize: 0.5 }
    );
}

/** Enough of a level+ctx for `createBlockerRuntime` to install a wedge_crack. */
function harness(activeWeapon) {
    const toasts = [];
    const level = {
        destructibles: [],
        keyStore: { open() { this.opened = true; }, isOpen: () => false, opened: false },
        _game: { hud: { toast: (m) => toasts.push(m) } },
    };
    const ctx = {
        scene: new THREE.Scene(),
        particles: null,
        collisionWorld: null,
        player: { inventory: { activeWeapon } },
    };
    return { level, ctx, toasts };
}

export function run(t) {
    // ── 1. THE EXTRACTED SEARCH ITSELF ─────────────────────────────────────
    // Everything below rests on this one question being answerable, so pin it
    // directly rather than inferring it from a toast.
    {
        const d = makeCrack();
        t.ok('a point at the crack finds voxels',
            !!d.nearestVoxelToWorld(0.5, 1.0, 0.1), 'origin-ish');
        t.ok('a point across the room finds none',
            d.nearestVoxelToWorld(40, 1.0, 40) === null, '40 units away');
        t.ok('…and so does one merely a few metres off',
            d.nearestVoxelToWorld(6, 1.0, 0) === null,
            '6 units — the swing that was toasting from across the dungeon');
        // The gate must not be so tight that standing AT the crack misses it.
        t.ok('a blow one voxel out still counts',
            !!d.nearestVoxelToWorld(0.5 + 0.5, 1.0, 0.4), 'adjacent cell');
    }

    // ── 2. THE REPORTED CASE: wrong weapon, nowhere near ───────────────────
    {
        const { level, ctx, toasts } = harness('heavy_mallet');
        const rt = createBlockerRuntime(ctx, level, {
            id: 'tc', type: 'wedge_crack', at: { x: 0, z: 0 }, w: 2, h: 2,
        });
        t.ok('the blocker installed a destructible', level.destructibles.length === 1);
        const wrapper = level.destructibles[0];

        const n = wrapper.shatterAtWorld(40, 1.0, 40, 3);
        t.ok('a mallet swing across the dungeon breaks nothing', n === 0);
        t.ok('…and says NOTHING', toasts.length === 0,
            `toasted ${JSON.stringify(toasts)} from 40 units away`);
        rt?.dispose?.();
    }

    // ── 3. THE OTHER DIRECTION: wrong weapon, standing at it ───────────────
    // A crack that refuses in silence is a wall with no explanation. The
    // message has to survive the fix.
    {
        const { level, ctx, toasts } = harness('heavy_mallet');
        const rt = createBlockerRuntime(ctx, level, {
            id: 'tc', type: 'wedge_crack', at: { x: 0, z: 0 }, w: 2, h: 2,
        });
        const wrapper = level.destructibles[0];
        const at = wrapper._testOrigin || { x: 0, y: 1.0, z: 0 };

        let spoke = false;
        // Sweep the immediate neighbourhood: the exact world origin depends on
        // `W(b.at)`, which is the level's business, not this spec's.
        for (let dx = -1.5; dx <= 1.5 && !spoke; dx += 0.5) {
            for (let dz = -1.5; dz <= 1.5 && !spoke; dz += 0.5) {
                toasts.length = 0;
                wrapper.shatterAtWorld(at.x + dx, 1.0, at.z + dz, 3);
                if (toasts.length) spoke = true;
            }
        }
        t.ok('standing AT the crack with the wrong weapon still explains itself',
            spoke, 'the message must survive the proximity gate');
        t.ok('…and it is the message the player reported',
            !spoke || toasts.some((m) => /Tectonic Wedge/.test(m)),
            JSON.stringify(toasts));
        rt?.dispose?.();
    }

    // ── 4. AND THE RIGHT WEAPON STILL BREAKS IT ────────────────────────────
    // The proximity gate runs before the weapon check, so a gate that was too
    // aggressive would silently make the crack unbreakable — a hard softlock,
    // and strictly worse than the noise it replaced.
    {
        const { level, ctx } = harness('tectonic_wedge');
        const rt = createBlockerRuntime(ctx, level, {
            id: 'tc', type: 'wedge_crack', at: { x: 0, z: 0 }, w: 2, h: 2,
        });
        const wrapper = level.destructibles[0];
        let broke = 0;
        for (let dx = -1.5; dx <= 1.5 && !broke; dx += 0.5) {
            for (let dz = -1.5; dz <= 1.5 && !broke; dz += 0.5) {
                broke = wrapper.shatterAtWorld(dx, 1.0, dz, 3);
            }
        }
        t.ok('the wedge still shatters the crack from where a player stands',
            broke > 0, `broke ${broke} voxels`);
        t.ok('…and that opens the gate the key store guards',
            level.keyStore.opened === true);
        rt?.dispose?.();
    }

    // ── 5. THE ORDER IS THE FIX ────────────────────────────────────────────
    // Assertions 2–4 all pass if the weapon check merely moved; this reads the
    // shipped source and pins that the SPATIAL test is the one that runs first.
    // Without it, a future edit could restore the original order and everything
    // above would still be green for a crack whose voxels happen to be near.
    {
        const src = new URL('../../src/game/world/blockers.js', import.meta.url);
        const text = fs.readFileSync(src, 'utf8');
        const body = text.slice(text.indexOf('shatterAtWorld(x, y, z, r)'));
        // THE CALL, NOT THE WORD. The first version of this searched for
        // `nearestVoxelToWorld` and passed with the fix deleted, because the
        // comment ABOVE the deleted line still said the name. A spec that reads
        // source has to match the code, or it is grading the prose.
        const iNear = body.indexOf('dest.nearestVoxelToWorld(');
        const iWeapon = body.indexOf('inventory?.activeWeapon');
        t.ok('the filter asks WHERE before it asks WHAT',
            iNear >= 0 && iWeapon >= 0 && iNear < iWeapon,
            `dest.nearestVoxelToWorld( at ${iNear}, inventory?.activeWeapon at ${iWeapon}`);
    }
}
