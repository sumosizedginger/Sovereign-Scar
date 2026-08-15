// tests/game/room-lights.spec.mjs — glowing things light the room they are in.
//
// The state this replaces, measured by grep rather than by opinion:
//
//   grep -rn "userData.localLight" src/  →  ONE hit, inside the pool that
//                                           reads the tag. Zero producers.
//   grep -rn "kit.emissive"        src/  →  ZERO hits, against fourteen
//                                           dungeons that each declare one.
//
// So the game shipped an authored plan for what glows in every room, a working
// budgeted point-light manager, and no wire between them. Every bright surface
// in Sovereign Scar was a bright rectangle that lit nothing — molten lava two
// metres from a wall the lava did not touch.
//
// These specs pin the wire itself, and the two ways it could silently come
// loose again: a motif with no fixture, and a fixture registered twice.

import * as THREE from 'three';
import {
    MOTIFS, FIXTURE_EMISSIVE, fixtureCount, buildRoomLights, disposeRoomLights,
} from '../../src/game/world/room-lights.js';
import { KITS } from '../../src/game/levels/dungeon-kits.js';
import { BEAT_LIST } from './_beat-defs.mjs';
import { shapeBossArena } from '../../src/game/world/kit-props.js';
import { LocalLightPool, selectActive } from '../../src/game/fx/local-light-pool.js';

/** A pool with no GL behind it — the selection logic is pure. */
function makePool(budget = 5) {
    return new LocalLightPool(new THREE.Scene(), { budget });
}

const ROOM = { half: 9, wallH: 4 };

