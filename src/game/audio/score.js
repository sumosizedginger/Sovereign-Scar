// The score engine — a lookahead sequencer over the voices in instruments.js.
//
// WHY A LOOKAHEAD SCHEDULER. The old bed advanced a pulse counter by `dt` in
// the render loop and played a tone whenever the accumulator crossed an
// interval, which means its rhythm was quantised to the frame rate. A dropped
// frame was a late note; a GPU hitch was a stumble. Music is the one system in
// a game that cannot borrow the renderer's clock.
//
// So: every frame we look ~200 ms into the future and schedule every sixteenth
// note that falls inside that window at its exact AudioContext time. The audio
// thread then plays them sample-accurately no matter what the renderer does.
// The window is generous enough to survive a 12 fps stutter without a gap.
//
// ADAPTIVE INTENSITY. Layers gate on an intensity level (0 exploring → 3 boss)
// that ramps smoothly rather than switching. Combat does not change the tune,
// it thickens it — so there is no musical seam when a fight starts, and the
// player feels the room become dangerous without noticing why.

import { audioCtx as liveCtx, channelGain } from '../../audio/synth.js';
import {
    midiToFreq, noteToMidi, scaleNote, chord, voiceLead, recenter, humanise, hashRandom,
} from './theory.js';
import { resolveTrack } from './tracks.js';
import {
    compVoice, bassVoice, pluckVoice, leadVoice, bellVoice,
    kickVoice, hatVoice, snareVoice, tomVoice,
} from './instruments.js';

const LOOKAHEAD = 0.2;      // seconds of future we keep scheduled
const STEPS_PER_BAR = 16;   // sixteenth-note grid, 4/4

/**
 * How long a sustaining voice may hold.
 *
 * NO VOICE MAY STILL BE SOUNDING WHEN ITS NEXT ARTICULATION ARRIVES. That one
 * rule is the whole difference between a score and a drone, and it is the fault
 * this table exists to make unreachable. The chords used to hold 105% of a bar
 * on a four-beat grid — so every chord overlapped the next — with a one-beat
 * attack into a three-second reverb at nearly unity return. Nothing about that
 * is audible as a chord change. It is audible as a hum that shifts colour, and
 * the melody over it is heard as part of the hum rather than as a tune.
 *
 * The bass was the same mistake an octave down and much harder to catch, since
 * a sustained low sine stops being heard as a note and starts being heard as
 * the room itself. It held 1.8 beats against strikes two beats apart.
 *
 * `chordSustain` derives the length from the gap rather than fixing it, which
 * is also the better musical answer: a stab in the Pyre's dense off-beat
 * pattern should be short and a Leviathan chord an entire bar apart should ring
 * — but neither may run into the next one.
 */
export const VOICE_SUSTAIN = {
    // 0.55 rather than something closer to 1: on an evenly-spaced pattern this
    // is exactly the fraction of each bar the chords are audible for, so 45% of
    // every bar has no harmony in it at all. That silence is the room the
    // melody is heard in.
    chordsOfGap: 0.55,  // fraction of the distance to the next strike
    chordsMax: 1.1,     // beats — ceiling however sparse the pattern gets
    bass: 0.9,          // beats; the bass articulates two beats apart
};

/**
 * How long the chord struck at sixteenth `index` may ring, in beats.
 * Exported so the spec can test the real scheduling decision rather than a
 * constant that the scheduler might not actually be using.
 */
export function chordSustain(comp, index) {
    const pat = comp || '';
    if (pat[index] !== 'x') return 0;
    let gap = 0;
    for (let i = 1; i <= pat.length; i++) {
        gap = i;
        if (pat[(index + i) % pat.length] === 'x') break;
    }
    return Math.min(VOICE_SUSTAIN.chordsMax, (gap / 4) * VOICE_SUSTAIN.chordsOfGap);
}

let buses = null;
let ctxOverride = null;

/**
 * The context the score renders into.
 *
 * Normally the game's live AudioContext. A test may substitute an
 * OfflineAudioContext, which is the only way to make a claim about the music
 * that does not reduce to "it sounded fine to me" — see
 * tests/audio-render-e2e.spec.mjs, which renders a track and measures whether
 * the level ever falls to silence between chords. It did not, before this.
 */
function ac() {
    return ctxOverride || liveCtx;
}
let track = null;
let playing = false;
let step = 0;               // absolute step counter since the track started
let nextStepTime = 0;
let prevChordVoicing = null;
let intensity = 0;          // target
let intensitySmooth = 0;    // what the layers actually read
let ducking = 1;            // 1 = normal, <1 while something louder is talking

