// @ts-check
// Region relics — the overworld's reason to look.
//
// WHY THIS EXISTS
//
// Measured in `docs/EASTER-EGGS.md`: 49 overworld screens, and the count of
// things you can find *because you chose to look* is ten. Eight of those ten
// are the same cyan shard cache, authored once and placed eight times.
//
// A relic is the other kind. One per region, each a hand-built set piece at a
// screen centre, each granting a hero skin and nothing else. They cannot
// unbalance anything because they touch no number — that is the rule the whole
// cosmetic axis rests on (see `characters/hero-skins.js`).
//
// WHY THE SCREEN CENTRE
//
// `overworld/grammars.js:31` opens `makeProtector` with a radius-6 circle at
// (0,0), and every grammar box that lands inside it is refused whole. Measured
// on the start screen: 0 of 109 cells inside that disc carry mass.
//
// For terrain that has been a liability — the empty disc is exactly what the
// camera frames, which is much of why the overworld meters flat. For a set
// piece it is the opposite and it is free: the screen centre is the one place
// in the overworld where a prop is guaranteed to be seen, unoccluded, at full
// size. And it has to be, because the rig is fixed-yaw at 70.7 degrees: a relic
// near a screen edge is half-eaten by geometry the player cannot move around.
//
// WHY NOTHING HERE COLLIDES
//
// A relic is scenery you walk through. The dragon's ribs arch to 4.6 and the
// hero stands 1.95, so the player passes under them without ever touching one,
// and the skull sits beside the road rather than on it.
//
// That is a deliberate refusal, not an oversight. This repository's history is
// mostly bugs where a thing that looked standable was not, or looked passable
// and was not: alcove mouths with 0.10 clearance, doors landing on cell seams,
// a reachability probe walking across a chasm. A decorative prop that adds
// solids to the collision world is a new instance of that whole family, on the
// one screen in the region a player has been drawn to deliberately. There is no
// puzzle here that needs a wall.
//
// ONE, THEN SEVEN
//
// Only the tombfields relic is placed. The table below has eight rows because
// the world has eight regions, and the other seven are `null` on purpose: the
// plan in `docs/EASTER-EGGS.md` is to prove the whole chain end to end — prop,
// interact, story, unlock, save, map mark, visible hero — while exactly one
// thing depends on it. After that the rest are content, not engineering.

import * as THREE from 'three';
import { heroSkin } from '../characters/hero-skins.js';
import { grantOutfit } from '../kernel/wardrobe.js';

/** Radius the player must be inside to read the prompt and press the key. */
export const RELIC_REACH = 2.6;

/** Seconds between repeats of the proximity prompt — the altar's cadence. */
export const RELIC_PROMPT_EVERY = 2.6;

/**
 * How far from the screen centre a relic may sit.
 *
 * The protected disc is radius 6, so anything beyond this is standing in
 * terrain the grammar was free to build, and the set piece the player came for
 * starts competing with boulders.
 */
export const RELIC_MAX_OFFSET = 5;

function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: opts.rough ?? 0.86,
        metalness: opts.metal ?? 0.04,
        emissive: opts.emissive ?? 0x000000,
        emissiveIntensity: opts.emissiveIntensity ?? 0,
    });
}

/** One box, in world units, added to `g`. Returns it so callers can pose it. */
function box(g, { w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, color, ...rest }) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rest));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    // Casts, does not receive. Same reasoning as the held blade in
    // `assets/weapon-models.js`: a rib is 0.22 units thick under a camera 17.5
    // units up, so it covers a texel or two and shading it produces flicker
    // along the edge rather than shade. The SKULL overrides this below — it is
    // broad enough for the shadow to read as shadow.
    m.castShadow = true;
    m.receiveShadow = false;
    g.add(m);
    return m;
}

