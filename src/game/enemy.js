// Hostile constructs — chase, charge, and ranged AI variants.

import * as THREE from 'three';
import { buildTorso, buildHead, buildArm, buildLeg, buildGlowEyes, scaleProfile, TORSO_PROFILE, HEAD_PROFILE } from '../characters/builders.js';
import { buildVoxelGeo } from '../voxel/core.js';
import { S } from '../voxel/palette.js';
import { makeFacing } from '../combat/facing.js';
import { ENEMY_PALETTES } from './assets/palettes.js';
import { sfx } from '../audio/synth.js';

function buildFigure(parts, scale) {
    const group = new THREE.Group();
    for (const [m, offset] of parts) {
        const mesh = new THREE.Mesh(
            buildVoxelGeo(m),
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
        );
        mesh.scale.setScalar(scale);
        mesh.position.set(offset[0] * scale, offset[1] * scale, offset[2] * scale);
        mesh.castShadow = true;
        group.add(mesh);
    }
    return group;
}

export class Enemy {
    /**
     * @param {string} kind sentinel | scarab | frost
     * @param {string} [opts.ai] chase | charge | ranged  (default by kind)
     */
    constructor(scene, collisionWorld, position, opts = {}) {
        this.kind = opts.kind || 'sentinel';
        this.ai = opts.ai || defaultAi(this.kind);
        const pal = ENEMY_PALETTES[this.kind] || ENEMY_PALETTES.sentinel;
        const slim = scaleProfile(TORSO_PROFILE, opts.scaleProfile || 0.65);
        const parts = [
            [buildTorso(pal, slim, { clothingMode: 'casual' }), [0, 0, 0]],
            [buildHead(pal, scaleProfile(HEAD_PROFILE, 0.85), {}), [0, 24, 0]],
            [buildArm(pal, 1), [12, 15, 0]],
            [buildArm(pal, -1), [-12, 15, 0]],
            [buildLeg(pal, 1), [5, 0, 0]],
            [buildLeg(pal, -1), [-5, 0, 0]],
        ];
        const scale = S * (opts.meshScale || 2.6);
        this.rig = buildFigure(parts, scale);
        this.rig.position.set(position.x, position.y != null ? position.y : 1.0, position.z);
        try {
            const eyes = buildGlowEyes(pal);
            eyes.left.scale.setScalar(scale);
            eyes.right.scale.setScalar(scale);
            this.rig.add(eyes.left, eyes.right);
        } catch (_) {}
        scene.add(this.rig);
        this.scene = scene;

        this.root = this.rig;
        this.state = makeFacing(-1);
        this.state.current = 'IDLE';
        this.hitRadius = opts.hitRadius || 0.5;
        this.hp = opts.hp != null ? opts.hp : 3;
        this.maxHp = this.hp;
        this.speed = opts.speed || (this.ai === 'charge' ? 2.8 : 2.2);
        this.damage = opts.damage || 1;
        this.collisionWorld = collisionWorld;
        this.aggroRange = opts.aggroRange || 10;
        this.attackRange = opts.attackRange || (this.ai === 'ranged' ? 7 : 1.4);
        this.attackCd = 0;
        this.knockbackVel = { x: 0, z: 0 };
        this._flash = 0;
        this._chargeT = 0;
        this._chargeDir = null;
        this.loot = opts.loot || null;
        this.onDeath = opts.onDeath || null;
        this.projectiles = [];

        this.onHit = () => {
            this._flash = 0.15;
            sfx.kick();
        };
    }

    update(dt, player) {
        if (this.state.current === 'DEAD') {
            this.rig.visible = false;
            this._clearProjectiles();
            return;
        }
        if (this.attackCd > 0) this.attackCd -= dt;
        if (this._flash > 0) {
            this._flash -= dt;
            this.rig.traverse((c) => {
                if (c.material && c.material.emissive) {
                    c.material.emissive.setHex(this._flash > 0 ? 0xff4040 : 0x000000);
                }
            });
        }

        this.rig.position.x += this.knockbackVel.x * dt;
        this.rig.position.z += this.knockbackVel.z * dt;
        this.knockbackVel.x *= 0.85;
        this.knockbackVel.z *= 0.85;

        this._updateProjectiles(dt, player);

        if (!player || player.health?.dead) return;
        const px = player.root.position.x;
        const pz = player.root.position.z;
        const dx = px - this.rig.position.x;
        const dz = pz - this.rig.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist >= this.aggroRange) return;

        this.state.setFacing(dx, dz);
        this.rig.rotation.y = Math.atan2(this.state.facingVec.x, this.state.facingVec.z);