/**
 * Build the shared effect buses.
 *
 * Reverb is a send, not an insert on each voice: one convolver for the whole
 * score is both far cheaper and the reason the parts sound like they are in the
 * same room. A per-note reverb makes a pile of separate sounds.
 */
function ensureGraph() {
    if (buses || !ac()) return buses;
    const master = ac().createGain();
    master.gain.value = 0;
    master.connect(ac().destination);

    const dry = ac().createGain();
    dry.gain.value = 1;
    dry.connect(master);

    const convolver = ac().createConvolver();
    const reverbReturn = ac().createGain();
    // Was 0.9. A hot reverb return is the other way to build a drone without
    // meaning to: with a three-second tail at nearly unity, the decay of one
    // bar is still louder than the attack of the next, and the gaps the voices
    // now leave get filled back in with a smear of everything already played.
    reverbReturn.gain.value = 0.55;
    convolver.connect(reverbReturn);
    reverbReturn.connect(master);
    const reverbSend = ac().createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(convolver);

    // Feedback delay, tempo-synced when a track starts.
    const delay = ac().createDelay(2.0);
    const feedback = ac().createGain();
    const delayTone = ac().createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 2600; // each repeat darker than the last
    feedback.gain.value = 0.34;
    delay.connect(delayTone);
    delayTone.connect(feedback);
    feedback.connect(delay);
    const delayReturn = ac().createGain();
    delayReturn.gain.value = 0.5;
    delay.connect(delayReturn);
    delayReturn.connect(master);
    const delaySend = ac().createGain();
    delaySend.gain.value = 1;
    delaySend.connect(delay);

    buses = { ctx: ac(), master, dry, reverbSend, delaySend, convolver, delay, feedback };
    return buses;
}

/**
 * Generate an impulse response for the convolver.
 *
 * Noise shaped by an exponential decay is a crude reverb by studio standards
 * and completely convincing in a game. Two decorrelated channels give it width;
 * a single channel collapses to the centre and sounds like a pipe.
 */
function makeImpulse(seconds = 3, decay = 2.6) {
    const rate = ac().sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ac().createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
    }
    return buf;
}

/** Start (or switch to) a named track. Re-calling with the same id is a no-op. */
export function startScore(name = 'crust') {
    if (!ac()) return;
    const next = resolveTrack(name);
    if (playing && track && track.id === next.id) return;
    ensureGraph();
    const wasPlaying = playing;
    track = next;
    buses.convolver.buffer = makeImpulse(track.reverb || 3, 2.6);
    buses.delay.delayTime.value = track.delayTime || 0.35;

    // Restarting mid-phrase would be audible, so a switch begins on the next
    // bar boundary of the new tempo rather than wherever the old one was.
    step = 0;
    prevChordVoicing = null;
    nextStepTime = ac().currentTime + 0.06;
    playing = true;

    const now = ac().currentTime;
    const target = masterTarget();
    buses.master.gain.cancelScheduledValues(now);
    buses.master.gain.setValueAtTime(wasPlaying ? buses.master.gain.value : 0.0001, now);
    buses.master.gain.linearRampToValueAtTime(target, now + (wasPlaying ? 1.2 : 2.5));
}

export function stopScore(fade = 0.8) {
    if (!buses || !playing) { playing = false; return; }
    const now = ac().currentTime;
    buses.master.gain.cancelScheduledValues(now);
    buses.master.gain.setValueAtTime(buses.master.gain.value, now);
    buses.master.gain.linearRampToValueAtTime(0.0001, now + fade);
    playing = false;
    track = null;
}

/** 0 exploring · 1 enemies awake · 2 in combat · 3 boss. */
export function setIntensity(n) {
    intensity = Math.max(0, Math.min(3, Number(n) || 0));
}

/**
 * Duck the score under something that needs to be heard — a story line, a boss
 * roar. Music that does not get out of the way is the reason players mute it.
 */
export function duckScore(amount = 0.45, seconds = 1.2) {
    ducking = Math.max(0.05, Math.min(1, amount));
    if (buses && playing) {
        const now = ac().currentTime;
        buses.master.gain.cancelScheduledValues(now);
        buses.master.gain.setValueAtTime(buses.master.gain.value, now);
        buses.master.gain.linearRampToValueAtTime(masterTarget(), now + 0.12);
        setTimeout(() => {
            ducking = 1;
            if (buses && playing) {
                const t = ac().currentTime;
                buses.master.gain.cancelScheduledValues(t);
                buses.master.gain.setValueAtTime(buses.master.gain.value, t);
                buses.master.gain.linearRampToValueAtTime(masterTarget(), t + 0.9);
            }
        }, seconds * 1000);
    }
}

function masterTarget() {
    return 0.85 * channelGain('music') * ducking;
}

