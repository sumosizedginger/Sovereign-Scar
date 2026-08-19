// tests/game/committed-attacks.spec.mjs — can each enemy actually hurt you?
//
// THE REPORT, from play: *"Should charging enemies hit me when they reach the
// circle? Because they currently don't."* They could not. Nor could a lancer,
// with either of its two attacks.
//
// WHAT WAS WRONG, and it was the same mistake three times over. A committed
// dash sets `attackCd` when its WIND-UP starts:
//
//     this.attackCd = (2.2 / this.actionFrequency) + this.windup;
//     this._beginWindup(() => { this._chargeT = 0.55; ... });
//
// and the impact, half a second later, then asked `if (this.attackCd <= 0)`.
// It never is. Driven headlessly: 34 frames of charging with `attackCd` sitting
// at 2.13 throughout, **0 impacts**. Every hit a bulwark ever landed came from
// its ordinary melee, which is exactly what the owner described — it charges,
// it arrives, nothing happens.
//
// A committed attack has already paid for itself with a telegraph. It must not
// ask the shared cooldown for permission a second time.
//
// AND UNDERNEATH THAT, GEOMETRY. Fixing the gate revealed that a bulwark's
// 0.55 s charge closes 3.81 units while triggering at any range past 3.5 — from
// 6 away it stopped 2.19 out against an impact radius of 1.6. A lancer's lunge
// had the mirror problem: its standoff band is 3..9 and a fixed 0.42 s thrust
// covers 5.03, so clamping its trigger to what it could reach made it never
// lunge at all. The charge got a derived TRIGGER; the lunge got a derived
// DURATION. Both are in `enemy.js` with the reasoning.
//
// THIS SPEC DRIVES THE REAL `Enemy`. `enemy.js` has no DOM dependency, so the
// class can be constructed and updated headlessly against a stand-in player —
// which is the only honest way to ask "does this attack connect". A source
// assertion would have been satisfied by every version of the broken code.

import * as THREE from 'three';
import fs from 'node:fs';
import { CollisionWorld } from '../../src/engine/collision.js';
import {
    Enemy, CHARGE_IMPACT_R, LUNGE_IMPACT_R, CHARGE_TIME, CHARGE_SPEED_MULT,
    LUNGE_SPEED_MULT, LUNGE_TIME_MIN, LUNGE_TIME_MAX,
    RANGED_BAND_FAR, SUPPORT_RING_INNER, dashReach,
} from '../../src/game/enemy.js';

/** Newline, built rather than typed — see the CRLF note on `fsRead`. */
const NL = String.fromCharCode(10);

/** A stand-in player that records what hit it and how hard. */
function stubPlayer() {
    const hits = [];
    const root = new THREE.Object3D();
    root.position.set(0, 1, 0);
    return {
        root, rig: root, hits,
        guard: { raised: false }, iframes: 0,
        state: { facingVec: { x: 0, z: -1 } },
        inventory: { has: () => false, hasItem: () => false },
        lockOn: { target: null },
        health: {
            hp: 9999, max: 9999, dead: false,
            damage(a) { hits.push(a); return { accepted: true, amount: a }; },
        },
        physics: { grounded: true, resetVelocity() {}, velocity: { x: 0, y: 0, z: 0 } },
    };
}

/** Drive one enemy against a stationary player for `secs` and report. */
function drive(kind, ai, startDist, secs = 30) {
    const cw = new CollisionWorld();
    const e = new Enemy(new THREE.Scene(), cw, { x: 0, y: 1, z: -startDist }, { kind, ai });
    e.getVoxelAt = () => false;              // open ground: no walls to hide behind
    const p = stubPlayer();
    const dt = 1 / 60;
    let chargeFrames = 0, lungeFrames = 0;
    for (let i = 0; i < 60 * secs; i++) {
        e.update(dt, p, [e], null);
        if (e._chargeT > 0) chargeFrames++;
        if (e._lungeT > 0) lungeFrames++;
    }
    const byAmount = new Map();
    for (const a of p.hits) byAmount.set(a, (byAmount.get(a) || 0) + 1);
    return { e, p, hits: p.hits.length, byAmount, chargeFrames, lungeFrames };
}

