// Rotating gear solids — dynamic cylinder-ish collision via AABB approximations.

import * as THREE from 'three';
import { buildVoxelGeo } from '../../voxel/core.js';
import { buildGearRing } from '../assets/props.js';
import { CRUST_COLORS } from '../assets/palettes.js';

export class GearSystem {
    constructor(collisionWorld, scene) {
        this.collisionWorld = collisionWorld;
        this.scene = scene;
        this.gears = [];
        this.time = 0;
    }

    /**
     * Add a gear at world position.
     */
    addGear({ x, y = 0.5, z, radius = 2, speed = 0.6, id }) {
        const map = buildGearRing(Math.max(2, Math.round(radius / 0.5)), 1, CRUST_COLORS.iron);
        const geo = buildVoxelGeo(map, 0.03);
        geo.scale(0.45, 0.45, 0.45);
        const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25 })
        );
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (this.scene) this.scene.add(mesh);

        const gear = {
            id: id || `gear:${this.gears.length}`,
            mesh,
            x, y, z,
            radius,
            speed,
            angle: 0,
            solidIds: [],
            enabled: true,
        };
        this.gears.push(gear);
        this._rebuildSolids(gear);
        return gear;
    }

    _rebuildSolids(gear) {
        if (!this.collisionWorld) return;
        for (const id of gear.solidIds) this.collisionWorld.removeSolid(id);
        gear.solidIds = [];
        // Approximate rotating gear as a few AABB teeth
        const teeth = 6;
        for (let i = 0; i < teeth; i++) {
            const a = gear.angle + (i / teeth) * Math.PI * 2;
            const tx = gear.x + Math.cos(a) * gear.radius * 0.75;
            const tz = gear.z + Math.sin(a) * gear.radius * 0.75;
            const half = gear.radius * 0.22;
            const id = `${gear.id}:t${i}`;
            this.collisionWorld.addSolid({
                id,
                minX: tx - half, maxX: tx + half,
                minZ: tz - half, maxZ: tz + half,
            });
            gear.solidIds.push(id);
        }
        // Hub
        const hub = gear.radius * 0.35;
        const hid = `${gear.id}:hub`;
        this.collisionWorld.addSolid({
            id: hid,
            minX: gear.x - hub, maxX: gear.x + hub,
            minZ: gear.z - hub, maxZ: gear.z + hub,
        });
        gear.solidIds.push(hid);
    }

    update(dt) {
        this.time += dt;
        for (const g of this.gears) {
            if (!g.enabled) continue;
            g.angle += g.speed * dt;
            g.mesh.rotation.y = g.angle;
            // Rebuild solids at limited rate (every ~0.1s) for perf
            if (!g._acc) g._acc = 0;
            g._acc += dt;
            if (g._acc > 0.1) {
                g._acc = 0;
                this._rebuildSolids(g);
            }
        }
    }

    setEnabled(id, enabled) {
        const g = this.gears.find((x) => x.id === id);
        if (!g) return;
        g.enabled = enabled;
        if (!enabled) {
            for (const sid of g.solidIds) this.collisionWorld.removeSolid(sid);
            g.solidIds = [];
        } else {
            this._rebuildSolids(g);
        }
    }

    dispose() {
        for (const g of this.gears) {
            for (const id of g.solidIds) this.collisionWorld.removeSolid(id);
            if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
            g.mesh.geometry.dispose();
        }
        this.gears = [];
    }
}
