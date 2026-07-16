// Kill-payoff soul motes (A5): small emissive orbs burst from a defeated
// enemy, scatter briefly, then home to the player and pay out Scar Shards.
// Pooled — never allocates past MOTE_CAP live motes.

import * as THREE from 'three';
import { vsfx } from './vsfx.js';

const MOTE_CAP = 48;
const SCATTER_TIME = 0.25;
const HOME_TIME = 0.7;
const COLLECT_DIST = 0.5;

export class SoulMotes {
    constructor(scene) {
        this.scene = scene;
        this.pool = [];
        const geo = new THREE.IcosahedronGeometry(0.09, 0);
        for (let i = 0; i < MOTE_CAP; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            scene.add(mesh);
            this.pool.push({
                mesh,
                active: false,
                t: 0,
                vel: new THREE.Vector3(),
                from: new THREE.Vector3(),
            });
        }
    }

    /** Spawn 5–8 motes at a world position. Silently caps at pool size. */
    burst(pos, count) {
        const n = count != null ? count : 5 + ((Math.random() * 4) | 0);
        let spawned = 0;
        for (const m of this.pool) {
            if (spawned >= n) break;
            if (m.active) continue;
            m.active = true;
            m.t = 0;
            m.mesh.visible = true;
            m.mesh.position.set(pos.x, (pos.y || 0) + 0.6, pos.z);
            m.vel.set(
                (Math.random() * 2 - 1) * 3.2,
                1.5 + Math.random() * 2.4,
                (Math.random() * 2 - 1) * 3.2
            );
            spawned++;
        }
        return spawned;
    }

    /** @param onCollect called once per mote that reaches the target */
    update(dt, target, onCollect) {
        for (const m of this.pool) {
            if (!m.active) continue;
            m.t += dt;
            if (m.t < SCATTER_TIME) {
                m.vel.y -= 9 * dt;
                m.mesh.position.addScaledVector(m.vel, dt);
            } else if (target) {
                if (m.t - dt < SCATTER_TIME) m.from.copy(m.mesh.position);
                const u = Math.min(1, (m.t - SCATTER_TIME) / HOME_TIME);
                const k = u * u; // ease-in — accelerates toward the player
                m.mesh.position.lerpVectors(m.from, target, k);
                m.mesh.position.y += Math.sin(u * Math.PI) * 0.7; // slight arc
                const dx = m.mesh.position.x - target.x;
                const dy = m.mesh.position.y - (target.y + 0.8);
                const dz = m.mesh.position.z - target.z;
                if (u >= 1 || Math.hypot(dx, dy, dz) < COLLECT_DIST) {
                    m.active = false;
                    m.mesh.visible = false;
                    vsfx.pickup();
                    if (onCollect) onCollect();
                }
            } else {
                // No target (dead player) — expire quietly
                if (m.t > SCATTER_TIME + HOME_TIME) {
                    m.active = false;
                    m.mesh.visible = false;
                }
            }
        }
    }
}
