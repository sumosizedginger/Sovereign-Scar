// Ticket F: ActorRig + ActorAnimator gates, GPU-free.
//  - named pivots exist and preserve the legacy silhouette (height/grounding)
//  - archetypes are distinguishable from REST POSE alone
//  - locomotion swings limbs inside the audited ranges, deterministically
//  - telegraph and attack pose agree (windup peaks with ring life)
//  - hitboxes stay aligned: the animator never writes the root transform
//  - death collapses and stays grounded

import * as THREE from 'three';
import { createActorRig } from '../../src/game/characters/actor-rig.js';
import { createActorAnimator } from '../../src/game/characters/actor-animator.js';
import { ARCHETYPES } from '../../src/game/characters/archetypes.js';
import { HERO_PALETTE, ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
import { HAND_OFFSET, HAND_TILT, weaponTipY } from '../../src/game/assets/weapon-models.js';

const DT = 0.05;

// The weapons that SWING. The Light Caster points, and is tested apart.
// `bare_strike` draws no model on purpose (empty hands are the readable state
// for "you have not found a weapon yet"), so its business end is the fist —
// it belongs in the direction tests but not in the blade tests.
const MELEE_WEAPONS = ['bare_strike', 'anchor_link', 'tectonic_wedge', 'heavy_mallet'];
const ARMED_MELEE = MELEE_WEAPONS.filter((id) => id !== 'bare_strike');
/** How far in front the business end must get: a blade outreaches a fist. */
const MIN_FORWARD = { bare_strike: 0.4 };

/**
 * Put a marker where the blade tip really is, assembled exactly the way
 * `HeldWeapon` assembles the real model: a grip group at HAND_OFFSET carrying
 * HAND_TILT, with the tip a child of it at the model's measured top. Applying
 * the offset but not the tilt would test a weapon the game never draws.
 */
function mountTip(rig, weaponId) {
    const grip = new THREE.Object3D();
    grip.position.set(HAND_OFFSET.x, HAND_OFFSET.y, HAND_OFFSET.z);
    grip.rotation.set(HAND_TILT.x, 0, HAND_TILT.z);
    const tip = new THREE.Object3D();
    tip.position.set(0, weaponTipY(weaponId), 0);
    grip.add(tip);
    (rig.hand || rig.armR).add(grip);
    return tip;
}

const _v = new THREE.Vector3();
function worldOf(obj, rig) {
    rig.root.updateMatrixWorld(true);
    return obj.getWorldPosition(_v).clone();
}

function heroRig() {
    return createActorRig({
        palette: HERO_PALETTE,
        torsoProfileScale: 0.72,
        headProfileScale: 0.9,
        meshScale: 0.39,
        groundOffset: -0.95,
    });
}

function enemyRig(kind) {
    return createActorRig({ palette: ENEMY_PALETTES[kind], meshScale: 0.33 });
}

export function run(t) {
    // ── Rig assembly & silhouette parity ──
    const hero = heroRig();
    for (const pivot of ['body', 'torso', 'head', 'armL', 'armR', 'legL', 'legR']) {
        t.ok(`hero rig has ${pivot} pivot`, !!hero[pivot] && hero[pivot].isObject3D);
    }
    const bbox = new THREE.Box3().setFromObject(hero.root);
    const h = bbox.max.y - bbox.min.y;
    t.ok('hero rig height within ±5% of the 1.9u target', h >= 1.9 * 0.95 && h <= 1.9 * 1.05,
        `h=${h.toFixed(3)}`);
    t.ok('hero feet rest at the physics bottom face (-0.95)',
        Math.abs(bbox.min.y - (-0.95)) < 0.02, `minY=${bbox.min.y.toFixed(3)}`);

    const sentinel = enemyRig('sentinel');
    const sbox = new THREE.Box3().setFromObject(sentinel.root);
    t.ok('enemy rig grounded at local 0', Math.abs(sbox.min.y) < 0.02,
        `minY=${sbox.min.y.toFixed(3)}`);
    const sh = sbox.max.y - sbox.min.y;
    t.ok('enemy rig height within mob band (1.28-1.92)', sh >= 1.28 && sh <= 1.92,
        `h=${sh.toFixed(3)}`);

    // ── Archetype rest divergence (silhouette ≠ palette) ──
    const rests = {};
    for (const kind of ['sentinel', 'scarab', 'frost']) {
        const rig = enemyRig(kind);
        const an = createActorAnimator(rig, { archetype: kind });
        an.update(DT);
        rests[kind] = {
            bodyPitch: rig.body.rotation.x,
            armLx: rig.armL.rotation.x,
            armRx: rig.armR.rotation.x,
        };
        rig.dispose();
    }
    t.ok('scarab rests in a permanent forward lean',
        rests.scarab.bodyPitch > 0.1, JSON.stringify(rests.scarab));
    t.ok('frost rests with the casting arm raised',
        rests.frost.armRx < -0.6, JSON.stringify(rests.frost));
    t.ok('sentinel rests with the guard arm forward',
        rests.sentinel.armLx < -0.3, JSON.stringify(rests.sentinel));
    t.ok('the three enemy rest poses are mutually distinct',
        Math.abs(rests.scarab.bodyPitch - rests.sentinel.bodyPitch) > 0.08
        && Math.abs(rests.frost.armRx - rests.sentinel.armRx) > 0.3
        && Math.abs(rests.sentinel.armLx - rests.frost.armLx) > 0.25);

    // ── Locomotion: limbs actually swing, opposed, inside spec ranges ──
    const walker = createActorAnimator(hero, { archetype: 'hero' });
    walker.setLocomotion({ speed: 5.5, wishX: 1, wishZ: 0, grounded: true });
    let maxLeg = 0, minLeg = 0, opposed = true, maxArm = 0;
    for (let i = 0; i < 80; i++) {
        walker.update(DT);
        maxLeg = Math.max(maxLeg, hero.legR.rotation.x);
        minLeg = Math.min(minLeg, hero.legR.rotation.x);
        maxArm = Math.max(maxArm, Math.abs(hero.armR.rotation.x));
        if (Math.abs(hero.legR.rotation.x) > 0.12
            && Math.sign(hero.legR.rotation.x) === Math.sign(hero.legL.rotation.x)) {
            opposed = false;
        }
    }
    t.ok('walk swings legs through a readable arc (peak ≥ 15°, ≤ 35°)',
        maxLeg > 0.26 && maxLeg < 0.61 && minLeg < -0.26,
        `max=${maxLeg.toFixed(2)} min=${minLeg.toFixed(2)}`);
    t.ok('legs swing in opposition', opposed);
    t.ok('arms swing with the gait', maxArm > 0.12, `maxArm=${maxArm.toFixed(2)}`);
    t.ok('walking never writes the root transform (hitbox alignment)',
        hero.root.position.x === 0 && hero.root.position.y === 0
        && hero.root.position.z === 0 && hero.root.rotation.y === 0);

    // Determinism: same inputs, same pose after N fixed steps.
    const a = heroRig(), b = heroRig();
    const anA = createActorAnimator(a, { archetype: 'hero' });
    const anB = createActorAnimator(b, { archetype: 'hero' });
    for (const an of [anA, anB]) an.setLocomotion({ speed: 5.5, wishX: 0, wishZ: 1 });
    for (let i = 0; i < 40; i++) { anA.update(DT); anB.update(DT); }
    t.ok('animator is deterministic under fixed dt',
        Math.abs(a.legR.rotation.x - b.legR.rotation.x) < 1e-9
        && Math.abs(a.armL.rotation.x - b.armL.rotation.x) < 1e-9);
    a.dispose(); b.dispose();

    // ── Combat: the swing goes WHERE THE HERO IS LOOKING ──
    //
    // These assertions are deliberately about world-space positions and not
    // about the sign of a pivot angle. The version that checked signs passed
    // for eighteen months against a hero who wound up in front of their own
    // face and struck behind their back: `armR.rotation.x < -1.2` is satisfied
    // just as neatly by a backwards swing, because a radian has no opinion
    // about which way the actor is facing. Anything that claims a direction
    // has to be measured as one.
    for (const weaponId of MELEE_WEAPONS) {
        const rig = heroRig();
        const an = createActorAnimator(rig, { archetype: 'hero' });
        rig.root.rotation.y = 0;               // facing world +Z
        const tip = mountTip(rig, weaponId);

        an.attack(weaponId, { windup: 0.07, strikeDur: 0.12, recover: 0.3 });
        const track = [];
        for (let i = 0; i < 13; i++) {
            an.update(0.02);
            track.push({ phase: an.combatPhase(), p: worldOf(tip, rig) });
        }
        const strike = track.filter((s) => s.phase === 'strike');
        const fwd = Math.max(...track.map((s) => s.p.z));
        const lateral = Math.max(...strike.map((s) => s.p.x))
            - Math.min(...strike.map((s) => s.p.x));

        t.ok(`${weaponId}: the swing ends up in FRONT of the hero`,
            fwd > (MIN_FORWARD[weaponId] ?? 0.8), `furthest forward z=${fwd.toFixed(2)}`);
        t.ok(`${weaponId}: the strike drives the blade forward, not backward`,
            strike[strike.length - 1].p.z > strike[0].p.z,
            `${strike[0].p.z.toFixed(2)} -> ${strike[strike.length - 1].p.z.toFixed(2)}`);
        t.ok(`${weaponId}: the strike is an ARC, not a vertical chop`,
            lateral > 1.0, `lateral travel=${lateral.toFixed(2)}`);
        rig.dispose();
    }

    // The tip must LEAD the hand. Built blade-up (+Y) and mounted on an arm
    // that runs −Y, every weapon pointed 180° away from the limb: at rest it
    // stood straight up past the hero's head, and through a swing the tip
    // trailed the fist instead of leading it.
    for (const weaponId of ARMED_MELEE) {
        const rig = heroRig();
        const an = createActorAnimator(rig, { archetype: 'hero' });
        rig.root.rotation.y = 0;
        const tip = mountTip(rig, weaponId);
        const grip = tip.parent;
        an.update(0.016);
        const tp = worldOf(tip, rig);
        const gp = worldOf(grip, rig);
        t.ok(`${weaponId}: at rest the tip leads the grip`,
            tp.z > gp.z + 0.3, `tip z=${tp.z.toFixed(2)} grip z=${gp.z.toFixed(2)}`);
        t.ok(`${weaponId}: at rest the tip is not above the hero's head`,
            tp.y < 0.9, `tip y=${tp.y.toFixed(2)}`);
        t.ok(`${weaponId}: at rest the tip is not through the floor`,
            tp.y > -0.95, `tip y=${tp.y.toFixed(2)}`);
        rig.dispose();
    }

    // Ray/point profile must not play a melee sweep.
    const caster = heroRig();
    const can = createActorAnimator(caster, { archetype: 'hero' });
    caster.root.rotation.y = 0;
    const castTip = mountTip(caster, 'light_caster');
    can.attack('light_caster', { windup: 0.05, strikeDur: 0.16, recover: 0.2 });
    const castTrack = [];
    for (let i = 0; i < 8; i++) {
        can.update(DT);
        if (can.combatPhase() === 'strike') castTrack.push(worldOf(castTip, caster));
    }
    t.ok('light caster aims down the facing line',
        castTrack.length > 0 && castTrack.every((p) => p.z > 0.8),
        castTrack.map((p) => p.z.toFixed(2)).join(' '));
    t.ok('light caster holds its aim instead of sweeping an arc',
        Math.max(...castTrack.map((p) => p.x)) - Math.min(...castTrack.map((p) => p.x)) < 0.3);
    caster.dispose();

    // ── Combat phase machine ──
    const fighter = heroRig();
    const fan = createActorAnimator(fighter, { archetype: 'sentinel' });
    fan.startWindup(0.45, 'anchor_link');
    for (let i = 0; i < 9; i++) fan.update(DT);
    t.ok('windup phase is live until the resolve', fan.combatPhase() === 'windup'
        || fan.combatPhase() === 'recover');
    fan.strike(0.12, 0.3);
    fan.update(0.06);
    fan.update(0.1); // strike done → recover
    t.ok('strike hands off to recover', fan.combatPhase() === 'recover');

    // ── Death: collapse, grounded, combat cleared immediately ──
    fan.startWindup(0.6, 'anchor_link');
    fan.setDead(true);
    t.ok('death clears a live windup immediately', fan.combatPhase() === null);
    for (let i = 0; i < 40; i++) fan.update(DT);
    const dbox = new THREE.Box3().setFromObject(fighter.root);
    t.ok('death pose collapses the silhouette',
        (dbox.max.y - dbox.min.y) < h * 0.8, `h=${(dbox.max.y - dbox.min.y).toFixed(2)}`);
    t.ok('death pose does not sink through the floor', dbox.min.y > -1.35,
        `minY=${dbox.min.y.toFixed(2)}`);
    fighter.dispose();
    sentinel.dispose();
    hero.dispose();
}
