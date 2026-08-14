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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { BossBase } from '../../src/game/bosses/base.js';
import { inFrontArc } from '../../src/game/combat/combat-sweeper.js';
import { CryptWarden, SkeletalMantis, ObsidianArachnid } from '../../src/game/bosses/roster.js';
import { measureBody } from '../../src/game/bosses/boss-models.js';
import { WEAPONS } from '../../src/game/combat/weapons.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel) => fs.readFileSync(path.join(HERE, '../../src', rel), 'utf8');

/**
 * Walk speed the player actually has, so the race is against a real number.
 *
 * It said 6.0. The player has been 5.5 since `player.js:132`. An 9% error in the
 * player's own side of a race is not a rounding difference — it is the wrong
 * race — and it inflated every number in this file in the player's favour.
 *
 * So it is READ, not cited. `assertPlayerSpeed` below fails loudly if the game
 * changes underneath, rather than letting this constant quietly go stale again.
 */
const PLAYER_SPEED = 5.5;

/**
 * The longest reach any melee weapon in the game has, so "how far out can the
 * player stand and still land a blow" is answered by the weapon table rather
 * than by a number somebody remembered.
 */
const LONGEST_MELEE = Math.max(...Object.values(WEAPONS)
    .filter((w) => typeof w.range === 'number' && !w.ray && w.range < 6)
    .map((w) => w.range));

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
function timeToFlank(make, radius, armorArc = ARMOR_ARC, speed = PLAYER_SPEED,
    cap = 12, dt = 1 / 60) {
    const { defender, turn } = make();
    const player = makePlayer(radius, 0);
    turn(player, dt);                        // first sight snaps; that is by design

    // ORBIT THE BOSS, NOT THE ORIGIN — AND ASK `inFrontArc`, DO NOT RE-DERIVE IT.
    //
    // This loop used to walk the player around a circle centred on (0,0) and
    // then compute its own dot product against the boss's facing. Both halves
    // were wrong in the same direction and covered for each other:
    //
    //   - a real boss CHASES. The Arachnid closes distance inside the same
    //     `tickAI` that turns it, so within a second "radius" no longer
    //     described the gap between the two bodies at all.
    //   - the hand-rolled angle left the defender's own position out of the
    //     subtraction, which is precisely the term that starts to matter the
    //     moment the boss moves. `combat-sweeper.inFrontArc` — the function
    //     `applyHit` actually gates damage on — does subtract it.
    //
    // Measured against the identical fixture, the re-derivation said 3.17s
    // where the shipped rule said 1.62s. Two copies of one formula are not
    // evidence even when they agree, and these did not.
    const omega = speed / radius;            // player's angular speed, rad/s
    let theta = 0;
    for (let i = 0; i < Math.round(cap / dt); i++) {
        theta += omega * dt;
        const c = defender.root?.position ?? { x: 0, z: 0 };
        player.root.position.x = c.x + Math.cos(theta) * radius;
        player.root.position.z = c.z + Math.sin(theta) * radius;
        turn(player, dt);
        if (!inFrontArc(defender, player, armorArc)) return i * dt;
    }
    return Infinity;
}

/**
 * A bare `BossBase` turning at a rate we choose — for the gradient and the
 * counterfactual, where the point is to vary the rate rather than to test a
 * shipped one.
 */
const synthetic = (rate) => () => {
    const boss = makeBoss();
    return { defender: boss, turn: (p, dt) => boss.faceToward(p, dt, rate) };
};

/**
 * A REAL boss, driven through its REAL `tickAI`, so the rate under test is
 * whatever `roster.js` passes to `faceToward` — not a number copied into this
 * file. The old version of this spec took the rate as a literal `1.1`, which
 * meant it went on reporting the same answer no matter what the game did: the
 * Arachnid's turn rate could be changed to anything at all and every assertion
 * here stayed green. A test that cannot see the code it names is not a test.
 *
 * `actionCd` is pinned high because `tickAI` returns early while `busy`, and a
 * boss mid-leap is not a boss being circled.
 */
const shipped = (Cls) => () => {
    const boss = new Cls(new THREE.Scene(), { x: 0, z: 0 });
    boss._awake = true;
    return {
        defender: boss,
        turn: (p, dt) => { boss.actionCd = 99; boss.t = (boss.t || 0) + dt; boss.tickAI(dt, p, null); },
    };
};

/**
 * How far out the player can stand and still land a blow on `boss`.
 * Verbatim the test `src/combat/hitbox.js:64` applies: `move.range + hitRadius`.
 */
const maxReach = (boss) => LONGEST_MELEE + (boss.hitRadius || 0);

