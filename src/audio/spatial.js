// Where a sound came from.
//
// THE PROBLEM. Every sound in this game played dead centre. In a top-down game
// the threat that matters most is usually the one you are not looking at, and
// it announces itself with a wind-up whoosh — from a boss winding up at the
// left edge of the frame, an enemy committing behind you, a door grinding open
// off-screen. All of that arrived in both ears equally, so the one piece of
// information the sound was carrying — WHICH WAY — was thrown away at the
// mixer. Stereo placement here is not polish. It is the difference between a
// cue you can act on and a noise that tells you something happened somewhere.
//
// HOW IT IS WIRED. Two things must be true for a sound to be placed:
//
//   1. a listener exists (the game loop pushes the camera's focus each frame);
//   2. the call is inside an `at()` scope naming a world position.
//
// Outside an `at()` scope — the player's own sword, menus, UI, music, the
// low-health heartbeat — `spatialize()` hands back the destination unchanged
// and not one node is added to the graph. That is deliberate: unplaced is the
// default, and it costs nothing. It also means every existing test and the
// offline score render behave exactly as they did.
//
// WHY A SCOPE AND NOT A PARAMETER. The alternative was threading an `at`
// argument through `sfx.whoosh()`, `playTone()`, `playNoise()`, `gainNode()`
// and the fourteen roster call sites that build boss actions. A scope costs one
// wrapper at the call site, changes no signatures, and — the reason that
// actually decided it — lets `BossBase` and `Enemy` place the sounds of every
// subclass from ONE place in the framework, so a boss author cannot forget to.
//
// WHY NOT A STICKY GLOBAL. A "set the source, play the sound" pair leaks the
// moment anything throws or returns early between them, and the failure mode is
// silent: every subsequent sound in the frame pans to a stale corpse. `at()`
// restores in a `finally`, so there is no arrangement of exceptions that leaves
// a source set.
//
// WHAT IS DELIBERATELY NOT PLACED, so the next reader knows it was a decision.
// Doors, pickups, and the player's own swing/dash/guard all fire while the
// player is standing on top of them, which is the middle of the frame — placing
// them would build a panner per sound to pan it to roughly zero. The one honest
// candidate is the seal-break `doorOpen` in `room-graph.js`, which is a door
// somewhere else in the room grinding open; it has no door object in scope at
// that point, and plumbing one through for a single cue was not worth it.
//
// MONO. `monoAudio` collapses the pan to centre while keeping the distance
// rolloff, and it exists because this game's own owner hears in one ear. For
// them the feature above is not an enhancement, it is a subtraction: measured
// at PAN_LIMIT, the far channel carries about -22dB, so a wind-up panned to the
// deaf side is not "harder to place", it is silent. The rolloff is deliberately
// NOT disabled — loudness carries distance perfectly well in one channel, so a
// mono player keeps half the information rather than none.
//
// THE COORDINATE ASSUMPTION, stated so it can be checked. `CameraRig` is a
// fixed top-down follow rig: it sets the camera at (x, y+H, z+B) looking at
// (x, lookY, z) and never rotates about Y. Camera-right is therefore world +X,
// always, and a pan can be read straight off the X difference. IF THE CAMERA
// EVER ROTATES, this is wrong and needs a real right-vector from the rig — the
// spec pins the assumption so that change cannot land quietly.

import { getSetting } from '../engine/settings.js';

/** Listener: the point the frame is centred on, and how wide the frame is. */
let listener = null;    // { x, z, halfWidth }
/** The source currently being placed, or null. Only ever set inside `at()`. */
let source = null;      // { x, z }
// True while a `silenced()` scope is running — see below. Dormant bosses tick
// inside one, so they keep their state without being heard across the dungeon.
let muted = false;

/**
 * Hard-pan limit.
 *
 * Not 1. A fully-panned sound is silent in one ear, which on headphones stops
 * reading as "over there" and starts reading as "broken" — it detaches from the
 * picture entirely. 0.85 is unmistakably directional and still in the head.
 */
export const PAN_LIMIT = 0.85;

/**
 * Quietest a placed sound may get, as a fraction of its unplaced level.
 *
 * The rolloff exists to give distance a voice, NOT to hide things. An enemy
 * committing just off-screen is precisely the sound the player most needs, so
 * the floor is high on purpose: far away is quieter, never inaudible. Tuning
 * this down is how you would accidentally delete the feature while the spec
 * still passes.
 */
export const MIN_DISTANCE_GAIN = 0.35;

/**
 * Set the listener. Called once per frame from the game loop with the camera's
 * focus point and the half-width of the frame at that distance.
 * Pass null to clear (menus, level load) — sounds then play centred.
 */
export function setListener(x, z, halfWidth) {
    if (x == null || !Number.isFinite(x) || !Number.isFinite(z)
        || !Number.isFinite(halfWidth) || halfWidth <= 0) {
        listener = null;
        return;
    }
    listener = { x, z, halfWidth };
}

