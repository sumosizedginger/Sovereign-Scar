// Multi-phase boss framework — telegraphs, contact damage, phases, HP API.

import * as THREE from 'three';
import { sfx } from '../../audio/synth.js';
import { juice } from '../fx/juice.js';
import { getActiveRunMode } from '../kernel/run-mode.js';
import { markShadowRoles } from '../render/shadow-roles.js';

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
        const mode = getActiveRunMode();
        this.scene = scene;
        this.bossId = opts.id || 'boss';
        this.bossName = opts.name || 'Unknown Construct';
        const baseHp = opts.hp != null ? opts.hp : 12;
        this.maxHp = Math.max(1, baseHp * mode.bossHp);
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
        // Height of the floor the arena is built on. Telegraph rings used to
        // be pinned at an absolute y = 0.08, but room floors sit at y = 1, so
        // every boss telegraph in the game rendered a full unit UNDERGROUND
        // and the player never saw the wind-up they were meant to dodge.
        this.floorY = opts.floorY != null ? opts.floorY : 1.0;
        this.alive = true;
        this.defeated = false;

        // ── Zelda boss grammar (see runAction / startAction below) ──────────
        this.action = null;
        this.actionCd = opts.firstActionDelay != null ? opts.firstActionDelay : 1.2;
        this.actionFrequency = mode.actionFrequency;
        this.telegraphDuration = mode.telegraphDuration;
        this.recoveryDuration = mode.bossRecovery;
        // Damage multiplier applied to the boss while it is recovering. 1 =
        // no reward for reading the pattern, which is where the roster was.
        this.vulnerableMult = 1;
        this.staggerMult = opts.staggerMult != null ? opts.staggerMult : 2;
        this._recoverCue = null;

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

        // Done here rather than in fourteen constructors because it WAS in
        // fourteen constructors — three set it and eleven did not, so most of
        // the roster was a silhouette standing on a floor it never touched.
        markShadowRoles(this.root);

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
            this.action = null;
            this.vulnerableMult = 1;
            this.clearTelegraph();
            this._hideRecoverCue();
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
        ring.position.set(x, this.floorY + 0.08, z);
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

    // ── Zelda boss grammar ──────────────────────────────────────────────────
    //
    // A Link to the Past boss is a loop the player learns by watching:
    //
    //   PATTERN  the boss does something readable — it circles, it stalks, it
    //            surfaces. You get to breathe, and to plan.
    //   WINDUP   it commits. A telegraph names WHERE the blow lands, and the
    //            boss stops doing anything else so the commitment is legible.
    //   STRIKE   damage resolves against where you are AT THAT MOMENT, so
    //            stepping off the marked ground is always enough.
    //   RECOVER  it is spent: motionless, open, and taking double damage.
    //            This is your turn, and you only get it because you dodged.
    //
    // That last beat is the one the roster was missing. Attacks fired off bare
    // cooldowns, and hitting the boss was equally good at every instant — so
    // there was no reason to read anything, and no reward for having read it.
    // RECOVER is what turns a damage race into a conversation.

    /** True while a committed action owns the boss; pattern movement should yield. */
    get busy() {
        return this.action != null;
    }

    /** True during the recovery window — the boss is open and taking bonus damage. */
    get staggered() {
        return this.action != null && this.action.stage === 'recover';
    }

    /**
     * Commit the boss to one attack.
     *
     * @param {object} def
     * @param {string}   def.name       for tests and debugging
     * @param {number}   [def.windup]   seconds of readable commitment
     * @param {number}   [def.recover]  seconds of open, double-damage stagger
     * @param {function} [def.aim]      (player) => { x, z, radius?, shape?, color?, dir? }
     *                                  the telegraph. Called once, at windup start.
     * @param {function} [def.strike]   (player, aim, game) => void — resolve damage
     * @param {function} [def.onRecover] (game) => void
     * @param {number}   [def.cooldown] seconds before the next action may start
     * @param {object}   [player]       target; defaults to the one update() saw.
     *                                  Committing to an attack with no target
     *                                  is refused rather than aimed at nothing.
     */
    startAction(def, player) {
        if (this.action || this.state.current === 'DEAD') return false;
        const target = player || this._actionPlayer;
        if (def.aim && !target) return false;
        const windup = (def.windup != null ? def.windup : 0.7) * this.telegraphDuration;
        const aim = def.aim ? def.aim(target) : null;
        this.action = {
            def, aim, stage: 'windup', t: windup,
            windup, recover: (def.recover != null ? def.recover : 0.9) * this.recoveryDuration,
        };
        if (aim) {
            this.telegraphShape(aim.shape || 'circle', {
                x: aim.x, z: aim.z,
                radius: aim.radius != null ? aim.radius : 2.2,
                dir: aim.dir, life: windup, color: aim.color,
            });
        }
        if (def.onWindup) def.onWindup(this);
        return true;
    }

    /** Drive the committed action. Called from update() before tickAI. */
    runAction(dt, player, game) {
        if (this.actionCd > 0) this.actionCd -= dt;
        const a = this.action;
        if (!a) return;
        a.t -= dt;
        if (a.t > 0) return;

        if (a.stage === 'windup') {
            // Resolve against where the player IS, not where the telegraph was.
            if (a.def.strike && player && !player.health?.dead) {
                a.def.strike(player, a.aim, game);
            }
            this.clearTelegraph();
            a.stage = 'recover';
            a.t = a.recover;
            // Open the window: stop shielding, take double, and SHOW it.
            this._preRecoverShield = this.shielded;
            this.shielded = false;
            this.vulnerableMult = this.staggerMult;
            this._showRecoverCue();
            return;
        }

        // Recovery over — close the window and go back to the pattern.
        this.vulnerableMult = 1;
        if (this._preRecoverShield != null) {
            this.shielded = this._preRecoverShield;
            this._preRecoverShield = null;
        }
        this._hideRecoverCue();
        this.actionCd = (a.def.cooldown != null ? a.def.cooldown : 1.4) / this.actionFrequency;
        if (a.def.onRecover) a.def.onRecover(game);
        this.action = null;
    }

    /**
     * The stagger has to be visible or it may as well not exist — the same
     * mistake that left every boss telegraph rendering a metre underground.
     * A bright halo sits at the boss's feet for exactly as long as the window.
     */
    _showRecoverCue() {
        this._hideRecoverCue();
        if (!this.root) return;
        const r = Math.max(1.0, this.contactRadius * 0.9);
        const geo = new THREE.RingGeometry(r * 0.65, r, 24);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xfff0a0, transparent: true, opacity: 0.85,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const halo = new THREE.Mesh(geo, mat);
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(this.root.position.x, this.floorY + 0.05, this.root.position.z);
        this.scene.add(halo);
        this._recoverCue = halo;
        sfx.block();
    }

    _hideRecoverCue() {
        if (!this._recoverCue) return;
        if (this._recoverCue.parent) this._recoverCue.parent.remove(this._recoverCue);
        this._recoverCue.geometry?.dispose();
        this._recoverCue.material?.dispose();
        this._recoverCue = null;
    }

    /**
     * Shaped telegraphs. A ring means "stand somewhere else"; a cone means
     * "get behind it"; a line means "get out of the lane". One ring for every
     * attack in the game taught the player nothing about which was coming.
     *
     * @param {'circle'|'cone'|'line'} kind
     */
    telegraphShape(kind, opts = {}) {
        const { x = 0, z = 0, radius = 2.2, life = 0.7, dir = null } = opts;
        if (kind === 'circle' || !dir) {
            this.telegraphAt(x, z, radius, life, opts.color != null ? opts.color : 0xff4040);
            return;
        }
        this.clearTelegraph();
        const dlen = Math.hypot(dir.x, dir.z) || 1;
        const dx = dir.x / dlen, dz = dir.z / dlen;
        let geo;
        if (kind === 'cone') {
            const half = opts.halfAngle != null ? opts.halfAngle : Math.PI / 4;
            geo = new THREE.CircleGeometry(radius, 24, -half, half * 2);
        } else {
            const w = opts.width != null ? opts.width : 1.4;
            geo = new THREE.PlaneGeometry(w, radius);
            geo.translate(0, radius / 2, 0);
        }
        const mat = new THREE.MeshBasicMaterial({
            color: opts.color != null ? opts.color : 0xff4040,
            transparent: true, opacity: 0.6,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const m = new THREE.Mesh(geo, mat);
        // Laid flat, then yawed. The -90° X tilt maps local (x,y,z) to world
        // (x, z, -y), so the two geometries need DIFFERENT yaws to end up
        // pointing the same way: the cone's wedge is centred on local +X,
        // while the plane extends along local +Y. Solving each through the
        // tilt gives the two atan2 forms below.
        //
        // These were previously a single shared expression with a sign error,
        // which drew every cone and lane rotated away from the attack it was
        // announcing — a telegraph that actively lies is worse than none,
        // because the player is punished for reading it correctly.
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = kind === 'cone'
            ? Math.atan2(-dz, dx)
            : Math.atan2(-dx, -dz);
        m.position.set(x, this.floorY + 0.07, z);
        this.scene.add(m);
        this._telegraph = m;
        this._telegraphLife = life;
        this._telegraphMax = life;
    }

    /** Cone hit test in the XZ plane — matches the 'cone' telegraph. */
    inCone(player, origin, dir, radius, halfAngle = Math.PI / 4) {
        if (!player) return false;
        const dx = player.root.position.x - origin.x;
        const dz = player.root.position.z - origin.z;
        const d = Math.hypot(dx, dz);
        if (d > radius) return false;
        const len = Math.hypot(dir.x, dir.z) || 1;
        const dot = (dx * dir.x + dz * dir.z) / (d || 1) / len;
        return dot >= Math.cos(halfAngle);
    }

    /** Radial hit test in the XZ plane — matches the 'circle' telegraph. */
    inBlast(player, x, z, radius) {
        if (!player) return false;
        return Math.hypot(
            player.root.position.x - x,
            player.root.position.z - z
        ) < radius;
    }

    /**
     * Z3: the single point every boss deals player damage through. It exists so
     * the guard can be DIRECTIONAL — the filter needs to know where the blow
     * came from, and threading that through twenty-odd call sites by hand is
     * how you get nineteen of them right.
     *
     * `origin` overrides the hit's apparent source for attacks that land away
     * from the boss's body (a fireball, a floor slam at a telegraphed point):
     * you guard the direction of the thing hitting you, not the thing that
     * threw it.
     */
    hitPlayer(player, amount, iFrameTime = 0.7, origin = null) {
        if (!player || !player.health) return { accepted: false };
        const res = player.health.damage(amount, iFrameTime, 'hostile', {
            from: origin || this.root?.position, attacker: this,
        });
        if (res?.accepted) sfx.hurt();
        return res;
    }

    /**
     * Z3: a parried boss is forced straight into its recovery window — the
     * attack it committed to never resolves, and the punish halo opens early.
     * Reusing the existing recover stage means a parry reward is already
     * telegraphed, already doubles damage, and already cleans itself up.
     */
    stagger(sec = 0.9) {
        if (this.state.current === 'DEAD') return false;
        const a = this.action;
        if (a && a.stage === 'windup') {
            this.clearTelegraph();
            a.stage = 'recover';
            a.t = Math.max(a.recover, sec);
            this._preRecoverShield = this.shielded;
            this.shielded = false;
            this.vulnerableMult = this.staggerMult;
            this._showRecoverCue();
            return true;
        }
        if (a && a.stage === 'recover') {
            a.t = Math.max(a.t, sec); // extend an open window
            return true;
        }
        this.actionCd = Math.max(this.actionCd, sec);
        return false;
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
            this.hitPlayer(player, this.contactDamage, 0.85);
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

        // Subclasses read this in aim() callbacks, which fire inside
        // startAction() and so have no player argument of their own.
        this._actionPlayer = player;
        this.runAction(dt, player, game);
        if (this._recoverCue && this.root) {
            this._recoverCue.position.set(
                this.root.position.x, this.floorY + 0.05, this.root.position.z
            );
            const a = this.action;
            const u = a && a.recover ? Math.max(0, a.t / a.recover) : 0;
            this._recoverCue.material.opacity = 0.45 + u * 0.45;
            this._recoverCue.scale.setScalar(1 + (1 - u) * 0.3);
        }

        this.tickAI(dt, player, game);
        this.tryContact(player, dt);
    }

    /** Override in subclasses. */
    tickAI(_dt, _player, _game) {}

    dispose() {
        this.clearTelegraph();
        this._hideRecoverCue();
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

/**
 * Circle the player while closing.
 *
 * A boss that holds a fixed radius from a player who is chasing it is simply
 * unreachable — it backs away exactly as fast as you approach, forever. That
 * is what a naive "orbit the player at R" does, and it is worse than the fixed
 * arena orbits it replaced, because at least those could be walked into.
 *
 * So the radius only ever shrinks: the boss strafes around you and spirals in,
 * which reads as circling for an opening and still guarantees the fight closes.
 *
 * @param {{x:number,z:number}} pos       mutated in place
 * @param {object} player
 * @param {number} dt
 * @param {object} [opts]
 * @param {number} [opts.speed=3]         travel speed
 * @param {number} [opts.spin=0.7]        radians/sec around the player
 * @param {number} [opts.close=0.8]       units/sec the radius tightens by
 * @param {number} [opts.minRadius=2]     never spiral closer than this
 */
export function circleStrafe(pos, player, dt, opts = {}) {
    if (!player) return;
    const { speed = 3, spin = 0.7, close = 0.8, minRadius = 2 } = opts;
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = pos.x - px, dz = pos.z - pz;
    const cur = Math.hypot(dx, dz) || 0.001;
    const want = Math.max(minRadius, cur - close * dt);
    const a = Math.atan2(dz, dx) + spin * dt;
    const tx = px + Math.cos(a) * want, tz = pz + Math.sin(a) * want;
    // Step toward the strafe point WITHOUT overshooting it. moveToward has no
    // clamp, so once the spiral reaches its minimum radius a full step sails
    // past the target and lands further out than it started — the boss ends up
    // jittering in and out instead of holding the ring.
    const ddx = tx - pos.x, ddz = tz - pos.z;
    const dd = Math.hypot(ddx, ddz);
    const step = Math.min(dd, speed * dt);
    if (dd > 1e-6) {
        pos.x += (ddx / dd) * step;
        pos.z += (ddz / dd) * step;
    }
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
