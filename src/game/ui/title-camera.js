// @ts-check
// The title screen's key art, composed in the engine.
//
// WHAT WAS WRONG, measured rather than asserted. `docs/HOW-TO-CLOSE-THE-GAP.md`
// §4 item 3 asks for "one image" behind the menu and calls the current screen
// "text on a rendered scene". `ui/menu.js` already fixed half of it — the flat
// wash that metered L* 12.3 became a vignette, so the world is visible at all —
// and its own comment names what is left:
//
//     "the only subject in the frame (the hero, ~30px) sat dead centre
//      directly behind the 44px wordmark"
//
// Two separate faults, and neither is about art assets:
//
//  1. THE PITCH. The gameplay camera looks down at 70.7°. That is the right
//     angle to read a room from and the worst possible angle to photograph a
//     person from: a standing figure foreshortens to their own hat. The hero is
//     1.9 units tall and 18.5 units away, which is 14% of the frame's height in
//     principle and 4% in practice, because almost all of that height is
//     pointing at the lens.
//
//  2. THE PLACEMENT. The menu is a centred column. Putting the subject at frame
//     centre puts it behind the wordmark, so the one thing in the picture is
//     the one thing covered up.
//
// So this file is a second camera — not a tweak to `CameraRig`, which has a job
// and does it. It drops the pitch to `TITLE_PITCH`, closes to `TITLE_DIST`, and
// aims OFF the hero so they land in the left third, where the centred menu is
// not. Nothing about the world changes; the shot does.
//
// ── The azimuth is chosen, not assumed ─────────────────────────────────────
//
// A low camera 8 units from the hero is 8 units of somewhere. Pointed the wrong
// way it is inside a wall, or looking out of the room at the void, or has the
// hero behind a pillar. `pickAzimuth` walks candidate bearings and scores each
// one against the level's own voxel field: the lens must be in open air, the
// sight line to the hero must be clear, and — all else equal — the shot should
// look NORTH, because the fixed-yaw camera makes that the tall wall (see
// `wall-profile.js`) and a backdrop is what this shot is short of.
//
// It runs ONCE, when the title opens, and the result is held. Re-choosing every
// frame would let the composition hunt between two equally good bearings.

import * as THREE from 'three';

const DEG = Math.PI / 180;

// Scratch, so framing a title screen allocates nothing per frame.
const _p = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** How far the lens sits above the horizontal. A person, not a floor plan. */
export const TITLE_PITCH = 26 * DEG;

/**
 * Metres from the hero. Sets how much of the frame they fill.
 *
 * MEASURED with `tests/qa/title-shot.mjs`, not chosen. 7.6 put the hero at 40%
 * of the frame's height, which is a character-select screen, not key art — the
 * menu is a centred column and a subject that size crowds it. 11.5 lands
 * around 26%: unmistakably a person, still the smaller half of the picture.
 */
export const TITLE_DIST = 11.5;

/** Where the hero sits in the frame, in NDC. Left third, above the rows. */
export const TITLE_NDC_X = -0.44;
export const TITLE_NDC_Y = 0.16;

/** Amplitude and period of the drift. Zero-mean, so the shot does not wander. */
export const DRIFT_YAW = 0.075;      // radians
export const DRIFT_PERIOD = 19;      // seconds
export const DRIFT_DIST = 0.5;       // metres of push, peak to peak
export const DRIFT_DIST_PERIOD = 27; // deliberately coprime-ish with the yaw

/**
 * Height above the ROOT of the point the shot is framed around.
 *
 * THE ROOT IS THE CHEST, not the feet. Measured: the hero's body spans y
 * 1.00–2.93 with the root at 1.95. The first version of this file assumed feet
 * and used 1.1, which aimed the camera a metre ABOVE the hero's head and
 * pushed them to ndcY −0.37 — down into the menu rows, which is the exact
 * fault this file exists to fix, arrived at from the other direction.
 *
 * 0.25 is a shade above the body's centre, where a portrait is framed.
 */
