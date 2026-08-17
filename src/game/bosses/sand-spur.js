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
import {
    BossBase, bossHit, BOSS_EMISSIVE_MAX, pushTrail, trailAt, seedTrail,
} from './base.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { fillBox } from '../../voxel/helpers.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { sfx } from '../../audio/synth.js';
import { markShadowRoles } from '../render/shadow-roles.js';
import { voxBlob, voxBox, voxSphere, voxSpike, LIMB_VOX_PER_UNIT } from './boss-models.js';

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
// WORLD UNITS between one segment centre and the next — not frames.
//
// The original sampled `trail[i * 5]`, five frames of history per segment. Two
// things are wrong with counting frames. It is meaningless against the thing
// that actually matters, the segment's own SIZE: at ~3.4 units/s five frames is
// 0.28 units, so six segments each 2.2 across were strung over 1.4 units and
// sat inside one another — the serpent photographed as a single lump. And it is
// SPEED-DEPENDENT: this boss's speed goes 3.9 → 5.7 across its phases, so a
// fixed frame stride silently stretches the animal apart as the fight escalates.
//
// Sampling by arc length fixes both. 2.5 is a little over one body, so the
// segments read as separate plates with floor visible between them — which is
// the only reason the Skeletal Mantis reads, and it holds at every speed.
//
// (The Magma Wyrm had the same frame-stride construction, widened to 22 when it
// had this exact bug. `trailAt` and the trail itself now live in `base.js` and
// both bosses use them, so there is no longer a second copy to forget.)
export const SEG_GAP = 2.5;

export const BREACH_R = 4.5;
export const BREACH_TIME = 1.6;
export const BREACH_HALF = Math.PI / 5;

// THE SPUR'S OWN COLOURS, AND THEY ARE NOT THE SINK'S.
//
// The head was `0xc4a060` against a `beat-03-sink` kit accent of `0xc8a060` —
// near enough the same tan that 88.8% of this body sat within 0.014 of its own
// room, the worst score on the roster by a distance (see the roster-wide gate
// in `boss-bodies.spec.mjs`). A sand-coloured serpent in a sand basin is a
// thematically tidy way of being invisible.
//
// Dark umber carapace instead, with the pale scoured plates kept well off the
// accent. It still reads as a desert animal; it just stops being the floor.
const CARAPACE = 0x4a3826;
const CARAPACE_DARK = 0x2e2317;
const PLATE = 0x8a7f6d;

/**
 * The head: a sandworm's mouth, which is the one shape that reads from directly
 * above.
 *
 * All six segments used to be `voxBox(0.9, 0.7, 0.9)` scaled 3.1 — six
 * identical cubes, the least designed body in the roster. A chain of boxes says
 * nothing about which end is the head or which way it is going, and at this
 * camera the answer to both has to come from the footprint.
 *
 * Mandibles splayed radially around a dark maw give a star, and a star has an
 * unmistakable centre. It is also the only silhouette on the roster shaped like
 * this, which matters more than any amount of detail.
 */
function buildSpurHead() {
    const g = new THREE.Group();
    const skull = voxBlob(1.22, 0.70, 1.34, CARAPACE, 0x000000, 0, { roughness: 0.9 });
    g.add(skull);
    // The maw: a dark well at the centre, so the mandibles have something to be
    // arranged around rather than just being spikes on a lump.
    const maw = voxBlob(0.58, 0.40, 0.58, CARAPACE_DARK, 0x000000, 0, { roughness: 1 });
    maw.position.y = 0.48;
    g.add(maw);
    // Four mandibles, splayed OUT and forward. Limb resolution: at the body
    // grid a 0.16 spike comes back half a unit thick and the star fills in.
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const jaw = voxSpike(1.34, 0.22, PLATE, 0x000000, 0,
            { roughness: 0.9 }, LIMB_VOX_PER_UNIT);
        jaw.position.set(Math.cos(a) * 0.88, 0.34, Math.sin(a) * 0.88);
        // `voxSpike` points along +Z, so aim each one outward from the maw and
        // tilt it up out of the sand.
        jaw.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
        jaw.rotation.x = -0.38;
        g.add(jaw);
    }
    return g;
}

