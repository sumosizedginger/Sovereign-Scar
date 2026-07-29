// Player construct — modular voxels, physics, combat.

import { createActorRig } from './characters/actor-rig.js';
import { createActorAnimator } from './characters/actor-animator.js';
import { makeFacing } from '../combat/facing.js';
import { ArcSmear } from './fx/arc-smear.js';
import { juice } from './fx/juice.js';
import { vsfx } from './fx/vsfx.js';
import { gsfx } from './audio/sfx-bank.js';
import { HeldWeapon } from './fx/held-weapon.js';
import { HeldShield } from './fx/held-shield.js';
import { GrappleRope } from './fx/grapple-rope.js';
import { HERO_PALETTE } from './assets/palettes.js';
import { VoxelPhysicsBody } from './physics/voxel-physics-body.js';
import { getProfile } from './physics/friction-profiles.js';
import { HealthPool } from './kernel/health.js';
import { Inventory } from './kernel/inventory.js';
import {
    getWeapon, PHASE_BOOT,
    CHARGE_TIME, CHARGE_WINDUP, CHARGE_MOVE_MULT, DASH_ATTACK,
} from './combat/weapons.js';
import { combatSweep, applyHit } from './combat/combat-sweeper.js';
import { GrappleController } from './combat/grapple.js';
import { GuardController, GUARD_SPEED_MULT } from './combat/guard.js';
import { LockOnController } from './combat/lock-on.js';
import { coach } from './ui/coach.js';
import { INPUT_BUFFER } from './input.js';

/**
 * Half-width of the Light Caster's uncharged ray, in world units.
 *
 * Named because it is now used twice — once to decide what the beam hits and
 * once to draw it — and two hand-copied 0.7s is exactly how a weapon ends up
 * drawn one size and resolved another.
 */
export const RAY_LATERAL = 0.7;