export const SUBJECT_Y = 0.25;

/**
 * The title's own key light.
 *
 * MEASURED, and it is why this exists at all. With the shot composed and the
 * hero at 28% of the frame, body-vs-surround separation still ranged from L*
 * 2.2 in the Citadel — a figure that dissolves into the wall behind them — to
 * 19.3 in the Bone Forest, where a room fixture's bloom had washed them to a
 * white smear. Both are the shot inheriting whatever lighting the room happens
 * to have at whatever bearing was chosen, which is fine for a room you walk
 * through and not fine for the one frame the game opens on.
 *
 * A spot, not a directional: it is aimed AT the subject with a cone barely
 * wider than they are and a range that dies a few metres past them, so it lifts
 * the hero and leaves the room's own mood alone. It exists only while the title
 * is up.
 */
// SWEPT, not chosen — `tests/qa/_key-sweep.mjs`, four levels x five values,
// and the FIRST sweep picked the wrong number because it measured one thing.
//
// A wide cone at 480 scored separation 14 everywhere and looked worse than no
// key at all: it was pooling on the FLOOR, so the hero and the ring around them
// both went up together and the difference stayed healthy while the picture
// became a white blob with a figure somewhere in it. The metric had no way to
// say so. It now reports SPILL as well — how far the surround rose above its
// unlit value — and a good key lifts the subject without moving the room.
//
// With the cone tightened to `KEY_ANGLE` and the lamp dropped to `KEY_HEIGHT`:
//
//     intensity      0     60    120    220    400
//     overworld    5.5    9.4   14.3   19.5   22.1   sep
//                  0.0    0.4    1.0    2.0    4.0   spill
//     citadel      2.1    5.5   10.6   15.3   18.3
//                  0.0    0.1    0.5    1.1    2.2
//     cryo         6.1    8.6   13.6   16.6   17.7
//                  0.0    0.7    1.8    3.2    5.6
//     bone        20.8   21.1   21.3   21.2   20.9   (already lit by its own
//                  0.0   -0.1   -0.2   -0.1    0.4    fixture; unmoved)
//
// 220 buys 15-21 points of separation for at most 3.2 of spill. 400 buys three
// more points for double the spill, which is the wide cone's mistake again in
// miniature. Nothing clipped at any value.
const KEY_INTENSITY = 220;
const KEY_ANGLE = 0.13;       // radians, half-cone
const KEY_DISTANCE = 15;
const KEY_COLOR = 0xffe6c4;
/** Where the key sits, relative to the lens bearing: over the left shoulder. */
const KEY_YAW_OFFSET = -0.85;
const KEY_HEIGHT = 4.2;

/**
 * The title's bloom, which is not the game's bloom.
 *
 * MEASURED, and it overturned two earlier conclusions. With the shot composed,
 * the hero in the Bone Forest came back as a white smear. The first guess was a
 * room fixture; the second was this file's own key light. Toggling each in turn
 * (`tests/qa/_blob.mjs`) said neither: with bloom disabled the figure's internal
 * luminance spread went from 2.2 to 10.3 — the difference between a blob and a
 * person with dark trousers, a red tunic and a face.
 *
 * The reason is that the game's bloom is tuned against a frame where the hero is
 * THIRTY PIXELS at a 70.7° pitch. At 205 pixels and 26° the same bloom, spilling
 * off the brightest floor in the game, covers them. Sweeping the threshold:
 *
 *     threshold   0.85   1.6   2.2   3.0
 *     detail       2.2   6.0   7.5   8.2
 *
 * 2.0 sits at the knee. The trim is restored the instant the title closes, so
 * no gameplay frame is affected — and this is deliberately NOT a change to the
 * shipped bloom, which is correct for the camera it was tuned against.
 *
 * The pass is INJECTED (`setBloom`) rather than imported. `engine/renderer.js`
 * touches `window` at module scope, so importing it here would drag a browser
 * global into every headless spec that loads this file — and a spec can hand in
 * a stand-in and check the trim went on and came back off, which it could not
 * do with a module-level singleton.
 */
