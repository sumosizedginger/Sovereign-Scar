// The game's sound bank.
//
// The frozen kit's `sfx` object is a set of generic primitives — a kick, a
// whoosh, a clang — shared by any game built on the engine. That is the right
// scope for a kit and the wrong scope for a finished game, and the gaps showed:
// all five weapons swung with one sound, every pickup from a shard to a heart
// container played the same chime, and a PARRY was acoustically identical to a
// failed block. The single most skilful thing the player can do sounded exactly
// like the most routine.
//
// Three rules everything here follows:
//
// 1. LAYER. A real impact is a transient (the click of contact), a body (what
//    was struck), and a tail (the room). One oscillator is a beep; three
//    layers is a sound.
// 2. VARY. Every call detunes itself a little. Identical repetition is what
//    makes a sound fatiguing after the fiftieth time, and in a game about
//    swinging a sword the fiftieth time arrives in the first minute.
// 3. SAY WHAT HAPPENED. Sounds that mean different things must not share a
//    voice. Blocked, parried, armoured, and killed are four different outcomes
//    and the player should be able to hear which one occurred with their eyes
//    shut.

import { audioCtx, channelGain } from '../../audio/synth.js';

let bus = null;

/** Shared SFX bus with a short room reverb, so effects sit in the same space. */
function ensureBus() {
    if (bus || !audioCtx) return bus;
    const out = audioCtx.createGain();
    out.gain.value = 1;
    out.connect(audioCtx.destination);

    const dry = audioCtx.createGain();
    dry.gain.value = 1;
    dry.connect(out);

    // Small, bright room — long enough to glue, short enough that rapid combat
    // does not turn into a wash.
    const conv = audioCtx.createConvolver();
    const rate = audioCtx.sampleRate;
    const len = Math.floor(rate * 0.9);
    const buf = audioCtx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4.2);
    }
    conv.buffer = buf;
    const wet = audioCtx.createGain();
    wet.gain.value = 0.5;
    conv.connect(wet); wet.connect(out);
    const send = audioCtx.createGain();
    send.gain.value = 1;
    send.connect(conv);

    bus = { out, dry, send };
    return bus;
}

const now = () => (audioCtx ? audioCtx.currentTime : 0);
const rand = (a, b) => a + Math.random() * (b - a);
/** Semitone offset → frequency multiplier, for per-call detune. */
const cents = (n) => Math.pow(2, n / 12);

function gainNode(peak, when, dur, attack = 0.002, verb = 0.18) {
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * channelGain('sfx')), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const b = ensureBus();
    g.connect(b.dry);
    if (verb > 0) {
        const s = audioCtx.createGain();
        s.gain.value = verb;
        g.connect(s); s.connect(b.send);
    }
    return g;
}

/** A pitched layer: oscillator gliding f0 → f1. */
function tone(type, f0, f1, dur, peak, when = now(), verb = 0.18, attack = 0.002) {
    if (!audioCtx) return;
    const g = gainNode(peak, when, dur, attack, verb);
    const o = audioCtx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, when);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), when + dur);
    o.connect(g);
    o.start(when);
    o.stop(when + dur + 0.03);
}

/** A noise layer through a filter — the transient and the texture. */
function noise(dur, peak, filterType, f0, f1, q = 1, when = now(), verb = 0.18) {
    if (!audioCtx) return;
    const g = gainNode(peak, when, dur, 0.001, verb);
    const len = Math.max(1, Math.ceil(audioCtx.sampleRate * dur));
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const f = audioCtx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, when);
    if (f1 != null && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
    src.connect(f); f.connect(g);
    src.start(when);
}

/** A short melodic figure — used for the chimes that mark progress. */
function arp(notes, step, type = 'triangle', peak = 0.16, verb = 0.4) {
    const t0 = now();
    notes.forEach((f, i) => tone(type, f, f, step * 2.2, peak, t0 + i * step, verb, 0.004));
}

// ── Combat ─────────────────────────────────────────────────────────────────

/**
 * Weapon swings. Each weapon gets its own weight and timbre, because the
 * player switches between them constantly and the sound is the fastest
 * confirmation of which one is equipped.
 */
