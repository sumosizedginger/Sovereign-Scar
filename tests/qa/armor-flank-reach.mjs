// tests/qa/armor-flank-reach.mjs — can a circling player reach an armoured flank?
//
//   node tests/qa/armor-flank-reach.mjs
//
// PRINT-ONLY. This is an instrument, not a gate.
//
// WHY THIS EXISTS
//
// `bosses/base.js` states the rule its own turn rate has to obey:
//
//   "The rate is the whole design. It must be SLOWER than the player can orbit,
//    or the armoured arc tracks whoever is attacking and the flank the fight is
//    built around is geometrically unreachable."
//
// `tests/game/boss-facing.spec.mjs` holds that as an assertion, and it is green.
// It is green because it asks the question at radii **1.5, 2 and 3** against a
// DEFAULT-SIZED `makeBoss()`.
//
// The Obsidian Arachnid carries `presenceScale(1.70)`. Its body edge is out past
// 3.7 and its hitbox reaches past 5. Every radius that spec tests is inside the
// spider's own legs — a place the player cannot stand and fight from. The one
// place measured was the one place that was already fine, which is this repo's
// single most expensive recurring bug.
//
// So this probe refuses to invent a radius. Every number it reports is derived
// from the defender's own geometry and the player's own weapons:
//
//   edge    half the larger world-space X/Z extent of the actual mesh, i.e. the
//           radius of the circle containing the silhouette from above. Standing
//           closer than this is standing INSIDE the body.
//   reach   `move.range + defender.hitRadius`, which is verbatim the test
//           `src/combat/hitbox.js:64` applies. Standing further than this and
//           the blow does not land at all.
//
// The band between them is the whole of the legal fight. If circling does not
// win somewhere in that band, the armour is not a challenge — it is a wall.
//
// IT DRIVES THE REAL TURN. `timeToFlank` below ticks the shipped `faceToward` /
// `_faceToward` and compares world-space vectors. It does not re-implement the
// arithmetic, because two copies of one formula agreeing with each other is not
// a measurement (HANDOFF trap: "a spec that models the drawing tests nothing").
//
// EVERY ARMOURED DEFENDER, not just the reported one. The bulwark elite carries
// the same directional plate through the same `inFrontArc` path, so it is swept
// here too. The bug being chased is a CLASS.

import * as THREE from 'three';
import { measureBody } from '../../src/game/bosses/boss-models.js';
import { ObsidianArachnid, SkeletalMantis } from '../../src/game/bosses/roster.js';
import { WEAPONS } from '../../src/game/combat/weapons.js';
import { Enemy } from '../../src/game/enemy.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { inFrontArc } from '../../src/game/combat/combat-sweeper.js';

const DT = 1 / 60;
const CAP = 20;              // seconds before we call it unreachable
const PLAYER_SPEED = 5.5;    // src/game/player.js:132
const WEB_SLOW = 0.7;        // roster.js — the Arachnid's web patch

const scene = () => new THREE.Scene();

/** A stand-in the facing code will accept. */
const makePlayer = (x, z) => ({
    root: { position: { x, y: 1.95, z } },
    state: { facingVec: { x: 0, z: -1 } },
    health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
});

/**
 * Walk a player in a circle at `radius` and report how many seconds until they
 * are more than `armorArc` off the defender's nose — i.e. until a blow lands.
 *
 * `make()` must return a FRESH defender every call. The first version of this
 * probe reused one instance and reported two different answers for the same
 * radius — 1.67s and 0.00s — because a defender that has already been turned
 * carries `_faced` and a stale `facingVec` into the next run, so the second
 * measurement started already flanked. A fixture that keeps state between
 * measurements is not measuring the thing it names.
 *
 * `turn` is invoked as the defender's own facing update, so whatever the shipped
 * code does is what is measured.
 */
