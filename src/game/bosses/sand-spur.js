// Beat 03 — Sand Spur: a burrowing serpent that hunts the player by vibration.
//
// The fight is the dungeon's premise made playable: the Sink hunts vibration,
// so the Spur tracks you underground where you cannot hit it, and the only way
// to fight back is to make it commit. The loop:
//
//   HUNT    a sand mound crosses the floor toward you. You can outrun it, and
//           you can see exactly how much time you have.
//   ERUPT   it surfaces where you are standing. Ring, then the strike.
//   BEACHED it lands wrong, arched out of the sand and motionless. Weak point
//           lit, double damage, ~1.4s. This is the whole fight.
//   DIVE    back under, and the hunt starts again a little faster.
//
// It used to interpolate along four fixed corner points forever, never reading
// the player's position at all — the mound went where the mound went whether
// you were there or not, and its one telegraph resolved into nothing. There
// was no reason to move and no way to lose.

import * as THREE from 'three';
import { BossBase, bossHit, discMesh, BOSS_EMISSIVE_MAX } from './base.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { fillBox } from '../../voxel/helpers.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { sfx } from '../../audio/synth.js';
import { markShadowRoles } from '../render/shadow-roles.js';
import { voxBlob, voxBox, voxSphere } from './boss-models.js';

// The mound's own reach, and how often it can bite. 1.5 is the mound mesh's
// visible footprint — one number for the picture and the rule, so the thing you
// can see crossing the floor is exactly the thing that hurts.
export const WAKE_R = 1.5;
export const WAKE_CD = 1.0;

// BREACH: the radius the phase-3 sweep will cover, and how long the sweep runs.
// The telegraph is the WHOLE circle, drawn up front, because the damage rotates
// through it — a marker that rotated with the attack would be a telegraph that
// re-aims, which this project has now been bitten by twice. Drawing the entire
// swept area is an honest overstatement: everything inside it is at risk, and
// leaving it is the answer.
export const BREACH_R = 4.5;
export const BREACH_TIME = 1.6;
export const BREACH_HALF = Math.PI / 5;

