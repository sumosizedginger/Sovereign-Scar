// Multi-phase boss framework — telegraphs, contact damage, phases, HP API.

import * as THREE from 'three';
import { sfx } from '../../audio/synth.js';
import { juice } from '../fx/juice.js';

/**
 * Base class for every Sovereign Scar arena boss.
 * Subclasses implement tickAI(dt, player, game) and optionally onPhaseChange.
 */
export class BossBase {
    /**
     * @param {THREE.Scene} scene
     * @param {object} opts
     * @param {string} opts.id
     * @param {string} opts.name
     * @param {number} [opts.hp=12]
     * @param {number} [opts.hitRadius=1.2]
     * @param {number} [opts.contactDamage=1]
     * @param {number} [opts.contactRadius=1.6]
     * @param {number[]} [opts.phaseThresholds] remaining-HP fractions that trigger next phase (e.g. [0.66, 0.33])
     * @param {{x:number,y?:number,z:number}} [opts.position]
     * @param {THREE.Object3D} [opts.mesh] if provided, used as root; else subclass must set this.root
     */
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.bossId = opts.id || 'boss';
        this.bossName = opts.name || 'Unknown Construct';
        this.maxHp = opts.hp != null ? opts.hp : 12;
        this.hp = this.maxHp;
        this.hitRadius = opts.hitRadius != null ? opts.hitRadius : 1.2;
        this.contactDamage = opts.contactDamage != null ? opts.contactDamage : 1;
        this.contactRadius = opts.contactRadius != null ? opts.contactRadius : 1.6;
        this.phaseThresholds = (opts.phaseThresholds || [0.66, 0.33]).slice().sort((a, b) => b - a);
        this.phase = 1;
        this.maxPhase = this.phaseThresholds.length + 1;
        this.state = { current: 'IDLE', facingVec: { x: 0, z: -1 } };
        this.managedBySystem = true;
        this.canHit = true;
        this.shielded = false;
        this.t = 0;
        this._contactCd = 0;
        this._flash = 0;
        this._telegraph = null;
        this._telegraphLife = 0;
        this.alive = true;
        this.defeated = false;

        if (opts.mesh) {
            this.root = opts.mesh;
            this.mesh = opts.mesh;
            if (opts.position) {
                this.root.position.set(
                    opts.position.x,
                    opts.position.y != null ? opts.position.y : 1.2,
                    opts.position.z
                );
            }
            if (!this.root.parent) scene.add(this.root);
        } else if (opts.position) {
            this.root = new THREE.Group();
            this.root.position.set(
                opts.position.x,
                opts.position.y != null ? opts.position.y : 1.2,
                opts.position.z
            );
            scene.add(this.root);
        }

        // Arena home: bosses that orbit/patrol do it around where they were
        // placed, not the world origin (rooms live at offset origins now).
        this.home = {
            x: this.root ? this.root.position.x : 0,
            z: this.root ? this.root.position.z : 0,
        };

