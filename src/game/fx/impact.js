// Phase F2 — the receiving end of a hit.
//
// `ArcSmear` is good, and it is only half the picture: it draws the blow going
// OUT. Nothing in the game drew anything coming back. A sword landing on a
// bulwark and a sword landing on a brood produced the same white flash and the
// same hitstop — the two most different targets in the bestiary, feeding back
// identically.
//
// Two things fix that, and both are about the DEFENDER rather than the attack:
//
//   sparks, oriented along the blow, so the direction the hit came from is
//   visible on the thing that took it;
//
//   debris keyed to the target's material — stone chips off a bulwark, ichor
//   off a brood, frost off a frost caster — so what you hit is legible from the
//   feedback and not only from the silhouette.
//
// Pooled and shared. One geometry, one mesh per particle, capped: a busy room
// with five enemies and a boss can spend the whole pool and the cost stays flat.

import * as THREE from 'three';

const CAP = 72;
const LIFE = 0.42;

/**
 * What each thing is made of, as the two numbers that read from a top-down
 * camera: a colour and how heavy the pieces are.
 *
 * `gravity` is the tell. Stone chips fall fast and stop; ichor is slow and
 * hangs; frost drifts. Nobody will name the difference and everybody will feel
 * which one they are hitting.
 */
export const MATERIALS = {
    stone: { color: 0x9aa0ac, gravity: 22, spread: 3.4, count: 7, size: 0.075 },
    bone: { color: 0xe8e0d0, gravity: 18, spread: 3.0, count: 6, size: 0.08 },
    ichor: { color: 0x8fb060, gravity: 9, spread: 2.2, count: 9, size: 0.09 },
    frost: { color: 0xa0e8ff, gravity: 6, spread: 2.6, count: 8, size: 0.07 },
    ember: { color: 0xff8030, gravity: 4, spread: 2.8, count: 9, size: 0.06 },
    metal: { color: 0xffd060, gravity: 20, spread: 4.0, count: 8, size: 0.055 },
    flesh: { color: 0xc06050, gravity: 14, spread: 2.4, count: 7, size: 0.08 },
};

/**
 * Which material each enemy kind is made of.
 *
 * Keyed by kind rather than set per enemy, so a new kind gets a sensible
 * default and an authored one gets its own voice without any spawn site having
 * to remember to say so.
 */
export const KIND_MATERIAL = {
    sentinel: 'stone',
    scarab: 'ichor',
    frost: 'frost',
    bulwark: 'metal',
    mote: 'ember',
    lancer: 'metal',
    brood: 'ichor',
    weaver: 'flesh',
    censer: 'ember',
};

export function materialFor(target) {
    if (target?.impactMaterial) return MATERIALS[target.impactMaterial] || MATERIALS.stone;
    if (target?.bossId) return MATERIALS.metal;
    return MATERIALS[KIND_MATERIAL[target?.kind]] || MATERIALS.stone;
}

export class ImpactFx {
    constructor(scene) {
        this.scene = scene;
        this.geo = new THREE.BoxGeometry(1, 1, 1);
        this.pool = [];
        for (let i = 0; i < CAP; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0,
                depthWrite: false,
            });
            const mesh = new THREE.Mesh(this.geo, mat);
            mesh.visible = false;
            mesh.renderOrder = 6;
            scene.add(mesh);
            this.pool.push({
                mesh, mat, life: 0, gravity: 0,
                vel: new THREE.Vector3(), spin: new THREE.Vector3(),
            });
        }
    }

    /**
     * Spark burst at `pos`, thrown ALONG `dir` — the direction the blow was
     * travelling, not away from the target's centre.
     *
     * Along the blow, and that is the whole point of passing a direction: debris
     * that sprays radially says "something happened here", debris that sprays
     * forward says "it was hit from over there", and in a room with three
     * enemies the second one is information.
     */
    burst(pos, dir, target) {
        if (!pos) return 0;
        const m = materialFor(target);
        const fx = dir?.x || 0;
        const fz = dir?.z || 0;
        const len = Math.hypot(fx, fz) || 1;
        const ux = fx / len;
        const uz = fz / len;
        let spawned = 0;
        for (const p of this.pool) {
            if (spawned >= m.count) break;
            if (p.life > 0) continue;
            p.life = LIFE;
            p.gravity = m.gravity;
            p.mat.color.setHex(m.color);
            p.mat.opacity = 0.95;
            p.mesh.visible = true;
            p.mesh.scale.setScalar(m.size * (0.6 + Math.random() * 0.9));
            p.mesh.position.set(pos.x, (pos.y || 0) + 0.7, pos.z);
            // A cone around the blow's heading rather than a sphere.
            const spread = (Math.random() - 0.5) * 1.5;
            const cx = ux * Math.cos(spread) - uz * Math.sin(spread);
            const cz = ux * Math.sin(spread) + uz * Math.cos(spread);
            const speed = m.spread * (0.55 + Math.random() * 0.9);
            p.vel.set(cx * speed, 1.6 + Math.random() * 2.6, cz * speed);
            p.spin.set(
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.5) * 18
            );
            spawned++;
        }
        return spawned;
    }

    update(dt) {
        for (const p of this.pool) {
            if (p.life <= 0) continue;
            p.life -= dt;
            if (p.life <= 0) {
                p.life = 0;
                p.mesh.visible = false;
                p.mat.opacity = 0;
                continue;
            }
            p.vel.y -= p.gravity * dt;
            p.mesh.position.x += p.vel.x * dt;
            p.mesh.position.y += p.vel.y * dt;
            p.mesh.position.z += p.vel.z * dt;
            // Chips settle on the floor rather than sinking through it.
            if (p.mesh.position.y < 1.02) {
                p.mesh.position.y = 1.02;
                p.vel.y *= -0.28;
                p.vel.x *= 0.6;
                p.vel.z *= 0.6;
            }
            p.mesh.rotation.x += p.spin.x * dt;
            p.mesh.rotation.y += p.spin.y * dt;
            p.mesh.rotation.z += p.spin.z * dt;
            p.mat.opacity = 0.95 * Math.min(1, p.life / (LIFE * 0.5));
        }
    }

    get activeCount() {
        return this.pool.filter((p) => p.life > 0).length;
    }

    dispose() {
        for (const p of this.pool) {
            if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
            p.mat.dispose();
        }
        this.geo.dispose();
        this.pool = [];
    }
}