/**
 * One rib: boxes stepping along a quarter ellipse, each rotated to its tangent.
 *
 * Built as segments rather than as a curve because everything else in this game
 * is boxes, and a smooth extruded rib in a voxel world reads as an import.
 *
 * @param {THREE.Group} g
 * @param {number} x      position along the spine
 * @param {number} side   +1 or -1 — which way the rib sweeps
 * @param {number} span   how far out it reaches at the floor
 * @param {number} rise   how high the arch peaks
 * @param {number} th     rib thickness
 * @param {number} color
 */
function rib(g, x, side, span, rise, th, color) {
    const SEGS = 7;
    for (let i = 0; i < SEGS; i++) {
        // Parameter runs from the spine (t=0, at the top) to the ground (t=1).
        const t0 = i / SEGS;
        const t1 = (i + 1) / SEGS;
        const pt = (t) => ({
            z: side * span * Math.sin(t * Math.PI * 0.5),
            y: rise * Math.cos(t * Math.PI * 0.5),
        });
        const a = pt(t0);
        const b = pt(t1);
        const dz = b.z - a.z;
        const dy = b.y - a.y;
        const len = Math.hypot(dz, dy);
        box(g, {
            w: th, h: len * 1.12, d: th,
            x, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2,
            // Rotating about X tips the segment's long axis into the ZY plane.
            rx: Math.atan2(dz, dy),
            color,
        });
    }
}

/**
 * The dragon's spine, published because the probe has to be able to ask the
 * shape questions instead of re-deriving them.
 *
 * `spineY` was `SPINE_TOP - t * t * 1.5` and had two faults, both found by
 * measuring the built meshes rather than by looking at the numbers.
 *
 * IT NEVER REACHED THE GROUND. The tail ended at 0.9, putting its underside
 * 0.81 above the floor — a tail hovering in mid-air, and the same class of
 * defect this project has shipped before: a prop authored at one height and
 * resting at another.
 *
 * IT SAGGED INSIDE ITS OWN RIBCAGE. The probe reported 1.69 of headroom under
 * the arch against a hero who stands 1.95, and the limiter was not a rib — it
 * was this curve, already a third of the way down by the back of the cage. The
 * arch the player is invited to walk through was 26 cm too low at the far end,
 * which is precisely the failure the probe exists to catch and precisely the
 * one that eyeballing a screenshot does not.
 *
 * So the back is LEVEL across the ribcage and the drop starts behind it. That
 * is also the better animal: a straight spine with a tail lying out behind it
 * reads as something that lay down, and a spine sagging at the hips reads as
 * something badly drawn.
 */
export const SPINE_N = 22;
export const SPINE_X0 = -5.2;
export const SPINE_DX = 0.62;
export const SPINE_TOP = 2.4;

/** Where along the spine the tail starts to fall, as a fraction of its length. */
export const SPINE_LEVEL_TO = 0.5;

/** Chosen so the tail tip lands at 0.18 — resting, not hovering. */
export const SPINE_DROP = 8.88;

export function spineY(t) {
    const past = Math.max(0, t - SPINE_LEVEL_TO);
    return SPINE_TOP - past * past * SPINE_DROP;
}

/**
 * Seven rib pairs. The widest sit forward, so the arch the player walks under
 * is at the chest and the cage closes toward the hips.
 *
 * Exported for the same reason as the spine: `tests/qa/easter-eggs.mjs`
 * measures headroom across the RIBCAGE, and it has to know where the ribcage
 * is. A probe that hardcodes its own span is measuring a dragon it invented.
 */
export const DRAGON_RIBS = [
    { x: -4.4, span: 1.7, rise: 3.1 },
    { x: -3.5, span: 2.1, rise: 3.9 },
    { x: -2.6, span: 2.3, rise: 4.4 },
    { x: -1.7, span: 2.3, rise: 4.6 },
    { x: -0.8, span: 2.2, rise: 4.4 },
    { x: 0.1, span: 1.9, rise: 3.8 },
    { x: 1.0, span: 1.5, rise: 3.0 },
];

