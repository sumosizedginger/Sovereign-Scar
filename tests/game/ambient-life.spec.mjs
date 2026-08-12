// tests/game/ambient-life.spec.mjs — the room is alive when you are standing still.
//
// WHAT WAS MEASURED FIRST
//
// `tests/qa/ambient-motion.mjs` holds the player perfectly still, samples the
// whole scene twice a second apart, and reports what moved. Before this
// feature, across four levels and twenty-four lights:
//
//     lights   24 objects   0 moving   max Δintensity 0.0000
//
// Not "a bit static" — exactly zero, everywhere. Every lamp in the game was a
// painted rectangle. (The same probe also corrected the plan: the dust motes
// were ALREADY drifting, and the "banners, chains and vents" the doc wanted to
// sway do not exist as named objects. Only the lights were actually dead.)
//
// WHAT THIS PINS, AND WHY EACH ONE
//
//   1. Fixtures register, and de-register. A flicker record left behind after
//      a room is torn down keeps writing intensities onto a dead source for
//      the rest of the session.
//   2. The intensity actually changes over time. This is the feature.
//   3. Fixtures do NOT move in lockstep. One shared phase is a room-wide
//      blink, which looks like a fault rather than like firelight.
//   4. **The time-average of every light equals its old constant value.**
//      This is the one that protects everything else. The certification gate
//      bands mean frame luminance and one region already sits four units
//      under its ceiling; a wave with any DC offset would raise every room's
//      average brightness and start failing screens for being alive. The
//      waves are sums of pure sines about zero precisely so this holds.
//   5. The phase is seeded, so a room breathes identically on every run and
//      its captures stay reproducible.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
    MOTIFS, buildRoomLights, disposeRoomLights,
    updateRoomLightFlicker, liveFixtureCount,
} from '../../src/game/world/room-lights.js';
import { Enemy, IDLE_ARC } from '../../src/game/enemy.js';

/** A kit that lights its rooms with the named motif. */
const kitFor = (emissive, name = 'test-kit') => ({ name, emissive });
const ROOM = { half: 8, wallH: 4 };
const ORIGIN = { x: 0, z: 0 };

/** Builds one room's lights into a throwaway scene. */
function bake(emissive, roomId = 'r1', kitName = 'test-kit') {
    const scene = new THREE.Scene();
    return { scene, rec: buildRoomLights(kitFor(emissive, kitName), ROOM, roomId, ORIGIN, scene, null) };
}

