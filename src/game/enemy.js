// Hostile constructs — chase, charge, and ranged AI variants.

import * as THREE from 'three';
import { createActorRig } from './characters/actor-rig.js';
import { createActorAnimator } from './characters/actor-animator.js';
import { makeFacing } from '../combat/facing.js';
import { ENEMY_PALETTES } from './assets/palettes.js';
import { sfx } from '../audio/synth.js';
import { getActiveRunMode } from './kernel/run-mode.js';
import { coach } from './ui/coach.js';
import { inGuardArc } from './combat/guard.js';
import { applyHit } from './combat/combat-sweeper.js';

/**
 * What a bolt is worth once you have sent it back. Double, because the point
 * of a deflection is that the shooter's own attack is the punish — a bolt that
 * came back for the same 1 damage a sword swing does would make facing the
 * shot strictly worse than closing the distance.
 */
const REFLECT_DAMAGE_MULT = 2;

/**
 * The mote's burst, as three numbers that MUST agree.
 *
 * They are named because they were three separate literals — the distance the
 * mote parks at, the radius it draws, and the radius it resolves against — and
 * a burst whose drawn ring does not match the range it damages is a telegraph
 * that lies. This is the kind that the owner reported as having "no way to
 * avoid their hit or defend against it", so the tell had better be honest.
 *
 * What you have to do to escape is `MOTE_BURST - MOTE_HOLD` = 0.6 units, and
 * how long you have to do it in is `MOTE_WINDUP` seconds. It used to be 0.8
 * units in 0.5s while the ring was drawn wider than the mote ever came — the
 * numbers were survivable on paper and unreadable in play. Now the mote comes
 * visibly INSIDE the circle it paints, and stepping off it is a short walk
 * with most of a second to make it.
 *
 * The other half of the answer is the shield: a mote's burst carries a real
 * origin, so it lands in the guarded cone if you turn and face it. That was
 * always true and always useless, because a blocked hit still chipped you and
 * a mote cannot be answered with a sword. With chip damage now zero, standing
 * your ground and facing it is a genuine second answer.
 */
const MOTE_HOLD = 2.0;
const MOTE_BURST = 2.6;
const MOTE_WINDUP = 0.85;

