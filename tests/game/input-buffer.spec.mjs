// tests/game/input-buffer.spec.mjs — a press the game was not ready for is
// still a press.
//
// THE BUG THIS EXISTS TO PIN
//
// `consumeAttack()` returned a boolean and cleared it unconditionally:
//
//     consumeAttack() {
//         const v = this._attackPressed;
//         this._attackPressed = false;   // gone, whether or not anyone used it
//         return v;
//     }
//
// and `Player.update` read it before knowing whether it could act:
//
//     const attackPressed = input.consumeAttack();
//     if (!this.guard.broken) {
//         if (attackPressed) this.tryAttack(...);   // tryAttack returns early
//     }                                            // if attackCd > 0
//
// So every press landing inside a weapon's cooldown — 0.28s on the Anchor
// Link, 0.50s on the Heavy Mallet — was read, found the gate shut, and binned.
// At a natural attack rhythm that is roughly one input in three, and it does
// not read as a mistimed press. It reads as the game ignoring you.
//
// WHAT IS TESTED, AND WHY IT IS THE REAL THING
//
// This drives the SHIPPED `Input` and the SHIPPED `Player.update`, with an
// injected clock so the window can be stepped deterministically instead of
// slept through. Trap 10 in HANDOFF.md is the standing reason: an earlier spec
// in this project reproduced the logic it was guarding and stayed green after
// the real fix was reverted. Revert either half of this fix — the window in
// `input.js` or the gate ordering in `player.js` — and assertions here fail.

import * as THREE from 'three';
import { Input, INPUT_BUFFER } from '../../src/game/input.js';
import { Player } from '../../src/game/player.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BREAK_STUN } from '../../src/game/combat/guard.js';

const fakeDom = { addEventListener() {}, removeEventListener() {} };

/** A clock the spec owns outright. */
function makeClock() {
    let t = 100; // not zero — a sentinel of -Infinity must not read as "now"
    return { now: () => t, advance: (dt) => { t += dt; } };
}

/** Press attack by the same path a real keypress takes. */
function pressAttack(input, clock) {
    input._onKeyDown({ code: 'Space', preventDefault() {} });
    return clock;
}

function pressDash(input) {
    input._onKeyDown({ code: 'KeyK', preventDefault() {} });
}

/** The surface `Player.update` reads off input, over a real Input instance. */
function inputWith(input) {
    input.moveVector = () => ({ x: 0, z: 0 });
    input.padAim = null;
    input.guardHeld = () => false;
    return input;
}

