// Beat 12 Vector Staff — procedural light-voxel line with lifetime decay.

import * as THREE from 'three';

export class LightLineSystem {
    constructor(scene, collisionWorld) {
        this.scene = scene;
        this.collisionWorld = collisionWorld;
        this.lines = [];
        this._id = 0;
    }

    /**
     * Fire a luminous line along a facing vector.
     */
    fire(origin, facing, opts = {}) {
        const range = opts.range || 8;
        const life = opts.life || 2.5;
        const color = opts.color || 0xfff0a0;
        const id = `ll:${this._id++}`;

        const dir = new THREE.Vector3(facing.x, 0, facing.z).normalize();
        const len = range;
        const geo = new THREE.BoxGeometry(0.15, 0.15, len);
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 2.2,
            roughness: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            origin.x + dir.x * (len * 0.5),
            origin.y + 0.9,
            origin.z + dir.z * (len * 0.5)
        );
        mesh.lookAt(origin.x + dir.x * len, origin.y + 0.9, origin.z + dir.z * len);
        if (this.scene) this.scene.add(mesh);

        // Register thin solids along the line for walkability/blockers (optional)
        const solidIds = [];
        if (opts.solid && this.collisionWorld) {
            const steps = Math.ceil(len);
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const sx = origin.x + dir.x * range * t;
                const sz = origin.z + dir.z * range * t;
                const sid = `${id}:${i}`;
                this.collisionWorld.addSolid({
                    id: sid,
                    minX: sx - 0.2, maxX: sx + 0.2,
                    minZ: sz - 0.2, maxZ: sz + 0.2,
                });
                solidIds.push(sid);
            }
        }

        const line = {
            id, mesh, mat, life, maxLife: life, solidIds,
            hitPoints: [{
                x: origin.x + dir.x * range,
                y: origin.y,
                z: origin.z + dir.z * range,
            }],
            dir: { x: dir.x, z: dir.z },
            origin: { ...origin },
            range,
        };
        this.lines.push(line);
        return line;
    }

    update(dt) {
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const L = this.lines[i];
            L.life -= dt;
            const a = Math.max(0, L.life / L.maxLife);
            L.mat.emissiveIntensity = 2.2 * a;
            L.mat.opacity = a;
            L.mat.transparent = true;
            if (L.life <= 0) {
                this._disposeLine(L);
                this.lines.splice(i, 1);
            }
        }
    }

    /** Ray-ish hit test against point targets. */
    hitsEntity(entity, line) {
        if (!entity?.root?.position || !line) return false;
        const p = entity.root.position;
        const ox = line.origin.x, oz = line.origin.z;
        const dx = p.x - ox, dz = p.z - oz;
        const forward = dx * line.dir.x + dz * line.dir.z;
        if (forward < 0 || forward > line.range) return false;
        const lateral = Math.abs(-dx * line.dir.z + dz * line.dir.x);
        return lateral < (entity.hitRadius || 0.5) + 0.25;
    }

    _disposeLine(L) {
        if (this.collisionWorld) for (const id of L.solidIds) this.collisionWorld.removeSolid(id);
        if (L.mesh.parent) L.mesh.parent.remove(L.mesh);
        L.mesh.geometry.dispose();
        L.mat.dispose();
    }

    dispose() {
        for (const L of this.lines) this._disposeLine(L);
        this.lines = [];
    }
}