/** The x range the ribcage spans — the stretch the arch claim is about. */
export const RIBCAGE_X = {
    from: DRAGON_RIBS[0].x,
    to: DRAGON_RIBS[DRAGON_RIBS.length - 1].x,
};

/**
 * The dragon in the tombfields.
 *
 * Laid along X with the skull at the west end, ribs arching over the road so
 * the player walks through the animal rather than past it. Peak clearance 4.6
 * against a hero 1.95 tall.
 *
 * Bone is not white. `0xd8d2bc` against the tombfields floor keeps it inside
 * the region's own value range — a pure-white mass at screen centre would beat
 * the luminance gate `tests/qa/overworld-lum.mjs` measures and would read as a
 * different game's asset dropped in.
 */
export function buildDragonSkeleton() {
    const g = new THREE.Group();
    const BONE = 0xd8d2bc;
    const BONE_DARK = 0xa39c86;
    const SOCKET = 0x3a3730;

    // ── spine ───────────────────────────────────────────────────────────────
    // Vertebrae taper from the shoulder to the tail tip, which is the whole
    // reason they are authored one at a time: a loop with a constant size gives
    // a hosepipe, and a taper the eye can read is what says "animal".
    for (let i = 0; i < SPINE_N; i++) {
        const t = i / (SPINE_N - 1);
        const s = 0.62 - t * 0.44;
        box(g, {
            w: 0.52, h: s, d: s,
            x: SPINE_X0 + i * SPINE_DX,
            y: spineY(t),
            color: i % 2 ? BONE : BONE_DARK,
        });
        // Neural spines — the little fin along the back. Only over the ribcage;
        // a tail with them looks like a stegosaur.
        if (i < 11) {
            box(g, {
                w: 0.16, h: 0.34 + (1 - t) * 0.3, d: 0.16,
                x: SPINE_X0 + i * SPINE_DX, y: spineY(t) + s * 0.5 + 0.2,
                color: BONE_DARK,
            });
        }
    }

    // ── ribs ────────────────────────────────────────────────────────────────
    for (const r of DRAGON_RIBS) {
        for (const side of [1, -1]) rib(g, r.x, side, r.span, r.rise, 0.22, BONE);
    }

    // ── skull ───────────────────────────────────────────────────────────────
    //
    // REBUILT FOR THE CAMERA THIS GAME HAS. The first one was a cranium box, a
    // snout box, a jaw and two horn slabs — a perfectly reasonable skull seen
    // from the side, and from 70.7 degrees a pile of pale rectangles. Nobody
    // looks at this animal from the side. Ever.
    //
    // From almost overhead a skull reads as a SHAPE IN PLAN: a broad wedge that
    // narrows to a snout, two dark holes near the wide end, and horns as long
    // lines sweeping back off it. So that is what this is — the silhouette is
    // authored in the XZ plane and the height only has to be enough to catch
    // light. Deliberately lower and wider than a "correct" skull would be.
    const skull = new THREE.Group();
    // RESTING ON THE GROUND, not hovering above it. At 0.75 the cranium's
    // underside sat 0.39 clear of the floor — a skull floating in mid-air,
    // which is the same defect the tail had and which no amount of reading the
    // numbers that placed it would have shown.
    skull.position.set(-7.6, 0.40, 0.4);
    skull.rotation.y = -0.38;   // it fell where it fell
    skull.rotation.z = 0.10;

    // The wedge, in four courses that step inward toward the snout. Reads as a
    // tapering head from above, which two boxes never did.
    const CRANIUM = [
        { w: 1.15, d: 2.15, x: 0.55, y: 0.0 },
        { w: 1.30, d: 1.75, x: -0.35, y: 0.05 },
        { w: 1.05, d: 1.25, x: -1.25, y: 0.0 },
        { w: 0.80, d: 0.85, x: -2.05, y: -0.05 },
    ];
    for (const c of CRANIUM) {
        const m = box(skull, { w: c.w, h: 0.72, d: c.d, x: c.x, y: c.y, color: BONE });
        m.receiveShadow = true;   // broad enough for shade to read as shade
    }
    // The brow ridge, a course proud of the cranium, so there is a hard edge
    // across the top rather than one flat pale field.
    box(skull, { w: 0.34, h: 0.20, d: 2.0, x: 0.30, y: 0.42, color: BONE_DARK });

    // EYE SOCKETS ARE THE WHOLE READ. Two dark holes are what turns a pale
    // wedge into a face, and from this angle they are the only feature that
    // survives. Sunk into the top surface, wide, and the darkest value on the
    // whole animal.
    for (const sz of [0.62, -0.62]) {
        box(skull, { w: 0.52, h: 0.30, d: 0.46, x: -0.20, y: 0.30, z: sz, color: SOCKET });
    }
    // Nostril pits, smaller, further forward — they give the snout a direction.
    for (const sz of [0.20, -0.20]) {
        box(skull, { w: 0.20, h: 0.22, d: 0.20, x: -2.10, y: 0.28, z: sz, color: SOCKET });
    }

    // The lower jaw, DETACHED and lying beside the head. A jaw hinged shut is a
    // museum mount; a jaw that has fallen off is a thing that has been dead a
    // long time, which is the entire point of the set piece.
    box(skull, {
        w: 2.1, h: 0.26, d: 0.34, x: -1.5, y: -0.26, z: 1.15,
        ry: 0.22, color: BONE_DARK,
    });
    for (let i = 0; i < 5; i++) {
        box(skull, {
            w: 0.13, h: 0.26, d: 0.13, x: -2.35 + i * 0.42, y: -0.14, z: 1.02,
            color: BONE,
        });
    }

    // Horns: long, thin, swept back, and DESCENDING TO THE GROUND.
    //
    // They used to hold a constant height and reach all the way back to the
    // shoulder — which put a bone bar at y=1.07 across the ribcage, inside the
    // arch the player is invited to walk through. `relics.spec.mjs` caught it,
    // and the fix is the honest one rather than a shortening: this skull is
    // lying on the earth, so its horns come to rest on the earth too.
    for (const sz of [0.68, -0.68]) {
        for (let i = 0; i < 4; i++) {
            box(skull, {
                w: 0.72, h: 0.17, d: 0.17,
                x: 1.15 + i * 0.62,
                y: 0.10 - i * 0.09,
                z: sz + i * sz * 0.22,
                ry: sz > 0 ? -0.20 : 0.20,
                color: i % 2 ? BONE : BONE_DARK,
            });
        }
    }
    g.add(skull);

    // ── a wing, collapsed flat ──────────────────────────────────────────────
    //
    // Also rebuilt for the plan view. The first one stood up off the shoulder
    // at an angle and read as a grey slab; a wing seen from overhead is a FAN,
    // so this one lies on the ground with its fingers spread. One wing, not
    // two: a symmetric pair is a museum mount, and this animal came down on its
    // own and stopped.
    // ON THE NEAR SIDE, and that is a composition decision rather than an
    // anatomical one. North of the spine it was correct and invisible: the
    // camera's window is only about 6.8 units deep above the character, the
    // animal is already cut off at the top of frame, and anything placed
    // further up-screen is simply not in the picture. Laid out on the SOUTH
    // side it fills the empty near ground and the animal wraps around the
    // player instead of running past them.
    //
    // It costs no occlusion: nothing here rises above 0.5 and the hero stands
    // 1.95, so this is a shape on the floor rather than a thing in the way.
    const wing = new THREE.Group();
    wing.position.set(-3.4, 0.35, 2.9);
    wing.rotation.y = 0.42;
    // Humerus, then the long finger bones fanning out across the ground.
    box(wing, { w: 2.6, h: 0.30, d: 0.30, x: 0, y: 0, color: BONE });
    const FINGERS = [
        { len: 4.6, spread: 0.28 },
        { len: 4.2, spread: 0.60 },
        { len: 3.5, spread: 0.93 },
        { len: 2.6, spread: 1.26 },
    ];
    for (const [i, f] of FINGERS.entries()) {
        box(wing, {
            w: f.len, h: 0.20, d: 0.20,
            x: 1.3 + f.len / 2 - 0.2,
            y: -0.02 * i,
            z: Math.sin(f.spread) * f.len * 0.5,
            ry: f.spread,
            color: i % 2 ? BONE : BONE_DARK,
        });
    }
    g.add(wing);

    return g;
}

