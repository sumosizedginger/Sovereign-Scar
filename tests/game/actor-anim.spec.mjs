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

const DT = 0.05;

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

    // ── Combat: telegraph and pose agree ──
    const fighter = heroRig();
    const fan = createActorAnimator(fighter, { archetype: 'sentinel' });
    fan.startWindup(0.45, 'anchor_link');
    let peakRaise = 0;
    for (let i = 0; i < 9; i++) { // 0.45s of windup
        fan.update(DT);
        peakRaise = Math.min(peakRaise, fighter.armR.rotation.x);
    }
    t.ok('windup raises the striking arm toward its peak as the ring peaks',
        peakRaise < -1.2, `peak=${peakRaise.toFixed(2)}`);
    t.ok('windup phase is live until the resolve', fan.combatPhase() === 'windup'
        || fan.combatPhase() === 'recover');
    fan.strike(0.12, 0.3);
    fan.update(0.06); // mid-strike
    const midStrike = fighter.armR.rotation.x;
    fan.update(0.1); // strike done → recover
    t.ok('strike sweeps the arm through the facing line',
        midStrike > peakRaise + 0.5, `mid=${midStrike.toFixed(2)}`);
    t.ok('strike hands off to recover', fan.combatPhase() === 'recover');

    // Ray/point profile must not play a melee sweep.
    const caster = heroRig();
    const can = createActorAnimator(caster, { archetype: 'frost' });
    can.attack('light_caster', { windup: 0.05, strikeDur: 0.16, recover: 0.2 });
    for (let i = 0; i < 3; i++) can.update(DT); // into the strike hold
    t.ok('light caster holds a point pose instead of sweeping past centre',
        caster.armR.rotation.x < -0.8, caster.armR.rotation.x.toFixed(2));
    caster.dispose();

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
