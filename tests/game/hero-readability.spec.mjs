// tests/game/hero-readability.spec.mjs — you must be able to find yourself.
//
// THE PROBLEM THIS PINS
//
// Player and enemies are assembled by the same `createActorRig` from the same
// six part builders. Measured on shipped frames (`tests/qa/silhouette-contrast.mjs`,
// probe aimed at the projected player rather than at frame centre): the hero
// separated from the floor by ΔL* 2.1 in the overworld and 4.5 in the Pyre —
// which is to say not at all. In a room with four figures in it, nothing on
// screen said which one you were driving.
//
// Three things were done about it, in the order that readability actually
// works — silhouette, then value, then colour:
//
//   1. a cloak            changes the OUTLINE. Nothing else in the game has one.
//   2. a separation light a fixed-direction rim that survives a 56 degree
//                         camera, where the old view-fresnel did not.
//   3. a reserved colour  azure, on the hero's rim and cloak and nowhere else.
//                         Section 4 below is the reason it is azure and not the
//                         cyan it started as: the check found the frost faction
//                         already wearing that cyan, which would have marked the
//                         player out in the colour of the things killing them.
//
// WHY THIS SPEC IS NOT THE PROBE
//
// The probe reads real composited frames and needs a real GPU, so it can never
// live in the suite (headless here is software GL at ~1.5 fps). It stays
// print-only and it is the thing that says how well this works. This spec is the
// cheaper, harder question: are the three treatments actually INSTALLED, on the
// hero and only the hero. That is the failure this project keeps having — a
// system built, tested, and wired to nothing.
//
// So it builds real rigs with the real hero options and the real enemy palettes
// and reads what came out. No hand-made fixtures standing in for the thing.

import * as THREE from 'three';
import { createActorRig } from '../../src/game/characters/actor-rig.js';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
// THE REAL OPTIONS THE REAL PLAYER IS BUILT FROM, imported rather than copied.
//
// This spec's first version declared its own `HERO_OPTS` under a comment
// claiming they were "exactly the options player.js passes". They were a copy,
// so the counterfactual could not touch them: deleting the cloak from
// `player.js`, and dropping the rim to the default, and giving the hero the
// frost faction's colour, each left this file passing 15 out of 15. It was
// pinning its own constant. A spec that cannot fail is decoration.
import { HERO_RIG as HERO_OPTS } from '../../src/game/player.js';

/** Every part material on a rig. */
function partMaterials(rig) {
    const out = [];
    rig.root.traverse((o) => {
        if (o.isMesh && o.userData.ssPart) out.push(o.material);
    });
    return out;
}

