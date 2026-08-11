// tests/game/spatial-audio.spec.mjs — a sound that came from the left.
//
// WHAT WAS WRONG
//
// Every sound in the game played dead centre. `grep -r StereoPanner src/` came
// back empty. In a top-down game the enemy that matters is usually the one at
// the edge of the frame, and the only warning it gives is a wind-up whoosh — so
// the cue that says "something is committing to a swing" arrived carrying no
// information about WHERE. The player could hear that a fight was happening and
// had to find it with their eyes.
//
// WHAT IS ASSERTED HERE, AND IN WHICH DIRECTION
//
// Trap 1 in HANDOFF.md is the standing reason this file states every direction
// in world coordinates and never as the sign of an angle: a backwards swing
// once shipped green because the spec asserted a rotation instead of a
// position. So — a source at x = +12 with the listener at x = 0 must produce a
// POSITIVE pan, and positive must mean right. Both halves are checked, because
// a consistent sign convention that is inverted is exactly as wrong as a random
// one and looks just as green.
//
// The integration section is the part that matters. The pan arithmetic is ten
// lines and obviously correct; what is NOT obvious is whether the places that
// actually make noise during a fight are inside a placement scope. Those tests
// drive a real `Enemy` and a real `BossBase` and read back where the sound was
// placed from, so deleting the wrapper in `enemy.js` or `bosses/base.js` fails
// them. Trap 5 applies: the wrappers live in the two frameworks rather than at
// the ~20 call sites, and these prove the framework covers a subclass that
// never mentions audio at all.

import * as THREE from 'three';
import {
    setListener, clearListener, getListener, at, atXZ, placement, spatialize,
    _currentSource, PAN_LIMIT, MIN_DISTANCE_GAIN,
} from '../../src/audio/spatial.js';
import { sfx, channelIsPlaced } from '../../src/audio/synth.js';
import { BossBase } from '../../src/game/bosses/base.js';
import { Enemy } from '../../src/game/enemy.js';
import { scoreStinger, _scoreState, STINGER_FIGURES } from '../../src/game/audio/score.js';
import {
    resolveTrack, BASE_TRACKS, BEAT_TRACKS, REGION_TRACKS,
} from '../../src/game/audio/tracks.js';
import { noteToMidi, scaleNote } from '../../src/game/audio/theory.js';
import { getSetting, setSetting, SETTING_DEFAULTS } from '../../src/engine/settings.js';

/** A frame 20 units wide (±10), centred on the origin unless told otherwise. */
function listenAtOrigin() {
    setListener(0, 0, 10);
}

/**
 * The smallest thing that looks like an AudioContext to `spatialize`.
 * Records the graph so the shape can be asserted rather than assumed.
 */
function fakeCtx() {
    const made = [];
    const node = (type) => {
        const n = {
            type, connectedTo: null,
            pan: { value: 0 }, gain: { value: 1 },
            connect(d) { this.connectedTo = d; },
        };
        made.push(n);
        return n;
    };
    return {
        made,
        createStereoPanner: () => node('panner'),
        createGain: () => node('gain'),
    };
}

/** Capture where the next sound would be placed, by standing in for a voice. */
function captureDuring(fn) {
    let seen = 'not-called';
    const real = sfx.whoosh;
    sfx.whoosh = () => { seen = _currentSource(); };
    try { fn(); } finally { sfx.whoosh = real; }
    return seen;
}

/**
 * The pan a captured source resolves to, or NaN if it was never placed.
 *
 * Exists because the first draft read `.pan` off the result directly, and when
 * the counterfactual removed the framework wrapper the spec THREW instead of
 * failing — taking every assertion after it down with it, including the whole
 * boss section, which was still perfectly capable of reporting. A spec that
 * cannot survive its own subject being broken is not much of a spec: every
 * claim has to be able to fail on its own and let the next one speak.
 */
function panOf(src) {
    if (!src || !Number.isFinite(src.x)) return NaN;
    const p = at(src, () => placement());
    return p ? p.pan : NaN;
}

/** Did a capture land at the expected world XZ? Never throws. */
function placedAt(src, x, z) {
    return !!src && Number.isFinite(src.x)
        && Math.abs(src.x - x) < 0.001
        && (z == null || Math.abs(src.z - z) < 0.001);
}

