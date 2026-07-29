// Beat 04 — Kinetic Core: bouncing spiked sphere with multi-phase enrage.

import * as THREE from 'three';
import { BossBase, bounceArena, BOSS_EMISSIVE_MAX } from './base.js';
import { sfx } from '../../audio/synth.js';
import { voxBlob, voxSphere } from './boss-models.js';

// SHOCKRING — the wall bounce, made into a rhythm.
//
// The Core ricochets off the arena walls constantly, and that ricochet was pure
// background motion: it changed where the boss would be and never asked the
// player for anything. Now each bounce throws a low ring outward from the point
// of impact, so the corner you were about to retreat into becomes a place with
// a timer on it.
//
// This is a SHOCKWAVE, not a telegraph, and the distinction is the reason it is
// allowed to expand while every telegraph in this game holds still. A telegraph
// is a promise about where damage WILL be, so it may not move; a shockwave is
// the damage itself, and the ring you can see is exactly the ring that hits.
// The band is thin and travels fast: you step over it or you get clipped.
export const SHOCK_SPEED = 7.0;
export const SHOCK_MAX_R = 5.5;
export const SHOCK_BAND = 0.7;
export const SHOCK_COOLDOWN = 1.1;

// How often the Core can shed a fresh pair of orbs in phase 3. Long enough that
// the pair on the floor is the pair you are dealing with, short enough that
// clearing the arena is never a permanent state.
export const FISSION_CD = 6.0;

