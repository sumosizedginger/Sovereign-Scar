// tests/game/boss-facing.spec.mjs — a boss's armour has to have a back.
//
// TWO FAULTS, ONE FIX, AND NEITHER WAS VISIBLE YET
//
// `BossBase.state.facingVec` is what `inFrontArc` reads to decide whether a hit
// landed on a boss's plate or behind it. Two bosses turned to face the player by
// assigning `this.root.rotation.y = Math.atan2(dx, dz)` directly, which:
//
//   1. never touched `facingVec` — it stayed on the constructor default of
//      {x:0,z:-1}, due south, for the whole fight; and
//   2. was INSTANT, so the facing tracked the player at infinite angular speed.
//
// Neither showed up in play, because the only consumer of a boss's facingVec is
// directional armour and the only boss with any is the Obsidian Arachnid — which
// already used `faceToward`. So this was a trap rather than a bug: it arms the
// moment a second boss gets an armour arc, which is exactly what ROAD-TO-TEN
// phase B does to the Skeletal Mantis. Shipped as-is, its plate would have been
// welded due south while the body visibly tracked you, AND untankable even if
// aimed right, because you cannot out-walk an infinite turn rate.
//
// That is the bulwark bug, which this project has already shipped once. The
// framework's own comment on `faceToward` predicts it in so many words.
//
// WHY THE ORBIT NUMBER IS THE ASSERTION
//
// "The turn rate is slow enough" is not a claim you can eyeball off a constant.
// It is a race between the boss's angular speed and the player's, and the
// player's depends on how far out they are standing — orbiting close is FASTER
// in radians than orbiting wide. So the test walks a player around a boss at
// contact range using the real turn code and asks whether the flank actually
// opens. Trap 1: every direction here is a world-space position, never the sign
// of an angle.

import * as THREE from 'three';
import { BossBase } from '../../src/game/bosses/base.js';
import { inFrontArc } from '../../src/game/combat/combat-sweeper.js';
import { CryptWarden, SkeletalMantis, ObsidianArachnid } from '../../src/game/bosses/roster.js';

/** Walk speed the player actually has, so the race is against a real number. */
const PLAYER_SPEED = 6.0;

function makePlayer(x, z) {
    return {
        root: { position: { x, y: 1.95, z } },
        health: { hp: 6, maxHp: 6, dead: false, damage() { return { accepted: true }; } },
        state: { facingVec: { x: 0, z: 1 } },
    };
}

function makeBoss(opts = {}) {
    return new BossBase(new THREE.Scene(), {
        id: 'facing-test', name: 'Facing Test', hp: 20,
        position: { x: 0, z: 0 }, mesh: new THREE.Group(), ...opts,
    });
}

/** The Arachnid's plate, and the reference arc for everything here. */
const ARMOR_ARC = Math.PI / 3;   // +-60 degrees

/**
 * Seconds for a player orbiting at `radius` to clear a `+-ARMOR_ARC` plate on a
 * boss turning at `turnRate`. `Infinity` means the boss out-turns them forever.
 *
 * This is a race, and the player's side of it depends on how far out they
 * stand: orbiting close is FASTER in radians than orbiting wide, because the
 * same walk speed sweeps a bigger angle on a smaller circle. Measured, with
 * `PLAYER_SPEED` and a +-60 plate:
 *
 *     rate \ radius   1.5     2      3      4     4.5      6
 *       0.6          0.30   0.43   0.73   1.15   1.42    2.62
 *       0.9          0.33   0.48   0.95   1.73   2.40   10.47
 *       1.1          0.35   0.55   1.15   2.62   4.48   never
 *       1.4          0.40   0.65   1.73  10.47   never   never
 *
 * The "never"s are not a fault, they are the rule: at 6 units the player's own
 * angular speed is 1.00 rad/s, so a boss turning at 1.1 simply wins. WHAT THIS
 * FIGHT ASKS IS THAT YOU CLOSE THE DISTANCE TO GET BEHIND — which is a real
 * decision (close range is where the scythe is) rather than a free orbit.
 * The spec below pins both halves: fast at knife range, hopeless from the back
 * of the room.
 */
function timeToFlank(turnRate, radius, cap = 12, dt = 1 / 60) {
    const boss = makeBoss();
    const player = makePlayer(radius, 0);
    boss.faceToward(player, dt, turnRate);   // first sight snaps; that is by design

    const omega = PLAYER_SPEED / radius;     // player's angular speed, rad/s
    let theta = 0;
    for (let i = 0; i < Math.round(cap / dt); i++) {
        theta += omega * dt;
        player.root.position.x = Math.cos(theta) * radius;
        player.root.position.z = Math.sin(theta) * radius;
        boss.faceToward(player, dt, turnRate);

        // Angle between where the boss looks and where the player stands, both
        // as world-space vectors (trap 1 — never the sign of an angle).
        const fv = boss.state.facingVec;
        const px = player.root.position.x, pz = player.root.position.z;
        const len = Math.hypot(px, pz) || 1;
        const dot = (px / len) * fv.x + (pz / len) * fv.z;
        if (Math.acos(Math.max(-1, Math.min(1, dot))) > ARMOR_ARC) return i * dt;
    }
    return Infinity;
}

