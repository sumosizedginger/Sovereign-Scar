// tests/game/music.spec.mjs — the music has to actually be music.
//
// The previous "soundtrack" was three sine drones and a tick every 0.9 s,
// transposed per dungeon by a frequency ratio. A ratio is not a key and a drone
// is not a tune, so all fourteen dungeons were the same hum at different
// pitches. Nothing tested it, because there was nothing testable about it.
//
// A generated score can be tested, and the failures it has are specific and
// audible: a melody note outside the scale, a progression that walks the pad
// out of its register, a phrase whose length never lines up with the harmony.
// All three are things a player would hear a thousand times before working out
// what was wrong, so all three are pinned here.
//
// Nothing in this spec touches Web Audio — the harmonic layer is deliberately
// pure arithmetic so it runs in node.

import {
    midiToFreq, noteToMidi, scaleNote, chord, voiceLead, recenter,
    hashRandom, humanise, SCALES,
} from '../../src/game/audio/theory.js';
import { BASE_TRACKS, BEAT_TRACKS, REGION_TRACKS, resolveTrack } from '../../src/game/audio/tracks.js';
import { VOICE_SUSTAIN, chordSustain } from '../../src/game/audio/score.js';
import { MOOD_PRESETS } from '../../src/game/assets/palettes.js';

const ALL_IDS = [
    ...Object.keys(BASE_TRACKS),
    ...Object.keys(BEAT_TRACKS),
    ...Object.keys(REGION_TRACKS),
];

/** Pitch classes reachable in a mode, for in-key checks. */
function pitchClasses(mode) {
    const s = new Set();
    for (const semi of SCALES[mode]) s.add(semi % 12);
    return s;
}

