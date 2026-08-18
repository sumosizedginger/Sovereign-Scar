// @ts-check
// Ambient sway — the one thing in a room that moves without being pushed.
//
// `docs/HOW-TO-CLOSE-THE-GAP.md` §3 item 3 was diagnosed three times and only
// the third was right, so the reasoning is repeated here rather than linked:
//
//   * Decorative props are stamped INTO the room's voxel map and come out fused
//     into one room mesh. There is no per-prop object to animate.
//   * Displacing them in the vertex shader instead does not work either, and
//     the reason is the load-bearing half of this file. `room-graph.js` answers
//     "is there ground here" with
//         built.getVoxelAt(x, y, z) || platformBuilt?.getVoxelAt?.(x, y, z)
//     and `getVoxelAt` reads the voxel MAP, never the mesh. Move a vertex and
//     physics keeps answering from the original cell: the player stands where
//     the banner used to be and the banner is somewhere else. Silent, and no
//     screenshot shows it.
//
// So the route is a THIRD mesh, built from its own map, registering no solids,
// and consulted by nothing. This module never calls `meshAndCollide` and never
// touches `collisionWorld` — it meshes the geometry itself, which is why there
// is no `getVoxelAt` on what it returns for anyone to accidentally wire up.
//
// ── Three rules that make the sway safe rather than merely pretty ───────────
//
// 1. IT HANGS FROM THE FAR WALL, AND NOWHERE ELSE. The camera is fixed-yaw
//    (see `wall-profile.js`), so the N wall is permanently the one you look at
//    and permanently BEHIND the hero. Dressing there cannot come between the
//    lens and the player no matter where they stand. It is also the only wall
//    whose top is a constant height — the ramp runs along z and the N wall has
//    only one z — which is what lets the shader derive its droop from a single
//    uniform instead of a per-vertex attribute.
//
// 2. IT STOPS WELL ABOVE THE BODY. `FLOOR_CLEARANCE` keeps the lowest cell of
//    every piece above the cells the hero occupies, with a cell to spare. A
//    banner the player can walk through is a banner that reads as a bug even
//    though the physics is right, and one they can walk INTO is a solid that
//    does not exist.
//
// 3. THE MOTION IS ZERO-MEAN AND SMALL. Sums of sines about zero, amplitude
//    under a third of a cell at the tip. The certification gate bands mean
//    frame luminance; geometry that drifts in one direction would slowly change
//    what the frame meters, which is the failure `room-lights.js` documents
//    avoiding for exactly the same reason.

import * as THREE from 'three';
import { buildVoxelGeo, vkey } from '../../voxel/core.js';
import { shadeHex } from '../../voxel/helpers.js';
import { VOXEL_SCALE } from '../assets/palettes.js';
import { wallProfile } from './wall-profile.js';
import { makeLevelMaterial } from '../render/materials.js';

const VS = VOXEL_SCALE;

/** Lowest cell any piece may occupy. The hero spans cells 1 and 2. */
export const FLOOR_CLEARANCE = 4;

/** Longest a piece may hang, in cells. Also the shader's droop normaliser. */
export const MAX_HANG = 8;

/** Tip displacement in world units, along the wall and then into the room. */
export const SWAY_X = 0.26;
export const SWAY_Z = 0.11;

/**
 * The five hanging kinds. Every one is a noun one of the fourteen kits already
 * declared in its `structural` or `dressing` list — `hanging_chains`,
 * `cable_coils`, `prayer_flags`, `marrow_roots`, `signage` — so this is those
 * words finally becoming objects rather than a new vocabulary.
 *
 * `width`/`depth` are in cells; `len` is the range of drop lengths; `stiff`
 * scales the sway amplitude, because a marrow root does not move like a
 * streamer and giving them one wave would make both read as the same object.
 */
export const SWAY_KINDS = {
    banner: { width: 3, depth: 1, len: [4, 7], stiff: 1.0, accentRate: 0.75 },
    chain: { width: 1, depth: 1, len: [3, 6], stiff: 0.85, accentRate: 0.2 },
    cable: { width: 1, depth: 1, len: [4, 7], stiff: 0.7, accentRate: 0.55 },
    root: { width: 1, depth: 1, len: [3, 5], stiff: 0.45, accentRate: 0.15 },
    streamer: { width: 2, depth: 1, len: [5, 8], stiff: 1.2, accentRate: 0.85 },
};