export class Player {
    constructor(scene, collisionWorld, getVoxelAt) {
        this.scene = scene;
        this.collisionWorld = collisionWorld;

        // Ticket F: named-pivot rig + procedural animator replace the old
        // single welded figure. Same frozen part builders, same grounding
        // (feet at the physics body's bottom face, rig.y - 0.95).
        this.actor = createActorRig({
            palette: HERO_PALETTE,
            torsoProfileScale: 0.72,
            headProfileScale: 0.9,
            meshScale: 0.39,
            clothingMode: 'casual',
            groundOffset: -0.95,
        });
        this.rig = this.actor.root;
        this._inner = this.actor.inner;
        this._eyes = this.actor.eyes;
        this.animator = createActorAnimator(this.actor, { archetype: 'hero', isHero: true });
        this.rig.position.set(0, 1.95, 0);

        scene.add(this.rig);

        this.state = makeFacing(1);
        this.state.current = 'IDLE';
        // hitbox root expects .position
        this.root = this.rig;
        this.hitRadius = 0.45;

        this.physics = new VoxelPhysicsBody(
            this.rig.position,
            { x: 0.4, y: 0.95, z: 0.4 },
            getVoxelAt || (() => false)
        );
        // Start grounded assumption
        this.physics.grounded = true;

        this.health = new HealthPool(6);
        this.inventory = new Inventory();
        this.speed = 5.5;
        this.attackCd = 0;
        this.dashCd = 0;
        this.dashTimer = 0;
        // Phase C. Three numbers and one object, all of them readable from
        // outside so the HUD and the specs share the player's own state rather
        // than re-deriving it.
        this.chargeT = 0;          // seconds the attack button has been held
        this.chargeArmed = false;  // has crossed CHARGE_TIME (drives the cue)
        this.chargeStrike = null;  // { t, weapon, charge } — committed, locked
        this.dashAttackT = 0;      // seconds the lunging body stays lethal
        this._dashAttackHit = null;
        this.grapple = new GrappleController();
        // The hero used to swing an empty fist with every weapon, and the
        // grapple had no visuals at all — press G and you were simply
        // somewhere else. Both are legibility problems, not decoration:
        // weapon reach and arc differ enough that you have to be able to see
        // what you are holding.
        this.heldWeapon = new HeldWeapon(this.rig);
        this.heldShield = new HeldShield(this.rig);
        this.grappleRope = new GrappleRope(scene);
        this.arcSmear = new ArcSmear(scene); // C8: true 8-way swing arcs

        // Z3: the guard intercepts damage at the single HealthPool entry point,
        // so every enemy and boss route through it without any of them knowing
        // it exists.
        this.guard = new GuardController();
        this.health.damageFilter = (hit) => this.guard.resolve(
            hit, this.rig.position, this.state.facingVec
        );
        this.guard.onParry = (meta) => {
            // Its own sound, not the block clang: a parry and a failed block
            // used to be acoustically identical, which meant the game gave the
            // same feedback for its most and least skilful outcomes.
            gsfx.parry();
            // A parry is the single most skilful thing the player can do, so it
            // gets the loudest feedback the juice layer has: a real hitstop.
            juice.hitstop(0.09);
            juice.addTrauma(0.35);
            // The reward for a clean read is an opening: stagger whoever swung.
            const src = meta && meta.attacker;
            if (src) {
                if (src.knockbackVel) {
                    const dx = src.root.position.x - this.rig.position.x;
                    const dz = src.root.position.z - this.rig.position.z;
                    const d = Math.hypot(dx, dz) || 1;
                    src.knockbackVel.x += (dx / d) * 6;
                    src.knockbackVel.z += (dz / d) * 6;
                }
                if (src.stagger) src.stagger(0.7);
                else if (src.attackCd != null) src.attackCd = Math.max(src.attackCd, 0.7);
                src.onHit?.();
            }
        };
        // Dull and wooden, deliberately unlike the parry's bright ring: you
        // took the hit, you did not beat it.
        this.guard.onBlock = () => {
            gsfx.guardBlock();
            juice.addTrauma(0.12);
            // The shield's real cost is poise, and poise is a pool the player
            // has no reason to look at until something tells them it exists.
            // `docs/CONTROLS.md` explains all of this beautifully and is not in
            // the game; before this the coach had three lines total, against
            // guard, parry, poise, guard-break, lock-on, target-switching, the
            // grapple, the boot, the wedge, the caster, mirror travel, vials
            // and dust.
            coach('guard-poise',
                'Blocking costs poise, not health — watch the pips. '
                + 'Run out and your guard breaks, which is worse than the hit.');
        };
        this.guard.onBreak = () => {
            vsfx.hurt();
            juice.addTrauma(0.5);
            coach('guard-break',
                'Guard broken. Turtling loses to this — let poise recover, '
                + 'or answer with a parry: tap guard as the blow lands.');
        };

        // Z4: Z-targeting. `getCandidates` is installed by the game loop, which
        // is the only thing that knows the live enemy list for the current room.
        this.lockOn = new LockOnController();

        this.frictionName = 'default';
        this._stepAcc = 0;
        this.spawnPoint = { x: 0, y: 1.95, z: 0 };
    }

    setGetVoxelAt(fn) {
        this.physics.getVoxelAt = fn || (() => false);
    }

    setFriction(name) {
        this.frictionName = name;
        this.physics.setFrictionProfile(getProfile(name));
    }

    setSpawn(x, y, z) {
        this.spawnPoint = { x, y, z };
        this.respawn();
    }

