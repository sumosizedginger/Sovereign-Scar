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
import { fillBox } from '../../voxel/helpers.js';
import { stampMap } from '../assets/props.js';
import { CRUST_COLORS, ABYSS_COLORS, MOOD_PRESETS } from '../assets/palettes.js';
import { Enemy, DummyTarget } from '../enemy.js';
import { sfx } from '../../audio/synth.js';

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

    // Session-local lock store (replaced by the persistent one in W3).
    const localOpened = new Set();
    let localSmallKeys = 0;
    let localBossKey = false;
    const keyStore = opts.keyStore || {
        isOpen: (dk) => localOpened.has(dk),
        open: (dk) => localOpened.add(dk),
        trySpendSmallKey: () => (localSmallKeys > 0 ? (localSmallKeys--, true) : false),
        grantSmallKey: () => { localSmallKeys += 1; },
        hasBossKey: () => localBossKey,
        grantBossKey: () => { localBossKey = true; },
        smallKeys: () => localSmallKeys,
    };

    const baked = new Map(); // roomId → { built, plugs: Map(dk→built), enemies, disposers }
    const systems = [];
    const pickups = [];
    const destructibles = [];
    const enemies = []; // live combat list across baked rooms (shared identity)
    let currentRoomId = def.start;
    let transition = null; // { t, dur, to, pin: {x,z} }
    let bossSpawned = false;
    let bossRoomId = null;
    let disposed = false;

    // Void dressing (S5 pattern) — one big fog-floor for the whole dungeon.
    const voidPlane = new THREE.Mesh(
        new THREE.CircleGeometry(400, 24),
        new THREE.MeshBasicMaterial({ color: moodPreset.background })
    );
    voidPlane.rotation.x = -Math.PI / 2;
    voidPlane.position.y = -0.5;
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

        const built = meshAndCollide(map, scene, collisionWorld, {
            origin,
            solidPrefix: `${def.id}:${roomId}`,
        });

        const rec = { built, plugs: new Map(), enemies: [], room };
        for (const door of room.doors || []) {
            if (door.type === 'locked' || door.type === 'boss') {
                const plug = bakePlug(roomId, room, door, origin);
                if (plug) rec.plugs.set(doorKey(def.id, roomId, door.to), plug);
            }
        }
        for (const e of room.enemies || []) {
            const enemy = new Enemy(scene, collisionWorld,
                { x: origin.x + e.x, y: 1.0, z: origin.z + e.z }, e);
            rec.enemies.push(enemy);
            enemies.push(enemy);
        }
        baked.set(roomId, rec);

        if (room.boss && !bossSpawned) {
            bossSpawned = true;
            bossRoomId = roomId;
            room.boss(ctx, api, origin); // factory must call attachBoss(api, …)
        }
        if (room.onBake) room.onBake(api, origin, ctx);
    }

    function disposeRoom(roomId) {
        const rec = baked.get(roomId);
        if (!rec) return;
        rec.built.dispose();
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
        // Dispose far rooms (boss room stays once its boss exists).
        for (const otherId of [...baked.keys()]) {
            if (otherId === roomId) continue;
            if (otherId === bossRoomId && bossSpawned) continue;
            if (gridDistance(def.rooms[otherId], room) >= 2) disposeRoom(otherId);
        }
        if (api.onRoomEnter) api.onRoomEnter(roomId, game);
        if (room.onEnter && game) room.onEnter(game, room);
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
                // bounce back along the inward normal
                const n = SIDE_NORMAL[door.side];
                game.player.rig.position.x -= n.x * 1.4;
                game.player.rig.position.z -= n.z * 1.4;
                game.player.physics.resetVelocity();
                sfx.block?.();
                return;
            }
            keyStore.open(dk);
            removePlug(dk);
            game.hud?.toast?.(type === 'boss' ? 'Boss door opens…' : 'Unlocked');
            sfx.heave?.();
            return; // opened this frame; walking through triggers next frame
        }
        startTransition(door, game);
    }

    function checkDoorTriggers(game) {
        const room = def.rooms[currentRoomId];
        const o = roomOrigin(room);
        const p = game.player.root.position;
        for (const door of room.doors || []) {
            const w = (door.width || DOOR_WIDTH) / 2 + 0.5;
            const c = doorWorldCenter(currentRoomId, door);
            if (door.side === 'N' || door.side === 'S') {
                const wallZ = door.side === 'N' ? o.z - room.half + 0.5 : o.z + room.half + 0.5;
                const outward = door.side === 'N' ? p.z < wallZ + 0.3 : p.z > wallZ - 0.3;
                if (outward && Math.abs(p.x - c.x) < w) { tryDoor(door, game); return; }
            } else {
                const wallX = door.side === 'W' ? o.x - room.half + 0.5 : o.x + room.half + 0.5;
                const outward = door.side === 'W' ? p.x < wallX + 0.3 : p.x > wallX - 0.3;
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
        for (const e of enemies) {
            if (e.managedBySystem) continue;
            if (e.update) e.update(dt, game.player);
        }
        for (const p of pickups) {
            if (p.taken) continue;
            p.mesh.rotation.y += dt * 2;
            p.mesh.position.y = (p.baseY || 1.2) + Math.sin(performance.now() * 0.004) * 0.15;
            const dx = p.mesh.position.x - game.player.root.position.x;
            const dz = p.mesh.position.z - game.player.root.position.z;
            if (Math.hypot(dx, dz) < 1.1) {
                p.taken = true;
                p.mesh.visible = false;
                if (p.onPickup) p.onPickup(game);
            }
        }
        if (def.onUpdate) def.onUpdate(dt, game, api);
    }

    function dispose() {
        disposed = true;
        for (const roomId of [...baked.keys()]) {
            // disposeRoom skips nothing here — full teardown
            const rec = baked.get(roomId);
            rec.built.dispose();
            for (const plug of rec.plugs.values()) plug.dispose();
            for (const e of rec.enemies) e.dispose();
            baked.delete(roomId);
        }
        enemies.length = 0;
        for (const s of systems) { try { s.dispose && s.dispose(); } catch (_) {} }
        systems.length = 0;
        for (const p of pickups) {
            if (p.mesh?.parent) p.mesh.parent.remove(p.mesh);
            p.mesh?.geometry?.dispose?.();
            p.mesh?.material?.dispose?.();
        }
        pickups.length = 0;
        destructibles.length = 0;
        if (voidPlane.parent) voidPlane.parent.remove(voidPlane);
        voidPlane.geometry.dispose();
        voidPlane.material.dispose();
    }

    function addPickup(worldPos, data) {
        const mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.35, 0),
            new THREE.MeshStandardMaterial({
                color: data.color || 0x7fe0ff,
                emissive: data.color || 0x7fe0ff,
                emissiveIntensity: 2,
            })
        );
        mesh.position.set(worldPos.x, worldPos.y != null ? worldPos.y : 1.2, worldPos.z);
        scene.add(mesh);
        const p = { mesh, baseY: worldPos.y != null ? worldPos.y : 1.2, ...data, taken: false };
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
            }
            return false;
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
        onEnter: def.onEnter || null,
        flicker: def.flicker || 0,
        wrap: def.wrap || 0,
        cameraBounds: roomRect(startRoom),
        // Dungeon-specific surface
        keyStore,
        currentRoomId: () => currentRoomId,
        isTransitioning: () => !!transition,
        enterRoom,
        bakedRooms: () => [...baked.keys()],
        def,
    };

    enterRoom(def.start, null);
    return api;
}
