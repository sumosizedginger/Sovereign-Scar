// Beat 04 — Kinetic Core: bouncing spiked sphere with multi-phase enrage.

import * as THREE from 'three';
import { BossBase, bounceArena } from './base.js';
import { sfx } from '../../audio/synth.js';

export class KineticCore extends BossBase {
    constructor(scene, collisionWorld, center, opts = {}) {
        // Bright enough to read on the raised corona plate under top-down cam.
        // Dark slate + low emissive used to vanish into floor/bloom.
        const mesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.95, 1),
            new THREE.MeshStandardMaterial({
                color: 0x8a96a8,
                metalness: 0.55,
                roughness: 0.32,
                emissive: 0x305070,
                emissiveIntensity: 1.15,
            })
        );
        mesh.castShadow = true;
        const weak = new THREE.Mesh(
            new THREE.SphereGeometry(0.32, 10, 10),
            new THREE.MeshStandardMaterial({
                color: 0xffe080,
                emissive: 0xffd060,
                emissiveIntensity: 2.4,
            })
        );
        weak.position.set(0, -0.78, 0);
        mesh.add(weak);

        // Corona plate tops at y≈2 (y=1 voxel). Hover centre above the plate so
        // the sphere never sinks into geometry mid-bob (looked like “disappearing”).
        const hoverY = opts.hoverY != null ? opts.hoverY : 2.95;

        super(scene, {
            id: 'kinetic_core',
            name: 'Kinetic Core',
            hp: opts.hp || 12,
            hitRadius: 0.95,
            contactDamage: 1,
            contactRadius: 1.45,
            position: { x: center.x, y: hoverY, z: center.z },
            mesh,
            phaseThresholds: [0.55, 0.28],
            floorY: opts.floorY != null ? opts.floorY : 2.0,
        });
        this.collisionWorld = collisionWorld;
        this.center = center;
        this.radius = opts.arenaRadius || 8;
        this.hoverY = hoverY;
        this.weak = weak;
        this.vx = 4.5;
        this.vz = 3.2;
        this.splits = [];
        // Always draw — canHit/shielded are combat gates, not visibility.
        this.root.visible = true;
        mesh.visible = true;
    }

    onPhaseChange(phase) {
        // Speed enrage + optional split orbs
        this.vx *= 1.25;
        this.vz *= 1.25;
        this.contactDamage = phase;
        if (phase === 3 && this.splits.length === 0) {
            for (let i = 0; i < 2; i++) {
                const m = new THREE.Mesh(
                    new THREE.IcosahedronGeometry(0.5, 0),
                    new THREE.MeshStandardMaterial({
                        color: 0xa0a8b8,
                        metalness: 0.55,
                        emissive: 0xff5520,
                        emissiveIntensity: 1.6,
                    })
                );
                m.position.copy(this.root.position);
                m.position.y = this.hoverY;
                this.scene.add(m);
                this.splits.push({
                    mesh: m,
                    vx: (i === 0 ? 1 : -1) * 5,
                    vz: (i === 0 ? -1 : 1) * 4,
                });
            }
        }
    }

    tickAI(dt, player) {
        // Keep the mesh drawn even if a system toggled it.
        if (this.root) this.root.visible = true;

        // ── Ricochet, then charge ───────────────────────────────────────────
        // The Core bounces the arena as its resting pattern, but on a timer it
        // stops dead, sights down the line to the player and rams along it,
        // burying itself in the far wall. The wall stuns it: that is the
        // opening, and it is the only one that does not depend on catching the
        // bob at the right instant.
        if (this.busy) {
            const a = this.action;
            if (a.stage === 'windup') {
                this.root.rotation.x += dt * 18; // spinning up in place
                this.root.position.y = this.hoverY;
            } else {
                // Travel the charge over the first slice of the recovery
                // instead of teleporting to the wall.
                if (this._dash) {
                    const dsh = this._dash;
                    const step = Math.min(dsh.left, 26 * dt);
                    this.root.position.x += dsh.dir.x * step;
                    this.root.position.z += dsh.dir.z * step;
                    dsh.left -= step;
                    this.root.rotation.x += dt * 24;
                    this.root.position.y = this.hoverY;
                    if (player && !player.health?.dead && !dsh.hit) {
                        if (Math.hypot(
                            player.root.position.x - this.root.position.x,
                            player.root.position.z - this.root.position.z
                        ) < 1.6) {
                            this.hitPlayer(player, this.phase >= 2 ? 2 : 1, 0.4);
                            dsh.hit = true;
                        }
                    }
                    if (dsh.left <= 0) {
                        this._dash = null;
                        sfx.stomp();
                        const pos = { x: this.root.position.x, z: this.root.position.z };
                        bounceArena(pos, { x: 0, z: 0 }, this.center, this.radius);
                        this.root.position.x = pos.x;
                        this.root.position.z = pos.z;
                    }
                    return;
                }
                // Slump against the wall — stay above the plate, don't sink.
                this.root.position.y = this.hoverY - 0.2;
                this.canHit = true;
                this.shielded = false;
                if (this.weak) this.weak.material.emissiveIntensity = 3.4;
            }
            return;
        }
        if (player && this.actionCd <= 0) {
            const dx = player.root.position.x - this.root.position.x;
            const dz = player.root.position.z - this.root.position.z;
            const n = Math.hypot(dx, dz) || 1;
            const dir = { x: dx / n, z: dz / n };
            this.startAction({
                name: 'charge',
                windup: 0.8,
                recover: this.phase >= 3 ? 1.0 : 1.5,
                cooldown: this.phase >= 3 ? 1.6 : 2.6,
                aim: () => ({
                    x: this.root.position.x, z: this.root.position.z,
                    radius: this.radius * 2, shape: 'line', dir, width: 2.0,
                    color: 0xffa040,
                }),
                onWindup: () => { sfx.whoosh(); },
                strike: () => {
                    this._dash = { dir, left: this.radius * 1.8, hit: false };
                    this.root.position.y = this.hoverY;
                    const spd = Math.hypot(this.vx, this.vz) || 5;
                    const ang = Math.atan2(-dir.z, -dir.x) + (Math.random() - 0.5);
                    this.vx = Math.cos(ang) * spd;
                    this.vz = Math.sin(ang) * spd;
                },
                onRecover: () => { this.root.position.y = this.hoverY; },
            });
            return;
        }
        let nx = this.root.position.x + this.vx * dt;
        let nz = this.root.position.z + this.vz * dt;
        const vel = { x: this.vx, z: this.vz };
        const pos = { x: nx, z: nz };
        if (bounceArena(pos, vel, this.center, this.radius)) sfx.block();
        this.vx = vel.x;
        this.vz = vel.z;
        this.root.position.x = pos.x;
        this.root.position.z = pos.z;
        this.root.rotation.x += dt * (3 + this.phase);
        this.root.rotation.z += dt * (2.2 + this.phase * 0.4);
        // Bob around hover height (never below the arena plate top).
        const bob = Math.sin(this.t * 4) * (0.28 + this.phase * 0.04);
        this.root.position.y = this.hoverY + bob;
        // Weak window when bob is high (underside readable from top-down)
        this.canHit = bob > 0.1 || this.phase >= 3;
        this.shielded = !this.canHit;
        if (this.weak) {
            this.weak.material.emissiveIntensity = this.canHit ? 3.0 : 1.2;
        }

        for (const s of this.splits) {
            s.mesh.position.x += s.vx * dt;
            s.mesh.position.z += s.vz * dt;
            const p = { x: s.mesh.position.x, z: s.mesh.position.z };
            const v = { x: s.vx, z: s.vz };
            bounceArena(p, v, this.center, this.radius);
            s.vx = v.x; s.vz = v.z;
            s.mesh.position.x = p.x; s.mesh.position.z = p.z;
            s.mesh.position.y = this.hoverY - 0.15;
            s.mesh.visible = true;
            s.mesh.rotation.x += dt * 5;
            if (player && !player.health?.dead) {
                if (Math.hypot(
                    player.root.position.x - p.x,
                    player.root.position.z - p.z
                ) < 1.0) {
                    this.hitPlayer(player, 1, 0.7);
                }
            }
        }
    }

    dispose() {
        for (const s of this.splits) {
            if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
            s.mesh.geometry.dispose();
            s.mesh.material.dispose();
        }
        super.dispose();
    }
}