/**
 * THE COLD SIGNAL FIRE — the pyre region's relic.
 *
 * A stone ring, a bed of dead ash, four charred beams fallen inward, one
 * standing pole still leaning, and the iron basket that used to hang off it
 * lying on its side where it landed.
 *
 * WHY IT IS OUT, IN THE ONE REGION THAT GLOWS
 *
 * `overworld/world7.js` gives the pyre `ABYSS_COLORS.magma` as its accent; it
 * is the ascent to the peak and the only region in the world whose ground is
 * lit from underneath. So the loudest thing a prop can do here is *not* glow.
 * Nothing in this function sets an emissive. That is the whole idea: a beacon
 * at the top of the world, gone out, in a place where everything else is still
 * burning.
 *
 * WHY IT IS COLLAPSED RATHER THAN STANDING
 *
 * A tripod holding a basket puts iron at roughly 1.9, and the hero stands 1.95.
 * Relics do not collide, so it would not have stopped anybody — it would have
 * been worse than that: the player would walk straight through a hanging
 * brazier, which teaches them that nothing here is real. The dragon learned the
 * same lesson from the other side, where the horns barred its arch at 1.07.
 *
 * Collapsed also says more. Somebody lit this, and then nobody came back to it.
 *
 * WHY IT READS IN PLAN VIEW
 *
 * The camera is fixed at 70.7 degrees of pitch, so a prop is seen from very
 * nearly above. The dragon's first skull was a good side view and a pile of
 * pale rectangles from up here. This is built the other way round: a RING with
 * SPOKES is one of the few shapes that is unmistakable from directly overhead,
 * and the fallen pole crossing it is the diagonal that stops it reading as a
 * decoration rather than a wreck.
 */