export function run(t) {
    // ── 1. EVERY DAMAGING KIND CAN DAMAGE ──────────────────────────────────
    //
    // The whole suite had asked, fourteen times, whether the player could kill
    // each boss. It had never once asked whether an ordinary enemy could kill
    // the player.
    {
        const cases = [
            ['chase', 'sentinel', 6],
            ['charge', 'bulwark', 6],
            ['ranged', 'lancer', 8],
            ['lunge', 'lancer', 8],
            ['drift', 'scarab', 6],
        ];
        for (const [ai, kind, d] of cases) {
            const r = drive(kind, ai, d);
            t.ok(`a ${kind} on '${ai}' can hurt the player`, r.hits > 0,
                `${r.hits} damage events in 30s from ${d} units`);
        }
    }

    // ── 2. THE COMMITTED ATTACKS SPECIFICALLY ──────────────────────────────
    //
    // Not just "it did damage" — a bulwark has an ordinary melee as well, and
    // for the life of the bug every hit it landed came from that. The dash
    // deals `damage + 0.5`; the melee deals `damage`. Counting by AMOUNT is
    // what distinguishes them, and asking the weaker question is how this
    // shipped.
    {
        const r = drive('bulwark', 'charge', 6, 40);
        const charged = r.byAmount.get(r.e.damage + 0.5) || 0;
        const melee = r.byAmount.get(r.e.damage) || 0;
        t.ok('a charge actually connects', charged > 0,
            `${charged} charge impacts, ${melee} ordinary melee, `
            + `${r.chargeFrames} frames spent charging`);
        t.ok('…and it spent time charging, so that was not luck',
            r.chargeFrames > 10, `${r.chargeFrames} frames`);
    }
    {
        const r = drive('lancer', 'lunge', 8, 40);
        const lunged = r.byAmount.get(r.e.damage + 1) || 0;
        t.ok('a lunge actually connects', lunged > 0,
            `${lunged} lunge impacts, ${r.lungeFrames} frames spent lunging`);
        t.ok('…and it spent time lunging', r.lungeFrames > 10, `${r.lungeFrames} frames`);
    }

    // ── 3. A DASH LANDS ONCE, NOT EVERY FRAME ──────────────────────────────
    //
    // The cooldown was doing one useful job — stopping the impact firing on
    // every frame of contact — and replacing it had to keep that.
    //
    // WHAT ACTUALLY KEEPS IT is ending the dash on impact (`_chargeT = 0`), not
    // the `_chargeHit` latch. The counterfactual sweep proved that: deleting the
    // latch changes nothing, because the block cannot run again once the dash is
    // over. The latch stays as a statement of intent and as cover for a future
    // edit that stops ending the dash — but it is NOT what this holds, and
    // asserting over it would have been a spec written across dead code.
    {
        const r = drive('bulwark', 'charge', 6, 40);
        const charged = r.byAmount.get(r.e.damage + 0.5) || 0;
        t.ok('a charge does not machine-gun the player',
            charged < r.chargeFrames / 4,
            `${charged} impacts across ${r.chargeFrames} charging frames`);
        const src0 = fsRead('src/game/enemy.js');
        t.ok('…because the impact ENDS the dash', /this\._chargeT = 0;/.test(src0));
        t.ok('…and the lunge likewise', /this\._lungeT = 0;/.test(src0));
    }

    // ── 3b. A LUNGE CONNECTS FROM ANYWHERE IN ITS STANDOFF BAND ────────────
    //
    // The assertion that distinguishes a derived travel time from a fixed one.
    // A lancer holds station between 3 and 9 units; a fixed 0.42 s thrust covers
    // 5.03 at its speed, so from the far half of its own band it committed,
    // travelled, and stopped short. Held at each distance so the result is about
    // the thrust rather than about how far it happened to drift first.
    {
        for (const d of [4, 6, 8, 9]) {
            const cw = new CollisionWorld();
            const e = new Enemy(new THREE.Scene(), cw, { x: 0, y: 1, z: -d },
                { kind: 'lancer', ai: 'lunge' });
            e.getVoxelAt = () => false;
            const p = stubPlayer();
            for (let i = 0; i < 60 * 25; i++) {
                e.update(1 / 60, p, [e], null);
                if (e._lungeT <= 0) e.rig.position.set(0, e.rig.position.y, -d);
            }
            const lunged = p.hits.filter((a) => a === e.damage + 1).length;
            t.ok(`a lunge from ${d} units connects`, lunged > 0,
                `${lunged} lunge impacts in 25s held at ${d}`);
        }
    }

    // ── 4. THE DASH REACHES WHAT IT TRIGGERS AT ────────────────────────────
    //
    // The arithmetic that made the charge miss by 0.59 even once it was allowed
    // to hit. Asserted as a relationship, not as the numbers it happens to
    // produce today, so a change to a body's speed cannot quietly reintroduce
    // it.
    {
        for (const kind of ['bulwark', 'sentinel', 'scarab']) {
            const e = new Enemy(new THREE.Scene(), new CollisionWorld(),
                { x: 0, y: 1, z: 0 }, { kind, ai: 'charge' });
            const reach = dashReach(e.speed, CHARGE_SPEED_MULT, CHARGE_TIME, CHARGE_IMPACT_R);
            t.ok(`a ${kind} charge can cross the gap it triggers at`,
                reach > 3.5 + CHARGE_IMPACT_R * 0.5,
                `reach ${reach.toFixed(2)} vs trigger floor 3.5`);
        }
        t.ok('a slower body gets a shorter reach, not the same one',
            dashReach(1, CHARGE_SPEED_MULT, CHARGE_TIME, CHARGE_IMPACT_R)
            < dashReach(4, CHARGE_SPEED_MULT, CHARGE_TIME, CHARGE_IMPACT_R));
        // The lunge is bounded rather than triggered — see `_aiLunge`.
        t.ok('the lunge travel time is bounded at both ends',
            LUNGE_TIME_MIN > 0 && LUNGE_TIME_MIN < LUNGE_TIME_MAX && LUNGE_TIME_MAX < 2,
            `${LUNGE_TIME_MIN}..${LUNGE_TIME_MAX}`);
        t.ok('…and long enough to cross a lancer standoff of 9',
            9 <= 2.6 * LUNGE_SPEED_MULT * LUNGE_TIME_MAX + LUNGE_IMPACT_R,
            `${(2.6 * LUNGE_SPEED_MULT * LUNGE_TIME_MAX + LUNGE_IMPACT_R).toFixed(1)} at speed 2.6`);
    }

    // ── 5. A SHOOTER HAS NO BAND WHERE IT DOES NOTHING ─────────────────────
    //
    // It used to back off below 4 and advance above 8, and fire below
    // `attackRange` = 7. A lancer sitting anywhere in 7..8 was not far enough
    // to advance and not near enough to shoot: measured, 30 seconds at 8.00
    // and **0 projectiles**.
    {
        const e = new Enemy(new THREE.Scene(), new CollisionWorld(),
            { x: 0, y: 1, z: 0 }, { kind: 'lancer', ai: 'ranged' });
        const want = e._pressureRange();
        t.ok('a shooter holds station inside its own firing range',
            want + RANGED_BAND_FAR < e.attackRange,
            `holds out to ${(want + RANGED_BAND_FAR).toFixed(2)}, fires below ${e.attackRange}`);

        const r = drive('lancer', 'ranged', 8, 30);
        t.ok('…so one parked outside that range closes and fires',
            r.hits > 0, `${r.hits} hits from a standing start at 8 units`);
        const finalD = Math.hypot(r.p.root.position.x - r.e.rig.position.x,
            r.p.root.position.z - r.e.rig.position.z);
        t.ok('…and ends up somewhere it can shoot from',
            finalD < r.e.attackRange, `settled at ${finalD.toFixed(2)}`);
    }

    // ── 6. THE SUPPORT KINDS DO NOT DAMAGE — AND MUST NOT LOOK LIKE THEY DO ─
    //
    // The other half of the report: *"the enemy that puts a big yellow circle
    // on the ground apparently doesn't hurt me either."* Correct, and by
    // design — a Censer heals and shields its neighbours, a Weaver's strand
    // slows. Neither is a bug. Both were drawn as a filled disc in the same
    // visual language as an attack, under a coach line that promises "that ring
    // is where the blow will land", so the game taught its central rule with a
    // counterexample.
    {
        for (const [kind, ai] of [['censer', 'censer'], ['weaver', 'weave']]) {
            const r = drive(kind, ai, 8, 30);
            t.ok(`a ${kind} still does no damage — that is the design`,
                r.hits === 0, `${r.hits} damage events`);
        }
        t.ok('a support ring is hollow, so it never paints ground as unsafe',
            SUPPORT_RING_INNER > 0.5 && SUPPORT_RING_INNER < 1,
            `${SUPPORT_RING_INNER}`);
        // …and the two kinds that never damage actually ask for that treatment.
        const es = fsRead('src/game/enemy.js');
        for (const [what, marker] of [
            ['censer pulse', 'this._cense()'],
            ['weaver strand', 'this._spawnWeb(dir.x, dir.z)'],
        ]) {
            const i = es.indexOf(marker);
            const block = i > 0 ? es.slice(i, i + 420) : '';
            t.ok(`the ${what} is marked as support`,
                /support: true/.test(block),
                block.replace(/\s+/g, ' ').slice(0, 100));
        }
        // And the coach line that promises a blow must be gated on that flag,
        // or the game still teaches its central rule with a counterexample.
        t.ok('the telegraph rule is not spoken over a support pulse',
            /if \(!support\) \{[\s\S]{0,400}coach\('telegraph-ring'/.test(es));
    }

    // ── 7. THE RING IS THE SIZE OF THE HIT ─────────────────────────────────
    //
    // Five attacks in this project have shipped drawn one size and resolving at
    // another. Both dashes now take their telegraph radius from the same
    // constant the impact uses; this asserts the constants are the ones the
    // source actually passes.
    {
        const src = fsRead('src/game/enemy.js');
        t.ok('the charge telegraph is drawn at its impact radius',
            /radius: CHARGE_IMPACT_R/.test(src));
        t.ok('the lunge telegraph is drawn at its impact radius',
            (src.match(/radius: LUNGE_IMPACT_R/g) || []).length >= 2,
            `${(src.match(/radius: LUNGE_IMPACT_R/g) || []).length} sites`);
        // SCOPED TO THE IMPACT BLOCK. The first version of this searched the
        // whole of `_aiCharge` and went red on the correct code, because the
        // TRIGGER is still gated on the cooldown and should be — the bug was
        // only ever that the IMPACT was too.
        const blockAfter = (marker) => {
            const i = src.indexOf(marker);
            if (i < 0) return null;
            const end = src.indexOf(`${NL}            return;`, i);
            return end > i ? src.slice(i, end) : null;
        };
        for (const [what, marker] of [
            ['charge', 'if (this._chargeT > 0) {'],
            ['lunge', 'if (this._lungeT > 0) {'],
        ]) {
            const block = blockAfter(marker);
            t.ok(`the ${what} impact block was found`, !!block);
            if (!block) continue;
            // COMMENTS STRIPPED FIRST. The block carries a long note quoting
            // the very expression the bug used, so testing the raw text found
            // the explanation and reported the fix as unfixed.
            const code = block.split(NL)
                .filter((l) => !l.trim().startsWith('//'))
                .join(NL);
            t.ok(`…and it does not ask the cooldown for permission`,
                !/attackCd <= 0/.test(code),
                code.replace(/\s+/g, ' ').slice(0, 110));
            t.ok(`…it latches instead`,
                new RegExp(`_${what}Hit`).test(block));
        }
        t.ok('both dashes latch so they land once',
            /_chargeHit/.test(src) && /_lungeHit/.test(src));
    }
}

/** Read source without CRLF, so line-anchored patterns behave. */
function fsRead(p) {
    return fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
}
