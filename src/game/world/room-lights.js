// @ts-check
// The emissive motif each dungeon has always declared, finally built.
//
// `dungeon-kits.js` has carried an `emissive` field for all fourteen dungeons
// since it was written — `cold_shaft`, `capacitor_arc`, `trench_glow`,
// `ember_pool`, `scan_line`. Nothing read it. Grepping for `kit.emissive`
// returned zero consumers, and grepping for `userData.localLight` — the tag the
// pooled light manager scans for — returned exactly one hit: the line inside
// the pool that reads it.
//
// So the game had an authored plan for what glows in every room, a working
// budgeted point-light system to make it glow, and no wire between them. Every
// bright thing in Sovereign Scar was a bright rectangle that lit nothing: in
// `beat-12-pyre-entry.png` there is molten lava in a basin and the violet stone
// two metres away from it is exactly as dark as the stone across the room. That
// is most of why the rooms read as painted cardboard rather than places.
//
// Two rules the fixtures obey, both learned from failures already in this repo:
//
//  * **Emissive stays under the bloom threshold.** `UnrealBloomPass` threshold
//    is 0.85 on post-tonemap luminance. The boss roster set 1.1–1.5 and turned
//    the Cryo arena into a white blob. A fixture's job is to LIGHT the room, and
//    the light comes from the point light, not from blowing out its own pixels.
//  * **The fixture is placed, the light is registered.** Both, at bake time,
//    into the room record — so `disposeRoom` frees them together and a light
//    can never outlive the thing that appears to be emitting it.

import * as THREE from 'three';
import { markShadowRoles } from '../render/shadow-roles.js';

/**
 * One entry per motif declared in `dungeon-kits.js`. `color` is the light AND
 * the fixture's emissive tint, because a lamp whose glow disagrees with the
 * light it casts reads as two objects.
 *
 * `place` says where in the room the fixtures go, and is the thing that keeps
 * this from being wallpaper:
 *   'walls'  — set into the perimeter, lighting inward across the floor
 *   'floor'  — pools and vents, lighting upward onto whatever stands over them
 *   'high'   — shafts and rails near the ceiling, lighting a wide soft area
 */
// Intensities were cut 45% after the first capture pass.
//
// The fixtures worked — the Crypt's cold shafts are visible in
// `beat-01-crypt-entry.png` and they light the floor around them. But four
// lamps at 4–6.5 intensity, added on top of a key and an ambient that were
// tuned for a room with NO local lights, flattened the value structure: the
// capture came back as a pale grey-blue wash with no shadow left in it. A
// motivated light is supposed to describe form, which means it has to leave
// somewhere dark to describe it against.
// `live` says how the fixture moves. Measured before this was added
// (`tests/qa/ambient-motion.mjs`): across four levels and 24 lights, the
// maximum change in intensity over a second of standing still was **0.0000**.
// Every lamp in the game was a painted rectangle. The kind is declared here
// rather than sniffed from the motif's name, because a name is a label and
// this is a behaviour — see the `legacy` roster note in elites.spec.mjs for
// what guessing from names costs.
//
//   flame    — fire and hot rock: irregular, three incommensurate sines
//   machine  — powered fixtures: a steadier, shallower pulse
//   water    — reflected and bubbling light: slow and wide
export const MOTIFS = {
    cold_shaft:      { color: 0x7fe0ff, intensity: 3.0, distance: 16, place: 'high',  size: [0.5, 2.6, 0.5],  live: 'machine' },
    capacitor_arc:   { color: 0xffd060, intensity: 2.8, distance: 13, place: 'walls', size: [0.7, 0.7, 0.35], live: 'machine' },
    trench_glow:     { color: 0xc8a060, intensity: 2.2, distance: 14, place: 'floor', size: [2.2, 0.14, 0.9], live: 'flame' },
    vertical_shaft:  { color: 0xbfe0ff, intensity: 3.3, distance: 18, place: 'high',  size: [0.6, 3.2, 0.6],  live: 'machine' },
    seam_gold:       { color: 0xd4a84b, intensity: 2.5, distance: 14, place: 'walls', size: [0.28, 2.0, 0.3], live: 'flame' },
    mineral_seam:    { color: 0xff6030, intensity: 2.5, distance: 13, place: 'walls', size: [0.4, 1.4, 0.35], live: 'flame' },
    wet_reflection:  { color: 0x4a9fd4, intensity: 2.0, distance: 15, place: 'floor', size: [2.6, 0.12, 1.2], live: 'water' },
    marrow_glow:     { color: 0xe8e0d0, intensity: 2.3, distance: 14, place: 'walls', size: [0.45, 1.1, 0.35], live: 'flame' },
    window_glow:     { color: 0xb0a890, intensity: 2.4, distance: 13, place: 'walls', size: [1.0, 0.9, 0.3],  live: 'water' },
    condenser_glow:  { color: 0xa0e8ff, intensity: 2.8, distance: 15, place: 'walls', size: [0.6, 1.2, 0.4],  live: 'machine' },
    bubble_glow:     { color: 0x8fb060, intensity: 1.9, distance: 12, place: 'floor', size: [1.1, 0.12, 1.1], live: 'water' },
    ember_pool:      { color: 0xff5520, intensity: 3.6, distance: 15, place: 'floor', size: [1.8, 0.12, 1.8], live: 'flame' },
    scan_line:       { color: 0xff40c8, intensity: 2.5, distance: 14, place: 'high',  size: [3.0, 0.16, 0.22], live: 'machine' },
    seam_violet:     { color: 0x8b5cf6, intensity: 2.8, distance: 16, place: 'walls', size: [0.3, 2.4, 0.32], live: 'machine' },
};