function timeToFlank(make, radius, armorArc, speed = PLAYER_SPEED) {
    const { defender, turn } = make();
    const player = makePlayer(radius, 0);

    // WARM UP UNTIL IT IS LOOKING AT YOU, then start the clock.
    //
    // `BossBase.faceToward` snaps on first sight (`_faced`) but `Enemy._faceToward`
    // does not — it eases from a default facing. Starting the race cold therefore
    // scored the bulwark at 0.00s from every radius and every weapon: it began
    // the measurement already flanked, because it had not turned round yet. That
    // is not a flankable defender, it is an unaimed one, and it would have read
    // as "no problem here" for a kind that genuinely has none.
    //
    // In play the defender is facing you before you start circling. Reproduce
    // that, then measure.
    for (let i = 0; i < Math.round(3 / DT); i++) {
        turn(player, DT);
        const fv = defender.state.facingVec;
        const px = radius - (defender.root?.position.x ?? defender.rig?.position.x ?? 0);
        const pz = 0 - (defender.root?.position.z ?? defender.rig?.position.z ?? 0);
        const l = Math.hypot(px, pz) || 1;
        if ((px / l) * fv.x + (pz / l) * fv.z > Math.cos(0.02)) break;
    }

    // ORBIT THE BOSS, NOT THE ORIGIN, AND ASK THE GAME WHETHER THE BLOW LANDS.
    //
    // Two mistakes lived here, and they hid each other.
    //
    // The player was walked around a circle centred on (0,0) while the boss
    // CHASED — the Arachnid closes distance in the same `tickAI` that turns it —
    // so "radius" stopped describing the gap within a second, and the thing
    // being measured drifted away from the thing being named.
    //
    // And the armour test was a hand-rolled dot product sitting next to the real
    // one in `combat-sweeper.inFrontArc`. Two copies of one formula agreeing
    // with each other is not evidence, and these two did not even agree: the
    // re-derivation dropped the defender's own position out of the subtraction,
    // which is exactly the term that matters once the boss moves. It read 3.17s
    // where the shipped rule reads 1.62s.
    //
    // So: place the player at `radius` from wherever the boss actually IS, and
    // let `inFrontArc` — the function `applyHit` gates on — answer.
    const omega = speed / radius;            // player's angular rate, rad/s
    let theta = 0;
    const bp = () => defender.root?.position ?? defender.rig?.position ?? { x: 0, z: 0 };
    for (let i = 0; i < Math.round(CAP / DT); i++) {
        theta += omega * DT;
        const c = bp();
        player.root.position.x = c.x + Math.cos(theta) * radius;
        player.root.position.z = c.z + Math.sin(theta) * radius;
        turn(player, DT);
        if (!inFrontArc(defender, player, armorArc)) return i * DT;
    }
    return Infinity;
}

/** The melee moves a player can actually be holding, longest reach last. */
const MELEE = Object.entries(WEAPONS)
    .filter(([, w]) => typeof w.range === 'number' && !w.ray && w.range < 6)
    .map(([id, w]) => ({ id, range: w.range }))
    .sort((a, b) => a.range - b.range);

const SUBJECTS = [];

/**
 * MEASURE the turn rate; never accept one as an argument.
 *
 * The first version of this probe took the rate as a literal — `1.1`, copied
 * out of roster.js — and passed it into `faceToward` itself. That measures the
 * number written in the probe, not the number in the game: change the boss and
 * the instrument reports the old value forever, which is the one failure mode an
 * instrument may never have. The rate is a call-site argument, not a stored
 * field, so there is nothing to read either.
 *
 * So: point it at a player, spin the player 180 degrees, and see how far it
 * actually gets in one frame. That is the shipped rate, whatever it is.
 */
function measureTurnRate(make) {
    const { defender, turn } = make();
    const p = makePlayer(4, 0);
    for (let i = 0; i < 200; i++) turn(p, DT);        // settle onto the player
    p.root.position.x = -4;
    const before = { ...defender.state.facingVec };
    turn(p, DT);
    const after = defender.state.facingVec;
    const dot = before.x * after.x + before.z * after.z;
    const step = Math.acos(Math.max(-1, Math.min(1, dot)));
    return step >= Math.PI - 1e-3 ? Infinity : step / DT;
}

/** Build a subject from a factory that yields a fresh, ready-to-turn defender. */
function subject(name, make) {
    try {
        const { defender } = make();
        SUBJECTS.push({
            name,
            make,
            armorArc: defender.armorArc,
            hasArmour: defender.armorArc != null
                && (('armorUp' in defender) || defender.frontArmor),
            hitRadius: defender.hitRadius,
            edge: measureBody(defender.root || defender.rig || defender.mesh).radius,
            turnRate: measureTurnRate(make),
        });
    } catch (err) {
        SUBJECTS.push({ name, error: err.message });
    }
}

