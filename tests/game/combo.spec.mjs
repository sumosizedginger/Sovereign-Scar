// tests/game/combo.spec.mjs — the player gets a sentence, not a word.
//
// WHAT THIS COVERS. The player had one attack button and one swing per weapon
// while every enemy in the game had wind-ups, telegraphs, recoveries and
// committed moves (`ROAD-TO-AAA` item 8). The string is three steps — opener,
// backhand, finisher — derived from each weapon's own authored numbers rather
// than hand-written twelve times.
//
// THE ASSERTIONS WITH TEETH ARE THE GEOMETRIC ONES. A combo step changes reach
// and arc, and this repo's standing trap is a picture that disagrees with its
// hitbox: the smear is checked against the move that actually resolves, and
// `depthTolerance` is checked to be RECOMPUTED from the derived range and arc
// rather than scaled beside them. Scaling it separately is precisely how a
// drawn swing and a landed swing come apart, and it would never show up in a
// damage number.
//
// The forward carry is asserted in WORLD SPACE at four headings, never as the
// sign of a rotation — HANDOFF trap 1, which exists because a backwards swing
// once shipped green.

import * as THREE from 'three';
import { Player } from '../../src/game/player.js';
import { Input } from '../../src/game/input.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { getWeapon } from '../../src/game/combat/weapons.js';
import {
    comboMove, chains, COMBO_OPEN, COMBO_WINDOW, COMBO_STEPS, COMBO_SHAPE,
} from '../../src/game/combat/combo.js';

const fakeDom = { addEventListener() {}, removeEventListener() {} };
const MELEE = ['bare_strike', 'anchor_link', 'tectonic_wedge', 'heavy_mallet'];

/** A player driven by the real Input, on a clock the spec owns. */
function rig(weaponId, enemies) {
    const clock = { now: 100 };
    const input = new Input(fakeDom, { clock: () => clock.now });
    input.moveVector = () => ({ x: 0, z: 0 });
    input.padAim = null;
    input.guardHeld = () => false;
    const player = new Player(new THREE.Scene(), new CollisionWorld(), () => false);
    if (weaponId) {
        player.inventory.addWeapon(weaponId);
        player.inventory.setWeapon(weaponId);
    }
    const dummy = {
        root: { position: { x: 99, y: 1.4, z: 0 } },
        state: { current: 'IDLE', facingVec: { x: -1, z: 0 } },
        hitRadius: 0.4, hp: 9999,
    };
    const steps = [];
    // The step of the swing currently resolving. `steps` is only appended AFTER
    // `tryAttack` returns, and a defender's `onHit` fires inside it — so a probe
    // reading the tail of `steps` from `onHit` reads the PREVIOUS swing and
    // attributes every finisher hit to the backhand before it.
    const live = { step: null };
    const real = player.tryAttack.bind(player);
    player.tryAttack = (...a) => {
        // Recorded BEFORE the call, because `tryAttack` advances the counter.
        const s = player.comboReady() ? player.comboStep : 0;
        live.step = s;
        const before = player.attackCd;
        const r = real(...a);
        // A swing is the thing that sets a fresh cooldown — counting calls
        // would count presses the gate refused. `input-buffer.spec.mjs` learned
        // that the expensive way: its first draft passed with the fix reverted.
        if (player.attackCd > before) steps.push(s);
        return r;
    };
    const list = enemies || [dummy];
    const tick = (dt = 1 / 60) => {
        clock.now += dt;
        player.update(dt, input, list, [], {});
    };
    // A TAP, not a held key. `_onKeyDown` alone leaves the code in `input.keys`
    // forever, so `attackHeld()` stays true, the charge arms, and committed
    // charged moves fire with smears of their own — which is not a string and
    // would be counted as one.
    const press = () => {
        input._onKeyDown({ code: 'Space', preventDefault() {} });
        input._onKeyUp({ code: 'Space', preventDefault() {} });
    };
    return { player, input, tick, press, steps, live, clock };
}