/**
 * How far each kind swings, as a fraction of its base intensity.
 *
 * These are deliberately small. The certification gate bands mean frame
 * luminance, and one region already sits 4 units under its ceiling, so a lamp
 * that swings hard would fail a screen for being alive. Every wave below is a
 * sum of pure sines about zero, so the TIME AVERAGE of each light is exactly
 * its old constant value — the rooms cannot get brighter on average, only
 * restless.
 */
const LIVE = {
    flame:   { amp: 0.13, speed: 1.00 },
    machine: { amp: 0.06, speed: 0.75 },
    water:   { amp: 0.09, speed: 0.42 },
};

/** Fixtures currently in the world, so one call can animate all of them. */
const liveFixtures = new Set();

/**
 * Zero-mean wave for a fixture. Three incommensurate sines never repeat on a
 * period a player can spot, which is the whole difference between "a torch"
 * and "a blinking light".
 */
function waveAt(kind, t, phase) {
    if (kind === 'machine') {
        return 0.72 * Math.sin(t * 2.20 + phase) + 0.28 * Math.sin(t * 5.90 + phase * 2.1);
    }
    if (kind === 'water') {
        return 0.62 * Math.sin(t * 0.90 + phase) + 0.38 * Math.sin(t * 1.53 + phase * 1.6);
    }
    return 0.50 * Math.sin(t * 1.70 + phase)
        + 0.30 * Math.sin(t * 2.90 + phase * 1.7)
        + 0.20 * Math.sin(t * 4.70 + phase * 2.3);
}

/**
 * Breathe every live fixture. Must run BEFORE `LocalLightPool.update()`, which
 * copies `source.intensity` onto the real light each frame — that copy is the
 * only reason this works without touching the pool at all.
 *
 * @param {number} t seconds; any monotonic clock
 */
export function updateRoomLightFlicker(t) {
    for (const f of liveFixtures) {
        f.source.intensity = f.base * (1 + f.amp * waveAt(f.kind, t * f.speed, f.phase));
    }
}

/** Test seam: how many fixtures are currently animated. */
export function liveFixtureCount() {
    return liveFixtures.size;
}

/**
 * Emissive intensity for a fixture.
 *
 * Deliberately below the bloom threshold (0.85). The fixture reads as a lamp
 * because of what it does to the room, not because its own pixels are clipped —
 * which is the mistake that made the boss arenas unreadable.
 */
export const FIXTURE_EMISSIVE = 0.62;

