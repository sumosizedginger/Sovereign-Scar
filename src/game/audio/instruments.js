// Synth voices for the score engine.
//
// Every voice takes an absolute `when` in AudioContext time and schedules
// itself, rather than playing "now". That distinction is the whole reason the
// music holds together: the previous bed ticked a note from the render loop, so
// its rhythm inherited every frame hitch and dropped frame the renderer had.
// Notes scheduled ahead on the audio clock are sample-accurate and completely
// immune to what the GPU is doing.
//
// All voices route to buses supplied by score.js — dry, reverb send, delay
// send — so reverb is shared rather than per-note, which is both cheaper and
// the reason the parts sound like they are in one room together.
//
// The AudioContext arrives as `buses.ctx` rather than being imported. That is
// not indirection for its own sake: it is what lets the score be rendered into
// an OfflineAudioContext and measured. A voice that reaches for a module-level
// live context can only ever be verified by listening to it.

/** ADSR-ish envelope. Exponential release, because linear fades sound abrupt. */
function env(gain, when, dur, peak, attack = 0.01, decay = null) {
    const g = gain.gain;
    const a = Math.max(0.002, attack);
    g.setValueAtTime(0.0001, when);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + a);
    if (decay != null) {
        g.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.55), when + a + decay);
    }
    g.exponentialRampToValueAtTime(0.0001, when + dur);
}

function connectOut(node, buses, sendReverb = 0.3, sendDelay = 0) {
    const ctx = buses.ctx;
    node.connect(buses.dry);
    if (sendReverb > 0 && buses.reverbSend) {
        const s = ctx.createGain();
        s.gain.value = sendReverb;
        node.connect(s);
        s.connect(buses.reverbSend);
    }
    if (sendDelay > 0 && buses.delaySend) {
        const s = ctx.createGain();
        s.gain.value = sendDelay;
        node.connect(s);
        s.connect(buses.delaySend);
    }
}

/**
 * Chord articulation — the harmony as something *played*, not as a bed.
 *
 * This replaced a sustained pad, and the replacement is the entire point of the
 * revision. The pad held each chord for a full bar with a one-second attack,
 * overlapped into the next bar, and fed a three-second reverb: which is a drone
 * with chord changes in it. There was never a moment of silence for the melody
 * to sit in front of, so the ear heard a wash and filed the tune as part of it.
 *
 * A chord with a hard attack and a short tail states the harmony and then gets
 * out of the way. The gaps are not an absence of music — they are what makes
 * the melody legible as melody.
 *
 * The detune is still the point. A single saw is a buzz; two of them a few
 * cents apart beat against each other and become a chord-sized sound. The
 * filter envelope opening bright and closing as it decays is what makes that
 * pair read as a struck string rather than as an organ stop being held down.
 */
export function compVoice(buses, when, freq, dur, peak = 0.05, cutoff = 2400) {
    const ctx = buses.ctx;
    const out = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cutoff, when);
    filt.frequency.exponentialRampToValueAtTime(
        Math.max(220, cutoff * 0.2), when + Math.max(0.05, dur * 0.8));
    filt.Q.value = 1.0;
    for (const cents of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        o.detune.value = cents;
        o.connect(filt);
        o.start(when);
        o.stop(when + dur + 0.05);
    }
    filt.connect(out);
    env(out, when, dur, peak, 0.008, dur * 0.25);
    connectOut(out, buses, 0.28, 0.12);
}

/**
 * Bass — sine fundamental plus a quiet triangle octave for definition.
 *
 * Called with a short `dur`. A sine held under the whole bar is a hum by any
 * other name, and the lowest voice is the one that gets away with it longest
 * because the ear stops hearing it as a note and starts hearing it as the room.
 */
export function bassVoice(buses, when, freq, dur, peak = 0.16) {
    const ctx = buses.ctx;
    const out = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(out);
    o.start(when);
    o.stop(when + dur + 0.05);
    // Pure sine disappears on laptop speakers, which cannot reproduce the
    // fundamental at all. The octave above is what those speakers actually
    // play, and the ear infers the missing root from it.
    const h = ctx.createOscillator();
    const hg = ctx.createGain();
    h.type = 'triangle';
    h.frequency.value = freq * 2;
    hg.gain.value = 0.28;
    h.connect(hg); hg.connect(out);
    h.start(when);
    h.stop(when + dur + 0.05);
    env(out, when, dur, peak, 0.012, dur * 0.3);
    connectOut(out, buses, 0.12, 0);
}

