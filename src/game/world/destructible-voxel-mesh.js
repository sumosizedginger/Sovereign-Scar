// Destructible island mesh: owns Map + mesh + solid ids.
// Map is truth; geometry is a view. Prefer small islands (D1 / SS-032).

import * as THREE from 'three';
import { vkey, buildVoxelGeo } from '../../voxel/core.js';

const VOXEL_WORLD = 1; // must match VOXEL_SCALE / level builder

export class DestructibleVoxelMesh {
    /**
     * @param {Map<string,number>} map voxel key -> color
     * @param {THREE.Material} material
     * @param {{ spawnShard?: Function }} particles
     * @param {{ addSolid: Function, removeSolid: Function }} collisionWorld
     * @param {string} solidIdPrefix
     * @param {{ origin?: {x,y,z}, voxelSize?: number, scene?: THREE.Scene }} opts
     */
    constructor(map, material, particles, collisionWorld, solidIdPrefix, opts = {}) {
        this.map = map instanceof Map ? map : new Map(map || []);
        this.material = material || new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.9, metalness: 0.05,
        });
        this.particles = particles || null;
        this.collisionWorld = collisionWorld || null;
        this.solidIdPrefix = solidIdPrefix || 'dest';
        this.origin = opts.origin || { x: 0, y: 0, z: 0 };
        this.voxelSize = opts.voxelSize || VOXEL_WORLD;
        this.scene = opts.scene || null;
        this.solidIds = new Set();
        this.mesh = null;
        this._rebake();
        this.rebuildSolids();
        if (this.scene && this.mesh) this.scene.add(this.mesh);
    }

    get isEmpty() {
        return this.map.size === 0;
    }

    get meshRef() {
        return this.mesh;
    }

    /** World-space center of a voxel cell. */
    voxelWorldPos(x, y, z) {
        const s = this.voxelSize;
        return {
            x: this.origin.x + (x + 0.5) * s,
            y: this.origin.y + (y + 0.5) * s,
            z: this.origin.z + (z + 0.5) * s,
        };
    }

    hasVoxel(x, y, z) {
        return this.map.has(vkey(x, y, z));
    }

    removeVoxel(x, y, z) {
        const k = vkey(x, y, z);
        if (!this.map.has(k)) return false;
        const color = this.map.get(k);
        this.map.delete(k);
        this._spawnShards(x, y, z, color, 1);
        this._rebake();
        this.rebuildSolids();
        return true;
    }

    /**
     * BFS shatter of same-color connected voxels within maxRadius.
     * Color boundary stops spread (different color = wall).
     * @returns {number} voxels removed
     */
    shatterConnected(x, y, z, maxRadius = 8) {
        const startKey = vkey(x, y, z);
        if (!this.map.has(startKey)) return 0;
        const startColor = this.map.get(startKey);
        const queue = [[x, y, z]];
        const seen = new Set([startKey]);
        const removed = [];
        const maxR2 = maxRadius * maxRadius;

        while (queue.length) {
            const [cx, cy, cz] = queue.shift();
            const dx = cx - x, dy = cy - y, dz = cz - z;
            if (dx * dx + dy * dy + dz * dz > maxR2) continue;
            const ck = vkey(cx, cy, cz);
            if (!this.map.has(ck)) continue;
            if (this.map.get(ck) !== startColor) continue;
            removed.push([cx, cy, cz, this.map.get(ck)]);
            this.map.delete(ck);

            const nbs = [
                [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
            ];
            for (const [nx, ny, nz] of nbs) {
                const xx = cx + nx, yy = cy + ny, zz = cz + nz;
                const nk = vkey(xx, yy, zz);
                if (seen.has(nk)) continue;
                if (!this.map.has(nk)) continue;
                if (this.map.get(nk) !== startColor) continue;
                seen.add(nk);
                queue.push([xx, yy, zz]);
            }
        }

        // Cap shatter work
        const cap = 64;
        // already deleted; shards for first cap
        for (let i = 0; i < Math.min(removed.length, cap); i++) {
            const [rx, ry, rz, col] = removed[i];
            this._spawnShards(rx, ry, rz, col, 1 + (i % 3 === 0 ? 1 : 0));
        }

        this._rebake();
        this.rebuildSolids();
        return removed.length;
    }

    /**
     * Shatter voxels near a world-space point (weapon impact helper).
     */
    shatterAtWorld(wx, wy, wz, maxRadius = 3) {
        const s = this.voxelSize;
        const lx = Math.floor((wx - this.origin.x) / s);
        const ly = Math.floor((wy - this.origin.y) / s);
        const lz = Math.floor((wz - this.origin.z) / s);
        // Find nearest existing voxel in a small neighborhood
        let best = null, bestD = 1e9;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const x = lx + dx, y = ly + dy, z = lz + dz;
                    if (!this.hasVoxel(x, y, z)) continue;
                    const d = dx * dx + dy * dy + dz * dz;
                    if (d < bestD) { bestD = d; best = [x, y, z]; }
                }
            }
        }
        if (!best) return 0;
        return this.shatterConnected(best[0], best[1], best[2], maxRadius);
    }

    rebuildSolids() {
        if (!this.collisionWorld) return;
        for (const id of this.solidIds) this.collisionWorld.removeSolid(id);
        this.solidIds.clear();

        // Per-column XZ boxes at min-max Y occupied (walkable floors + walls)
        const columns = new Map(); // "x,z" -> {minY,maxY}
        for (const k of this.map.keys()) {
            const [x, y, z] = k.split(',').map(Number);
            const ck = x + ',' + z;
            const col = columns.get(ck);
            if (!col) columns.set(ck, { minY: y, maxY: y });
            else {
                col.minY = Math.min(col.minY, y);
                col.maxY = Math.max(col.maxY, y);
            }
        }
        const s = this.voxelSize;
        for (const [ck, col] of columns) {
            const [x, z] = ck.split(',').map(Number);
            // Only block XZ if column is tall enough to be a wall (height > 1)
            // or always for simplicity — short floor columns still block feet XZ
            // which is correct for raised platforms as walls at edges.
            const id = `${this.solidIdPrefix}:${x},${z}`;
            // Floor platforms: treat as solid only when tall OR we want edge collision.
            // For raised boulders we want full column solid.
            if (col.maxY - col.minY >= 0 || true) {
                this.collisionWorld.addSolid({
                    id,
                    minX: this.origin.x + x * s,
                    maxX: this.origin.x + (x + 1) * s,
                    minZ: this.origin.z + z * s,
                    maxZ: this.origin.z + (z + 1) * s,
                });
                this.solidIds.add(id);
            }
        }
    }

    _rebake() {
        const old = this.mesh;
        if (this.map.size === 0) {
            if (old) {
                if (old.parent) old.parent.remove(old);
                if (old.geometry) old.geometry.dispose();
            }
            this.mesh = null;
            return;
        }
        const geo = buildVoxelGeo(this.map, 0.04);
        // Scale from voxel-index space to world
        geo.scale(this.voxelSize, this.voxelSize, this.voxelSize);
        // Shift so voxel (0,0,0) corner sits at origin
        geo.translate(this.voxelSize * 0.5, this.voxelSize * 0.5, this.voxelSize * 0.5);

        if (old) {
            old.geometry.dispose();
            old.geometry = geo;
            old.position.set(this.origin.x, this.origin.y, this.origin.z);
            this.mesh = old;
        } else {
            this.mesh = new THREE.Mesh(geo, this.material);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;
            this.mesh.position.set(this.origin.x, this.origin.y, this.origin.z);
            if (this.scene) this.scene.add(this.mesh);
        }
    }

    _spawnShards(x, y, z, color, count = 2) {
        if (!this.particles || !this.particles.spawnShard) return;
        const wp = this.voxelWorldPos(x, y, z);
        const origin = { x: wp.x, y: wp.y, z: wp.z };
        for (let i = 0; i < count; i++) {
            this.particles.spawnShard(
                { x: wp.x + (Math.random() - 0.5) * 0.2, y: wp.y, z: wp.z + (Math.random() - 0.5) * 0.2 },
                color,
                origin
            );
        }
    }

    dispose() {
        if (this.collisionWorld) {
            for (const id of this.solidIds) this.collisionWorld.removeSolid(id);
        }
        this.solidIds.clear();
        if (this.mesh) {
            if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            this.mesh = null;
        }
        this.map.clear();
    }
}

/**
 * Pure BFS helper for unit tests (no THREE).
 * @returns {string[]} removed keys
 */
export function shatterConnectedKeys(map, x, y, z, maxRadius = 8) {
    const startKey = vkey(x, y, z);
    if (!map.has(startKey)) return [];
    const startColor = map.get(startKey);
    const queue = [[x, y, z]];
    const seen = new Set([startKey]);
    const removed = [];
    const maxR2 = maxRadius * maxRadius;
    while (queue.length) {
        const [cx, cy, cz] = queue.shift();
        if ((cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2 > maxR2) continue;
        const ck = vkey(cx, cy, cz);
        if (!map.has(ck) || map.get(ck) !== startColor) continue;
        map.delete(ck);
        removed.push(ck);
        for (const [nx, ny, nz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
            const xx = cx + nx, yy = cy + ny, zz = cz + nz;
            const nk = vkey(xx, yy, zz);
            if (seen.has(nk) || !map.has(nk) || map.get(nk) !== startColor) continue;
            seen.add(nk);
            queue.push([xx, yy, zz]);
        }
    }
    return removed;
}