// ── Bosses ──────────────────────────────────────────────────────────────────
// Driven through the boss's REAL `tickAI`, so the `faceToward` call and the rate
// it passes are the shipped ones. `actionCd` is pinned high each frame to keep
// the boss out of its leap: `tickAI` returns early while `busy`, which would
// otherwise measure a boss that is airborne rather than one that is turning.
for (const [name, Cls, src] of [
    ['06 Obsidian Arachnid', ObsidianArachnid, 'roster.js'],
    ['08 Skeletal Mantis', SkeletalMantis, 'roster.js'],
]) {
    subject(`${name}  [${src}]`, () => {
        const b = new Cls(scene(), { x: 0, z: 0 });
        b._awake = true;
        return {
            defender: b,
            turn: (p, dt) => {
                b.actionCd = 99;
                b.t = (b.t || 0) + dt;
                b.tickAI(dt, p, null);
            },
        };
    });
}

// ── The bulwark elite — the same plate, through the same code path ───────────
// Swept because the bug being chased is a CLASS, not one boss. Its turn rate is
// DERIVED at enemy.js:302 against its own melee range, which is precisely the
// sum the Arachnid never had done for it.
subject('bulwark (elite)', () => {
    const e = new Enemy(scene(), new CollisionWorld(), { x: 0, z: 0 }, { kind: 'bulwark' });
    if (e.armorArc == null) e.armorArc = Math.PI / 2.4;   // the documented default
    return {
        defender: e,
        turn: (p, dt) => e._faceToward(
            p.root.position.x - (e.rig?.position.x ?? 0),
            p.root.position.z - (e.rig?.position.z ?? 0), dt),
    };
});

console.log('\n=== can a circling player reach an armoured flank? ===');
console.log(`  player speed ${PLAYER_SPEED}   cap ${CAP}s   step ${DT.toFixed(4)}s`);
console.log('  edge  = radius of the mesh silhouette (inside this is inside the body)');
console.log('  reach = move.range + hitRadius, exactly as src/combat/hitbox.js:64 tests it\n');

for (const s of SUBJECTS) {
    if (s.error) { console.log(`  ${s.name}: ERROR ${s.error}\n`); continue; }
    console.log(`── ${s.name}`);

    if (!s.hasArmour) {
        console.log(`   turn ${s.turnRate} rad/s   hitRadius ${s.hitRadius?.toFixed(2)}`
            + `   silhouette edge ${s.edge.toFixed(2)}`);
        console.log('   NO directional armour — facing does not gate damage here.\n');
        continue;
    }

    const arcDeg = (s.armorArc * 180 / Math.PI).toFixed(0);
    console.log(`   plate +-${arcDeg}deg   turn ${s.turnRate} rad/s   `
        + `hitRadius ${s.hitRadius?.toFixed(2)}   silhouette edge ${s.edge.toFixed(2)}`);

    // The break-even radius: where the player's orbital rate equals the turn
    // rate. Outside it, the plate wins outright no matter how long you circle.
    const breakEven = PLAYER_SPEED / s.turnRate;
    console.log(`   break-even radius ${breakEven.toFixed(2)} `
        + '(further out than this and circling can NEVER win)');
    console.log('   weapon            reach   standing at   time to flank');

    for (const w of MELEE) {
        const reach = w.range + (s.hitRadius || 0);
        // The two places in the legal band that matter: hard up against the
        // body, and at the very end of the weapon.
        for (const [label, r] of [['body edge', s.edge], ['max reach', reach]]) {
            if (r > reach + 1e-6) continue;          // cannot hit from there at all
            if (r < 0.3) continue;
            const t = timeToFlank(s.make, r, s.armorArc);
            const shown = t === Infinity ? `never (>${CAP}s)` : `${t.toFixed(2)}s`;
            const flag = t === Infinity ? '  <== WALL' : (t > 1.4 ? '  <== slow' : '');
            console.log(`   ${w.id.padEnd(16)}${reach.toFixed(2).padStart(6)}`
                + `   ${label.padEnd(11)}${shown.padStart(14)}${flag}`);
        }
    }

    // And the same question while the player is slowed, because a patch that
    // halves your speed also halves your orbital rate.
    const slowed = PLAYER_SPEED * WEB_SLOW;
    const tSlow = timeToFlank(s.make, s.edge, s.armorArc, slowed);
    console.log(`   while slowed to ${slowed} (web patch): `
        + `${tSlow === Infinity ? `never (>${CAP}s)` : tSlow.toFixed(2) + 's'} at the body edge`);
    console.log('');
}

console.log('READ IT LIKE THIS: any row marked WALL is a place the player can');
console.log('stand, legally land a blow from, and never get round the plate.\n');