/** Plucked arpeggio note — triangle with a fast decay and a bright transient. */
export function pluckVoice(buses, when, freq, dur, peak = 0.09) {
    const ctx = buses.ctx;
    const out = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq * 6, when);
    filt.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.5), when + dur * 0.7);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(filt); filt.connect(out);
    o.start(when);
    o.stop(when + dur + 0.05);
    env(out, when, dur, peak, 0.004);
    connectOut(out, buses, 0.35, 0.28);
}

/**
 * Lead melody — a soft square with vibrato that arrives slightly late.
 *
 * The delayed vibrato is doing real work: a note that wobbles from its first
 * instant sounds synthetic, while one that starts pure and develops vibrato as
 * it sustains is what a played instrument does.
 */
export function leadVoice(buses, when, freq, dur, peak = 0.08) {
    const ctx = buses.ctx;
    const out = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = Math.max(1200, freq * 4);
    filt.Q.value = 1.1;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.2;
    lfoGain.gain.setValueAtTime(0.0001, when);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.008, when + Math.min(0.35, dur * 0.6));
    lfo.connect(lfoGain); lfoGain.connect(o.frequency);
    lfo.start(when); lfo.stop(when + dur + 0.05);

    o.connect(filt); filt.connect(out);
    o.start(when);
    o.stop(when + dur + 0.05);
    env(out, when, dur, peak, 0.03, dur * 0.4);
    connectOut(out, buses, 0.45, 0.35);
}

/** Bell / glass accent — two-partial FM-ish tone for punctuation. */
export function bellVoice(buses, when, freq, dur, peak = 0.05) {
    const ctx = buses.ctx;
    const out = ctx.createGain();
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    mod.type = 'sine';
    mod.frequency.value = freq * 2.76; // inharmonic ratio — this is what reads as "metal"
    modGain.gain.setValueAtTime(freq * 1.4, when);
    modGain.gain.exponentialRampToValueAtTime(1, when + dur * 0.5);
    mod.connect(modGain); modGain.connect(carrier.frequency);
    carrier.connect(out);
    mod.start(when); mod.stop(when + dur + 0.05);
    carrier.start(when); carrier.stop(when + dur + 0.05);
    env(out, when, dur, peak, 0.003);
    connectOut(out, buses, 0.7, 0.4);
}

/** Kick — pitch-swept sine, the standard and still the best way to build one. */
export function kickVoice(buses, when, peak = 0.5) {
    const ctx = buses.ctx;
    const out = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    o.connect(out);
    o.start(when); o.stop(when + 0.3);
    env(out, when, 0.28, peak, 0.002);
    connectOut(out, buses, 0.06, 0);
}

function noiseSource(ctx, when, dur) {
    const len = Math.max(1, Math.ceil(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.start(when);
    return src;
}

/** Hat — short filtered noise. */
export function hatVoice(buses, when, peak = 0.1, open = false) {
    const ctx = buses.ctx;
    const dur = open ? 0.16 : 0.045;
    const out = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7000;
    const src = noiseSource(ctx, when, dur + 0.02);
    src.connect(filt); filt.connect(out);
    env(out, when, dur, peak, 0.001);
    connectOut(out, buses, 0.18, 0);
}

/** Snare / rim — noise plus a tuned body. */
export function snareVoice(buses, when, peak = 0.22) {
    const ctx = buses.ctx;
    const out = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1900;
    filt.Q.value = 0.8;
    const src = noiseSource(ctx, when, 0.2);
    src.connect(filt); filt.connect(out);
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(220, when);
    body.frequency.exponentialRampToValueAtTime(140, when + 0.09);
    bg.gain.value = 0.4;
    body.connect(bg); bg.connect(out);
    body.start(when); body.stop(when + 0.2);
    env(out, when, 0.17, peak, 0.001);
    connectOut(out, buses, 0.3, 0);
}

/**
 * Low tom / taiko — the boss layer's heartbeat.
 * Deliberately not a kick: it has pitch, so a run of them reads as a phrase
 * rather than as a metronome.
 */
export function tomVoice(buses, when, freq = 90, peak = 0.32) {
    const ctx = buses.ctx;
    const out = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.7, when);
    o.frequency.exponentialRampToValueAtTime(freq, when + 0.16);
    o.connect(out);
    o.start(when); o.stop(when + 0.45);
    const src = noiseSource(ctx, when, 0.06);
    const nf = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    nf.type = 'lowpass'; nf.frequency.value = 1200;
    ng.gain.value = 0.25;
    src.connect(nf); nf.connect(ng); ng.connect(out);
    env(out, when, 0.4, peak, 0.002);
    connectOut(out, buses, 0.25, 0);
}
