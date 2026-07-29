// tests/game/encounter-director.spec.mjs — Phase D1.
//
// THE PROBLEM
//
// There was no coordination layer. Every enemy committed the instant its own
// cooldown allowed, which produced two failure modes and nothing in between:
// three simultaneous wind-ups with no ground left to stand on (the game's
// "every attack is dodgeable" promise silently broken, in exactly the rooms
// where it matters most), or a conga line — the same 1-on-1 fight three times.
//
// WHAT IS PINNED HERE
//
// 1. THE CAP HOLDS. Concurrency never exceeds N, driven through the real
//    `Enemy.update` against a real player position, not by calling `request`
//    in a loop.
//
// 2. NO LEAK. A token held by something that died, was parried, or simply
//    finished swinging must come back. A leaked token is a SILENT difficulty
//    cliff: the room quietly drops to N-1 concurrent attackers for the rest of
//    the fight and nothing anywhere reports it.
//
// 3. NO STARVATION. The other half of the same claim, and the one a naive
//    implementation fails: with the cap in place, every enemy in the room must
//    still get to attack. A cap that permanently parks four of five enemies is
//    not pacing, it is turning the encounter off.
//
// 4. THE REFUSED DO NOT STAND STILL. They close, hold their kind's range, and
//    circle. This is the difference between "staged commit" and "disabled".
//
// 5. NULL IS PERMISSIVE. `Enemy.director` is nullable and every level that
//    predates this — plus every other spec in the suite — must behave exactly
//    as it did.
//
// 6. TRAP 5 — SWEEP EVERY PLACE. The last section walks EVERY room in the
//    campaign with three or more authored enemies, not one convenient sample.

import * as THREE from 'three';
import { Enemy, DENIED_RETRY, PRESSURE_TIME } from '../../src/game/enemy.js';
import {
    EncounterDirector, tokensForBeat, SEPARATION_SLACK,
} from '../../src/game/world/encounter-director.js';
import { BEAT_LIST } from './_beat-defs.mjs';
import { beatNumberOf } from '../../src/game/world/threat-curve.js';

/** A player-shaped object the enemies can chase and hit. */
function fakePlayer(x = 0, z = 0) {
    return {
        root: { position: { x, y: 1.4, z } },
        state: { facingVec: { x: 1, z: 0 } },
        hitRadius: 0.45,
        inventory: { hasItem: () => false },
        guard: { raised: false },
        health: {
            hp: 1e9, max: 1e9, dead: false, iFrames: 0,
            damage() { return { accepted: true }; },
        },
    };
}

function makeEnemy(scene, x, z, opts = {}) {
    return new Enemy(scene, null, { x, y: 1.0, z }, { hp: 1e6, ...opts });
}

/** Drive a whole room for `seconds`, reporting the worst concurrency seen. */
function drive(director, enemies, player, seconds, dt = 1 / 60) {
    let peak = 0;
    const committed = new Map(enemies.map((e) => [e, 0]));
    let wasWinding = new Set();
    for (let t = 0; t < seconds; t += dt) {
        director.update(dt);
        for (const e of enemies) e.update(dt, player);
        const winding = new Set(enemies.filter((e) => e._windupT > 0));
        // Count the RISING EDGE of each wind-up, so "did this enemy ever get to
        // attack" is a count of attacks and not a count of frames.
        for (const e of winding) {
            if (!wasWinding.has(e)) committed.set(e, committed.get(e) + 1);
        }
        wasWinding = winding;
        if (winding.size > peak) peak = winding.size;
    }
    return { peak, committed };
}

