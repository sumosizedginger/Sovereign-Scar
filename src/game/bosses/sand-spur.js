// Beat 03 — Sand Spur: segmented serpent with burrow phases + local destructible mesh.

import * as THREE from 'three';
import { BossBase } from './base.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { fillBox } from '../../voxel/helpers.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { sfx } from '../../audio/synth.js';

export class SandSpur extends BossBase {
    constructor(scene, collisionWorld, particles, path = [], opts = {}) {
        const body = new THREE.Group();
        super(scene, {
            id: 'sand_spur',
            name: 'Sand Spur',
            hp: opts.hp || 14,
            hitRadius: 0.75,
            contactDamage: 1,
            contactRadius: 1.25,
            position: path[0] || { x: 0, z: 0 },
            mesh: body,
            phaseThresholds: [0.55, 0.3],
        });
        this.path = path.length ? path : [
            { x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 4 }, { x: -4, z: 4 },
        ];
        this.speed = opts.speed || 0.4;
        this.segments = [];
        const n = opts.segments || 6;
        for (let i = 0; i < n; i++) {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.9, 0.7, 0.9),
                new THREE.MeshStandardMaterial({
                    color: i === 0 ? 0xc4a060 : 0x9a8b78,
                    roughness: 0.9,
                    emissive: i === 0 ? 0x402010 : 0x000000,
                    emissiveIntensity: 0.4,
                })
            );
            mesh.position.set(this.path[0].x, 0.6, this.path[0].z);
            mesh.castShadow = true;
            scene.add(mesh);
            this.segments.push(mesh);
        }
        // Combat root tracks head
        this.root = this.segments[0];
        this.mesh = this.segments[0];

        const burrow = new Map();
        fillBox(burrow, -2, 2, 0, 0, -2, 2, CRUST_COLORS.clayDark);
        this.burrow = new DestructibleVoxelMesh(
            burrow,
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
            particles,
            null,
            'sandspur',
            { origin: { x: this.root.position.x - 1.25, y: 0, z: this.root.position.z - 1.25 }, scene, voxelSize: 0.5 }
        );
        this.submerged = false;
        this.subTimer = 0;
        this.lungeCd = 4;
    }

    onPhaseChange(phase) {
        this.speed = 0.35 + phase * 0.15;
        this.contactDamage = phase >= 3 ? 2 : 1;
        if (phase >= 2) this.lungeCd = 0.5; // surface soon and rage
    }

    tickAI(dt, player) {
        this.subTimer += dt;
        this.lungeCd -= dt;
        // Phase 2+: periodic burrow (invulnerable)
        if (this.phase >= 2) {
            if (this.lungeCd <= 0) {
                this.submerged = !this.submerged;
                this.lungeCd = this.submerged ? 1.8 : 3.2;
                this.canHit = !this.submerged;
                if (this.submerged) sfx.whoosh();
                else sfx.heave();
            }
        }
        const spd = this.submerged ? this.speed * 1.6 : this.speed;
        // advance path parameter
        this._pathU = (this._pathU || 0) + dt * spd;
        const total = this.path.length;
        for (let i = 0; i < this.segments.length; i++) {
            const u = this._pathU - i * 0.35;
            const idx = ((u % total) + total) % total;
            const i0 = Math.floor(idx) % total;
            const i1 = (i0 + 1) % total;
            const f = idx - Math.floor(idx);
            const a = this.path[i0], b = this.path[i1];
            this.segments[i].position.x = a.x + (b.x - a.x) * f;
            this.segments[i].position.z = a.z + (b.z - a.z) * f;
            const yBase = this.submerged ? -0.4 : 0.55;
            this.segments[i].position.y = yBase + Math.sin(this._pathU * 4 + i) * 0.15;
            this.segments[i].visible = !this.submerged || i === 0;
            this.segments[i].material.transparent = true;
            if (this.submerged && i === 0) this.segments[i].material.opacity = 0.35;
            else this.segments[i].material.opacity = 1;
        }
        if (this.burrow.mesh) {
            this.burrow.origin.x = this.root.position.x - 1.25;
            this.burrow.origin.z = this.root.position.z - 1.25;
            this.burrow.mesh.position.x = this.burrow.origin.x;
            this.burrow.mesh.position.z = this.burrow.origin.z;
            this.burrow.mesh.visible = !this.submerged;
        }
        const fv = {
            x: this.segments[0].position.x - (this.segments[1]?.position.x || 0),
            z: this.segments[0].position.z - (this.segments[1]?.position.z || 0),
        };
        this.state.facingVec = fv;

        // Lunge telegraph when emerging
        if (!this.submerged && this.phase >= 2 && player && this.lungeCd > 3.0 && this.lungeCd < 3.3) {
            this.telegraphAt(this.root.position.x, this.root.position.z, 2.0, 0.5, 0xc4a060);
        }
    }

    dispose() {
        for (const s of this.segments) {
            if (s.parent) s.parent.remove(s);
            s.geometry.dispose();
            s.material.dispose();
        }
        this.burrow?.dispose();
        this.clearTelegraph();
    }
}