/** The radius of the circle containing the body from above. */
const bodyEdge = (boss) => measureBody(boss.root || boss.mesh).radius;

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
        // THE RADII COME FROM THE BOSS, NOT FROM THIS FILE.
        //
        // This block used to ask the question at 1.5, 2 and 3 units against a
        // default-sized `makeBoss()`, and it was green while the shipped fight
        // was unwinnable. The Obsidian Arachnid carries `presenceScale(1.70)`:
        // its body edge is 3.19 and its hitbox reaches 5.35 with the tectonic
        // wedge. EVERY radius this spec tested was inside the spider's own legs
        // — a place the player cannot stand and fight from. The one place
        // measured was the one place that was already fine, which is this
        // project's most expensive recurring bug, and it cost three separate
        // "I have to stand inside it to hit it" reports.
        //
        // The rule, stated so it cannot go stale: IF THE PLAYER CAN LEGALLY LAND
        // A BLOW FROM A RADIUS, THEY MUST BE ABLE TO REACH THE FLANK FROM THAT
        // RADIUS. Anything else is not armour, it is a wall with a hit sound.
        for (const [name, Cls] of [['Obsidian Arachnid', ObsidianArachnid]]) {
            const probe = new Cls(new THREE.Scene(), { x: 0, z: 0 });
            if (probe.armorArc == null) continue;      // not armoured; nothing to flank
            const edge = bodyEdge(probe);
            const far = maxReach(probe);
            const make = shipped(Cls);

            t.ok(`${name}: its reach band is real`, far > edge,
                `edge ${edge.toFixed(2)}, max reach ${far.toFixed(2)}`);

            // Both ends of the band the fight is really fought in, and a
            // DIFFERENT bar at each — because the gradient is the lesson, and
            // one invented number covering both ends would flatten it.
            //
            //   body edge   pressed against it: this is the reward for closing,
            //               so it has to land inside a single exchange.
            //   max reach   the very tip of the longest weapon in the game.
            //               One full leap cycle (`leapCd = 3`) is the honest
            //               bar: hanging back should cost you a whole rotation
            //               of the fight, and it does — it must not cost you
            //               the fight itself, which is what `never` meant.
            for (const [label, r, bar] of [
                ['body edge', edge, 1.5],
                ['max reach', far, 3.5],
            ]) {
                const s = timeToFlank(make, r, probe.armorArc);
                t.ok(`${name}: the flank opens at ${label} (${r.toFixed(2)})`,
                    s !== Infinity,
                    `${s === Infinity ? 'NEVER' : s.toFixed(2) + 's'} — a radius you can hit `
                    + 'from must be a radius you can flank from');
                t.ok(`${name}: …within ${bar}s at ${label}`,
                    s <= bar,
                    `${s === Infinity ? 'NEVER' : s.toFixed(2) + 's'} to clear a `
                    + `+-${(probe.armorArc * 180 / Math.PI).toFixed(0)}deg plate`);
            }

            // AND WHILE SLOWED. A patch that slows your walk slows your ORBIT,
            // and this boss lays one. At the old slow of 0.5 the plate became
            // absolutely unflankable — measured as never — which is a stun that
            // does not admit to being a stun.
            const sSlow = timeToFlank(make, edge, probe.armorArc, PLAYER_SPEED * 0.7);
            t.ok(`${name}: the flank still opens while slowed by its own web`,
                sSlow !== Infinity && sSlow <= 3,
                `${sSlow === Infinity ? 'NEVER' : sSlow.toFixed(2) + 's'} at the body edge`);
        }

        // And it must degrade the right way, not fall off a cliff: further out
        // is slower, which is what makes closing the distance a decision.
        const near = timeToFlank(synthetic(1.1), 2);
        const mid = timeToFlank(synthetic(1.1), 4);
        t.ok('and standing further out is strictly slower', mid > near,
            `${mid.toFixed(2)}s at 4 units vs ${near.toFixed(2)}s at 2`);

        // THE COUNTERFACTUAL THAT GIVES THE NUMBER MEANING. An instant turn —
        // what the Mantis did until this change — pins the player to the
        // boss's nose at every range. No walk, at any radius, ever flanks it.
        for (const radius of [1.5, 2, 3, 4.5]) {
            t.ok(`an instant turn at ${radius} units can never be flanked`,
                timeToFlank(synthetic(1e6), radius) === Infinity,
                'an armoured boss that snaps to face its attacker has no back');
        }
    }

    // ── The player's own speed is READ, not remembered ─────────────────────
    // `PLAYER_SPEED` in this file said 6.0 while the player has been 5.5 since
    // `player.js:132`. Every number in the race was computed with the player 9%
    // faster than they actually are — in the player's favour, which is the
    // direction that HIDES exactly the bug above. A constant describing another
    // file is a hypothesis until something checks it.
    {
        const src = SRC('game/player.js');
        const m = src.match(/this\.speed\s*=\s*([\d.]+)\s*;/);
        t.ok('player.js still states a walk speed', !!m, 'expected `this.speed = <n>;`');
        if (m) {
            t.ok('and this spec races against that exact number',
                Math.abs(parseFloat(m[1]) - PLAYER_SPEED) < 1e-9,
                `player.js says ${m[1]}, this file assumes ${PLAYER_SPEED} — re-derive the race`);
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