/** Deterministic stream from a room id — same room, same banners, every load. */
function rng(seed) {
    let h = 2166136261;
    for (let i = 0; i < String(seed).length; i++) {
        h ^= String(seed).charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

/**
 * Stamp a room's hanging dressing into a fresh map.
 *
 * Returns `{ map, anchorY, placed }`. `anchorY` is the cell the pieces hang
 * FROM — the far wall's top course — and the shader needs it to know how far
 * each vertex has drooped.
 *
 * `occupied` answers whether a room-local cell is already taken by the room
 * itself. Dressing that intersects a kit prop or a terrace is a banner growing
 * through a crate — and, worse, it makes the one invariant this file exists to
 * hold ("no dressing cell is ever returned by the room's voxel query")
 * untestable, because the query would be answering about the crate. Five such
 * cells were measured across the campaign before this predicate was passed in.
 *
 * @param {object} kit
 * @param {object} room
 * @param {string} roomId
 * @param {(x: number, y: number, z: number) => boolean} [occupied]
 */
export function stampDressing(kit, room, roomId, occupied = () => false) {
    const map = new Map();
    const spec = kit && SWAY_KINDS[kit.sway];
    const half = room?.half;
    if (!spec || !Number.isFinite(half) || half < 6) return { map, anchorY: 0, placed: 0 };

    const prof = wallProfile(room);
    // The N wall's top course. `wallTopAt` at z = -half is `prof.far` by
    // construction, but going through the profile means this cannot drift if
    // the ramp ever changes shape.
    const wallTop = prof.far;
    // ONE COURSE BELOW IT. Hung level with the parapet, a banner's top face is
    // as exposed to the key light as the wall cap and comes back as a bright
    // gold LEDGE — measured by shooting the citadel's entry room with the
    // dressing hidden and shown, which is the only way that reads as anything
    // but stone. Dropped a course, the wall above shades it and it reads as
    // something hanging off the wall, which is what it is.
    const anchorY = wallTop - 1;
    // Nothing to hang from: the wall is too short to clear the hero.
    if (anchorY - FLOOR_CLEARANCE < 1) return { map, anchorY, placed: 0 };

    const accent = kit.accent || 0xd4a84b;
    const base = room.wallColor || 0x6b7280;
    const rand = rng(`${kit.name}:sway:${roomId}`);

    // Doors on the far wall are gaps, and a banner across one is a lintel the
    // player will try to walk under. Skip the door's own cells and one either
    // side — DOOR_WIDTH is 2, so `at-2 .. at+2` clears the opening with a
    // margin. It was ±3 first, which on a half=8 wall left exactly two legal
    // banner slots out of thirteen and put ONE piece in the citadel's entry
    // room; a rule written wider than the thing it is avoiding is a rule about
    // nothing.
    const skip = new Set();
    for (const d of room.doors || []) {
        if (d.side !== 'N') continue;
        for (let i = -2; i <= 2; i++) skip.add(d.at + i);
    }

    // Hang one cell IN from the wall, so a piece reads as hanging off the face
    // rather than being part of it.
    const z = -half + 1;
    const count = Math.max(2, Math.round(half * 0.45));
    // ATTEMPTS, not pieces. A draw that lands on a door, off the end of the
    // wall, or on a cell already taken used to consume one of the room's
    // pieces, so a room could come out bare on four unlucky rolls — 31 of 108
    // rooms in the campaign were undressed for that reason and not because
    // there was nowhere to hang anything. Bounded, because an unbounded retry
    // in a bake is a hang, and this project has already lost a session to one.
    const ATTEMPTS = count * 6;
    let placed = 0;
    const taken = new Set();

    for (let i = 0; i < ATTEMPTS && placed < count; i++) {
        const x0 = Math.round((rand() * 2 - 1) * (half - 3));
        const w = spec.width;
        let clear = true;
        for (let dx = 0; dx < w; dx++) {
            const x = x0 + dx;
            // `half - 1` is the last interior cell; `half` is the corner post
            // of the side wall, which a banner must not grow into.
            if (Math.abs(x) > half - 1 || skip.has(x) || taken.has(x)) { clear = false; break; }
        }
        if (!clear) continue;

        const [lo, hi] = spec.len;
        let len = lo + Math.floor(rand() * (hi - lo + 1));
        // Clamp so the lowest cell clears the hero, and so the droop stays
        // inside the range the shader normalises over.
        len = Math.min(len, MAX_HANG, anchorY - FLOOR_CLEARANCE + 1);
        if (len < 2) continue;

        // Every cell of the piece, before any of them is written: a banner
        // half-stamped around a crate is worse than no banner.
        let free = true;
        for (let dx = 0; dx < w && free; dx++) {
            for (let dz = 0; dz < spec.depth && free; dz++) {
                for (let j = 0; j < len; j++) {
                    if (occupied(x0 + dx, anchorY - j, z + dz)) { free = false; break; }
                }
            }
        }
        if (!free) continue;

        const lit = rand() < spec.accentRate;
        for (let dx = 0; dx < w; dx++) {
            const x = x0 + dx;
            taken.add(x);
            // The accent runs as a STRIPE down the middle of a wide piece, not
            // across the whole of it. Three cells of full accent is a plate;
            // one cell of it between two of cloth is a device on a banner, and
            // it is also a third of the bright area on a frame the luminance
            // gate meters.
            const mid = w === 1 || dx === (w - 1) >> 1;
            for (let dz = 0; dz < spec.depth; dz++) {
                for (let j = 0; j < len; j++) {
                    const y = anchorY - j;
                    // Fade toward the tip so a piece is not a flat slab.
                    const t = j / Math.max(1, len - 1);
                    const color = (lit && mid)
                        ? shadeHex(accent, 0.86 - t * 0.24)
                        : shadeHex(base, 1.06 - t * 0.26);
                    map.set(vkey(x, y, z + dz), color);
                }
            }
        }
        placed++;
    }
    return { map, anchorY, placed, stiff: spec.stiff };
}

// ── The material ───────────────────────────────────────────────────────────

/** Every live dressing material, so one call can breathe all of them. */
const liveSway = new Set();

/**
 * The level material plus a vertex-stage droop.
 *
 * `makeLevelMaterial` already installs the audit's sanctioned bounded
 * `onBeforeCompile` and already edits `#include <begin_vertex>` — this wraps
 * that hook rather than replacing it, so the family response, the AO attribute
 * and the triplanar grain all still apply and dressing shades like the room it
 * hangs in.
 *
 * The cache key MUST differ from the level material's or three.js serves a
 * program compiled without any of this.
 */
export function makeDressingMaterial(anchorY, originY = 0, stiff = 1) {
    // `anchorY` is the topmost DRESSING cell, not the wall top. They differ by
    // a course, and using the wall's would give every piece a little sway at
    // its fixed end — a banner sliding sideways out of the wall it is nailed to.
    const mat = makeLevelMaterial({ roughness: 0.82, metalness: 0.03 });
    const base = mat.onBeforeCompile;
    const uniforms = swayUniforms(anchorY, originY, stiff);
    mat.userData.swayUniforms = uniforms;
    mat.onBeforeCompile = (shader) => {
        base(shader);
        injectSway(shader, uniforms);
    };
    mat.customProgramCacheKey = () => 'ss-dressing-sway-v1';
    return mat;
}

/**
 * The same droop, for the SHADOW pass.
 *
 * three.js renders shadow maps with its own depth material, which knows nothing
 * about a `onBeforeCompile` installed on the surface material. Without this the
 * banner moves and its shadow does not: the two separate by up to
 * `SWAY_X` = 0.26 world units on a wall that is one cell behind the cloth, which
 * is a quarter of a cell of daylight between an object and its own shadow. The
 * shadow census in `visual-sanity.spec.mjs` is what made this unavoidable rather
 * than a judgement call — it requires every solid mesh to receive shadow, and a
 * mesh that receives one while casting a lie is worse than one that does neither.
 */
export function makeDressingDepthMaterial(uniforms) {
    const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    mat.onBeforeCompile = (shader) => injectSway(shader, uniforms);
    mat.customProgramCacheKey = () => 'ss-dressing-sway-depth-v1';
    return mat;
}

function swayUniforms(anchorY, originY, stiff) {
    return {
        uSwayTime: { value: 0 },
        uSwayAnchor: { value: originY + (anchorY + 1) * VS },
        uSwaySpan: { value: MAX_HANG * VS },
        uSwayAmp: { value: stiff },
    };
}

/**
 * Write the droop into a compiled vertex stage, in place.
 *
 * Two shaders share this — the surface material and the depth material — and
 * they MUST share the uniform objects too, or the shadow swings on its own
 * clock. The surface material's own hook has already replaced
 * `#include <begin_vertex>` by the time this runs, which is why the two entry
 * points differ: the level material leaves a `vWorldPosition` line to hang the
 * droop above, and the bare depth shader does not.
 */
function injectSway(shader, uniforms) {
    if (!shader?.vertexShader) return;
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', /* glsl */`#include <common>
uniform float uSwayTime;
uniform float uSwayAnchor;
uniform float uSwaySpan;
uniform float uSwayAmp;`);

    const DROOP = /* glsl */`{
    vec3 anchorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    // How far this vertex has drooped below the course it hangs from, 0..1.
    float droop = clamp((uSwayAnchor - anchorWorld.y) / uSwaySpan, 0.0, 1.0);
    // Squared, so a piece pivots at its anchor instead of sliding sideways.
    float swing = droop * droop * uSwayAmp;
    // Phase from the hanging column, not the vertex, or a piece shears.
    float phase = floor(anchorWorld.x) * 0.9 + floor(anchorWorld.z) * 1.7;
    transformed.x += sin(uSwayTime * 1.10 + phase) * swing * ${SWAY_X.toFixed(3)};
    transformed.z += sin(uSwayTime * 0.83 + phase * 1.4) * swing * ${SWAY_Z.toFixed(3)};
}`;

    if (shader.vertexShader.includes('vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;')) {
        // Surface pass: the droop must move the vertex BEFORE the level
        // material reads a world position off it, or the triplanar grain swims
        // across a swaying banner.
        shader.vertexShader = shader.vertexShader.replace(
            'vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
            `${DROOP}
vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    } else {
        // Depth pass: nothing downstream reads a world position, so the droop
        // goes straight after `transformed` exists.
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>', `#include <begin_vertex>
${DROOP}`);
    }
}

/**
 * Breathe every hanging piece in the game.
 *
 * Called from the frame loop with the same monotonic `ambientT` that drives
 * `updateRoomLightFlicker`, and for the same reason: one clock means the room's
 * lamps and its banners cannot drift out of step with each other.
 *
 * @param {number} t seconds
 */
export function updateDressingSway(t) {
    for (const u of liveSway) u.uSwayTime.value = t;
}

/** Test seam: how many dressing materials are currently animated. */
export function liveSwayCount() {
    return liveSway.size;
}

/**
 * Build one room's hanging dressing.
 *
 * Returns null when the room has none, so the caller stores nothing and there
 * is no empty mesh to dispose, update or count.
 */
export function buildDressing(scene, kit, room, roomId, origin, occupied) {
    const { map, anchorY, placed, stiff } = stampDressing(kit, room, roomId, occupied);
    if (!placed || !map.size) return null;

    const geo = buildVoxelGeo(map, 0.05);
    geo.scale(VS, VS, VS);
    geo.translate(VS * 0.5, VS * 0.5, VS * 0.5);
    const material = makeDressingMaterial(anchorY, origin?.y || 0, stiff);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(origin?.x || 0, origin?.y || 0, origin?.z || 0);
    // Named so the shadow census and the ambient-motion probe can find it by
    // intent. `void-plane` and `contact-shadow` are named for the same reason.
    mesh.name = `room-dressing:${roomId}`;
    mesh.castShadow = true;
    // RECEIVES, as every solid mesh in the game does — the shadow census in
    // `visual-sanity.spec.mjs` requires it, and a banner that the wall above it
    // does not shade is a sticker.
    mesh.receiveShadow = true;
    // NOT frustum-culled on its bounding box alone: the droop moves vertices
    // outside the box three.js computed from the rest position, and a piece at
    // the edge of the frame would pop.
    geo.computeBoundingSphere();
    if (geo.boundingSphere) geo.boundingSphere.radius += Math.max(SWAY_X, SWAY_Z) * 2;
    if (scene) scene.add(mesh);

    const uniforms = material.userData.swayUniforms;
    // The shadow swings with the cloth, on the SAME uniform objects.
    const depthMaterial = makeDressingDepthMaterial(uniforms);
    mesh.customDepthMaterial = depthMaterial;
    liveSway.add(uniforms);

    return {
        mesh, material, depthMaterial, map, anchorY, placed,
        dispose() {
            liveSway.delete(uniforms);
            if (mesh.parent) mesh.parent.remove(mesh);
            geo.dispose();
            material.dispose();
            depthMaterial.dispose();
        },
    };
}
