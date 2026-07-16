// Beat 09 — walls solid only when inside camera frustum (binary on/off).

import * as THREE from 'three';

export class FrustumWallSystem {
    /**
     * @param {Array<{ mesh: THREE.Object3D, solid: object, id: string }>} walls
     * @param {object} collisionWorld
     * @param {THREE.Camera} camera
     */
    constructor(walls, collisionWorld, camera) {
        this.walls = walls || [];
        this.collisionWorld = collisionWorld;
        this.camera = camera;
        this.frustum = new THREE.Frustum();
        this._mat = new THREE.Matrix4();
        this._interval = 0;
    }

    addWall(mesh, solidBox, id) {
        const entry = { mesh, solid: solidBox, id, solidActive: false };
        this.walls.push(entry);
        // Start inactive — will enable when in frustum
        mesh.visible = false;
        return entry;
    }

    update(dt) {
        this._interval += dt;
        if (this._interval < 0.05) return; // 20 Hz is enough
        this._interval = 0;

        this._mat.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this._mat);

        for (const w of this.walls) {
            // Sample wall center
            const cx = (w.solid.minX + w.solid.maxX) * 0.5;
            const cz = (w.solid.minZ + w.solid.maxZ) * 0.5;
            const cy = w.mesh.position.y || 1;
            const inView = this.frustum.containsPoint(new THREE.Vector3(cx, cy, cz));

            // Binary: never mid-ease solid (D2)
            if (inView && !w.solidActive) {
                w.mesh.visible = true;
                this.collisionWorld.addSolid({ ...w.solid, id: w.id });
                w.solidActive = true;
            } else if (!inView && w.solidActive) {
                w.mesh.visible = false;
                this.collisionWorld.removeSolid(w.id);
                w.solidActive = false;
            }
        }
    }

    dispose() {
        for (const w of this.walls) {
            if (w.solidActive) this.collisionWorld.removeSolid(w.id);
            if (w.mesh.parent) w.mesh.parent.remove(w.mesh);
        }
        this.walls = [];
    }
}
