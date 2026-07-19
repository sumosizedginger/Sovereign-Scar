// Player construct — modular voxels, physics, combat.

import * as THREE from 'three';
import { buildTorso, buildHead, buildArm, buildLeg, buildGlowEyes, scaleProfile, TORSO_PROFILE, HEAD_PROFILE } from '../characters/builders.js';
import { buildVoxelGeo } from '../voxel/core.js';
import { S } from '../voxel/palette.js';
import { makeFacing } from '../combat/facing.js';
import { ArcSmear } from './fx/arc-smear.js';
import { sfx } from '../audio/synth.js';
import { vsfx } from './fx/vsfx.js';
import { HERO_PALETTE } from './assets/palettes.js';
import { VoxelPhysicsBody } from './physics/voxel-physics-body.js';
import { getProfile } from './physics/friction-profiles.js';
import { HealthPool } from './kernel/health.js';
import { Inventory } from './kernel/inventory.js';
import { getWeapon, PHASE_BOOT } from './combat/weapons.js';
import { combatSweep, applyHit } from './combat/combat-sweeper.js';
import { GrappleController } from './combat/grapple.js';

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

export class Player {
    constructor(scene, collisionWorld, getVoxelAt) {
        this.scene = scene;
        this.collisionWorld = collisionWorld;

        const pal = HERO_PALETTE;
        const slim = scaleProfile(TORSO_PROFILE, 0.72);
        const slimHead = scaleProfile(HEAD_PROFILE, 0.9);
        const parts = [
            [buildTorso(pal, slim, { clothingMode: 'casual' }), [0, 0, 0]],
            [buildHead(pal, slimHead, {}), [0, 24, 0]],
            [buildArm(pal, 1), [12, 15, 0]],
            [buildArm(pal, -1), [-12, 15, 0]],
            [buildLeg(pal, 1), [5, 0, 0]],
            [buildLeg(pal, -1), [-5, 0, 0]],
        ];
        const scale = S * 0.39;
        this.rig = new THREE.Group();
        const inner = buildFigure(parts, scale);

        // Glow eyes (emissive bloom) — added to inner so the grounding shift applies
        try {
            const eyes = buildGlowEyes(pal);
            const eyeScale = scale;
            eyes.left.scale.setScalar(eyeScale);
            eyes.right.scale.setScalar(eyeScale);
            eyes.left.position.set(-2.5 * eyeScale, 6 * eyeScale + 24 * scale, 5.5 * eyeScale);
            eyes.right.position.set(2.5 * eyeScale, 6 * eyeScale + 24 * scale, 5.5 * eyeScale);
            inner.add(eyes.left, eyes.right);
            this._eyes = eyes;
        } catch (_) { /* optional */ }

        // Ground the mesh: feet must rest at the physics body's bottom face
        // (rig.position.y - 0.95, see VoxelPhysicsBody halfExtents below).
        const bbox = new THREE.Box3().setFromObject(inner);
        inner.position.y = -0.95 - bbox.min.y;
        this.rig.add(inner);
        this._inner = inner;
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
        this.arcSmear = new ArcSmear(scene); // C8: true 8-way swing arcs
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
    }

    tryAttack(enemies, destructibles, opts = {}) {
        if (this.attackCd > 0 || this.health.dead) return [];
        const weapon = getWeapon(this.inventory.activeWeapon);
        if (weapon.ray) {
            // Light Caster ray — handled by caller with LightLineSystem ideally
            this.attackCd = weapon.cooldown;
            sfx.whoosh();
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
        vsfx.slap();
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
        sfx.dash();
        this.arcSmear.spawn({
            position: this.rig.position,
            facingVec: fv,
            radius: ownsBoot ? 2 : 1.2,
            color: boot.smearColor,
        });
        return true;
    }

    update(dt, input, enemies, destructibles, camera, renderer) {
        this.health.update(dt);
        this.arcSmear.update(dt);
        if (this.attackCd > 0) this.attackCd -= dt;
        if (this.dashCd > 0) this.dashCd -= dt;

        // Grapple override
        const g = this.grapple.update(dt, this.collisionWorld, 0.4);
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

            const result = this.physics.update(this.collisionWorld, dt, {
                wishX: mv.x,
                wishZ: mv.z,
                speed: this.dashTimer > 0 ? 14 : this.speed,
                half: 0.4,
            });
            if (this.dashTimer > 0) this.dashTimer -= dt;

            if (result.landed) {
                sfx.land();
                if (result.damage > 0) {
                    this.health.damage(result.damage, 0.5);
                    vsfx.hurt();
                }
            }

            // Footsteps
            if (this.physics.grounded && (mv.x || mv.z)) {
                this._stepAcc += dt;
                if (this._stepAcc > 0.32) {
                    this._stepAcc = 0;
                    vsfx.step();
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

        if (input.consumeAttack()) this.tryAttack(enemies, destructibles);
        if (input.consumeDash()) this.tryDash();

        const wc = input.consumeWeaponCycle();
        if (wc) this.inventory.cycleWeapon(wc);

        if (this.health.dead) {
            this.state.current = 'DEAD';
        }
    }

    dispose() {
        this.arcSmear.dispose();
        if (this.rig.parent) this.rig.parent.remove(this.rig);
    }
}
