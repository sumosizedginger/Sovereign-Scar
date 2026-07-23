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
import { fillBox } from '../../voxel/helpers.js';
import { stampMap } from '../assets/props.js';
import { CRUST_COLORS, ABYSS_COLORS, MOOD_PRESETS } from '../assets/palettes.js';
import { Enemy, DummyTarget, attachSplit } from '../enemy.js';
import { sfx } from '../../audio/synth.js';
import { makeKeyStore } from './keys.js';
import { applyBlockerToMap, createBlockerRuntime } from './blockers.js';
import { applyRoomTrim } from './room-trim.js';
import { scaleEnemyHp, beatNumberOf, applyBossCurve } from './threat-curve.js';
import { gsfx } from '../audio/sfx-bank.js';
import { buildPickupMesh, disposePickupMesh } from '../assets/pickup-shapes.js';

export const ROOM_STRIDE = 64;
export const DOOR_WIDTH = 2;

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
    let currentRoomId = def.start;
    let transition = null; // { t, dur, to, pin: {x,z} }
    let bossSpawned = false;
    let bossRoomId = null;
    let disposed = false;
    let themeHintShown = false; // Z6: the dungeon states its idea exactly once

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
        applyRoomTrim(map, room, roomId, {
            enabled: def.trim !== false
                && !(typeof window !== 'undefined' && window.__sovereignScar?.__trimOff),
        });
        for (const b of room.blockers || []) applyBlockerToMap(map, b); // W7

        // Multi-Y platforms (G5): meshed WITHOUT XZ solids so their tops are
        // standable — VoxelPhysicsBody climbs 1-cell steps via getVoxelAt.
        // Built BEFORE the room mesh so Z2 can see both maps at once: a rise
        // in the platform map often steps up off floor in the room map.
        let pmap = null;
        if (room.platforms) {
            pmap = new Map();
            room.platforms(pmap, buildHelpers(room));
        }

        // Z2: mark the rim of every climbable one-cell rise, so "can I get up
        // there" is answerable by looking instead of by walking into it.
        markTraversal(map, pmap, DUNGEON_KITS[def.id]);

        const built = meshAndCollide(map, scene, collisionWorld, {
            origin,
            solidPrefix: `${def.id}:${roomId}`,
        });
        const platformBuilt = pmap ? meshAndCollide(pmap, scene, null, { origin }) : null;

        const rec = { built, platformBuilt, plugs: new Map(), enemies: [], room, blockers: [] };
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
            const child = new Enemy(scene, collisionWorld, pos, eopts);
            rec.enemies.push(child);
            enemies.push(child);
            return child;
        };
        // Authored HP is a RELATIVE weight; the campaign curve sets the absolute
        // figure so an enemy's behaviour still has time to happen once the
        // player's weapon damage has tripled. See world/threat-curve.js.
        const beatNo = beatNumberOf(def.id);
        for (const e of room.enemies || []) {
            const enemy = new Enemy(scene, collisionWorld,
                { x: origin.x + e.x, y: 1.0, z: origin.z + e.z },
                { ...e, hp: scaleEnemyHp(e.hp, beatNo) });
            attachSplit(enemy, spawnInto);
            rec.enemies.push(enemy);
            enemies.push(enemy);
        }
        baked.set(roomId, rec);

        if (room.boss && !bossSpawned) {
            bossSpawned = true;
            bossRoomId = roomId;
            room.boss(ctx, api, origin); // factory must call attachBoss(api, …)
            // Same curve, same reason: authored boss HP is flat 12-18 across the
            // whole campaign, so nine of fourteen bosses died faster than the
            // trash in the corridor outside. See world/threat-curve.js.
            applyBossCurve(api.boss, beatNumberOf(def.id));
        }
        if (room.onBake) room.onBake(api, origin, ctx);
    }

    function disposeRoom(roomId) {
        const rec = baked.get(roomId);
        if (!rec) return;
        rec.built.dispose();
        rec.platformBuilt?.dispose();
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
    function standable(x, z) {
        return api.getVoxelAt(x, 0.5, z) && !api.getVoxelAt(x, 1.5, z);
    }

    /**
     * Floor to stand on AND room for the whole body. The hero is ~1.9 tall on a
     * floor whose top is y=1, so cells 1 and 2 must both be clear — checking
     * only 1.5 lets a landing spot sit under a shelf or inside a 2-high block.
     */
    function clearForBody(x, z) {
        return api.getVoxelAt(x, 0.5, z)
            && !api.getVoxelAt(x, 1.5, z)
            && !api.getVoxelAt(x, 2.5, z);
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
        for (let r = 1; r <= maxR; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const cx = x + dx, cz = z + dz;
                    if (usable(cx, cz)) return { x: cx, z: cz };
                    if (!fallback && clearForBody(cx, cz)) fallback = { x: cx, z: cz };
                }
            }
        }
        return fallback; // solid-free but trigger-adjacent beats being buried
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

    function startTransition(door, game) {
        const toRoomId = door.to;
        // A boss push-in belongs to one room. Cancel it before the room pan so
        // its height, back, and target cannot distort the next room's framing.
        game.cameraRig?.clearFocus?.();
        bakeRoom(toRoomId);
        const back = matchingDoor(toRoomId, currentRoomId);
        const room = def.rooms[toRoomId];
        const o = roomOrigin(room);
        let entry;
        if (back) {
            const c = doorWorldCenter(toRoomId, back);
            const n = SIDE_NORMAL[back.side]; // points OUT of the room
            entry = { x: c.x - n.x * 2.5, z: c.z - n.z * 2.5 };
        } else {
            entry = { x: o.x + (room.spawn?.x || 0), z: o.z + (room.spawn?.z || 0) };
        }
        // Never materialise inside geometry. A door's landing spot is a fixed
        // 2.5 units in from the gap, so any dressing a room happens to place
        // there — a magma vent, a plinth, a basalt shelf — used to swallow the
        // player on arrival and leave them stuck in a wall. Step to the nearest
        // cell that actually fits the body instead.
        const safeEntry = nearestFreeEntry(
            entry.x, entry.z, Math.max(6, room.half), room, toRoomId);
        if (safeEntry) entry = safeEntry;
        const player = game.player;
        player.rig.position.set(entry.x, 1.95, entry.z);
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

    function tryDoor(door, game) {
        const type = door.type || 'open';
        if (type === 'exit') {
            // Leaves the dungeon entirely (back to the overworld) — the def
            // decides where; bounce if it doesn't handle exits.
            if (def.onExit) {
                def.onExit(game, api);
            } else {
                const n = SIDE_NORMAL[door.side];
                game.player.rig.position.x -= n.x * 1.4;
                game.player.rig.position.z -= n.z * 1.4;
                game.player.physics.resetVelocity();
            }
            return;
        }
        const dk = doorKey(def.id, currentRoomId, door.to);
        if ((type === 'locked' || type === 'boss') && !keyStore.isOpen(dk)) {
            let opened = false;
            if (type === 'locked') {
                opened = keyStore.trySpendSmallKey();
                if (!opened) game.hud?.toast?.('Locked — needs a small key');
            } else {
                opened = keyStore.hasBossKey();
                if (!opened) game.hud?.toast?.('Sealed — the boss key is elsewhere');
            }
            if (!opened) {
                game.anchorThread?.failed?.(
                    `door:${def.id}:${currentRoomId}:${door.to}`,
                    type === 'boss'
                        ? 'SYSTEM: Find the boss key, then return to this sealed door.'
                        : 'SYSTEM: Find a small key in this dungeon, then return to this lock.'
                );
                // bounce back along the inward normal
                const n = SIDE_NORMAL[door.side];
                game.player.rig.position.x -= n.x * 1.4;
                game.player.rig.position.z -= n.z * 1.4;
                game.player.physics.resetVelocity();
                gsfx.doorLocked();
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
            checkDoorTriggers(game);
        }

        for (const s of systems) if (s.update) s.update(dt, game);
        for (const rec of baked.values()) {
            for (const rt of rec.blockers || []) rt.update(dt, game);
        }
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
                    const kind = p.reward?.type
                        || (/suture/i.test(p.label || '') ? 'suture' : null)
                        || (/key/i.test(p.label || '') ? 'key' : null);
                    if (kind === 'suture') gsfx.sutureGet();
                    else if (kind === 'vial' || kind === 'lore') gsfx.itemGet();
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
        enemies,
        destructibles,
        pickups,
        systems,
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
            const e = new Enemy(scene, collisionWorld, pos, eopts);
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
        /**
         * World origin of the room the player is standing in.
         *
         * Rooms sit on a 64-unit grid, and the key light's shadow frustum is a
         * ±30 box that never moved off the world origin — so only the room at
         * grid (0,0) was ever inside it, and every dungeon starts at (0,0).
         * The one room you always see first was the one room that worked.
         * The frame loop aims the sun with this.
         */
        currentRoomOrigin() {
            const room = def.rooms[currentRoomId];
            return room ? roomOrigin(room) : null;
        },
        isTransitioning: () => !!transition,
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
            const x = o.x + (room.spawn?.x || 0);
            const z = o.z + (room.spawn?.z || 0);
            if (standable(x, z)) return { roomId: currentRoomId, x, y: 1.95, z };
            const found = nearestStandable(room, o);
            return found
                ? { roomId: currentRoomId, x: found.x, y: 1.95, z: found.z }
                : { roomId: currentRoomId, x, y: 1.95, z };
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
    return api;
}