export function buildColdSignalFire() {
    const g = new THREE.Group();

    // VALUE FIRST, HUE SECOND. The first build gave the ring stones #6a625c
    // against char at #241f1d, and from 70.7 degrees up the whole prop read as
    // one dark pile - the ring was not legible AS a ring, which is the only
    // shape that makes this thing a fire pit instead of rubble. Unburnt stone
    // is now clearly lighter than everything that burned, and that single
    // separation is what does the work.
    const STONE = 0x968d85;
    const STONE_DARK = 0x746b64;
    const CHAR = 0x241f1d;
    const CHAR_LIGHT = 0x3a322e;
    // Warmed off neutral grey. The first pass read as paper or snow against
    // clay ground, which is a material this world does not have.
    const ASH = 0x8f857a;
    const ASH_PALE = 0xa79b8d;
    const IRON = 0x4a3b34;
    const IRON_RUST = 0x6e4028;

    // ── the ring ────────────────────────────────────────────────────────────
    // Twelve stones, deliberately uneven: three are knocked flat and one is
    // missing entirely, because a perfect circle of identical blocks reads as
    // a texture rather than as something people built.
    const RING_R = 2.15;
    const MISSING = 7;
    for (let i = 0; i < 12; i++) {
        if (i === MISSING) continue;
        const a = (i / 12) * Math.PI * 2;
        const toppled = i === 2 || i === 5 || i === 9;
        const h = toppled ? 0.26 : 0.44 + (i % 3) * 0.08;
        const tilt = toppled ? 0.22 : 0;
        // A TILTED BOX DIGS ITS CORNER IN. Centring a stone at h/2 puts it flat
        // on the floor only while it is level; tilt it by `rz` and the low
        // corner drops by half its width times sin(tilt), which for these was
        // 6.8 cm underground. Sub-pixel at the scale this game is played, and
        // still wrong - and `relics.spec.mjs` checks it, so the alternative was
        // widening a threshold to admit the thing it exists to measure.
        box(g, {
            w: 0.62, h, d: 0.52,
            x: Math.cos(a) * RING_R,
            y: h / 2 + Math.abs(Math.sin(tilt)) * 0.31,
            z: Math.sin(a) * RING_R,
            ry: a + (toppled ? 0.35 : 0),
            rz: tilt,
            color: i % 2 ? STONE : STONE_DARK,
            rough: 0.95,
        });
    }

    // ── the ash bed ─────────────────────────────────────────────────────────
    // Low and wide, so from overhead the ring is filled rather than hollow.
    // Two tones: the pale centre is where it burned hottest and longest.
    for (const [r, n, col, y] of [[1.55, 9, ASH, 0.07], [0.85, 5, ASH_PALE, 0.10]]) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + r;
            box(g, {
                w: 0.78, h: 0.12, d: 0.78,
                x: Math.cos(a) * r * 0.62,
                y,
                z: Math.sin(a) * r * 0.62,
                ry: a * 0.5,
                color: col,
                rough: 1.0,
            });
        }
    }

    // ── the beams ───────────────────────────────────────────────────────────
    // Fallen inward, which is what a fire does when it finishes: the spokes
    // are what make the ring read as a FIRE from above rather than as a well.
    const BEAMS = [0.4, 1.9, 3.1, 4.6, 5.6];
    for (const [i, a] of BEAMS.entries()) {
        const len = 2.5 + (i % 3) * 0.45;
        const tilt = -0.10 - (i % 2) * 0.06;
        // Same correction as the ring stones, and it matters more here because
        // a beam is long: half of 3.4 metres times sin(0.16) is 27 cm of dip.
        box(g, {
            w: len, h: 0.26, d: 0.26,
            x: Math.cos(a) * (len * 0.36),
            y: 0.24 + (i % 2) * 0.16 + Math.abs(Math.sin(tilt)) * (len / 2),
            z: Math.sin(a) * (len * 0.36),
            ry: a,
            rz: tilt,
            color: i % 2 ? CHAR : CHAR_LIGHT,
            rough: 1.0,
        });
    }

    // ── the mast: a stump, and the rest of it on the ground ─────────────────
    //
    // The first version was one tall pole leaning 25 degrees off vertical. From
    // this camera a near-vertical object projects to almost nothing: it was
    // three metres of geometry and perhaps eight pixels, and in the photograph
    // it simply was not there.
    //
    // A stump plus a long fallen mast says the same thing and says it in plan
    // view, where this game is actually seen. The mast is the diagonal that
    // stops the pit reading as a decorative circle, and the two together read
    // as something that broke rather than something that was arranged.
    box(g, {
        w: 0.26, h: 0.85, d: 0.26,
        x: -1.55, y: 0.42, z: 1.35, ry: 0.4, rz: 0.07,
        color: CHAR_LIGHT, rough: 0.95,
    });

    const mast = new THREE.Group();
    mast.position.set(-1.55, 0.20, 1.35);
    mast.rotation.set(0, 2.42, 0);
    // Lying along its own +X, so the group's yaw is the whole story.
    box(mast, { w: 4.4, h: 0.24, d: 0.24, x: 2.3, color: CHAR_LIGHT, rough: 0.95 });
    // The arm it hung from, snapped and still attached near the far end.
    box(mast, { w: 0.22, h: 0.18, d: 1.05, x: 3.9, z: 0.3, ry: 0.22, color: CHAR, rough: 0.95 });
    // A stub of chain, holding nothing.
    box(mast, { w: 0.44, h: 0.12, d: 0.12, x: 4.05, y: 0.02, z: 0.78, color: IRON, metal: 0.55, rough: 0.5 });
    g.add(mast);

    // ── the basket, where the mast dropped it ───────────────────────────────
    //
    // TWO THINGS WERE WRONG WITH THE FIRST PLACEMENT AND ONLY THE PICTURE SAID
    // SO.
    //
    // It sat at (2.6, -2.2), on the opposite side of the pit from the mast, and
    // it read as an unrelated crate somebody had left there. A brazier and the
    // pole it hung from are one object in two pieces; putting them on opposite
    // sides of the wreck breaks the only sentence the prop is trying to say.
    //
    // And it was tipped 1.45 radians - 83 degrees, nearly flat on its side - so
    // from overhead its staves stuck up like legs and its floor plate became a
    // tabletop. It read as a small pergola. A round vessel reads as a round
    // vessel from this camera when it is closer to UPRIGHT, because that is the
    // pose whose silhouette is a circle.
    //
    // Now: at the mast's broken end, leaning 0.55 - clearly fallen, still
    // obviously a bucket.
    const basket = new THREE.Group();
    // The Y is SWEPT, not reasoned about. Three stacked rotations do not compose
    // in anybody's head - the first two guesses at this were 33 cm and 6 cm
    // underground - so the build is run at a range of heights and the one whose
    // lowest iron lands at +0.008 is the one that ships.
    basket.position.set(-3.95, 0.82, -1.95);
    basket.rotation.set(0.55, 0.9, 0.12);
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        box(basket, {
            w: 0.16, h: 0.62, d: 0.16,
            x: Math.cos(a) * 0.52, z: Math.sin(a) * 0.52,
            ry: a,
            color: i % 2 ? IRON : IRON_RUST,
            metal: 0.5, rough: 0.55,
        });
    }
    box(basket, { w: 1.24, h: 0.14, d: 1.24, y: -0.30, color: IRON, metal: 0.5, rough: 0.6 });
    g.add(basket);

    // The coal it spilled, in the direction it tipped. Dead black, no glow -
    // this is the one thing in the region that is not still burning.
    for (const [x, z, w] of [[-3.0, -1.2, 0.34], [-3.4, -0.8, 0.26], [-2.6, -1.7, 0.3], [-3.9, -0.9, 0.22]]) {
        box(g, { w, h: 0.2, d: w, x, y: 0.1, z, ry: x, color: CHAR, rough: 1.0 });
    }

    // The stones are broad and flat-topped, so a shadow across them resolves
    // into shade rather than into edge flicker. Same call the shield makes in
    // `assets/weapon-models.js`.
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

    return g;
}