/** Re-read the volume settings — call when the user changes them. */
export function refreshScoreVolume() {
    if (!buses) return;
    const now = ac().currentTime;
    buses.master.gain.cancelScheduledValues(now);
    buses.master.gain.setValueAtTime(buses.master.gain.value, now);
    buses.master.gain.linearRampToValueAtTime(playing ? masterTarget() : 0.0001, now + 0.25);
}

export function currentScore() {
    return playing && track ? track.id : null;
}

/** Is `layer` audible at the current intensity? */
function layerOn(layer) {
    const gate = track.layers[layer];
    return gate != null && intensitySmooth >= gate - 0.001;
}

/**
 * How far into its gate a layer is, 0..1 — used to fade a layer in over the
 * intensity ramp instead of switching it on, which would click.
 */
function layerGain(layer) {
    const gate = track.layers[layer];
    if (gate == null) return 0;
    return Math.max(0, Math.min(1, intensitySmooth - gate + 1));
}

/** Schedule everything that lands on one sixteenth-note step. */
function scheduleStep(absStep, when) {
    const bar = Math.floor(absStep / STEPS_PER_BAR);
    const s = absStep % STEPS_PER_BAR;
    const beat = s / 4;
    const spb = 60 / track.bpm;             // seconds per beat
    const root = noteToMidi(track.key);
    const prog = track.progression;
    const degree = prog[bar % prog.length];
    const seed = absStep * 2654435761;

    // ── harmony ─────────────────────────────────────────────────────────────
    //
    // The bar's voicing is computed on every downbeat whether or not the layer
    // is audible, so voice leading stays continuous across a silent stretch. If
    // it only advanced while the layer played, turning the chords back on after
    // a quiet passage would leap from a voicing four bars stale.
    if (s === 0) {
        const raw = chord(root + 24, track.mode, degree, 3);
        // Voice-lead for smooth motion, then re-centre so the progression
        // cannot walk itself out of its register (see theory.recenter).
        prevChordVoicing = recenter(voiceLead(raw, prevChordVoicing), root + 28);
    }
    // Chords are struck on a rhythm, not held under the bar. See VOICE_SUSTAIN.
    if (layerOn('chords') && (track.comp || '')[s] === 'x' && prevChordVoicing) {
        const dur = spb * chordSustain(track.comp, s);
        for (const n of prevChordVoicing) {
            compVoice(buses, when, midiToFreq(n), dur,
                0.052 * layerGain('chords'), 1800 + intensitySmooth * 500);
        }
    }

    // ── bass: root on the downbeat, fifth on beat 3 — enough to imply the
    //    harmony without competing with the melody for attention ─────────────
    if (layerOn('bass') && (s === 0 || s === 8)) {
        const d = s === 0 ? degree : degree + 4;
        const n = scaleNote(root, track.mode, d);
        bassVoice(buses, when, midiToFreq(n), spb * VOICE_SUSTAIN.bass,
            0.17 * layerGain('bass'));
    }

    // ── arpeggio: the moving inner voice ────────────────────────────────────
    if (layerOn('arp') && s % 2 === 0) {
        const pattern = track.arp || [0, 2, 4, 2];
        const idx = (s / 2) % pattern.length;
        const n = scaleNote(root + 24, track.mode, degree + pattern[idx]);
        const vel = 0.055 + humanise(seed + 11, 0.012);
        pluckVoice(buses, when, midiToFreq(n), spb * 0.5, vel * layerGain('arp'));
    }

    // ── melody ──────────────────────────────────────────────────────────────
    if (layerOn('lead')) scheduleMelody(absStep, when, root, spb);

    // ── percussion ──────────────────────────────────────────────────────────
    if (layerOn('drums')) {
        const g = layerGain('drums');
        const { kick = '', hat = '', snare = '' } = track.drums || {};
        if (kick[s] === 'x') kickVoice(buses, when, 0.45 * g);
        if (hat[s] === 'x') hatVoice(buses, when, (0.055 + humanise(seed, 0.015)) * g);
        if (hat[s] === 'o') hatVoice(buses, when, 0.07 * g, true);
        if (snare[s] === 'x') snareVoice(buses, when, 0.17 * g);
    }
    if (layerOn('tom') && s % 8 === 0) {
        const n = scaleNote(root, track.mode, degree);
        tomVoice(buses, when, midiToFreq(n) * 2, 0.26 * layerGain('tom'));
    }

    // ── a bell on the first beat of every fourth bar, as punctuation ────────
    if (s === 0 && bar % 4 === 0 && intensitySmooth < 2.5) {
        const n = scaleNote(root + 36, track.mode, degree);
        bellVoice(buses, when, midiToFreq(n), 2.4, 0.035);
    }
}

