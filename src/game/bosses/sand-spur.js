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
import { BossBase } from './base.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { fillBox } from '../../voxel/helpers.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { sfx } from '../../audio/synth.js';

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
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.9, 0.7, 0.9),
                new THREE.MeshStandardMaterial({
                    color: i === 0 ? 0xc4a060 : 0x9a8b78,
                    roughness: 0.9,
                    emissive: i === 0 ? 0x402010 : 0x000000,
                    emissiveIntensity: 0.4,
                })
            );
            // S6 (P1-5): emerged silhouette must clear the mob bar (~2.1+)
            mesh.scale.setScalar(3.1);
            mesh.position.set(pts[0].x, 0.6, pts[0].z);
            mesh.castShadow = true;
            scene.add(mesh);
            this.segments.push(mesh);
        }
        // Combat root tracks head
        this.root = this.segments[0];
        this.mesh = this.segments[0];
        this.home = { x: this.lair.x, z: this.lair.z };

        // The weak seam only lights while beached — it is the "hit here" sign.
        const weak = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xffd060, emissive: 0xffd060, emissiveIntensity: 0.4,
            })
        );
        weak.position.set(0, 0.42, 0);
        this.segments[0].add(weak);
        this.weak = weak;

        // The sand mound: the whole read while the Spur is underground.
        const mound = new THREE.Mesh(
            new THREE.ConeGeometry(1.5, 0.9, 10),
            new THREE.MeshStandardMaterial({ color: 0xc9b183, roughness: 1 })
        );
        mound.visible = false;
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

    onPhaseChange(phase) {
        // Faster hunts and a shorter beached window: the same loop, tighter.
        this.speed = 3.0 + phase * 0.9;
        this.contactDamage = phase >= 3 ? 2 : 1;
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
                this._erupt(player);
            }
        }

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
        if (this.weak) {
            this.weak.material.emissiveIntensity = beached ? 3.2 : 0.4;
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
