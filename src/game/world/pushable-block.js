// Pushable voxel block — mutates CollisionWorld solid each frame.

import * as THREE from 'three';
import { buildVoxelGeo } from '../../voxel/core.js';
import { fillBox } from '../../voxel/helpers.js';
import { CRUST_COLORS } from '../assets/palettes.js';

export class PushableBlock {
    /**
     * @param {{x:number,y:number,z:number}} position world center
     * @param {number} size world half-extent-ish (full box size)
     * @param {object} collisionWorld
     * @param {THREE.Scene} scene
     */
    constructor(position, size, collisionWorld, scene, opts = {}) {
        this.position = { x: position.x, y: position.y, z: position.z };
        this.size = size || 1;
        this.half = this.size * 0.5;
        this.collisionWorld = collisionWorld;
        this.id = opts.id || `push:${Math.random().toString(36).slice(2, 8)}`;
        this.mass = opts.mass || 1;
        this.scene = scene;

        const m = new Map();
        fillBox(m, -1, 1, 0, 2, -1, 1, opts.color || CRUST_COLORS.clay);
        const geo = buildVoxelGeo(m, 0.04);
        geo.scale(this.size / 3, this.size / 3, this.size / 3);
        this.mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
        );
        this.mesh.position.set(this.position.x, this.position.y, this.position.z);
        this.mesh.castShadow = true;
        if (scene) scene.add(this.mesh);

        this._registerSolid();
    }

    _registerSolid() {
        if (!this.collisionWorld) return;
        this.collisionWorld.removeSolid(this.id);
        this.collisionWorld.addSolid({
            id: this.id,
            minX: this.position.x - this.half,
            maxX: this.position.x + this.half,
            minZ: this.position.z - this.half,
            maxZ: this.position.z + this.half,
        });
    }

    /**
     * Attempt push from player position with facing impulse.
     */
    tryPush(playerPos, facing, strength = 1.2) {
        const dx = this.position.x - playerPos.x;
        const dz = this.position.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > this.half + 0.9) return false;
        // Must face the block
        const fx = facing.x || 0, fz = facing.z || 0;
        const toward = (dx * fx + dz * fz);
        if (toward < 0.2) return false;

        const step = strength / this.mass;
        const nx = this.position.x + fx * step;
        const nz = this.position.z + fz * step;

        // Temporary remove self solid for resolve
        this.collisionWorld.removeSolid(this.id);
        const r = this.collisionWorld.resolveMove(this.position.x, this.position.z, nx, nz, this.half);
        this.position.x = r.x;
        this.position.z = r.z;
        this.mesh.position.x = r.x;
        this.mesh.position.z = r.z;
        this._registerSolid();
        return true;
    }

    dispose() {
        if (this.collisionWorld) this.collisionWorld.removeSolid(this.id);
        if (this.mesh) {
            if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
        }
    }
}
