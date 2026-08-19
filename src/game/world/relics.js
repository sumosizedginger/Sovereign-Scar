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
 * A box that RESTS on the floor, given its own tilt.
 *
 * Centring a box at `h / 2` puts it flat on the ground only while it is level.
 * Give it `rz` or `rx` and the low corner drops by half the relevant span times
 * the sine of the tilt: the cold fire's toppled ring stones went 6.8 cm under,
 * and a 3.4-metre beam at 0.16 rad would go 27 cm under. Sub-pixel at the scale
 * this game is played and still wrong, and `relics.spec.mjs` checks for it.
 *
 * Written once here because it was got wrong twice by hand. Pass the same spec
 * `box` takes; `y` is measured from the floor to the box's UNDERSIDE rather
 * than to its centre, which is how anybody actually thinks about placing one.
 */
function grounded(g, spec) {
    const { w = 0, h = 0, d = 0, rx = 0, rz = 0, y = 0 } = spec;
    const lift = Math.abs(Math.sin(rz)) * (w / 2) + Math.abs(Math.sin(rx)) * (d / 2);
    return box(g, { ...spec, y: y + h / 2 + lift });
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

/**
 * SPINDLE — the toppled survey mast.
 *
 * The region is computing-vault heights in iron and slate, so what fell over
 * here is instrumentation: a lattice tower that used to hold a dish, lying flat
 * with its concrete footing snapped off at the base.
 *
 * PLAN VIEW FIRST. A lattice is rails plus rungs, which from directly above is
 * a LADDER — one of the few silhouettes as unambiguous as a ring — and the dish
 * at the far end turns it into a ladder with a circle on it. Neither shape is
 * used by any other relic, which matters more than it sounds: eight set pieces
 * seen from the same fixed 70.7 degrees have to be told apart at a glance.
 */
export function buildSurveyMast() {
    const g = new THREE.Group();
    const IRON = 0x7d8189;
    const IRON_DARK = 0x565b62;
    const CONCRETE = 0xa8a49c;
    const CONCRETE_DARK = 0x7b776f;
    const VIOLET = 0x6a4d8c;

    // The footing: a broken slab with the stumps of its bolts still in it.
    grounded(g, { w: 2.0, h: 0.42, d: 2.0, x: 2.6, z: 1.4, ry: 0.24, color: CONCRETE, rough: 0.95 });
    for (const [bx, bz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        grounded(g, {
            w: 0.16, h: 0.5, d: 0.16, x: 2.6 + bx, y: 0.42, z: 1.4 + bz,
            color: IRON_DARK, metal: 0.5, rough: 0.6,
        });
    }
    // A chunk of it that came away with the tower.
    grounded(g, { w: 0.9, h: 0.34, d: 0.8, x: 1.5, z: 0.2, ry: 0.9, rz: 0.14, color: CONCRETE_DARK, rough: 1.0 });

    // The tower, lying down. Two rails and the rungs between them.
    const mast = new THREE.Group();
    // THE YAW WAS 180 DEGREES OUT AND THE PROP REACHED 6.87 BECAUSE OF IT.
    // The rails run along the group's LOCAL -X, so a yaw of 2.34 threw the far
    // end away from the dish instead of toward it: the tower pointed one way,
    // the thing that fell off the end of it lay the other, and the pair pushed
    // the footprint past the radius-6 protected disc where the grammar is free
    // to build boulders. Pointing it at its own dish fixed the story and the
    // footprint in one number.
    mast.position.set(2.1, 0.0, 0.9);
    mast.rotation.set(0, 5.48, 0);
    const LEN = 5.2;
    for (const side of [-0.36, 0.36]) {
        grounded(mast, { w: LEN, h: 0.18, d: 0.18, x: -LEN / 2, z: side, color: IRON, metal: 0.45, rough: 0.55 });
    }
    for (let i = 0; i < 11; i++) {
        const t = -0.35 - (i / 10) * (LEN - 0.7);
        grounded(mast, {
            w: 0.14, h: 0.12, d: 0.78, x: t, y: 0.02,
            color: i % 2 ? IRON : IRON_DARK, metal: 0.4, rough: 0.6,
        });
    }
    // Two diagonal braces, because a real lattice is triangulated and the
    // diagonals are what stop the ladder reading as a fence.
    for (const [bx, br] of [[-1.9, 0.62], [-4.4, -0.62]]) {
        grounded(mast, { w: 1.9, h: 0.12, d: 0.12, x: bx, y: 0.04, ry: br, color: IRON_DARK, metal: 0.4, rough: 0.6 });
    }
    g.add(mast);

    // The dish, face down at the far end, with its hub and lens.
    const dish = new THREE.Group();
    dish.position.set(-1.6, 0, -2.9);
    dish.rotation.set(0, 0.5, 0);
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        grounded(dish, {
            w: 0.52, h: 0.2, d: 0.42,
            x: Math.cos(a) * 1.05, z: Math.sin(a) * 1.05, ry: a,
            color: i % 2 ? IRON : IRON_DARK, metal: 0.45, rough: 0.55,
        });
    }
    grounded(dish, { w: 1.5, h: 0.16, d: 1.5, color: IRON_DARK, metal: 0.4, rough: 0.65 });
    // The one coloured thing on it. Diffuse violet, no emissive - the region's
    // accent worn as a material rather than as a light, which is the rule the
    // whole cosmetic axis follows.
    grounded(dish, { w: 0.6, h: 0.3, d: 0.6, y: 0.16, color: VIOLET, metal: 0.3, rough: 0.35 });
    g.add(dish);

    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return g;
}

/**
 * SINKLANDS — the shipwreck, where there has been no water for a very long time.
 *
 * The joke carries itself and needs no line of dialogue, which is why this is
 * the one set piece `docs/EASTER-EGGS.md` named before any of the others.
 *
 * BUILT AS A HULL, NOT AS A SKELETON. The obvious way to draw a wrecked boat is
 * a keel with ribs coming off it, and from above that is the dragon again -
 * eight relics have to be distinguishable at a glance and two of them being a
 * spine with ribs is a waste of one. So the bow half keeps its planking and
 * reads SOLID, the stern half is open ribs, and the break between them is the
 * thing that says wreck.
 */
export function buildShipwreck() {
    const g = new THREE.Group();
    const HULL = 0x6e6250;
    const HULL_DARK = 0x4a4132;
    const DECK = 0xa89a80;
    const TAR = 0x2a2622;
    const RUST = 0x7a4a2c;

    // THE FIRST BUILD OF THIS WAS A PILE OF PLANKS AND A BLACK BAR.
    //
    // It drew the hull as separated angled boards either side of a heavy tar
    // keel, which from 70.7 degrees read as a herringbone with a black stripe
    // through it - a fern, or the dragon again, but not a boat. Two faults:
    // the boards had GAPS, so there was no closed shape for the eye to fill,
    // and the keel was the darkest thing in the frame, so the one element that
    // should have been hidden under the hull was the one element that read.
    //
    // Rebuilt as a continuous OUTLINE. The perimeter is a closed ellipse of
    // overlapping boxes with a pointed bow, which is a boat from directly above
    // and nothing else - and the bow third is decked over so the front is a
    // solid mass and the open stern is obviously open by comparison.
    const A = 4.2;
    const B = 1.32;
    const N = 26;
    for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        // Pinch the bow: the ellipse's half-width falls away toward -X so the
        // outline comes to a point instead of staying round at both ends.
        const ct = Math.cos(th);
        const pinch = ct < 0 ? (1 + ct * 0.72) : 1;
        const x = ct * A;
        const z = Math.sin(th) * B * pinch;
        // Taller toward the bow, which is what makes the front read as solid
        // body and the back as ribs.
        const h = 0.62 + Math.max(0, -ct) * 0.85;
        grounded(g, {
            w: 0.78, h, d: 0.42,
            x, z, ry: th + Math.PI / 2,
            color: i % 2 ? HULL : HULL_DARK, rough: 0.93,
        });
    }
    // The decking over the bow third. Overlapping, so it is a surface rather
    // than a set of boards with the ground showing between them.
    for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const x = -3.7 + i * 0.72;
        const half = B * (0.30 + t * 0.72);
        grounded(g, {
            w: 0.82, h: 0.34, d: half * 2, y: 0.30,
            x, color: i % 2 ? DECK : HULL, rough: 0.9,
        });
    }
    // The stem post: the tallest thing on the wreck and the front of it.
    grounded(g, { w: 0.40, h: 1.7, d: 0.5, x: -4.35, rz: 0.18, color: HULL_DARK, rough: 0.9 });

    // The stern ribs, standing above the outline so the back reads as opened up.
    for (let i = 0; i < 5; i++) {
        const th = 0.42 + i * 0.28;
        for (const side of [-1, 1]) {
            grounded(g, {
                w: 0.24, h: 1.25 - (i % 2) * 0.4, d: 0.24,
                x: Math.cos(th) * A * 0.86, z: side * Math.sin(th) * B * 1.02,
                rz: side * 0.14,
                color: i % 2 ? HULL : HULL_DARK, rough: 0.95,
            });
        }
    }

    // The keel, showing only where the hull has gone: a short dark line at the
    // open stern instead of a bar running the whole length.
    grounded(g, { w: 2.6, h: 0.24, d: 0.34, x: 2.4, color: TAR, rough: 0.95 });

    // The rudder, off its pintles.
    grounded(g, { w: 1.5, h: 0.22, d: 0.66, x: 4.0, z: -1.0, ry: 0.7, color: HULL_DARK, rough: 0.95 });
    for (const [rx0, rz0] of [[3.5, -0.5], [4.5, -1.4]]) {
        grounded(g, { w: 0.3, h: 0.16, d: 0.3, x: rx0, z: rz0, color: RUST, metal: 0.45, rough: 0.6 });
    }

    // The mast, down across the open stern - the diagonal that keeps a
    // symmetrical hull from reading as an ornament.
    const mast = new THREE.Group();
    mast.position.set(-0.6, 0.30, 0.1);
    mast.rotation.set(0, 1.05, 0);
    grounded(mast, { w: 4.6, h: 0.26, d: 0.26, x: 2.1, color: DECK, rough: 0.9 });
    grounded(mast, { w: 0.22, h: 0.2, d: 1.4, x: 3.7, color: HULL_DARK, rough: 0.9 });
    g.add(mast);
    grounded(g, { w: 0.44, h: 0.6, d: 0.44, x: -0.6, z: 0.1, color: HULL_DARK, rough: 0.9 });

    // Loose planking thrown clear, pale so it reads against the clay.
    for (const [px, pz, pr] of [[-2.8, 2.5, 0.6], [1.4, -2.6, -0.9], [3.0, 2.3, 2.1], [-1.2, -2.9, 1.4]]) {
        grounded(g, { w: 1.5, h: 0.16, d: 0.34, x: px, z: pz, ry: pr, color: DECK, rough: 0.95 });
    }

    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return g;
}

