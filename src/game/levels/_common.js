// Shared level context helpers.

import * as THREE from 'three';
import { buildPickupMesh, disposePickupMesh } from '../assets/pickup-shapes.js';
import { meshAndCollide, buildRoomFloor, buildPerimeter, VS } from '../world/level-builder.js';
import { stampMap } from '../assets/props.js';
import { CRUST_COLORS, ABYSS_COLORS, MOOD_PRESETS } from '../assets/palettes.js';
import { Enemy, DummyTarget, attachSplit } from '../enemy.js';

/**
 * Create a standard level shell.
 * @returns level handle with dispose, enemies, destructibles, pickups, update, getVoxelAt, spawn
 */
export function createLevelShell(ctx, opts = {}) {
    const {
        scene, collisionWorld, particles, player,
    } = ctx;

    const disposers = [];
    const enemies = [];
    const destructibles = [];
    const pickups = [];
    const systems = []; // { update(dt), dispose() }
    const map = new Map();
    const half = opts.half != null ? opts.half : 12;
    const wallH = opts.wallH != null ? opts.wallH : 3;
    const floorColor = opts.floorColor || CRUST_COLORS.floor;
    const wallColor = opts.wallColor || CRUST_COLORS.wall;

    buildRoomFloor(map, -half, half, -half, half, 0, floorColor);
    if (opts.perimeter !== false) {
        buildPerimeter(map, -half, half, -half, half, wallH, wallColor);
    }

    // Optional props stamped before mesh
    if (opts.stamp) opts.stamp(map, { half, stampMap, CRUST_COLORS, ABYSS_COLORS });

    const built = meshAndCollide(map, scene, collisionWorld, {
        solidPrefix: opts.id || 'lvl',
        material: new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: opts.roughness != null ? opts.roughness : 0.88,
            metalness: opts.metalness != null ? opts.metalness : 0.05,
        }),
    });
    disposers.push(() => built.dispose());

    // S5: void dressing — a huge fog-colored ground plane below the floor so
    // outside-the-arena reads as fog floor instead of black void.
    {
        const moodPreset = MOOD_PRESETS[opts.mood] || MOOD_PRESETS.crust;
        const voidPlane = new THREE.Mesh(
            new THREE.CircleGeometry(200, 24),
            new THREE.MeshBasicMaterial({ color: moodPreset.background })
        );
        voidPlane.rotation.x = -Math.PI / 2;
        voidPlane.position.y = -0.5;
        scene.add(voidPlane);
        disposers.push(() => {
            if (voidPlane.parent) voidPlane.parent.remove(voidPlane);
            voidPlane.geometry.dispose();
            voidPlane.material.dispose();
        });
    }

    // Spawn on the floor interior (cell coords == world units at VOXEL_SCALE=1)
    const spawn = opts.spawn || { x: 0, y: 1.5, z: Math.max(2, half - 4) };

    function addEnemy(pos, eopts) {
        const e = new Enemy(scene, collisionWorld, pos, eopts);
        attachSplit(e, addEnemy); // Z5: children register exactly like parents
        enemies.push(e);
        disposers.push(() => e.dispose());
        return e;
    }

    function addDummy(pos, dopts) {
        const d = new DummyTarget(scene, pos, dopts);
        enemies.push(d);
        disposers.push(() => d.dispose());
        return d;
    }

    function addPickup(pos, data) {
        // Same typed silhouettes the dungeons use — the overworld's sutures
        // are worth exactly as much, so they must read exactly as loudly.
        const mesh = buildPickupMesh(data);
        mesh.position.set(pos.x, pos.y != null ? pos.y : 1.0, pos.z);
        scene.add(mesh);
        const p = { mesh, ...data, taken: false };
        pickups.push(p);
        disposers.push(() => disposePickupMesh(mesh));
        return p;
    }

    function addSystem(sys) {
        systems.push(sys);
        disposers.push(() => sys.dispose && sys.dispose());
        return sys;
    }

    function update(dt, game) {
        for (const s of systems) if (s.update) s.update(dt, game);
        // Skip entities already stepped by a system (bosses dual-registered
        // for combat + custom AI would otherwise advance 2×dt per frame).
        for (const e of enemies) {
            if (e.managedBySystem) continue;
            if (e.update) e.update(dt, game.player);
        }
        // Pickups
        for (const p of pickups) {
            if (p.taken) continue;
            p.mesh.rotation.y += dt * 2;
            p.mesh.position.y = (p.baseY || 1) + Math.sin(performance.now() * 0.004) * 0.15;
            const dx = p.mesh.position.x - game.player.root.position.x;
            const dz = p.mesh.position.z - game.player.root.position.z;
            if (Math.hypot(dx, dz) < 1.1) {
                p.taken = true;
                p.mesh.visible = false;
                if (p.onPickup) p.onPickup(game);
            }
        }
        if (opts.onUpdate) opts.onUpdate(dt, game, api);
    }

    function dispose() {
        for (const d of disposers.reverse()) {
            try { d(); } catch (_) {}
        }
        enemies.length = 0;
        destructibles.length = 0;
        pickups.length = 0;
        systems.length = 0;
    }

    const api = {
        id: opts.id,
        name: opts.name,
        map,
        built,
        enemies,
        destructibles,
        pickups,
        systems,
        spawn,
        getVoxelAt: built.getVoxelAt,
        update,
        dispose,
        addEnemy,
        addDummy,
        addPickup,
        addSystem,
        banner: opts.banner || '',
        halfSize: half,
        friction: opts.friction || 'default',
        mood: opts.mood || 'crust',
        onEnter: opts.onEnter || null,
        flicker: opts.flicker || 0,
        wrap: opts.wrap || 0,
    };
    return api;
}

export { VS, CRUST_COLORS, ABYSS_COLORS, THREE };