export function run(t) {
    // ── The budget itself ──────────────────────────────────────────────────
    {
        t.ok('beats 01-04 allow one committed attacker',
            [1, 2, 3, 4].every((n) => tokensForBeat(n) === 1));
        t.ok('beats 05-10 allow two',
            [5, 7, 10].every((n) => tokensForBeat(n) === 2));
        t.ok('beats 11-14 allow three',
            [11, 13, 14].every((n) => tokensForBeat(n) === 3));
        t.ok('the budget only ever rises across the campaign',
            Array.from({ length: 13 }, (_, i) => tokensForBeat(i + 2) >= tokensForBeat(i + 1))
                .every(Boolean),
            'difficulty that goes backwards mid-campaign is a bug, not a rest beat');
    }

    // ── The cap holds, driven through the real Enemy ────────────────────────
    {
        const scene = new THREE.Scene();
        const player = fakePlayer(0, 0);
        const enemies = [
            makeEnemy(scene, 2, 0), makeEnemy(scene, -2, 0),
            makeEnemy(scene, 0, 2), makeEnemy(scene, 0, -2),
            makeEnemy(scene, 1.5, 1.5),
        ];
        const director = new EncounterDirector(1, () => enemies);
        const { peak, committed } = drive(director, enemies, player, 20);

        t.ok('every enemy was adopted', enemies.every((e) => e.director === director),
            'adoption happens in update, so no spawn site can forget it');
        t.ok('at one token, only one enemy is ever committed', peak === 1,
            `peak concurrency ${peak}`);
        t.ok('and the room still attacks',
            [...committed.values()].reduce((a, b) => a + b, 0) > 10,
            'a cap that stops the fight is not pacing');
        t.ok('every enemy got a turn — nobody starved',
            [...committed.values()].every((n) => n > 0),
            [...committed.values()].join(', '));
    }

    // The same room at three tokens must actually use them, or the number is
    // decoration.
    {
        const scene = new THREE.Scene();
        const player = fakePlayer(0, 0);
        const enemies = [
            makeEnemy(scene, 2, 0), makeEnemy(scene, -2, 0),
            makeEnemy(scene, 0, 2), makeEnemy(scene, 0, -2),
            makeEnemy(scene, 1.5, 1.5),
        ];
        const director = new EncounterDirector(3, () => enemies);
        const { peak } = drive(director, enemies, player, 20);
        t.ok('at three tokens, three commit at once', peak === 3, `peak ${peak}`);
    }

    // ── No leak: death, parry, and ordinary completion all give it back ─────
    {
        const scene = new THREE.Scene();
        const player = fakePlayer(0, 0);
        const a = makeEnemy(scene, 1.2, 0);
        const b = makeEnemy(scene, -1.2, 0);
        const enemies = [a, b];
        const director = new EncounterDirector(1, () => enemies);

        // Get `a` committed.
        let guard = 0;
        while (!(a._windupT > 0) && guard++ < 600) {
            director.update(1 / 60);
            a.update(1 / 60, player);
        }
        t.ok('the first enemy took the token', director.concurrency === 1);
        t.ok('and the second is refused', director.canCommit(b) === false);

        // Kill it mid-swing. The token must not go with it.
        a.hp = 0;
        a.state.current = 'DEAD';
        director.update(1 / 60);
        t.ok('a token dies with its holder', director.concurrency === 0,
            'a leaked token silently drops the room to N-1 for the rest of the fight');
        t.ok('so the next enemy can commit', director.canCommit(b) === true);
    }

    {
        const scene = new THREE.Scene();
        const player = fakePlayer(0, 0);
        const a = makeEnemy(scene, 1.2, 0);
        const enemies = [a];
        const director = new EncounterDirector(1, () => enemies);
        let guard = 0;
        while (!(a._windupT > 0) && guard++ < 600) {
            director.update(1 / 60);
            a.update(1 / 60, player);
        }
        t.ok('committed before the parry', director.concurrency === 1);
        a.stagger(0.7);
        t.ok('a parry hands the token back on the same frame',
            director.concurrency === 0,
            "a parry's whole reward is that the fight moves");
    }

    // ── The two safety nets are separate, and each is worth having ──────────
    //
    // There are two ways a token comes back: the enemy releases it explicitly,
    // and `prune` reclaims it from anything that is not actually mid wind-up.
    // The first counterfactual sweep could not tell them apart — cutting either
    // one left the suite green, because the other covered it. That is good
    // engineering and a useless test, so each is now pinned by the thing only
    // it can do.
    {
        const scene = new THREE.Scene();
        const player = fakePlayer(0, 0);
        const a = makeEnemy(scene, 1.2, 0);
        const enemies = [a];
        const director = new EncounterDirector(1, () => enemies);

        // THE EXPLICIT RELEASE: the token is free on the frame the strike
        // resolves, without waiting for the next director tick. A whole frame
        // of dead air after every attack is what a fight looks like when it is
        // being scheduled rather than fought.
        let guard = 0;
        while (!(a._windupT > 0) && guard++ < 600) {
            director.update(1 / 60);
            a.update(1 / 60, player);
        }
        while (a._windupT > 0 && guard++ < 600) a.update(1 / 60, player);
        t.ok('the strike resolved', guard < 600 && a._windupT <= 0);
        t.ok('and freed its token without a director tick',
            director.concurrency === 0,
            'the enemy releases it; prune is the net, not the mechanism');

        // THE PRUNE: a token taken by something that never winds up must not
        // deadlock the room. Nothing in the shipped code does that today — this
        // guards the invariant against whatever is written next.
        const b = makeEnemy(scene, -1.2, 0);
        t.ok('a token can be taken without a wind-up', director.request(b) === true);
        t.ok('and it is held for the moment', director.concurrency === 1);
        director.prune();
        t.ok('but prune reclaims it, because nothing is winding up',
            director.concurrency === 0,
            'a token held by something that is not attacking is a room at N-1 forever');
    }

    // ── Refused, not disabled ──────────────────────────────────────────────
    {
        const scene = new THREE.Scene();
        const player = fakePlayer(0, 0);
        const holder = makeEnemy(scene, 1.0, 0);
        // Far enough that it will want to close, near enough to be in aggro.
        const waiter = makeEnemy(scene, 7, 0);
        const enemies = [holder, waiter];
        const director = new EncounterDirector(1, () => enemies);

        // Park the holder in a permanent wind-up so the waiter is always denied.
        holder._windupT = 999;
        director.request(holder);
        t.ok('the holder owns the only token', director.concurrency === 1);

        // "It moved" is NOT the claim, and the counterfactual sweep proved it:
        // deleting `_pressureMove` outright left this green, because a denial
        // only lasts PRESSURE_TIME and then ordinary chase AI walks the enemy
        // in anyway. The two behaviours have to be told apart by their SHAPE.
        //
        // Chase closes to its own attack range (~1.4) and parks there,
        // radially, with no angular travel at all. Pressure holds a longer
        // standoff and orbits. So: measure the standoff, and measure the
        // bearing swept around the player.
        const bearing = () => Math.atan2(
            waiter.rig.position.z - player.root.position.z,
            waiter.rig.position.x - player.root.position.x
        );
        let last = bearing();
        let swept = 0;
        for (let i = 0; i < 60 * 6; i++) {
            director.update(1 / 60);
            waiter.update(1 / 60, player);
            const b = bearing();
            let d = b - last;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            swept += Math.abs(d);
            last = b;
        }
        t.ok('a refused enemy was actually refused', director.denials > 0,
            `${director.denials} denials`);
        t.ok('it never commits while denied', waiter._windupT <= 0);
        const dist = Math.hypot(
            waiter.rig.position.x - player.root.position.x,
            waiter.rig.position.z - player.root.position.z
        );
        t.ok('it holds a standoff instead of parking in melee',
            dist > waiter.attackRange * 1.2,
            `standing ${dist.toFixed(2)} against an attack range of `
            + `${waiter.attackRange.toFixed(2)} — chase alone would sit at the latter`);
        t.ok('and it circles rather than closing radially', swept > 1.2,
            `swept ${swept.toFixed(2)} rad around the player in six seconds`);
        t.ok('the refusal refunds most of the cooldown',
            DENIED_RETRY < 0.5 && PRESSURE_TIME > DENIED_RETRY,
            'a denied enemy eating a full 2s cooldown makes the room go quiet');
    }

    // ── A null director grants everything ──────────────────────────────────
    {
        const scene = new THREE.Scene();
        const player = fakePlayer(0, 0);
        const enemies = [
            makeEnemy(scene, 1.2, 0), makeEnemy(scene, -1.2, 0), makeEnemy(scene, 0, 1.2),
        ];
        let peak = 0;
        for (let i = 0; i < 60 * 8; i++) {
            for (const e of enemies) e.update(1 / 60, player);
            peak = Math.max(peak, enemies.filter((e) => e._windupT > 0).length);
        }
        t.ok('with no director, everything commits at once', peak >= 2,
            `peak ${peak} — the sandbox and every older spec depend on this`);
        t.ok('and no enemy quietly acquired one',
            enemies.every((e) => e.director === null));
    }

    // ── Soft separation ────────────────────────────────────────────────────
    {
        const scene = new THREE.Scene();
        const a = makeEnemy(scene, 0, 0);
        const b = makeEnemy(scene, 0.1, 0);
        const list = [a, b];
        const director = new EncounterDirector(2, () => list);
        for (let i = 0; i < 60; i++) director.separate(list, 1 / 60);
        const gap = Math.hypot(
            a.rig.position.x - b.rig.position.x, a.rig.position.z - b.rig.position.z
        );
        const want = (a.hitRadius + b.hitRadius) * SEPARATION_SLACK;
        t.ok('two stacked bodies come apart', gap >= want - 0.02,
            `gap ${gap.toFixed(2)}, want ${want.toFixed(2)}`);

        // Exactly co-located is the degenerate case that used to make bearing
        // maths meaningless — `inFrontArc` answers "armoured" by default at
        // zero separation, so a bulwark you are standing inside cannot be
        // flanked at all.
        const c = makeEnemy(scene, 5, 5);
        const d = makeEnemy(scene, 5, 5);
        const pair = [c, d];
        for (let i = 0; i < 60; i++) director.separate(pair, 1 / 60);
        t.ok('so do two exactly co-located ones',
            Math.hypot(c.rig.position.x - d.rig.position.x,
                c.rig.position.z - d.rig.position.z) > 0.4);

        // A committed body is not shoved out from under its own telegraph.
        const w = makeEnemy(scene, -5, 0);
        const n = makeEnemy(scene, -5.05, 0);
        w._windupT = 5;
        const wx = w.rig.position.x, wz = w.rig.position.z;
        const nx = n.rig.position.x;
        for (let i = 0; i < 60; i++) director.separate([w, n], 1 / 60);
        t.ok('a winding enemy is never pushed',
            Math.abs(w.rig.position.x - wx) < 1e-6
            && Math.abs(w.rig.position.z - wz) < 1e-6,
            'its ring is a promise about a piece of ground');
        t.ok('but it still pushes', Math.abs(n.rig.position.x - nx) > 0.3);

        // Bosses are in `level.enemies` and have no `_move`. Separation must
        // not throw on them, and must not try to shove them.
        const bossish = { root: { position: { x: 9, y: 1, z: 9 } }, hitRadius: 2.5, bossId: 'x' };
        bossish.rig = bossish.root;
        const minion = makeEnemy(scene, 9.1, 9);
        let threw = false;
        try {
            // Four seconds, not one: the push is deliberately weak (1.6 m/s)
            // and a boss's want-distance is 3.6 units, so a one-second run
            // measures the speed limit rather than the rule.
            for (let i = 0; i < 240; i++) director.separate([bossish, minion], 1 / 60);
        } catch (_) { threw = true; }
        t.ok('separation survives a boss in the enemy list', !threw);
        t.ok('the boss did not move', bossish.root.position.x === 9);
        t.ok('the minion was pushed clear of it',
            Math.hypot(minion.rig.position.x - 9, minion.rig.position.z - 9) > 3,
            'standing inside a boss is where all the bearing maths breaks down');
    }

    // ── Trap 5: every crowded room in the campaign, not one sample ──────────
    //
    // The rule this sweep exists for is that a spot check lands on the
    // convenient sample. Beat 01's rooms hold two enemies and would have
    // reported the cap working without the cap ever binding.
    {
        const scene = new THREE.Scene();
        let rooms = 0;
        let worstOver = null;
        let starved = null;
        for (const def of BEAT_LIST) {
            const n = tokensForBeat(beatNumberOf(def.id));
            for (const [roomId, room] of Object.entries(def.rooms || {})) {
                const authored = room.enemies || [];
                if (authored.length < 3) continue;
                rooms++;
                const enemies = authored.map((e) => makeEnemy(scene, e.x, e.z, {
                    kind: e.kind, ai: e.ai,
                }));
                const director = new EncounterDirector(n, () => enemies);
                const { peak, committed } = drive(director, enemies, fakePlayer(0, 0), 14);
                if (peak > n && !worstOver) {
                    worstOver = `${def.id}/${roomId}: peak ${peak} > ${n}`;
                }
                if ([...committed.values()].some((c) => c === 0) && !starved) {
                    starved = `${def.id}/${roomId}: `
                        + `${[...committed.values()].filter((c) => c === 0).length} never attacked`;
                }
            }
        }
        // 13 at the time of writing. The floor is a guard against the sweep
        // silently finding nothing (a renamed field, a def that stopped
        // loading), not a claim about how much content exists.
        t.ok('the sweep found the crowded rooms', rooms >= 10, `${rooms} rooms`);
        t.ok('none of them ever exceeds its budget', worstOver === null, worstOver || '');
        t.ok('and nobody starves in any of them', starved === null, starved || '');
    }
}