export function run(t) {
    // ── faceToward keeps the mesh and the combat facing in agreement ───────
    {
        const boss = makeBoss();
        const player = makePlayer(0, 5);          // due... +z of the boss
        boss.faceToward(player, 1 / 60, 1.1);

        const fv = boss.state.facingVec;
        t.ok('facing is a unit vector', Math.abs(Math.hypot(fv.x, fv.z) - 1) < 1e-6);
        t.ok('and points at the player in world space',
            fv.z > 0.999 && Math.abs(fv.x) < 1e-6,
            `facingVec=(${fv.x.toFixed(3)}, ${fv.z.toFixed(3)}) — player is at +z`);
        t.ok('the mesh agrees with it',
            Math.abs(Math.sin(boss.root.rotation.y) - fv.x) < 1e-6
            && Math.abs(Math.cos(boss.root.rotation.y) - fv.z) < 1e-6,
            'the plate and the picture must be the same direction');

        // The other side, so a sign convention that is consistently inverted
        // cannot pass (trap 1).
        const b2 = makeBoss();
        b2.faceToward(makePlayer(-5, 0), 1 / 60, 1.1);
        t.ok('a player at -x puts the facing at -x',
            b2.state.facingVec.x < -0.999, `${b2.state.facingVec.x}`);
    }

    // ── The turn is capped after the first sight ───────────────────────────
    {
        const boss = makeBoss();
        const player = makePlayer(0, 5);
        boss.faceToward(player, 1 / 60, 1.1);      // snaps

        // Teleport the player 180 degrees round. A capped turn cannot follow.
        player.root.position.x = 0;
        player.root.position.z = -5;
        boss.faceToward(player, 1 / 60, 1.1);
        t.ok('a 180-degree jump is not followed in one frame',
            boss.state.facingVec.z > 0.9,
            `facingVec.z=${boss.state.facingVec.z.toFixed(3)} — should still be near +z`);

        // ...but it does get there eventually.
        for (let i = 0; i < 400; i++) boss.faceToward(player, 1 / 60, 1.1);
        t.ok('but it turns all the way given time',
            boss.state.facingVec.z < -0.99, `${boss.state.facingVec.z}`);
    }

    // ── THE RACE. Can a circling player reach the flank? ───────────────────
    // The Arachnid's ±60-degree plate (armorArc = PI/3) is the reference: to
    // beat it the player must get more than 60 degrees off the nose.
    {
        // At the range this fight is actually fought — inside the scythe's
        // reach — circling has to WORK, and quickly enough to be worth doing
        // between attacks. The Mantis's cooldown is 1.4s at phase 1.
        for (const radius of [1.5, 2, 3]) {
            const s = timeToFlank(1.1, radius);
            t.ok(`at ${radius} units the flank opens inside one attack cooldown`,
                s <= 1.4, `${s === Infinity ? 'never' : s.toFixed(2) + 's'} to clear a 60deg plate`);
        }

        // And it must degrade the right way, not fall off a cliff: further out
        // is slower, which is what makes closing the distance a decision.
        const near = timeToFlank(1.1, 2);
        const mid = timeToFlank(1.1, 4);
        t.ok('and standing further out is strictly slower', mid > near,
            `${mid.toFixed(2)}s at 4 units vs ${near.toFixed(2)}s at 2`);

        // THE COUNTERFACTUAL THAT GIVES THE NUMBER MEANING. An instant turn —
        // what the Mantis did until this change — pins the player to the
        // boss's nose at every range. No walk, at any radius, ever flanks it.
        for (const radius of [1.5, 2, 3, 4.5]) {
            t.ok(`an instant turn at ${radius} units can never be flanked`,
                timeToFlank(1e6, radius) === Infinity,
                'an armoured boss that snaps to face its attacker has no back');
        }
    }

    // ── The two bosses that used to snap now do not ────────────────────────
    // Constructed for real, driven through their real tickAI. Deleting either
    // `faceToward` call in roster.js fails this.
    {
        const cases = [
            ['Crypt Warden', CryptWarden],
            ['Skeletal Mantis', SkeletalMantis],
            ['Obsidian Arachnid', ObsidianArachnid],
        ];
        for (const [name, Cls] of cases) {
            const boss = new Cls(new THREE.Scene(), { x: 0, z: 0 });
            const player = makePlayer(0, 4);
            boss._awake = true;                    // the Warden gates on this
            boss.tickAI(1 / 60, player);

            const fv = boss.state.facingVec;
            t.ok(`${name} updates its combat facing, not just its mesh`,
                Math.abs(fv.z - 1) < 0.02 && Math.abs(fv.x) < 0.02,
                `facingVec=(${fv.x.toFixed(3)}, ${fv.z.toFixed(3)}) — `
                + 'a default of (0,-1) means rotation.y was written directly');

            // Now teleport behind it and tick once. Anything that reaches the
            // player in a single frame is still snapping.
            player.root.position.z = -4;
            boss.tickAI(1 / 60, player);
            t.ok(`${name} cannot spin 180 degrees in one frame`,
                boss.state.facingVec.z > 0.9,
                `facingVec.z=${boss.state.facingVec.z.toFixed(3)}`);
        }
    }

    // ── The armour rule this all exists to protect ─────────────────────────
    {
        const boss = makeBoss();
        boss.armorArc = Math.PI / 3;
        const front = makePlayer(0, 4);
        boss.faceToward(front, 1 / 60, 1.1);

        t.ok('a hit from the front is inside the arc',
            inFrontArc(boss, front, boss.armorArc) === true);
        t.ok('a hit from directly behind is not',
            inFrontArc(boss, makePlayer(0, -4), boss.armorArc) === false);
        t.ok('nor is one from the side',
            inFrontArc(boss, makePlayer(4, 0), boss.armorArc) === false,
            'a +-60deg plate must leave the flanks open');
    }
}
