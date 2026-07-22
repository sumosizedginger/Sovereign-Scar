// Player construct — modular voxels, physics, combat.

import { createActorRig } from './characters/actor-rig.js';
import { createActorAnimator } from './characters/actor-animator.js';
import { makeFacing } from '../combat/facing.js';
import { ArcSmear } from './fx/arc-smear.js';
import { juice } from './fx/juice.js';
import { vsfx } from './fx/vsfx.js';
import { gsfx } from './audio/sfx-bank.js';
import { HeldWeapon } from './fx/held-weapon.js';
import { GrappleRope } from './fx/grapple-rope.js';
import { HERO_PALETTE } from './assets/palettes.js';
import { VoxelPhysicsBody } from './physics/voxel-physics-body.js';
import { getProfile } from './physics/friction-profiles.js';
import { HealthPool } from './kernel/health.js';
import { Inventory } from './kernel/inventory.js';
import { getWeapon, PHASE_BOOT } from './combat/weapons.js';
import { combatSweep, applyHit } from './combat/combat-sweeper.js';
import { GrappleController } from './combat/grapple.js';
import { GuardController, GUARD_SPEED_MULT } from './combat/guard.js';
import { LockOnController } from './combat/lock-on.js';

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
        this.grapple = new GrappleController();
        // The hero used to swing an empty fist with every weapon, and the
        // grapple had no visuals at all — press G and you were simply
        // somewhere else. Both are legibility problems, not decoration:
        // weapon reach and arc differ enough that you have to be able to see
        // what you are holding.
        this.heldWeapon = new HeldWeapon(this.rig);
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
        this.guard.onBlock = () => { gsfx.guardBlock(); juice.addTrauma(0.12); };
        this.guard.onBreak = () => { vsfx.hurt(); juice.addTrauma(0.5); };

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
            for (const e of enemies) {
                if (!e || e.state?.current === 'DEAD') continue;
                if (e.canHit === false || e.shielded) continue;
                const ox = e.root.position.x - this.rig.position.x;
                const oz = e.root.position.z - this.rig.position.z;
                const fv = this.state.facingVec;
                const forward = ox * fv.x + oz * fv.z;
                const lateral = Math.abs(-ox * fv.z + oz * fv.x);
                if (forward > 0 && forward < range && lateral < 0.7 + (e.hitRadius || 0)) {
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
                if (d && d.shatterAtWorld) {
                    const n = d.shatterAtWorld(px, py, pz, weapon.shatterRadius || 3);
                    if (n > 0) vsfx.shatter();
                }
            }
        }
        return hits;
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
        const wasRaised = this.guard.raised;
        const wasBroken = this.guard.broken;
        this.guard.update(dt, wantGuard);
        if (this.guard.raised !== wasRaised) {
            if (this.guard.raised) gsfx.guardUp(); else gsfx.guardDown();
        }
        if (this.guard.broken && !wasBroken) gsfx.guardBreak();

        // Keep the hand matched to the inventory. Cheap — a no-op unless the
        // equipped id actually changed.
        this.heldWeapon.set(this.inventory.activeWeapon);

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
            const mv = input.moveVector();
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
                speed: this.dashTimer > 0 ? 14
                    : this.speed * (this.guard.raised ? GUARD_SPEED_MULT : 1),
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

        // A broken guard is the punishment for turtling: for BREAK_STUN seconds
        // you cannot swing, dash, or re-raise. The inputs are still drained so
        // they do not queue up and all fire the instant the stun ends.
        const attackPressed = input.consumeAttack();
        const dashPressed = input.consumeDash();
        if (!this.guard.broken) {
            if (attackPressed) this.tryAttack(enemies, destructibles);
            if (dashPressed) this.tryDash();
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
            this.animator.setDead(this.health.dead);
            this.animator.update(dt);
        }
        this._lastHp = this.health.hp;
    }

    dispose() {
        this.arcSmear.dispose();
        this.heldWeapon?.dispose();
        this.grappleRope?.dispose();
        if (this.rig.parent) this.rig.parent.remove(this.rig);
    }
}