/** Drop the listener — everything plays centred again. */
export function clearListener() {
    listener = null;
}

/** Current listener, or null. Test seam. */
export function getListener() {
    return listener;
}

/**
 * Play everything `fn` starts as coming from world position `pos`.
 *
 * `pos` is anything with `.x` and `.z` — a THREE.Vector3, a plain object. Nests
 * safely (the inner scope wins, the outer is restored), and restores in a
 * `finally` so a throwing sound cannot poison the rest of the frame.
 *
 * @returns whatever `fn` returned, so this can wrap an expression.
 */
export function at(pos, fn) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return fn();
    const prev = source;
    source = { x: pos.x, z: pos.z };
    try {
        return fn();
    } finally {
        source = prev;
    }
}

/**
 * Run `fn` with everything it plays dropped on the floor.
 *
 * THE BUG THIS EXISTS FOR. The owner, standing still in the ENTRANCE room of
 * 04 Sky Monument at 6/6 hearts with nothing on screen: "it's like a sound of
 * being hit, doot doot doot even while standing still ... nothing hitting me,
 * nothing exploding, nothing giving any sign of what is causing me harm."
 *
 * Measured, 18 seconds, no input: five `sfx.block()` at 3.31s, 4.56s, 9.47s,
 * 13.21s and 15.62s, all from `KineticCore.tickAI` — the beat-04 boss, bouncing
 * around its arena in a room the player had never entered, playing the metal
 * guard-clang off every wall it hit.
 *
 * `bosses/base.js` already computed whether a boss is `awake`, and then still
 * called `boss.update(dt, awake ? game.player : null, game)` — so a dormant
 * boss kept moving and kept making noise, and only its TARGETING went blind.
 * The guard existed and guarded the wrong half.
 *
 * This is a scope rather than a flag on the boss because the sound is five
 * `sfx.*` calls deep inside one subclass's AI, and there are fourteen bosses.
 * Every voice in the game already routes through `spatialize`, so silencing
 * the scope is one place instead of a call site per sound per boss.
 */
export function silenced(fn) {
    const prev = muted;
    muted = true;
    try {
        return fn();
    } finally {
        muted = prev;
    }
}

/** Test seam: is sound currently being dropped? Must be false between frames. */
export function _isMuted() {
    return muted;
}

/** `at()` for loose coordinates. */
export function atXZ(x, z, fn) {
    return at({ x, z }, fn);
}

/**
 * The pan and gain the current scope resolves to, or null if unplaced.
 *
 * pan  — signed X offset in frame half-widths, clamped and limited. A source at
 *        the edge of the frame reads fully to that side; beyond it, no further.
 * gain — inverse-square-ish rolloff normalised so the listener's own position is
 *        unity, resting on MIN_DISTANCE_GAIN rather than falling to zero.
 */
export function placement() {
    if (!source || !listener) return null;
    const dx = source.x - listener.x;
    const dz = source.z - listener.z;
    const half = listener.halfWidth;
    const pan = getSetting('monoAudio')
        ? 0
        : Math.max(-1, Math.min(1, dx / half)) * PAN_LIMIT;
    const d = Math.hypot(dx, dz) / half;
    const gain = MIN_DISTANCE_GAIN + (1 - MIN_DISTANCE_GAIN) / (1 + d * d);
    return { pan, gain };
}

/**
 * The node a voice should connect into so it lands where the scope says.
 *
 * Returns `dest` itself when there is nothing to place — no scope, no listener,
 * or a context with no StereoPanner (older Safari, some OfflineAudioContexts).
 * Callers therefore never branch:
 *
 *     osc.connect(spatialize(ctx, bus.dry));
 *
 * The gain node is only inserted when it would actually do something, so a
 * source standing on the listener adds exactly one node, not two.
 */
export function spatialize(ctx, dest) {
    // A SILENCED SCOPE DROPS THE VOICE ENTIRELY, and it has to be checked
    // BEFORE `placement()` — an unplaced sound returns `dest` untouched below,
    // at full volume, which is precisely how a boss two rooms away was heard.
    // Distance cannot solve it either: `MIN_DISTANCE_GAIN` is 0.35, so even a
    // correctly placed source on the far side of the dungeon still arrives at
    // a third of full volume. "Far away" and "not happening" are different
    // questions and only the second one is being asked here.
    if (muted) {
        if (!ctx) return dest;
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(dest);
        return g;
    }
    const p = placement();
    if (!p || !ctx) return dest;

    // A pan of exactly zero needs no panner — that covers both a source
    // directly ahead and, more importantly, every sound while `monoAudio` is
    // on, so the mono path cannot put signal in one channel even by accident.
    let head = dest;
    if (p.pan !== 0 && typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = p.pan;
        panner.connect(dest);
        head = panner;
    }
    if (p.gain > 0.999) return head;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    g.connect(head);
    return g;
}

/** Test seam: is a source currently in scope? Must be false between frames. */
export function _currentSource() {
    return source;
}