const SWINGS = {
    bare_strike: () => {
        noise(0.11, 0.16, 'bandpass', 900, 2200, 1.2);
    },
    anchor_link: () => {
        const k = cents(rand(-1, 1));
        noise(0.16, 0.2, 'bandpass', 500 * k, 1800 * k, 1.6);
        tone('triangle', 420 * k, 190 * k, 0.1, 0.1);
    },
    tectonic_wedge: () => {
        // Heavy and low: this one should sound like it costs something to lift.
        const k = cents(rand(-1, 1));
        noise(0.3, 0.28, 'lowpass', 1400 * k, 260 * k, 0.9);
        tone('sawtooth', 180 * k, 60 * k, 0.24, 0.16, now(), 0.25);
    },
    heavy_mallet: () => {
        const k = cents(rand(-1, 1));
        noise(0.34, 0.3, 'lowpass', 900 * k, 160 * k, 0.8);
        tone('sine', 120 * k, 44 * k, 0.3, 0.22, now(), 0.25);
    },
    light_caster: () => {
        // No arc, so no whoosh. A ray should sound electrical, not physical.
        const k = cents(rand(-0.5, 0.5));
        tone('sawtooth', 1800 * k, 620 * k, 0.16, 0.1, now(), 0.3);
        tone('sine', 3400 * k, 1200 * k, 0.12, 0.05);
        noise(0.1, 0.07, 'highpass', 3000, 6000, 0.7);
    },
};

export function attack(weaponId = 'anchor_link') {
    (SWINGS[weaponId] || SWINGS.anchor_link)();
}

/** The sword connected with something soft. */
export function hitFlesh() {
    const k = cents(rand(-2, 2));
    noise(0.09, 0.26, 'lowpass', 1100 * k, 300 * k, 0.9);
    tone('sine', 190 * k, 70 * k, 0.13, 0.24);
}

/** The sword connected with a plate and did nothing. Deliberately unrewarding. */
export function hitArmor() {
    const k = cents(rand(-2, 2));
    noise(0.13, 0.24, 'bandpass', 2600 * k, 1500 * k, 4.5, now(), 0.34);
    tone('square', 780 * k, 640 * k, 0.11, 0.1);
    tone('square', 1170 * k, 980 * k, 0.09, 0.05);
}

/** Guard held, hit absorbed. Dull and wooden — you took it, you did not beat it. */
export function guardBlock() {
    const k = cents(rand(-1.5, 1.5));
    noise(0.1, 0.22, 'bandpass', 900 * k, 420 * k, 2.2);
    tone('triangle', 300 * k, 180 * k, 0.1, 0.14);
}

/**
 * PARRY. The best sound in the game, and it has to be, because it is the
 * reward for the hardest timing the player is asked for. Bright metallic ring,
 * then a rising perfect fifth — the interval the ear reads as "yes".
 *
 * It previously shared `sfx.block()` with a failed block, which meant the game
 * gave identical feedback for its most and least skilful outcomes.
 */
export function parry() {
    const t = now();
    noise(0.06, 0.3, 'highpass', 4200, 8000, 0.8, t, 0.5);
    // The strike itself: an inharmonic metal partial pair.
    tone('square', 1480, 1480, 0.5, 0.14, t, 0.6, 0.001);
    tone('sine', 2217, 2217, 0.42, 0.08, t, 0.6, 0.001);
    // ...resolving up a fifth. Short, so it reads as punctuation, not a jingle.
    tone('triangle', 988, 988, 0.16, 0.12, t + 0.03, 0.5, 0.004);
    tone('triangle', 1480, 1480, 0.3, 0.13, t + 0.11, 0.6, 0.004);
}

/** Guard broken — poise gone. Ugly, low, and final. */
export function guardBreak() {
    const t = now();
    noise(0.5, 0.34, 'lowpass', 2200, 200, 1.1, t, 0.4);
    tone('sawtooth', 260, 48, 0.5, 0.24, t, 0.35);
    tone('square', 130, 60, 0.42, 0.12, t + 0.02);
}

