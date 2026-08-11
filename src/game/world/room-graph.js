// Phase W (W1): multi-room dungeons on a fixed world grid.
//
// Core spatial decision (Builder Guide Part 5): room (i, j) has world origin
// (i * ROOM_STRIDE, 0, j * ROOM_STRIDE). Only the current room (and, during a
// transition, the target room) are baked + collidable; rooms two graph-steps
// away are disposed. Camera pans between coexisting rooms (W2 bounds).
//
// A dungeon is still ONE registry entry whose level object manages rooms
// internally — the loadLevel outer contract (G9) is untouched.

import * as THREE from 'three';
import { meshAndCollide, buildRoomFloor, VS } from './level-builder.js';
import { KITS as DUNGEON_KITS, applyKit, markTraversal } from '../levels/dungeon-kits.js';
import { buildRoomLights, disposeRoomLights } from './room-lights.js';
import { coach } from '../ui/coach.js';
import { fillBox } from '../../voxel/helpers.js';
import { stampMap } from '../assets/props.js';
import { CRUST_COLORS, ABYSS_COLORS, MOOD_PRESETS } from '../assets/palettes.js';
import { Enemy, DummyTarget, attachSplit } from '../enemy.js';
import { sfx } from '../../audio/synth.js';
import { makeKeyStore } from './keys.js';
import { applyBlockerToMap, createBlockerRuntime } from './blockers.js';
import { applyRoomTrim } from './room-trim.js';
import { applyRoomDecals } from './room-decals.js';
import { scaleEnemyHp, beatNumberOf, applyBossCurve } from './threat-curve.js';
import { EncounterDirector, tokensForBeat } from './encounter-director.js';
import { eliteSpawns } from './elites.js';
import { puzzleFor } from './puzzles.js';
import { SETTLEMENTS, addSettlement, addTownDead } from './settlements.js';
import { terraceRoom } from './terracing.js';
import { stampKitProps, shapeBossArena } from './kit-props.js';
import { SignalBus } from './puzzle-kit.js';
import { gsfx } from '../audio/sfx-bank.js';
import { buildPickupMesh, disposePickupMesh, pickupKind } from '../assets/pickup-shapes.js';

export const ROOM_STRIDE = 64;

/**
 * Seconds of a TOTAL stalemate before a sealed room lets go.
 *
 * A seal is a promise that the room is clearable. `tests/game/room-seal.spec.mjs`
 * checks the promise against the level DATA — never the entry room, never one
 * with an overworld exit, never one holding something unreachable — and that is
 * everything a static check can see. It cannot see a RUNTIME state in which the
 * fight stops resolving, and one existed: with dev god mode on, `health.damage`
 * returned before `damageFilter`, so no parry could fire, so a bulwark's plate
 * never dropped, so a sealed room held the player against an enemy that could
 * neither hurt them nor be hurt. Measured: 89 enemy wind-ups, 0 staggers, 0
 * damage in either direction, door still shut after two minutes.
 *
 * That specific cause is fixed in `dev/dev-mode.js`. This is the guarantee that
 * the NEXT one costs a player forty-five seconds instead of their save.
 *
 * The release condition is deliberately a mutual stalemate — no hit landing in
 * EITHER direction — rather than a timer on the room. A real fight always moves
 * some HP somewhere, so this cannot be used to wait out a fight you are losing:
 * standing still and letting an enemy hit you resets it. It fires only when the
 * game has genuinely stopped resolving, which is never a fight and always a bug.
 */
export const SEAL_STALEMATE_RELEASE = 45;

/**
 * The absolute ceiling on how long a seal may hold, in seconds.
 *
 * Nothing resets this while the room is still sealed. It is not a difficulty
 * dial and it is not meant to be reachable in play — four minutes is longer
 * than any authored fight in the campaign by a wide margin — it exists so that
 * "sealed forever" is not a state the game has, whatever goes wrong upstream.
 */
export const SEAL_HARD_RELEASE = 240;
export const DOOR_WIDTH = 2;

/** Collision half-extent of the player, matching what physics.update is given. */
const PLAYER_HALF = 0.4;

/**
 * Rig height above the surface they are standing on — `VoxelPhysicsBody`'s
 * y extent, so feet land exactly on the surface top (player.js: extents.y).
 */
export const PLAYER_RISE = 0.95;

/**
 * Above every terrace and slab in the game, so a placement with no readable
 * ground drops the player in rather than sealing them under. Gravity resolves it
 * within a few frames; the alternative resolves into a reload.
 */
const SAFE_DROP_Y = 9 + PLAYER_RISE;

/**
 * Snap a world point to the centre of the cell containing it.
 *
 * Cells are corner-anchored — cell (x,z) is the box [x,x+1]x[z,z+1] — so a
 * coordinate ending in .0 is a SEAM, with the body half in each neighbour, and
 * a coordinate ending in .5 is the middle of one cell. Placement wants the
 * middle, every time.
 */
function cellCentre(x, z) {
    return { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 };
}

/**
 * Seconds a refused door stays quiet before it can fire again.
 *
 * `checkDoorTriggers` runs every frame. Without this, a refusal that fails to
 * push the player clear of the trigger — because a wall is behind them, or the
 * push was simply too short — refuses again next frame, resets their velocity
 * again, and keeps doing it. See `refuseDoor`.
 *
 * Long enough to walk out of a 1.2-unit trigger at any speed the player has,
 * short enough that a deliberate second attempt feels immediate.
 */
const DOOR_REFUSE_COOLDOWN = 0.7;

/** Shared lock id for both sides of a door: sorted room pair. */
export function doorKey(dungeonId, roomA, roomB) {
    const [a, b] = [roomA, roomB].sort();
    return `${dungeonId}:${a}-${b}`;
}

const SIDE_NORMAL = {
    N: { x: 0, z: -1 },
    S: { x: 0, z: 1 },
    W: { x: -1, z: 0 },
    E: { x: 1, z: 0 },
};

/** Local perimeter cells a door's gap occupies. */
export function doorCells(room, door) {
    const half = room.half;
    const w = door.width || DOOR_WIDTH;
    const cells = [];
    for (let i = 0; i < w; i++) {
        const c = door.at - Math.floor(w / 2) + i;
        if (door.side === 'N') cells.push({ x: c, z: -half });
        else if (door.side === 'S') cells.push({ x: c, z: half });
        else if (door.side === 'W') cells.push({ x: -half, z: c });
        else cells.push({ x: half, z: c });
    }
    return cells;
}

/**
 * How high the hero climbs without jumping. `MAX_STEP_HEIGHT` in
 * `voxel-physics-body.js`, restated here because a flood fill that disagrees
 * with the body it is modelling is worse than no flood fill.
 */
const WALK_STEP = 1;

/**
 * Every cell of `room` the player can actually WALK to, and the height they
 * stand at when they get there.
 *
 * WHY THIS EXISTS
 *
 * "The cell is empty" is not "the player can reach it", and until this the
 * puzzle layout only ever asked the first question. Beat 07's `weepinghall`
 * has a chasm three cells deep running the full width of the room; the corner
 * search found a corner on the far side of it, every piece fitted, nothing was
 * blocked, and the whole beat — vault, plate, block and the cache inside —
 * baked somewhere the player cannot stand. From the chair that reads exactly as
 * the owner described it: a switch you cannot trigger and a prize you cannot
 * get into.
 *
 * Flooded from the room's spawn AND from every door threshold, because a player
 * arrives through doors far more often than they arrive at the spawn, and a
 * corner reachable only from a door the room does have is perfectly fine.
 *
 * Bottom-up per column, which matters in exactly the place it is easy to get
 * wrong: beat 08 is called `gravecanopy` and its columns read
 * `floor · gap · gap · gap · canopy · canopy`. The highest surface is a roof
 * nobody walks on. The lowest surface with a body's worth of room above it is
 * the floor they are standing on.
 */
export function walkableCells(room, origin, solidAt) {
    const half = room.half || 0;
    const MAX_Y = 8;
    const surfaceY = (lx, lz) => {
        const x = origin.x + lx;
        const z = origin.z + lz;
        for (let top = 1; top <= MAX_Y; top++) {
            if (!solidAt(x, top - 0.5, z)) continue;
            if (solidAt(x, top + 0.5, z)) continue;
            if (solidAt(x, top + 1.5, z)) continue;
            return top;
        }
        return null;
    };

    const seen = new Map();
    const queue = [];
    const seed = (lx, lz) => {
        if (Math.abs(lx) > half || Math.abs(lz) > half) return;
        const k = `${lx},${lz}`;
        if (seen.has(k)) return;
        const y = surfaceY(lx, lz);
        if (y == null) return;
        seen.set(k, y);
        queue.push([lx, lz, y]);
    };

    seed(Math.round(room.spawn?.x || 0), Math.round(room.spawn?.z || 0));
    for (const door of room.doors || []) {
        for (const c of doorCells(room, door)) {
            seed(Math.round(c.x), Math.round(c.z));
            // One cell inward, because the threshold itself sits in the wall
            // line and a door cell can read as unstandable on its own.
            seed(Math.round(c.x) - Math.sign(c.x) * (Math.abs(c.x) === half ? 1 : 0),
                Math.round(c.z) - Math.sign(c.z) * (Math.abs(c.z) === half ? 1 : 0));
        }
    }

    while (queue.length) {
        const [x, z, y] = queue.shift();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (Math.abs(nx) > half || Math.abs(nz) > half) continue;
            const k = `${nx},${nz}`;
            if (seen.has(k)) continue;
            const ny = surfaceY(nx, nz);
            // Climbing is capped; falling is not.
            if (ny == null || ny - y > WALK_STEP) continue;
            seen.set(k, ny);
            queue.push([nx, nz, ny]);
        }
    }
    return seen;
}

/** Perimeter walls with gaps punched at each door. */
export function buildPerimeterWithDoors(map, room, color) {
    const half = room.half;
    const wallH = room.wallH || 4;
    const skip = new Set();
    for (const door of room.doors || []) {
        for (const c of doorCells(room, door)) skip.add(`${c.x},${c.z}`);
    }
    const put = (x, z) => {
        if (skip.has(`${x},${z}`)) return;
        fillBox(map, x, x, 1, wallH, z, z, color);
    };
    for (let x = -half; x <= half; x++) { put(x, -half); put(x, half); }
    for (let z = -half; z <= half; z++) { put(-half, z); put(half, z); }
}