export class SandSpur extends BossBase {
    constructor(scene, collisionWorld, particles, path = [], opts = {}) {
        const body = new THREE.Group();
        super(scene, {
            id: 'sand_spur',
            name: 'Sand Spur',
            hp: opts.hp || 14,
            hitRadius: 1.5,
            contactDamage: 1,
            contactRadius: 2.0,
            position: path[0] || { x: 0, z: 0 },
            mesh: body,
            phaseThresholds: [0.55, 0.3],
        });
        // The old fixed patrol is kept only as a fallback home: the arena
        // centre it used to circle is where the Spur now lurks between hunts.
        const pts = path.length ? path : [{ x: 0, z: 0 }];
        this.lair = {
            x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
            z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
        };
        this.speed = opts.speed || 3.4;
        this.segments = [];
        this.trail = [];
        const n = opts.segments || 6;
        for (let i = 0; i < n; i++) {
            const mesh = voxBox(
                0.9, 0.7, 0.9,
                i === 0 ? 0xc4a060 : 0x9a8b78,
                i === 0 ? 0x402010 : 0x000000,
                0.4,
                { roughness: 0.9 }
            );
            // S6 (P1-5): emerged silhouette must clear the mob bar (~2.1+)
            mesh.scale.setScalar(3.1);
            mesh.position.set(pts[0].x, 0.6, pts[0].z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            this.segments.push(mesh);
        }
        // Combat root tracks head
        this.root = this.segments[0];
        this.mesh = this.segments[0];
        this.home = { x: this.lair.x, z: this.lair.z };

        // The weak seam only lights while beached — it is the "hit here" sign.
        const weak = voxSphere(0.22, 0xffd060, 0xffd060, 0.4);
        weak.position.set(0, 0.42, 0);
        this.segments[0].add(weak);
        this.weak = weak;
        // Segments past the head are added straight to the scene rather than
        // under `root`, so BossBase's traverse never reaches them.
        for (const seg of this.segments) markShadowRoles(seg);
        markShadowRoles(this.mound);

        // The sand mound: the whole read while the Spur is underground.
        // A dome, not a cone: from a top-down camera a cone standing on its
        // base is a flat disc, and the mound is the entire read while the Spur
        // is underground.
        const mound = voxBlob(1.5, 0.75, 1.5, 0xc9b183, 0x000000, 0, { roughness: 1 });
        mound.visible = false;
        mound.castShadow = true;
        mound.receiveShadow = true;
        scene.add(mound);
        this.mound = mound;

        const burrow = new Map();
        fillBox(burrow, -2, 2, 0, 0, -2, 2, CRUST_COLORS.clayDark);
        this.burrow = new DestructibleVoxelMesh(
            burrow,
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
            particles,
            null,
            'sandspur',
            { origin: { x: this.root.position.x - 1.25, y: 0, z: this.root.position.z - 1.25 }, scene, voxelSize: 0.5 }
        );
        this.submerged = true;
        this.canHit = false;   // underground is untouchable, by design
        this.shielded = true;
        this.actionCd = 1.6;
    }

    /**
     * SAND-WAKE — the hunt, made a threat.
     *
     * The mound is the best tell in the game: it crosses the floor toward you,
     * at a speed you can see, and you can outrun it. And it did **nothing**.
     * The Spur tracked you underground where you could not hit it, and standing
     * directly in its path cost you exactly as much as standing anywhere else,
     * so the entire HUNT phase — most of the fight's running time — was a
     * countdown with no decisions in it.
     *
     * Now the mound itself is the hazard. It is already drawn, already moving
     * at a legible speed, and already pointed at you: it is a telegraph that
     * was carrying no threat, which is the opposite of this session's other
     * bug and just as bad. The radius is the mound's own, so the picture and
     * the rule are the same object.
     *
     * Deliberately cheap — one damage, a full second between bites, and only
     * while submerged. It is a reason to keep moving, not a second attack.
     */
    _wake(dt, player) {
        this._wakeCd = (this._wakeCd || 0) - dt;
        if (!this.submerged || !player || player.health?.dead) return;
        if (this._wakeCd > 0) return;
        const d = Math.hypot(
            player.root.position.x - this.root.position.x,
            player.root.position.z - this.root.position.z
        );
        if (d > WAKE_R) return;
        bossHit(player, 1, 0.7, this.root.position, this);
        this._wakeCd = WAKE_CD;
        sfx.grab();
    }

    onPhaseChange(phase) {
        // Faster hunts and a shorter beached window: the same loop, tighter.
        this.speed = 3.0 + phase * 0.9;
        this.contactDamage = phase >= 3 ? 2 : 1;
    }

    /**
     * BREACH — phase 3, and the one time you fight it above ground.
     *
     * It comes up on ITSELF rather than on you, and sweeps a full turn. The
     * telegraph is the whole circle it will cover, drawn once, up front: the
     * damage rotates through that circle over `BREACH_TIME`, and a marker that
     * rotated with it would be a telegraph that re-aims — the exact thing this
     * project has now been bitten by twice. Overstating the danger is the only
     * honest direction here, and it happens to be the right instruction too:
     * the answer is *leave the circle*, not *time the arm*.
     *
     * The plan calls this "breach-spin" and asks for a rotating cone. That is
     * what it is; the name is short because the sweep is the whole move.
     */
    _breach() {
        this.startAction({
            name: 'breach',
            windup: 0.8,
            recover: 1.4,
            cooldown: 2.4,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: BREACH_R, color: 0xc4a060,
            }),
            onWindup: () => { sfx.heave(); },
            strike: () => {
                // Surface and STAY up. Unlike `erupt`, this does not dive on
                // recovery — the arch is the fight for the next few seconds,
                // which is both the threat and the biggest opening in it.
                this.submerged = false;
                this.canHit = true;
                this.shielded = false;
                this._surfaceAt(this.root.position.x, this.root.position.z);
                this._spinT = BREACH_TIME;
                this._spinAng = Math.random() * Math.PI * 2;
                sfx.stomp();
            },
            onRecover: () => {
                this.submerged = true;
                this.canHit = false;
                this.shielded = true;
                sfx.whoosh();
            },
        });
    }

    /** Drive the breach sweep: one rotation, damaging what it passes over. */
    _spin(dt, player) {
        if (!(this._spinT > 0)) return;
        this._spinT -= dt;
        this._spinAng += (Math.PI * 2 / BREACH_TIME) * dt;
        if (!player || player.health?.dead) return;
        if (this._spinHitCd > 0) { this._spinHitCd -= dt; return; }
        const dir = { x: Math.cos(this._spinAng), z: Math.sin(this._spinAng) };
        if (this.inCone(player, this.root.position, dir, BREACH_R, BREACH_HALF)) {
            this.hitPlayer(player, 2, 0.6);
            // One bite per rotation at most. A sweep that connects every frame
            // it overlaps you is not a sweep, it is a wall.
            this._spinHitCd = BREACH_TIME * 0.5;
        }
    }

    /** Surface: erupt where the player stands, then lie beached and open. */
    _erupt(player) {
        const px = player.root.position.x;
        const pz = player.root.position.z;
        this.startAction({
            name: 'erupt',
            windup: this.phase >= 3 ? 0.5 : 0.7,
            recover: this.phase >= 3 ? 1.1 : 1.5,
            cooldown: 0.4,
            aim: () => ({ x: px, z: pz, radius: 2.6, color: 0xc4a060 }),
            onWindup: () => { sfx.heave(); },
            strike: (p, aim) => {
                // Surface at the marked spot whether or not it connects — the
                // Spur beaching itself in the wrong place is the player's win.
                this.submerged = false;
                this.canHit = true;
                this.shielded = false;
                this._surfaceAt(aim.x, aim.z);
                sfx.stomp();
                if (this.inBlast(p, aim.x, aim.z, 2.6)) {
                    this.hitPlayer(p, this.phase >= 3 ? 2 : 1, 0.5);
                }
            },
            onRecover: () => {
                // Dive back under and resume the hunt.
                this.submerged = true;
                this.canHit = false;
                this.shielded = true;
                sfx.whoosh();
            },
        });
    }

    _surfaceAt(x, z) {
        this.root.position.x = x;
        this.root.position.z = z;
        this.trail.length = 0;
        for (let i = 0; i < this.segments.length * 6; i++) this.trail.push({ x, z });
    }

    tickAI(dt, player) {
        // ── Hunt ────────────────────────────────────────────────────────────
        // Underground, the Spur walks straight at the player. This is the only
        // movement in the fight, and it is entirely a function of where the
        // player is standing.
        if (!this.busy) {
            const target = player ? player.root.position : this.lair;
            const dx = target.x - this.root.position.x;
            const dz = target.z - this.root.position.z;
            const d = Math.hypot(dx, dz) || 1;
            const step = Math.min(d, this.speed * dt);
            this.root.position.x += (dx / d) * step;
            this.root.position.z += (dz / d) * step;
            this._huntT = (this._huntT || 0) + dt;
            // Surface when it reaches the player, OR when the hunt has run
            // long enough. Requiring contact alone meant a player who simply
            // kept walking was never attacked and never given an opening —
            // the Spur would track them underground forever and the fight
            // would never resolve in either direction.
            const patience = this.phase >= 2 ? 2.6 : 3.6;
            if (player && this.actionCd <= 0 && (d < 1.6 || this._huntT > patience)) {
                this._huntT = 0;
                // Phase 3 mixes the breach in. Not every time: `erupt` is the
                // move the whole dungeon teaches, and a phase that replaces it
                // rather than adding to it would throw that away.
                if (this.phase >= 3 && this._rand() < 0.4) this._breach();
                else this._erupt(player);
            }
        }
        this._wake(dt, player);
        this._spin(dt, player);

        // Trail history — segments follow where the head has been.
        this.trail.unshift({ x: this.root.position.x, z: this.root.position.z });
        if (this.trail.length > this.segments.length * 6 + 2) this.trail.pop();

        const beached = this.staggered;
        for (let i = 0; i < this.segments.length; i++) {
            const s = this.segments[i];
            if (i > 0) {
                const sample = this.trail[Math.min(this.trail.length - 1, i * 5)];
                if (sample) { s.position.x = sample.x; s.position.z = sample.z; }
            }
            if (this.submerged) {
                s.position.y = -0.4;
                s.visible = false;
            } else if (beached) {
                // Arched out of the floor: a fat, still, hittable target.
                const arc = Math.sin((i / Math.max(1, this.segments.length - 1)) * Math.PI);
                s.position.y = 1.6 + arc * 1.4;
                s.visible = true;
            } else {
                s.position.y = 1.9 + Math.sin(this.t * 4 + i) * 0.15;
                s.visible = true;
            }
        }

        // Mound: visible only while hunting, and it is the honest tell.
        this.mound.visible = this.submerged;
        if (this.submerged) {
            this.mound.position.set(
                this.root.position.x,
                this.floorY + 0.35 + Math.sin(this.t * 8) * 0.08,
                this.root.position.z
            );
        }
        // The seam marks the window; it does not sweeten it. Beaching IS this
        // boss's recovery, so `vulnerableMult` is already 2 here — and stacking
        // the weak multiplier on top would make it 4x, which is not a mechanic,
        // it is the fight ending early (owner's call, 2026-07-27). `applyHit`
        // takes the max, so the number is unchanged and what the player gains
        // is a hit that SOUNDS different: the seam finally tells the truth
        // about a window that was always there.
        this.weakOpen = beached;
        if (this.weak) {
            this.weak.material.emissiveIntensity =
                BOSS_EMISSIVE_MAX * (beached ? 1 : 0.13);
        }

        if (this.burrow.mesh) {
            this.burrow.origin.x = this.root.position.x - 1.25;
            this.burrow.origin.z = this.root.position.z - 1.25;
            this.burrow.mesh.position.x = this.burrow.origin.x;
            this.burrow.mesh.position.z = this.burrow.origin.z;
            this.burrow.mesh.visible = !this.submerged;
        }

        const fv = {
            x: this.segments[0].position.x - (this.segments[1]?.position.x || 0),
            z: this.segments[0].position.z - (this.segments[1]?.position.z || 0),
        };
        this.state.facingVec = fv;
    }

    /** Contact only bites while it is actually out of the sand. */
    tryContact(player, dt) {
        if (this.submerged) return;
        super.tryContact(player, dt);
    }

    dispose() {
        for (const s of this.segments) {
            if (s.parent) s.parent.remove(s);
            s.geometry.dispose();
            s.material.dispose();
        }
        if (this.mound?.parent) this.mound.parent.remove(this.mound);
        this.mound?.geometry.dispose();
        this.mound?.material.dispose();
        this.burrow?.dispose();
        this.clearTelegraph();
        this._hideRecoverCue();
    }
}
