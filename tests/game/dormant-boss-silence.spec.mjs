// tests/game/dormant-boss-silence.spec.mjs — a boss you have not met is silent.
//
// THE BUG THIS EXISTS TO PIN
//
// Owner report, 2026-08-13, standing still in the ENTRANCE room of 04 Sky
// Monument at 6/6 hearts:
//
//   "I see no exploding mote, and it starts as soon as I enter the dungeon and
//    stand there, and it continues to go off, there is nothing hitting me,
//    nothing exploding, nothing giving any sign of what is causing me harm."
//
// Measured with `tests/qa/_doot-census.mjs` — load the level, touch nothing,
// listen for 18 seconds:
//
//      3.31s  sfx.block
//      4.56s  sfx.block
//      9.47s  sfx.block
//     13.21s  sfx.block
//     15.62s  sfx.block
//     caller: KineticCore.tickAI <- BossBase.update <- room-graph.js:1520
//
// The beat-04 boss bounces around its arena, and `bounceArena` plays the metal
// guard-clang off every wall it hits. Its anchor is at world z −256; the player
// was at z +4.5. There was "no sign of what is causing me harm" because nothing
// was — a boss was rattling around a room they had never entered, at full
// volume, because the sound was never placed.
//
// THE GUARD EXISTED AND GUARDED THE WRONG HALF
//
// `attachBoss` already computed `awake`, with a comment stating the intent:
// "While the player is outside the wake radius the boss still animates, but
// sees no player." It then called
//
//     boss.update(dt, awake ? game.player : null, game)
//
// so a dormant boss kept moving and kept making noise, and only its TARGETING
// went blind. The unstated half of "still animates" was "and is still heard
// across the dungeon".
//
// WHY THE FIX IS A MIXER SCOPE AND NOT A FLAG ON THE BOSS
//
// The noise is five separate `sfx.*` calls buried in one subclass's AI, and
// there are fourteen bosses. Every voice in the game already routes through
// `spatialize`, so `silenced()` is one place instead of a call site per sound
// per boss. Distance could not have fixed it either: `MIN_DISTANCE_GAIN` is
// 0.35, so even a correctly placed source on the far side of the dungeon still
// arrives at a third of full volume. "Far away" and "not happening" are
// different questions.
//
// BOTH DIRECTIONS, because a mute that never lifts passes the first half of
// this spec and deletes the audio of every boss fight in the game.

import * as THREE from 'three';
import { attachBoss } from '../../src/game/bosses/base.js';
import {
    silenced, spatialize, setListener, clearListener, _isMuted,
} from '../../src/audio/spatial.js';

/** A minimal AudioContext: enough for `spatialize` to build nodes. */
function fakeCtx() {
    const made = [];
    return {
        made,
        createGain() {
            const n = { gain: { value: 1 }, connected: null, connect(d) { this.connected = d; } };
            made.push(n);
            return n;
        },
        createStereoPanner() {
            const n = { pan: { value: 0 }, connected: null, connect(d) { this.connected = d; } };
            made.push(n);
            return n;
        },
    };
}

/** A level that just collects the systems attached to it. */
function fakeLevel() {
    const systems = [];
    return {
        systems,
        addSystem(s) { systems.push(s); },
        scene: new THREE.Scene(),
        keyStore: { open() {}, isOpen: () => false },
        rooms: {},
        // `attachBoss` registers the boss into the level's enemy list. Supplying
        // the real shapes it reaches for, rather than trimming the fixture until
        // it stops throwing — a fixture pruned to whatever the code touches
        // today breaks the moment the code touches one thing more.
        enemies: [],
        lightPool: null,
    };
}

/**
 * A boss that records whether it was heard, driven through the real
 * `attachBoss` system rather than through a copy of its wake check.
 */
function fakeBoss(home) {
    return {
        home,
        root: new THREE.Object3D(),
        state: { current: 'IDLE' },
        defeated: false,
        health: { hp: 10, max: 10 },
        sawPlayer: [],
        ticks: 0,
        // The thing under test: does a noise made in here reach the mixer?
        heardAsAudible: 0,
        update(dt, player) {
            this.ticks++;
            this.sawPlayer.push(!!player);
            // Exactly what `KineticCore.tickAI` does on a wall bounce: play a
            // sound, with no idea whether anyone is in the room.
            if (!_isMuted()) this.heardAsAudible++;
        },
    };
}

