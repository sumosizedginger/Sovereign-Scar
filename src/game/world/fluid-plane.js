// Beat 11 Rot Mire — animated sludge plane + wind bias helper.

import * as THREE from 'three';
import { ABYSS_COLORS } from '../assets/palettes.js';

export class FluidPlane {
    constructor(scene, opts = {}) {
        this.scene = scene;
        const w = opts.width || 30;
        const h = opts.depth || 30;
        this.baseY = opts.y != null ? opts.y : 0.15;
        this.amp = opts.amp != null ? opts.amp : 0.12;
        this.speed = opts.speed != null ? opts.speed : 1.4;
        this.time = 0;
        this.wind = opts.wind || { x: 0.8, z: 0.2 };

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h, 16, 16),
            new THREE.MeshStandardMaterial({
                color: opts.color || ABYSS_COLORS.sludge,
                transparent: true,
                opacity: 0.72,
                roughness: 0.95,
                metalness: 0.05,
                emissive: opts.emissive || 0x1a3010,
                emissiveIntensity: 0.25,
            })
        );
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(opts.x || 0, this.baseY, opts.z || 0);
        this.mesh.receiveShadow = true;
        if (scene) scene.add(this.mesh);
    }

    update(dt) {
        this.time += dt;
        this.mesh.position.y = this.baseY + Math.sin(this.time * this.speed) * this.amp;
        // Gentle UV-less vertex wave via rotation wobble
        this.mesh.rotation.z = Math.sin(this.time * 0.3) * 0.01;
    }

    /** True if world XZ is over the plane (simple AABB). */
    contains(x, z) {
        const hw = this.mesh.geometry.parameters.width * 0.5;
        const hd = this.mesh.geometry.parameters.height * 0.5;
        return (
            x > this.mesh.position.x - hw && x < this.mesh.position.x + hw &&
            z > this.mesh.position.z - hd && z < this.mesh.position.z + hd
        );
    }

    dispose() {
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
