// tests/game/grapple-landing.spec.mjs — a grapple puts you down somewhere you
// can stand, and the arrival frame is not thrown away.
//
// WHAT THIS GUARDS
//
// The windworks gap in 04 Sky Monument is the campaign's grapple tutorial: a
// chasm spanning world z −70..−66 with anchor posts either side. Measured in
// the running game, firing the grapple north from the south rim with no
// movement input landed the player at z −69.5 — the middle of the hole. They
// fell, the gap's own fall-catch grabbed them, charged a heart, and set them
// down on the far rim. So the crossing "worked", by way of the safety net,
// while costing 1–2 of six hearts every attempt.
//
// Two defects stacked:
//
//  1. DOUBLE TRIM. `blockers.js` aims 1.2 short of the post so the pull is not
//     cancelled against it; `GrappleController.start` then took another 0.8 off
//     the same ray. Two applications of one correction, 2.0 metres short.
//
//  2. THE ARRIVAL FRAME WAS DISCARDED. On the last frame `update()` returns
//     `active:false` with the final landing point, and `player.js` gated on
//     `g.active || g.cancelled` — so the else branch ran and the position the
//     pull had spent 0.35s computing was dropped.
//
// The owner's report: "I should be able to grapple and land on the ledge, not
// fall into darkness if I'm not pushing forward." Holding forward had been
// covering for it — the walk carried them the last half-metre onto solid
// ground before gravity noticed.

import { GrappleController } from '../../src/game/combat/grapple.js';

/** A chasm in x, exactly like the windworks gap: nothing to stand on inside. */
const CHASM = { x0: 4, x1: 8 };
const canStand = (x) => !(x > CHASM.x0 && x < CHASM.x1);

/** Run a pull to completion; return every frame's reported result. */
function runToArrival(g) {
    const frames = [];
    for (let i = 0; i < 60; i++) {
        const res = g.update(1 / 60, null, 0.4);
        frames.push(res);
        if (!res.active) break;
    }
    return frames;
}

export function run(t) {
    const from = { x: 0, y: 1.95, z: 0 };
    const post = { x: 12, y: 1.95, z: 0 };

    // ── 1. The arrival frame announces itself ──────────────────────────────
    {
        const g = new GrappleController();
        t.ok('a pull starts', g.start(from, post, 20) === true);
        const frames = runToArrival(g);
        const last = frames[frames.length - 1];
        t.ok('the pull ends', last.active === false);
        t.ok('the final frame is flagged as an arrival', last.arrived === true,
            'without this player.js drops the landing point on the floor');
        t.ok('and it carries a landing position',
            typeof last.x === 'number' && typeof last.z === 'number',
            JSON.stringify(last));
        const mid = frames.find((f) => f.active);
        t.ok('mid-pull frames are not flagged as arrivals', !mid?.arrived);
    }

    // ── 2. A cancelled pull is still not an arrival ────────────────────────
    // These are different outcomes and player.js reads both; conflating them
    // would make a blocked grapple claim it reached its target.
    {
        const g = new GrappleController();
        g.start(from, post, 20);
        const blocked = {
            resolveMove: (cx, cz) => ({ x: cx, z: cz }), // refuses all movement
        };
        const res = g.update(1 / 60, blocked, 0.4);
        t.ok('a blocked pull cancels', res.cancelled === true);
        t.ok('and a cancelled pull is not an arrival', !res.arrived);
    }

    // ── 3. stopShort is honoured, so one trim is one trim ──────────────────
    {
        const a = new GrappleController();
        a.start(from, { x: 10, y: 1.95, z: 0 }, 20);
        t.ok('the default still stops short of the target',
            Math.abs(a.to.x - 9.2) < 0.01, `to.x=${a.to.x}`);

        const b = new GrappleController();
        b.start(from, { x: 10, y: 1.95, z: 0 }, 20, { stopShort: 0 });
        t.ok('stopShort 0 lands on the target the caller already aimed',
            Math.abs(b.to.x - 10) < 0.01, `to.x=${b.to.x}`);
    }

    // ── 4. THE REPORT: the landing must not be inside the chasm ────────────
    // The post sits past the far rim. Aiming at it with the shipped default
    // put the landing at x 11.2 — fine here — so the case that bit the owner is
    // the SHORT one: a target whose nominal landing falls inside the gap.
    {
        const g = new GrappleController();
        const target = { x: 6.5, y: 1.95, z: 0 }; // dead centre of the chasm
        g.start(from, target, 20, { stopShort: 0, canStand: (x) => canStand(x) });
        t.ok('a landing that would be over the chasm is moved off it',
            canStand(g.to.x), `landed at x=${g.to.x.toFixed(2)} inside ${CHASM.x0}..${CHASM.x1}`);
        t.ok('and it is moved ONWARD to the far rim, not back where it started',
            g.to.x >= CHASM.x1, `x=${g.to.x.toFixed(2)} — went backwards`);
    }

    // ── 5. A landing that is already fine is left exactly alone ────────────
    // The nudge must not become a second correction of its own.
    {
        const g = new GrappleController();
        const target = { x: 10, y: 1.95, z: 0 };
        g.start(from, target, 20, { stopShort: 0, canStand: (x) => canStand(x) });
        t.ok('a good landing is not moved', Math.abs(g.to.x - 10) < 0.01,
            `to.x=${g.to.x}`);
    }

    // ── 6. Nowhere to stand at all: fire anyway ────────────────────────────
    // A grapple that silently refuses is worse than one that lands badly — the
    // player cannot see why nothing happened. The ordinary fall handles it.
    {
        const g = new GrappleController();
        const ok = g.start(from, { x: 6.5, y: 1.95, z: 0 }, 20,
            { stopShort: 0, canStand: () => false });
        t.ok('a pull with no standable ground anywhere still fires', ok === true);
        t.ok('and keeps its nominal landing point',
            Math.abs(g.to.x - 6.5) < 0.01, `to.x=${g.to.x}`);
    }

    // ── 7. Without a predicate, behaviour is exactly what it always was ────
    // Every caller that has not opted in must be untouched by this.
    {
        const g = new GrappleController();
        g.start(from, { x: 6.5, y: 1.95, z: 0 }, 20);
        t.ok('no canStand means the old arithmetic, unchanged',
            Math.abs(g.to.x - 5.7) < 0.01, `to.x=${g.to.x}`);
    }
}