/**
 * Walk the motif in step with the bar clock.
 *
 * The motif is a flat list of durations, so its notes rarely land on bar lines —
 * which is the point. A melody that restarts every bar is a jingle. This one
 * phrases across the progression and resolves at the end of its own length.
 */
function scheduleMelody(absStep, when, root, spb) {
    const motif = track.motif || [];
    if (!motif.length) return;
    const totalBeats = motif.reduce((a, n) => a + n.len, 0);
    const totalSteps = Math.round(totalBeats * 4);
    const pos = absStep % totalSteps;

    let acc = 0;
    for (const note of motif) {
        const startStep = Math.round(acc * 4);
        if (startStep === pos) {
            if (note.d == null) return;                 // a rest is a note too
            const cycle = Math.floor(absStep / totalSteps);
            // Every other pass, lift the phrase an octave. Repetition with one
            // change is memorable; exact repetition is wallpaper.
            const lift = cycle % 2 === 1 && hashRandom(cycle) > 0.5 ? 7 : 0;
            const n = scaleNote(root + 24, track.mode, note.d + lift);
            const vel = (0.062 + humanise(absStep + 7, 0.014)) * layerGain('lead');
            leadVoice(buses, when, midiToFreq(n), spb * note.len * 0.92, vel);
            return;
        }
        acc += note.len;
    }
}

/**
 * Advance the sequencer. Call once per frame; `dt` is unused on purpose —
 * timing comes from the audio clock, never from the render loop.
 */
export function updateScore(dt = 0) {
    if (!playing || !ac() || !track) return;
    // Smooth the intensity so layers fade rather than pop.
    const rate = Math.min(1, Math.max(0, dt) * 0.8);
    intensitySmooth += (intensity - intensitySmooth) * (rate || 0.02);

    const spb = 60 / track.bpm;
    const stepDur = spb / 4;
    const horizon = ac().currentTime + LOOKAHEAD;
    let guard = 0;
    while (nextStepTime < horizon && guard++ < 64) {
        // Swing: push the off-sixteenths late. Straight sixteenths are the
        // sound of a sequencer; a little lateness is the sound of a player.
        const swung = (step % 2 === 1) ? (track.swing || 0) * stepDur : 0;
        scheduleStep(step, nextStepTime + swung);
        nextStepTime += stepDur;
        step++;
    }
    // If we fell far behind (tab was hidden, audio clock ran on), resync rather
    // than frantically scheduling thousands of past notes.
    if (nextStepTime < ac().currentTime - 0.5) {
        nextStepTime = ac().currentTime + 0.05;
    }
}

/**
 * Test seam: render `seconds` of a track into an OfflineAudioContext and hand
 * back the buffer.
 *
 * This exists because every previous check on this game's music could only ever
 * prove that audio was being produced. "There is a drone under the melody" is a
 * claim about the shape of the signal over time, and the only way to settle it
 * is to look at the signal. The scheduler and the voices used here are the real
 * ones — a test that reimplemented the sequencer would prove the reimplementation
 * has no drone in it, which is worth nothing.
 *
 * @param {new (...args:any) => any} OfflineCtor  the page's OfflineAudioContext
 */
export async function renderOffline(OfflineCtor, name, seconds = 8, level = 0, rate = 22050) {
    const ctx = new OfflineCtor(1, Math.ceil(rate * seconds), rate);
    const savedBuses = buses;
    const savedTrack = track;
    const savedPlaying = playing;
    ctxOverride = ctx;
    buses = null;
    track = null;
    playing = false;
    prevChordVoicing = null;
    try {
        startScore(name);
        // No fade-in: a 2.5s ramp over an 8s render would be measured as the
        // music getting quieter rather than as the gaps we came to look for.
        buses.master.gain.cancelScheduledValues(0);
        buses.master.gain.setValueAtTime(0.85, 0);
        intensitySmooth = level;
        intensity = level;

        const spb = 60 / track.bpm;
        const stepDur = spb / 4;
        const steps = Math.ceil(seconds / stepDur);
        for (let s = 0; s < steps; s++) {
            const swung = (s % 2 === 1) ? (track.swing || 0) * stepDur : 0;
            scheduleStep(s, s * stepDur + swung);
        }
        return await ctx.startRendering();
    } finally {
        ctxOverride = null;
        buses = savedBuses;
        track = savedTrack;
        playing = savedPlaying;
    }
}

/** Test seam: expose scheduler state without a live AudioContext. */
export function _scoreState() {
    return { playing, step, intensity, intensitySmooth, trackId: track && track.id };
}

/** Test seam: the effect buses, so QA can tap the master for a level reading. */
export function _scoreBuses() {
    return buses;
}
