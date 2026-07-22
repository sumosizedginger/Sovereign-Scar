// src/audio/synth.js
// Purpose: Web Audio synthesis primitives + sfx object (verbatim from original).
// Dependencies: none

let audioCtx = null;
let noiseBuf = null;

/** Creates the AudioContext + noise buffer. Idempotent. Call from a user gesture (browsers require one). */
export function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const len = (audioCtx.sampleRate * 0.6) | 0;
    noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

// ── Volume channels (Phase 3): master × (sfx | music). mapping.js keeps
//    these synced with the settings module; synth stays dependency-free. ──
const _vols = { master: 1, sfx: 1, music: 1 };

/** Merge {master?, sfx?, music?} into the volume state; playTone/playNoise multiply their vol by master*channel. */
export function setVolumes(v) {
    Object.assign(_vols, v);
}

function gainFor(channel) {
    return _vols.master * (_vols[channel] != null ? _vols[channel] : 1);
}

/**
 * SS-027 (additive): the effective gain for a channel, so a consumer that
 * builds its own audio graph — the game-side score engine, which needs a
 * persistent bus rather than one-shot nodes — can honour the same master and
 * per-channel volumes without reaching into `_vols`.
 */
export function channelGain(channel = 'sfx') {
    return gainFor(channel);
}

/** An oscillator gliding f0->f1 over dur seconds while gain decays to ~0; optional lowpass at lp Hz. No-ops before initAudio(). */
export function playTone(type, f0, f1, dur, vol, lp, channel = 'sfx') {
    if (!audioCtx) return;
    vol = vol * gainFor(channel);
    if (vol <= 0.0005) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (lp) {
        const fl = audioCtx.createBiquadFilter();
        fl.type = 'lowpass';
        fl.frequency.setValueAtTime(lp, t);
        o.connect(fl);
        node = fl;
    }
    node.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
}

/** Plays the shared noise buffer through a biquad filter, optionally sweeping f0->f1, Q defaulting to 0.8. */
export function playNoise(dur, vol, fType, f0, f1, q, channel = 'sfx') {
    if (!audioCtx) return;
    vol = vol * gainFor(channel);
    if (vol <= 0.0005) return;
    const t = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;
    const fl = audioCtx.createBiquadFilter();
    fl.type = fType;
    fl.frequency.setValueAtTime(f0, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    fl.Q.value = q || 0.8;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(fl);
    fl.connect(g);
    g.connect(audioCtx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
}

// ── Sustained drones (SS-027 / Sovereign Scar mood beds) ──────────────────
// One authorized engine patch per Locked Decision D5. One-shots remain
// playTone/playNoise; drones are long-lived oscillators the game can stop.
const _drones = new Map(); // id -> { osc, gain, filter? }

/**
 * Start (or replace) a sustained oscillator on a named channel id.
 * @param {string} type  oscillator type: square | triangle | sine | sawtooth
 * @param {number} freq  Hz
 * @param {number} vol   linear volume before master/music gain
 * @param {string} [channel='music'] volume bus
 * @param {string} [id='default']    handle for stopDrone
 * @returns {string|null} id, or null if audio not initialized
 */
export function playDrone(type, freq, vol, channel = 'music', id = 'default') {
    if (!audioCtx) return null;
    stopDrone(id);
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(Math.max(1, freq || 80), t);
    const v = Math.max(0, vol || 0) * gainFor(channel);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t + 0.08);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    _drones.set(id, { osc: o, gain: g, channel, vol: Math.max(0, vol || 0) });
    return id;
}

/**
 * Re-apply the current volume buses to every RUNNING drone (SS-027 addition).
 * playDrone bakes master×channel gain at creation, so live volume changes
 * (settings sliders, mute, boot fade-in) must call this after setVolumes().
 */
export function refreshDroneVolumes() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    for (const d of _drones.values()) {
        try {
            const v = d.vol * gainFor(d.channel);
            d.gain.gain.cancelScheduledValues(t);
            d.gain.gain.setTargetAtTime(Math.max(0.00005, v), t, 0.05);
        } catch (_) { /* node may have ended */ }
    }
}

/** Fade out and stop a single drone by id. */
export function stopDrone(id = 'default') {
    const d = _drones.get(id);
    if (!d) return;
    _drones.delete(id);
    if (!audioCtx) return;
    try {
        const t = audioCtx.currentTime;
        d.gain.gain.cancelScheduledValues(t);
        d.gain.gain.setValueAtTime(Math.max(0.0001, d.gain.gain.value), t);
        d.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        d.osc.stop(t + 0.15);
    } catch (_) { /* already stopped */ }
}

/** Stop every active drone. */
export function stopAllDrones() {
    for (const id of [..._drones.keys()]) stopDrone(id);
}