/**
 * Pure structural validation for a dungeon definition (unit-testable, no
 * THREE): BFS from `start` through doors, collecting small keys placed in
 * reachable rooms; locked doors consume keys; the boss door needs a boss key
 * found in a reachable room. Key placements: def.keys = [{ room, x, z,
 * type: 'small' | 'boss' }].
 */
export function validateDungeonDef(def) {
    const reasons = [];
    const rooms = def.rooms || {};
    if (!rooms[def.start]) return { ok: false, reachable: [], reasons: ['start room missing'] };

    // Door symmetry check: every door's target must exist and point back.
    for (const [rid, room] of Object.entries(rooms)) {
        for (const door of room.doors || []) {
            if (door.type === 'exit') continue; // leaves the dungeon entirely
            const other = rooms[door.to];
            if (!other) {
                reasons.push(`${rid} door → missing room ${door.to}`);
                continue;
            }
            if (!(other.doors || []).some((d) => d.to === rid)) {
                reasons.push(`${door.to} has no door back to ${rid}`);
            }
        }
    }

    const keysIn = (rid, type) => (def.keys || [])
        .filter((k) => k.room === rid && (k.type || 'small') === type).length;

    // Fixpoint BFS with key economy.
    let reachable = new Set([def.start]);
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 200) {
        changed = false;
        let smallKeys = 0;
        let bossKey = false;
        for (const rid of reachable) {
            smallKeys += keysIn(rid, 'small');
            bossKey = bossKey || keysIn(rid, 'boss') > 0;
        }
        // Count locked doors we must open to reach current reachable set is
        // implicit: re-walk from start each pass, spending keys greedily.
        const seen = new Set([def.start]);
        let budget = smallKeys;
        const queue = [def.start];
        while (queue.length) {
            const rid = queue.shift();
            for (const door of rooms[rid].doors || []) {
                if (door.type === 'exit') continue;
                if (seen.has(door.to) || !rooms[door.to]) continue;
                const type = door.type || 'open';
                if (type === 'locked') {
                    if (budget <= 0) continue;
                    budget -= 1;
                } else if (type === 'boss') {
                    if (!bossKey) continue;
                }
                seen.add(door.to);
                queue.push(door.to);
            }
        }
        if (seen.size !== reachable.size) changed = true;
        reachable = seen;
    }

    const bossRoom = Object.keys(rooms).find((rid) => rooms[rid].boss);
    if (bossRoom && !reachable.has(bossRoom)) {
        reasons.push(`boss room ${bossRoom} unreachable with obtainable keys`);
    }
    for (const rid of Object.keys(rooms)) {
        if (!reachable.has(rid)) reasons.push(`room ${rid} unreachable`);
    }
    return { ok: reasons.length === 0, reachable: [...reachable], reasons };
}

function roomOrigin(room) {
    return { x: room.grid[0] * ROOM_STRIDE, y: 0, z: room.grid[1] * ROOM_STRIDE };
}

function roomRect(room) {
    const o = roomOrigin(room);
    return {
        minX: o.x - room.half,
        maxX: o.x + room.half + 1,
        minZ: o.z - room.half,
        maxZ: o.z + room.half + 1,
    };
}

function gridDistance(a, b) {
    return Math.abs(a.grid[0] - b.grid[0]) + Math.abs(a.grid[1] - b.grid[1]);
}

/**
 * Build a dungeon level object from a definition (schema in the Builder
 * Guide, Part 5 W1). Returns a G9-compatible level API.
 *
 * opts.keyStore (W3): { isOpen(doorKey), open(doorKey), trySpendSmallKey(),
 * hasBossKey() } — falls back to a session-local store when absent.
 */