        this.onHit = (dmg) => {
            this._flash = 0.12;
            // Snapshot emissive bases once so flash can restore
            this.root?.traverse?.((c) => {
                if (c.material?.emissive && c.userData.baseEmissive == null) {
                    c.userData.baseEmissive = c.material.emissiveIntensity ?? 1;
                }
            });
            sfx.kick();
            // Phase check happens after applyHit mutates hp (see update)
            this._phaseDirty = true;
            if (this.afterHit) this.afterHit(dmg);
        };
        this.onDeath = () => {
            this.state.current = 'DEAD';
            this.alive = false;
            this.defeated = true;
            this.canHit = false;
            this.clearTelegraph();
            if (this.root) this.root.visible = false;
            sfx.shatter();
            juice.hitstop(0.25);
            juice.addTrauma(0.6);
            if (this.afterDeath) this.afterDeath();
        };
        this.onBlocked = () => { sfx.block(); };
    }

    get hpFrac() {
        return this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    }

    /**
     * S6 (P1-5): uniform visual-presence scale — grows the mesh and the
     * combat radii together so gameplay matches the silhouette. Call once
     * at the end of a subclass constructor. Bosses that re-assign
     * hitRadius at runtime must use this.baseHitRadius for the reset value.
     */
    presenceScale(k) {
        if (!this.root || !k || k === 1) return;
        this.root.scale.multiplyScalar(k);
        this.hitRadius *= k;
        this.contactRadius *= k;
        this.baseHitRadius = this.hitRadius;
    }

    _checkPhase() {
        if (this.state.current === 'DEAD') return;
        const frac = this.hpFrac;
        // phase 1 until first threshold crossed, then 2, etc.
        let next = 1;
        for (let i = 0; i < this.phaseThresholds.length; i++) {
            if (frac <= this.phaseThresholds[i]) next = i + 2;
        }
        if (next > this.phase) {
            const prev = this.phase;
            this.phase = next;
            sfx.phase();
            juice.hitstop(0.12);
            juice.addTrauma(0.45);
            if (this.onPhaseChange) this.onPhaseChange(this.phase, prev);
        }
    }

    /**
     * Show a glowing telegraph disc at world XZ for `life` seconds.
     * @param {number} x
     * @param {number} z
     * @param {number} radius
     * @param {number} [life=0.85]
     * @param {number} [color=0xff4040]
     */
    telegraphAt(x, z, radius, life = 0.85, color = 0xff4040) {
        this.clearTelegraph();
        const geo = new THREE.RingGeometry(Math.max(0.2, radius * 0.55), radius, 32);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.08, z);
        this.scene.add(ring);
        this._telegraph = ring;
        this._telegraphLife = life;
        this._telegraphMax = life;
    }

    clearTelegraph() {
        if (this._telegraph) {
            if (this._telegraph.parent) this._telegraph.parent.remove(this._telegraph);
            this._telegraph.geometry?.dispose();
            this._telegraph.material?.dispose();
            this._telegraph = null;
        }
        this._telegraphLife = 0;
    }

    /**
     * Damage player if within contact radius (respects i-frames via health.damage).
     */
    tryContact(player, dt) {
        if (this._contactCd > 0) this._contactCd -= dt;
        if (!player || player.health?.dead || this.state.current === 'DEAD') return;
        if (this._contactCd > 0 || !this.root) return;
        const p = player.root.position;
        const b = this.root.position;
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        if (Math.hypot(dx, dz) < this.contactRadius && Math.abs(p.y - b.y) < 2.5) {
            const res = player.health.damage(this.contactDamage, 0.85);
            if (res?.accepted !== false) sfx.hurt();
            this._contactCd = 0.75;
        }
    }

    update(dt, player, game) {
        if (this.state.current === 'DEAD') return;
        this.t += dt;

        // Re-evaluate phases after combat has applied hp deltas this frame
        if (this._phaseDirty) {
            this._phaseDirty = false;
            this._checkPhase();
        } else {
            // Also catch external hp mutations
            this._checkPhase();
        }

        if (this._telegraph && this._telegraphLife > 0) {
            this._telegraphLife -= dt;
            const u = Math.max(0, this._telegraphLife / (this._telegraphMax || 1));
            this._telegraph.material.opacity = 0.25 + u * 0.55;
            this._telegraph.scale.setScalar(0.9 + (1 - u) * 0.25);
            if (this._telegraphLife <= 0) this.clearTelegraph();
        }

        if (this._flash > 0) {
            this._flash -= dt;
            const flashing = this._flash > 0;
            this.root?.traverse?.((c) => {
                if (c.material?.emissive) {
                    const base = c.userData?.baseEmissive ?? 1;
                    c.material.emissiveIntensity = flashing ? Math.min(3.5, base + 1.4) : base;
                }
            });
        }

        this.tickAI(dt, player, game);
        this.tryContact(player, dt);
    }

    /** Override in subclasses. */
    tickAI(_dt, _player, _game) {}

    dispose() {
        this.clearTelegraph();
        if (this.root?.parent) this.root.parent.remove(this.root);
        this.root?.traverse?.((c) => {
            c.geometry?.dispose?.();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
                else c.material.dispose?.();
            }
        });
    }
}