export function run(t) {
    // MONO IS NOW THE SHIPPED DEFAULT (settings.js explains the asymmetry), and
    // almost everything below is testing the PANNING MECHANISM — which mono is
    // designed to switch off. Those assertions were silently riding on the old
    // default, so flipping it turned ten of them red for the right reason and
    // the wrong one: the panner works fine, it was just correctly disabled.
    //
    // So the mechanism runs explicitly in stereo, and the DEFAULT is asserted
    // against SETTING_DEFAULTS rather than against live state. A spec that
    // reads the live setting to learn the default cannot tell the two apart.
    const _monoBefore = getSetting('monoAudio');
    setSetting('monoAudio', false);
    try {
        runPanningAndIntegration(t);
    } finally {
        setSetting('monoAudio', _monoBefore);
    }
}

function runPanningAndIntegration(t) {
    // ── Unplaced is the default, and it must cost nothing ──────────────────
    {
        clearListener();
        t.ok('no listener means no placement', placement() === null);
        const dest = { id: 'dest' };
        const ctx = fakeCtx();
        t.ok('and spatialize hands back the destination untouched',
            at({ x: 50, z: 0 }, () => spatialize(ctx, dest)) === dest);
        t.ok('having built no nodes at all', ctx.made.length === 0,
            'an unplaced sound must not pay for a graph it does not use');

        listenAtOrigin();
        t.ok('a listener alone is not a placement', placement() === null,
            'outside an at() scope, everything stays centred');
        t.ok('and still builds nothing', spatialize(fakeCtx(), dest) === dest);
    }

    // ── Direction, in world space (trap 1) ─────────────────────────────────
    {
        listenAtOrigin();
        const right = at({ x: 12, z: 0 }, () => placement());
        const left = at({ x: -12, z: 0 }, () => placement());
        const centre = at({ x: 0, z: 0 }, () => placement());

        // The sign convention, stated once and checked, not assumed.
        t.ok('a source at +x pans positive', right.pan > 0, `pan=${right.pan}`);
        t.ok('a source at -x pans negative', left.pan < 0, `pan=${left.pan}`);
        t.ok('a source on the listener is centred', Math.abs(centre.pan) < 1e-9);
        t.ok('and the two sides are mirror images',
            Math.abs(right.pan + left.pan) < 1e-9,
            `${right.pan} vs ${left.pan} — asymmetry here would drag the mix one way`);

        // Positive must MEAN right. StereoPannerNode's contract is pan=+1 →
        // right channel; this pins that we are agreeing with it rather than
        // being self-consistently backwards.
        const ctx = fakeCtx();
        at({ x: 12, z: 0 }, () => spatialize(ctx, { id: 'dest' }));
        const panner = ctx.made.find((n) => n.type === 'panner');
        t.ok('the panner carries that same positive value to the right channel',
            panner && panner.pan.value > 0, `panner.pan=${panner?.pan.value}`);

        // Depth is not width. Something directly in front must not pan.
        const behind = at({ x: 0, z: -30 }, () => placement());
        t.ok('distance along z does not pan', Math.abs(behind.pan) < 1e-9,
            `pan=${behind.pan} — z is depth in a top-down frame, not width`);
    }

    // ── The edge of the frame, and past it ─────────────────────────────────
    {
        listenAtOrigin(); // half-width 10
        const edge = at({ x: 10, z: 0 }, () => placement());
        const wayOut = at({ x: 400, z: 0 }, () => placement());
        t.ok('a source at the frame edge is fully panned',
            Math.abs(edge.pan - PAN_LIMIT) < 1e-9, `pan=${edge.pan}`);
        t.ok('and nothing beyond it pans further',
            Math.abs(wayOut.pan - PAN_LIMIT) < 1e-9, `pan=${wayOut.pan}`);
        t.ok('the limit stops short of a hard pan', PAN_LIMIT < 1,
            'a fully-panned sound is silent in one ear and detaches from the picture');

        // The half-width is what "at the edge" means, so a wider frame must
        // pan the same world position less.
        setListener(0, 0, 40);
        const wide = at({ x: 10, z: 0 }, () => placement());
        t.ok('a wider frame pans the same source less', wide.pan < edge.pan,
            `${wide.pan} vs ${edge.pan} — pan follows the view, not the world`);
    }

    // ── Distance: quieter, never gone ──────────────────────────────────────
    {
        listenAtOrigin();
        const here = at({ x: 0, z: 0 }, () => placement()).gain;
        const near = at({ x: 5, z: 0 }, () => placement()).gain;
        const far = at({ x: 30, z: 0 }, () => placement()).gain;
        const absurd = at({ x: 5000, z: 0 }, () => placement()).gain;

        t.ok('a source on the listener is at full level',
            Math.abs(here - 1) < 1e-9, `gain=${here}`);
        t.ok('gain falls with distance', here > near && near > far,
            `${here} > ${near} > ${far}`);
        t.ok('and never below the floor', absurd >= MIN_DISTANCE_GAIN - 1e-9,
            `gain=${absurd}`);
        // The whole point of the feature is off-screen threats. If the rolloff
        // silences them it has deleted the thing it was built for while every
        // assertion above still passes.
        const offScreen = at({ x: 14, z: 0 }, () => placement()).gain;
        t.ok('a threat just off the edge of the frame is still clearly audible',
            offScreen > 0.5, `gain=${offScreen} at 1.4x the half-width`);
    }

    // ── The scope cannot leak ──────────────────────────────────────────────
    // A stuck source is the failure mode of the rejected design (set/clear
    // globals): silent, and it mispans every later sound in the frame.
    {
        listenAtOrigin();
        t.ok('nothing is in scope to begin with', _currentSource() === null);

        let threw = false;
        try {
            at({ x: 9, z: 0 }, () => { throw new Error('a sound went wrong'); });
        } catch (_) { threw = true; }
        t.ok('a throwing sound still throws', threw);
        t.ok('but leaves no source behind', _currentSource() === null,
            'restored in a finally — otherwise the rest of the frame pans to a corpse');

        // Nesting: a boss action that plays a sound which itself places one.
        const inner = at({ x: 4, z: 0 }, () => at({ x: -4, z: 0 }, () => _currentSource()));
        t.ok('the inner scope wins while it is open', inner.x === -4);
        t.ok('and the outer is restored after it', _currentSource() === null);

        t.ok('atXZ is the same thing with loose coordinates',
            atXZ(7, 3, () => _currentSource()).x === 7);

        // A source with no usable position must pass through rather than
        // placing the sound at NaN, which pans to silence in both ears.
        t.ok('a missing position does not place', at(null, () => _currentSource()) === null);
        t.ok('nor does a NaN one',
            at({ x: NaN, z: 0 }, () => _currentSource()) === null);
    }

    // ── setListener refuses nonsense rather than propagating it ────────────
    {
        setListener(NaN, 0, 10);
        t.ok('a NaN listener is no listener', getListener() === null);
        setListener(0, 0, 0);
        t.ok('a zero-width frame is no listener', getListener() === null,
            'it would divide every pan by zero');
        listenAtOrigin();
        t.ok('a good one takes', getListener().halfWidth === 10);
    }

    // ── The graph spatialize actually builds ───────────────────────────────
    {
        listenAtOrigin();
        const dest = { id: 'dest' };

        // Standing on the listener: pan is zero and gain is unity, so there is
        // nothing to build. This sound is centred at full level, which is
        // exactly what it was before any of this existed.
        const c1 = fakeCtx();
        t.ok('a source dead centre builds no graph at all',
            at({ x: 0, z: 0 }, () => spatialize(c1, dest)) === dest && c1.made.length === 0);

        // Directly ahead but distant: no pan, so no panner — just the rolloff.
        const c1b = fakeCtx();
        const aheadHead = at({ x: 0, z: 20 }, () => spatialize(c1b, dest));
        t.ok('a source straight ahead gets a gain and no panner',
            aheadHead.type === 'gain' && c1b.made.length === 1);
        t.ok('wired to the destination', aheadHead.connectedTo === dest);

        // Off to one side: gain node in front of the panner, panner to dest.
        const c2 = fakeCtx();
        const head2 = at({ x: 8, z: 4 }, () => spatialize(c2, dest));
        t.ok('a distant source gets a gain in front of the panner',
            head2.type === 'gain' && head2.connectedTo.type === 'panner');
        t.ok('and the panner reaches the destination',
            head2.connectedTo.connectedTo === dest);
        t.ok('with the rolloff on the gain, not the pan',
            head2.gain.value < 1 && head2.gain.value >= MIN_DISTANCE_GAIN);

        // A context that cannot pan must degrade to centred, not to a crash.
        // Older Safari and some OfflineAudioContexts have no StereoPannerNode.
        // It still gets the distance rolloff: loudness carries distance
        // perfectly well in one channel, so losing the panner costs half the
        // information rather than all of it.
        const noPan = {
            createGain: () => ({ type: 'gain', gain: { value: 1 }, connect(d) { this.connectedTo = d; } }),
        };
        const fallback = at({ x: 8, z: 0 }, () => spatialize(noPan, dest));
        t.ok('a context without StereoPanner still routes to the destination',
            fallback.connectedTo === dest);
        t.ok('and keeps the distance rolloff', fallback.gain.value < 1,
            `gain=${fallback.gain.value}`);
        t.ok('while a centred source on such a context adds nothing at all',
            at({ x: 0, z: 0 }, () => spatialize(noPan, dest)) === dest);
    }

    // ── Mono: the feature has to be able to turn itself off ────────────────
    // This game's owner hears in one ear. For them, panning a wind-up to the
    // deaf side does not make it harder to place, it makes it SILENT — the far
    // channel measures about -22dB at PAN_LIMIT. So stereo placement is not
    // allowed to be mandatory, and the mono path has to keep the half of the
    // information that still works in one channel: loudness.
    {
        listenAtOrigin();
        const wasMono = getSetting('monoAudio');
        try {
            setSetting('monoAudio', true);
            const left = at({ x: -8, z: 0 }, () => placement());
            const right = at({ x: 8, z: 0 }, () => placement());
            const far = at({ x: 40, z: 0 }, () => placement());
            const near = at({ x: 2, z: 0 }, () => placement());

            t.ok('mono collapses the pan to centre',
                left.pan === 0 && right.pan === 0, `${left.pan} / ${right.pan}`);
            t.ok('but keeps distance in the gain', far.gain < near.gain,
                `${far.gain} at 40 units vs ${near.gain} at 2 — a mono player `
                + 'still hears far-away as quieter');
            t.ok('and the rolloff floor still holds', far.gain >= MIN_DISTANCE_GAIN);

            // The structural half: with no pan there is no panner, so the mono
            // path cannot put signal in one channel even by accident.
            const ctx = fakeCtx();
            at({ x: -8, z: 0 }, () => spatialize(ctx, { id: 'dest' }));
            t.ok('mono builds no panner at all',
                ctx.made.filter((n) => n.type === 'panner').length === 0,
                'not "a panner set to 0" — none, so it cannot be reintroduced by a stray write');
            t.ok('only the distance gain', ctx.made.length === 1 && ctx.made[0].type === 'gain');
        } finally {
            setSetting('monoAudio', wasMono);
        }

        // ...and it is ON by default. This assertion used to read "stereo is
        // the default", which pinned a hole in place: a player with hearing in
        // one ear had to find this toggle on every fresh profile, and could not
        // know to look, because the cues they were missing never arrived to be
        // missed. Mono costs a two-eared player the DIRECTION of a wind-up and
        // nothing else; stereo costs a one-eared player the wind-up. The safe
        // default is the one whose failure mode is recoverable.
        t.ok('mono is the SHIPPED default', SETTING_DEFAULTS.monoAudio === true,
            'read from the schema, not from live state a test may have moved');
        t.ok('and pans again once mono is turned off',
            at({ x: -8, z: 0 }, () => placement()).pan < 0);
    }

    // ── The music bus is never placed, whatever the scope says ─────────────
    // Found by measurement, not by reading: in the live game a
    // `playTone(..., 'music')` made inside a placement scope panned to 0.62
    // exactly like an effect. Nothing calls it that way today, which is
    // precisely why this needs a spec rather than a comment — the next person
    // to move the bed's pulse into a per-entity update would ship a soundtrack
    // that slides into one ear when a boss walks left, and no gate would care.
    {
        listenAtOrigin();
        // The placement machinery itself has no opinion about buses — hand it a
        // scope and it pans. So the rule has to live in the mixer, and this is
        // the predicate `outputFor` actually branches on, not a restatement.
        const dest = { id: 'dest' };
        t.ok('spatialize places anything handed to it inside a scope',
            at({ x: 9, z: 0 }, () => spatialize(fakeCtx(), dest)) !== dest,
            'which is why the music rule cannot live here');
        t.ok('the music bus is never placed', channelIsPlaced('music') === false);
        t.ok('the effects bus is', channelIsPlaced('sfx') === true);
        t.ok('and so is an unnamed one, which defaults to effects',
            channelIsPlaced(undefined) === true);
    }

    // ── INTEGRATION: the enemy wind-up, the cue this was built for ─────────
    // `Enemy` never mentions spatial audio in its attack code. The placement
    // lives in `_beginWindup`, so every kind and every AI gets it — including
    // ones written later. Remove that wrapper and this fails.
    {
        listenAtOrigin();
        const world = null;
        const e = new Enemy(new THREE.Scene(), world, { x: 14, y: 1, z: -3 },
            { kind: 'sentinel' });
        const src = captureDuring(() => e._beginWindup(() => {}, { windup: 0.4 }));
        t.ok('an enemy wind-up is placed at the enemy', placedAt(src, 14, -3),
            `placed at ${JSON.stringify(src)} — expected the enemy at (14,-3)`);
        // And it lands on the correct side, which is the whole claim.
        t.ok('so a wind-up from frame-right is heard on the right', panOf(src) > 0,
            `pan=${panOf(src)}`);
    }

    // ── INTEGRATION: boss actions, placed by the framework ─────────────────
    {
        listenAtOrigin();
        const mesh = new THREE.Group();
        const boss = new BossBase(new THREE.Scene(), {
            id: 'spatial-test', name: 'Spatial Test', hp: 20,
            position: { x: -18, z: 5 }, mesh,
        });
        boss.tickAI = () => {};
        const player = { root: { position: { x: 0, y: 1.95, z: 0 } }, health: { dead: false } };

        // A roster-style action whose only sound is in onWindup, exactly as the
        // fourteen real ones are written.
        let windupSrc = null;
        boss.startAction({
            name: 'test', windup: 0.4, recover: 0.3,
            aim: () => ({ x: 0, z: 0, radius: 2 }),
            onWindup: () => { windupSrc = _currentSource(); },
            strike: () => {},
        }, player);
        t.ok('a boss wind-up is placed at the boss', placedAt(windupSrc, -18, 5),
            `placed at ${JSON.stringify(windupSrc)} — expected the boss at (-18,5)`);
        t.ok('so a boss winding up at frame-left is heard on the left',
            panOf(windupSrc) < 0, `pan=${panOf(windupSrc)}`);

        // The strike and the recovery too — three hooks, one rule.
        let strikeSrc = null, recoverSrc = null;
        boss.action.def.strike = () => { strikeSrc = _currentSource(); };
        boss.action.def.onRecover = () => { recoverSrc = _currentSource(); };
        boss.runAction(1, player, null);   // windup elapses → strike
        boss.runAction(1, player, null);   // recovery elapses → onRecover
        t.ok('the strike is placed too', placedAt(strikeSrc, -18),
            JSON.stringify(strikeSrc));
        t.ok('and the recovery', placedAt(recoverSrc, -18),
            JSON.stringify(recoverSrc));
        t.ok('with nothing left in scope afterwards', _currentSource() === null);
    }

    // ── INTEGRATION: the phase change, both halves ─────────────────────────
    {
        listenAtOrigin();
        const mesh = new THREE.Group();
        const boss = new BossBase(new THREE.Scene(), {
            id: 'phase-test', name: 'Phase Test', hp: 10,
            position: { x: 9, z: 0 }, mesh, phaseThresholds: [0.6],
        });
        boss.tickAI = () => {};

        let phaseSrc = 'not-called';
        const realPhase = sfx.phase;
        sfx.phase = () => { phaseSrc = _currentSource(); };
        try {
            boss.hp = 5;                 // below the 0.6 threshold
            boss._checkPhase();
        } finally { sfx.phase = realPhase; }

        t.ok('a phase change reaches phase 2', boss.phase === 2, `phase=${boss.phase}`);
        t.ok('and its alarm is placed at the boss', placedAt(phaseSrc, 9, 0),
            JSON.stringify(phaseSrc));

        // The musical half. Without a live AudioContext there is no score
        // playing, so the honest assertion is that it declines cleanly rather
        // than throwing inside a phase transition — the score render e2e is
        // where the notes themselves are checked.
        t.ok('the score is not playing under a unit test',
            _scoreState().playing === false);
        t.ok('so the stinger declines instead of throwing', scoreStinger(2) === false);
        t.ok('and declines for every phase it might be handed',
            scoreStinger(1) === false && scoreStinger(3) === false
            && scoreStinger(99) === false);
    }

    // ── The stinger is music, not a beep ───────────────────────────────────
    // The notes are scale DEGREES so they resolve into whatever key the track
    // is in, and every dungeon is in a different one. Checked against every
    // real track rather than a representative one (trap 5): a figure that is
    // in key for the boss theme and out of key for the Leviathan's is worse
    // than no stinger, and picking one track to check is how you would ship
    // that. Verified in the live game for the boss theme in D harmonic minor:
    // phase 2 plays D–F–A–D, phase 3 plays D–F–A–C#.
    {
        const ids = [
            ...Object.keys(BASE_TRACKS),
            ...Object.keys(BEAT_TRACKS),
            ...Object.keys(REGION_TRACKS),
        ];
        t.ok('every track in the game is checked, not a sample',
            ids.length >= 20, `${ids.length} tracks`);

        // NOT ASSERTED HERE: "every note is in key". That one cannot fail.
        // `scaleNote` maps any integer degree onto a scale tone by
        // construction, so the assertion would be testing `scaleNote` and
        // reporting it as a fact about the stingers — green, permanent, and
        // worth nothing. Being in key is structural: the figures are degrees
        // and `scoreStinger` runs them through the track's own mode.
        //
        // What IS a choice, and what the vacuous version was standing in for,
        // is that they are written as DEGREES rather than semitones. [0,3,7,12]
        // is the natural way to write a minor triad if you think in semitones,
        // it is silently legal, and it would transpose the figure most of two
        // octaves up and out of the bells' register.
        const allDegrees = Object.values(STINGER_FIGURES).flat();
        t.ok('the figures are scale degrees, not semitones',
            allDegrees.every((d) => Number.isInteger(d) && d >= 0 && d <= 7),
            `degrees: ${allDegrees.join(',')} — anything above 7 is a semitone `
            + 'offset written into a degree field');

        // The audible claim, checked against every real track: the two phases
        // must not collapse to the same pitches in any key or mode.
        const indistinct = [];
        for (const id of ids) {
            const trk = resolveTrack(id);
            const root = noteToMidi(trk.key);
            const render = (fig) => fig.map(
                (d) => scaleNote(root + 24, trk.mode, d)).join(',');
            if (render(STINGER_FIGURES[2]) === render(STINGER_FIGURES[3])) indistinct.push(id);
        }
        t.ok('phase 3 is audibly a different figure from phase 2, in every track',
            indistinct.length === 0,
            `identical in: ${indistinct.join(', ')} — the player must be able to `
            + 'hear which phase they entered');

        // Phase 2 resolves to the octave; phase 3 stops one degree short, so it
        // lands unresolved. That is the whole idea, so it is worth stating.
        t.ok('phase 2 closes on the octave',
            STINGER_FIGURES[2][STINGER_FIGURES[2].length - 1] === 7);
        t.ok('phase 3 stops short of it', STINGER_FIGURES[3][STINGER_FIGURES[3].length - 1] === 6,
            'the fight is not over and the tune says so');
        t.ok('both open on the same three notes',
            STINGER_FIGURES[2].slice(0, 3).join() === STINGER_FIGURES[3].slice(0, 3).join(),
            'they must read as the same gesture, changed — not as two unrelated cues');
    }

    clearListener();
}
