// The score itself — keys, progressions, and melodies.
//
// Four base pieces carry the game, and each of the fourteen dungeons and eight
// overworld regions is a *variation* on one of them: a different key, a mode
// swap, a tempo nudge, a different subset of layers. That is how a real game
// soundtrack is built. Fourteen unrelated pieces would give the player nothing
// to recognise; fourteen readings of the same material means the Bone Forest
// can sound like the Crypt's idea after something happened to it.
//
// The previous system transposed three drones by a ratio per beat. Ratios are
// not keys, and a drone is not a tune, so every dungeon sounded like the same
// hum at a different pitch.
//
// MELODY NOTATION. A motif is a flat list of `{ d, len }` in beats, where `d`
// is a scale degree above the key root — unbounded, so 7 is the root an octave
// up — and `d: null` is a rest. Degrees rather than notes means a motif can be
// dropped into any key or mode and stay in tune, which is what makes the
// variations cheap.
//
// DRUM NOTATION. Sixteen-character strings, one per sixteenth note in a bar.
// `x` is a hit, `.` is silence, `o` is an accent (open hat / rimshot).
//
// CHORD NOTATION. `comp` uses the same sixteen-character grid: the beats on
// which the harmony is *struck*. It used to be held for the whole bar instead,
// which is how a soundtrack full of chord progressions still came out sounding
// like a hum with a tune over it. Where the chords do not play is as composed
// as where they do — the holes are what the melody is heard through.

/**
 * Layer gating by intensity:
 *   0 exploring · 1 enemies awake · 2 in combat · 3 boss
 * A layer plays when the current intensity is at least its number. This is the
 * single thing that makes game music feel scored rather than looped — the tune
 * does not change when a fight starts, it *thickens*, so the transition costs
 * nothing musically and the player feels the room get dangerous.
 */
export const BASE_TRACKS = {
    // ── The surface. Wistful rather than heroic: this world already ended. ──
    crust: {
        key: 'A2',
        mode: 'aeolian',
        bpm: 84,
        // i – VI – III – VII. The most-loved progression in adventure music,
        // because the VII resolves back to i without ever landing on a bright
        // major cadence. Hope that does not quite arrive.
        progression: [0, 5, 2, 6],
        motif: [
            { d: 4, len: 1 }, { d: 7, len: 1 }, { d: 8, len: 1 }, { d: 9, len: 1 },
            { d: 8, len: 1 }, { d: 7, len: 1 }, { d: 6, len: 2 },
            { d: 4, len: 1 }, { d: 5, len: 1 }, { d: 4, len: 1 }, { d: 3, len: 1 },
            { d: 2, len: 1 }, { d: 1, len: 1 }, { d: 0, len: 2 },
        ],
        arp: [0, 2, 4, 2],
        // Gentle and slightly ahead of the beat — a walking pulse, not a bed.
        comp: 'x.....x...x.....',
        drums: { kick: 'x.......x.......', hat: '..x...x...x...x.', snare: '' },
        layers: { chords: 0, bass: 0, arp: 0, lead: 0, drums: 2, tom: 3 },
        reverb: 3.2,
        delayTime: 0.357,
        swing: 0.06,
    },

    // ── The mirror. Same world, wrong. Phrygian's flat second does the work. ──
    abyss: {
        key: 'A2',
        mode: 'phrygian',
        bpm: 68,
        progression: [0, 1, 0, 6],
        motif: [
            { d: null, len: 2 }, { d: 0, len: 1 }, { d: 1, len: 1 },
            { d: 2, len: 2 }, { d: 1, len: 2 },
            { d: null, len: 1 }, { d: 4, len: 1 }, { d: 3, len: 2 },
            { d: 1, len: 2 }, { d: 0, len: 2 },
        ],
        arp: [0, 1, 4, 1],
        // Two strikes a bar at 68bpm leaves nearly two seconds of nothing.
        // The Abyss is the one place where the silence is the composition.
        comp: 'x.........x.....',
        drums: { kick: 'x...............', hat: '', snare: '' },
        layers: { chords: 0, bass: 0, arp: 1, lead: 0, drums: 3, tom: 2 },
        reverb: 5.0,
        delayTime: 0.5,
        swing: 0,
    },

    // ── Boss. Harmonic minor, so the raised seventh keeps pulling home. ──
    boss: {
        key: 'D2',
        mode: 'harmonicMinor',
        bpm: 132,
        progression: [0, 0, 5, 4],
        motif: [
            { d: 7, len: 0.5 }, { d: 6, len: 0.5 }, { d: 7, len: 1 }, { d: 4, len: 2 },
            { d: 7, len: 0.5 }, { d: 6, len: 0.5 }, { d: 7, len: 1 }, { d: 9, len: 2 },
            { d: 8, len: 1 }, { d: 7, len: 1 }, { d: 6, len: 1 }, { d: 5, len: 1 },
            { d: 4, len: 2 }, { d: null, len: 2 },
        ],
        arp: [0, 4, 7, 4],
        // Off-beat stabs. Landing them between the kicks rather than on top of
        // them is what makes a boss fight feel driven instead of merely loud.
        comp: '..x..x..x.x..x..',
        drums: { kick: 'x...x...x...x...', hat: 'x.x.x.x.x.x.x.xo', snare: '....x.......x...' },
        layers: { chords: 0, bass: 0, arp: 0, lead: 0, drums: 0, tom: 1 },
        reverb: 2.0,
        delayTime: 0.227,
        swing: 0,
    },

    // ── The Leviathan. Half-time and enormous; a descending lament bass. ──
    leviathan: {
        key: 'C2',
        mode: 'aeolian',
        bpm: 56,
        progression: [0, 6, 5, 4],
        motif: [
            { d: 0, len: 4 },
            { d: 6, len: 2 }, { d: 4, len: 2 },
            { d: 5, len: 4 },
            { d: 4, len: 2 }, { d: 2, len: 1 }, { d: 0, len: 1 },
        ],
        arp: [0, 2, 4, 7],
        // One strike a bar. At 56bpm that bar is four and a quarter seconds
        // long, and the chord is gone for nearly all of it.
        comp: 'x...............',
        drums: { kick: 'x.......x.......', hat: '', snare: '' },
        layers: { chords: 0, bass: 0, arp: 0, lead: 0, drums: 1, tom: 0 },
        reverb: 6.0,
        delayTime: 0.535,
        swing: 0,
    },
};