/**
 * CITADEL — the throne with nobody in it.
 *
 * The centre of the map and the highest-traffic square in the overworld, so it
 * gets the most deliberate composition of the eight.
 *
 * PLAN VIEW FIRST, AGAIN: concentric squares are as unmistakable from directly
 * above as a ring is, and a dais is concentric squares. The seat is the block
 * in the middle that stops it being a platform, and the two fallen banner poles
 * are the diagonals that stop it being architecture.
 */
export function buildEmptyThrone() {
    const g = new THREE.Group();
    const SLATE = 0x6c6a66;
    const SLATE_DARK = 0x494743;
    const GOLD = 0xc9a227;
    const GOLD_DARK = 0x8c6f18;
    const CLOTH = 0x4a2a5c;

    // Three steps. Each is drawn as a frame rather than a solid slab so the
    // step edges read as edges from overhead instead of as one grey lump.
    const STEPS = [[3.7, 0.0, 0.30, SLATE_DARK], [2.9, 0.30, 0.26, SLATE], [2.2, 0.56, 0.24, SLATE_DARK]];
    for (const [half, y, h, col] of STEPS) {
        for (const [sx, sz, w, d] of [
            [0, -half, half * 2, 0.5], [0, half, half * 2, 0.5],
            [-half, 0, 0.5, half * 2], [half, 0, 0.5, half * 2],
        ]) {
            grounded(g, { w, h, d, x: sx, y, z: sz, color: col, rough: 0.9 });
        }
    }
    // The floor of the top step, so the throne is not standing on a hole.
    grounded(g, { w: 4.0, h: 0.24, d: 4.0, y: 0.56, color: SLATE, rough: 0.92 });

    // The throne. Seat, back, two arms, and a gold band across the back which
    // is the only bright thing in the prop.
    grounded(g, { w: 1.5, h: 0.34, d: 1.2, y: 0.80, color: SLATE_DARK, rough: 0.85 });
    grounded(g, { w: 1.5, h: 1.8, d: 0.30, y: 0.80, z: -0.75, color: SLATE_DARK, rough: 0.85 });
    grounded(g, { w: 0.24, h: 1.05, d: 0.24, y: 2.10, z: -0.75, x: -0.55, color: GOLD_DARK, metal: 0.6, rough: 0.4 });
    grounded(g, { w: 0.24, h: 1.05, d: 0.24, y: 2.10, z: -0.75, x: 0.55, color: GOLD_DARK, metal: 0.6, rough: 0.4 });
    grounded(g, { w: 1.5, h: 0.26, d: 0.34, y: 2.30, z: -0.75, color: GOLD, metal: 0.7, rough: 0.35 });
    for (const ax of [-0.86, 0.86]) {
        grounded(g, { w: 0.26, h: 0.5, d: 1.2, x: ax, y: 1.14, color: SLATE_DARK, rough: 0.85 });
    }

    // Two banner poles, down. Cloth still on one of them.
    for (const [px, pz, pr, len] of [[-3.4, 1.6, 0.5, 4.2], [3.2, -1.9, 2.3, 3.6]]) {
        const pole = new THREE.Group();
        pole.position.set(px, 0, pz);
        pole.rotation.set(0, pr, 0);
        grounded(pole, { w: len, h: 0.18, d: 0.18, x: len / 2, color: GOLD_DARK, metal: 0.5, rough: 0.6 });
        for (let i = 0; i < 4; i++) {
            grounded(pole, {
                w: 0.7, h: 0.1, d: 0.9, x: len * 0.35 + i * 0.72, z: 0.3 + (i % 2) * 0.2,
                ry: 0.2 * i, color: CLOTH, rough: 1.0,
            });
        }
        g.add(pole);
    }

    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return g;
}

