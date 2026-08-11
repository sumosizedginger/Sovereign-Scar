// The Light Caster actually gates something.
//
// `caster_dark` shipped as a black plane and an opacity lerp. No solid, no
// signal, and `applyBlockerToMap` skips the type — so all eight authored
// shrouds across beats 04, 06, 09, 12, the dev dungeon and two overworld
// screens were decoration. The Scar Suture behind Beat 04's `aerie` shroud was
// collected by the room-graph proximity check whether or not you owned the
// Caster: a permanent health upgrade, free, while the item text said "burns
// back the dark patches that block the way."
//
// Both directions are asserted here, because "can the player get through with
// the item" and "is the player stopped without it" are different questions and
// only asking the first is how the original shipped. The barrier is also
// checked for the two ways this class of fix goes wrong in this codebase:
// burying the reward it guards, and closing on the player who is standing in it.

import * as THREE from 'three';
import { createBlockerRuntime } from '../../src/game/world/blockers.js';
import { CollisionWorld } from '../../src/engine/collision.js';

const RECT = { x0: -3, x1: 3, z0: -3, z1: 3 };
const ORIGIN = { x: 0, y: 0, z: 0 };

function makeRuntime(collisionWorld) {
    return createBlockerRuntime(
        { scene: new THREE.Scene(), collisionWorld },
        { signals: null, destructibles: [], addVoxelQuery: () => () => {} },
        { type: 'caster_dark', id: 'test-dark', rect: RECT },
        ORIGIN
    );
}

/** A player stub at a world point holding `weapon`. */
function playerAt(x, z, weapon) {
    return {
        player: {
            root: { position: { x, y: 1, z } },
            inventory: { activeWeapon: weapon },
        },
    };
}

export function run(t) {
    // ── The dark is a real barrier ─────────────────────────────────────────
    {
        const cw = new CollisionWorld();
        const rt = makeRuntime(cw);
        t.ok('the shroud builds a runtime', !!rt && typeof rt.update === 'function');
        t.ok('and it puts real solids in the world', cw.solids.length > 0,
            `${cw.solids.length} solids`);

        // Standing on the rect's edge must be refused while it is dark.
        const onEdge = cw.blocked(RECT.x1, 0);
        t.ok('the dark stops a body at its edge', onEdge);

        // ── ...and it is a SHELL, not a plug ───────────────────────────────
        // Every authored shroud has its reward inside the rect. A solid fill
        // buries it — pickup-reachability and world-life both caught exactly
        // that, on four rewards, the first time this was written.
        t.ok('the middle of the shroud is left hollow for the reward',
            !cw.blocked(0, 0), 'a filled rect entombs the pickup it guards');

        rt.dispose();
        t.ok('disposing takes the barrier with it', cw.solids.length === 0,
            `${cw.solids.length} solids left`);
    }

    // ── The Caster opens it, and nothing else does ─────────────────────────
    {
        const cw = new CollisionWorld();
        const rt = makeRuntime(cw);
        const raised = cw.solids.length;

        // Near, but holding the wrong thing: stays shut. This is the direction
        // the original never asked about.
        rt.update(0.1, playerAt(RECT.x1 + 2, 0, 'heavy_mallet'));
        t.ok('the wrong weapon does not open the dark', cw.solids.length === raised,
            `${cw.solids.length} vs ${raised}`);

        // Right weapon but out of range: stays shut.
        rt.update(0.1, playerAt(RECT.x1 + 40, 0, 'light_caster'));
        t.ok('the Caster does not open it from across the map',
            cw.solids.length === raised, `${cw.solids.length} vs ${raised}`);

        // Right weapon, in range: opens.
        rt.update(0.1, playerAt(RECT.x1 + 2, 0, 'light_caster'));
        t.ok('the Caster burns the dark back', cw.solids.length === 0,
            `${cw.solids.length} solids remain`);
        t.ok('and the way through is now clear', !cw.blocked(RECT.x1, 0));

        rt.dispose();
    }

    // ── It must never close on the player ──────────────────────────────────
    //
    // Walk in lit, cycle off the Caster while standing inside, and a 2-high
    // wall re-raising around you is the softlock this file has already paid
    // for once with the timed gate.
    {
        const cw = new CollisionWorld();
        const rt = makeRuntime(cw);

        rt.update(0.1, playerAt(0, 0, 'light_caster'));   // open it
        t.ok('open before stepping in', cw.solids.length === 0);

        rt.update(0.1, playerAt(0, 0, 'heavy_mallet'));   // inside, unequipped
        t.ok('the dark does not re-raise around a player standing in it',
            cw.solids.length === 0, `${cw.solids.length} solids closed on the player`);

        // And once they are clear of it, it comes back.
        rt.update(0.1, playerAt(RECT.x1 + 20, 0, 'heavy_mallet'));
        t.ok('but it does return once they are out', cw.solids.length > 0,
            `${cw.solids.length} solids`);

        rt.dispose();
    }
}
