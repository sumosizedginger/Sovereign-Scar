// Shared level construction: floors, walls, solids, occupancy queries.

import * as THREE from 'three';
import { vkey, buildVoxelGeo } from '../../voxel/core.js';
import { fillBox } from '../../voxel/helpers.js';
import { CRUST_COLORS, ABYSS_COLORS, VOXEL_SCALE } from '../assets/palettes.js';

export const VS = VOXEL_SCALE;

/**
 * Convert level-map integer coords to world position (cell center).
 */
export function cellToWorld(x, y, z, origin = { x: 0, y: 0, z: 0 }) {
    return {
        x: origin.x + (x + 0.5) * VS,
        y: origin.y + (y + 0.5) * VS,
        z: origin.z + (z + 0.5) * VS,
    };
}

/**
 * Build a solid rectangular room floor + walls into a Map.
 */
export function buildRoomFloor(map, x0, x1, z0, z1, y = 0, color = CRUST_COLORS.floor) {
    fillBox(map, x0, x1, y, y, z0, z1, color);
}

export function buildWallBox(map, x0, x1, y0, y1, z0, z1, color = CRUST_COLORS.wall) {
    fillBox(map, x0, x1, y0, y1, z0, z1, color);
}

/** Perimeter walls for a rectangular arena. */
export function buildPerimeter(map, x0, x1, z0, z1, wallH = 3, color = CRUST_COLORS.wall) {
    // North / South
    fillBox(map, x0, x1, 1, wallH, z0, z0, color);
    fillBox(map, x0, x1, 1, wallH, z1, z1, color);
    // West / East
    fillBox(map, x0, x0, 1, wallH, z0, z1, color);
    fillBox(map, x1, x1, 1, wallH, z0, z1, color);
}

/**
 * Mesh a map and register column solids for walls (y>=1) and optional floors.
 */
export function meshAndCollide(map, scene, collisionWorld, opts = {}) {
    const origin = opts.origin || { x: 0, y: 0, z: 0 };
    const solidPrefix = opts.solidPrefix || 'lvl';
    const mat = opts.material || new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.88, metalness: 0.04,
    });
    const geo = buildVoxelGeo(map, opts.jitter != null ? opts.jitter : 0.05);
    geo.scale(VS, VS, VS);
    geo.translate(VS * 0.5, VS * 0.5, VS * 0.5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(origin.x, origin.y, origin.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (scene) scene.add(mesh);

    const solidIds = [];
    if (collisionWorld) {
        // Walls: any column with maxY >= 1 becomes an XZ solid
        const columns = new Map();
        for (const k of map.keys()) {
            const [x, y, z] = k.split(',').map(Number);
            const ck = x + ',' + z;
            const c = columns.get(ck);
            if (!c) columns.set(ck, { minY: y, maxY: y });
            else {
                c.minY = Math.min(c.minY, y);
                c.maxY = Math.max(c.maxY, y);
            }
        }
        for (const [ck, c] of columns) {
            if (c.maxY < 1) continue; // pure floor
            const [x, z] = ck.split(',').map(Number);
            const id = `${solidPrefix}:${x},${z}`;
            collisionWorld.addSolid({
                id,
                minX: origin.x + x * VS,
                maxX: origin.x + (x + 1) * VS,
                minZ: origin.z + z * VS,
                maxZ: origin.z + (z + 1) * VS,
            });
            solidIds.push(id);
        }
    }

    /** Occupancy query in world units for physics. */
    function getVoxelAt(wx, wy, wz) {
        const lx = Math.floor((wx - origin.x) / VS);
        const ly = Math.floor((wy - origin.y) / VS);
        const lz = Math.floor((wz - origin.z) / VS);
        return map.has(vkey(lx, ly, lz));
    }

    function dispose() {
        if (mesh.parent) mesh.parent.remove(mesh);
        geo.dispose();
        if (collisionWorld) for (const id of solidIds) collisionWorld.removeSolid(id);
    }

    return { mesh, map, solidIds, getVoxelAt, origin, dispose, material: mat };
}

export function abyssTint(map) {
    // Overpaint some floor cells with basalt/gold for Abyss mood rooms
    for (const [k, c] of map) {
        const [x, y, z] = k.split(',').map(Number);
        if (y === 0 && ((x + z) % 7 === 0)) map.set(k, ABYSS_COLORS.goldVein);
        else if (y === 0 && ((x * 3 + z) % 5 === 0)) map.set(k, ABYSS_COLORS.basalt);
        else if (y >= 1 && ((x + z) % 11 === 0)) map.set(k, ABYSS_COLORS.violet);
    }
    return map;
}

export { CRUST_COLORS, ABYSS_COLORS };