export function guardUp() {
    noise(0.09, 0.1, 'bandpass', 1600, 2400, 3.2, now(), 0.2);
    tone('triangle', 520, 660, 0.07, 0.05);
}

export function guardDown() {
    noise(0.07, 0.06, 'bandpass', 1800, 1100, 3.0, now(), 0.15);
}

/** An enemy died. A short descending figure — something stopped. */
export function enemyDie() {
    const k = cents(rand(-2, 2));
    const t = now();
    noise(0.22, 0.2, 'lowpass', 1600 * k, 250 * k, 0.9, t, 0.3);
    tone('triangle', 400 * k, 120 * k, 0.24, 0.16, t, 0.35);
    tone('sine', 600 * k, 180 * k, 0.2, 0.08, t + 0.03, 0.35);
}

// ── Targeting ──────────────────────────────────────────────────────────────

/** Lock acquired — a clean two-note click up. */
export function lockOn() {
    const t = now();
    tone('square', 880, 880, 0.05, 0.07, t, 0.25, 0.001);
    tone('square', 1320, 1320, 0.08, 0.06, t + 0.045, 0.3, 0.001);
}

/** Lock released — the same figure inverted, so the pair is unmistakable. */
export function lockOff() {
    const t = now();
    tone('square', 1320, 1320, 0.05, 0.05, t, 0.2, 0.001);
    tone('square', 880, 880, 0.07, 0.045, t + 0.04, 0.25, 0.001);
}

// ── Movement ───────────────────────────────────────────────────────────────

/**
 * Footsteps, by surface. Varied per call in both pitch and level — regular
 * identical footsteps are one of the fastest ways to make a game feel cheap.
 */
export function footstep(surface = 'stone') {
    const k = cents(rand(-3, 3));
    const v = rand(0.7, 1);
    if (surface === 'bone') {
        noise(0.07, 0.1 * v, 'bandpass', 1700 * k, 900 * k, 2.4, now(), 0.22);
        tone('triangle', 260 * k, 150 * k, 0.06, 0.05 * v);
    } else if (surface === 'water') {
        noise(0.14, 0.11 * v, 'bandpass', 700 * k, 2400 * k, 1.1, now(), 0.3);
    } else if (surface === 'metal') {
        noise(0.08, 0.09 * v, 'bandpass', 2600 * k, 1600 * k, 3.4, now(), 0.3);
        tone('square', 620 * k, 500 * k, 0.05, 0.03 * v);
    } else {
        noise(0.06, 0.1 * v, 'lowpass', 900 * k, 300 * k, 0.9, now(), 0.16);
        tone('sine', 120 * k, 78 * k, 0.06, 0.07 * v, now(), 0.1);
    }
}

export function dash() {
    const k = cents(rand(-1, 1));
    noise(0.22, 0.2, 'bandpass', 500 * k, 1900 * k, 1.1, now(), 0.3);
    tone('sine', 320 * k, 110 * k, 0.16, 0.1);
}

export function land(hard = false) {
    const k = cents(rand(-2, 2));
    noise(0.16, hard ? 0.26 : 0.14, 'lowpass', 700 * k, 140 * k, 0.9);
    tone('sine', 130 * k, 48 * k, hard ? 0.22 : 0.13, hard ? 0.26 : 0.14);
}

// ── Grapple ────────────────────────────────────────────────────────────────

export function grappleFire() {
    const t = now();
    noise(0.16, 0.16, 'bandpass', 1200, 3200, 1.6, t, 0.25);
    tone('sawtooth', 300, 900, 0.14, 0.09, t, 0.2);
}

/** Hook bit. Metal on stone, with a taut ring. */
export function grappleHit() {
    const t = now();
    noise(0.09, 0.24, 'bandpass', 2800, 1400, 4.0, t, 0.4);
    tone('square', 1100, 1100, 0.18, 0.09, t, 0.45, 0.001);
    tone('triangle', 1650, 1500, 0.14, 0.05, t + 0.01, 0.4);
}