const TITLE_BLOOM_THRESHOLD = 2.0;
const TITLE_BLOOM_STRENGTH = 0.35;

/** How many bearings `pickAzimuth` considers. */
const CANDIDATES = 24;
/** Clearance the lens needs, in cells, before a bearing is usable. */
const LENS_CLEARANCE = 1.2;
/** Step along the sight line when testing for occlusion, in world units. */
const SIGHT_STEP = 0.25;
/** How far behind the subject a backdrop counts, in world units. */
const BACKDROP_RANGE = 26;

/**
 * Bearing, in radians, that gives the best shot of `hero` in this room.
 *
 * 0 looks north (toward -z, the tall wall); positive rotates toward +x. Returns
 * the bearing the LENS sits along, so the camera goes to
 * `hero + (sin(a), 0, cos(a)) * dist`.
 *
 * @param {{x:number, y:number, z:number}} hero
 * @param {(x:number, y:number, z:number) => boolean} solidAt
 */
export function pickAzimuth(hero, solidAt) {
    if (typeof solidAt !== 'function') return 0;
    const eyeY = hero.y + Math.sin(TITLE_PITCH) * TITLE_DIST;
    let best = null;
    for (let i = 0; i < CANDIDATES; i++) {
        // Sweep from due south (looking north) outward in both directions, so
        // ties break toward the tall wall rather than toward whichever bearing
        // happened to be tested first.
        const step = Math.ceil(i / 2) * (2 * Math.PI / CANDIDATES) * (i % 2 ? 1 : -1);
        const a = step;
        const cx = hero.x + Math.sin(a) * TITLE_DIST * Math.cos(TITLE_PITCH);
        const cz = hero.z + Math.cos(a) * TITLE_DIST * Math.cos(TITLE_PITCH);

        // The lens must be in open air, with room to drift.
        let clear = true;
        for (const [dx, dz] of [[0, 0], [LENS_CLEARANCE, 0], [-LENS_CLEARANCE, 0],
            [0, LENS_CLEARANCE], [0, -LENS_CLEARANCE]]) {
            if (solidAt(cx + dx, eyeY, cz + dz)) { clear = false; break; }
        }
        if (!clear) continue;

        // …and it must be able to SEE the hero. Marched, not assumed: a low
        // camera is exactly the height that a terrace or a kit prop occupies.
        const sy = hero.y + SUBJECT_Y;
        const dx = cx - hero.x, dy = eyeY - sy, dz = cz - hero.z;
        const len = Math.hypot(dx, dy, dz);
        let blocked = false;
        for (let t = SIGHT_STEP; t < len - SIGHT_STEP; t += SIGHT_STEP) {
            const f = t / len;
            if (solidAt(hero.x + dx * f, sy + dy * f, hero.z + dz * f)) { blocked = true; break; }
        }
        if (blocked) continue;

        // PREFER A BEARING WITH SOMETHING BEHIND THE SUBJECT.
        //
        // The first rule here was "prefer north", on the reasoning that the
        // fixed-yaw camera makes the north wall the tall one. True in a room,
        // and worth nothing in the overworld — which is the level a NEW PLAYER
        // sees, because the title opens over `progress.currentBeat` and a fresh
        // save has none. Shot there, the frame metered contrast 8 against a
        // floor of 8: a figure standing on a brown plane.
        //
        // So the score is what the lens would actually be looking AT. March
        // away from the subject along the view direction and count solid
        // samples at three heights — a wall, a cliff, a monument and a stand of
        // ruins all read as mass, and open ground reads as none. The north
        // preference stays as a tie-break, which is all it ever deserved to be.
        let mass = 0;
        for (let d = 2; d <= BACKDROP_RANGE; d += 1.5) {
            const bx = hero.x - Math.sin(a) * d;
            const bz = hero.z - Math.cos(a) * d;
            for (const h of [1.5, 3.5, 6.5]) if (solidAt(bx, hero.y + h, bz)) mass++;
        }
        const score = mass + Math.cos(a) * 0.75;
        if (!best || score > best.score) best = { a, score, mass };
    }
    return best ? best.a : 0;
}

