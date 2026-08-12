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
import { ContactShadows } from '../../src/game/fx/contact-shadow.js';
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

    // ── 1. The hero carries no bolted-on accessory ─────────────────────────
    // Two were built this pass and both were rejected on sight by the owner: a
    // hard inverted-hull outline (a black blob at thirty pixels) and a cloak (a
    // rigid slab, because nothing here simulates cloth). Pinned OFF so neither
    // returns by accident, and so the next person reads WHY before rebuilding
    // one of them.
    t.ok('the hero has no cloak', !hero.torso.getObjectByName('cloak'), 'cloak present');
    let shells0 = 0;
    hero.root.traverse((o) => { if (o.userData.ssOutline) shells0++; });
    t.ok('and no hard outline', shells0 === 0, `${shells0} shells`);

    // ── 2. A rig knows where its own feet are ──────────────────────────────
    // This is what the cloak was worth: it exposed that the player's contact
    // shadow had been drawn at CHEST height since contact shadows shipped.
    // Enemy rigs sit their origin on the floor, so their discs were right by
    // luck; the player's origin is the centre of the physics body, 0.95 above
    // the feet, and the disc followed the origin. Invisible inside the player's
    // own silhouette — until a wide flat surface gave it something to cut
    // across.
    t.ok('the hero rig reports its foot offset',
        hero.groundOffset === HERO_OPTS.groundOffset,
        `${hero.groundOffset} vs ${HERO_OPTS.groundOffset}`);
    t.ok('and publishes it where a consumer handed the Object3D can read it',
        hero.root.userData.ssGroundOffset === HERO_OPTS.groundOffset,
        String(hero.root.userData.ssGroundOffset));
    t.ok('the hero origin really is above its feet, which is why this matters',
        HERO_OPTS.groundOffset < -0.5, String(HERO_OPTS.groundOffset));
    const enemyRig0 = createActorRig({ palette: ENEMY_PALETTES.sentinel });
    t.ok('an enemy rig sits its origin on the floor, so its disc needs no shift',
        enemyRig0.root.userData.ssGroundOffset === 0,
        String(enemyRig0.root.userData.ssGroundOffset));

    // AND THE CONSUMER, not just the producer. The first version of this
    // section asserted only that the rig PUBLISHES its foot offset — so
    // deleting the line in `contact-shadow.js` that READS it left the spec at
    // 14/14 while the disc went straight back to chest height. Half a wire is
    // half an alarm; drive the real ContactShadows against both rigs.
    {
        const scene = new THREE.Scene();
        const shadows = new ContactShadows(scene);
        const heroRoot = hero.root;
        const foeRoot = enemyRig0.root;
        heroRoot.position.set(0, 1.95, 0);   // origin at the physics centre
        foeRoot.position.set(6, 1.0, 0);     // origin on the floor
        scene.add(heroRoot, foeRoot);
        shadows.sync(0.016, {
            player: { rig: heroRoot },
            enemies: [{ rig: foeRoot, hitRadius: 0.5, state: { current: 'IDLE' } }],
        });
        const discs = [];
        scene.traverse((o) => { if (o.name === 'contact-shadow') discs.push(o); });
        const near = (x) => discs
            .slice().sort((a, b) => Math.abs(a.position.x - x) - Math.abs(b.position.x - x))[0];
        const heroDisc = near(0);
        const foeDisc = near(6);
        const heroFeet = 1.95 + HERO_OPTS.groundOffset;
        t.ok('a disc is placed for each actor', discs.length === 2, `${discs.length} discs`);
        t.ok('the hero disc sits on the FEET, not on the origin',
            heroDisc && Math.abs(heroDisc.position.y - heroFeet) < 0.1,
            `disc ${heroDisc?.position.y.toFixed(3)} vs feet ${heroFeet.toFixed(3)}`);
        t.ok('and it is nowhere near the chest it used to be drawn at',
            heroDisc && heroDisc.position.y < 1.95 - 0.5,
            String(heroDisc?.position.y.toFixed(3)));
        t.ok('the enemy disc is unmoved by the fix',
            foeDisc && Math.abs(foeDisc.position.y - 1.0) < 0.1,
            String(foeDisc?.position.y.toFixed(3)));
        shadows.dispose();
    }
    enemyRig0.dispose();

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
    enemyRig.dispose();
    outlined.dispose();
}