export class Enemy {
    /**
     * @param {string} kind sentinel | scarab | frost | bulwark | mote | lancer | brood
     * @param {string} [opts.ai] chase | charge | ranged | lunge | drift  (default by kind)
     */
    constructor(scene, collisionWorld, position, opts = {}) {
        const mode = getActiveRunMode();
        this.kind = opts.kind || 'sentinel';
        this.ai = opts.ai || defaultAi(this.kind);
        const pal = ENEMY_PALETTES[this.kind] || ENEMY_PALETTES.sentinel;
        // Ticket F: named-pivot rig + archetype animator — sentinel, scarab,
        // and frost diverge in rest pose and gait, not just palette.
        this.actor = createActorRig({
            palette: pal,
            torsoProfileScale: opts.scaleProfile || 0.65,
            headProfileScale: 0.85,
            meshScale: opts.meshScale || 0.33,
            clothingMode: 'casual',
            groundOffset: 0, // enemy rig origin sits on the floor (rig.y = floor top)
        });
        this.rig = this.actor.root;
        this._inner = this.actor.inner;
        this.animator = createActorAnimator(this.actor, { archetype: this.kind });
        this.rig.position.set(position.x, position.y != null ? position.y : 1.0, position.z);
        scene.add(this.rig);
        this.scene = scene;

        this.root = this.rig;
        this.state = makeFacing(-1);
        this.state.current = 'IDLE';
        this.hitRadius = opts.hitRadius || 0.5;
        const baseHp = opts.hp != null ? opts.hp : 3;
        this.hp = Math.max(1, baseHp * mode.enemyHp);
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
        this.windup = (opts.windup != null ? opts.windup : 0.45) * mode.telegraphDuration;
        this.actionFrequency = mode.actionFrequency;
        this.projectileSpeed = mode.projectileSpeed;
        this._windupT = 0;
        this._pendingStrike = null;
        this._tell = null;
        this._tellLife = 0;
        this._tellMax = 0;
        this.loot = opts.loot || null;
        this.onDeath = opts.onDeath || null;
        this.projectiles = [];

        // Z5 — the traits that make a kind ask a different question.
        //
        // frontArmor: melee from inside the front cone is refused outright.
        //   The answers are to flank it (which is why lock-on strafing exists)
        //   or to parry its swing, which opens `_openT`.
        // hover: sits above melee reach entirely, so it must be answered at
        //   range. `flyHeight` is measured from the floor the enemy spawned on.
        // split: comes apart on death into `split` weaker copies. The level
        //   supplies the spawner via attachSplit(), because only the level
        //   knows how to register a new enemy with the room.
        this.frontArmor = !!opts.frontArmor || this.kind === 'bulwark';
        // A plate is only a puzzle if the player can get behind it. Facing used
        // to snap at the player every frame, which pinned the armoured cone on
        // whoever was attacking: `inFrontArc` was true for every swing from
        // every angle, and a bulwark was literally unkillable by melee. The
        // flank the kind is built around was geometrically unreachable.
        //
        // 2.2 rad/s is derived, not picked. The plate spans ±75° (PI/2.4), so
        // the player must win 1.31 rad of relative bearing. Circling at speed
        // 5.5 from melee range (~1.5) is 3.7 rad/s of orbit, so the net gain is
        // ~1.5 rad/s — just under a second of committed strafing to open the
        // back. Fast enough to feel earned, slow enough that standing still and
        // swinging never works. Infinity leaves every other kind bit-for-bit
        // identical to before.
        this.turnRate = opts.turnRate != null ? opts.turnRate
            : (this.frontArmor ? 2.2 : Infinity);
        this.hover = opts.hover != null ? opts.hover : this.kind === 'mote';
        // 3.4 is not arbitrary: the tallest melee move (heavy_mallet) has
        // vertical 1.5, plus a 0.5 hit radius, against a player rig sitting at
        // 1.95. Anything under ~3.2 is still swingable, which would quietly
        // turn the mote back into an ordinary enemy.
        this.flyHeight = opts.flyHeight != null ? opts.flyHeight : 3.4;
        this.split = opts.split || (this.kind === 'brood' ? 2 : 0);
        this.generation = opts.generation || 0;
        this._openT = 0;      // armour-down window bought by a parry
        this._lungeT = 0;
        this._lungeDir = null;
        this._driftT = Math.random() * Math.PI * 2;
        if (this.hover) {
            this._groundY = this.rig.position.y;
            this.rig.position.y = this._groundY + this.flyHeight;
        }

        this.onHit = () => {
            this._flash = 0.15;
            this.animator?.hit(); // flash PLUS stagger lean (Ticket F)
            // The impact sound belongs to combat-sweeper, which is the only
            // place that knows whether the hit wounded or killed.
        };
        // Z5: a plate that eats a swing has to SOUND like it, or the player
        // reads "my attack missed" instead of "that side is armoured" and
        // never learns the counterplay.
        this.onBlocked = opts.onBlocked || (() => {
            // The clang itself comes from combat-sweeper, which knows whether
            // this was a plate or a generic shield; doubling it here made one
            // impact sound like two.
            this._flash = 0.1;
            // The clang says "that did nothing". It does not say WHY, and a
            // player who never saw this dungeon's theme hint has no way to
            // infer a rule from a sound. Once, at the exact moment it matters.
            if (this.frontArmor) {
                coach('armor-front',
                    'That plate turns blades. Circle behind it — or parry its swing to drop it.');
            }
        });
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
        // A hovering enemy's tell still belongs on the FLOOR — painted at
        // altitude it is invisible from a top-down camera and unreadable
        // against the thing casting it.
        ring.position.set(x, (this.hover ? this._groundY : this.rig.position.y) + 0.06, z);
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
        // Sync rule 1 (Ticket F): the body's windup pose shares the ring's
        // exact life, so the raise peaks as the ring peaks. Frost aims (point
        // profile), scarab compresses low, sentinel pulls a slash back.
        this.animator?.startWindup(dur,
            this.ai === 'ranged' ? 'light_caster'
                : this.kind === 'scarab' ? 'bare_strike' : 'anchor_link');
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
        // Z3: `from` is what makes the guard directional — block the sentinel
        // in front of you and the scarab behind you still opens your back.
        const res = player.health.damage(damage, 0.9, 'hostile', {
            from: this.rig.position, attacker: this,
        });
        if (res.accepted) sfx.hurt();
        return res.accepted;
    }