/** id → builder. A relic's `kind` chooses its mesh. */
export const RELIC_BUILDERS = {
    dragon: buildDragonSkeleton,
    signal_fire: buildColdSignalFire,
};

/**
 * The eight regions, and what stands in each.
 *
 * Seven are `null` deliberately — see the header. `screen` must name a screen
 * inside that region, and `x`/`z` are offsets from the screen centre bounded by
 * `RELIC_MAX_OFFSET`. `relics.spec.mjs` holds both of those.
 */
export const REGION_RELICS = {
    tombfields: {
        id: 'relic:tombfields',
        kind: 'dragon',
        screen: 'r0c1',
        x: 1.2, z: -0.5,
        skin: 'bonewarden',
        label: 'the long dead thing',
        lines: [
            { speaker: 'PREDECESSOR', text: 'It came down here on its own, a long way before us. Nobody killed it. It just stopped.' },
            { speaker: 'PREDECESSOR', text: 'Take something off it. It has no use for the colour any more, and the road ahead has plenty of ways to go unnoticed.' },
        ],
    },
    spindle: null,
    sinklands: null,
    citadel: null,
    quarry: null,
    bonetown: null,
    cryomire: null,

    // THE SECOND PROP, AND DELIBERATELY A SMALL ONE.
    //
    // `docs/WARDROBE.md` argues that the prop is the cost and the palette is
    // not, and that whether the dragon was expensive or the PIPELINE is
    // expensive was a hypothesis until a second one existed. A ring of stones
    // and a fallen pole is the cheapest honest way to find out.
    //
    // r0c6 is the far north-east: the top of the pyre ascent, and the opposite
    // corner of the map from the miner in the south-east. Nothing else is on
    // it - r1c6 already carries a secret and is left alone.
    pyre: {
        id: 'relic:pyre',
        kind: 'signal_fire',
        screen: 'r0c6',
        x: -0.8, z: 0.6,
        skin: 'unanswered',
        label: 'the fire that went out',
        lines: [
            { speaker: 'PREDECESSOR', text: 'This is the high one. You light it and everything west of here can see it.' },
            { speaker: 'PREDECESSOR', text: 'Somebody did. Then they sat down next to it and waited, and it burned all the way down, and here it still is.' },
        ],
    },
};