    respawn() {
        this.rig.position.set(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
        this.physics.resetVelocity();
        this.physics.grounded = true;
        this.health.fullRestore();
        this.state.current = 'IDLE';
        this.guard.reset();
        this.lockOn.release();
        this.chargeT = 0;
        this.chargeArmed = false;
        this.chargeStrike = null;
        this.dashAttackT = 0;
        this._dashAttackHit = null;
    }

    tryAttack(enemies, destructibles, opts = {}) {
        if (this.attackCd > 0 || this.health.dead) return [];
        const weapon = getWeapon(this.inventory.activeWeapon);
        if (weapon.ray) {
            // Light Caster ray — handled by caller with LightLineSystem ideally
            this.attackCd = weapon.cooldown;
            // Ray weapons POINT (no melee arc): the pose library's
            // light_caster profile holds an aim pose instead of a sweep.
            this.animator?.attack('light_caster', {
                windup: 0.05,
                strikeDur: 0.16,
                recover: 0.2,
            });
            gsfx.attack('light_caster');
            const hits = [];
            const range = weapon.range || 12;
            // The ray had NO visual whatsoever — the caller was supposed to draw
            // it with the LightLineSystem and never did, so the only feedback
            // for the game's one ranged weapon was the sound and whatever it
            // happened to kill. Drawn as the lane it resolves: from the player,
            // `range` long, as wide as the lateral gate below.
            this.arcSmear.spawn({
                position: this.rig.position,
                facingVec: this.state.facingVec,
                color: weapon.smearColor || 0xfff0a0,
                lift: 0.75,
                lane: { length: range, width: RAY_LATERAL * 2 },
            });
            // The ray reaches a switch the same way it reaches an enemy — all
            // the way down the lane, at the lane's own width.
            this._strike(destructibles, range, RAY_LATERAL + 0.6);
            for (const e of enemies) {
                if (!e || e.state?.current === 'DEAD') continue;
                if (e.canHit === false || e.shielded) continue;
                const ox = e.root.position.x - this.rig.position.x;
                const oz = e.root.position.z - this.rig.position.z;
                const fv = this.state.facingVec;
                const forward = ox * fv.x + oz * fv.z;
                const lateral = Math.abs(-ox * fv.z + oz * fv.x);
                if (forward > 0 && forward < range && lateral < RAY_LATERAL + (e.hitRadius || 0)) {
                    applyHit(e, weapon, this);
                    hits.push(e);
                }
            }
            return hits;
        }

        this.attackCd = weapon.cooldown || 0.3;
        // Body commits to the same swing the smear draws: snap windup,
        // strike matching the 0.12s smear life, settle within the cooldown.
        this.animator?.attack(this.inventory.activeWeapon, {
            windup: 0.07,
            strikeDur: 0.12,
            recover: Math.max(0.12, (weapon.cooldown || 0.3) - 0.19),
        });
        gsfx.attack(this.inventory.activeWeapon);
        this.arcSmear.spawn({
            position: this.rig.position,
            facingVec: this.state.facingVec,
            radius: weapon.range || 1.8,
            // The weapon's OWN arc, not the pool's default 110 degrees. The fan
            // still under-draws the rectangle's far corners and still leaves the
            // hole at the hilt — that is what makes it read as a sword rather
            // than a pie — but it no longer covers ground the swing cannot reach.
            arc: weapon.arcRad,
            color: weapon.smearColor || 0x7fe0ff,
        });

        const hits = combatSweep(this, enemies, weapon);
        for (const h of hits) applyHit(h, weapon, this);

        if (weapon.shatter && destructibles) {
            const fv = this.state.facingVec;
            const px = this.rig.position.x + fv.x * 1.2;
            const pz = this.rig.position.z + fv.z * 1.2;
            const py = this.rig.position.y + 0.5;
            for (const d of destructibles) {
                // Struck-by-anything targets are handled by `_strike` below, on
                // every weapon. Letting them through here too would fire them
                // twice per swing for the two weapons that shatter.
                if (d?.struckByAnything) continue;
                if (d && d.shatterAtWorld) {
                    const n = d.shatterAtWorld(px, py, pz, weapon.shatterRadius || 3);
                    if (n > 0) {
                        vsfx.shatter();
                        // Playtest issue 1: shatter used to throw away its
                        // return value except for the sound. Breaking ore is
                        // the verb the Heavy Mallet toast promises — pay it.
                        this.onShatter?.(d, n);
                    }
                }
            }
        }
        this._strike(destructibles, 1.2, 2.0);
        return hits;
    }

    /**
     * Anything on the destructible list that ANY hit sets off.
     *
     * `weapon.shatter` gates the loop above, and it is only true of the Tectonic
     * Wedge and the Heavy Mallet — which is right for ore, because breaking rock
     * is what those two are for and that gating is the reward for carrying them.
     * It was catastrophically wrong for the puzzle switch, which rode the same
     * list on the assumption that "every weapon already routes a swing through
     * it". Every weapon does not. A player holding the Anchor Link or the Light
     * Caster could not activate a switch at all, and switches are the entire
     * puzzle vocabulary of the seven even-numbered dungeons.
     *
     * So a target may opt in to being struck by anything. The ore does not, and
     * nothing about it changes.
     */
    _strike(destructibles, forward = 1.2, radius = 2.0) {
        if (!destructibles) return;
        const fv = this.state.facingVec;
        const py = this.rig.position.y + 0.5;
        // Sampled ALONG the reach rather than at one point on it, so a 16-unit
        // beam does not have to be modelled as a 16-unit-wide ball to cover its
        // own length. `radius` stays the lane's half-width at every sample.
        const steps = Math.max(1, Math.ceil(forward / radius));
        for (let i = 1; i <= steps; i++) {
            const at = (forward * i) / steps;
            const px = this.rig.position.x + fv.x * at;
            const pz = this.rig.position.z + fv.z * at;
            for (const d of destructibles) {
                if (d?.struckByAnything && d.shatterAtWorld) d.shatterAtWorld(px, py, pz, radius);
            }
        }
    }

    /**
     * Phase C — the charge, one frame of it.
     *
     * The state machine is deliberately small: hold, arm, release, commit,
     * resolve. The two rules that matter are both about what CANNOT happen.
     *
     * A charge cannot be held through a guard break. The break is the game's
     * punishment for turtling and it already drains attack and dash; letting a
     * charge survive it would hand the player a free committed move the instant
     * the stun ended, which is the same bug input buffering was careful not to
     * introduce.
     *
     * A committed strike cannot be steered. Once `chargeStrike` exists the
     * player is locked in place for `CHARGE_WINDUP` and the strike resolves
     * from where they stood. That is what makes the hero readable — this game
     * asks every boss in it to keep that promise, and the player does not get
     * an exemption.
     */
    _updateCharge(dt, input, enemies, destructibles) {
        if (this.health.dead) {
            this.chargeStrike = null;
            this.chargeT = 0;
            this.chargeArmed = false;
            return;
        }
        if (this.chargeStrike) {
            this.chargeStrike.t -= dt;
            if (this.chargeStrike.t <= 0) {
                const cs = this.chargeStrike;
                this.chargeStrike = null;
                this._resolveCharge(cs, enemies, destructibles);
            }
            return;
        }
        const weapon = getWeapon(this.inventory.activeWeapon);
        if (!weapon.charge || this.guard.broken) {
            this.chargeT = 0;
            this.chargeArmed = false;
            return;
        }
        // Guarding is the other committed stance; you cannot wind a swing
        // behind your own shield, or the shield stops being a trade.
        const held = !!input.attackHeld?.() && !this.guard.raised;
        if (held) {
            this.chargeT += dt;
            if (!this.chargeArmed && this.chargeT >= CHARGE_TIME) {
                this.chargeArmed = true;
                this._chargePulse = 0;
                gsfx.chargeReady();
                coach('charge-attack',
                    'Held long enough — let go for a committed strike. '
                    + 'It hits harder and wider, but you cannot move while it lands.');
            }
            // The ring keeps pulsing while the charge is banked. One cue at the
            // moment it arms is not enough: the player is looking at the fight,
            // and a tell you can miss by blinking is a tell that does not exist
            // for anyone playing with the sound off.
            if (this.chargeArmed) {
                this._chargePulse = (this._chargePulse || 0) + dt;
                if (this._chargePulse >= 0.22) {
                    this._chargePulse = 0;
                    this.arcSmear.spawn({
                        position: this.rig.position,
                        facingVec: this.state.facingVec,
                        radius: 1.1,
                        color: weapon.charge.smearColor || 0xffffff,
                        arc: Math.PI * 2,
                        lift: 0.1,
                    });
                }
            }
            return;
        }
        if (this.chargeArmed) this._commitCharge(weapon);
        this.chargeT = 0;
        this.chargeArmed = false;
    }

    /** Release: lock the body, then resolve a beat later. */
    _commitCharge(weapon) {
        const charge = weapon.charge;
        this.chargeStrike = { t: CHARGE_WINDUP, weapon, charge };
        this.attackCd = Math.max(this.attackCd, CHARGE_WINDUP + (charge.recover || 0.5));
        this.animator?.attack(this.inventory.activeWeapon, {
            windup: CHARGE_WINDUP,
            strikeDur: 0.16,
            recover: Math.max(0.16, (charge.recover || 0.5) - 0.16),
        });
        gsfx.chargeRelease(this.inventory.activeWeapon);
        this.physics.resetVelocity();
    }

    /** The committed move lands. Returns the hit list, for the specs. */
    _resolveCharge(cs, enemies = [], destructibles = null) {
        const { charge } = cs;
        const fv = this.state.facingVec;
        // The smear is drawn to the shape that resolves, not to a convenient
        // one: a disc gets four overlapping fans covering the full turn, a lane
        // gets a narrow wedge whose width is the lane's.
        if (charge.radial) {
            for (let i = 0; i < 4; i++) {
                this.arcSmear.spawn({
                    position: this.rig.position,
                    facingVec: { x: Math.cos(i * Math.PI / 2), z: Math.sin(i * Math.PI / 2) },
                    radius: charge.range,
                    color: charge.smearColor || 0xffffff,
                    spin: 9,
                });
            }
        } else {
            // A thrust and a beam are RECTANGLES — that is literally what
            // `hitboxCheck` resolves for any non-radial move — so they are drawn
            // as the rectangle, starting at the player and reaching exactly as
            // far as they hit. Drawing them as a sector was the player-side
            // version of the telegraph lie this project spent a whole session
            // hunting in the bosses: the Caster's lance resolved over a lane
            // 1.8 wide beginning at the player's feet and was drawn as a wedge
            // beginning five and a half units in front of them.
            this.arcSmear.spawn({
                position: this.rig.position,
                facingVec: fv,
                color: charge.smearColor || 0xffffff,
                lane: { length: charge.range, width: charge.depthTolerance * 2 },
            });
        }
        juice.addTrauma(0.22);

        const hits = combatSweep(this, enemies, charge);
        for (const h of hits) {
            applyHit(h, charge, this);
            // The shockwave's job is the opening, not the kill.
            if (charge.stagger) {
                if (h.stagger) h.stagger(charge.stagger);
                else if (h.attackCd != null) h.attackCd = Math.max(h.attackCd, charge.stagger);
            }
        }

        if (charge.shatter && destructibles) {
            // A spin breaks what is around it; a thrust breaks what is in
            // front of it. Same rule as the ordinary swing, same offset.
            const px = this.rig.position.x + (charge.radial ? 0 : fv.x * charge.range * 0.5);
            const pz = this.rig.position.z + (charge.radial ? 0 : fv.z * charge.range * 0.5);
            const py = this.rig.position.y + 0.5;
            for (const d of destructibles) {
                if (!d || !d.shatterAtWorld || d.struckByAnything) continue;
                const n = d.shatterAtWorld(px, py, pz, charge.shatterRadius || 3);
                if (n > 0) {
                    vsfx.shatter();
                    this.onShatter?.(d, n);
                }
            }
        }
        // A charged move sets off a switch whatever it is charged with — a
        // radial one from where the player stands, a lane one down its length.
        // A radial move is sampled at the player, not ahead of them — a spin
        // that reached forward only would be a spin that could not set off the
        // switch it just swept through behind your back.
        if (charge.radial) this._strike(destructibles, 0, charge.range);
        else this._strike(destructibles, charge.range, charge.depthTolerance + 0.6);
        this.onChargeStrike?.(charge, hits);
        return hits;
    }

    /**
     * Phase C — the dash-attack.
     *
     * Attacking mid-dash converts the dash into a committed lunge. Before this,
     * dash was purely defensive: the i-frame window was the entire product, and
     * against anything that shoots there was no way to spend a dash offensively
     * at all. The lunge is the gap-closer, and it costs the rest of the dash —
     * you are pointed one way for its whole length and cannot turn out of it.
     */
    tryDashAttack(enemies) {
        if (this.dashTimer <= 0 || this.health.dead) return false;
        const weapon = getWeapon(this.inventory.activeWeapon);
        const fv = this.state.facingVec;
        this.physics.applyImpulse(fv.x * DASH_ATTACK.impulse, 0, fv.z * DASH_ATTACK.impulse);
        this.dashTimer += DASH_ATTACK.extend;
        this.dashAttackT = DASH_ATTACK.active;
        this._dashAttackHit = new Set();
        this.attackCd = (weapon.cooldown || 0.3) + DASH_ATTACK.recover;
        gsfx.attack(this.inventory.activeWeapon);
        this.arcSmear.spawn({
            position: this.rig.position,
            facingVec: fv,
            radius: (weapon.range || 1.8) * 1.2,
            color: weapon.smearColor || 0x7fe0ff,
            arc: 0.7,
        });
        this.animator?.attack(this.inventory.activeWeapon, {
            windup: 0.03,
            strikeDur: DASH_ATTACK.active,
            recover: DASH_ATTACK.recover,
        });
        return true;
    }

    /**
     * The lunging body is lethal for as long as it is lunging, and each thing it
     * runs through is hit ONCE. Without the set a lunge would tick damage every
     * frame it overlapped, which at 60fps is roughly twelve hits — the move
     * would not be a gap-closer, it would be the best attack in the game.
     */
    _tickDashAttack(dt, enemies, destructibles) {
        if (this.dashAttackT <= 0) return [];
        this.dashAttackT -= dt;
        const expired = this.dashAttackT <= 0;
        // The lunge's body is lethal, and it is a body — sampled where it is,
        // not in front of itself.
        this._strike(destructibles, 0, DASH_ATTACK.radius);
        if (!enemies || !enemies.length) {
            if (expired) { this.dashAttackT = 0; this._dashAttackHit = null; }
            return [];
        }
        const weapon = getWeapon(this.inventory.activeWeapon);
        const move = {
            damage: (weapon.damage != null ? weapon.damage : 1) * DASH_ATTACK.damageMult,
            knockback: weapon.knockback || 2,
            radial: true,
            range: DASH_ATTACK.radius,
            depthTolerance: DASH_ATTACK.radius,
            vertical: 1.4,
        };
        const landed = [];
        for (const e of combatSweep(this, enemies, move)) {
            if (this._dashAttackHit.has(e)) continue;
            this._dashAttackHit.add(e);
            applyHit(e, move, this);
            landed.push(e);
        }
        if (expired) {
            this.dashAttackT = 0;
            this._dashAttackHit = null;
        }
        return landed;
    }

    tryDash() {
        if (this.dashCd > 0 || this.health.dead) return false;
        const ownsBoot = this.inventory.hasItem('phase_boot') || this.inventory.items.phase_boot;
        const boot = PHASE_BOOT;
        // Without Phase Boot: short hop only (not full gap-cross dash)
        const power = ownsBoot ? boot.dashSpeed : boot.dashSpeed * 0.45;
        const dur = ownsBoot ? boot.dashDuration : boot.dashDuration * 0.6;
        const fv = this.state.facingVec;
        this.physics.applyImpulse(fv.x * power, 0, fv.z * power);
        this.dashTimer = dur;
        this.dashCd = ownsBoot ? boot.cooldown : boot.cooldown * 1.2;
        // C3: Ghost-step upgrade extends dash i-frames.
        // Floor the window at 0.3s: the raw dash is 0.14s (0.084s before the
        // Phase Boot), which is shorter than a reaction and made dashing
        // useless as a defensive option — there was effectively no way to
        // avoid a hit once it was coming.
        const iWindow = Math.max(0.3, dur + 0.05) + (this.dashIframeBonus || 0);
        this.health.iFrames = Math.max(this.health.iFrames, iWindow);
        gsfx.dash();
        this.arcSmear.spawn({
            position: this.rig.position,
            facingVec: fv,
            radius: ownsBoot ? 2 : 1.2,
            color: boot.smearColor,
        });
        return true;
    }

    update(dt, input, enemies, destructibles, camera, renderer) {
        // Damage lands from enemy/boss updates elsewhere in the frame; a
        // drop since last frame drives the hurt flinch layer.
        if (this._lastHp != null && this.health.hp < this._lastHp) {
            this.animator?.hit();
        }
        // Hazard slow is LATCHED and cleared here, once, at the top of the
        // frame. Everything that slows the player (boss patches, the Weaver's
        // strands) accumulates into `hazardSlow` with a max during its own
        // update; the player consumes last frame's total and resets the field
        // so nothing has to know when to clear it. Without the reset, walking
        // out of a web in a room with no boss in it left the player slowed for
        // the rest of the game — nothing else would ever have written a zero.
        this._hazardSlow = this.hazardSlow || 0;
        this.hazardSlow = 0;
        this.health.update(dt);
        this.arcSmear.update(dt);
        if (this.attackCd > 0) this.attackCd -= dt;
        if (this.dashCd > 0) this.dashCd -= dt;

        // Z4: resolve the lock first — the facing it produces has to be in hand
        // before movement writes facing, and dropping a dead target must not
        // wait a frame or the guard would cover the wrong arc.
        if (input.consumeLockToggle?.()) {
            this.lockOn.toggle(this.rig.position, this.state.facingVec);
            if (this.lockOn.target) gsfx.lockOn(); else gsfx.lockOff();
        }
        if (input.consumeLockCycle?.()) {
            this.lockOn.cycle(this.rig.position, this.state.facingVec);
            if (this.lockOn.target) gsfx.lockOn();
        }
        const lockFacing = this.health.dead ? null : this.lockOn.update(this.rig.position);
        if (this.health.dead) this.lockOn.release();

        // Z3: guard state for this frame. Dashing drops the shield — the two
        // defensive options stay mutually exclusive so neither is strictly
        // dominant, and i-frames cannot be stacked on top of chip reduction.
        const wantGuard = !!input.guardHeld?.() && this.dashTimer <= 0 && !this.health.dead;
        // You cannot raise what you do not have. The Bulwark Shield is found on
        // the predecessor's body in Beat 01, whose whole theme is reading a
        // wind-up — so the rooms before it teach the dodge, and the shield
        // arrives as a SECOND answer to a question you already know.
        this.guard.hasShield = this.inventory.hasItem('bulwark_shield');
        const wasRaised = this.guard.raised;
        const wasBroken = this.guard.broken;
        this.guard.update(dt, wantGuard);
        if (this.guard.raised !== wasRaised) {
            if (this.guard.raised) gsfx.guardUp(); else gsfx.guardDown();
        }
        if (this.guard.broken && !wasBroken) gsfx.guardBreak();
        if (wantGuard && !this.guard.hasShield) {
            coach('guard-unarmed',
                'Nothing to block with yet — read the ring and walk out of it.');
        }

        // Phase C. Both run before movement, because both can take movement
        // away: a committed charge pins the body, and a lunge owns the heading.
        this._updateCharge(dt, input, enemies, destructibles);
        this._tickDashAttack(dt, enemies, destructibles);

        // Keep the hands matched to the inventory. Cheap — both are a no-op
        // unless what the player owns actually changed.
        this.heldWeapon.set(this.inventory.activeWeapon);
        this.heldShield.set(this.guard.hasShield);

        // Grapple override
        const g = this.grapple.update(dt, this.collisionWorld, 0.4);
        this.grappleRope.update(dt, this.grapple.active ? {
            from: this.grapple.from,
            to: this.grapple.to,
            u: Math.min(1, this.grapple.t / this.grapple.duration),
        } : null);
        if (g.active || g.cancelled) {
            if (g.x != null) {
                this.rig.position.x = g.x;
                this.rig.position.z = g.z;
                if (g.y != null) this.rig.position.y = g.y;
            }
            this.physics.resetVelocity();
        } else {
            // A committed charge does not walk. The wish vector is zeroed
            // rather than the speed, so facing stops updating too — the strike
            // resolves along the heading you released on, which is the heading
            // the smear was about to be drawn along.
            const mv = this.chargeStrike ? { x: 0, z: 0 } : input.moveVector();
            // A Link to the Past facing model: you face where you walk, and
            // standing still keeps your last facing. Mouse aim used to
            // overwrite this every single frame, so the keyboard never
            // actually controlled which way you were pointing — you swung
            // wherever the cursor happened to sit. It is gone; the pad's
            // right stick is the only optional aim override.
            if (mv.x || mv.z) this.state.setFacing(mv.x, mv.z);
            if (input.padAim) this.state.setFacing(input.padAim.x, input.padAim.z);
            // Z4: a lock outranks both. This is the whole point — facing stops
            // being a side effect of walking, so you can strafe and retreat
            // while still pointed at what you are fighting.
            if (lockFacing) this.state.setFacing(lockFacing.x, lockFacing.z);

            const result = this.physics.update(this.collisionWorld, dt, {
                wishX: mv.x,
                wishZ: mv.z,
                // `hazardSlow` is written by boss hazard patches (BossBase
                // `spawnPatch`) and read HERE, so the player still owns its own
                // speed and a boss never reaches into it. A dash ignores it on
                // purpose: dashing out of a web or a slick is the answer to
                // being in one, and a slow that also slowed the escape would
                // just be damage with extra steps.
                speed: this.dashTimer > 0 ? 14
                    : this.speed
                        * (this.guard.raised ? GUARD_SPEED_MULT : 1)
                        * (1 - Math.min(0.75, this._hazardSlow || 0))
                        // Winding a charge slows you. That is the tell: an
                        // opponent can see a hero walking wrong, the same way
                        // the hero reads a boss planting its feet.
                        * (this.chargeT > 0 ? CHARGE_MOVE_MULT : 1),
                half: 0.4,
            });
            if (this.dashTimer > 0) this.dashTimer -= dt;

            if (result.landed) {
                gsfx.land();
                if (result.damage > 0) {
                    this.health.damage(result.damage, 0.5, 'environment');
                    vsfx.hurt();
                }
            }

            // Footsteps
            if (this.physics.grounded && (mv.x || mv.z)) {
                this._stepAcc += dt;
                if (this._stepAcc > 0.32) {
                    this._stepAcc = 0;
                    gsfx.footstep(this.surface || 'stone');
                }
            }
        }

        // Visual facing
        const fv = this.state.facingVec;
        this.rig.rotation.y = Math.atan2(fv.x, fv.z);

        // Blink when i-frames
        if (this.health.iFrames > 0) {
            this.rig.visible = Math.floor(this.health.iFrames * 20) % 2 === 0;
        } else {
            this.rig.visible = true;
        }

        // Two different things happen to a press here, and the difference is
        // the whole point.
        //
        // A broken guard is the PUNISHMENT for turtling: for BREAK_STUN seconds
        // you cannot swing, dash, or re-raise. Those inputs are drained and
        // thrown away, so they cannot queue up and all fire the instant the
        // stun ends — buffering a punishment deletes the punishment.
        //
        // A cooldown is not a punishment, it is a rhythm. A press that lands a
        // few frames before the swing is ready is the player asking correctly,
        // slightly early. That press is left ON RECORD (we do not consume while
        // the gate is shut) and fires the moment the cooldown expires, up to
        // INPUT_BUFFER later. Consuming unconditionally — which this used to do
        // — read the press, found the gate shut, and silently binned it.
        //
        // A committed charge drains both for the same reason a guard break
        // does: it is a commitment the player chose, and honouring presses made
        // during it would let them cancel out of their own wind-up.
        if (this.guard.broken || this.chargeStrike) {
            input.consumeAttack();
            input.consumeDash();
        } else {
            if (this.attackCd <= 0 && input.consumeAttack(INPUT_BUFFER)) {
                // Mid-dash, the same press means something else. Phase C's
                // second half: the dash gets an offensive spend.
                if (this.dashTimer > 0) this.tryDashAttack(enemies);
                else this.tryAttack(enemies, destructibles);
            }
            if (this.dashCd <= 0 && input.consumeDash(INPUT_BUFFER)) this.tryDash();
        }

        const wc = input.consumeWeaponCycle();
        if (wc) this.inventory.cycleWeapon(wc);

        if (this.health.dead) {
            this.state.current = 'DEAD';
        }

        // Ticket F: pose from the gameplay clock. The animator writes only
        // local pivot rotations — root position/yaw above stay physics-owned.
        if (this.animator) {
            const mv2 = (g.active || g.cancelled) ? null : input.moveVector();
            this.animator.setLocomotion({
                speed: this.dashTimer > 0 ? 14 : this.speed,
                wishX: mv2 ? mv2.x : 0,
                wishZ: mv2 ? mv2.z : 0,
                grounded: this.physics.grounded,
            });
            this.animator.setDashing(this.dashTimer > 0);
            this.animator.setGrapple(!!g.active);
            this.animator.setGuarding(this.guard.raised);
            this.animator.setDead(this.health.dead);
            this.animator.update(dt);
        }
        this._lastHp = this.health.hp;
    }

    dispose() {
        this.arcSmear.dispose();
        this.heldWeapon?.dispose();
        this.heldShield?.dispose();
        this.grappleRope?.dispose();
        if (this.rig.parent) this.rig.parent.remove(this.rig);
    }
}
