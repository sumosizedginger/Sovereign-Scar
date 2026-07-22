// Music theory primitives for the score engine.
//
// Pure arithmetic, deliberately separated from anything that touches Web Audio,
// so the whole harmonic layer can be unit-tested in node where there is no
// AudioContext at all. Nothing in this file makes a sound.
//
// Everything is expressed in MIDI note numbers rather than frequencies. Notes
// are what music is written in; frequencies are what speakers want, and the
// conversion belongs at the very last step.

/** MIDI note number → Hz. 69 = A4 = 440. */
export function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
}

/** Semitone offsets from the root, one octave of each mode. */
export const SCALES = {
    // The dark end of the wheel — this is a game about a wound that remembers.
    aeolian: [0, 2, 3, 5, 7, 8, 10],        // natural minor: the default sadness
    dorian: [0, 2, 3, 5, 7, 9, 10],         // minor with a raised 6th: wistful, not bleak
    phrygian: [0, 1, 3, 5, 7, 8, 10],       // flat 2nd: unease, something is wrong
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],  // raised 7th: menace with a pull home
    // Used sparingly, and always as contrast.
    lydian: [0, 2, 4, 6, 7, 9, 11],         // raised 4th: weightless, uncanny brightness
    mixolydian: [0, 2, 4, 5, 7, 9, 10],     // flat 7th: heroic but unresolved
};

/** Note names → pitch class, so tracks can be written in letters not integers. */
export const PITCH_CLASS = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** "A2" / "F#3" → MIDI number. Octave 4 contains middle C (60). */
export function noteToMidi(name) {
    const m = String(name).match(/^([A-G][#b]?)(-?\d+)$/);
    if (!m) return 60;
    return PITCH_CLASS[m[1]] + (Number(m[2]) + 1) * 12;
}

/**
 * The `degree`-th note of a scale, counted from `rootMidi`.
 *
 * Degrees are unbounded in both directions and wrap into octaves, so degree 7
 * is the root an octave up and degree -1 is the seventh below. That is what
 * lets a melody line be written as a contour — [0, 2, 4, 2, 7] — and then be
 * transposed anywhere without any of it going out of key.
 */
export function scaleNote(rootMidi, mode, degree) {
    const steps = SCALES[mode] || SCALES.aeolian;
    const n = steps.length;
    const octave = Math.floor(degree / n);
    const idx = ((degree % n) + n) % n;
    return rootMidi + steps[idx] + octave * 12;
}

/**
 * A chord built by stacking scale thirds on `degree`.
 *
 * Building chords out of the scale rather than from absolute intervals is what
 * keeps a progression diatonic for free: the ii of a minor key comes out
 * diminished because the scale says so, not because anything special-cased it.
 */
export function chord(rootMidi, mode, degree, size = 3) {
    const notes = [];
    for (let i = 0; i < size; i++) notes.push(scaleNote(rootMidi, mode, degree + i * 2));
    return notes;
}

/**
 * Re-voice `notes` to sit as close as possible to `previous`.
 *
 * Without this, a progression lurches: every chord is played in root position,
 * so the top line leaps around and the ear hears four unrelated stabs instead
 * of one moving harmony. Voice leading is most of what separates "a chord
 * progression" from "music". Each note is octave-shifted to whichever register
 * puts it nearest the voice it is replacing.
 */
export function voiceLead(notes, previous) {
    if (!previous || !previous.length) return notes.slice();
    return notes.map((n, i) => {
        const target = previous[Math.min(i, previous.length - 1)];
        let best = n;
        let bestDist = Math.abs(n - target);
        for (let o = -2; o <= 2; o++) {
            const cand = n + o * 12;
            const d = Math.abs(cand - target);
            if (d < bestDist) { bestDist = d; best = cand; }
        }
        return best;
    });
}

/**
 * Shift a voicing by whole octaves so its centre sits nearest `targetMidi`.
 *
 * Voice leading on its own is not enough, and the failure is loud. Each chord
 * is moved to wherever is closest to the previous one, so a progression whose
 * roots descend keeps stepping down — Am F C G drifted through two octaves in
 * four bars and then leapt back up when the loop came round. The pad sank into
 * mud and then jumped.
 *
 * Re-centring is what a real arranger does after voicing a chord: keep the
 * motion between chords small, but keep the whole thing inside the register the
 * instrument actually lives in. Octaves are used because moving a chord by an
 * octave does not change the harmony at all.
 */
export function recenter(notes, targetMidi) {
    if (!notes.length) return notes;
    const mean = notes.reduce((a, n) => a + n, 0) / notes.length;
    const shift = Math.round((targetMidi - mean) / 12) * 12;
    return shift === 0 ? notes.slice() : notes.map((n) => n + shift);
}

/**
 * Deterministic pseudo-random in [0,1) from an integer.
 *
 * The score humanises timing and velocity, but it must not drift differently on
 * every playthrough or two players comparing notes would be describing
 * different games. A hash keyed on bar and step gives variation that is stable.
 */
export function hashRandom(seed) {
    let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Humanise a value by up to ±`amount`, deterministically.
 * Applied to note onsets and velocities: a grid-exact performance is the single
 * most reliable way to make a synthesised part sound like a machine.
 */
export function humanise(seed, amount) {
    return (hashRandom(seed) - 0.5) * 2 * amount;
}