export class KineticCore extends BossBase {
    constructor(scene, collisionWorld, center, opts = {}) {
        // Bright enough to read on the raised corona plate under top-down cam.
        // Dark slate + low emissive used to vanish into floor/bloom.
        const mesh = voxBlob(0.95, 0.95, 0.95, 0x8a96a8, 0x305070, 0.55,
            { metalness: 0.55, roughness: 0.32 });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const weak = voxSphere(0.32, 0xffe080, 0xffd060, 0.55);
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

    /**
     * The half-extent the Core actually bounces off.
     *
     * **Its ricochet had never once fired.** `bounceArena` is a box of
     * half-extent `this.radius` (default 8), and `BossBase._clampToArena` pins
     * the body to `arenaRadius` (default 7.5) at the END of every update — so
     * the Core could never reach the boundary that would turn it around.
     * Measured: from the centre it drifts to (7.5, 7.5) in five seconds and
     * **sits in that corner for the rest of the fight**, velocity unchanged,
     * pressing into a wall. The first line of this file calls it a "bouncing
     * spiked sphere". It bounced zero times.
     *
     * Nothing caught it because nothing was looking: the boss was still alive,
     * still lethal on contact, still charged on its cooldown, and the fight
     * still ended. It was just standing in a corner while it did.
     *
     * Derived rather than authored, and derived from the clamp, so a level that
     * passes its own `arenaRadius` cannot re-open the gap.
     */
    get bounceR() {
        const clamp = this.arenaRadius != null ? this.arenaRadius : this.radius;
        return Math.max(1, Math.min(this.radius, clamp - 0.35));
    }

    onPhaseChange(phase) {
        // Speed enrage + optional split orbs
        this.vx *= 1.25;
        this.vz *= 1.25;
        this.contactDamage = phase;
        // The split orbs used to appear HERE, silently, once, on entering
        // phase 3 — no wind-up, no marked ground, and no replacement when the
        // arena settled down. They were a one-off difficulty step disguised as
        // a mechanic. They are `fission` now: a real staged action the Core
        // takes on a cooldown, so the orbs keep coming and the arena stays
        // live. See `_fission`.
        if (phase === 3) this.actionCd = Math.min(this.actionCd, 0.6);
    }

    /**
     * FISSION — phase 3. The Core sheds two orbs that bounce the arena.
     *
     * Telegraphed, unlike the silent spawn it replaces: a disc at the Core's
     * own feet, because the orbs burst outward FROM it and standing on top of
     * the boss at that moment is the mistake being punished. Each cast clears
     * the previous pair, so the count never runs away.
     */
    _fission() {
        this.startAction({
            name: 'fission',
            windup: 0.7,
            recover: 0.9,
            cooldown: FISSION_CD,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: 2.4, color: 0xff8840,
            }),
            onWindup: () => { sfx.heave(); },
            strike: (p, aim) => {
                this._clearSplits();
                for (let i = 0; i < 2; i++) {
                    const m = voxBlob(0.5, 0.5, 0.5, 0xa0a8b8, 0xff5520, 0.55,
                        { metalness: 0.55 });
                    m.position.copy(this.root.position);
                    m.position.y = this.hoverY;
                    this.scene.add(m);
                    this.splits.push({
                        mesh: m,
                        vx: (i === 0 ? 1 : -1) * 5,
                        vz: (i === 0 ? -1 : 1) * 4,
                    });
                }
                sfx.shatter();
                if (p && this.inBlast(p, aim.x, aim.z, 2.4)) this.hitPlayer(p, 1, 0.6);
            },
        });
    }

    _clearSplits() {
        for (const s of this.splits) {
            if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
            s.mesh.geometry.dispose();
            s.mesh.material.dispose();
        }
        this.splits.length = 0;
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
                        bounceArena(pos, { x: 0, z: 0 }, this.center, this.bounceR);
                        this.root.position.x = pos.x;
                        this.root.position.z = pos.z;
                    }
                    return;
                }
                // Slump against the wall — stay above the plate, don't sink.
                this.root.position.y = this.hoverY - 0.2;
                this.canHit = true;
                this.shielded = false;
                if (this.weak) this.weak.material.emissiveIntensity = BOSS_EMISSIVE_MAX;
            }
            return;
        }
        if (player && this.actionCd <= 0) {
            // Phase 3 mixes fission in. Not instead of the charge — the charge
            // is the move the fight is built on and the only one that opens the
            // slump window, so replacing it would remove the punish along with
            // the monotony.
            if (this.phase >= 3 && this._rand() < 0.35) { this._fission(); return; }
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
        if (bounceArena(pos, vel, this.center, this.bounceR)) {
            sfx.block();
            this._emitShock(pos.x, pos.z);
        }
        this._tickShocks(dt, player);
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
        // The spike the underside was always advertising. Measured before this
        // landed: the Core is reachable for 254 frames in 600 — 42% of the
        // fight — and every one of those hits paid a flat 1x. It has a genuine
        // timing test (reach it at the top of the bob) that rewarded nothing,
        // which is the one combination this game's rules are not supposed to
        // allow. One condition drives the light and the damage, so the sign
        // cannot start lying again.
        this.weakOpen = this.canHit;
        if (this.weak) {
            // The weak point is a "hit here" sign; it has to be brighter than
            // the body, not brighter than the frame.
            this.weak.material.emissiveIntensity =
                BOSS_EMISSIVE_MAX * (this.canHit ? 1 : 0.4);
        }

        for (const s of this.splits) {
            s.mesh.position.x += s.vx * dt;
            s.mesh.position.z += s.vz * dt;
            const p = { x: s.mesh.position.x, z: s.mesh.position.z };
            const v = { x: s.vx, z: s.vz };
            bounceArena(p, v, this.center, this.bounceR);
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

    /** Throw a ring outward from a wall impact. Rate-limited, phase-gated. */
    _emitShock(x, z) {
        if (this.phase < 2) return;              // phase 1 stays a pure read
        this._shockCd = (this._shockCd || 0);
        if (this._shockCd > 0) return;
        this._shockCd = SHOCK_COOLDOWN;
        const geo = new THREE.RingGeometry(0.9, 1.2, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff8840, transparent: true, opacity: 0.75,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, this.floorY + 0.06, z);
        this.scene.add(m);
        this._shocks = this._shocks || [];
        this._shocks.push({ mesh: m, x, z, r: 1.05, hit: false });
    }

    /**
     * Drive every live ring. The mesh is scaled from a unit-ish ring, so the
     * radius the player is tested against and the radius on the floor are the
     * same number by construction — the shockwave cannot drift from its own
     * picture the way this project's telegraphs have.
     */
    _tickShocks(dt, player) {
        if (!this._shocks || !this._shocks.length) {
            if (this._shockCd > 0) this._shockCd -= dt;
            return;
        }
        if (this._shockCd > 0) this._shockCd -= dt;
        for (let i = this._shocks.length - 1; i >= 0; i--) {
            const s = this._shocks[i];
            s.r += SHOCK_SPEED * dt;
            s.mesh.scale.setScalar(s.r / 1.05);
            s.mesh.material.opacity = 0.75 * (1 - s.r / SHOCK_MAX_R);
            if (!s.hit && player && !player.health?.dead) {
                const d = Math.hypot(
                    player.root.position.x - s.x,
                    player.root.position.z - s.z
                );
                // Inside the BAND, not inside the disc: the ring is a wave
                // passing over you, so standing still in the middle of one that
                // has already gone by is safe. That is what makes it a rhythm
                // instead of an expanding wall.
                if (Math.abs(d - s.r) <= SHOCK_BAND) {
                    this.hitPlayer(player, 1, 0.5);
                    s.hit = true;
                }
            }
            if (s.r >= SHOCK_MAX_R) {
                if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
                s.mesh.geometry.dispose();
                s.mesh.material.dispose();
                this._shocks.splice(i, 1);
            }
        }
    }

    _clearShocks() {
        for (const s of this._shocks || []) {
            if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
            s.mesh.geometry.dispose();
            s.mesh.material.dispose();
        }
        this._shocks = [];
    }

    dispose() {
        this._clearShocks();
        for (const s of this.splits) {
            if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
            s.mesh.geometry.dispose();
            s.mesh.material.dispose();
        }
        super.dispose();
    }
}