/**
 * CRYOMIRE — something frozen mid-stride.
 *
 * THE PALETTE HERE IS CONSTRAINED AND THE CONSTRAINT MADE IT BETTER. The region
 * runs frost enemies, `assets/palettes.js` gives them #60e0ff, and
 * `gear-skins.spec.mjs` fails any outfit whose emissive matches an enemy
 * accent. So the ice region is the one place an ice-blue glow is forbidden -
 * and sludge against ice is a stronger idea than ice against ice was ever going
 * to be. Nothing here is emissive at all.
 *
 * The ice is a SHELL, not a block: opaque voxels cannot be seen through, so the
 * figure inside is enclosed on three sides and left open toward the camera.
 * A solid cube with a secret in it is a solid cube.
 */
export function buildFrozenStride() {
    const g = new THREE.Group();
    const ICE = 0xa8c4cc;
    const ICE_DARK = 0x6e8890;
    const SLUDGE = 0x4a5238;
    const SLUDGE_DARK = 0x2f3626;
    const BODY = 0x2a2e2c;

    // The sludge it froze into, spreading out from the base.
    for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const r = 1.5 + (i % 3) * 0.55;
        grounded(g, {
            w: 1.1 + (i % 2) * 0.4, h: 0.14, d: 1.1,
            x: Math.cos(a) * r, z: Math.sin(a) * r, ry: a,
            color: i % 2 ? SLUDGE : SLUDGE_DARK, rough: 1.0,
        });
    }

    // The figure: a stride caught. Deliberately crude - it is a shape in ice,
    // not a character, and detail here would read as a second hero.
    grounded(g, { w: 0.62, h: 1.05, d: 0.42, y: 0.5, color: BODY, rough: 0.9 });
    grounded(g, { w: 0.42, h: 0.42, d: 0.4, y: 1.55, z: -0.06, color: BODY, rough: 0.9 });
    grounded(g, { w: 0.26, h: 0.9, d: 0.26, x: -0.22, z: 0.42, rx: 0.5, color: BODY, rough: 0.9 });
    grounded(g, { w: 0.26, h: 0.9, d: 0.26, x: 0.24, z: -0.36, rx: -0.35, color: BODY, rough: 0.9 });
    grounded(g, { w: 0.9, h: 0.22, d: 0.22, x: 0.5, y: 1.15, rz: -0.4, color: BODY, rough: 0.9 });

    // The ice around it: back and both sides, open toward -Z where the camera
    // is, so the figure is legible instead of entombed.
    // THE ICE COMES UP TO THE CHEST, NOT OVER THE HEAD.
    //
    // Removing the lid was necessary and not sufficient. At 2.3 the walls still
    // stood taller than the figure inside them, so from directly above the prop
    // read as a white well with something dark at the bottom of it - you could
    // see that there WAS something and not what.
    //
    // At 1.45 the head and shoulders stand clear. A head and shoulders coming
    // out of ice is legible in one glance at any size, and the part still
    // buried does the rest of the work: what you cannot see is the half that
    // was walking.
    grounded(g, { w: 1.9, h: 1.45, d: 0.5, z: -0.95, color: ICE, metal: 0.1, rough: 0.28 });
    grounded(g, { w: 0.5, h: 1.35, d: 1.5, x: -1.05, z: -0.15, color: ICE_DARK, metal: 0.1, rough: 0.3 });
    grounded(g, { w: 0.5, h: 1.35, d: 1.5, x: 1.05, z: -0.15, color: ICE_DARK, metal: 0.1, rough: 0.3 });
    // NO LID. The first build capped this at y 2.1 and the photograph came back
    // as a white box with nothing in it: the camera is 17.5 units up at 70.7
    // degrees, so the TOP is the face the player sees, and putting ice across
    // it hid the only thing the prop is about. "Open toward -Z" was reasoning
    // about a side view of a game that does not have one.
    //
    // A rim instead - four short blocks around the mouth, so the ice still
    // encloses and the figure is still visible down inside it.
    for (const [rx, rz, rw, rd] of [
        [0, -0.95, 1.9, 0.34], [-0.95, -0.15, 0.34, 1.5], [0.95, -0.15, 0.34, 1.5],
    ]) {
        grounded(g, { w: rw, h: 0.26, d: rd, x: rx, y: 1.45, z: rz, color: ICE, metal: 0.1, rough: 0.28 });
    }

    // One slab split off and leaning, so the ice is a broken thing rather than
    // a container somebody set the figure down in.
    grounded(g, { w: 0.42, h: 1.7, d: 1.1, x: -1.5, z: 0.55, rz: 0.38, ry: 0.4, color: ICE, metal: 0.1, rough: 0.28 });

    // Spikes radiating out along the ground - the shape that says this froze
    // outward from a point rather than being carved.
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3;
        const len = 1.2 + (i % 3) * 0.5;
        grounded(g, {
            w: len, h: 0.26, d: 0.26,
            x: Math.cos(a) * (1.6 + len * 0.4), z: Math.sin(a) * (1.6 + len * 0.4),
            ry: a, rz: 0.12,
            color: i % 2 ? ICE : ICE_DARK, metal: 0.08, rough: 0.32,
        });
    }

    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return g;
}

