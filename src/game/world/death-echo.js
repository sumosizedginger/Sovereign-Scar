import * as THREE from 'three';

export class DeathEcho {
    constructor(scene, data, onRecover) {
        this.scene = scene;
        this.data = { ...data };
        this.onRecover = onRecover;
        this.taken = false;
        this.mesh = new THREE.Mesh(
            new THREE.TorusKnotGeometry(0.28, 0.08, 40, 6),
            new THREE.MeshStandardMaterial({
                color: 0xd4a84b,
                emissive: 0x8a4d12,
                emissiveIntensity: 1.8,
                transparent: true,
                opacity: 0.9,
            })
        );
        this.mesh.position.set(data.x, data.y != null ? data.y + 0.6 : 1.6, data.z);
        scene.add(this.mesh);
        this.t = 0;
    }

    update(dt, player) {
        if (this.taken) return false;
        this.t += dt;
        this.mesh.rotation.x += dt * 0.7;
        this.mesh.rotation.y += dt * 1.4;
        this.mesh.position.y += Math.sin(this.t * 3) * dt * 0.18;
        if (!player?.health?.dead) {
            const p = player.root.position;
            if (Math.hypot(p.x - this.mesh.position.x, p.z - this.mesh.position.z) < 1) {
                this.taken = true;
                this.onRecover?.(this.data.amount || 0);
                return false;
            }
        }
        return true;
    }

    dispose() {
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