export function createDungeon(ctx, def, opts = {}) {
    const { scene, collisionWorld } = ctx;
    const moodPreset = MOOD_PRESETS[def.mood] || MOOD_PRESETS.crust;
    const floorColor = def.floorColor
        || (def.mood === 'abyss' ? ABYSS_COLORS.abyssFloor : CRUST_COLORS.floor);
    const wallColor = def.wallColor
        || (def.mood === 'abyss' ? ABYSS_COLORS.abyssWall : CRUST_COLORS.wall);

    // W3: persistent per-dungeon lock state by default (opts.keyStore is a
    // test seam).
    const keyStore = opts.keyStore || makeKeyStore(def.id);

    const baked = new Map(); // roomId → { built, plugs: Map(dk→built), enemies, disposers }
    const extraVoxelQueries = []; // runtime floor fills (cleared grapple bridges, etc.)
    const systems = [];
    const pickups = [];
    const destructibles = [];
    const enemies = []; // live combat list across baked rooms (shared identity)
    // Phase D1. One per dungeon, holding the concurrency budget for the act:
    // one committed attacker in beats 01-04, two through 10, three in the
    // finale. That single number is the encounter difficulty dial the campaign
    // never had — orthogonal to `threat-curve.js` (which sets HP) and
    // `run-mode.js` (which scales everything globally).
    const director = new EncounterDirector(
        tokensForBeat(beatNumberOf(def.id)), () => enemies
    );
    // Phase E1. One bus per dungeon: plates, switches, sockets and lenses all
    // publish here, and gates subscribe. No piece ever points at another, which
    // is why they recombine.
    const signals = new SignalBus();
    const puzzleBlocks = [];
    const beamTargets = [];
    let currentRoomId = def.start;
    let transition = null; // { t, dur, to, pin: {x,z} }
    let bossSpawned = false;
    let bossRoomId = null;
    let disposed = false;
    let themeHintShown = false; // Z6: the dungeon states its idea exactly once
    // Stalemate valve state — see SEAL_STALEMATE_RELEASE and tickSealStalemate.
    let sealStallT = 0;
    let sealStallSig = null;
    let sealHeldT = 0;
    let doorRefusedT = 0;   // see refuseDoor / DOOR_REFUSE_COOLDOWN

    // Void dressing (S5 pattern) — one big fog-floor for the whole dungeon.
    const voidPlane = new THREE.Mesh(
        new THREE.CircleGeometry(400, 24),
        new THREE.MeshBasicMaterial({ color: moodPreset.background })
    );
    voidPlane.rotation.x = -Math.PI / 2;
    voidPlane.position.y = -0.5;
    // Named so the shadow census can exempt it by intent rather than by
    // accident: this is the fog backdrop under the whole dungeon, not a
    // surface anything stands on, and shadowing it would be meaningless.
    voidPlane.name = 'void-plane';
    scene.add(voidPlane);

    function buildHelpers(room) {
        return { fillBox, stampMap, CRUST_COLORS, ABYSS_COLORS, half: room.half };
    }

    function bakePlug(roomId, room, door, origin) {
        const dk = doorKey(def.id, roomId, door.to);
        if (keyStore.isOpen(dk)) return null;
        const map = new Map();
        const color = (door.type === 'boss') ? CRUST_COLORS.bloodStain : CRUST_COLORS.goldLeaf;
        for (const c of doorCells(room, door)) {
            fillBox(map, c.x, c.x, 1, room.wallH || 4, c.z, c.z, color);
        }
        return meshAndCollide(map, scene, collisionWorld, {
            origin,
            solidPrefix: `${def.id}:${roomId}:plug:${dk}`,
        });
    }

    function bakeRoom(roomId) {
        if (baked.has(roomId) || disposed) return;
        const room = def.rooms[roomId];
        const origin = roomOrigin(room);
        const map = new Map();
        buildRoomFloor(map, -room.half, room.half, -room.half, room.half, 0,
            room.floorColor || floorColor);
        buildPerimeterWithDoors(map, room, room.wallColor || wallColor);
        if (room.build) room.build(map, buildHelpers(room));
        // Ticket G: stamp this dungeon's kit (floor inlay + wall cap) so every
        // room reads as one authored place. Data-driven per beat; no-op for the
        // overworld and any level without a kit.
        applyKit(map, DUNGEON_KITS[def.id], room);
        // Silhouette trim — parapets, pilasters, corner posts. Runs AFTER the
        // kit so it shades from the final cap colour, and only ever adds voxels
        // above the wall top, so it cannot change collision or traversal.
        // `__trimOff` is a QA escape hatch (tests/qa/trim-cost.mjs) so the cost
        // of the trim can be measured with it on and off in one session,
        // instead of against a remembered number from a different build.
        // Weathering — colour only, so it can never change what the player can
        // do. Runs after the kit (it shades from the final colours) and before
        // trim (trim derives its own shade from the wall cap, which weathering
        // deliberately does not touch).
        applyRoomDecals(map, room, DUNGEON_KITS[def.id], roomId, {
            enabled: def.decals !== false
                && !(typeof window !== 'undefined' && window.__sovereignScar?.__decalsOff),
        });
        applyRoomTrim(map, room, roomId, {
            enabled: def.trim !== false
                && !(typeof window !== 'undefined' && window.__sovereignScar?.__trimOff),
        });
        for (const b of room.blockers || []) applyBlockerToMap(map, b); // W7

        // Phase F1 — the dungeon's authored props, finally built. `structural`
        // and `dressing` have carried 28 named prop kinds since the kits were
        // written and were read by nothing at all. They stamp into the room map
        // itself, so they mesh with the room and cost no extra draw call.
        //
        // After the blockers and before the light fixtures: a prop must never
        // grow through a grapple gap or a wedge crack, and the fixtures need to
        // see the finished silhouette to sit on top of it.
        {
            const kit = DUNGEON_KITS[def.id];
            const doorGuard = new Set();
            for (const door of room.doors || []) {
                for (const c of doorCells(room, door)) {
                    for (let dx = -3; dx <= 3; dx++) {
                        for (let dz = -3; dz <= 3; dz++) {
                            doorGuard.add(`${c.x + dx},${c.z + dz}`);
                        }
                    }
                }
            }
            stampKitProps(map, kit, room, roomId, (x, z) => {
                if (Math.abs(x) > room.half - 1 || Math.abs(z) > room.half - 1) return true;
                if (doorGuard.has(`${x},${z}`)) return true;
                if (map.has(`${x},1,${z}`)) return true;
                const sp = room.spawn;
                if (sp && Math.hypot(x - (sp.x || 0), z - (sp.z || 0)) < 4) return true;
                for (const e of room.enemies || []) {
                    if (Math.hypot(x - e.x, z - e.z) < 3) return true;
                }
                // Never in a boss arena. The boss owns that floor, and a
                // fourteen-metre body clipping through a prop is worse than a
                // bare room.
                if (room.boss) return true;
                return false;
            });
        }

        // Multi-Y platforms (G5): meshed WITHOUT XZ solids so their tops are
        // standable — VoxelPhysicsBody climbs 1-cell steps via getVoxelAt.
        // Built BEFORE the room mesh so Z2 can see both maps at once: a rise
        // in the platform map often steps up off floor in the room map.
        let pmap = null;
        if (room.platforms) {
            pmap = new Map();
            room.platforms(pmap, buildHelpers(room));
        }
        // Phase E2 — vertical interest, added to the PLATFORM map on purpose.
        // Platform voxels are meshed without XZ solids, so a terrace is
        // standable but never blocking and a one-cell step is exactly what the
        // physics body climbs. That is what makes it safe to generate: no
        // arrangement this can produce is able to make anywhere unreachable,
        // which is the traversal audit that stopped this ticket twice before.
        //
        // Skipped in the boss room and in the overworld: an arena's shape is
        // boss design and belongs to `bossRule`, and the overworld's terrain
        // already has a grammar of its own that this would fight.
        // Phase F1 — `bossRule`: fourteen authored arena shapes, read by nothing
        // until now. Arena shape is boss design as much as a moveset is.
        if (room.boss && !def.overworld) {
            if (!pmap) pmap = new Map();
            shapeBossArena(pmap, DUNGEON_KITS[def.id], room,
                room.wallColor || wallColor);
        }
        if (!room.boss && !def.overworld && !room.noTerrace) {
            if (!pmap) pmap = new Map();
            const doorCellSet = new Set();
            for (const door of room.doors || []) {
                for (const c of doorCells(room, door)) {
                    for (let dx = -2; dx <= 2; dx++) {
                        for (let dz = -2; dz <= 2; dz++) {
                            doorCellSet.add(`${c.x + dx},${c.z + dz}`);
                        }
                    }
                }
            }
            terraceRoom(pmap, room, roomId,
                room.wallColor || wallColor,
                (x, z) => {
                    // Never over a door or its approach, never over the spawn,
                    // and never over anything the room already built.
                    if (doorCellSet.has(`${x},${z}`)) return true;
                    const sp = room.spawn;
                    if (sp && Math.hypot(x - (sp.x || 0), z - (sp.z || 0)) < 3) return true;
                    if (map.has(`${x},1,${z}`)) return true;
                    for (const e of room.enemies || []) {
                        if (Math.hypot(x - e.x, z - e.z) < 2) return true;
                    }
                    return false;
                });
        }

        // Z2: mark the rim of every climbable one-cell rise, so "can I get up
        // there" is answerable by looking instead of by walking into it.
        markTraversal(map, pmap, DUNGEON_KITS[def.id]);

        const built = meshAndCollide(map, scene, collisionWorld, {
            origin,
            solidPrefix: `${def.id}:${roomId}`,
        });
        const platformBuilt = pmap ? meshAndCollide(pmap, scene, null, { origin }) : null;

        // The kit's declared emissive motif, as actual fixtures that actually
        // cast light. This field had been carried per-dungeon since the kits
        // were written and read by nothing; see world/room-lights.js.
        const roomLights = buildRoomLights(
            DUNGEON_KITS[def.id], room, roomId, origin, scene, ctx.localLights
        );

        const rec = {
            built, platformBuilt, plugs: new Map(), enemies: [], room,
            blockers: [], roomLights,
        };
        for (const b of room.blockers || []) {
            const rt = createBlockerRuntime(ctx, api, b, origin);
            if (rt) rec.blockers.push(rt);
        }
        for (const door of room.doors || []) {
            if (door.type === 'locked' || door.type === 'boss') {
                const plug = bakePlug(roomId, room, door, origin);
                if (plug) rec.plugs.set(doorKey(def.id, roomId, door.to), plug);
            }
        }
        // Z5: a splitter's children have to join the SAME room record, or they
        // survive the room being disposed and leak into the next one.
        const spawnInto = (pos, eopts) => {
            // Brood children inherit the parent's room bounds so a split in a
            // doorway cannot scatter kids into the corridor.
            const child = new Enemy(scene, collisionWorld, pos, {
                roomBounds: eopts?.roomBounds,
                // Splits inherit the ground query too. A Brood Mother standing
                // on a terrace sheds four children, and without this every one
                // of them is born inside the step their parent is on.
                getVoxelAt: api.getVoxelAt,
                ...eopts,
            });
            // freeSpotNear can still place in a doorway (collision gap). Clamp.
            if (child.roomBounds) child._clampToRoom();
            rec.enemies.push(child);
            enemies.push(child);
            return child;
        };
        // Authored HP is a RELATIVE weight; the campaign curve sets the absolute
        // figure so an enemy's behaviour still has time to happen once the
        // player's weapon damage has tripled. See world/threat-curve.js.
        const beatNo = beatNumberOf(def.id);
        // Room confinement (playtest issue 7): a doorway is a real gap in the
        // collision geometry, so without a bounds clamp an enemy simply walks
        // out after the player. Inset past the wall so the doorway is not an
        // exit, while the player's own door transit is left alone.
        const inset = 1.1;
        const roomBounds = {
            minX: origin.x - room.half + inset,
            maxX: origin.x + room.half - inset,
            minZ: origin.z - room.half + inset,
            maxZ: origin.z + room.half - inset,
        };
        for (const e of room.enemies || []) {
            const enemy = new Enemy(scene, collisionWorld,
                { x: origin.x + e.x, y: 1.0, z: origin.z + e.z },
                { ...e, hp: scaleEnemyHp(e.hp, beatNo), roomBounds,
                    getVoxelAt: api.getVoxelAt });
            attachSplit(enemy, spawnInto);
            rec.enemies.push(enemy);
            enemies.push(enemy);
        }

        // Phase D2 — the elite. ONE place, driven by the table in elites.js and
        // by each dungeon's own authored `theme.combine` room, rather than ten
        // hand-edited level files. `combine` is the right slot by definition:
        // its stated job in every dungeon is "the mechanic, now with combat".
        if (def.theme?.combine === roomId && !room.boss) {
            for (const s of eliteSpawns(beatNo, room.half)) {
                const elite = new Enemy(scene, collisionWorld,
                    { x: origin.x + s.dx, y: 1.0, z: origin.z + s.dz },
                    { ...s.opts, hp: scaleEnemyHp(s.opts.hp, beatNo), roomBounds,
                        getVoxelAt: api.getVoxelAt });
                elite._clampToRoom();
                attachSplit(elite, spawnInto);
                rec.enemies.push(elite);
                enemies.push(elite);
            }
        }
        baked.set(roomId, rec);

        if (room.boss && !bossSpawned) {
            bossSpawned = true;
            bossRoomId = roomId;
            // Arena clamp centres on the room, not the boss's off-centre spawn.
            api.bossHome = { x: origin.x, z: origin.z };
            api.halfSize = room.half;
            room.boss(ctx, api, origin); // factory must call attachBoss(api, …)
            // Same curve, same reason: authored boss HP is flat 12-18 across the
            // whole campaign, so nine of fourteen bosses died faster than the
            // trash in the corridor outside. See world/threat-curve.js.
            applyBossCurve(api.boss, beatNumberOf(def.id));
        }
        const pickupsBefore = pickups.length;
        if (room.onBake) room.onBake(api, origin, ctx);

        // Phase E2 — lift anything that landed inside a terrace.
        //
        // Rooms place their pickups in `onBake`, which runs long after the
        // platform map was meshed, so a key authored on flat floor can now be
        // standing inside a step. Twelve of them were, on the first run,
        // including three small keys and a boss key — every one of which is a
        // hard progression stop.
        //
        // Lifting rather than moving sideways is deliberate: the pickup stays
        // exactly where it was authored in XZ, and ends up on TOP of the new
        // high ground, which is where you would have put it if the high ground
        // had been there first.
        if (platformBuilt) {
            for (let i = pickupsBefore; i < pickups.length; i++) {
                const p = pickups[i];
                const pos = (p.mesh || p).position;
                if (!pos) continue;
                let lifted = 0;
                while (lifted < 4 && platformBuilt.getVoxelAt(pos.x, pos.y, pos.z)) {
                    pos.y += 1;
                    lifted++;
                }
                if (lifted) p.baseY = pos.y;
            }
        }

        // And seat every body in the room on the ground, for the same reason
        // and one more.
        //
        // `Enemy` snaps itself down to the floor when it is constructed, but at
        // construction time this room is not in `baked` yet — `baked.set` is
        // below — so `api.getVoxelAt` cannot see the very terraces the enemy is
        // standing in, returns nothing, and the snap is a no-op. Five bodies in
        // the campaign spawned submerged for exactly that reason and the fix in
        // the constructor did not touch one of them. So it happens again here,
        // where the geometry exists. (`onBake` may also have added bodies of its
        // own, which is the other reason this is the right place.)
        for (const e of rec.enemies) {
            if (!e?.rig || !e.seatOnGround) continue;
            e.seatOnGround();
        }

        // Phase E1 — this room's puzzle beat, built LAST.
        //
        // Last, and that ordering is the fix rather than a detail. Rooms place
        // their own pickups inside `onBake`, so a puzzle that chose its corner
        // any earlier was choosing it blind — the first version walled a small
        // key into beat 13 and a suture into beat 14. Built here, it can see
        // both the room's geometry and everything the room just put down, and
        // it moves to a free corner or declines to exist.
        //
        // TWO predicates, not one, and they are not interchangeable. The first
        // is GEOMETRY — walls, kit props, terraces — and a puzzle piece standing
        // in it is a piece nobody can reach or shove. The second is the room's
        // own CONTENT, and it is a preference: the vault must respect it because
        // the vault builds walls and walling a key in is how this broke the
        // first time, but a plate three feet from a torch is simply a plate.
        // Passing the union of the two as one hard rule cost eleven of the
        // campaign's forty-two puzzle beats before this was split.
        //
        // The hard rule also asks whether the player can GET there, which was
        // the missing third of it. A cell can be empty, unblocked, correctly
        // settled and on the far side of a chasm — see `walkableCells`.
        //
        // HONEST NOTE, because the next person deserves it: on the campaign as
        // it stands this line changes NOTHING. The counterfactual sweep removes
        // it and the suite does not notice, and it does not notice because
        // every cell the corner search would pick is already reachable in all
        // 42 puzzle rooms — the flood is seeded from the doors as well as the
        // spawn, so even Beat 07's chasm room has both banks covered. It is
        // insurance against future authoring, not live behaviour, and it should
        // not be read as tested. (HANDOFF trap 23, third kind.)
        const walkable = walkableCells(room, origin, (x, y, z) =>
            !!built.getVoxelAt(x, y, z) || !!platformBuilt?.getVoxelAt?.(x, y, z));
        const puzzle = puzzleFor(def, roomId, room, beatNo,
            (lx, lz) => {
                const wx = origin.x + lx;
                const wz = origin.z + lz;
                if (built.getVoxelAt(wx, 1, wz)) return true;
                if (platformBuilt?.getVoxelAt?.(wx, 1, wz)) return true;
                if (!walkable.has(`${lx},${lz}`)) return true;
                return false;
            },
            (lx, lz) => {
                const wx = origin.x + lx;
                const wz = origin.z + lz;
                // WHERE THE PLAYER ARRIVES, which this predicate never knew.
                //
                // It has always accounted for pickups and enemy spawns and never
                // for the hero. The develop switch is authored five units
                // diagonally out from the vault, which in a half-7 room lands on
                // exactly 0,0: `gravecanopy` and `slagworks` both put a switch
                // *inside the player's body on entry*. Ten pieces across the
                // campaign sat on the spawn, two of them dead centre. A switch you
                // are standing in is not a switch you find — it reads as scenery,
                // and the owner's report was "the other room does not even have a
                // switch".
                //
                // Soft, not hard, and 2.0 so the diagonal neighbours move too: a
                // piece prefers anywhere else and may still land here if the room
                // leaves it no choice, which is the same trade this predicate
                // already makes for torches. `tests/qa/switch-works.mjs` counts it.
                const sx = origin.x + (room.spawn?.x || 0);
                const sz = origin.z + (room.spawn?.z || 0);
                if (Math.hypot(sx - wx, sz - wz) < 2.0) return true;
                for (const p of pickups) {
                    const pp = (p.mesh || p).position;
                    if (pp && Math.hypot(pp.x - wx, pp.z - wz) < 1.4) return true;
                }
                for (const e of rec.enemies) {
                    if (Math.hypot(e.rig.position.x - wx, e.rig.position.z - wz) < 1.4) return true;
                }
                return false;
            },
            // THE DOORS. The corner search had never seen one.
            //
            // A reward alcove is placed hard against the room's perimeter, and
            // the perimeter is where the doors are, so its footprint lands beside
            // a threshold without ever occupying it — and the apron that would
            // have caught it is inward-only, because an outward apron of
            // solid-geometry tests hits the perimeter wall and disqualifies every
            // corner in every room. So nothing looked, and `tearwell` shipped an
            // alcove at gap 0 from its east door: walking in from `weepinghall`
            // put the player in a five-point pocket beside a raised gate. This is
            // the "locked in when I enter the room" of three play reports.
            //
            // A door's own cells and the cell inside it, so a body has floor to
            // arrive on and room to turn. `tests/qa/door-reach.mjs` is the sweep.
            (lx, lz) => {
                const rh = room.half || 0;
                for (const door of room.doors || []) {
                    for (const c of doorCells(room, door)) {
                        if (c.x === lx && c.z === lz) return true;
                        const ix = Math.abs(c.x) === rh ? c.x - Math.sign(c.x) : c.x;
                        const iz = Math.abs(c.z) === rh ? c.z - Math.sign(c.z) : c.z;
                        if (ix === lx && iz === lz) return true;
                    }
                }
                return false;
            });
        // Kept, not discarded. `puzzleFor` SETTLES pieces against the geometry
        // that actually got built, so the authored table and the baked layout
        // are different things — and re-deriving the layout from the table is
        // how a probe ends up auditing coordinates the game never used. (It is
        // the same "test the bake, not the table" this project has now learned
        // three times.) `tests/qa/puzzle-reach.mjs` reads this.
        rec.puzzle = puzzle;
        for (const b of puzzle) {
            const rt = createBlockerRuntime(ctx, api, b, origin);
            if (rt) rec.blockers.push(rt);
        }
        // Phase E3 — the people, on the same hook and for the same reason: they
        // go into `rec.blockers`, so a screen that unloads takes its settlement
        // with it. The alternative (`addSystem`, which the acquisition-chain
        // props use) is level-scoped and would leave two dozen rigs in the scene
        // after the overworld swapped the screen out from under them.
        const town = SETTLEMENTS[roomId];
        if (town) rec.blockers.push(addSettlement(api, ctx, origin, town));
        // Beat 09's dead. Its own theme line is "What the Town Forgot", and
        // until now the town it is named after was empty.
        if (def.id === 'beat-09-town' && !room.boss) {
            rec.blockers.push(addTownDead(api, ctx, origin, room.half));
        }

        // And something inside the vault worth opening it for. Shards, not a
        // secret and not a suture: at three puzzles a dungeon this is forty-two
        // pickups, and routing them through `scoreType: 'secret'` would have
        // handed the player thirty thousand points and (on beats 07-14) another
        // forty-two sutures — silently rewriting two economies that were tuned
        // against fourteen caches.
        const vault = puzzle.find((b) => b.type === 'vault');
        if (vault) {
            const vx = origin.x + (vault.rect.x0 + vault.rect.x1) / 2;
            const vz = origin.z + (vault.rect.z0 + vault.rect.z1) / 2;
            addPickup({ x: vx, y: 1.2, z: vz }, {
                id: `${def.id}:${roomId}:vault`,
                color: 0x9ad0ff,
                label: 'Sealed cache',
                onPickup(game) {
                    game.player.inventory.addShards?.(12);
                    game.hud?.toast?.('Sealed cache — 12 scar shards', 1800);
                },
            });
        }
    }

    function disposeRoom(roomId) {
        const rec = baked.get(roomId);
        if (!rec) return;
        rec.built.dispose();
        rec.platformBuilt?.dispose();
        // Both dispose paths, not one. A light left registered after its
        // fixture is gone keeps lighting an empty room from a mesh that no
        // longer exists — and the pool has no way to notice.
        disposeRoomLights(rec.roomLights, ctx.localLights);
        for (const rt of rec.blockers || []) { try { rt.dispose(); } catch (_) {} }
        for (const plug of rec.plugs.values()) plug.dispose();
        for (const e of rec.enemies) {
            const i = enemies.indexOf(e);
            if (i >= 0) enemies.splice(i, 1);
            e.dispose();
        }
        baked.delete(roomId);
    }

    function removePlug(dkToRemove) {
        for (const rec of baked.values()) {
            const plug = rec.plugs.get(dkToRemove);
            if (plug) {
                plug.dispose();
                rec.plugs.delete(dkToRemove);
            }
        }
    }

    function setCameraBounds(rect) {
        api.cameraBounds = rect;
    }

    function enterRoom(roomId, game) {
        bakeRoom(roomId);
        currentRoomId = roomId;
        const room = def.rooms[roomId];
        setCameraBounds(roomRect(room));
        // Dispose far rooms (boss room stays once its boss exists). Prebaked
        // dungeons keep everything — small graphs bake in milliseconds.
        if (!def.prebake) {
            for (const otherId of [...baked.keys()]) {
                if (otherId === roomId) continue;
                if (otherId === bossRoomId && bossSpawned) continue;
                if (gridDistance(def.rooms[otherId], room) >= 2) disposeRoom(otherId);
            }
        }
        // A room may trim the light on top of the level's own trim. Falls back
        // to the level value, so a room without one restores the level default
        // rather than inheriting whatever the previous room asked for.
        game?.mood?.setTune?.(room.lightTune || def.lightTune || null);

        keyStore.markVisited?.(roomId); // W6 map data

        // Z6: a Zelda dungeon INTRODUCES its idea before it demands it. The
        // theme's teach room is where that happens, so the first time the
        // player stands in it the game says out loud what this dungeon is
        // about. Once per visit to the dungeon — a hint that repeats every
        // time you walk back through is noise, not teaching.
        const theme = def.theme;
        if (game && theme?.hint && roomId === theme.teach && !themeHintShown) {
            themeHintShown = true;
            game.hud?.toast?.(theme.hint, 3600);
        }

        if (api.onRoomEnter) api.onRoomEnter(roomId, game);
        if (room.onEnter && game) room.onEnter(game, room);
    }

    /** Floor to stand on at (x,z) with head clearance above it. */
    /**
     * The Y a body's feet would rest at here, or null for a hole.
     *
     * SCANNED, NOT ASSUMED, and that is the whole point of this function.
     * Everything below used to be written as "floor at cell 0, cells 1 and 2
     * clear" — the flat-floor world this game had before Phase E2 put terraces in
     * every room. On raised ground cells 1 and 2 are solid *because it is a step*,
     * so every terrace in the campaign read as unusable: `nearestFreeEntry` would
     * reject the whole search space, fall through to its null fallback, and leave
     * the player materialising at the unsafe point it was trying to avoid.
     *
     * Bottom-up, because beat 08's `gravecanopy` has floor, a gap you walk
     * through, and a canopy overhead — top-down finds the roof.
     */
    function surfaceTop(x, z) {
        for (let top = 1; top <= 8; top++) {
            if (!api.getVoxelAt(x, top - 0.5, z)) continue;
            if (api.getVoxelAt(x, top + 0.5, z)) continue;    // the hero is
            if (api.getVoxelAt(x, top + 1.5, z)) continue;    // ~1.9 tall
            return top;
        }
        return null;
    }

    /**
     * The height the hero's rig sits at to stand on (x,z), or null for nowhere.
     *
     * The ONLY place the hero's rest height is written down. `1.95` used to be
     * spelled out at seven different placement sites; six of them were still
     * saying it after the seventh learned to scan, which is how the owner ended
     * up buried twice more after the "fix".
     */
    function groundY(x, z) {
        const top = surfaceTop(x, z);
        return top == null ? null : top + PLAYER_RISE;
    }

    /**
     * MAY THE BODY BE HERE AT ALL? — a different question from `surfaceTop`, and
     * conflating the two is the bug this pair exists to keep apart.
     *
     * `surfaceTop` finds a solid with head room above it. The top of a perimeter
     * wall answers yes. So does the top of an authored slab. But `CollisionWorld`
     * is HEIGHT-BLIND on purpose — `blocked()` has no Y in it — so a column that
     * is an XZ solid stops the body at every height, including standing on its
     * roof. Placing the player up there is the "I became stuck on a raised area"
     * report: every horizontal move is refused, and a body centred on the seam
     * between two solids gets ejected toward opposite faces on alternate frames.
     *
     * `blocked` is also the only test here that knows the player is a BODY and
     * not a point, which matters because a door's landing spot lands on a cell
     * seam every single time (`doorWorldCenter` is on a half-cell, the 2.5 step
     * is not) — so a point test can approve a cell whose neighbour swallows you.
     *
     * Terraces are untouched by this and must stay that way: `terraceRoom` writes
     * into the PLATFORM map, which `bakeRoom` meshes with a null collision world,
     * so no terrace of any height is ever a solid. Phase E2 stands.
     */
    function bodyFits(x, z) {
        return !collisionWorld || !collisionWorld.blocked(x, z, PLAYER_HALF);
    }

    function standable(x, z) {
        return surfaceTop(x, z) != null && bodyFits(x, z);
    }

    /**
     * Floor to stand on AND room for the whole body, at whatever height that
     * floor happens to be.
     */
    function clearForBody(x, z) {
        return standable(x, z);
    }

    /**
     * Would standing at (x,z) sit inside one of `room`'s door trigger zones?
     * Mirrors checkDoorTriggers for an arbitrary room, using the widest reach
     * (1.2, the plugged-door value) plus a margin so a landing can never
     * immediately re-fire the door it just came through.
     */
    function insideAnyDoorTrigger(room, roomId, x, z) {
        const o = roomOrigin(room);
        const reach = 1.7; // max trigger reach (1.2) + margin
        for (const door of room.doors || []) {
            const w = (door.width || DOOR_WIDTH) / 2 + 0.5;
            const c = doorWorldCenter(roomId, door);
            if (door.side === 'N' || door.side === 'S') {
                const wallZ = door.side === 'N' ? o.z - room.half + 0.5 : o.z + room.half + 0.5;
                const outward = door.side === 'N' ? z < wallZ + reach : z > wallZ - reach;
                if (outward && Math.abs(x - c.x) < w) return true;
            } else {
                const wallX = door.side === 'W' ? o.x - room.half + 0.5 : o.x + room.half + 0.5;
                const outward = door.side === 'W' ? x < wallX + reach : x > wallX - reach;
                if (outward && Math.abs(z - c.z) < w) return true;
            }
        }
        return false;
    }

    /**
     * Nearest cell that fits the body, searched in rings from an arbitrary
     * point. Used so a room transition never materialises the player inside
     * whatever dressing happens to cover the door's landing spot.
     *
     * Candidates inside a door trigger zone are rejected: relocating a blocked
     * landing TOWARD the doorway would re-fire the door on arrival and bounce
     * the player straight back, which is worse than the burial it fixes.
     */
    function nearestFreeEntry(x, z, maxR, room, roomId) {
        const usable = (cx, cz) => clearForBody(cx, cz)
            && !insideAnyDoorTrigger(room, roomId, cx, cz);
        if (usable(x, z)) return { x, z };
        let fallback = clearForBody(x, z) ? { x, z } : null;
        // GO DOWN, NOT JUST OUT.
        //
        // Every standable surface is a legal answer, including the ROOF of the
        // thing we are trying to escape. The overworld's monolith is three cells
        // tall, is in `getVoxelAt`, and carries no XZ solid at all — so when a
        // mirror swap returned the player inside it, the old "first usable cell"
        // search stepped one cell sideways, found the monolith's own roof, and
        // stood them on top of the pillar at y=3.95.
        //
        // So rank candidates by ground height first and distance second: rings
        // are still walked outward, but a nearer perch loses to a floor a little
        // further away, and floor level ends the search because nothing beats it.
        // When the entry point is already usable this never runs, so arrivals
        // that legitimately land on a terrace are untouched.
        let best = null, bestTop = Infinity;
        for (let r = 1; r <= maxR; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const cx = x + dx, cz = z + dz;
                    if (usable(cx, cz)) {
                        const top = surfaceTop(cx, cz);
                        if (top != null && top < bestTop) { bestTop = top; best = { x: cx, z: cz }; }
                    } else if (!fallback && clearForBody(cx, cz)) {
                        fallback = { x: cx, z: cz };
                    }
                }
            }
            if (best && bestTop <= 1) return best; // on the floor; cannot do better
        }
        return best || fallback; // solid-free but trigger-adjacent beats burial
    }

    /** Nearest standable cell to a room's centre, searched in rings. */
    function nearestStandable(room, o) {
        const half = room.half;
        for (let r = 0; r <= half; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const x = o.x + dx + 0.5, z = o.z + dz + 0.5;
                    if (standable(x, z)) return { x, z };
                }
            }
        }
        return null;
    }

    function matchingDoor(toRoomId, fromRoomId) {
        const room = def.rooms[toRoomId];
        return (room.doors || []).find((d) => d.to === fromRoomId) || null;
    }

    function doorWorldCenter(roomId, door) {
        const room = def.rooms[roomId];
        const o = roomOrigin(room);
        const cells = doorCells(room, door);
        const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
        const cz = cells.reduce((s, c) => s + c.z, 0) / cells.length;
        return { x: o.x + cx + 0.5, z: o.z + cz + 0.5 };
    }

    /**
     * WHERE AND HOW HIGH the player lands when they walk into `toRoomId` from
     * `fromRoomId` — the whole answer, in one place, with nothing left for the
     * caller to add.
     *
     * Split out of `startTransition` so `tests/qa/entry-safety.mjs` can sweep the
     * real arithmetic across all 14 dungeons and the overworld. The probe used to
     * re-derive this, which is no test at all: a probe that reimplements the code
     * it is checking agrees with itself and stays green while the game is wrong.
     * Bakes the room first, because there is no ground to scan until it exists.
     */
    function arrivalPoint(toRoomId, fromRoomId) {
        bakeRoom(toRoomId);
        const back = matchingDoor(toRoomId, fromRoomId);
        const room = def.rooms[toRoomId];
        const o = roomOrigin(room);
        let entry;
        if (back) {
            const c = doorWorldCenter(toRoomId, back);
            const n = SIDE_NORMAL[back.side]; // points OUT of the room
            // Snapped to a cell centre. `doorWorldCenter` is on a half-cell and
            // the step in is a whole 2.5, so every door in the game used to land
            // the player exactly on the seam between two cells — body half-in
            // each. When one of them was solid the two collision boxes ejected
            // them toward opposite faces on alternate frames, which is what the
            // owner felt as being stuck.
            entry = cellCentre(c.x - n.x * 2.5, c.z - n.z * 2.5);
        } else {
            entry = cellCentre(o.x + (room.spawn?.x || 0), o.z + (room.spawn?.z || 0));
        }
        // Never materialise inside geometry. A door's landing spot is a fixed
        // 2.5 units in from the gap, so any dressing a room happens to place
        // there — a magma vent, a plinth, a basalt shelf — used to swallow the
        // player on arrival and leave them stuck in a wall. Step to the nearest
        // cell that actually fits the body instead.
        const safeEntry = nearestFreeEntry(
            entry.x, entry.z, Math.max(6, room.half), room, toRoomId);
        if (safeEntry) entry = safeEntry;
        // AT THE HEIGHT OF THE GROUND WE JUST CHOSE, not a constant.
        //
        // 1.95 is the hero's rest height on a floor whose top is y=1, which was
        // every floor in the game until Phase E2. `nearestFreeEntry` may now
        // legitimately land them on a terrace three cells up, and dropping them at
        // 1.95 there puts them inside it — the same arrival-inside-geometry this
        // guard exists to prevent, reintroduced one line below the guard.
        //
        // WHEN THE SCAN FINDS NOTHING, BE WRONG UPWARD. The old fallback here was
        // a bare 1.95, so a point with no readable ground buried the player at the
        // one height guaranteed to be inside anything raised. Falling is something
        // the player watches happen and then walks away from; buried is a reload.
        return { x: entry.x, y: groundY(entry.x, entry.z) ?? SAFE_DROP_Y, z: entry.z };
    }

    function startTransition(door, game) {
        const toRoomId = door.to;
        // A boss push-in belongs to one room. Cancel it before the room pan so
        // its height, back, and target cannot distort the next room's framing.
        game.cameraRig?.clearFocus?.();
        const entry = arrivalPoint(toRoomId, currentRoomId);
        const room = def.rooms[toRoomId];
        const player = game.player;
        player.rig.position.set(entry.x, entry.y, entry.z);
        player.physics.resetVelocity();
        player.physics.grounded = true;
        transition = {
            t: 0,
            dur: 0.35,
            to: toRoomId,
            pin: entry,
            fromRect: roomRect(def.rooms[currentRoomId]),
            toRect: roomRect(room),
        };
        sfx.whoosh?.();
    }

    /**
     * A room the player must clear before it lets them leave.
     *
     * Nothing in this game used to seal. You could walk into a room, ignore
     * every enemy in it, and leave through the far door — which means the whole
     * combat system was optional. That is a strange thing to build a guard, a
     * parry, a poise pool, directional armour and seven enemy kinds for: the
     * player who never fights is never wrong, and the systems that took the
     * longest to build are the ones they never meet.
     *
     * Authored per room (`seal: true`), not blanket, because a Zelda dungeon
     * that sealed EVERY room would be a corridor of arenas. The rule is: the
     * room you can be surprised in seals; the rooms you pass through do not.
     *
     * Only the room's own baked enemies count. A brood child spawned by a split
     * counts too — it is in `rec.enemies` — which is the point of that fight.
     */
    function sealedBy(roomId) {
        const room = def.rooms[roomId];
        if (!room || !room.seal) return null;
        const rec = baked.get(roomId);
        if (!rec) return null;
        // Given up on by the stalemate valve — see SEAL_STALEMATE_RELEASE. Once
        // broken it stays broken for this visit; re-arming it would put the
        // player straight back into the state that broke it.
        if (rec.sealBroken) return null;
        const alive = rec.enemies.filter(
            (e) => e.state?.current !== 'DEAD' && !e.defeated
        );
        return alive.length ? alive.length : null;
    }

    /**
     * Watch the sealed room for a fight that has stopped being a fight.
     *
     * The signature is every HP the encounter can move. If it has not changed
     * for SEAL_STALEMATE_RELEASE seconds, nothing is happening in either
     * direction and the door opens. See the constant for why the condition is
     * mutual rather than a plain timer.
     */
    function tickSealStalemate(dt, game) {
        const room = def.rooms[currentRoomId];
        const rec = baked.get(currentRoomId);
        if (!room || !room.seal || !rec || rec.sealBroken) {
            sealStallT = 0; sealStallSig = null; sealHeldT = 0;
            return;
        }
        const alive = rec.enemies.filter(
            (e) => e.state?.current !== 'DEAD' && !e.defeated
        );
        if (!alive.length) { sealStallT = 0; sealStallSig = null; sealHeldT = 0; return; }

        let sig = game.player?.health?.hp || 0;
        for (const e of alive) sig += (e.hp || 0);
        // The CEILING, which is the guarantee the signature above cannot give.
        //
        // The signature is mutual on purpose — an enemy hitting you counts as
        // the fight still resolving, so a player cannot open the door by
        // standing back from a fight they are losing. That is right, and it has
        // one hole: a room that can still hurt you but can NEVER be resolved
        // resets the timer every time it lands a hit, and the seal then holds
        // hardest in exactly the case where the player is helpless. An enemy
        // embedded in a terrace, which this game shipped until the same session
        // as this comment, is precisely that room.
        //
        // So the stalemate valve keeps its shape, and a second, much longer
        // clock runs underneath it that NOTHING resets while the room is still
        // sealed. A real fight never approaches it; a deadlock always reaches
        // it. Nobody is ever locked in a room forever.
        sealHeldT += dt;
        if (sealHeldT >= SEAL_HARD_RELEASE) {
            rec.sealBroken = true;
            sealStallT = 0;
            sealHeldT = 0;
            gsfx.doorOpen?.();
            game.hud?.toast?.('The seal gives way — this room is not resolving.', 3200);
            return;
        }

        if (sig !== sealStallSig) {
            sealStallSig = sig;
            sealStallT = 0;
            return;
        }
        sealStallT += dt;
        if (sealStallT < SEAL_STALEMATE_RELEASE) return;
        rec.sealBroken = true;
        sealStallT = 0;
        sealHeldT = 0;
        gsfx.doorOpen?.();
        game.hud?.toast?.('The seal gives way — nothing here is resolving.', 3200);
    }

    /** Public: is the current room holding the player? (HUD + tests) */
    function sealState() {
        const n = sealedBy(currentRoomId);
        return n ? { roomId: currentRoomId, remaining: n } : null;
    }

    /**
     * Refuse a door: push the player off the trigger and hand control back.
     *
     * Every refusal used to do this inline, three times over:
     *
     *     game.player.rig.position.x -= n.x * 1.4;
     *     game.player.rig.position.z -= n.z * 1.4;
     *     game.player.physics.resetVelocity();
     *
     * A raw write to the position, with NO collision resolution, of a fixed
     * 1.4 — against a locked door whose trigger reaches 1.2. Two ways to be
     * trapped by that, and the owner hit them in Beat 12 with no small key:
     *
     *   • the 1.4 goes wherever it points, through walls, off ledges and into
     *     lava, because nothing consults the collision world;
     *   • if it is blocked, or if 1.4 was not enough, the player is still
     *     inside the 1.2 trigger next frame. `checkDoorTriggers` runs every
     *     frame with no cooldown, so the door refuses again, and again — and
     *     each refusal calls `resetVelocity()`, so they can never build the
     *     momentum to walk out. The bounce becomes the cage.
     *
     * So: resolve the push against the collision world, derive the distance
     * from the trigger that has to be cleared rather than from a magic number,
     * and set a cooldown so a refusal cannot re-fire while the player is
     * walking away. The cooldown is the actual guarantee — even if geometry
     * blocks the push entirely, the player keeps their velocity and their
     * input and can leave under their own power.
     */
    function refuseDoor(door, game) {
        // Still cooling down from the last refusal: do nothing at all. Not the
        // push, not the velocity reset, not the toast. The player walks into
        // the doorway and is stopped by geometry like any other wall, which is
        // both correct and escapable.
        //
        // The cooldown deliberately gates the BOUNCE and not the door check.
        // Gating `checkDoorTriggers` instead was the first attempt and it broke
        // seven world-e2e assertions: a door the player can now open was being
        // skipped for 0.7s along with the refusal, so a key was never spent and
        // the room never changed. A refusal is the only thing worth suppressing.
        if (doorRefusedT > 0) return false;
        const n = SIDE_NORMAL[door.side];
        // Far enough to clear the trigger that just fired, plus a margin. The
        // old 1.4 cleared a locked door's 1.2 by two centimetres.
        const push = triggerReach(door) + 0.8;
        const p = game.player.rig.position;
        const nx = p.x - n.x * push;
        const nz = p.z - n.z * push;
        if (collisionWorld) {
            const r = collisionWorld.resolveMove(p.x, p.z, nx, nz, PLAYER_HALF);
            p.x = r.x; p.z = r.z;
        } else {
            p.x = nx; p.z = nz;
        }
        game.player.physics.resetVelocity();
        doorRefusedT = DOOR_REFUSE_COOLDOWN;
        return true;
    }

    /**
     * Hold the player inside a sealed room. Runs every frame, gates on nothing.
     *
     * The seal used to be enforced by `refuseDoor` alone: walk into the doorway,
     * get shoved back, velocity zeroed, and a 0.7s cooldown before the shove
     * could fire again. That cooldown is right for a LOCKED door — there is a
     * solid plug in the gap, geometry does the holding, and the cooldown only
     * stops the bounce becoming a cage. A SEALED door has no plug. It is an open
     * hole, the shove was the entire barrier, and for 0.7 seconds after each one
     * there was nothing there at all. 0.7s at 5.5 units/second is four times what
     * it takes to walk the 1.1 back and step through.
     *
     * Measured on beat-01 `antechamber`, holding south into its `open` door:
     * seven shoves in five seconds, and the player ends 14 units past the wall
     * at y = -29.34, still reported as inside the room. There is no floor out
     * there — the neighbour is 47 units away and is not baked until you
     * transition — so `index.js` fires its `y < -12` void kill. The room that
     * would not let the player leave is what killed them.
     *
     * All 26 sealed rooms had it. 18 have an `open` door and need no key; the
     * other 8 are plugged only until you unlock them, and `keyStore` outlives
     * the bake, so they open up too on the next visit.
     *
     * So the shove is gone and this is a clamp. Having no cooldown, there is no
     * frame on which the wall is not there. Being a clamp and not a teleport, it
     * cannot fling the player back into the enemies they were trying to get away
     * from, and it takes no velocity and no input away — you slide along the
     * doorway instead of being launched through the pack. `tryDoor` keeps the
     * cooldown for the toast and the sound, which is the only thing a cooldown
     * was ever the right tool for.
     */
    function holdSeal(game) {
        if (!sealedBy(currentRoomId)) return;
        const room = def.rooms[currentRoomId];
        const o = roomOrigin(room);
        const p = game.player.rig.position;
        for (const door of room.doors || []) {
            const w = (door.width || DOOR_WIDTH) / 2 + 0.5;
            const c = doorWorldCenter(currentRoomId, door);
            if (door.side === 'N' || door.side === 'S') {
                if (Math.abs(p.x - c.x) >= w) continue;
                const wallZ = door.side === 'N'
                    ? o.z - room.half + 0.5
                    : o.z + room.half + 0.5;
                // The wall PLANE, not the trigger line: the player may stand in
                // the doorway and be told no, they may just not pass through it.
                if (door.side === 'N') p.z = Math.max(p.z, wallZ);
                else p.z = Math.min(p.z, wallZ);
            } else {
                if (Math.abs(p.z - c.z) >= w) continue;
                const wallX = door.side === 'W'
                    ? o.x - room.half + 0.5
                    : o.x + room.half + 0.5;
                if (door.side === 'W') p.x = Math.max(p.x, wallX);
                else p.x = Math.min(p.x, wallX);
            }
        }
    }

    function tryDoor(door, game) {
        const type = door.type || 'open';
        // The seal outranks the door's own type — including `exit`. A room that
        // has not been cleared does not let you leave it by ANY route, or the
        // rule is "clear the room unless you happen to have come in the other
        // way", which is not a rule.
        const held = sealedBy(currentRoomId);
        if (held) {
            // Announcement only. `holdSeal` is what keeps the player in, so
            // this must not move them: the shove that used to live here threw
            // them 1.1 units back into the fight they were retreating from, and
            // it was never the thing holding the door.
            if (doorRefusedT <= 0) {
                doorRefusedT = DOOR_REFUSE_COOLDOWN;
                gsfx.doorLocked();
                game.hud?.toast?.(
                    held === 1 ? 'Sealed — one still standing' : `Sealed — ${held} still standing`,
                    1500
                );
            }
            coach('room-seal',
                'Some rooms hold the door shut until the room is clear. '
                + 'The way out is through what is in here with you.');
            return;
        }
        if (type === 'exit') {
            // Leaves the dungeon entirely (back to the overworld) — the def
            // decides where; bounce if it doesn't handle exits.
            if (def.onExit) {
                def.onExit(game, api);
            } else {
                refuseDoor(door, game);
            }
            return;
        }
        const dk = doorKey(def.id, currentRoomId, door.to);
        if ((type === 'locked' || type === 'boss') && !keyStore.isOpen(dk)) {
            let opened = false;
            if (type === 'locked') {
                opened = keyStore.trySpendSmallKey();
                if (!opened && doorRefusedT <= 0) {
                    game.hud?.toast?.('Locked — needs a small key');
                }
            } else {
                opened = keyStore.hasBossKey();
                if (!opened && doorRefusedT <= 0) {
                    game.hud?.toast?.('Sealed — the boss key is elsewhere');
                }
            }
            if (!opened) {
                game.anchorThread?.failed?.(
                    `door:${def.id}:${currentRoomId}:${door.to}`,
                    type === 'boss'
                        ? 'SYSTEM: Find the boss key, then return to this sealed door.'
                        : 'SYSTEM: Find a small key in this dungeon, then return to this lock.'
                );
                if (refuseDoor(door, game)) gsfx.doorLocked();
                return;
            }
            keyStore.open(dk);
            game.anchorThread?.markProgress?.('door_opened', dk);
            removePlug(dk);
            game.hud?.toast?.(type === 'boss' ? 'Boss door opens…' : 'Unlocked');
            if (type === 'boss') gsfx.bossDoor(); else gsfx.doorOpen();
            return; // opened this frame; walking through triggers next frame
        }
        startTransition(door, game);
    }

    /**
     * How close the player must get for a door to react.
     *
     * An OPEN door is an empty gap: the player walks into the doorway itself
     * and 0.3 past the wall line starts the room transition.
     *
     * A LOCKED or BOSS door is not a gap — `bakePlug` fills the doorway with
     * solid gold (or blood-red) voxels registered in the collision world. The
     * plug stops the player 0.9 short of the wall line, so a 0.3 trigger sat
     * *behind* solid matter and could never be reached: the key was never
     * spent and every locked door in the game was impassable on foot. A
     * plugged door therefore reacts on approach instead. Once it opens the
     * plug is removed, this returns to 0.3, and the next step walks through.
     */
    function triggerReach(door) {
        const type = door.type || 'open';
        if (type !== 'locked' && type !== 'boss') return 0.3;
        const dk = doorKey(def.id, currentRoomId, door.to);
        return keyStore.isOpen(dk) ? 0.3 : 1.2;
    }

    function checkDoorTriggers(game) {
        const room = def.rooms[currentRoomId];
        const o = roomOrigin(room);
        const p = game.player.root.position;
        for (const door of room.doors || []) {
            const w = (door.width || DOOR_WIDTH) / 2 + 0.5;
            const c = doorWorldCenter(currentRoomId, door);
            const reach = triggerReach(door);
            if (door.side === 'N' || door.side === 'S') {
                const wallZ = door.side === 'N' ? o.z - room.half + 0.5 : o.z + room.half + 0.5;
                const outward = door.side === 'N' ? p.z < wallZ + reach : p.z > wallZ - reach;
                if (outward && Math.abs(p.x - c.x) < w) { tryDoor(door, game); return; }
            } else {
                const wallX = door.side === 'W' ? o.x - room.half + 0.5 : o.x + room.half + 0.5;
                const outward = door.side === 'W' ? p.x < wallX + reach : p.x > wallX - reach;
                if (outward && Math.abs(p.z - c.z) < w) { tryDoor(door, game); return; }
            }
        }
    }

    function lerpRect(a, b, u) {
        return {
            minX: a.minX + (b.minX - a.minX) * u,
            maxX: a.maxX + (b.maxX - a.maxX) * u,
            minZ: a.minZ + (b.minZ - a.minZ) * u,
            maxZ: a.maxZ + (b.maxZ - a.maxZ) * u,
        };
    }

    function update(dt, game) {
        api._game = game; // blockers/toasts need a game ref outside ticks
        if (transition) {
            transition.t += dt;
            const u = Math.min(1, transition.t / transition.dur);
            // Input locked: pin the player at the entry point until the pan lands.
            game.player.rig.position.x = transition.pin.x;
            game.player.rig.position.z = transition.pin.z;
            game.player.physics.resetVelocity();
            setCameraBounds(lerpRect(transition.fromRect, transition.toRect, u));
            if (u >= 1) {
                const to = transition.to;
                transition = null;
                enterRoom(to, game);
            }
        } else {
            if (doorRefusedT > 0) doorRefusedT = Math.max(0, doorRefusedT - dt);
            // Before the triggers, so a door that is about to say "sealed" has
            // already stopped the player rather than reporting on them leaving.
            holdSeal(game);
            checkDoorTriggers(game);
            tickSealStalemate(dt, game);
        }

        for (const s of systems) if (s.update) s.update(dt, game);
        for (const rec of baked.values()) {
            for (const rt of rec.blockers || []) rt.update(dt, game);
        }
        // Before the enemies, not after: adoption has to happen before anything
        // asks for a token, and separation reads positions the enemies are
        // about to move from.
        director.update(dt);
        for (const e of enemies) {
            if (e.managedBySystem) continue;
            if (e.update) e.update(dt, game.player);
        }
        for (const p of pickups) {
            if (p.taken) continue;
            if (game.player.inventory?.getFlag?.(`pickup:${p._stableId}`)) {
                p.taken = true;
                p.mesh.visible = false;
                continue;
            }
            p.mesh.rotation.y += dt * 2;
            p.mesh.position.y = (p.baseY || 1.2) + Math.sin(performance.now() * 0.004) * 0.15;
            const dx = p.mesh.position.x - game.player.root.position.x;
            const dz = p.mesh.position.z - game.player.root.position.z;
            if (Math.hypot(dx, dz) < 1.1) {
                p.taken = true;
                p.mesh.visible = false;
                if (p.onPickup) p.onPickup(game);
                if (p.taken) {
                    game.player.inventory?.setFlag?.(`pickup:${p._stableId}`);
                    game.persistInventory?.();
                    game.anchorThread?.markProgress?.('item_acquired', p._stableId);
                    if (p.scoreType) game.witnessScore?.award?.(p.scoreType, p._stableId);
                    const beatNo = Number(String(def.id).match(/beat-(\d+)/)?.[1] || 0);

                    // Z7: reward type is DATA now, not a guess about the
                    // display name. Rewards used to be dispatched by string-
                    // matching labels — /cache/i meant "Scar Suture", and a
                    // hard-coded list of three label strings meant "Memory
                    // Vial" — so renaming a pickup silently changed what the
                    // player received. `reward` is authoritative when present;
                    // the label heuristics survive only as the fallback for
                    // pickups that have not declared one.
                    const reward = p.reward?.type
                        || (p.scoreType === 'secret' && beatNo >= 7 && beatNo <= 14 ? 'suture' : null);
                    if (reward === 'suture') game.collectSuture?.(p._stableId);
                    else if (reward === 'vial') game.collectMemoryVial?.(p._stableId);
                    // §7: the Resonance Fork and Entropy Dust moved to their
                    // authored acquisition chains (narrative/item-chains.js);
                    // their former host caches pay shards only now.
                    const optional = {
                        'Ledge cache': ['cipher_lens', 'Cipher Lens'],
                        'Crystal cache': ['reflector_plate', 'Reflector Plate'],
                    }[p.label];
                    if (optional) game.collectOptionalItem?.(optional[0], optional[1], p._stableId);
                }
                // Every pickup sounds, and what it sounds like says what it
                // was. One chime for a shard, a heart container and a heart
                // piece taught the player that finding things is uniform —
                // which is the opposite of what an exploration loop needs.
                // onPickup may re-arm (taken=false) to reject, e.g. the
                // keyless Wedge monolith.
                if (p.taken) {
                    // Ask pickupKind — the same function that chose this
                    // pickup's SHAPE. The dispatch used to re-derive the kind
                    // from its own regex chain, and that chain tested /key/i
                    // before anything else, so 'Boss key' matched the small-key
                    // arm and the most important pickup in a dungeon played the
                    // small key's blip. Two readings of one label is how they
                    // drifted apart; now there is one.
                    const kind = pickupKind(p);
                    if (kind === 'suture') gsfx.sutureGet();
                    else if (kind === 'vial' || kind === 'lore') gsfx.itemGet();
                    else if (kind === 'bosskey') gsfx.bossKeyGet();
                    else if (kind === 'key') gsfx.keyGet();
                    else if (p.scoreType === 'secret') gsfx.secretFound();
                    else gsfx.shardGet();
                }
            }
        }
        if (def.onUpdate) def.onUpdate(dt, game, api);

        const active = baked.get(currentRoomId);
        if (active?.enemies?.length && active.enemies.every((enemy) =>
            enemy.state?.current === 'DEAD' || enemy.defeated)) {
            game.witnessScore?.award?.('room_clear', `${def.id}:${currentRoomId}`);
        }
    }

    function dispose() {
        disposed = true;
        for (const roomId of [...baked.keys()]) {
            // disposeRoom skips nothing here — full teardown
            const rec = baked.get(roomId);
            rec.built.dispose();
            rec.platformBuilt?.dispose();
            disposeRoomLights(rec.roomLights, ctx.localLights);
            for (const rt of rec.blockers || []) { try { rt.dispose(); } catch (_) {} }
            for (const plug of rec.plugs.values()) plug.dispose();
            for (const e of rec.enemies) e.dispose();
            baked.delete(roomId);
        }
        enemies.length = 0;
        for (const s of systems) { try { s.dispose && s.dispose(); } catch (_) {} }
        systems.length = 0;
        for (const p of pickups) disposePickupMesh(p.mesh);
        pickups.length = 0;
        destructibles.length = 0;
        if (voidPlane.parent) voidPlane.parent.remove(voidPlane);
        voidPlane.geometry.dispose();
        voidPlane.material.dispose();
    }

    function addPickup(worldPos, data) {
        // Shape by reward type, not just colour. From a camera 17.5 units up,
        // under the Abyss grade, a colour-only difference between a handful of
        // shards and a quarter of a heart container is no difference at all.
        const mesh = buildPickupMesh(data);
        mesh.position.set(worldPos.x, worldPos.y != null ? worldPos.y : 1.2, worldPos.z);
        scene.add(mesh);
        const stableId = data.id || `${def.id}:${data.label || 'pickup'}:${Math.round(worldPos.x)}:${Math.round(worldPos.z)}`;
        // Z7: an explicitly declared reward is by definition an optional
        // secret, so it scores as one without also having to be named "cache".
        const scoreType = data.scoreType
            || (data.reward ? 'secret' : null)
            || (/cache/i.test(data.label || '') ? 'secret' : null);
        const p = {
            mesh, baseY: worldPos.y != null ? worldPos.y : 1.2,
            ...data, _stableId: stableId, scoreType, taken: false,
        };
        pickups.push(p);
        return p;
    }

    const startRoom = def.rooms[def.start];
    const startO = roomOrigin(startRoom);
    const api = {
        id: def.id,
        name: def.name,
        map: null,
        built: null,
        // Exposed so attachBoss can wire BossBase.collisionWorld without every
        // beat factory having to pass it by hand.
        collisionWorld,
        // Same reason: a boss registers a real light for its own glow, and
        // attachBoss is the one place that sees both the boss and the level.
        localLights: ctx.localLights || null,
        enemies,
        destructibles,
        pickups,
        systems,
        director,
        signals,
        puzzleBlocks,
        beamTargets,
        // Filled in below, once the start room is baked — a surface scan cannot
        // answer before there is anything to scan.
        spawn: {
            x: startO.x + (startRoom.spawn?.x || 0),
            y: 1.95,
            z: startO.z + (startRoom.spawn?.z || 0),
        },
        getVoxelAt(wx, wy, wz) {
            for (const rec of baked.values()) {
                if (rec.built.getVoxelAt(wx, wy, wz)) return true;
                if (rec.platformBuilt && rec.platformBuilt.getVoxelAt(wx, wy, wz)) return true;
            }
            // Runtime fillers (e.g. post-boss grapple-gap bridges)
            for (const q of extraVoxelQueries) {
                if (q(wx, wy, wz)) return true;
            }
            return false;
        },
        /** Register an extra occupancy query (blocker bridges, etc.). Returns unsubscribe. */
        addVoxelQuery(fn) {
            if (typeof fn !== 'function') return () => {};
            extraVoxelQueries.push(fn);
            return () => {
                const i = extraVoxelQueries.indexOf(fn);
                if (i >= 0) extraVoxelQueries.splice(i, 1);
            };
        },
        update,
        dispose,
        addEnemy(pos, eopts) {
            // Sweep every place, not one: this is the fourth and last door
            // enemies come through, and a body built here would otherwise be
            // the only kind in the game still blind to the floor.
            const e = new Enemy(scene, collisionWorld, pos,
                { getVoxelAt: api.getVoxelAt, ...eopts });
            enemies.push(e);
            const rec = baked.get(currentRoomId);
            if (rec) rec.enemies.push(e);
            return e;
        },
        addDummy(pos, dopts) {
            const d = new DummyTarget(scene, pos, dopts);
            enemies.push(d);
            const rec = baked.get(currentRoomId);
            if (rec) rec.enemies.push(d);
            return d;
        },
        addPickup,
        addSystem(sys) {
            systems.push(sys);
            return sys;
        },
        banner: def.banner || '',
        halfSize: startRoom.half,
        friction: def.friction || 'default',
        mood: def.mood || 'crust',
        lightTune: def.lightTune || null,
        onEnter: def.onEnter || null,
        flicker: def.flicker || 0,
        wrap: def.wrap || 0,
        cameraBounds: roomRect(startRoom),
        // Dungeon-specific surface
        keyStore,
        currentRoomId: () => currentRoomId,
        // Exposed so the HUD can say the room is holding you, and so specs can
        // assert the seal without driving a door collision.
        sealState,
        /**
         * World origin of the room the player is standing in.
         *
         * Rooms sit on a 64-unit grid, and the key light's shadow frustum is a
         * ±30 box that never moved off the world origin — so only the room at
         * grid (0,0) was ever inside it, and every dungeon starts at (0,0).
         * The one room you always see first was the one room that worked.
         * The frame loop aims the sun with this.
         */
        /**
         * Light trim for the room the player is in, falling back to the level's.
         *
         * `enterRoom` applies this on every transition, but the FIRST room is
         * entered while the level is still being constructed, with no `game` to
         * reach the mood controller through — so the loader has to ask for it.
         * Without this the overworld's per-screen trim only took effect once
         * you walked somewhere, and a level loaded directly into a dark region
         * (which is exactly what a certification capture does) stayed dark.
         */
        currentRoomTune() {
            return def.rooms[currentRoomId]?.lightTune || def.lightTune || null;
        },
        currentRoomOrigin() {
            const room = def.rooms[currentRoomId];
            return room ? roomOrigin(room) : null;
        },
        isTransitioning: () => !!transition,
        /**
         * Rig height to stand on (x,z), or null where there is no ground.
         *
         * Exposed because everything that moves the player somewhere used to
         * spell out the hero's rest height itself — the grapple-gap fall catch,
         * the boot-ledge hop, the death fallback, the overworld's saved-position
         * restore. Every one of them said 1.95, every one of them was written
         * when that was the only floor height in the game, and every one of them
         * buried the player once terraces arrived. There is one scan now.
         */
        groundY,
        /**
         * Can the player's BODY stand at (x,z)? Ground under it and no XZ solid
         * through it — the two halves that have to be asked together.
         *
         * Exposed alongside `groundY` because asking only the height one is its
         * own bug: inside a wall, `groundY` cheerfully answers with the wall's
         * ROOF. `tests/world-e2e.spec.mjs` caught exactly that when the
         * overworld's mirror-swap nudge was ported to the height query alone.
         */
        canStand: standable,
        /**
         * Nearest spot in the current room where the player can actually be,
         * as {x, y, z} — cell-centred, body-checked, ground-height measured,
         * preferring floor over any perch it has to climb.
         *
         * The overworld used to hand-roll its own ring search for this, with its
         * own idea of "free" (cell 1 empty, cell 0 solid — the flat-floor
         * question), and the two answers drifted apart the moment terraces
         * existed. One search.
         */
        safeSpot(x, z, maxR = 8) {
            const room = def.rooms[currentRoomId];
            if (!room) return null;
            const c = cellCentre(x, z);
            const found = nearestFreeEntry(c.x, c.z, maxR, room, currentRoomId);
            if (!found) return null;
            return { x: found.x, z: found.z, y: groundY(found.x, found.z) ?? SAFE_DROP_Y };
        },
        /**
         * The exact spot walking from `fromRoomId` into `toRoomId` puts you.
         * Exposed for `tests/qa/entry-safety.mjs`, which sweeps every door in the
         * campaign — calling the real function rather than re-deriving it is the
         * only version of that sweep worth running.
         */
        arrivalPoint,
        enterRoom,
        bakedRooms: () => [...baked.keys()],
        def,
        /**
         * Where death returns the player: the entry point of the room they
         * are CURRENTLY in. Never the level's load-time spawn — on the
         * overworld that is a different screen entirely, so teleporting there
         * drops the player into unbaked void and they fall forever instead of
         * respawning. The declared spawn can also sit on carved geometry
         * (chasms, sludge pools), so an unsupported point falls back to the
         * nearest standable floor cell in the same room.
         */
        respawnPoint() {
            const room = def.rooms[currentRoomId];
            if (!room) return null;
            const o = roomOrigin(room);
            // `standable` already scanned for this room's real surface; returning
            // a constant 1.95 next to it threw the answer away and buried anyone
            // who died on a terrace. Ask once, use what it said.
            const c = cellCentre(o.x + (room.spawn?.x || 0), o.z + (room.spawn?.z || 0));
            const here = standable(c.x, c.z) ? groundY(c.x, c.z) : null;
            if (here != null) return { roomId: currentRoomId, x: c.x, y: here, z: c.z };
            const found = nearestStandable(room, o);
            return found
                ? { roomId: currentRoomId, x: found.x, y: groundY(found.x, found.z) ?? SAFE_DROP_Y, z: found.z }
                : { roomId: currentRoomId, x: c.x, y: SAFE_DROP_Y, z: c.z };
        },
        /**
         * The puzzle layout a room actually BAKED, settled against its real
         * geometry — not the authored offsets `puzzleFor` starts from. Returns
         * `[]` for a room with no puzzle or one that has not been baked yet.
         */
        puzzleDefs(roomId) {
            return baked.get(roomId)?.puzzle || [];
        },
        // W6: room-graph view for the Tab map
        /**
         * Grapple anchors in the current room, for the FX layer to highlight.
         * Only the baked room's are returned — an anchor two rooms away is not
         * something the player can reach or should be shown.
         */
        grappleAnchors() {
            const rec = baked.get(currentRoomId);
            const out = [];
            for (const rt of rec?.blockers || []) {
                for (const a of rt.anchorPoints || []) out.push(a);
            }
            return out;
        },
        mapData() {
            const visited = keyStore.visited?.() || [];
            return {
                kind: 'dungeon',
                name: def.name,
                mapAll: keyStore.mapPickup?.() === true,
                rooms: Object.entries(def.rooms).map(([rid, r]) => ({
                    id: rid,
                    gx: r.grid[0],
                    gy: r.grid[1],
                    visited: visited.includes(rid),
                    current: rid === currentRoomId,
                    boss: !!r.boss,
                    doors: (r.doors || [])
                        .filter((d) => d.type !== 'exit' && def.rooms[d.to])
                        .map((d) => ({
                            to: d.to,
                            type: d.type || 'open',
                            opened: keyStore.isOpen(doorKey(def.id, rid, d.to)),
                        })),
                })),
            };
        },
    };

    if (def.prebake) {
        for (const roomId of Object.keys(def.rooms)) bakeRoom(roomId);
    }
    enterRoom(def.start, null);

    // The start room is baked now, so the spawn can be measured instead of
    // assumed. `index.js` hands this straight to `player.setSpawn`, and
    // `setSpawn` respawns immediately — so a wrong y here is not a bad first
    // frame, it is the height every death in the first room returns you to.
    {
        const c = cellCentre(api.spawn.x, api.spawn.z);
        const safe = nearestFreeEntry(c.x, c.z, Math.max(6, startRoom.half || 6),
            startRoom, def.start) || c;
        api.spawn.x = safe.x;
        api.spawn.z = safe.z;
        api.spawn.y = groundY(safe.x, safe.z) ?? SAFE_DROP_Y;
    }
    return api;
}