/**
 * A composed title shot that drifts.
 *
 * Holds one chosen bearing and eases around it. `reset()` on every title open,
 * so a shot is picked from where the hero actually is rather than from where
 * they were two saves ago.
 */
export class TitleCamera {
    constructor() {
        this.t = 0;
        this.azimuth = null;
        this._heroYaw = null;
        this._key = null;
        this._keyScene = null;
        this._bloom = null;
        this._bloomPass = null;
    }

    /**
     * The post-processing bloom pass, from whoever owns the composer.
     * Optional — with none, the title simply keeps the game's bloom.
     */
    setBloom(pass) {
        this._bloomPass = pass || null;
    }

    /** Forget the chosen bearing. Call whenever the title opens. */
    reset() {
        this.t = 0;
        this.azimuth = null;
        this._heroYaw = null;
    }

    /** Put the key light in `scene`, or move the one already there. */
    _placeKey(scene, hero, yaw) {
        if (!scene) return;
        if (!this._key) {
            const spot = new THREE.SpotLight(KEY_COLOR, KEY_INTENSITY, KEY_DISTANCE, KEY_ANGLE, 0.55, 1.4);
            spot.name = 'title-key';
            spot.castShadow = false;   // the room's own key already casts
            spot.target = new THREE.Object3D();
            spot.target.name = 'title-key-target';
            this._key = spot;
        }
        if (this._keyScene !== scene) {
            this._keyScene?.remove(this._key, this._key.target);
            scene.add(this._key, this._key.target);
            this._keyScene = scene;
        }
        const a = yaw + KEY_YAW_OFFSET;
        this._key.position.set(
            hero.x + Math.sin(a) * 5,
            hero.y + KEY_HEIGHT,
            hero.z + Math.cos(a) * 5,
        );
        this._key.target.position.set(hero.x, hero.y + SUBJECT_Y, hero.z);
        this._key.target.updateMatrixWorld();
    }

    /** Take the key light back out. Called when the title closes. */
    removeKey() {
        if (this._key && this._keyScene) {
            this._keyScene.remove(this._key, this._key.target);
            this._key.dispose?.();
        }
        this._key = null;
        this._keyScene = null;
        // Give the bloom back BEFORE forgetting what it was. Dropping this
        // restore left the title's trim on every gameplay frame afterwards,
        // and the only symptom is that the whole game stops glowing — which is
        // not the kind of thing anyone traces back to a menu.
        if (this._bloom && this._bloomPass) {
            this._bloomPass.threshold = this._bloom.threshold;
            this._bloomPass.strength = this._bloom.strength;
        }
        this._bloom = null;
    }