    /**
     * Z3: interrupted — drop any committed swing and stand open. This is the
     * reward a parry buys the player, so it must cancel the pending strike
     * rather than merely delaying it.
     */
    stagger(sec = 0.7) {
        this._windupT = 0;
        this._pendingStrike = null;
        this._chargeT = 0;
        this._lungeT = 0;
        this.clearTelegraph();
        this.attackCd = Math.max(this.attackCd, sec);
        // Z5: one rule, uniformly applied — a parry undoes whatever makes this
        // enemy hard to hit. The bulwark drops its plate; the mote drops out
        // of the air. That single sentence is the whole reward structure, and
        // it means neither kind can ever become unkillable if the player
        // skipped the item that was "meant" to answer it.
        this._openT = Math.max(this._openT, sec);
        if (this.hover) this._groundedT = Math.max(this._groundedT || 0, sec);
        this.animator?.hit();
    }

    /** Z5: true while the front plate actually refuses melee. */
    get armorUp() {
        return this.frontArmor && this._openT <= 0 && this.state.current !== 'DEAD';
    }

    /**
     * The floor under this enemy — where anything it drops belongs.
     *
     * A hovering enemy's `root.position.y` is `_groundY + flyHeight`, i.e. 3.4
     * units up, and every drop was being spawned there: hearts from a slain
     * mote hung in mid-air, and `HeartDrop.update` only collects within 2.0
     * units of vertical, so they were not merely ugly — they were
     * unreachable. Killing a mote paid you nothing at all.
     */
    get dropY() {
        return this.hover ? this._groundY : this.rig.position.y;
    }

    /** Z5: true while a hovering enemy is genuinely out of sword reach. */
    get airborne() {
        return this.hover && !(this._groundedT > 0) && this.state.current !== 'DEAD';
    }

    update(dt, player) {
        if (this.state.current === 'DEAD') {
            this.rig.visible = false;
            this.clearTelegraph();
            this._clearProjectiles();
            this.animator?.setDead(true);
            return;
        }
        this._frameMove = 0;
        this._updateAI(dt, player);
        this._separateFrom(player);
        // Ticket F: pose from the same clocks the AI runs on. The animator
        // writes only local pivot rotations; root position/yaw stay AI-owned,
        // so hitboxes (root.position + hitRadius) never drift from the body.
        if (this.animator) {
            const sp = dt > 0 ? this._frameMove / dt : 0;
            this.animator.setLocomotion({
                speed: sp,
                wishX: sp > 0.2 ? this.state.facingVec.x : 0,
                wishZ: sp > 0.2 ? this.state.facingVec.z : 0,
                grounded: true,
            });
            this.animator.update(dt);
        }
    }