        if (this.ai === 'charge') {
            this._aiCharge(dt, player, dx, dz, dist);
        } else if (this.ai === 'ranged') {
            this._aiRanged(dt, player, dx, dz, dist);
        } else {
            this._aiChase(dt, player, dx, dz, dist);
        }
    }

    _aiChase(dt, player, dx, dz, dist) {
        if (dist > this.attackRange && dist > 0.2) {
            this._move(dx, dz, dist, this.speed * dt);
        } else if (this.attackCd <= 0) {
            this.attackCd = 0.9;
            if (player.health && !player.health.invulnerable) {
                const res = player.health.damage(this.damage, 0.8);
                if (res.accepted) sfx.hurt();
            }
        }
    }

    _aiCharge(dt, player, dx, dz, dist) {
        if (this._chargeT > 0) {
            this._chargeT -= dt;
            const sp = this.speed * 2.4 * dt;
            this._move(this._chargeDir.x, this._chargeDir.z, 1, sp);
            if (dist < 1.3 && this.attackCd <= 0) {
                this.attackCd = 0.7;
                player.health.damage(this.damage + 0.5, 0.5);
                sfx.stomp();
                this._chargeT = 0;
            }
            return;
        }
        if (dist > 3.5 && this.attackCd <= 0) {
            this.attackCd = 2.2;
            this._chargeT = 0.55;
            this._chargeDir = { x: dx / dist, z: dz / dist };
            sfx.whoosh();
        } else if (dist > this.attackRange) {
            this._move(dx, dz, dist, this.speed * 0.7 * dt);
        } else if (this.attackCd <= 0) {
            this.attackCd = 1.0;
            player.health.damage(this.damage, 0.7);
            sfx.hurt();
        }
    }

    _aiRanged(dt, player, dx, dz, dist) {
        // Keep distance
        if (dist < 4) {
            this._move(-dx, -dz, dist, this.speed * 0.9 * dt);
        } else if (dist > 8) {
            this._move(dx, dz, dist, this.speed * 0.7 * dt);
        }
        if (this.attackCd <= 0 && dist < this.attackRange) {
            this.attackCd = 1.6;
            this._spawnProjectile(dx / dist, dz / dist);
            sfx.whoosh();
        }
    }

    _spawnProjectile(fx, fz) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0x80e0ff,
                emissive: 0x40c0ff,
                emissiveIntensity: 1.5,
            })
        );
        mesh.position.copy(this.rig.position);
        mesh.position.y += 1.0;
        this.scene.add(mesh);
        this.projectiles.push({
            mesh, vx: fx * 9, vz: fz * 9, life: 2.5, damage: this.damage,
        });
    }

    _updateProjectiles(dt, player) {
        this.projectiles = this.projectiles.filter((p) => {
            p.life -= dt;
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.z += p.vz * dt;
            if (player && !player.health?.dead) {
                const d = Math.hypot(
                    player.root.position.x - p.mesh.position.x,
                    player.root.position.z - p.mesh.position.z
                );
                if (d < 0.7) {
                    player.health.damage(p.damage, 0.5);
                    sfx.hurt();
                    p.life = 0;
                }
            }
            if (p.life <= 0) {
                if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                return false;
            }
            return true;
        });
    }

    _clearProjectiles() {
        for (const p of this.projectiles) {
            if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this.projectiles = [];
    }

    _move(dx, dz, dist, sp) {
        const nx = this.rig.position.x + (dx / dist) * sp;
        const nz = this.rig.position.z + (dz / dist) * sp;
        if (this.collisionWorld) {
            const r = this.collisionWorld.resolveMove(
                this.rig.position.x, this.rig.position.z, nx, nz, 0.4
            );
            this.rig.position.x = r.x;
            this.rig.position.z = r.z;
        } else {
            this.rig.position.x = nx;
            this.rig.position.z = nz;
        }
    }

    dispose() {
        this._clearProjectiles();
        if (this.rig.parent) this.rig.parent.remove(this.rig);
    }
}

function defaultAi(kind) {
    if (kind === 'scarab') return 'charge';
    if (kind === 'frost') return 'ranged';
    return 'chase';
}

/** Simple floating weak-point orb used by some bosses. */
export class DummyTarget {
    constructor(scene, position, opts = {}) {
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(opts.radius || 0.55, 12, 12),
            new THREE.MeshStandardMaterial({
                color: opts.color || 0x555577,
                emissive: opts.emissive || 0x000000,
                emissiveIntensity: 1.5,
            })
        );
        this.mesh.position.set(position.x, position.y != null ? position.y : 1, position.z);
        this.mesh.castShadow = true;
        scene.add(this.mesh);
        this.root = this.mesh;
        this.hitRadius = opts.radius || 0.55;
        this.hp = opts.hp != null ? opts.hp : 2;
        this.state = { current: 'IDLE' };
        this._flash = 0;
        this.onHit = () => {
            this._flash = 0.12;
            this.mesh.material.emissive.setHex(0xff4040);
        };
        this.onDeath = opts.onDeath || (() => {
            this.mesh.visible = false;
        });
    }

    update(dt) {
        if (this._flash > 0) {
            this._flash -= dt;
            if (this._flash <= 0) this.mesh.material.emissive.setHex(0x000000);
        }
        if (this.state.current === 'DEAD') this.mesh.visible = false;
    }

    dispose() {
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