    /**
     * Frame one moment.
     *
     * @param {number} dt
     * @param {any} camera         the live THREE camera
     * @param {{x:number,y:number,z:number}} hero  the hero's root position
     * @param {(x:number,y:number,z:number)=>boolean} [solidAt]
     * @param {{ rotation?: { y: number } }} [heroRig]  turned to face the lens
     * @param {any} [scene]  where the title's own key light is hung
     */
    update(dt, camera, hero, solidAt, heroRig, scene) {
        if (!camera || !hero) return;
        this.t += dt;
        if (this.azimuth == null) this.azimuth = pickAzimuth(hero, solidAt);

        // Zero-mean drift. A shot that creeps is a shot that is somewhere else
        // by the time a player has read the menu — and the certification gate
        // meters mean luminance, which a wandering camera would slowly change.
        const yaw = this.azimuth + Math.sin(this.t * (2 * Math.PI / DRIFT_PERIOD)) * DRIFT_YAW;
        const dist = TITLE_DIST
            + Math.sin(this.t * (2 * Math.PI / DRIFT_DIST_PERIOD)) * (DRIFT_DIST / 2);

        const flat = dist * Math.cos(TITLE_PITCH);
        const cx = hero.x + Math.sin(yaw) * flat;
        const cy = hero.y + SUBJECT_Y + dist * Math.sin(TITLE_PITCH);
        const cz = hero.z + Math.cos(yaw) * flat;
        camera.position.set(cx, cy, cz);

        // Aim OFF the subject so they land in the left third. The offsets come
        // from the LIVE camera's fov and aspect, because a shot composed for
        // 16:9 and played at 21:9 has the hero somewhere else — and this is the
        // one screen every player sees before anything else in the game.
        // AIM OFF THE SUBJECT so they land in the left third, and SOLVE for
        // it rather than deriving it.
        //
        // Two closed forms were tried and both were wrong in ways that would
        // have shipped. The first offset the look target along world-Y, which
        // at a 26° pitch is not the screen's up; the second built the camera's
        // own basis, which is right until `lookAt` re-derives the basis FROM
        // the offset target and moves it. Measured, the second delivered about
        // a third of the vertical offset it was asked for. The natural next
        // step is to scale the constant until the number comes out, and that
        // leaves the same bug calibrated to one fov and one aspect ratio — on
        // the one screen every player sees before anything else in the game.
        //
        // So: aim, project the subject through the REAL camera, and correct by
        // the error. Three passes, bounded, converging to a fiftieth of a
        // frame. It costs three matrix updates on a paused screen and it is
        // correct at any aspect ratio, which the arithmetic was not.
        const tanV = Math.tan(((camera.fov || 40) * DEG) / 2);
        const tanH = tanV * (camera.aspect || 1.78);
        const sx = hero.x, sy = hero.y + SUBJECT_Y, sz = hero.z;
        let tx = sx, ty = sy, tz = sz;
        for (let i = 0; i < 3; i++) {
            camera.lookAt(tx, ty, tz);
            camera.updateMatrixWorld();
            _p.set(sx, sy, sz).project(camera);
            const ex = TITLE_NDC_X - _p.x;
            const ey = TITLE_NDC_Y - _p.y;
            if (Math.abs(ex) < 0.002 && Math.abs(ey) < 0.002) break;
            camera.matrixWorld.extractBasis(_right, _up, _fwd);
            const kx = ex * tanH * dist;
            const ky = ey * tanV * dist;
            tx -= _right.x * kx + _up.x * ky;
            ty -= _right.y * kx + _up.y * ky;
            tz -= _right.z * kx + _up.z * ky;
        }
        camera.lookAt(tx, ty, tz);

        // Turn the hero toward the lens — three-quarter, not a passport photo.
        // Cosmetic only: the title is paused, and `index.js` restores the pose
        // the moment a run starts.
        if (heroRig?.rotation) {
            if (this._heroYaw == null) this._heroYaw = heroRig.rotation.y;
            heroRig.rotation.y = yaw + 0.42;
        }

        this._placeKey(scene, hero, yaw);

        const bp = this._bloomPass;
        if (!this._bloom && bp) {
            this._bloom = { threshold: bp.threshold, strength: bp.strength };
            bp.threshold = TITLE_BLOOM_THRESHOLD;
            bp.strength = TITLE_BLOOM_STRENGTH;
        }
    }

    /** The pose the hero had before the shot turned them, and the key light out. */
    restoreHero(heroRig) {
        if (heroRig?.rotation && this._heroYaw != null) heroRig.rotation.y = this._heroYaw;
        this._heroYaw = null;
        this.removeKey();
    }
}