/**
 * BONETOWN — a house in the ruined town, still furnished.
 *
 * Beat 09's dead are frozen mid-task and `world/settlements.js` argues at
 * length that they must never turn around. This is the same idea with nobody in
 * it, which is worse: the table is laid, the bed is made, and the walls come up
 * to a standing hero's chest.
 *
 * THE WALLS ARE LOW ON PURPOSE. At 1.1 against a hero of 1.95 you look INTO the
 * house rather than at it, which is the only way a roofless interior reads from
 * 70.7 degrees. It also keeps the prop honest: relics do not collide, and a
 * full-height wall the player walks through teaches them nothing here is real.
 * A knee-to-chest ruin is a footprint, and walking over a footprint is fine.
 */
export function buildFurnishedHouse() {
    const g = new THREE.Group();
    const LIME = 0xb0a894;
    const LIME_DARK = 0x7e7768;
    const MOSS = 0x5e7048;
    const WOOD = 0x6a5236;
    const WOOD_DARK = 0x453520;
    const CLOTH = 0x9a8f7c;

    const HW = 2.7;
    const HD = 2.3;
    const WALL_H = 1.1;

    // Four walls with a gap for the door, drawn in blocks so the courses read.
    // THE FIRST VERSION DIVIDED THE WRONG AXIS AND THE SIDE WALLS CAME OUT
    // 0.115 THICK INSTEAD OF 0.44.
    //
    // It wrote `w: w / n` for every wall. For the back and front, where the run
    // is along X, that is right. For the left and right, where the run is along
    // Z, it chopped up the THICKNESS and left the length whole - so two of the
    // four walls rendered as rows of thin sticks. Visible instantly in the
    // photograph and invisible in every number, because a stick is still a
    // wall as far as a bounding box is concerned.
    //
    // Now the long axis is chosen first and only that one is divided.
    const wall = (x, z, w, d, n) => {
        const along = w > d;
        for (let i = 0; i < n; i++) {
            const t = (i / (n - 1)) - 0.5;
            const h = WALL_H - (i % 3) * 0.16;
            grounded(g, {
                w: along ? w / n + 0.06 : w,
                h,
                d: along ? d : d / n + 0.06,
                x: x + (along ? t * w : 0),
                z: z + (along ? 0 : t * d),
                color: i % 2 ? LIME : LIME_DARK, rough: 0.95,
            });
        }
    };
    wall(0, -HD, HW * 2, 0.44, 9);            // back
    wall(-HW, 0, 0.44, HD * 2, 8);            // left
    wall(HW, 0, 0.44, HD * 2, 8);             // right
    // Front, with a doorway: two stubs instead of a run.
    wall(-1.75, HD, 1.9, 0.44, 3);
    wall(1.75, HD, 1.9, 0.44, 3);

    // Moss, on the north wall only - the side that never sees the sun.
    for (const mx of [-1.9, -0.4, 1.2, 2.2]) {
        grounded(g, { w: 0.8, h: 0.3, d: 0.5, x: mx, y: WALL_H - 0.34, z: -HD, color: MOSS, rough: 1.0 });
    }

    // The table, still laid.
    grounded(g, { w: 1.7, h: 0.14, d: 1.0, y: 0.68, x: -0.5, z: 0.3, color: WOOD, rough: 0.9 });
    for (const [lx, lz] of [[-1.1, -0.05], [0.1, -0.05], [-1.1, 0.65], [0.1, 0.65]]) {
        grounded(g, { w: 0.14, h: 0.68, d: 0.14, x: lx, z: lz, color: WOOD_DARK, rough: 0.92 });
    }
    for (const [bx, bz] of [[-0.9, 0.15], [-0.15, 0.45]]) {
        grounded(g, { w: 0.34, h: 0.12, d: 0.34, x: bx, y: 0.82, z: bz, color: CLOTH, rough: 0.95 });
    }
    // Two stools, one knocked over.
    grounded(g, { w: 0.5, h: 0.44, d: 0.5, x: -1.7, z: 0.3, color: WOOD_DARK, rough: 0.92 });
    grounded(g, { w: 0.5, h: 0.44, d: 0.5, x: 0.75, z: 0.35, rz: 1.3, color: WOOD_DARK, rough: 0.92 });

    // The bed, made.
    grounded(g, { w: 1.15, h: 0.34, d: 2.0, x: 1.75, z: -0.9, color: WOOD_DARK, rough: 0.92 });
    grounded(g, { w: 1.05, h: 0.2, d: 1.5, x: 1.75, y: 0.34, z: -0.7, color: CLOTH, rough: 1.0 });
    grounded(g, { w: 0.95, h: 0.22, d: 0.45, x: 1.75, y: 0.34, z: -1.6, color: LIME, rough: 1.0 });

    // A roof beam, down across the corner. The one diagonal in a prop that is
    // otherwise all right angles, and the thing that says ruin rather than home.
    const beam = new THREE.Group();
    beam.position.set(-2.4, 0.1, -1.9);
    beam.rotation.set(0, -0.72, 0);
    grounded(beam, { w: 5.2, h: 0.28, d: 0.28, x: 2.6, rz: 0.1, color: WOOD_DARK, rough: 0.95 });
    g.add(beam);

    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return g;
}