/** A body ring: tapering, with a back ridge so the chain has a direction. */
function buildSpurSegment(i, n) {
    const g = new THREE.Group();
    const u = i / Math.max(1, n - 1);
    const r = 1.18 - u * 0.52;
    const ring = voxBlob(r, 0.58 - u * 0.18, r, CARAPACE, 0x000000, 0, { roughness: 0.9 });
    g.add(ring);
    // Three plates along the back. They break the silhouette of the ring they
    // sit on rather than hiding inside it (trap 4), and they are what makes a
    // row of blobs read as one segmented animal.
    for (const sx of [-1, 0, 1]) {
        const plate = voxBox(0.30, 0.26, 0.62 - u * 0.2, PLATE, 0x000000, 0,
            { roughness: 0.9 }, LIMB_VOX_PER_UNIT);
        plate.position.set(sx * r * 0.62, 0.34 - u * 0.08, 0);
        plate.rotation.z = sx * -0.35;
        g.add(plate);
    }
    return g;
}

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
        // Seeded, not empty: an empty trail has no arc length, so the first
        // frame stacks every segment on the head. Defensive rather than
        // load-bearing — the Spur constructs submerged and `_surfaceAt` re-lays
        // the trail before anyone sees it — so it has no counterfactual, which
        // is recorded here rather than left looking like an untested fix.
        this.trail = seedTrail([], pts[0].x, pts[0].z, (opts.segments || 6) * SEG_GAP);
        const n = opts.segments || 6;
        for (let i = 0; i < n; i++) {
            const mesh = i === 0 ? buildSpurHead() : buildSpurSegment(i, n);
            mesh.position.set(pts[0].x, 0.6, pts[0].z);
            mesh.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
            scene.add(mesh);
            this.segments.push(mesh);
        }
        // Combat root tracks head
        this.root = this.segments[0];
        this.mesh = this.segments[0];
        this.home = { x: this.lair.x, z: this.lair.z };

        // The weak seam only lights while beached — it is the "hit here" sign.
        // ON TOP OF THE HEAD, not inside it. At 0.42 it sat within the maw
        // blob and was simply interior geometry — the "hit here" sign the
        // beached window depends on could not be seen at all (trap 12, the same
        // way Frost & Fuel's skulls swallowed their own maws).
        const weak = voxSphere(0.30, 0xffd060, 0xffd060, 0.4);
        weak.position.set(0, 0.86, -0.20);
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
        // A STRAIGHT tail, not six copies of one point. Filling the trail with
        // the same {x,z} gives it zero arc length, so `trailAt` walks off the
        // end and hands every segment the surfacing point — the Spur came up
        // as a stack of six bodies after every dive and stayed that way until
        // it had travelled its own length again.
        seedTrail(this.trail, x, z, this.segments.length * SEG_GAP);
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
        //
        // THE STRIDE WAS FIVE FRAMES, AND THAT IS WHY THIS BOSS WAS A LUMP.
        // At 60fps and a speed of ~3.4, five frames is 0.28 world units — so
        // six segments each about two units across were strung out over 1.4
        // units total and sat almost entirely inside one another. Photographed,
        // the "serpent" was a single brown mass with a gold badge on it.
        //
        // This is the Magma Wyrm's bug, exactly: its chain "trailed 0.28 apart
        // while being 2.4 across" and was fixed by widening the stride to 22
        // with a matching history cap. That fix was never swept across to here
        // — the second body in the game built the same way. Both use the shared
        // trail in `base.js` now, so there is one implementation to be right.
        //
        // The 400-sample cap this replaces was ALSO a frame count: 2.8 seconds
        // of history, which at 144fps is 10.8 units of path against a 12.5-unit
        // animal. The fix for the stride left the same units error in the
        // buffer behind it.
        pushTrail(this.trail, this.root.position.x, this.root.position.z);

        const beached = this.staggered;
        for (let i = 0; i < this.segments.length; i++) {
            const s = this.segments[i];
            if (i > 0) {
                const sample = trailAt(this.trail, i * SEG_GAP);
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
            // Groups now, not single meshes — dispose has to traverse or every
            // part of this boss except one leaks on every level unload.
            if (s.parent) s.parent.remove(s);
            s.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        }
        if (this.mound?.parent) this.mound.parent.remove(this.mound);
        this.mound?.geometry.dispose();
        this.mound?.material.dispose();
        this.burrow?.dispose();
        this.clearTelegraph();
        this._hideRecoverCue();
    }
}