export function run(t) {
    // ── 1. The derivation, on every melee weapon in the game ───────────────
    t.ok('a string is three steps', COMBO_STEPS === 3 && COMBO_SHAPE.length === 3);
    for (const id of MELEE) {
        const w = getWeapon(id);
        t.ok(`${id}: the opener is the weapon, untouched`, comboMove(w, 0) === w,
            'the first press of a weapon must still feel like that weapon');

        const back = comboMove(w, 1);
        const fin = comboMove(w, 2);
        // The weapon table is module-level shared state. A step that wrote its
        // multiplier back would make the second swing of the game permanently
        // wider than the first, for the rest of the run.
        t.ok(`${id}: deriving a step does not mutate the weapon`,
            w.range === getWeapon(id).range && w.arcRad === getWeapon(id).arcRad
            && comboMove(w, 2).range === fin.range,
            `range ${w.range}, arc ${w.arcRad}`);

        // ONE NUMBER FOR THE PICTURE AND THE RULE. `depthTolerance` is not
        // independent — it is range*sin(arc/2) — and scaling it beside them is
        // how a fan and a hitbox come apart.
        for (const [name, m] of [['backhand', back], ['finisher', fin]]) {
            const want = m.range * Math.sin(m.arcRad / 2);
            t.ok(`${id}: the ${name}'s lane matches its own reach and arc`,
                Math.abs(m.depthTolerance - want) < 1e-9,
                `${m.depthTolerance.toFixed(4)} vs ${want.toFixed(4)}`);
        }
        t.ok(`${id}: the backhand is wider than the opener`, back.arcRad > w.arcRad,
            `${(back.arcRad * 180 / Math.PI).toFixed(0)} deg vs `
            + `${(w.arcRad * 180 / Math.PI).toFixed(0)} deg`);
        t.ok(`${id}: and it sweeps the other way`, back.sweep === -1);
        t.ok(`${id}: the finisher reaches further and hits harder`,
            fin.range > w.range && fin.damage > w.damage,
            `range ${fin.range.toFixed(2)}, damage ${fin.damage}`);
        t.ok(`${id}: and it costs recovery for it`, fin.cooldown > w.cooldown,
            `${fin.cooldown.toFixed(2)} vs ${w.cooldown}`);
        t.ok(`${id}: and only the finisher carries the player`,
            !w.push && !back.push && fin.push > 0, `${fin.push}`);
    }

    // ── 2. The window, at both edges ───────────────────────────────────────
    t.ok('a press inside the window chains', chains((COMBO_OPEN + COMBO_WINDOW) / 2));
    t.ok('a press before the swing has resolved does not',
        chains(COMBO_OPEN - 0.01) === false,
        'mashing through a strike that has not happened yet');
    t.ok('nor does one after the string has lapsed',
        chains(COMBO_WINDOW + 0.01) === false);
    // The window has to outlast the input buffer, or a press the buffer is
    // holding would arrive after the string it was meant to continue had shut.
    t.ok('the window outlasts the input buffer', COMBO_WINDOW > 0.15,
        `${COMBO_WINDOW}`);

    // ── 3. The shipped loop: mashing walks the string ──────────────────────
    {
        const r = rig('anchor_link');
        for (let i = 0; i < 120; i++) {
            if (i % 6 === 0) r.press();
            r.tick();
        }
        const seen = r.steps.join('');
        t.ok('mashing walks opener, backhand, finisher, and starts again',
            /^(012)+$/.test(seen) && r.steps.length >= 6, `steps: ${seen}`);
    }

    // ── 4. …and a deliberate rhythm never chains ───────────────────────────
    {
        const r = rig('anchor_link');
        for (let i = 0; i < 300; i++) {
            if (i % 60 === 0) r.press();
            r.tick();
        }
        t.ok('a press per second is five openers, not a string',
            r.steps.length === 5 && r.steps.every((s) => s === 0),
            `steps: ${r.steps.join('')}`);
    }

    // ── 5. The gate yields to a live string and to nothing else ────────────
    {
        // The Heavy Mallet, deliberately: its 0.5s cooldown covers the whole
        // combo window, so every chained press needs the relaxation. On the
        // Anchor Link (0.28s) the cooldown has already expired by the middle of
        // the window and the test would pass without the gate change at all.
        const r = rig('heavy_mallet');
        r.press();
        r.tick();
        t.ok('the opener leaves a cooldown', r.player.attackCd > 0,
            `${r.player.attackCd.toFixed(3)}`);
        // Step into the middle of the window: still inside the cooldown, but
        // the string is live, so the press must be honoured.
        // BOUNDED. An unbounded wait on a clock is a spec that HANGS instead of
        // failing when the clock stops, and a hang is worse than a red: the
        // counterfactual that removes the clock line left this file spinning
        // forever, which meant the harness never reached its restore and the
        // deliberate break stayed in the source. A spec's failure mode is part
        // of the spec.
        let guard = 0;
        while (r.player._sinceSwing < (COMBO_OPEN + COMBO_WINDOW) / 2 && guard++ < 600) {
            r.tick();
        }
        t.ok('the string clock advances at all', guard < 600,
            `_sinceSwing stuck at ${r.player._sinceSwing}`);
        t.ok('which a live string is allowed through',
            r.player.attackCd > 0 && r.player.comboReady(),
            `cd ${r.player.attackCd.toFixed(3)}, ready ${r.player.comboReady()}`);
        const n = r.steps.length;
        r.press();
        r.tick();
        t.ok('and the chained press swings', r.steps.length === n + 1
            && r.steps[r.steps.length - 1] === 1, `steps: ${r.steps.join('')}`);
    }
    {
        // The same press with the string dead must still be refused, or the
        // relaxation above has simply deleted the cooldown.
        const r = rig('heavy_mallet');
        r.press();
        r.tick();
        r.player.comboStep = 0;            // string over; cooldown still running
        const n = r.steps.length;
        r.press();
        r.tick();
        t.ok('a press inside the cooldown with no string is still refused',
            r.steps.length === n, `${r.steps.length - n} extra swings`);
    }

    // ── 6. The finisher carries the player, in WORLD space ─────────────────
    //
    // Measured along the heading the player is actually facing, at four of
    // them. Trap 1: never assert a direction as the sign of a rotation.
    for (const [name, fv] of [
        ['east', { x: 1, z: 0 }], ['north', { x: 0, z: -1 }],
        ['west', { x: -1, z: 0 }], ['diagonal', { x: 0.707, z: 0.707 }],
    ]) {
        const r = rig('anchor_link');
        let moved = null;
        for (let i = 0; i < 120 && !moved; i++) {
            r.player.state.facingVec = { x: fv.x, z: fv.z };
            // The position going INTO this tick, so the finisher's own impulse
            // is the only thing inside the measurement.
            const before = { x: r.player.rig.position.x, z: r.player.rig.position.z };
            const had = r.steps.length;
            if (i % 6 === 0) r.press();
            r.tick();
            if (r.steps.length > had && r.steps[r.steps.length - 1] === 2) {
                // Let the impulse resolve through the physics body, holding the
                // heading so nothing else can be what moved us.
                for (let k = 0; k < 10; k++) {
                    r.player.state.facingVec = { x: fv.x, z: fv.z };
                    r.tick();
                }
                moved = {
                    x: r.player.rig.position.x - before.x,
                    z: r.player.rig.position.z - before.z,
                };
            }
        }
        const along = moved ? moved.x * fv.x + moved.z * fv.z : 0;
        const across = moved ? Math.abs(-moved.x * fv.z + moved.z * fv.x) : 0;
        t.ok(`the finisher carries the player forward (${name})`, along > 0.2,
            moved ? `${along.toFixed(2)} along facing, ${across.toFixed(2)} across`
                : 'no finisher reached');
        t.ok(`and forward means the way it is FACING (${name})`, along > across * 2,
            moved ? `along ${along.toFixed(2)} vs across ${across.toFixed(2)}`
                : 'no finisher reached');
    }

    // ── 6b. …and the RULE follows the step, not just the picture ──────────
    //
    // The smear check below covers the drawing. This covers the hit, and it is
    // the one that matters most: a counterfactual that resolved every step
    // against the base weapon while drawing the step's own fan left this file
    // entirely green — the exact "drawn one size, resolved another" defect that
    // cost five bosses in the boss pass, reproduced on the player.
    {
        const w = getWeapon('anchor_link');
        const taken = [];
        let r = null;
        // Parked where ONLY the finisher can arrive: past the opener's 1.8
        // reach, inside the finisher's 2.34.
        const far = { x: 2.1, y: 0, z: 0 };
        const target = {
            root: { position: far },
            state: { current: 'IDLE', facingVec: { x: -1, z: 0 } },
            hitRadius: 0, hp: 9999,
            onHit(dmg) { taken.push({ step: r.live.step, dmg }); },
        };
        r = rig('anchor_link', [target]);
        t.ok('the probe target is out of the opener and inside the finisher',
            far.x > w.range && far.x < comboMove(w, 2).range,
            `${far.x} against ${w.range} and ${comboMove(w, 2).range.toFixed(2)}`);
        for (let i = 0; i < 120; i++) {
            r.player.state.facingVec = { x: 1, z: 0 };
            far.y = r.player.rig.position.y;
            far.x = r.player.rig.position.x + 2.1;
            far.z = r.player.rig.position.z;
            if (i % 6 === 0) r.press();
            r.tick();
        }
        const steps = [...new Set(taken.map((h) => h.step))].sort();
        t.ok('only the finisher reaches that far',
            taken.length > 0 && steps.length === 1 && steps[0] === 2,
            `hits landed by steps ${steps.join(',') || 'none'} (${taken.length} hits)`);
        t.ok('and it lands the finisher damage, not the weapon damage',
            taken.length > 0 && taken.every((h) => Math.abs(h.dmg - comboMove(w, 2).damage) < 1e-9),
            `${taken.map((h) => h.dmg).join(', ')} against ${comboMove(w, 2).damage}`);
    }

    // ── 7. The picture is the move that resolves ───────────────────────────
    {
        const r = rig('heavy_mallet');
        const drawn = [];
        const realSpawn = r.player.arcSmear.spawn.bind(r.player.arcSmear);
        r.player.arcSmear.spawn = (o) => { drawn.push(o); return realSpawn(o); };
        for (let i = 0; i < 90; i++) {
            if (i % 8 === 0) r.press();
            r.tick();
        }
        const w = getWeapon('heavy_mallet');
        let mismatched = 0;
        for (let i = 0; i < Math.min(drawn.length, r.steps.length); i++) {
            const m = comboMove(w, r.steps[i]);
            if (Math.abs(drawn[i].radius - m.range) > 1e-9) mismatched++;
            if (Math.abs(drawn[i].arc - m.arcRad) > 1e-9) mismatched++;
        }
        t.ok('every smear is drawn at the reach and arc its step resolves',
            drawn.length > 0 && mismatched === 0,
            `${drawn.length} smears, ${mismatched} disagreeing with their move`);
        const spins = drawn.map((d) => Math.sign(d.spin || 0));
        t.ok('and the return stroke is drawn sweeping back',
            spins.some((v) => v > 0) && spins.some((v) => v < 0),
            `sweeps: ${spins.join(',')}`);
    }

    // ── 8. A ray is not a melee string ─────────────────────────────────────
    {
        const caster = getWeapon('light_caster');
        t.ok('a ray weapon has no arc to derive a string from', !caster.arcRad);
        t.ok('so every step of it is the weapon itself',
            comboMove(caster, 1) === caster && comboMove(caster, 2) === caster);
    }
}