/** The pull — a rising tension, the sound of being reeled in. */
export function grapplePull() {
    const t = now();
    tone('sawtooth', 150, 420, 0.34, 0.1, t, 0.3, 0.02);
    noise(0.3, 0.1, 'bandpass', 600, 1800, 2.0, t, 0.3);
}

// ── Pickups and progress ───────────────────────────────────────────────────

/** Shards — tiny, frequent, must never become annoying. */
export function shardGet() {
    const k = cents(rand(-1, 3));
    tone('triangle', 1200 * k, 1600 * k, 0.07, 0.055, now(), 0.25, 0.002);
}

export function heartGet() {
    arp([660, 880, 1320], 0.06, 'triangle', 0.13, 0.35);
}

export function keyGet() {
    const t = now();
    noise(0.06, 0.14, 'bandpass', 3000, 2000, 4.0, t, 0.35);
    arp([784, 1046], 0.075, 'square', 0.1, 0.4);
}

/** A Scar Suture — a heart piece. This has to feel like it was worth finding. */
export function sutureGet() {
    arp([523, 659, 784, 1046], 0.085, 'triangle', 0.14, 0.5);
}

/** The Zelda chime: you found a secret. Four notes, unmistakable, iconic shape. */
export function secretFound() {
    arp([1046, 1318, 1568, 2093], 0.1, 'square', 0.12, 0.55);
}

/** A real item — a weapon, a tool. The biggest non-boss moment in the game. */
export function itemGet() {
    const t = now();
    tone('sawtooth', 110, 110, 0.9, 0.06, t, 0.5, 0.15);
    arp([523, 784, 1046, 1318, 1568], 0.11, 'triangle', 0.15, 0.55);
}

// ── World ──────────────────────────────────────────────────────────────────

export function doorOpen() {
    const t = now();
    noise(0.55, 0.2, 'lowpass', 900, 180, 0.8, t, 0.45);
    tone('sawtooth', 90, 55, 0.5, 0.12, t, 0.4, 0.05);
}

/** Locked. A refusal has to sound like a refusal, or the player retries forever. */
export function doorLocked() {
    const t = now();
    noise(0.08, 0.2, 'bandpass', 1400, 700, 3.0, t, 0.25);
    tone('square', 200, 170, 0.12, 0.1, t);
}

export function bossDoor() {
    const t = now();
    tone('sawtooth', 70, 46, 1.1, 0.2, t, 0.6, 0.06);
    noise(0.9, 0.2, 'lowpass', 700, 120, 0.8, t, 0.55);
    tone('square', 140, 92, 0.8, 0.07, t + 0.05, 0.5);
}

/**
 * Low health. A heartbeat, not a beep — it carries the same information and
 * raises tension instead of just nagging.
 */
export function lowHealth() {
    const t = now();
    tone('sine', 78, 46, 0.16, 0.24, t, 0.2, 0.004);
    tone('sine', 70, 42, 0.2, 0.17, t + 0.21, 0.2, 0.004);
}

// ── Menus ──────────────────────────────────────────────────────────────────

export function menuMove() {
    tone('square', 660, 660, 0.035, 0.05, now(), 0.1, 0.001);
}

export function menuConfirm() {
    const t = now();
    tone('square', 880, 880, 0.04, 0.06, t, 0.15, 0.001);
    tone('square', 1320, 1320, 0.07, 0.05, t + 0.04, 0.2, 0.001);
}

export function menuBack() {
    const t = now();
    tone('square', 660, 660, 0.04, 0.05, t, 0.15, 0.001);
    tone('square', 440, 440, 0.07, 0.04, t + 0.04, 0.2, 0.001);
}

/** Everything, as one object, mirroring the kit's `sfx` shape. */
export const gsfx = {
    attack, hitFlesh, hitArmor, guardBlock, parry, guardBreak, guardUp, guardDown,
    enemyDie, lockOn, lockOff, footstep, dash, land,
    grappleFire, grappleHit, grapplePull,
    shardGet, heartGet, keyGet, sutureGet, secretFound, itemGet,
    doorOpen, doorLocked, bossDoor, lowHealth,
    menuMove, menuConfirm, menuBack,
};

/** Test seam. */
export function _sfxBus() { return bus; }