/**
 * Per-dungeon variations.
 *
 * `from` names the base piece; everything else overrides it. Keys are chosen so
 * that consecutive dungeons are a real interval apart rather than a random
 * transpose — the campaign walks down a circle of fifths as it descends, which
 * the player will not consciously notice and will absolutely feel.
 */
export const BEAT_TRACKS = {
    'beat-01-crypt': { from: 'crust', key: 'A2', mode: 'aeolian', bpm: 72, layers: { arp: 1 } },
    // The Spindle is a machine, so its chords land on a three-against-four
    // cross-rhythm that never quite agrees with the kick.
    'beat-02-spindle': { from: 'crust', key: 'D3', mode: 'dorian', bpm: 96, arp: [0, 2, 4, 6], comp: 'x..x..x..x..x...' },
    'beat-03-sink': { from: 'abyss', key: 'G2', mode: 'aeolian', bpm: 74 },
    'beat-04-sky': { from: 'crust', key: 'C3', mode: 'lydian', bpm: 88, reverb: 4.5 },
    'beat-05-citadel': { from: 'crust', key: 'F2', mode: 'harmonicMinor', bpm: 80 },
    'beat-06-quarry': { from: 'abyss', key: 'Bb1', mode: 'aeolian', bpm: 66, layers: { tom: 1 } },
    'beat-07-sluice': { from: 'abyss', key: 'Eb2', mode: 'dorian', bpm: 78 },
    'beat-08-bone': { from: 'abyss', key: 'Ab1', mode: 'phrygian', bpm: 70 },
    'beat-09-town': { from: 'crust', key: 'Db3', mode: 'aeolian', bpm: 82, swing: 0.12, comp: 'x..x....x..x....' },
    'beat-10-cryo': { from: 'crust', key: 'F#2', mode: 'aeolian', bpm: 90, reverb: 5.5 },
    'beat-11-mire': { from: 'abyss', key: 'B1', mode: 'phrygian', bpm: 60 },
    'beat-12-pyre': { from: 'boss', key: 'E2', mode: 'harmonicMinor', bpm: 116 },
    'beat-13-gumoi': { from: 'abyss', key: 'A1', mode: 'lydian', bpm: 86, delayTime: 0.166 },
    'beat-14-leviathan': { from: 'leviathan', key: 'C2', mode: 'aeolian', bpm: 56 },
};

/** Per-overworld-region variations, same idea at a lighter weight. */
export const REGION_TRACKS = {
    tombfields: { from: 'crust', key: 'A2', mode: 'aeolian' },
    spindle: { from: 'crust', key: 'D3', mode: 'dorian', bpm: 92 },
    sinklands: { from: 'crust', key: 'G2', mode: 'aeolian', bpm: 78 },
    citadel: { from: 'crust', key: 'F2', mode: 'harmonicMinor' },
    quarry: { from: 'crust', key: 'Bb2', mode: 'aeolian', bpm: 76 },
    bonetown: { from: 'abyss', key: 'Ab2', mode: 'phrygian', bpm: 72 },
    cryomire: { from: 'crust', key: 'F#2', mode: 'aeolian', bpm: 86, reverb: 4.8 },
    pyre: { from: 'crust', key: 'E3', mode: 'mixolydian', bpm: 100 },
};

/** Resolve a track name to a fully-populated definition. */
export function resolveTrack(name) {
    if (BASE_TRACKS[name]) return { ...BASE_TRACKS[name], id: name };
    const variant = BEAT_TRACKS[name] || REGION_TRACKS[name];
    if (!variant) return { ...BASE_TRACKS.crust, id: 'crust' };
    const base = BASE_TRACKS[variant.from] || BASE_TRACKS.crust;
    return {
        ...base,
        ...variant,
        // Layer gates merge rather than replace, so a variant can move one
        // layer without having to restate the other five.
        layers: { ...base.layers, ...(variant.layers || {}) },
        drums: { ...base.drums, ...(variant.drums || {}) },
        id: name,
    };
}