/** Every authored relic, in region order. */
export function placedRelics() {
    return Object.entries(REGION_RELICS)
        .filter(([, r]) => !!r)
        .map(([region, r]) => ({ region, ...r }));
}

/** The relic on `screen`, or `null`. */
export function relicOnScreen(screen) {
    for (const r of placedRelics()) if (r.screen === screen) return r;
    return null;
}

/**
 * Place a relic and wire its interact.
 *
 * @param {object} level  the built level — needs `addSystem`
 * @param {object} ctx    needs `scene`
 * @param {object} spec   a row from `REGION_RELICS`, plus `screen`
 * @param {{x:number,z:number}} origin  the screen's world origin
 */
export function addRelic(level, ctx, spec, origin) {
    const build = RELIC_BUILDERS[spec.kind];
    if (!build) return null;
    const group = build();
    // Named so probes and specs can find the thing in the built world rather
    // than re-deriving where it should have gone. `tests/qa/easter-eggs.mjs`
    // measures headroom and terrain clearance off this.
    group.name = spec.id;
    const x = origin.x + (spec.x || 0);
    const z = origin.z + (spec.z || 0);
    group.position.set(x, 1, z);
    ctx.scene?.add(group);

    let promptCooldown = 0;
    level.addSystem({
        update(dt, game) {
            promptCooldown -= dt;
            const p = game.player?.root?.position;
            if (!p) return;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d > RELIC_REACH) return;

            const inv = game.player.inventory;
            // Already taken: the relic stays, and says so if asked. Removing it
            // would mean a player who returns finds the screen they remember as
            // the dragon screen has no dragon on it.
            const taken = !!inv?.getFlag?.(spec.id);
            if (promptCooldown <= 0) {
                promptCooldown = RELIC_PROMPT_EVERY;
                game.hud?.toast?.(taken ? `${spec.label} — already yours` : `E — ${spec.label}`, 1800);
            }
            if (!game.input?.consumeInteract?.()) return;
            if (taken) {
                game.hud?.toast?.('Nothing left on it worth taking.', 1600);
                return;
            }
            inv.setFlag(spec.id);
            const dressed = grantOutfit(inv, spec.skin);
            game.persistInventory?.();
            if (dressed) game.player.applySavedSkin?.();
            game.hud?.story?.queue?.(spec.lines);
            // Named from the skin table, not written here. A relic that
            // announces a skin by a name it keeps its own copy of is one edit
            // away from congratulating the player on the wrong thing.
            if (dressed) game.hud?.toast?.(`New look — ${heroSkin(spec.skin).name}`, 3200);
        },
        dispose() {
            if (group.parent) group.parent.remove(group);
            group.traverse((o) => {
                if (o.isMesh) {
                    o.geometry?.dispose?.();
                    o.material?.dispose?.();
                }
            });
        },
    });
    return group;
}