export function run(t) {
    // ── 0. Every motif declares how it lives ───────────────────────────────
    // A motif with no `live` is a lamp that silently goes back to being a
    // painted rectangle, and nothing else here would notice.
    const KINDS = ['flame', 'machine', 'water'];
    const missing = Object.entries(MOTIFS).filter(([, m]) => !KINDS.includes(m.live));
    t.ok('every emissive motif declares a flicker kind',
        missing.length === 0, missing.map(([k]) => k).join(', ') || 'all declared');

    // ── 1. Fixtures register and de-register ───────────────────────────────
    const before = liveFixtureCount();
    const a = bake('ember_pool', 'ra');
    t.ok('baking a room registers its fixtures for animation',
        liveFixtureCount() > before, `${before} -> ${liveFixtureCount()}`);
    t.ok('and the record is handed back on the room for teardown',
        Array.isArray(a.rec.flickers) && a.rec.flickers.length > 0,
        `${a.rec.flickers?.length} flickers`);

    const withOne = liveFixtureCount();
    const b = bake('capacitor_arc', 'rb');
    t.ok('a second room adds its own', liveFixtureCount() > withOne);
    disposeRoomLights(b.rec, null);
    t.ok('disposing a room removes exactly its own fixtures',
        liveFixtureCount() === withOne, `${liveFixtureCount()} vs ${withOne}`);

    // ── 2. The intensity actually moves ────────────────────────────────────
    const srcs = a.rec.sources;
    t.ok('the room has fixtures at all', srcs.length > 0, `${srcs.length}`);

    updateRoomLightFlicker(0);
    const at0 = srcs.map((s) => s.intensity);
    updateRoomLightFlicker(0.7);
    const at07 = srcs.map((s) => s.intensity);
    const moved = at0.filter((v, i) => Math.abs(v - at07[i]) > 1e-6).length;
    t.ok('every fixture changes intensity over time',
        moved === srcs.length, `${moved} of ${srcs.length} moved`);

    // ── 3. They do not blink in unison ─────────────────────────────────────
    // A single shared phase reads as an electrical fault, not as firelight.
    const spread = Math.max(...at0) - Math.min(...at0);
    t.ok('fixtures are out of phase with each other',
        srcs.length < 2 || spread > 1e-3, `spread ${spread.toFixed(4)}`);

    // ── 4. The time average is the old constant value ──────────────────────
    // Sampled over a long, non-harmonic window so no single wave lines up with
    // the sampling and fakes a clean mean.
    const bases = a.rec.flickers.map((f) => f.base);
    const sums = new Array(srcs.length).fill(0);
    const N = 4000;
    const SPAN = 613.0;                       // seconds; deliberately not round
    for (let k = 0; k < N; k++) {
        updateRoomLightFlicker((k / N) * SPAN);
        for (let i = 0; i < srcs.length; i++) sums[i] += srcs[i].intensity;
    }
    let worst = 0;
    for (let i = 0; i < srcs.length; i++) {
        worst = Math.max(worst, Math.abs(sums[i] / N - bases[i]) / bases[i]);
    }
    t.ok('each light averages to its original constant intensity (<0.5%)',
        worst < 0.005, `worst drift ${(worst * 100).toFixed(3)}%`);

    // And it never swings so far it reads as a strobe or dies to black.
    let lo = Infinity; let hi = 0;
    for (let k = 0; k < 600; k++) {
        updateRoomLightFlicker(k * 0.037);
        for (let i = 0; i < srcs.length; i++) {
            lo = Math.min(lo, srcs[i].intensity / bases[i]);
            hi = Math.max(hi, srcs[i].intensity / bases[i]);
        }
    }
    t.ok('the swing stays within a quarter of base either way',
        lo > 0.75 && hi < 1.25, `${lo.toFixed(3)}..${hi.toFixed(3)} of base`);

    // ── 5. Seeded, so captures stay reproducible ───────────────────────────
    // Same kit + same room id must produce the same phases, or a certification
    // screenshot of a lit room is a different picture every run.
    disposeRoomLights(a.rec, null);
    const p1 = bake('ember_pool', 'same-room', 'same-kit');
    const ph1 = p1.rec.flickers.map((f) => f.phase);
    disposeRoomLights(p1.rec, null);
    const p2 = bake('ember_pool', 'same-room', 'same-kit');
    const ph2 = p2.rec.flickers.map((f) => f.phase);
    t.ok('the same room bakes the same phases every time',
        ph1.length === ph2.length && ph1.every((v, i) => v === ph2[i]),
        `${ph1.map((v) => v.toFixed(2)).join(',')} vs ${ph2.map((v) => v.toFixed(2)).join(',')}`);
    disposeRoomLights(p2.rec, null);

    const q = bake('ember_pool', 'other-room', 'same-kit');
    const phq = q.rec.flickers.map((f) => f.phase);
    t.ok('but a different room does not', phq.some((v, i) => v !== ph1[i]));
    disposeRoomLights(q.rec, null);

    // ── 5b. Enemies look around when nothing is happening ──────────────────
    // Measured before this existed: enemy BODIES idle-animated on 87-94% of
    // their parts while **0 of 31 roots ever changed facing**. The animator was
    // never the problem — the branch outside aggro range was a bare `return`.
    {
        const far = { x: 0, y: 1, z: 0 };
        const e = new Enemy(new THREE.Scene(), null, far, { kind: 'sentinel' });
        // A player far outside aggro range: this is the branch under test.
        const player = { root: { position: new THREE.Vector3(500, 1, 500) } };
        const yaw = () => e.rig.rotation.y;

        const y0 = yaw();
        let turned = false;
        let maxOff = 0;
        const home = y0;
        for (let i = 0; i < 900; i++) {                 // 15 s at 60 fps
            e.update(1 / 60, player, []);
            if (Math.abs(yaw() - y0) > 1e-4) turned = true;
            let d = yaw() - home;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            maxOff = Math.max(maxOff, Math.abs(d));
        }
        t.ok('an enemy out of aggro range changes facing at all', turned,
            `yaw ${y0.toFixed(3)} -> ${yaw().toFixed(3)}`);

        // The arc must stay bounded around the SPAWN facing. The first version
        // offset from current facing, so the offsets compounded and an idle
        // enemy slowly span on the spot forever.
        t.ok('and it glances around its spawn facing rather than spinning',
            maxOff <= IDLE_ARC + 0.05, `max offset ${maxOff.toFixed(3)} rad vs arc ${IDLE_ARC}`);
        t.ok('the glance is a real look, not a twitch',
            maxOff > 0.15, `max offset ${maxOff.toFixed(3)} rad`);

        // Two enemies spawned in different places must not scan in lockstep —
        // a room of enemies turning as one reads as a cutscene, not a room.
        const a2 = new Enemy(new THREE.Scene(), null, { x: 7, y: 1, z: -3 }, { kind: 'sentinel' });
        const b2 = new Enemy(new THREE.Scene(), null, { x: -4, y: 1, z: 9 }, { kind: 'sentinel' });
        let apart = 0;
        for (let i = 0; i < 600; i++) {
            a2.update(1 / 60, player, []);
            b2.update(1 / 60, player, []);
            apart = Math.max(apart, Math.abs(a2.rig.rotation.y - b2.rig.rotation.y));
        }
        t.ok('two enemies do not glance in unison', apart > 0.1,
            `max divergence ${apart.toFixed(3)} rad`);

        // Same spawn, same look — the certification captures include rooms
        // with enemies standing in them.
        const seeded = () => {
            const g = new Enemy(new THREE.Scene(), null, { x: 2, y: 1, z: 5 }, { kind: 'sentinel' });
            for (let i = 0; i < 300; i++) g.update(1 / 60, player, []);
            return g.rig.rotation.y;
        };
        t.ok('the same spawn produces the same idle every run', seeded() === seeded());
    }

    // ── 6. The building is wired to the alarm ──────────────────────────────
    // Everything above tests `room-lights.js` in isolation, and every one of
    // those assertions stays green if the frame loop never calls it — the
    // lamps would go back to being painted rectangles with a fully passing
    // suite. That is this project's most expensive recurring bug, so the call
    // site itself is asserted, including its ORDER: the pool copies
    // `source.intensity` onto the real lights, so a flicker that runs after it
    // is a frame stale, and one that never runs does nothing at all.
    const idx = fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'game', 'index.js'),
        'utf8');
    t.ok('index.js imports the flicker', /import\s*\{[^}]*updateRoomLightFlicker[^}]*\}\s*from\s*'\.\/world\/room-lights\.js'/.test(idx));
    const callAt = idx.indexOf('updateRoomLightFlicker(');
    const poolAt = idx.indexOf('localLights.update(');
    t.ok('index.js calls it every frame', callAt > 0, `index ${callAt}`);
    t.ok('and calls it BEFORE the light pool copies intensities out',
        callAt > 0 && poolAt > 0 && callAt < poolAt, `flicker@${callAt} pool@${poolAt}`);
    t.ok('the pool still copies source intensity onto the light each frame',
        /l\.intensity\s*=\s*s\.intensity/.test(fs.readFileSync(
            path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'game', 'fx', 'local-light-pool.js'),
            'utf8')),
        'without this copy the whole feature is inert');

    // ── 7. Nothing leaked ──────────────────────────────────────────────────
    // If this fails, every later run of this spec is animating ghosts, and the
    // count-based assertions above start passing for the wrong reason.
    t.ok('the spec left no fixtures registered behind it',
        liveFixtureCount() === before, `${liveFixtureCount()} vs ${before}`);
}