/** Deterministic per-room placement — same room, same lamps, every load. */
function rng(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

/**
 * How many fixtures a room gets. Scales with room size so a big hall is not lit
 * by one lamp, capped so the pool's budget is a selection rather than a queue.
 */
export function fixtureCount(half) {
    // half/3 was measured live and came out too sparse: the Pyre's entry room
    // (half 7) got two lamps, which lights one side of a fourteen-metre room.
    // half/2.2 gives 3 in a small room and 5 in a hall.
    return Math.max(3, Math.min(6, Math.round(half / 2.2)));
}

/**
 * Place this room's fixtures and register their lights.
 *
 * @param {object} kit      the dungeon kit (may be undefined — overworld)
 * @param {object} room     room def (half, wallH)
 * @param {string} roomId
 * @param {{x:number,z:number}} origin  room origin in world space
 * @param {THREE.Scene} scene
 * @param {object} pool     LocalLightPool (may be null in tests)
 * @returns {{group:THREE.Group, sources:Array, material?:any, flickers?:any}|null}
 */
export function buildRoomLights(kit, room, roomId, origin, scene, pool) {
    const motif = kit && MOTIFS[kit.emissive];
    if (!motif || !scene) return null;

    const half = room.half || 8;
    const wallH = room.wallH || 4;
    const n = fixtureCount(half);
    const rand = rng(`${kit.name}:${roomId}`);
    const group = new THREE.Group();
    group.name = `room-lights:${roomId}`;
    const sources = [];
    const flickers = [];

    const mat = new THREE.MeshStandardMaterial({
        color: motif.color,
        emissive: motif.color,
        emissiveIntensity: FIXTURE_EMISSIVE,
        roughness: 0.4,
        metalness: 0.1,
    });

    for (let i = 0; i < n; i++) {
        // Spread around the room rather than clustering: an even bearing with a
        // jittered radius, so light arrives from several directions and the
        // room gets modelled instead of flood-lit from one corner.
        const a = ((i + 0.5) / n) * Math.PI * 2 + rand() * 0.5;
        let x, y, z;
        if (motif.place === 'walls') {
            const inset = half - 0.7;
            x = Math.cos(a) * inset;
            z = Math.sin(a) * inset;
            y = 1 + wallH * 0.55;
        } else if (motif.place === 'high') {
            const r = half * (0.45 + rand() * 0.4);
            x = Math.cos(a) * r;
            z = Math.sin(a) * r;
            y = 1 + wallH * 0.92;
        } else { // floor
            const r = half * (0.35 + rand() * 0.45);
            x = Math.cos(a) * r;
            z = Math.sin(a) * r;
            y = 1.08;
        }

        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...motif.size), mat);
        mesh.position.set(origin.x + x, y, origin.z + z);
        group.add(mesh);

        // The light sits slightly off the fixture, toward the room, so the lamp
        // does not shadow itself into a dark box with a bright rim.
        const ly = motif.place === 'floor' ? y + 0.5 : y;
        const pull = motif.place === 'walls' ? 0.9 : 0;
        const src = {
            x: origin.x + x * (1 - pull / Math.max(1, half)),
            y: ly,
            z: origin.z + z * (1 - pull / Math.max(1, half)),
            color: motif.color,
            intensity: motif.intensity,
            distance: motif.distance,
            // Priority 1: a room's own fixtures should outrank anything a level
            // registered globally when the player is standing in that room.
            priority: 1,
        };
        // The tag is the contract — a fixture that only exists in a private
        // array is invisible to every other consumer, which is precisely how
        // the previous system ended up with zero sources. Registration goes
        // through `registerMesh` so the pool dedupes it against its own
        // `scan(scene)` at level load rather than counting the lamp twice.
        mesh.userData.localLight = {
            color: motif.color,
            intensity: motif.intensity,
            distance: motif.distance,
            priority: 1,
        };
        // Position the source, then let the pool read the tag off the mesh.
        mesh.updateWorldMatrix?.(true, false);
        const registered = pool ? pool.registerMesh(mesh) : null;
        if (registered) {
            // The light pulls slightly off a wall fixture so the lamp does not
            // shadow itself into a dark box with a bright rim.
            registered.x = src.x; registered.y = src.y; registered.z = src.z;
        }
        const source = registered || src;
        sources.push(source);
        mesh.userData.localLightSource = registered || null;

        // Give the fixture its own life. The phase comes from the SAME seeded
        // rng that placed it, so a room breathes identically on every run and
        // a capture of it is still reproducible — the certification PNGs
        // depend on that.
        const live = LIVE[motif.live];
        if (live) {
            const rec = {
                source,
                base: source.intensity,
                kind: motif.live,
                amp: live.amp,
                speed: live.speed,
                phase: rand() * Math.PI * 2,
            };
            liveFixtures.add(rec);
            flickers.push(rec);
        }
    }

    // A lamp is a light, not an occluder: casting shadow from the thing the
    // light comes out of produces a black disc under every fixture.
    markShadowRoles(group);
    group.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
    });
    scene.add(group);
    return { group, sources, material: mat, flickers };
}

/** Free a room's fixtures and unregister their lights. */
export function disposeRoomLights(rec, pool) {
    if (!rec) return;
    // Unregister BEFORE anything else. A flicker record left in the set keeps
    // writing an intensity onto a source belonging to a room that no longer
    // exists — the set would grow for the life of the session and the pool
    // would be handed values by a ghost.
    for (const f of (rec.flickers || [])) liveFixtures.delete(f);
    rec.group?.traverse?.((o) => {
        if (!o.isMesh) return;
        // Unregister through the pool so its dedupe map is cleaned too — a
        // stale WeakMap entry would refuse to re-register the fixture if this
        // room is ever baked again.
        pool?.forgetMesh?.(o);
        o.geometry.dispose();
    });
    if (rec.group?.parent) rec.group.parent.remove(rec.group);
    rec.material?.dispose?.();
}
