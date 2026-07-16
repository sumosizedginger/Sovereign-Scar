// Dev debug geometry (D6) — hitbox rings + mesh-vs-physics box helpers.
// The red mesh box vs green physics box makes any P0-1-style scale
// mismatch unmissable.

import * as THREE from 'three';

export class DevGeometry {
    constructor(dev) {
        this.dev = dev;
        this.enabled = false;
        this._pool = [];   // { ring, meshBox, physBox, target }
        this._levelId = null;
        this._scene = null;
    }

    setEnabled(v, game) {
        this.enabled = !!v;
        if (!this.enabled) this._disposeAll();
        else if (game) this._scene = game.scene;
    }

    _disposeAll() {
        for (const h of this._pool) {
            for (const o of [h.ring, h.meshBox, h.physBox]) {
                if (!o) continue;
                if (o.parent) o.parent.remove(o);
                o.geometry?.dispose?.();
                o.material?.dispose?.();
            }
        }
        this._pool = [];
    }

    _makeSet(scene, hitRadius) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(Math.max(0.05, hitRadius * 0.9), Math.max(0.1, hitRadius), 24),
            new THREE.MeshBasicMaterial({ color: 0xffe040, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
        );
        ring.rotation.x = -Math.PI / 2;
        const meshBox = new THREE.Box3Helper(new THREE.Box3(), 0xff4040);
        const physBox = new THREE.Box3Helper(new THREE.Box3(), 0x40ff60);
        scene.add(ring, meshBox, physBox);
        return { ring, meshBox, physBox };
    }

    update(dt, game) {
        if (!this.enabled) return;
        if (game.levelId !== this._levelId) {
            this._levelId = game.levelId;
            this._disposeAll(); // entity set changed
        }
        this._scene = game.scene;

        const targets = [];
        const player = game.player;
        if (player?.rig) {
            targets.push({
                obj: player.rig,
                hitRadius: player.hitRadius || 0.45,
                phys: { x: 0.4, y: 0.95, z: 0.4 },
                center: player.rig.position,
            });
        }
        for (const e of game.level?.enemies || []) {
            if (!e?.root || e.state?.current === 'DEAD') continue;
            targets.push({
                obj: e.root,
                hitRadius: e.hitRadius || 0.5,
                // enemies have no physics body: nominal human box at rig origin
                phys: e.bossId || e === game.level?.boss ? null : { x: 0.25, y: 0.8, z: 0.25 },
                physLift: 0.8, // enemy rig origin is at the floor, not body center
                center: e.root.position,
            });
        }
        const boss = game.level?.boss;
        if (boss?.root && !boss.defeated) {
            targets.push({
                obj: boss.root,
                hitRadius: boss.contactRadius || boss.hitRadius || 1.2,
                phys: null,
                center: boss.root.position,
            });
        }

        while (this._pool.length < targets.length) {
            this._pool.push(this._makeSet(this._scene, 0.5));
        }
        for (let i = 0; i < this._pool.length; i++) {
            const h = this._pool[i];
            const t = targets[i];
            const on = !!t;
            h.ring.visible = on;
            h.meshBox.visible = on;
            h.physBox.visible = on && !!t?.phys;
            if (!on) continue;

            h.ring.position.set(t.center.x, 0.1 + 1.0, t.center.z);
            h.ring.scale.setScalar(1);
            // rebuild ring radius if target's changed materially
            if (Math.abs((h._r || 0) - t.hitRadius) > 0.01) {
                h._r = t.hitRadius;
                h.ring.geometry.dispose();
                h.ring.geometry = new THREE.RingGeometry(
                    Math.max(0.05, t.hitRadius * 0.9), Math.max(0.1, t.hitRadius), 24
                );
            }

            h.meshBox.box.setFromObject(t.obj);
            if (t.phys) {
                const lift = t.physLift || 0;
                h.physBox.box.set(
                    new THREE.Vector3(t.center.x - t.phys.x, t.center.y - t.phys.y + lift, t.center.z - t.phys.z),
                    new THREE.Vector3(t.center.x + t.phys.x, t.center.y + t.phys.y + lift, t.center.z + t.phys.z)
                );
            }
        }
    }
}
