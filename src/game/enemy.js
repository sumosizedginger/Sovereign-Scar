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
        const scale = S * (opts.meshScale || 0.33);
        this.rig = new THREE.Group();
        const inner = buildFigure(parts, scale);
        try {
            const eyes = buildGlowEyes(pal);
            eyes.left.scale.setScalar(scale);
            eyes.right.scale.setScalar(scale);
            // buildGlowEyes bakes unscaled part-unit positions — re-place at
            // head height (head part offset is [0,24,0] × scale).
            eyes.left.position.set(-2.5 * scale, (6 + 24) * scale, 5.5 * scale);
            eyes.right.position.set(2.5 * scale, (6 + 24) * scale, 5.5 * scale);
            inner.add(eyes.left, eyes.right);
        } catch (_) {}
        // Ground the mesh: enemy rig origin sits on the floor (rig.y = 1.0 =
        // floor top), so shift the mesh up until its local minY is 0.
        const bbox = new THREE.Box3().setFromObject(inner);
        inner.position.y = -bbox.min.y;
        this.rig.add(inner);
        this._inner = inner;
        this.rig.position.set(position.x, position.y != null ? position.y : 1.0, position.z);
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
        // Attack telegraphs. Every hostile action winds up first: the enemy
        // freezes, a ring marks the ground it is about to strike, and only
        // when the windup expires is damage resolved — against the player's
        // position AT THAT MOMENT. Previously an enemy simply called
        // player.health.damage() the instant its cooldown expired and you
        // were in range, so a hit was unavoidable and unreadable: no tell to
        // react to, and no way to step out of it once committed.
        this.windup = opts.windup != null ? opts.windup : 0.45;
        this._windupT = 0;
        this._pendingStrike = null;
        this._tell = null;
        this._tellLife = 0;
        this._tellMax = 0;
        this.loot = opts.loot || null;
        this.onDeath = opts.onDeath || null;
        this.projectiles = [];

        this.onHit = () => {
            this._flash = 0.15;
            sfx.kick();
        };
    }

    /**
     * Mark the ground the enemy is committing to strike. Mirrors the boss
     * telegraph (bosses/base.js) so both read the same to the player.
     */
    telegraphAt(x, z, radius, life, color = 0xff5533) {
        this.clearTelegraph();
        const geo = new THREE.RingGeometry(Math.max(0.15, radius * 0.5), radius, 24);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        // Sit just above the floor the enemy is standing on. An absolute y
        // here (as the boss telegraph uses) buries the ring: room floors are
        // at y = 1, so the tell rendered underneath the ground and the player
        // saw no warning at all.
        ring.position.set(x, this.rig.position.y + 0.06, z);
        this.scene.add(ring);
        this._tell = ring;
        this._tellLife = life;
        this._tellMax = life;
    }

    clearTelegraph() {
        if (this._tell) {
            if (this._tell.parent) this._tell.parent.remove(this._tell);
            this._tell.geometry?.dispose();
            this._tell.material?.dispose();
            this._tell = null;
        }
        this._tellLife = 0;
    }

    /**
     * Commit to an attack that lands `windup` seconds from now. The enemy
     * holds still while winding up (that pause IS the tell), and `resolve`
     * decides at strike time whether it actually connects.
     */
    _beginWindup(resolve, opts = {}) {
        const dur = opts.windup != null ? opts.windup : this.windup;
        this._windupT = dur;
        this._pendingStrike = resolve;
        const fv = this.state.facingVec;
        const reach = opts.reach != null ? opts.reach : 0.9;
        this.telegraphAt(
            this.rig.position.x + fv.x * reach,
            this.rig.position.z + fv.z * reach,
            opts.radius || (this.attackRange + 0.3),
            dur,
            opts.color
        );
        sfx.whoosh();
    }

    /**
     * Land a melee strike only if the player is still inside the marked area.
     * This is what makes a hit avoidable: walking or dashing clear during the
     * windup means the swing whiffs.
     */
    _resolveMelee(player, damage, reach) {
        const dx = player.root.position.x - this.rig.position.x;
        const dz = player.root.position.z - this.rig.position.z;
        if (Math.hypot(dx, dz) > reach) {
            sfx.step(); // whiff — the player got out in time
            return false;
        }
        const res = player.health.damage(damage, 0.9);
        if (res.accepted) sfx.hurt();
        return res.accepted;
    }

    update(dt, player) {
        if (this.state.current === 'DEAD') {
            this.rig.visible = false;
            this.clearTelegraph();
            this._clearProjectiles();
            return;
        }
        if (this.attackCd > 0) this.attackCd -= dt;

        // Telegraph ring pulses brighter as the strike approaches
        if (this._tell && this._tellLife > 0) {
            this._tellLife -= dt;
            const u = Math.max(0, this._tellLife / (this._tellMax || 1));
            this._tell.material.opacity = 0.8 - u * 0.45;
            this._tell.scale.setScalar(0.75 + (1 - u) * 0.35);
            if (this._tellLife <= 0) this.clearTelegraph();
        }
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

        // Committed attack: hold still, keep facing locked to where the
        // telegraph was placed, and resolve when the windup runs out. Facing
        // must NOT track the player here — a tell that re-aims every frame is
        // not a tell, and sidestepping it would be impossible.
        if (this._windupT > 0) {
            this._windupT -= dt;
            if (this._windupT <= 0) {
                const strike = this._pendingStrike;
                this._pendingStrike = null;
                this._windupT = 0;
                if (strike) strike(player, dist);
            }
            return;
        }

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
            this.attackCd = 0.9 + this.windup;
            const reach = this.attackRange + 0.4;
            this._beginWindup((p) => this._resolveMelee(p, this.damage, reach), {
                reach: 0.9,
                radius: reach,
            });
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
            // Rear up before charging, marking the lane it will run down, so
            // the charge can be read and stepped out of instead of simply
            // arriving. The direction is locked at windup time.
            this.attackCd = 2.2 + this.windup;
            const dir = { x: dx / dist, z: dz / dist };
            this._beginWindup(() => {
                this._chargeT = 0.55;
                this._chargeDir = dir;
                sfx.stomp();
            }, { windup: 0.5, reach: 2.2, radius: 1.6, color: 0xffaa33 });
        } else if (dist > this.attackRange) {
            this._move(dx, dz, dist, this.speed * 0.7 * dt);
        } else if (this.attackCd <= 0) {
            this.attackCd = 1.0 + this.windup;
            const reach = this.attackRange + 0.4;
            this._beginWindup((p) => this._resolveMelee(p, this.damage, reach), {
                reach: 0.9,
                radius: reach,
            });
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
            // Take aim first — the shot leads where you were, not where you
            // are, so moving during the windup makes it miss.
            this.attackCd = 1.6 + this.windup;
            const dir = { x: dx / dist, z: dz / dist };
            this._beginWindup(() => this._spawnProjectile(dir.x, dir.z), {
                windup: 0.55, reach: 1.1, radius: 0.9, color: 0x66ccff,
            });
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
        this.clearTelegraph();
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