export function run(t) {
    const hero = createActorRig(HERO_OPTS);
    const plainOpts = { ...HERO_OPTS };
    delete plainOpts.rimColor;
    delete plainOpts.rimStrength;
    delete plainOpts.cloak;
    const plain = createActorRig(plainOpts);

    // ── 1. Silhouette ──────────────────────────────────────────────────────
    const cloak = hero.torso.getObjectByName('cloak');
    t.ok('the hero has a cloak', !!cloak, cloak ? 'found' : 'missing');
    t.ok('it hangs off the waist pivot, so it swings with the run',
        !!cloak && cloak.parent === hero.torso, cloak?.parent?.name);
    // Behind the torso's own back face. The torso geometry is not centred on
    // its origin (it runs z -0.23 to +0.37), so "behind" has to be measured.
    const torsoBB = hero.torsoMesh.geometry.boundingBox;
    const backZ = torsoBB.min.z * hero.torsoMesh.scale.z + hero.torsoMesh.position.z;
    t.ok('and it sits BEHIND the body, not through it',
        !!cloak && cloak.position.z < backZ, `cloak z=${cloak?.position.z.toFixed(3)} back=${backZ.toFixed(3)}`);
    // The first build hung it centred near the shoulder, so its top edge cleared
    // the shoulder — and because the camera looks down at 56 degrees, that
    // overhang projected up-screen over the hero's own head. Walking toward the
    // camera showed a blue slab across the hero's chest.
    const cloakTop = cloak ? cloak.position.y + HERO_OPTS.cloak.length * 0.5 : 0;
    const shoulderLocal = hero.armR.position.y;
    t.ok('the cloak never rises above the shoulder it hangs from',
        cloakTop <= shoulderLocal + 1e-6,
        `top=${cloakTop.toFixed(3)} shoulder=${shoulderLocal.toFixed(3)}`);

    // ── 2. It is a rendering treatment, not a hitbox change ────────────────
    // The cloak and the outline shells are both added AFTER the bounding box
    // that grounds the feet and feeds `radius` to combat. A cloak that reached
    // past the heels would otherwise have lifted the hero off the floor by its
    // own overhang, and nobody would ever have traced that back to a cape.
    t.ok('the cloak does not change how tall the rig measures',
        Math.abs(hero.height - plain.height) < 1e-9,
        `${hero.height.toFixed(4)} vs ${plain.height.toFixed(4)}`);
    t.ok('or how wide, which is what combat reads for hit radii',
        Math.abs(hero.radius - plain.radius) < 1e-9,
        `${hero.radius.toFixed(4)} vs ${plain.radius.toFixed(4)}`);
    t.ok('or where the feet land',
        Math.abs(hero.inner.position.y - plain.inner.position.y) < 1e-9,
        `${hero.inner.position.y.toFixed(4)} vs ${plain.inner.position.y.toFixed(4)}`);

    // ── 3. The separation light is on, and turned up for the hero ──────────
    const mats = partMaterials(hero);
    t.ok('every body part carries the separation light', mats.length === 6,
        `${mats.length} part materials`);
    t.ok('the hero rim is turned up from the default',
        mats.every((m) => m.userData.rimStrength === HERO_OPTS.rimStrength)
            && HERO_OPTS.rimStrength >= 0.6,
        mats.map((m) => m.userData.rimStrength).join(','));
    t.ok('and it is the reserved colour',
        mats.every((m) => m.userData.rimColor.getHex() === HERO_OPTS.rimColor),
        mats.map((m) => m.userData.rimColor.getHexString()).join(','));
    // three.js caches one compiled program per cache key. If the key did not
    // carry the strength, every actor in the scene would silently render with
    // whichever strength compiled first — the hero's 0.9 becoming an enemy's
    // 0.28, or the reverse, depending on spawn order.
    const heroKey = mats[0].customProgramCacheKey();
    const enemyRig = createActorRig({ palette: ENEMY_PALETTES.sentinel });
    const enemyKey = partMaterials(enemyRig)[0].customProgramCacheKey();
    t.ok('a stronger rim compiles as its own shader program',
        heroKey !== enemyKey, `${heroKey} vs ${enemyKey}`);

    // ── 4. Reserved means reserved ─────────────────────────────────────────
    // A mark everybody wears identifies nobody. This is the claim that decays
    // first: someone adds a faction, gives it a nice cyan glow, and the hero's
    // one distinguishing feature quietly becomes the fourth enemy type's too.
    const heroRim = HERO_OPTS.rimColor;
    const clashes = [];
    for (const [kind, pal] of Object.entries(ENEMY_PALETTES)) {
        const rig = createActorRig({ palette: pal });
        const rimHex = partMaterials(rig)[0].userData.rimColor.getHex();
        const c = new THREE.Color(rimHex);
        const h = new THREE.Color(heroRim);
        // Distance in linear RGB. Two colours a human would call "the same cyan"
        // land within about 0.15 of each other.
        const dist = Math.hypot(c.r - h.r, c.g - h.g, c.b - h.b);
        if (dist < 0.22) clashes.push(`${kind}=#${c.getHexString()} (d=${dist.toFixed(2)})`);
        rig.dispose();
    }
    t.ok('no enemy faction wears the hero\'s reserved colour',
        clashes.length === 0, clashes.join(', ') || 'none');
    const enemyCloaks = [];
    for (const [kind, pal] of Object.entries(ENEMY_PALETTES)) {
        const rig = createActorRig({ palette: pal });
        if (rig.torso.getObjectByName('cloak')) enemyCloaks.push(kind);
        rig.dispose();
    }
    t.ok('and no enemy has the hero\'s silhouette', enemyCloaks.length === 0,
        enemyCloaks.join(',') || 'none');

    // ── 5. The outline shells stay off ─────────────────────────────────────
    // Built and measured (mean ΔL* 7.2 → 14.3) and rejected on sight: at thirty
    // pixels tall, an outline wide enough to register is a quarter of the
    // character's width, and the figure becomes a black blob. Pinned OFF so it
    // cannot come back by accident.
    let shells = 0;
    hero.root.traverse((o) => { if (o.userData.ssOutline) shells++; });
    t.ok('the hard outline is not on by default', shells === 0, `${shells} shells`);
    const outlined = createActorRig({ ...HERO_OPTS, outline: true });
    let onShells = 0;
    outlined.root.traverse((o) => { if (o.userData.ssOutline) onShells++; });
    t.ok('but it is still one flag away if the camera ever comes closer',
        onShells === 6, `${onShells} shells`);

    hero.dispose();
    plain.dispose();
    enemyRig.dispose();
    outlined.dispose();
}