export function run(t) {
    // ── The window itself ──────────────────────────────────────────────────
    {
        const clock = makeClock();
        const input = new Input(fakeDom, { clock: clock.now });

        t.ok('a fresh Input has no press on record',
            input.consumeAttack(INPUT_BUFFER) === false,
            'the -Infinity sentinel must not satisfy any window');
        t.ok('nor an unbounded one', input.consumeAttack() === false,
            'Infinity - (-Infinity) is Infinity; a naive <= would return true here');

        pressAttack(input, clock);
        clock.advance(0.10);
        t.ok('a press inside the window still counts',
            input.consumeAttack(INPUT_BUFFER) === true, '0.10s < 0.15s');

        pressAttack(input, clock);
        clock.advance(0.30);
        t.ok('a press older than the window does not',
            input.consumeAttack(INPUT_BUFFER) === false, '0.30s > 0.15s');
        t.ok('and a stale press is discarded, not left to fire later',
            input.consumeAttack() === false,
            'an unbounded read straight after must find nothing');

        // The window holds ONE press. A mash must not bank swings.
        pressAttack(input, clock);
        pressAttack(input, clock);
        pressAttack(input, clock);
        t.ok('three presses are one press, not a queue',
            input.consumeAttack(INPUT_BUFFER) === true
            && input.consumeAttack(INPUT_BUFFER) === false);
    }

    // ── Back-compat: the no-argument call is unchanged ─────────────────────
    // `index.js` drains with a bare consumeAttack() at two pause sites, and
    // gamepad.spec.mjs asserts bare edge-trigger semantics. An unbounded
    // window must therefore accept a press of any age.
    {
        const clock = makeClock();
        const input = new Input(fakeDom, { clock: clock.now });
        pressAttack(input, clock);
        clock.advance(5);
        t.ok('a bare consume still takes a five-second-old press',
            input.consumeAttack() === true,
            'menus and the pause drain depend on this');
        pressDash(input);
        clock.advance(5);
        t.ok('same for the dash', input.consumeDash() === true);
    }

    // ── The actual fix: the gate, driven through the real Player ───────────
    {
        const scene = new THREE.Scene();
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        const player = new Player(scene, new CollisionWorld(), () => false);

        // Count SWINGS, not calls to `tryAttack`.
        //
        // The first draft of this counted calls, and it passed with the fix
        // reverted — because the old code called `tryAttack` unconditionally
        // and the early-return on `attackCd > 0` lives INSIDE it. The counter
        // was measuring "the player asked", which was never in doubt; the
        // question is whether a blade moved. A swing is the thing that sets a
        // fresh cooldown, so that is what gets counted.
        let swings = 0;
        const realTryAttack = player.tryAttack.bind(player);
        player.tryAttack = (...a) => {
            const before = player.attackCd;
            const r = realTryAttack(...a);
            if (player.attackCd > before) swings++;
            return r;
        };

        // One swing to start a cooldown.
        pressAttack(input, clock);
        player.update(1 / 60, input, [], [], null, null);
        t.ok('the first press swings', swings === 1);
        t.ok('and it started a cooldown', player.attackCd > 0,
            `attackCd=${player.attackCd.toFixed(3)}`);

        // THE CASE. Run the cooldown most of the way down, then press while it
        // is still running — a player at a natural rhythm pressing slightly
        // early. Unfixed, this press is read on the very next frame, found to
        // be blocked, discarded, and the swing never happens.
        //
        // The press must land INSIDE the window: pressing the instant the
        // previous swing starts is 0.35s early against a 0.15s buffer, and is
        // correctly forgotten. A buffer is a grace period, not a queue.
        let guard = 0;
        while (player.attackCd > 0.08 && guard++ < 200) {
            clock.advance(1 / 60);
            player.update(1 / 60, input, [], [], null, null);
        }
        const early = player.attackCd;
        t.ok('the fixture presses while the gate is genuinely shut', early > 0,
            `attackCd=${early.toFixed(3)}`);
        pressAttack(input, clock);
        guard = 0;
        while (player.attackCd > 0 && guard++ < 60) {
            clock.advance(1 / 60);
            player.update(1 / 60, input, [], [], null, null);
        }
        t.ok('a press made during the cooldown fires when the cooldown ends',
            swings === 2,
            `pressed ${early.toFixed(3)}s early; swings=${swings} (unfixed: 1)`);

        // ...but only if it was recent. A press abandoned long ago must not
        // fire minutes later when the player has moved on.
        guard = 0;
        while (player.attackCd > 0 && guard++ < 200) {
            clock.advance(1 / 60);
            player.update(1 / 60, input, [], [], null, null);
        }
        pressAttack(input, clock);
        clock.advance(INPUT_BUFFER * 4);
        player.update(1 / 60, input, [], [], null, null);
        t.ok('a press older than the window is not resurrected',
            swings === 2, `swings=${swings}`);
    }

    // ── A guard break is a punishment, and stays one ───────────────────────
    // Buffering here would let every press made during the stun fire at once
    // the instant it ends, which deletes the cost of turtling. The drain is
    // deliberate; `player.js` documents the asymmetry.
    {
        const scene = new THREE.Scene();
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        const player = new Player(scene, new CollisionWorld(), () => false);

        let swings = 0;
        player.tryAttack = () => { swings++; return []; };
        let dashes = 0;
        player.tryDash = () => { dashes++; return true; };

        // `broken` is a getter over `breakT`, so the stun is set by the timer.
        player.guard.breakT = BREAK_STUN;
        for (let i = 0; i < 6; i++) {
            pressAttack(input, clock);
            pressDash(input);
            clock.advance(1 / 60);
            player.update(1 / 60, input, [], [], null, null);
        }
        t.ok('nothing swings through a guard break', swings === 0);
        t.ok('nothing dashes through a guard break', dashes === 0);

        // Let the stun lapse. Nothing may have been banked.
        player.guard.breakT = 0;
        clock.advance(1 / 60);
        player.update(1 / 60, input, [], [], null, null);
        t.ok('and nothing was saved up to fire the moment it ended',
            swings === 0 && dashes === 0,
            `swings=${swings} dashes=${dashes} — a buffer here would deliver all six`);
    }
}