    /**
     * Keep a body's width between us and the player.
     *
     * The AI stops advancing at `attackRange`, but nothing stopped the PLAYER
     * from walking straight through an enemy, and the two then stand in the
     * same square metre. That is bad enough to look at — the reported symptom
     * was a mob standing on the player's head — but it also breaks the maths
     * that every directional rule is built on: at zero separation there is no
     * bearing, so `inFrontArc` answers "armoured" by default and a bulwark you
     * are hugging cannot be flanked at all.
     *
     * The enemy is what yields, never the player: shoving the player's rig
     * fights their input, and being able to body a construct out of your way
     * is the correct-feeling half of the trade. Movement goes through the
     * collision world so nobody gets pushed into a wall.
     */
    _separateFrom(player) {
        if (!player?.root || this.hover || this.state.current === 'DEAD') return;
        if (player.health?.dead) return;
        const min = (this.hitRadius || 0.5) + 0.5;
        let dx = this.rig.position.x - player.root.position.x;
        let dz = this.rig.position.z - player.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d >= min) return;
        let len = d;
        if (d < 1e-4) {
            // Exactly co-located: back out along our own facing, which is the
            // one direction we know the player did not come from.
            dx = -this.state.facingVec.x; dz = -this.state.facingVec.z; len = 1;
        }
        this._move(dx, dz, len, min - d);
    }

    _updateAI(dt, player) {
        if (this.attackCd > 0) this.attackCd -= dt;
        if (this._openT > 0) this._openT -= dt;
        if (this.hover) {
            // Hold station above melee reach with a slow bob. The bob is
            // cosmetic; the height is the mechanic, so it is driven off
            // `flyHeight` and never allowed to dip into sword range — except
            // while grounded by a parry, which is the melee player's opening.
            if (this._groundedT > 0) this._groundedT -= dt;
            this._driftT += dt * 1.6;
            const target = this._groundedT > 0
                ? this._groundY
                : this._groundY + this.flyHeight + Math.sin(this._driftT) * 0.22;
            // Ease rather than teleport, so the drop reads as being knocked
            // down and the climb back reads as a closing window.
            this.rig.position.y += (target - this.rig.position.y) * Math.min(1, dt * 9);
        }

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
                // Sync rules 2-3 (Ticket F): resolve snaps the strike pose
                // for ≤0.12s then recovers through the cooldown — and a
                // whiff still plays it, so dodging reads as a dodge.
                this.animator?.strike(0.12, Math.min(0.6, Math.max(0.2, this.attackCd)));
                if (strike) strike(player, dist);
            }
            return;
        }

        if (dist >= this.aggroRange) return;

        this._faceToward(dx, dz, dt);

        if (this.ai === 'charge') {
            this._aiCharge(dt, player, dx, dz, dist);
        } else if (this.ai === 'ranged') {
            this._aiRanged(dt, player, dx, dz, dist);
        } else if (this.ai === 'lunge') {
            this._aiLunge(dt, player, dx, dz, dist);
        } else if (this.ai === 'drift') {
            this._aiDrift(dt, player, dx, dz, dist);
        } else {
            this._aiChase(dt, player, dx, dz, dist);
        }
    }

    /**
     * Z5 — lancer. A charge closes the gap; a lunge covers it in one committed
     * thrust down a lane locked at windup time, damaging anything along the
     * path. The counterplay is lateral, not backwards: you cannot outrun it,
     * you step out of the lane. That is a different reflex from every other
     * enemy in the game, which is the entire reason the kind exists.
     */
    _aiLunge(dt, player, dx, dz, dist) {
        if (this._lungeT > 0) {
            this._lungeT -= dt;
            this._move(this._lungeDir.x, this._lungeDir.z, 1, this.speed * 4.2 * dt);
            if (this.attackCd <= 0) {
                const px = player.root.position.x - this.rig.position.x;
                const pz = player.root.position.z - this.rig.position.z;
                if (Math.hypot(px, pz) < 1.5) {
                    this.attackCd = 0.8 / this.actionFrequency;
                    player.health.damage(this.damage + 1, 0.6, 'hostile', {
                        from: this.rig.position, attacker: this,
                    });
                    sfx.stomp();
                    this._lungeT = 0;
                }
            }
            return;
        }
        // Stay at lunge distance: too close and the kind loses its identity.
        if (dist < 3) {
            this._move(-dx, -dz, dist, this.speed * 0.8 * dt);
        } else if (dist > 9) {
            this._move(dx, dz, dist, this.speed * 0.75 * dt);
        }
        if (this.attackCd <= 0 && dist <= 9) {
            this.attackCd = (2.0 / this.actionFrequency) + this.windup;
            const dir = { x: dx / dist, z: dz / dist };
            this._beginWindup(() => {
                this._lungeT = 0.42;
                this._lungeDir = dir;
                sfx.whoosh();
            }, {
                windup: 0.6 * getActiveRunMode().telegraphDuration,
                // A long, narrow tell drawn down the lane it will travel.
                reach: 4.5, radius: 1.5, color: 0xff5533,
            });
        }
    }

    /**
     * Z5 — mote. Hovers above sword height and never lands, so melee simply
     * does not apply; it has to be answered at range. It closes patiently and
     * pulses a short-range burst, which stops "just ignore it" from working.
     */
    _aiDrift(dt, player, dx, dz, dist) {
        if (dist > MOTE_HOLD) {
            this._move(dx, dz, dist, this.speed * 0.55 * dt);
        }
        if (this.attackCd <= 0 && dist < MOTE_BURST) {
            this.attackCd = (1.8 / this.actionFrequency) + this.windup;
            this._beginWindup((p, d) => {
                if (d < MOTE_BURST) {
                    p.health.damage(this.damage, 0.7, 'hostile', {
                        from: this.rig.position, attacker: this,
                    });
                    sfx.hurt();
                } else sfx.step();
            }, {
                windup: MOTE_WINDUP * getActiveRunMode().telegraphDuration,
                reach: 0, radius: MOTE_BURST, color: 0xc084fc,
            });
        }
    }

    /**
     * Rotate facing toward (dx, dz), capped at `turnRate` radians per second.
     * An infinite turn rate takes the snap path so the arithmetic below cannot
     * perturb the kinds that never needed it.
     */
    _faceToward(dx, dz, dt) {
        if (this.turnRate === Infinity) {
            this.state.setFacing(dx, dz);
        } else if (Math.hypot(dx, dz) > 1e-6) {
            const want = Math.atan2(dx, dz);
            const have = Math.atan2(this.state.facingVec.x, this.state.facingVec.z);
            let delta = want - have;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            const step = this.turnRate * dt;
            const a = Math.abs(delta) <= step ? want : have + Math.sign(delta) * step;
            this.state.setFacing(Math.sin(a), Math.cos(a));
        }
        this.rig.rotation.y = Math.atan2(this.state.facingVec.x, this.state.facingVec.z);
    }

    _aiChase(dt, player, dx, dz, dist) {
        if (dist > this.attackRange && dist > 0.2) {
            this._move(dx, dz, dist, this.speed * dt);
        } else if (this.attackCd <= 0) {
            this.attackCd = (0.9 / this.actionFrequency) + this.windup;
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
                this.attackCd = 0.7 / this.actionFrequency;
                player.health.damage(this.damage + 0.5, 0.5, 'hostile', {
                    from: this.rig.position, attacker: this,
                });
                sfx.stomp();
                this._chargeT = 0;
            }
            return;
        }
        if (dist > 3.5 && this.attackCd <= 0) {
            // Rear up before charging, marking the lane it will run down, so
            // the charge can be read and stepped out of instead of simply
            // arriving. The direction is locked at windup time.
            this.attackCd = (2.2 / this.actionFrequency) + this.windup;
            const dir = { x: dx / dist, z: dz / dist };
            this._beginWindup(() => {
                this._chargeT = 0.55;
                this._chargeDir = dir;
                sfx.stomp();
            }, { windup: 0.5 * getActiveRunMode().telegraphDuration, reach: 2.2, radius: 1.6, color: 0xffaa33 });
        } else if (dist > this.attackRange) {
            this._move(dx, dz, dist, this.speed * 0.7 * dt);
        } else if (this.attackCd <= 0) {
            this.attackCd = (1.0 / this.actionFrequency) + this.windup;
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
            this.attackCd = (1.6 / this.actionFrequency) + this.windup;
            const dir = { x: dx / dist, z: dz / dist };
            this._beginWindup(() => this._spawnProjectile(dir.x, dir.z), {
                windup: 0.55 * getActiveRunMode().telegraphDuration, reach: 1.1, radius: 0.9, color: 0x66ccff,
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
            mesh, vx: fx * 9 * this.projectileSpeed, vz: fz * 9 * this.projectileSpeed,
            life: 2.5, damage: this.damage,
        });
    }

    _updateProjectiles(dt, player) {
        this.projectiles = this.projectiles.filter((p) => {
            p.life -= dt;
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.z += p.vz * dt;

            if (p.reflected) {
                // The bolt belongs to the player now. It no longer threatens
                // them; it threatens the thing that fired it.
                if (this.state.current !== 'DEAD') {
                    const d = Math.hypot(
                        this.rig.position.x - p.mesh.position.x,
                        this.rig.position.z - p.mesh.position.z
                    );
                    if (d < (this.hitRadius || 0.5) + 0.45) {
                        applyHit(this, { damage: p.damage }, player);
                        p.life = 0;
                    }
                }
            } else if (player && !player.health?.dead) {
                const d = Math.hypot(
                    player.root.position.x - p.mesh.position.x,
                    player.root.position.z - p.mesh.position.z
                );
                if (d < 0.7) {
                    // A shooter must be answerable by HOLDING the shield, not
                    // by parrying it. A parry is a timed read of a wind-up you
                    // can see; a bolt already in flight gives you the travel
                    // time and nothing else, so demanding frame-accuracy for
                    // something you cannot walk out of is asking for a read
                    // the game never showed you. Facing it is the whole skill.
                    //
                    // `inGuardArc` rather than a second hand-rolled dot product:
                    // the cone the shield covers has exactly one definition, and
                    // the copy that used to live here (`toward > 0.45`, ~63°)
                    // silently disagreed with the 60° the guard actually uses.
                    const covered = inGuardArc(
                        player.root.position, player.state?.facingVec, p.mesh.position);
                    const guarding = !!player.guard?.raised;
                    // The Reflector Plate is now the PASSIVE version of a verb
                    // everyone has: it bounces frontal shots with no shield up
                    // and no button held. Before, it was the only way to bounce
                    // anything at all, and all it did was delete the bolt.
                    const plate = !!player.inventory?.hasItem?.('reflector_plate');
                    if (covered && (guarding || plate)) {
                        this._reflect(p, player);
                    } else {
                        // A projectile's "from" is the shot itself, not the
                        // shooter — you guard the incoming bolt's direction.
                        const r = player.health.damage(p.damage, 0.5, 'hostile', {
                            from: p.mesh.position, attacker: this, projectile: true,
                        });
                        if (r.accepted) sfx.hurt();
                        p.life = 0;
                    }
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

    /**
     * Send a bolt back at whoever fired it.
     *
     * Aimed at the shooter rather than simply negated, because "the shot came
     * back" is the feedback that teaches the verb. A bolt that merely vanished
     * (which is all the Reflector Plate used to do) reads as "my shield ate it"
     * — true, but it never tells the player that facing a shooter is an
     * offensive option.
     */
    _reflect(p, player) {
        const dx = this.rig.position.x - p.mesh.position.x;
        const dz = this.rig.position.z - p.mesh.position.z;
        const len = Math.hypot(dx, dz) || 1;
        // Homed at the shooter's CURRENT position, not simply negated: a bolt
        // fired while the shooter was strafing would otherwise come back to
        // where it was standing a second ago and miss for reasons the player
        // cannot see.
        const speed = Math.hypot(p.vx, p.vz) * 1.25;
        p.vx = (dx / len) * speed;
        p.vz = (dz / len) * speed;
        p.reflected = true;
        // A clean read hits harder, but is never REQUIRED — holding the shield
        // is the answer, and the parry window is only ever a bonus on top.
        p.damage *= REFLECT_DAMAGE_MULT * (player.guard?.parryReady ? 2 : 1);
        p.life = Math.max(p.life, 2.5);
        // Recoloured to the player's gold so a bolt in flight always says whose
        // it is. At this camera distance the direction of travel alone is not
        // readable fast enough to matter.
        p.mesh.material.color.setHex(0xffd060);
        p.mesh.material.emissive.setHex(0xffa020);
        sfx.block();
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
        const x0 = this.rig.position.x, z0 = this.rig.position.z;
        const nx = x0 + (dx / dist) * sp;
        const nz = z0 + (dz / dist) * sp;
        if (this.collisionWorld) {
            const r = this.collisionWorld.resolveMove(x0, z0, nx, nz, 0.4);
            this.rig.position.x = r.x;
            this.rig.position.z = r.z;
        } else {
            this.rig.position.x = nx;
            this.rig.position.z = nz;
        }
        // Gait speed comes from distance actually covered, so a wall-pinned
        // enemy stops stepping instead of moonwalking in place.
        this._frameMove = (this._frameMove || 0)
            + Math.hypot(this.rig.position.x - x0, this.rig.position.z - z0);
    }

    dispose() {
        this._clearProjectiles();
        this.clearTelegraph();
        if (this.actor) this.actor.dispose();
        else if (this.rig.parent) this.rig.parent.remove(this.rig);
    }
}

function defaultAi(kind) {
    if (kind === 'scarab') return 'charge';
    if (kind === 'frost') return 'ranged';
    if (kind === 'mote') return 'drift';
    if (kind === 'lancer') return 'lunge';
    if (kind === 'bulwark') return 'chase'; // slow, armoured, relentless
    if (kind === 'brood') return 'charge';
    return 'chase';
}

/**
 * Z5: wire a splitter's death to the level that owns it. `spawn(pos, opts)`
 * must register the new enemy with the current room the same way the original
 * was registered, or the children will be invisible to combat and never freed.
 */
/**
 * Where a split child can actually stand.
 *
 * The children used to be placed blind at a fixed 1.1 radius around the parent.
 * Kill a brood with its back to a wall and half its offspring materialise
 * INSIDE the masonry: unreachable by any weapon, permanently alive, and every
 * room-clear gate in that dungeon waits on them forever. A softlock produced by
 * standing in an ordinary place.
 *
 * Walk the preferred bearing inward, then try the ring around it, and if the
 * room really is that tight fall back to the parent's own footprint — which is
 * guaranteed free, because something was just standing in it.
 */
function freeSpotNear(enemy, angle, half = 0.38) {
    const ox = enemy.rig.position.x;
    const oz = enemy.rig.position.z;
    const cw = enemy.collisionWorld;
    if (!cw || typeof cw.blocked !== 'function') {
        return { x: ox + Math.cos(angle) * 1.1, z: oz + Math.sin(angle) * 1.1 };
    }
    for (const r of [1.1, 0.8, 0.5]) {
        for (let k = 0; k < 8; k++) {
            // Search outward from the requested bearing so the burst still
            // reads as a burst when there is room for it to.
            const a = angle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
            const x = ox + Math.cos(a) * r;
            const z = oz + Math.sin(a) * r;
            if (!cw.blocked(x, z, half)) return { x, z };
        }
    }
    return { x: ox, z: oz };
}

export function attachSplit(enemy, spawn) {
    if (!enemy || !enemy.split || typeof spawn !== 'function') return enemy;
    const prev = enemy.onDeath;
    enemy.onDeath = () => {
        prev?.();
        const n = enemy.split;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const at = freeSpotNear(enemy, a, 0.38);
            spawn({
                x: at.x,
                y: enemy.rig.position.y,
                z: at.z,
            }, {
                kind: enemy.kind,
                ai: enemy.ai,
                // Children are weaker and — critically — sterile. Without the
                // generation cap a brood clears the room by filling it.
                hp: Math.max(1, Math.round(enemy.maxHp / 2)),
                damage: Math.max(0.5, enemy.damage - 0.5),
                speed: enemy.speed * 1.15,
                meshScale: 0.24,
                hitRadius: 0.38,
                split: 0,
                generation: enemy.generation + 1,
            });
        }
    };
    return enemy;
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
        this.mesh.receiveShadow = true;
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
