// tests/qa/score-readout.mjs — print the score as notes.
//
// "Audio is being produced" is not the same claim as "this is music". RMS off
// an analyser proves the first. This prints the actual pitches the engine will
// schedule, as note names, so the harmony and the tune can be read and judged
// without listening — and so a wrong mode or an out-of-key melody shows up as
// something obviously broken on the page rather than as a vague unease.

import { resolveTrack } from '../../src/game/audio/tracks.js';
import { noteToMidi, scaleNote, chord, voiceLead, recenter } from '../../src/game/audio/theory.js';
import { chordSustain } from '../../src/game/audio/score.js';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

const ROMAN = ['i', 'ii', 'III', 'iv', 'v', 'VI', 'VII'];

function readout(id) {
    const t = resolveTrack(id);
    const root = noteToMidi(t.key);
    console.log(`\n=== ${id} — ${t.key} ${t.mode}, ${t.bpm}bpm, swing ${t.swing || 0} ===`);

    // Harmony, voice-led exactly as the scheduler will do it.
    let prev = null;
    const bars = [];
    for (const deg of t.progression) {
        const v = recenter(voiceLead(chord(root + 24, t.mode, deg, 3), prev), root + 28);
        prev = v;
        bars.push(`${ROMAN[deg % 7]}: ${v.map(name).join(' ')}`);
    }
    console.log('  chords  ', bars.join('  |  '));

    // Total semitone movement across the progression — the number voice
    // leading exists to minimise. Root-position stacking scores far worse.
    let moved = 0;
    let a = null;
    for (const deg of t.progression.concat(t.progression[0])) {
        const v = recenter(voiceLead(chord(root + 24, t.mode, deg, 3), a), root + 28);
        if (a) for (let i = 0; i < v.length; i++) moved += Math.abs(v[i] - a[i]);
        a = v;
    }
    console.log('  voice motion', `${moved} semitones over ${t.progression.length} changes`);

    // The tune.
    const mel = (t.motif || []).map((n) => (
        n.d == null ? `— (${n.len})` : `${name(scaleNote(root + 24, t.mode, n.d))}(${n.len})`
    ));
    console.log('  melody  ', mel.join(' '));
    const beats = (t.motif || []).reduce((s, n) => s + n.len, 0);
    console.log('  phrase  ', `${beats} beats = ${beats / 4} bars against a ${t.progression.length}-bar progression`);

    // Every melody note must be in the key — one accidental in a procedural
    // tune is not "colour", it is a bug you will hear a thousand times.
    const scaleSet = new Set();
    for (let d = -14; d < 28; d++) scaleSet.add(((scaleNote(0, t.mode, d) % 12) + 12) % 12);
    const bad = (t.motif || []).filter((n) => n.d != null
        && !scaleSet.has(((scaleNote(root, t.mode, n.d) - root) % 12 + 12) % 12));
    console.log('  in key  ', bad.length === 0 ? 'yes' : `NO — ${bad.length} out-of-scale notes`);
    console.log('  layers  ', Object.entries(t.layers).map(([k, v]) => `${k}@${v}`).join(' '));

    // The drone number. A chord voice that is sounding for most of the bar is a
    // pad however good the progression is, and this is the reading that told us
    // the old score was one: it held 105% of every bar, so `chords on` was over
    // 100% and consecutive chords overlapped. Anything above roughly half and
    // the ear stops hearing chord changes and starts hearing a hum.
    const comp = t.comp || '';
    const hits = [...comp].map((c, i) => (c === 'x' ? i : -1)).filter((i) => i >= 0);
    const ringing = hits.reduce((a, h) => a + chordSustain(comp, h), 0);   // beats
    const duty = ringing / 4;                                              // of a 4/4 bar
    console.log('  chords  ', `"${comp}" — ${hits.length} strikes, sounding ${(duty * 100).toFixed(0)}% of the bar`);

    return { id, key: t.key, mode: t.mode, bpm: t.bpm, moved, bars: beats / 4,
        chordDuty: +(duty * 100).toFixed(0) };
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : [
    'crust', 'abyss', 'boss', 'leviathan',
    'beat-01-crypt', 'beat-08-bone', 'beat-12-pyre', 'beat-14-leviathan',
];
const rows = ids.map(readout);
console.log('\n');
console.table(rows);
