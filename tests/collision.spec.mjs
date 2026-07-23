// tests/collision.spec.mjs
// Pure-node unit spec for src/engine/collision.js — no browser needed.

import path from 'path';
import { fileURLToPath } from 'url';
import { CollisionWorld } from '../src/engine/collision.js';
import { createSink, summarize } from './harness.mjs';

export function run(t) {
    // Empty world: every resolveMove is a pass-through.
    {
        const cw = new CollisionWorld();
        const r = cw.resolveMove(0, 0, 5, 5, 0.4);
        t.ok('empty world pass-through', r.x === 5 && r.z === 5, JSON.stringify(r));
    }

    // Wall stop: moving straight into a solid's face halts at the face.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });
        const r = cw.resolveMove(0, 0, 5, 0, 0.4);
        t.ok('wall stop clamps to face', Math.abs(r.x - 1.6) < 1e-9, JSON.stringify(r));
        t.ok('wall stop leaves z untouched', r.z === 0, JSON.stringify(r));
    }

    // Wall slide: X blocked by the wall, Z passes through freely (axis-separated).
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });
        const r = cw.resolveMove(0, 0, 5, 4, 0.4);
        t.ok('wall slide clamps x', Math.abs(r.x - 1.6) < 1e-9, JSON.stringify(r));
        t.ok('wall slide leaves z free', r.z === 4, JSON.stringify(r));
    }

    // Swept motion: a large single-frame step cannot tunnel through a thin wall.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: 5, maxX: 5.2, minZ: -5, maxZ: 5 });
        const r = cw.resolveMove(0, 0, 10, 0, 0.4);
        t.ok('swept motion cannot tunnel', r.x <= 4.6 + 1e-9, JSON.stringify(r));
    }

    // Already-straddling start: a mover whose OWN half-extent already
    // reaches past a thin wall's face (common for a 1-voxel-wide wall against
    // a 0.4 half-extent body) used to satisfy neither "clean crossing" branch
    // — px+half<=minX and px-half>=maxX were both false — so the fallback
    // overlap branch resolved nothing and let repeated small steps walk
    // straight through with zero resistance. This is what let a retreating
    // enemy (backing away from the player, toward a room wall) pass clean
    // through it.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });
        let px = 1.9, pz = 0;
        for (let i = 0; i < 40; i++) {
            const r = cw.resolveMove(px, pz, px + 0.05, pz, 0.4);
            px = r.x; pz = r.z;
        }
        t.ok('already-straddling start still stops at the face',
            Math.abs(px - 1.6) < 1e-9, 'ended at x=' + px);
    }

    // Same case, approaching from the other side.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });
        let px = 3.1, pz = 0;
        for (let i = 0; i < 40; i++) {
            const r = cw.resolveMove(px, pz, px - 0.05, pz, 0.4);
            px = r.x; pz = r.z;
        }
        t.ok('already-straddling start (from the right) still stops at the face',
            Math.abs(px - 3.4) < 1e-9, 'ended at x=' + px);
    }

    // removeSolid restores passage.
    {
        const cw = new CollisionWorld();
        const id = cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });
        cw.removeSolid(id);
        const r = cw.resolveMove(0, 0, 5, 0, 0.4);
        t.ok('removeSolid restores passage', r.x === 5, JSON.stringify(r));
    }

    // halfExtent is respected: a wider mover stops earlier.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });
        const narrow = cw.resolveMove(0, 0, 5, 0, 0.4);
        const wide = cw.resolveMove(0, 0, 5, 0, 1.0);
        t.ok('wider half-extent stops earlier', wide.x < narrow.x,
            'narrow=' + narrow.x + ' wide=' + wide.x);
    }

    // blocked() reports overlap correctly.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });
        t.ok('blocked() true inside solid', cw.blocked(2.5, 0, 0.1) === true);
        t.ok('blocked() false outside solid', cw.blocked(10, 0, 0.1) === false);
    }

    // clear() empties all solids.
    {
        const cw = new CollisionWorld();
        cw.addSolid({ minX: 2, maxX: 3, minZ: -5, maxZ: 5 });
        cw.clear();
        const r = cw.resolveMove(0, 0, 5, 0, 0.4);
        t.ok('clear() empties solids', r.x === 5, JSON.stringify(r));
    }
}

// Directly runnable: `node tests/collision.spec.mjs`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const t = createSink('collision');
    run(t);
    process.exit(summarize([t]) ? 1 : 0);
}