/**
 * Register a boss into a level shell: combat list + system tick + win hook.
 * @param {object} level createLevelShell result
 * @param {BossBase|object} boss entity with update/dispose and combat fields
 * @param {object} [opts]
 * @param {string} [opts.nextBeat]
 * @param {string} [opts.toast]
 * @param {function} [opts.onDefeat]
 */
export function attachBoss(level, boss, opts = {}) {
    boss.managedBySystem = true;
    // Multi-core containers (Tri-Compiler): only cores are combat targets.
    // Pushing the container itself breaks applyHit (getter-only aggregate hp).
    if (boss.cores) {
        for (const c of boss.cores) {
            c.managedBySystem = true;
            if (!level.enemies.includes(c)) level.enemies.push(c);
        }
    } else if (!level.enemies.includes(boss)) {
        level.enemies.push(boss);
    }
    level.boss = boss;
    level.bossId = boss.bossId || opts.id;
    level.bossName = boss.bossName || opts.name;

    // Bosses live at their room's grid origin now, not the world origin:
    // a prebaked boss must not target the player from elsewhere in the
    // dungeon. While the player is outside the wake radius the boss still
    // animates, but sees no player (every targeting path guards on it).
    const anchor = boss.home || boss.cores?.[0]?.home || boss.root?.position;
    const WAKE_RADIUS = 40;

    level.addSystem({
        update(dt, game) {
            const p = game.player?.root?.position;
            const awake = !anchor || !p
                || Math.hypot(p.x - anchor.x, p.z - anchor.z) <= WAKE_RADIUS;
            if (boss.update) boss.update(dt, awake ? game.player : null, game);
            // Win condition (getter-safe for multi-core)
            const dead = !!(boss.defeated
                || boss.state?.current === 'DEAD'
                || (boss.cores && boss.cores.every((c) => c.state?.current === 'DEAD')));
            if (dead && !level._bossCleared) {
                level._bossCleared = true;
                const id = boss.bossId || opts.id || 'boss';
                game.recordBoss?.(id);
                const msg = opts.toast || `${boss.bossName || 'Boss'} defeated`;
                game.hud?.toast?.(msg, 3200);
                if (opts.nextBeat) game.unlockAndSave?.(opts.nextBeat);
                if (opts.onDefeat) opts.onDefeat(game, boss);
                if (game.hud?.story) {
                    game.hud.story.queue([
                        { speaker: 'SYSTEM', text: msg },
                        ...(opts.defeatStory || []),
                    ]);
                }
            }
            // Expose live boss HUD stats
            if (game) {
                game.activeBoss = (boss.state?.current === 'DEAD' || boss.defeated) ? null : boss;
            }
        },
        dispose() {
            try { boss.dispose?.(); } catch (_) {}
        },
    });
    return boss;
}

/** Utility: move entity toward point with simple speed. */
export function moveToward(pos, target, speed, dt) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    pos.x += (dx / d) * speed * dt;
    pos.z += (dz / d) * speed * dt;
    return d;
}

/** Utility: bounce inside axis-aligned arena. */
export function bounceArena(pos, vel, center, radius) {
    const minX = center.x - radius, maxX = center.x + radius;
    const minZ = center.z - radius, maxZ = center.z + radius;
    if (pos.x < minX || pos.x > maxX) {
        vel.x *= -1;
        pos.x = Math.max(minX, Math.min(maxX, pos.x));
        return true;
    }
    if (pos.z < minZ || pos.z > maxZ) {
        vel.z *= -1;
        pos.z = Math.max(minZ, Math.min(maxZ, pos.z));
        return true;
    }
    return false;
}