export function run(t) {
    // --- theory --------------------------------------------------------------
    t.ok('A4 is 440 Hz', Math.abs(midiToFreq(69) - 440) < 1e-9);
    t.ok('an octave doubles the frequency', Math.abs(midiToFreq(81) - 880) < 1e-9);
    t.ok('middle C parses to 60', noteToMidi('C4') === 60);
    t.ok('accidentals parse', noteToMidi('F#2') === 42 && noteToMidi('Bb1') === 34);

    t.ok('degree 7 is the root an octave up', scaleNote(60, 'aeolian', 7) === 72);
    t.ok('negative degrees walk down into the octave below',
        scaleNote(60, 'aeolian', -1) === 58, String(scaleNote(60, 'aeolian', -1)));
    t.ok('a minor triad comes out minor',
        JSON.stringify(chord(60, 'aeolian', 0)) === JSON.stringify([60, 63, 67]));
    t.ok('the diatonic ii of a minor key is diminished, without special-casing',
        JSON.stringify(chord(60, 'aeolian', 1)) === JSON.stringify([62, 65, 68]));

    // --- voice leading -------------------------------------------------------
    {
        const a = chord(60, 'aeolian', 0);
        const rootPos = chord(60, 'aeolian', 5);
        const led = voiceLead(rootPos, a);
        const motion = (x, y) => x.reduce((s, n, i) => s + Math.abs(n - y[i]), 0);
        t.ok('voice leading moves less than root-position stacking',
            motion(led, a) < motion(rootPos, a),
            `led=${motion(led, a)} root=${motion(rootPos, a)}`);
        t.ok('voice leading preserves the harmony',
            new Set(led.map((n) => ((n % 12) + 12) % 12)).size
            === new Set(rootPos.map((n) => ((n % 12) + 12) % 12)).size);
    }

    // --- the register bug this file exists to prevent ------------------------
    //
    // Voice leading alone drifts: each chord goes wherever is nearest the last,
    // so a progression whose roots descend keeps stepping down. Am–F–C–G sank
    // two octaves in four bars and then leapt back when the loop came round —
    // the pad sinking into mud and jumping is the kind of fault that is obvious
    // the moment you hear it and completely invisible in a diff.
    {
        const root = noteToMidi('A2');
        const prog = BASE_TRACKS.crust.progression;
        let prev = null;
        const centres = [];
        for (let rep = 0; rep < 4; rep++) {
            for (const deg of prog) {
                const v = recenter(voiceLead(chord(root + 24, 'aeolian', deg, 3), prev), root + 28);
                prev = v;
                centres.push(v.reduce((a, n) => a + n, 0) / v.length);
            }
        }
        const spread = Math.max(...centres) - Math.min(...centres);
        t.ok('the pad never drifts out of its register over repeated loops',
            spread <= 12, `spread ${spread.toFixed(1)} semitones over 4 loops`);
        t.ok('...and it stays near the register it was aimed at',
            centres.every((c) => Math.abs(c - (root + 28)) <= 7),
            `centres ${centres.slice(0, 4).map((c) => c.toFixed(0)).join(',')}`);
    }
    {
        const v = chord(60, 'aeolian', 0);
        const moved = recenter(v, 96);
        t.ok('re-centring shifts by whole octaves only',
            moved.every((n, i) => (n - v[i]) % 12 === 0));
        t.ok('...and moves every voice by the same amount, so the chord is intact',
            new Set(moved.map((n, i) => n - v[i])).size === 1);
    }

    // --- determinism ---------------------------------------------------------
    t.ok('humanisation is stable across runs', hashRandom(12345) === hashRandom(12345));
    t.ok('...and differs between steps', hashRandom(1) !== hashRandom(2));
    t.ok('humanise stays inside its bound',
        [...Array(200)].every((_, i) => Math.abs(humanise(i, 0.02)) <= 0.02));

    // --- every track is playable --------------------------------------------
    for (const id of ALL_IDS) {
        const track = resolveTrack(id);
        const root = noteToMidi(track.key);
        const pcs = pitchClasses(track.mode);

        t.ok(`${id} names a real mode`, !!SCALES[track.mode], track.mode);
        t.ok(`${id} has a sane tempo`, track.bpm >= 40 && track.bpm <= 200, String(track.bpm));
        t.ok(`${id} has a progression`, (track.progression || []).length >= 2);

        const off = (track.motif || []).filter((n) => n.d != null
            && !pcs.has(((scaleNote(root, track.mode, n.d) - root) % 12 + 12) % 12));
        t.ok(`${id} melody stays in key`, off.length === 0, off.map((n) => n.d).join(','));

        // The phrase must line up with the harmony, or the tune drifts against
        // the chords forever and never resolves.
        const beats = (track.motif || []).reduce((s, n) => s + n.len, 0);
        const progBeats = track.progression.length * 4;
        t.ok(`${id} phrase length agrees with its progression`,
            beats > 0 && (beats % progBeats === 0 || progBeats % beats === 0),
            `${beats} melody beats vs ${progBeats} harmony beats`);

        for (const [k, pat] of Object.entries(track.drums || {})) {
            t.ok(`${id} ${k} pattern is a whole bar`, !pat || pat.length === 16, `${pat.length}`);
        }

        const notes = (track.motif || []).filter((n) => n.d != null)
            .map((n) => midiToFreq(scaleNote(root + 24, track.mode, n.d)));
        t.ok(`${id} melody sits in an audible register`,
            notes.every((f) => f > 80 && f < 3000),
            `${Math.min(...notes).toFixed(0)}–${Math.max(...notes).toFixed(0)} Hz`);
    }

    // --- variations are variations, not copies -------------------------------
    {
        const keys = new Set();
        for (const id of Object.keys(BEAT_TRACKS)) {
            const tr = resolveTrack(id);
            keys.add(`${tr.key}|${tr.mode}|${tr.bpm}`);
        }
        t.ok('no two dungeons share a key, mode and tempo',
            keys.size === Object.keys(BEAT_TRACKS).length,
            `${keys.size}/${Object.keys(BEAT_TRACKS).length}`);
    }
    t.ok('every dungeon has a track', Object.keys(BEAT_TRACKS).length === 14);
    t.ok('every overworld region has a track', Object.keys(REGION_TRACKS).length === 8);
    t.ok('a variation inherits what it does not override',
        resolveTrack('beat-03-sink').progression === BASE_TRACKS.abyss.progression);
    t.ok('layer gates merge rather than replace',
        Object.keys(resolveTrack('beat-01-crypt').layers).length
        === Object.keys(BASE_TRACKS.crust.layers).length);
    t.ok('an unknown id falls back rather than throwing',
        resolveTrack('nope-not-a-track').id === 'crust');

    // --- nothing sustains ----------------------------------------------------
    //
    // A player reported "a drone under the music", and they were right three
    // times over. Two of the three were outside the score engine entirely,
    // which is why writing a real soundtrack did not fix the complaint: the
    // mood controller started a raw oscillator that never stopped, and the
    // chord voice held 105% of a bar so consecutive chords overlapped. A
    // progression played that way is not heard as harmony, it is heard as a
    // hum that changes colour, and the melody is heard as part of the hum.
    //
    // Each of the three has a structural assertion here rather than a comment,
    // because all three were introduced by people (me) who had read the comment
    // saying the music must not drone.
    for (const mood of Object.keys(MOOD_PRESETS)) {
        t.ok(`the ${mood} mood preset defines no drone`,
            !('drone' in MOOD_PRESETS[mood]),
            JSON.stringify(MOOD_PRESETS[mood].drone || null));
    }

    for (const id of ALL_IDS) {
        const track = resolveTrack(id);
        const comp = track.comp || '';
        t.ok(`${id} strikes its chords on a rhythm`, comp.length === 16, `"${comp}"`);
        t.ok(`${id} chords do not fill the bar`,
            [...comp].filter((c) => c === 'x').length <= 6,
            `${[...comp].filter((c) => c === 'x').length} strikes`);

        // The rule: every chord must have stopped before the next one starts.
        // Checked per strike against the real scheduling function, and the bar
        // wraps — the last strike's gap runs into the first of the next bar,
        // which is the case a naive check misses.
        const hits = [...comp].map((c, i) => (c === 'x' ? i : -1)).filter((i) => i >= 0);
        t.ok(`${id} plays its chords at all`, hits.length > 0, comp);
        const over = hits.filter((h, i) => {
            const next = (i + 1 < hits.length ? hits[i + 1] : hits[0] + 16) - h;
            return chordSustain(comp, h) >= next / 4;
        });
        t.ok(`${id} leaves silence between chords`, over.length === 0,
            over.map((h) => `@${h} rings ${chordSustain(comp, h).toFixed(2)}b`).join(' '));
        t.ok(`${id} chords still ring long enough to be a chord`,
            hits.every((h) => chordSustain(comp, h) >= 0.25),
            `shortest ${Math.min(...hits.map((h) => chordSustain(comp, h))).toFixed(2)} beats`);
    }
    // Bass articulates on beats 1 and 3 — two beats apart, in every track.
    t.ok('the bass note ends before the next one starts',
        VOICE_SUSTAIN.bass < 2,
        `${VOICE_SUSTAIN.bass} beats between articulations two beats apart`);

    // --- adaptive layering ---------------------------------------------------
    //
    // The melody must be audible while merely exploring. Gating the tune behind
    // combat means the player hears pad and bass for hours and concludes the
    // game has no music — which is exactly the state this work started from,
    // and a mistake I made once already in building it.
    for (const id of ALL_IDS) {
        const track = resolveTrack(id);
        t.ok(`${id} plays its melody while exploring`,
            track.layers.lead === 0, `lead gated at ${track.layers.lead}`);
        t.ok(`${id} keeps something in reserve for combat`,
            Object.values(track.layers).some((g) => g > 0), JSON.stringify(track.layers));
    }
}