function driveOnce(bossHome, playerAt) {
    const level = fakeLevel();
    const boss = fakeBoss(bossHome);
    boss.root.position.set(bossHome.x, 1, bossHome.z);
    attachBoss(level, boss, {});
    const game = {
        player: { root: { position: playerAt }, health: { hp: 6 } },
        level,
    };
    for (const s of level.systems) if (s.update) s.update(1 / 60, game);
    return boss;
}

export function run(t) {
    // ── 1. THE MIXER SCOPE ITSELF ──────────────────────────────────────────
    {
        const ctx = fakeCtx();
        const dest = { id: 'destination' };

        // Unplaced and unsilenced: `spatialize` hands back the destination and
        // adds no nodes. This is the path the boss's clang took to full volume.
        clearListener();
        t.ok('an unplaced sound is untouched — full volume, no nodes',
            spatialize(ctx, dest) === dest && ctx.made.length === 0,
            `${ctx.made.length} nodes`);

        const out = silenced(() => spatialize(ctx, dest));
        t.ok('inside silenced(), the voice is NOT handed the destination',
            out !== dest, 'a node was inserted');
        t.ok('…and the node it gets is muted', out && out.gain?.value === 0,
            `gain ${out?.gain?.value}`);
        t.ok('…and still connects, so the graph shape is unchanged',
            out && out.connected === dest, 'connected to dest');
    }

    // ── 2. THE SCOPE RESTORES, INCLUDING THROUGH A THROW ───────────────────
    // A sticky mute is the worst possible failure here: the whole game goes
    // quiet and nothing reports it.
    {
        t.ok('not muted to begin with', !_isMuted());
        silenced(() => {});
        t.ok('not muted after a clean scope', !_isMuted());
        let threw = false;
        try {
            silenced(() => { throw new Error('boom'); });
        } catch (_) { threw = true; }
        t.ok('the scope rethrows', threw);
        t.ok('and is NOT left muted after a throw', !_isMuted(),
            'a sticky mute silences the entire game and reports nothing');

        // Nested, because a boss update could contain one.
        silenced(() => {
            silenced(() => {});
            t.ok('a nested scope leaves the outer one muted', _isMuted());
        });
        t.ok('and both unwind', !_isMuted());
    }

    // ── 3. A DORMANT BOSS IS SILENT — the report ───────────────────────────
    // Anchor at z −256, player at z +4.5: the real distance in 04 Sky Monument
    // when the owner heard it, and far outside the 40-unit wake radius.
    {
        const boss = driveOnce({ x: 0, z: -256 }, { x: 0.5, y: 2, z: 4.5 });
        t.ok('the dormant boss still ticks', boss.ticks > 0, `${boss.ticks} ticks`);
        t.ok('…and sees no player, as it always did',
            boss.sawPlayer.every((v) => v === false), boss.sawPlayer.join(','));
        t.ok('…and is NOT heard', boss.heardAsAudible === 0,
            `${boss.heardAsAudible} audible`);
    }

    // ── 4. …AND IS HEARD AGAIN WHEN THE PLAYER IS THERE ────────────────────
    // The direction that matters. Without this, silencing every boss forever
    // passes section 3 and deletes fourteen boss fights' audio.
    {
        const boss = driveOnce({ x: 0, z: -256 }, { x: 0, y: 2, z: -256 });
        t.ok('the engaged boss ticks', boss.ticks > 0, `${boss.ticks} ticks`);
        t.ok('…and sees the player', boss.sawPlayer.some((v) => v === true),
            boss.sawPlayer.join(','));
        t.ok('…and IS heard', boss.heardAsAudible > 0,
            `${boss.heardAsAudible} audible — a mute that never lifts is worse `
            + 'than the bug it replaced');
    }

    // ── 5. THE EDGE OF THE WAKE RADIUS, BOTH SIDES ─────────────────────────
    // WAKE_RADIUS is 40. A spec that only tests 0 and 256 cannot tell a working
    // radius from `awake = true` hardcoded.
    {
        const inside = driveOnce({ x: 0, z: 0 }, { x: 0, y: 2, z: 30 });
        const outside = driveOnce({ x: 0, z: 0 }, { x: 0, y: 2, z: 50 });
        t.ok('30 units away: awake and audible', inside.heardAsAudible > 0,
            `${inside.heardAsAudible}`);
        t.ok('50 units away: dormant and silent', outside.heardAsAudible === 0,
            `${outside.heardAsAudible}`);
    }

    // ── 6. NOTHING IS LEFT MUTED BETWEEN FRAMES ────────────────────────────
    t.ok('the mixer is left unmuted after every case above', !_isMuted(),
        'must be false between frames');
    clearListener();
    setListener(0, 0, 12);
    clearListener();
}