export function run(t) {
    // ── Every dungeon's declared motif has to exist ─────────────────────────
    // The failure this catches is the one that produced the bug: a field that
    // reads like configuration, is spelled correctly, and resolves to nothing.
    const beats = Object.entries(KITS);
    t.ok('all fourteen dungeons declare an emissive motif',
        beats.length === 14 && beats.every(([, k]) => !!k.emissive),
        `${beats.filter(([, k]) => !!k.emissive).length}/${beats.length}`);
    for (const [id, kit] of beats) {
        t.ok(`${id}: its motif "${kit.emissive}" is implemented`,
            !!MOTIFS[kit.emissive], kit.emissive);
    }
    // And nothing unreachable in the other direction.
    const declared = new Set(beats.map(([, k]) => k.emissive));
    for (const name of Object.keys(MOTIFS)) {
        t.ok(`motif "${name}" is used by a dungeon`, declared.has(name));
    }

    // ── The wire: baking a room produces sources where there were none ──────
    {
        const pool = makePool();
        const scene = new THREE.Scene();
        t.ok('counterfactual: a pool starts with no sources at all — which is '
            + 'exactly the state the whole game shipped in',
            pool._sources.length === 0);
        const built = buildRoomLights(
            KITS['beat-12-pyre'], ROOM, 'caldera', { x: 64, z: -64 }, scene, pool
        );
        t.ok('baking a room registers real light sources',
            !!built && pool._sources.length > 0, `${pool._sources.length} sources`);
        t.ok('the number of fixtures scales with the room',
            built.sources.length === fixtureCount(ROOM.half),
            `${built.sources.length} for half=${ROOM.half}`);
        t.ok('the fixtures are added to the scene',
            scene.children.includes(built.group));
        // A light in the wrong place is worse than none: it tells the player to
        // look somewhere nothing is. Assert world space, not offsets.
        for (const s of built.sources) {
            const within = Math.abs(s.x - 64) <= ROOM.half + 0.5
                && Math.abs(s.z + 64) <= ROOM.half + 0.5;
            t.ok('every source sits inside the room it lights', within,
                `(${s.x.toFixed(1)}, ${s.z.toFixed(1)}) vs origin (64, -64)`);
        }
        t.ok("the pyre's lamps are the pyre's colour",
            built.sources.every((s) => s.color === MOTIFS.ember_pool.color));

        // ── Disposal ───────────────────────────────────────────────────────
        disposeRoomLights(built, pool);
        t.ok('disposing a room unregisters its lights',
            pool._sources.length === 0, `${pool._sources.length} left`);
        t.ok('disposing a room removes its fixtures from the scene',
            !scene.children.includes(built.group));
    }

    // ── Registering twice is the silent failure ─────────────────────────────
    // Rooms bake lazily, so the baker registers each fixture as it appears —
    // but `scan(scene)` still runs on level load and walks the same meshes.
    // Double registration does not just waste a budget slot, it doubles the
    // light, and both rows look legitimate.
    {
        const pool = makePool();
        const scene = new THREE.Scene();
        buildRoomLights(
            KITS['beat-10-cryo'], ROOM, 'twincage', { x: 0, z: 0 }, scene, pool
        );
        const afterBake = pool._sources.length;
        pool.scan(scene);
        t.ok('a level-load scan does not re-register what the baker registered',
            pool._sources.length === afterBake,
            `${afterBake} → ${pool._sources.length}`);
        // …and a room baked after the scan still registers normally.
        const second = buildRoomLights(
            KITS['beat-10-cryo'], ROOM, 'icefall', { x: 64, z: 0 }, scene, pool
        );
        t.ok('a room baked later still registers',
            pool._sources.length === afterBake + second.sources.length);
        // Re-baking a disposed room must work — a stale dedupe entry would
        // refuse it, and the room would come back unlit with no error.
        disposeRoomLights(second, pool);
        const third = buildRoomLights(
            KITS['beat-10-cryo'], ROOM, 'icefall', { x: 64, z: 0 }, scene, pool
        );
        t.ok('a room can be re-baked after disposal and lights again',
            third.sources.length === fixtureCount(ROOM.half)
            && pool._sources.length === afterBake + third.sources.length);
    }

    // ── Fixtures must not repeat the boss-arena blowout ─────────────────────
    // A lamp's job is to light the room. Clipping its own pixels is what turned
    // the Cryo boss arena into a white blob, and the bloom threshold is 0.85.
    t.ok('fixture emissive stays under the bloom threshold',
        FIXTURE_EMISSIVE < 0.85, `${FIXTURE_EMISSIVE}`);
    {
        const scene = new THREE.Scene();
        const built = buildRoomLights(
            KITS['beat-01-crypt'], ROOM, 'tomb', { x: 0, z: 0 }, scene, null
        );
        let peak = 0;
        built.group.traverse((o) => {
            if (o.isMesh) peak = Math.max(peak, o.material.emissiveIntensity || 0);
        });
        t.ok('no built fixture exceeds the threshold', peak < 0.85, `${peak}`);
        // A lamp that casts shadow puts a black disc under itself.
        let casters = 0;
        built.group.traverse((o) => { if (o.isMesh && o.castShadow) casters++; });
        t.ok('fixtures do not cast shadow', casters === 0, `${casters} casters`);
    }

    // ── Determinism ────────────────────────────────────────────────────────
    // Same room, same lamps, every load — or a save/reload changes the lighting
    // of a room the player already learned.
    {
        const a = buildRoomLights(KITS['beat-08-bone'], ROOM, 'ossuary', { x: 0, z: 0 }, new THREE.Scene(), null);
        const b = buildRoomLights(KITS['beat-08-bone'], ROOM, 'ossuary', { x: 0, z: 0 }, new THREE.Scene(), null);
        const same = a.sources.every((s, i) =>
            Math.abs(s.x - b.sources[i].x) < 1e-9 && Math.abs(s.z - b.sources[i].z) < 1e-9);
        t.ok('fixture placement is deterministic per room', same);
        const c = buildRoomLights(KITS['beat-08-bone'], ROOM, 'prayerhollow', { x: 0, z: 0 }, new THREE.Scene(), null);
        const differs = c.sources.some((s, i) => Math.abs(s.x - a.sources[i].x) > 1e-6);
        t.ok('different rooms get different placements', differs);
    }

    // ── The overworld has no kit and must stay untouched ────────────────────
    t.ok('a level with no kit places nothing',
        buildRoomLights(undefined, ROOM, 'scarfield', { x: 0, z: 0 }, new THREE.Scene(), null) === null);
    t.ok('a kit with an unknown motif places nothing',
        buildRoomLights({ emissive: 'nope' }, ROOM, 'r', { x: 0, z: 0 }, new THREE.Scene(), null) === null);

    // ── Priority: the boss outranks the room, the room outranks nothing ─────
    {
        const roomSrc = { x: 0, y: 1, z: 0, priority: 1, intensity: 4 };
        const bossSrc = { x: 8, y: 1, z: 0, priority: 2, intensity: 6 };
        const filler = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 1, z: 4, priority: 0 }));
        const picked = selectActive([...filler, roomSrc, bossSrc], { x: 0, y: 1, z: 0 }, 2);
        t.ok('a boss glow outranks room fixtures for a pooled slot',
            picked.includes(bossSrc) && picked.includes(roomSrc),
            `picked ${picked.length}`);
    }

    // ── Boss arenas must not be ordinary rooms ─────────────────────────────
    // `HOW-TO-CLOSE-THE-GAP.md` item 9 said the arena-shaping channel was
    // "barely used". Measured, that was wrong twice over: all fourteen kits
    // declare a `bossRule`, every boss room clears the `half >= 8` guard, and
    // every one places voxels. What WAS true is that the placement was wildly
    // uneven — `colonnade` put SIX single cells into a room 26 across while
    // other rules placed up to 272, so the two dungeons using it were the only
    // arenas a player could not tell from an ordinary room.
    //
    // A rule that is declared, reached, and then places nothing worth seeing is
    // the same failure as one that is never called; only the symptom differs.
    {
        const thin = [];
        for (const def of BEAT_LIST) {
            const kit = KITS[def.id];
            let room = null;
            for (const r of Object.values(def.rooms || {})) {
                if (typeof r.boss === 'function') room = r;
            }
            if (!room) continue;
            const placed = shapeBossArena(new Map(), kit, room, 0x808080);
            t.ok(`${def.id}: the boss arena is shaped at all`, placed > 0,
                `${kit?.bossRule} placed ${placed}`);
            if (placed < 16) thin.push(`${def.id} ${kit?.bossRule}=${placed}`);
        }
        t.ok('no boss arena is shaped so thinly it reads as an ordinary room',
            thin.length === 0, thin.join(', ') || 'none under 16 voxels');
    }
}
