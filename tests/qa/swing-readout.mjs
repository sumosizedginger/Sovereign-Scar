// Where does the swing actually GO?
//
// The pose library is written in raw pivot radians, and a radian has no opinion
// about which way the hero is facing. That is how a reversed swing survived a
// green suite: `tests/game/actor-anim.spec.mjs` asserted the SIGN of
// `armR.rotation.x`, which is satisfied just as well by a hero who strikes
// behind their own back.
//
// This probe answers the only question that matters, in world space: over the
// course of a strike, does the blade tip travel TOWARD the thing you are
// facing? Run it and read the z column.
//
//   node tests/qa/swing-readout.mjs
//
// The hero is yawed to face world +Z, so positive z is in front of them.

import * as THREE from 'three';
import { createActorRig } from '../../src/game/characters/actor-rig.js';
import { createActorAnimator } from '../../src/game/characters/actor-animator.js';
import { HERO_PALETTE } from '../../src/game/assets/palettes.js';
import { HAND_OFFSET, HAND_TILT, weaponTipY } from '../../src/game/assets/weapon-models.js';

const WEAPONS = ['anchor_link', 'tectonic_wedge', 'heavy_mallet', 'light_caster'];

function heroRig() {
    return createActorRig({
        palette: HERO_PALETTE,
        torsoProfileScale: 0.72,
        headProfileScale: 0.9,
        meshScale: 0.39,
        groundOffset: -0.95,
    });
}

/**
 * Stand-ins for the grip and the blade tip, built the way `HeldWeapon` builds
 * the real thing: a group at HAND_OFFSET carrying HAND_TILT, with the tip a
 * child of it at the model's own top. Skipping the tilt here would measure a
 * weapon this game does not draw.
 */
function markers(rig, weaponId) {
    const mount = rig.hand || rig.armR;
    const grip = new THREE.Object3D();
    grip.position.set(HAND_OFFSET.x, HAND_OFFSET.y, HAND_OFFSET.z);
    grip.rotation.set(HAND_TILT.x, 0, HAND_TILT.z);
    const tip = new THREE.Object3D();
    tip.position.set(0, weaponTipY(weaponId), 0);
    grip.add(tip);
    mount.add(grip);
    return { grip, tip };
}

const scratch = new THREE.Vector3();
function world(obj, root) {
    root.updateMatrixWorld(true);
    return obj.getWorldPosition(scratch).clone();
}

function readout(weaponId) {
    const rig = heroRig();
    const anim = createActorAnimator(rig, { archetype: 'hero' });
    rig.root.rotation.y = 0;              // facing world +Z
    const { grip, tip } = markers(rig, weaponId);

    console.log(`\n${weaponId}`);
    console.log('  phase        t     armRx   armRz  |  tip z    tip y   tip x  |  reach');
    console.log('  ' + '-'.repeat(70));

    anim.update(0.016);
    const rest = world(tip, rig.root);
    console.log(`  rest        ----  ${rig.armR.rotation.x.toFixed(2).padStart(6)}` +
        ` ${rig.armR.rotation.z.toFixed(2).padStart(6)}  | ` +
        `${rest.z.toFixed(2).padStart(6)}  ${rest.y.toFixed(2).padStart(6)}` +
        ` ${rest.x.toFixed(2).padStart(6)}  |`);

    anim.attack(weaponId, { windup: 0.07, strikeDur: 0.12, recover: 0.3 });
    let t = 0;
    let peakReach = -Infinity;
    for (let i = 0; i < 13; i++) {
        anim.update(0.02);
        t += 0.02;
        const p = world(tip, rig.root);
        const g = world(grip, rig.root);
        const reach = p.z - g.z;           // how far the blade leads the hand
        peakReach = Math.max(peakReach, p.z);
        console.log(`  ${(anim.combatPhase() || 'done').padEnd(10)} ${t.toFixed(2)}  ` +
            `${rig.armR.rotation.x.toFixed(2).padStart(6)}` +
            ` ${rig.armR.rotation.z.toFixed(2).padStart(6)}  | ` +
            `${p.z.toFixed(2).padStart(6)}  ${p.y.toFixed(2).padStart(6)}` +
            ` ${p.x.toFixed(2).padStart(6)}  | ${reach.toFixed(2).padStart(6)}`);
    }
    console.log(`  furthest the tip ever reaches in front: ${peakReach.toFixed(2)}` +
        `${peakReach < 0 ? '   <-- THE SWING GOES BEHIND THE HERO' : ''}`);
    rig.dispose();
}

console.log('Hero faces world +Z. Positive tip z = in front of them.');
for (const w of WEAPONS) readout(w);
console.log('');