/**
 * QUARRY — the figure somebody stopped carving.
 *
 * A block of basalt with a head and shoulders coming out of the top of it and
 * the rest still stone, the chisel chips still lying where they fell, and the
 * scaffold plank down.
 *
 * From overhead the read is a hard rectangle with one ROUNDED, PALE end - the
 * carved part is dressed lighter than the raw block on purpose, because value
 * is what separates shapes at this camera and two greys would be one grey. The
 * cold fire taught that the expensive way.
 */
export function buildUnfinishedCarving() {
    const g = new THREE.Group();
    const BASALT = 0x4e4a48;
    const BASALT_DARK = 0x33302e;
    const DRESSED = 0x8e8880;
    const PALE = 0xaaa49a;
    const WOOD = 0x6a5236;
    const IRON = 0x585450;

    // IT LIES DOWN, AND THE FIRST VERSION DID NOT.
    //
    // Built standing, this was a head on shoulders on a block - and a standing
    // figure seen from directly above is a head with a ring of shoulder around
    // it, which reads as a stack of boxes and nothing else. The photograph came
    // back looking like a small ziggurat.
    //
    // A RECUMBENT EFFIGY solves it completely: lying on its back, the figure's
    // whole outline faces the camera, and a human outline is one of the few
    // shapes a person recognises instantly at any size. It is also the better
    // idea - a tomb effigy is what a quarry in a region full of the dead would
    // actually be cutting, and half-finished it says the carver did not get to
    // the legs.
    //
    // The plinth is deliberately DARK and the carved figure PALE. Value is what
    // separates shapes at this camera; two greys would have been one grey.
    grounded(g, { w: 4.4, h: 0.62, d: 2.1, color: BASALT_DARK, rough: 0.98 });
    // The block the legs are still inside, left square at the foot end.
    grounded(g, { w: 1.7, h: 0.95, d: 1.75, x: 1.3, color: BASALT, rough: 0.98 });
    for (let i = 0; i < 3; i++) {
        grounded(g, { w: 0.1, h: 0.85, d: 1.8, x: 0.75 + i * 0.55, y: 0.62, color: BASALT_DARK, rough: 1.0 });
    }

    // The figure, from the head down, stopping where the work stopped.
    grounded(g, { w: 0.72, h: 0.5, d: 0.72, x: -1.85, y: 0.62, color: PALE, rough: 0.72 });
    grounded(g, { w: 0.42, h: 0.34, d: 0.34, x: -1.42, y: 0.62, color: DRESSED, rough: 0.75 });
    grounded(g, { w: 1.5, h: 0.46, d: 1.25, x: -0.6, y: 0.62, color: DRESSED, rough: 0.78 });
    grounded(g, { w: 0.9, h: 0.4, d: 0.95, x: 0.35, y: 0.62, color: DRESSED, rough: 0.8 });
    // One arm laid across the chest and finished; the other still in the stone.
    grounded(g, { w: 1.05, h: 0.26, d: 0.3, x: -0.75, y: 1.08, z: 0.18, ry: 0.42, color: PALE, rough: 0.74 });
    grounded(g, { w: 0.85, h: 0.3, d: 0.32, x: -0.6, y: 0.62, z: -0.78, color: BASALT, rough: 0.98 });

    // Chips, denser on the side the carver stood.
    for (const [cx, cz, cw] of [
        [-2.6, 1.7, 0.3], [-1.9, 2.1, 0.22], [-3.0, 0.9, 0.26], [-2.2, -1.6, 0.2],
        [0.6, 1.9, 0.24], [2.4, 1.3, 0.18], [1.4, -1.8, 0.22], [-0.4, 2.3, 0.26],
    ]) {
        grounded(g, { w: cw, h: 0.16, d: cw, x: cx, z: cz, ry: cx, color: BASALT_DARK, rough: 1.0 });
    }

    // The scaffold, down, and the mallet put down beside the head.
    const plank = new THREE.Group();
    plank.position.set(-2.2, 0.06, 2.6);
    plank.rotation.set(0, 0.42, 0);
    grounded(plank, { w: 3.6, h: 0.14, d: 0.55, x: 0.4, color: WOOD, rough: 0.95 });
    grounded(plank, { w: 3.2, h: 0.14, d: 0.5, x: 0.6, z: 0.68, ry: 0.1, color: WOOD, rough: 0.95 });
    g.add(plank);
    grounded(g, { w: 0.7, h: 0.55, d: 0.7, x: -3.4, z: 2.2, rz: 0.9, color: WOOD, rough: 0.95 });
    grounded(g, { w: 0.7, h: 0.16, d: 0.16, x: -2.9, z: -1.1, ry: 1.1, color: WOOD, rough: 0.95 });
    grounded(g, { w: 0.3, h: 0.26, d: 0.3, x: -2.6, z: -1.4, color: IRON, metal: 0.5, rough: 0.6 });

    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return g;
}