export const sfx = {
    stomp() {
        playTone('sawtooth', 70, 14, 0.5, 0.85, 130);
        playNoise(0.35, 0.5, 'lowpass', 400, 80);
    },
    slap() {
        playNoise(0.07, 0.5, 'bandpass', 2400, null, 1.2);
        playTone('triangle', 300, 120, 0.12, 0.3);
    },
    kick() {
        playTone('sine', 150, 42, 0.22, 0.55);
        playNoise(0.12, 0.3, 'lowpass', 600, 200);
    },
    grab() {
        playNoise(0.12, 0.3, 'lowpass', 700, 250);
    },
    heave() {
        playTone('sawtooth', 120, 36, 0.32, 0.6, 200);
        playNoise(0.3, 0.45, 'lowpass', 500, 90);
    },
    whoosh() {
        playNoise(0.28, 0.28, 'bandpass', 350, 950, 1.5);
    },
    step() {
        playTone('sine', 95, 45, 0.09, 0.16);
    },
    land() {
        playTone('sine', 110, 40, 0.16, 0.4);
        playNoise(0.14, 0.25, 'lowpass', 450, 120);
    },
    block() {
        // Metallic guard clang so a blocked hit reads as a real mechanic.
        playNoise(0.09, 0.35, 'bandpass', 1800, 900, 3.0);
        playTone('square', 520, 300, 0.08, 0.18);
    },
    // Sovereign Scar game one-shots
    shatter() {
        playNoise(0.22, 0.45, 'bandpass', 1800, 400, 1.4);
        playTone('triangle', 420, 90, 0.18, 0.25);
    },
    dash() {
        playNoise(0.18, 0.35, 'bandpass', 600, 1400, 1.2);
        playTone('sine', 280, 90, 0.14, 0.22);
    },
    hurt() {
        playTone('sawtooth', 220, 60, 0.2, 0.35, 400);
        playNoise(0.12, 0.28, 'lowpass', 900, 200);
    },
    pickup() {
        playTone('triangle', 440, 880, 0.2, 0.28);
        playTone('sine', 660, 990, 0.25, 0.18);
    },
    phase() {
        playTone('sine', 60, 220, 0.5, 0.3);
        playNoise(0.4, 0.2, 'bandpass', 300, 1200, 0.8);
    },
    fanfare() {
        playTone('triangle', 392, 523, 0.18, 0.28);
        playTone('sine', 523, 659, 0.28, 0.22);
        playTone('triangle', 659, 784, 0.35, 0.18);
    },
    stinger() {
        // Boss reveal: low fifth slam + rising minor third
        playTone('sawtooth', 55, 41, 0.6, 0.5, 200);
        playTone('square', 110, 110, 0.5, 0.22);
        playTone('triangle', 220, 262, 0.35, 0.25);
        playNoise(0.5, 0.3, 'lowpass', 700, 120);
    },
};

// ── Layered music beds (bass + fifth + pulse) ────────────────────────────────
const MUSIC_BEDS = {
    crust: [
        { id: 'bed-bass', type: 'sine', freq: 55, vol: 0.07 },
        { id: 'bed-fifth', type: 'triangle', freq: 82.5, vol: 0.035 },
        { id: 'bed-air', type: 'sine', freq: 165, vol: 0.018 },
    ],
    abyss: [
        { id: 'bed-bass', type: 'sawtooth', freq: 40, vol: 0.055 },
        { id: 'bed-fifth', type: 'triangle', freq: 60, vol: 0.03 },
        { id: 'bed-air', type: 'sine', freq: 120, vol: 0.02 },
    ],
    boss: [
        { id: 'bed-bass', type: 'square', freq: 48, vol: 0.06 },
        { id: 'bed-fifth', type: 'sawtooth', freq: 72, vol: 0.028 },
        { id: 'bed-air', type: 'triangle', freq: 96, vol: 0.022 },
    ],
    leviathan: [
        { id: 'bed-bass', type: 'sine', freq: 32, vol: 0.08 },
        { id: 'bed-fifth', type: 'triangle', freq: 48, vol: 0.04 },
        { id: 'bed-air', type: 'sine', freq: 96, vol: 0.025 },
    ],
};

let _bedName = null;
let _pulseAcc = 0;
let _motif = null;
let _pulseIx = 0;

/**
 * Start a layered music bed (replaces prior bed drones).
 * `motif` (C7, optional): { transpose, pattern } — transpose scales every
 * layer's frequency; pattern is a cycle of ratios the pulse walks through.
 */
export function startMusicBed(name = 'crust', motif = null) {
    if (!audioCtx) return;
    const layers = MUSIC_BEDS[name] || MUSIC_BEDS.crust;
    const k = (motif && motif.transpose) || 1;
    // Stop previous bed ids only
    for (const id of ['bed-bass', 'bed-fifth', 'bed-air']) stopDrone(id);
    for (const L of layers) {
        playDrone(L.type, L.freq * k, L.vol, 'music', L.id);
    }
    _bedName = name;
    _motif = motif;
    _pulseAcc = 0;
    _pulseIx = 0;
}

export function stopMusicBed() {
    for (const id of ['bed-bass', 'bed-fifth', 'bed-air']) stopDrone(id);
    _bedName = null;
    _motif = null;
}

/** Soft rhythmic tick under music beds — call from mood update. */
export function updateMusicBed(dt) {
    if (!_bedName || !audioCtx) return;
    _pulseAcc += dt;
    const interval = _bedName === 'boss' || _bedName === 'leviathan' ? 0.55 : 0.9;
    if (_pulseAcc >= interval) {
        _pulseAcc = 0;
        const base = _bedName === 'abyss' || _bedName === 'leviathan' ? 90 : 130;
        const k = (_motif && _motif.transpose) || 1;
        const pat = (_motif && _motif.pattern && _motif.pattern.length) ? _motif.pattern : [1];
        const f0 = base * k * pat[_pulseIx++ % pat.length];
        playTone('sine', f0, f0 * 0.7, 0.08, 0.04, null, 'music');
    }
}

export function currentMusicBed() {
    return _bedName;
}

export { audioCtx };
