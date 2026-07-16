// Randomized game SFX wrappers (A4) — pitch/duration jitter over the engine's
// playTone/playNoise so repeated combat sounds don't fatigue. The frozen
// engine `sfx` presets stay untouched; these are additive replacements used
// at game call sites only. All no-op safely before initAudio().

import { playTone, playNoise } from '../../audio/synth.js';

/** value ± pct jitter */
const r = (v, pct = 0.15) => v * (1 + (Math.random() * 2 - 1) * pct);

export const vsfx = {
    step() {
        playNoise(r(0.055), 0.05, 'lowpass', r(320), r(170), 0.7);
    },
    slap() {
        playTone('square', r(230), r(85), r(0.09), 0.16, 1200);
        playNoise(r(0.05), 0.09, 'bandpass', r(950), r(480), 1.0);
    },
    hurt() {
        playTone('sawtooth', r(165), r(58), r(0.22), 0.2, 900);
    },
    kill() {
        playTone('triangle', r(330), r(66), r(0.24), 0.18, 1400);
        playNoise(r(0.12), 0.12, 'bandpass', r(1250), r(280), 0.8);
    },
    shatter() {
        playNoise(r(0.16), 0.14, 'highpass', r(1800), r(700), 0.6);
        playTone('square', r(140), r(50), r(0.1), 0.1, 700);
    },
    pickup() {
        playTone('sine', r(880, 0.08), r(1350, 0.08), 0.08, 0.14);
    },
};