/** id → builder. A relic's `kind` chooses its mesh. */
export const RELIC_BUILDERS = {
    dragon: buildDragonSkeleton,
    signal_fire: buildColdSignalFire,
    survey_mast: buildSurveyMast,
    shipwreck: buildShipwreck,
    empty_throne: buildEmptyThrone,
    frozen_stride: buildFrozenStride,
    furnished_house: buildFurnishedHouse,
    unfinished_carving: buildUnfinishedCarving,
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
        // THE ONLY RELIC THAT CLAIMS AN ARCH. The dragon's ribs are an
        // invitation to walk through the animal, so their clearance is a
        // promise and `tests/qa/easter-eggs.mjs` measures it. Nothing else here
        // makes that promise - a throne, a house and a block of ice all have
        // geometry over head height and none of them are asking anybody to walk
        // under it. A probe that invents claims on a prop's behalf reports
        // failures nobody can act on, and gets ignored.
        walkUnder: RIBCAGE_X,
        label: 'the long dead thing',
        lines: [
            { speaker: 'PREDECESSOR', text: 'It came down here on its own, a long way before us. Nobody killed it. It just stopped.' },
            { speaker: 'PREDECESSOR', text: 'Take something off it. It has no use for the colour any more, and the road ahead has plenty of ways to go unnoticed.' },
        ],
    },
    spindle: {
        id: 'relic:spindle',
        kind: 'survey_mast',
        screen: 'r1c3',
        x: 0.6, z: -0.4,
        skin: 'surveyor',
        label: 'the mast that fell',
        lines: [
            { speaker: 'PREDECESSOR', text: 'They put these up to listen. Not to us — to the thing under the vaults, so somebody would know when it woke.' },
            { speaker: 'PREDECESSOR', text: 'This one is face down in the dirt, and it has been for years. So we did know. We just were not listening back.' },
        ],
    },
    sinklands: {
        id: 'relic:sinklands',
        kind: 'shipwreck',
        screen: 'r4c3',
        x: -0.5, z: 0.8,
        skin: 'landlocked',
        label: 'a ship, a long way from any water',
        lines: [
            { speaker: 'PREDECESSOR', text: 'There was water here. Not a river — the whole of it, deep enough for this.' },
            { speaker: 'PREDECESSOR', text: 'Nobody alive has seen it. The hull is the only argument left that it was ever true, and the hull is going too.' },
        ],
    },
    citadel: {
        id: 'relic:citadel',
        kind: 'empty_throne',
        screen: 'r3c4',
        x: 0.0, z: -1.2,
        skin: 'attendant',
        label: 'the seat nobody took',
        lines: [
            { speaker: 'PREDECESSOR', text: 'Everyone who came through here wanted to sit in it. I did. I stood in front of it for an hour.' },
            { speaker: 'PREDECESSOR', text: 'It is a chair. That is the joke and it is not funny: they built the approach, and the steps, and the banners, and then a chair.' },
        ],
    },
    quarry: {
        id: 'relic:quarry',
        kind: 'unfinished_carving',
        screen: 'r5c0',
        x: 1.0, z: 0.4,
        skin: 'unfinished',
        label: 'the one they stopped carving',
        lines: [
            { speaker: 'PREDECESSOR', text: 'Head and shoulders, and then nothing. The chips are still where they fell — they did not pack up, they just left.' },
            { speaker: 'PREDECESSOR', text: 'I have thought about that more than I want to. Whatever came, it came fast enough that putting the mallet down was the last thing anybody here decided.' },
        ],
    },
    bonetown: {
        id: 'relic:bonetown',
        kind: 'furnished_house',
        screen: 'r6c3',
        x: -0.4, z: 0.6,
        skin: 'tenant',
        label: 'the house with the table still laid',
        lines: [
            { speaker: 'PREDECESSOR', text: 'The roof went, so you can see straight in. Table set for two, bed made, stool knocked over on the way out.' },
            { speaker: 'PREDECESSOR', text: 'Take something. They are not using it, and you will not be either, in the end — but you will be carrying it, and that is not nothing.' },
        ],
    },
    cryomire: {
        id: 'relic:cryomire',
        kind: 'frozen_stride',
        screen: 'r4c6',
        x: 0.8, z: 0.2,
        skin: 'thaw',
        label: 'the one who stopped walking',
        lines: [
            { speaker: 'PREDECESSOR', text: 'Mid-step. Not curled up, not hiding — walking, and then not.' },
            { speaker: 'PREDECESSOR', text: 'The mire took them and the cold kept them, and between the two of them they made the only honest monument in this region.' },
        ],
    },

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
