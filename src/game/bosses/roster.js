// All 14 narrative bosses — unique multi-phase arena mechanics.

import * as THREE from 'three';
import {
    BossBase, bossHit, laneMesh, discMesh, haloMesh, moveToward, bounceArena,
    circleStrafe, BOSS_EMISSIVE_MAX,
} from './base.js';
import { sfx } from '../../audio/synth.js';
import { ABYSS_COLORS, CRUST_COLORS } from '../assets/palettes.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { fillBox } from '../../voxel/helpers.js';
import { voxBlade, voxBlob, voxBox, voxRing, voxSphere, voxSpike } from './boss-models.js';

function mat(color, emissive = 0x000000, ei = 0.6, extras = {}) {
    return new THREE.MeshStandardMaterial({
        color, emissive, emissiveIntensity: ei, roughness: 0.55, metalness: 0.25, ...extras,
    });
}

// The Warden's phase-2 ring, in world units. Exported because the spec has to
// assert the geometry rather than restate it, and because the two numbers only
// mean anything relative to each other and to the things around them:
//
//   contact ring (contactRadius x presenceScale)  2.18
//   CRACK_SAFE — inner edge, the safe centre      3.40
//   CRACK_OUTER — outer edge, safe again beyond   8.50
//   arenaRadius default                           7.50
//
// The safe hole is 1.2 units of standing room outside the boss's own contact
// ring, so "get in" never means "stand inside it and eat contact damage". The
// dangerous band is 5.1 wide with an exit at BOTH edges, which caps the worst
// case at ~2.55 units of travel against a 0.95s wind-up and a 5.5 u/s player —
// roughly half the time you need. That is the intended difficulty: this move is
// a lesson about which way to read a telegraph, and it should be almost
// impossible to fail once you have read it.
export const CRACK_SAFE = 3.4;
export const CRACK_OUTER = 8.5;

// The Warden's phase-1 cone. Same rule as above: one number each, shared by the
// telegraph and the hit test. 120° total, reaching 4 units — wide and quick
// enough that side-stepping is unreliable, which is the point. The answer is
// the shield beat 01 just handed you.
export const SWEEP_R = 4.0;
export const SWEEP_HALF = Math.PI / 3;

// ─── Beat 01 — Crypt Warden ─────────────────────────────────────────────────
export class CryptWarden extends BossBase {
    constructor(scene, position = { x: 0, z: -4 }) {
        const body = new THREE.Group();
        const torso = voxBox(1.6, 2.4, 1.0, CRUST_COLORS.slate, 0x402010, 0.5);
        torso.position.y = 0.2;
        const helm = voxBox(1.2, 0.8, 1.1, CRUST_COLORS.iron, CRUST_COLORS.goldLeaf, 1.2);
        helm.position.y = 1.6;
        // The first boss in the game, and its weapon used to be a 0.2-wide
        // slab standing 2.2 units straight up: one pixel of blade from the
        // only camera angle the player has. Held out to the side and forward,
        // so the reach it represents is the thing you can see.
        const blade = voxBlade(2.0, 0.30, 0.09, 0xc0c8d8, 0x80a0ff, 0.55);
        blade.position.set(1.0, 0.35, 0.2);
        blade.rotation.y = -0.28;
        body.add(torso, helm, blade);
        super(scene, {
            // C6: fought with the 0.5-dmg Bare Strike (his defeat grants the
            // Anchor Link), so 8 hp = 16 hits — in line with the Act I curve.
            id: 'crypt_warden', name: 'Crypt Warden', hp: 8, hitRadius: 1.1,
            contactRadius: 1.5, position, mesh: body, phaseThresholds: [0.5],
        });
        this.blade = blade;
        this.slamCd = 2.5;
        this._slamT = 0;
        this.shielded = true; // opens after first telegraph
        this._awake = false;
        // The first boss in the game owns its room. presenceScale grows the
        // mesh AND hitRadius/contactRadius together, so the fight stays
        // exactly as tuned relative to the body — which is the only reason it
        // is safe to do this to fourteen bosses at once.
        this.presenceScale(1.45);

        // The tutorial boss, and the first moveset in the game. Two moves in
        // phase 1 — beat 01 is teaching "read the wind-up", and a third option
        // up front would be teaching "memorise a rotation" instead. The third
        // arrives with phase 2, which is where it does its job: it makes the
        // second half a different fight rather than the same one faster.
        //
        // `engageRange` 9 matches the old `d < 9` gate this replaces.
        this.engageRange = 9;
        this.defineActions([
            {
                // PUNISH. Long tell, big radius, long recovery — the move the
                // whole dungeon has been teaching you to walk out of, and the
                // free hit afterwards is where your damage comes from.
                name: 'slam',
                weight: 3,
                range: [0, 9],
                prefers: 'close',
                build: () => ({
                    name: 'slam',
                    windup: this.phase >= 2 ? 0.6 : 0.75,
                    recover: this.phase >= 2 ? 0.8 : 1.1,
                    cooldown: this.phase >= 2 ? 0.9 : 1.5,
                    aim: (p) => ({
                        x: p.root.position.x, z: p.root.position.z,
                        radius: 2.4, color: 0xffc040,
                    }),
                    strike: (p, aim) => {
                        if (this.inBlast(p, aim.x, aim.z, 2.4)) {
                            this.hitPlayer(p, this.phase >= 2 ? 2 : 1, 0.5);
                            sfx.stomp();
                        } else sfx.block();
                    },
                }),
            },
            {
                // PRESSURE. A short frontal cone, and the reason it exists:
                // beat 01 is where the game hands you the Bulwark Shield, and
                // until now its own boss never once asked you to raise it. The
                // slam must be WALKED out of; this one is close, fast and wide
                // enough that stepping is unreliable — so the answer is the
                // thing in your other hand. Low damage on purpose: this is a
                // lesson, not a punish.
                name: 'sweep',
                weight: 2,
                range: [0, 4.5],
                prefers: 'close',
                build: () => {
                    const fv = this.state.facingVec;
                    return {
                        name: 'sweep',
                        windup: 0.45,
                        recover: 0.55,
                        cooldown: 1.1,
                        // One radius and one half-angle, read by both the shape
                        // that is DRAWN and the shape that is TESTED. They were
                        // two literals before, and they disagreed: the wedge on
                        // the floor was 90° while the wedge that hit you was
                        // 120°, so a player standing on visibly safe ground got
                        // hit. If these ever need to differ, that is a design
                        // decision and it needs a comment, not a second number.
                        aim: () => ({
                            x: this.root.position.x, z: this.root.position.z,
                            radius: SWEEP_R, shape: 'cone', halfAngle: SWEEP_HALF,
                            dir: { x: fv.x, z: fv.z }, color: 0xffa040,
                        }),
                        strike: (p) => {
                            if (this.inCone(p, this.root.position, { x: fv.x, z: fv.z },
                                SWEEP_R, SWEEP_HALF)) {
                                this.hitPlayer(p, 1, 0.5);
                                sfx.slap();
                            } else sfx.whoosh();
                        },
                    };
                },
            },
            {
                // PHASE. Every telegraph in the game so far has meant the same
                // thing — "not here, go somewhere else" — and a player who
                // learns only that has learned to run away from coloured
                // ground. This one is a band that travels OUTWARD from the
                // Warden's feet, and the safe place is the middle. The answer
                // is to close, which is the opposite instinct and the only
                // reason the move exists.
                //
                // Deliberately the gentlest phase-2 move in the game: one
                // damage in a phase where the slam does two, a long wind-up,
                // and the ground beyond the outer edge is safe as well — a
                // player already backed against the far wall is not punished
                // for a read they had no room to make. A lesson with a
                // consequence, not a test.
                name: 'ground-crack',
                weight: 2,
                phase: 2,
                // Only offered from outside the safe centre. Fired at someone
                // already standing in the hole it leaves, it would be a turn
                // where the boss does nothing — which reads as the fight
                // stalling, not as the player having outplayed it.
                range: [CRACK_SAFE, 12],
                prefers: 'far',
                build: () => ({
                    name: 'ground-crack',
                    windup: 0.95,
                    recover: 1.0,
                    cooldown: 2.2,
                    aim: () => ({
                        x: this.root.position.x, z: this.root.position.z,
                        // No colour: a ring is always TELL_BAND + TELL_SAFE
                        // (see bosses/base.js). Passing one here would be
                        // ignored, and offering the parameter is how fourteen
                        // kits end up with fourteen opinions about what the
                        // one reversed instruction in the game looks like.
                        radius: CRACK_OUTER, innerRadius: CRACK_SAFE,
                        shape: 'ring',
                    }),
                    strike: (p, aim) => {
                        sfx.heave();
                        if (this.inRing(p, aim.x, aim.z, CRACK_SAFE, CRACK_OUTER)) {
                            // Knocked outward, away from the safety it failed
                            // to reach — the punishment and the tell agree.
                            this.hitPlayer(p, 1, 0.6);
                        }
                    },
                }),
            },
        ]);
    }
    onPhaseChange() {
        this.shielded = false;
        this.contactDamage = 2;
        this.slamCd = 1.6;
    }
    tickAI(dt, player) {
        if (!player) return;
        // Wake when player near
        const d = Math.hypot(
            player.root.position.x - this.root.position.x,
            player.root.position.z - this.root.position.z
        );
        if (!this._awake && d < 7) {
            this._awake = true;
            this.shielded = false;
            sfx.phase();
        }
        if (!this._awake) return;
        // Face the player through `faceToward` rather than writing rotation.y.
        //
        // The old line turned the MESH and left `state.facingVec` on its
        // constructor default of {x:0,z:-1} — due south — forever. Harmless
        // today, because the only consumer of a boss's facingVec is
        // `inFrontArc`, and the only boss with directional armour is the
        // Arachnid, which already called this. It stops being harmless the
        // moment a second boss gets an armour arc: the plate would be welded
        // to due south while the body visibly tracked the player, which is
        // exactly the bulwark bug this framework's own comment warns about.
        //
        // Rate is high here on purpose. The Warden has no armour, so its turn
        // is readability rather than counterplay, and this is the tutorial
        // boss — it should not feel sluggish. Fast enough to be near
        // indistinguishable from the snap at combat range, finite enough that
        // facingVec is a real value.
        this.faceToward(player, dt, 4.0);
        if (this.busy) {
            // Blade held overhead through the wind-up, dropped during recovery:
            // the posture alone should tell you which half of the loop this is.
            this.blade.rotation.z = this.staggered ? 1.4 : -0.2;
            return;
        }
        this.blade.rotation.z = Math.sin(this.t * 3) * 0.3;
        // Remember where this player likes to stand, then let the base pick.
        this.trackHabit(d, dt);
        if (this.actIfReady(player, d)) return;
        // Slow stalk
        if (d > 2) moveToward(this.root.position, player.root.position, this.phase >= 2 ? 2.4 : 1.6, dt);
    }
}

// How far from a beam's line the player is hit. ONE number, read by both the
// hit test and the lane drawn on the floor — the same rule the whole roster now
// follows, and the reason the lane cannot drift from the danger it marks.
export const BEAM_HALF = 0.55;

// The converge slam: how big the marked ground is, and how often the trio
// chooses it over a beam sweep. Every third cycle — often enough to be part of
// the fight's rhythm, rare enough that the sweep stays the thing you are
// learning. 2.6 is a little wider than the ring the cores collapse into, so the
// disc is an honest overestimate of the bodies arriving in it rather than a
// shape you can stand at the edge of and argue with.
export const CONVERGE_R = 2.6;
export const CONVERGE_EVERY = 3;

// Phase 2's ring radius. `arenaRadius` defaults to 7.5 across the roster, so
// 6.4 puts the cores near the walls and stretches each beam to about 11 units —
// long enough to cross the whole floor, short enough that the gap between two
// walls is still somewhere a player can be. Phase 1 sits at 4.2 for contrast:
// the ring more than doubles in area when the fight turns over, which is what
// makes the change read as "the room changed" rather than "it sped up".
export const TRIANGULATE_R = 6.4;

// ─── Beat 02 — Tri-Compiler (enhanced multi-core) ───────────────────────────
export class TriCompiler {
    constructor(scene, centers, opts = {}) {
        this.bossId = 'tri_compiler';
        this.bossName = 'Tri-Compiler';
        this.managedBySystem = true;
        this.state = { current: 'IDLE' };
        this.scene = scene;
        this.t = 0;
        this.phase = 1;
        this.beams = [];
        this.cores = centers.map((c, i) => {
            // TriCompiler is the one boss that does NOT extend BossBase, so it
            // never passed through the base constructor's emissive clamp. Its
            // cores were the only parts in the roster still authored above the
            // cap after that clamp landed — which is the "sweep every place"
            // trap, in its purest form: the fix was correct and one of the
            // fifteen things it was supposed to cover was not a subclass.
            const mesh = voxBlob(0.95, 0.95, 0.95, opts.color || CRUST_COLORS.slate,
                opts.emissive || 0x40c0ff, BOSS_EMISSIVE_MAX * 0.55);
            mesh.position.set(c.x, c.y != null ? c.y : 1.4, c.z);
            mesh.scale.setScalar(1.35); // S6 (P1-5): silhouette ≥ 2.4 units
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            const core = {
                root: mesh, mesh, hitRadius: 1.15,
                hp: opts.hpPerCore || 4, maxHp: opts.hpPerCore || 4,
                state: { current: 'IDLE' },
                managedBySystem: true,
                index: i,
                home: { x: c.x, y: c.y != null ? c.y : 1.4, z: c.z },
                onHit() {
                    sfx.kick();
                    // Hit flash, capped. Was 2.8 against a bloom threshold
                    // of 0.85 — the flash was a white-out, not a flash.
                    mesh.material.emissiveIntensity = BOSS_EMISSIVE_MAX;
                },
                onDeath() {
                    mesh.visible = false;
                    sfx.shatter();
                },
                update() {},
                dispose() {
                    if (mesh.parent) mesh.parent.remove(mesh);
                    mesh.geometry.dispose();
                    mesh.material.dispose();
                },
            };
            return core;
        });
        // Beam lines between cores
        for (let i = 0; i < this.cores.length; i++) {
            const geo = new THREE.BufferGeometry();
            const positions = new Float32Array(6);
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
                color: 0x40e0ff, transparent: true, opacity: 0.65,
            }));
            scene.add(line);
            this.beams.push(line);
        }
        this.root = this.cores[0]?.root;
    }
    get hp() {
        return this.cores.reduce((s, c) => s + Math.max(0, c.hp), 0);
    }
    get maxHp() {
        return this.cores.reduce((s, c) => s + (c.maxHp || 4), 0);
    }
    get hpFrac() { return this.maxHp ? this.hp / this.maxHp : 0; }
    get defeated() { return this.cores.every((c) => c.state.current === 'DEAD'); }
    get alive() { return !this.defeated; }
    update(dt, player) {
        if (this.defeated) {
            this.state.current = 'DEAD';
            return;
        }
        this.t += dt;
        if (this.hpFrac < 0.45 && this.phase === 1) {
            this.phase = 2;
            sfx.phase();
        }

        // ── Sweep cycle ─────────────────────────────────────────────────────
        // The trio hunts as a unit: it widens its ring until the beam net is
        // about to cross the player, holds (the beams flare white — that is
        // the wind-up), sweeps, then browns out. During the brown-out the
        // cores sink to head height and take double. Before this the ring
        // spun at a fixed radius forever and the beams only ever hurt you if
        // you happened to walk into one.
        this.cycleT = (this.cycleT || 0) + dt;
        const period = this.phase >= 2 ? 4.2 : 5.6;
        const prevU = this._u || 0;
        const u = (this.cycleT % period) / period;
        this._u = u;
        // A new cycle begins: pick what this one is going to BE, once, at the
        // top. Deciding mid-cycle would let the attack change identity after it
        // had already started announcing itself, which is the one thing a
        // telegraph may never do.
        if (u < prevU) {
            this.cycleN = (this.cycleN || 0) + 1;
            this.mode = (this.cycleN % CONVERGE_EVERY === 0) ? 'converge' : 'sweep';
        }
        if (!this.mode) this.mode = 'sweep';
        const charging = u > 0.55 && u < 0.72;
        const sweeping = u >= 0.72 && u < 0.82;
        const spent = u >= 0.82;
        this.stage = spent ? 'recover' : charging ? 'windup' : sweeping ? 'strike' : 'pattern';

        // The whole assembly drifts onto the player. Tying the ring to each
        // core's spawn point was the flaw: the trio hung over one fixed spot
        // for the entire fight, so standing anywhere else made it harmless.
        const c0 = this.cores.find((c) => c.state.current !== 'DEAD');
        if (!this.hub) {
            this.hub = c0
                ? { x: c0.home.x, z: c0.home.z }
                : { x: 0, z: 0 };
        }
        // The hub stops chasing the moment it commits, for the same reason the
        // spin does. A telegraph that re-aims every frame is not a telegraph —
        // it is a guarantee, and sidestepping it would be impossible.
        if (player && !spent && !charging) {
            const rate = Math.min(1, dt * (this.phase >= 2 ? 0.5 : 0.32));
            this.hub.x += (player.root.position.x - this.hub.x) * rate;
            this.hub.z += (player.root.position.z - this.hub.z) * rate;
        }
        // ── triangulate: phase 2 is a different room, not a faster one ─────
        //
        // ROAD-TO-TEN, beat 02: "cores park at the arena corners; the beams
        // become three rotating walls and the room becomes a maze. Killing one
        // core early removes a wall — focus fire is rewarded."
        //
        // Implemented as a RADIUS, which is the whole trick and the reason it
        // costs almost nothing: the trio already orbits a hub on a ring, and a
        // ring wide enough to reach the arena's edges turns the three beams
        // between the cores from a small net you step around into three long
        // walls that sweep the whole floor. Phase 1 asks "where is the net";
        // phase 2 asks "where is the gap", which is a different question rather
        // than the same one under time pressure.
        //
        // It also makes the fight's own structural reward legible for the first
        // time: at this radius a dead core does not remove a bit of net, it
        // removes a WALL, and the room visibly opens up. That was always true
        // and was never worth noticing at 3.4 units.
        const want = this.phase >= 2 ? TRIANGULATE_R : 4.2;
        this.ringR = this.ringR == null ? want : this.ringR;
        if (!spent && !charging) this.ringR += (want - this.ringR) * Math.min(1, dt * 1.1);

        // THE ASSEMBLY HOLDS STILL WHILE IT CHARGES, and this is the fight's
        // biggest fix. Measured before it: between the white flare (the
        // warning) and the sweep (the damage) the cores travelled 1.69, 2.65
        // and 2.88 units — against a beam that hits within 0.55 of its line.
        // The net was up to five beam-widths away from where it had announced
        // itself. The wind-up was not hard to read, it was IMPOSSIBLE to read:
        // there was no information in it about where to stand.
        //
        // Holding still is also the grammar the rest of the game already uses,
        // in `Enemy._beginWindup`'s own words: "the enemy holds still while
        // winding up (that pause IS the tell)". The trio was the only thing in
        // Sovereign Scar that announced an attack and then walked away from it.
        const spin = spent ? 0.15 : charging ? 0 : 0.6;
        // ACCUMULATED, not derived from `this.t * spin`. The angle used to be
        // computed straight from elapsed time multiplied by the current rate,
        // which means changing the rate does not slow the ring down — it
        // TELEPORTS it, to wherever `t * newRate` happens to point. The first
        // attempt at freezing the charge set spin to 0 and made the drift
        // WORSE, 7.85 units against the 2.88 it was trying to remove, because
        // the whole assembly snapped to angle zero the instant it committed.
        // Measured, not reasoned about; the number is the only reason it was
        // caught before it shipped as a fix.
        this.spinAng = (this.spinAng || 0) + dt * spin;
        for (let i = 0; i < this.cores.length; i++) {
            const c = this.cores[i];
            if (c.state.current === 'DEAD') continue;
            const ang = this.spinAng + i * (Math.PI * 2 / 3);
            c.mesh.position.x = this.hub.x + Math.cos(ang) * this.ringR;
            c.mesh.position.z = this.hub.z + Math.sin(ang) * this.ringR;
            c.mesh.position.y = spent
                ? 1.15 + Math.sin(this.t * 3 + i) * 0.08   // sunk to head height
                : c.home.y + Math.sin(this.t * 2 + i) * 0.25;
            c.mesh.rotation.y += dt * (1 + i * 0.3);
            // Three states, and the READ between them is what matters, not the
            // absolute level: charging flickers hot, spent goes dull, idle
            // breathes. Expressed as fractions of the cap so the contrast
            // survives while the frame stops blowing out.
            c.mesh.material.emissiveIntensity = BOSS_EMISSIVE_MAX * (charging
                ? 0.82 + Math.sin(this.t * 22) * 0.18
                : spent ? 0.14 : 0.42 + Math.sin(this.t * 4 + i) * 0.16);
            // Open window: spent cores take double and stop shielding.
            c.vulnerableMult = spent ? 2 : 1;
            // Beams only bite on the sweep — the rest of the cycle is a read.
            if (sweeping && player && !player.health?.dead) {
                const next = this.cores[(i + 1) % this.cores.length];
                if (next.state.current !== 'DEAD') {
                    if (pointNearSegment(
                        player.root.position,
                        c.mesh.position,
                        next.mesh.position,
                        BEAM_HALF
                    )) {
                        if (!this._beamCd || this._beamCd <= 0) {
                            // `bossHit`, not `this.hitPlayer` — this class does
                            // not extend BossBase and never had that method.
                            // The old line threw on every beam contact, so the
                            // net was scenery for the whole fight.
                            bossHit(player, 1, 0.6, c.mesh.position, this);
                            this._beamCd = 0.8;
                        }
                    }
                }
            }
        }
        if (this._beamCd > 0) this._beamCd -= dt;

        // ── The lane telegraph ──────────────────────────────────────────────
        //
        // ROAD-TO-TEN, beat 02: "no ground telegraph at all (the beams just
        // flare white)". True, and the flare on its own was not enough — the
        // beams are drawn at CORE HEIGHT, and from a top-down camera a bright
        // line floating a metre and a half up does not tell you which floor
        // tiles it covers. Every other committed attack in this game marks the
        // GROUND. This one now does too.
        //
        // Only during the charge, and it is honest because the assembly is
        // frozen for exactly that window (see the spin comment above): the
        // strip painted here is the strip the sweep resolves against, to within
        // 0.05 units. `BEAM_HALF` is the same constant the hit test uses, so
        // the lane is drawn at its true width rather than at a width somebody
        // thought looked about right.
        if (charging && this.mode === 'sweep') this._drawLanes();
        else this._clearLanes();

        // ── converge: the punish ───────────────────────────────────────────
        //
        // ROAD-TO-TEN, beat 02: "all three cores slam together on your
        // position." The fight's only committed attack was the sweep, which
        // asks one question — are you standing on a line — and asks it every
        // 5.6 seconds forever. This asks the other one: it marks a patch of
        // floor, and the three bodies arrive in it.
        //
        // The target is LOCKED when the charge begins and never re-aimed, so
        // the disc on the floor is where they land, not where you currently
        // are. Same law as the ring above and as every telegraph in the game.
        if (this.mode === 'converge') {
            if (charging) {
                if (!this._slamAt && player) {
                    this._slamAt = {
                        x: player.root.position.x,
                        z: player.root.position.z,
                    };
                    this._slamDisc = discMesh(
                        this._slamAt.x, this._slamAt.z, CONVERGE_R, 0x40e0ff,
                        (this.floorY != null ? this.floorY : 1.0) + 0.08, 0.5
                    );
                    this.scene.add(this._slamDisc);
                    sfx.heave();
                }
            } else if (sweeping && this._slamAt) {
                // The bodies arrive. Cores are pulled to the marked point over
                // the sweep window rather than teleported, so the slam is a
                // thing you watch land.
                for (const c of this.cores) {
                    if (c.state.current === 'DEAD') continue;
                    const k = Math.min(1, dt * 9);
                    c.mesh.position.x += (this._slamAt.x - c.mesh.position.x) * k;
                    c.mesh.position.z += (this._slamAt.z - c.mesh.position.z) * k;
                }
                if (player && !player.health?.dead
                    && (!this._beamCd || this._beamCd <= 0)) {
                    const d = Math.hypot(
                        player.root.position.x - this._slamAt.x,
                        player.root.position.z - this._slamAt.z
                    );
                    if (d <= CONVERGE_R) {
                        bossHit(player, 2, 0.8, this._slamAt, this);
                        this._beamCd = 0.8;
                        sfx.stomp();
                    }
                }
            } else if (spent) {
                this._clearSlam();
            }
        } else {
            this._clearSlam();
        }

        // ── the brown-out, announced ───────────────────────────────────────
        //
        // The `spent` stage has always doubled the damage each core takes and
        // said nothing about it (ROAD-TO-TEN: "give it the recover cue"). Every
        // BossBase boss draws a halo at its feet for exactly its recovery; this
        // one draws three, one per live core, because on this boss the thing
        // you hit is the core rather than the body.
        if (spent) this._showSpentCue();
        else this._hideSpentCue();
        // Update beam geometry
        for (let i = 0; i < this.cores.length; i++) {
            const a = this.cores[i];
            const b = this.cores[(i + 1) % this.cores.length];
            const line = this.beams[i];
            if (a.state.current === 'DEAD' || b.state.current === 'DEAD') {
                line.visible = false;
                continue;
            }
            line.visible = true;
            // The net is the telegraph: it flares white while charging and
            // dims to nothing once spent, so "when is it live" is readable
            // without a HUD.
            line.material.color.setHex(this.stage === 'windup' ? 0xffffff : 0x40e0ff);
            line.material.opacity = this.stage === 'windup' ? 1
                : this.stage === 'strike' ? 0.9
                    : this.stage === 'recover' ? 0.15 : 0.5;
            const pos = line.geometry.attributes.position.array;
            pos[0] = a.mesh.position.x; pos[1] = a.mesh.position.y; pos[2] = a.mesh.position.z;
            pos[3] = b.mesh.position.x; pos[4] = b.mesh.position.y; pos[5] = b.mesh.position.z;
            line.geometry.attributes.position.needsUpdate = true;
        }
    }
    /** Paint the floor under every live beam. Idempotent per charge. */
    _drawLanes() {
        if (this._lanes && this._lanes.length) return;   // already up this charge
        this._lanes = [];
        for (let i = 0; i < this.cores.length; i++) {
            const a = this.cores[i];
            const b = this.cores[(i + 1) % this.cores.length];
            if (a.state.current === 'DEAD' || b.state.current === 'DEAD') continue;
            const dx = b.mesh.position.x - a.mesh.position.x;
            const dz = b.mesh.position.z - a.mesh.position.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.01) continue;
            // Width is BEAM_HALF * 2 because the hit test is a distance from
            // the segment, so the dangerous strip is half-width either side.
            // Drawing it at `BEAM_HALF` would paint half the danger.
            const lane = laneMesh(
                a.mesh.position.x, a.mesh.position.z,
                { x: dx, z: dz }, len, BEAM_HALF * 2,
                0x40e0ff, (this.floorY != null ? this.floorY : 1.0) + 0.07, 0.45
            );
            this.scene.add(lane);
            this._lanes.push(lane);
        }
    }

    _clearSlam() {
        this._slamAt = null;
        if (this._slamDisc) {
            if (this._slamDisc.parent) this._slamDisc.parent.remove(this._slamDisc);
            this._slamDisc.geometry.dispose();
            this._slamDisc.material.dispose();
            this._slamDisc = null;
        }
    }

    /** One halo per live core, rebuilt each frame so it follows the drift. */
    _showSpentCue() {
        this._hideSpentCue();
        this._spentCues = [];
        const y = (this.floorY != null ? this.floorY : 1.0) + 0.06;
        for (const c of this.cores) {
            if (c.state.current === 'DEAD') continue;
            const halo = haloMesh(c.mesh.position.x, c.mesh.position.z,
                Math.max(1.0, c.hitRadius * 1.1), y);
            this.scene.add(halo);
            this._spentCues.push(halo);
        }
    }

    _hideSpentCue() {
        if (!this._spentCues) return;
        for (const h of this._spentCues) {
            if (h.parent) h.parent.remove(h);
            h.geometry.dispose();
            h.material.dispose();
        }
        this._spentCues = [];
    }

    _clearLanes() {
        if (!this._lanes) return;
        for (const l of this._lanes) {
            if (l.parent) l.parent.remove(l);
            l.geometry.dispose();
            l.material.dispose();
        }
        this._lanes = [];
    }

    dispose() {
        this._clearLanes();
        this._clearSlam();
        this._hideSpentCue();
        for (const c of this.cores) c.dispose();
        for (const b of this.beams) {
            if (b.parent) b.parent.remove(b);
            b.geometry.dispose();
            b.material.dispose();
        }
    }
}

function pointNearSegment(p, a, b, thresh) {
    const abx = b.x - a.x, abz = b.z - a.z;
    const apx = p.x - a.x, apz = p.z - a.z;
    const ab2 = abx * abx + abz * abz || 1;
    let t = (apx * abx + apz * abz) / ab2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t, cz = a.z + abz * t;
    return Math.hypot(p.x - cx, p.z - cz) < thresh;
}

// ─── Beat 05 — The Proxy ────────────────────────────────────────────────────
export class ProxyBoss extends BossBase {
    constructor(scene, position = { x: 0, z: -3 }) {
        const body = new THREE.Group();
        const core = voxBlob(1.1, 1.1, 1.1, 0x3a2860, ABYSS_COLORS.violetHot, 1.5);
        const ring = voxRing(1.6, 0.12, CRUST_COLORS.goldLeaf, CRUST_COLORS.goldLeaf, 1.8);
        ring.rotation.x = Math.PI / 2;
        body.add(core, ring);
        super(scene, {
            id: 'proxy', name: 'The Proxy', hp: 16, hitRadius: 1.3,
            contactRadius: 1.7, position, mesh: body, phaseThresholds: [0.55, 0.25],
        });
        this.core = core;
        this.ring = ring;
        this.clones = [];
        this.castCd = 2.0;
        this._realIndex = 0;
        this.presenceScale(1.55);
    }
    onPhaseChange(phase) {
        this.castCd = Math.max(0.9, 2.2 - phase * 0.4);
        if (phase >= 2) this._spawnClones(phase);
    }
    _spawnClones(phase) {
        for (const c of this.clones) {
            if (c.parent) c.parent.remove(c);
            c.geometry?.dispose(); c.material?.dispose();
        }
        this.clones = [];
        const n = phase >= 3 ? 3 : 2;
        for (let i = 0; i < n; i++) {
            const m = voxBlob(0.9, 0.9, 0.9, 0x2a1840, ABYSS_COLORS.violet, 0.9, { transparent: true, opacity: 0.45 });
            m.position.copy(this.root.position);
            m.position.x += Math.cos(i * 2) * 3;
            m.position.z += Math.sin(i * 2) * 3;
            this.scene.add(m);
            this.clones.push(m);
        }
        this._markRealBody();
    }
    /** True body is always combat root; decoys are visual only. Brightness marks the real one. */
    _markRealBody() {
        this.canHit = true;
        this.hitRadius = this.baseHitRadius || 1.3;
        if (this.core) {
            this.core.material.transparent = true;
            this.core.material.opacity = 1;
            this.core.material.emissiveIntensity = BOSS_EMISSIVE_MAX;
        }
        for (const c of this.clones) {
            c.material.opacity = 0.4;
            c.material.emissiveIntensity = BOSS_EMISSIVE_MAX * 0.45;
        }
    }
    /** Swap world positions with a decoy so the hittable body relocates. */
    _teleportAmongClones() {
        if (!this.clones.length) return;
        const i = Math.floor(Math.random() * this.clones.length);
        const c = this.clones[i];
        const ox = this.root.position.x;
        const oy = this.root.position.y;
        const oz = this.root.position.z;
        this.root.position.set(c.position.x, c.position.y, c.position.z);
        c.position.set(ox, oy, oz);
        this._markRealBody();
        sfx.phase();
    }
    tickAI(dt, player) {
        this.ring.rotation.z += dt * (1 + this.phase * 0.5);
        this.core.rotation.y += dt * 0.8;
        this.core.rotation.x += dt * 0.3;
        this.castCd -= dt;
        if (this.phase >= 2) {
            this._shuffleT = (this._shuffleT || 0) + dt;
            if (this._shuffleT > 3.2) {
                this._shuffleT = 0;
                this._teleportAmongClones();
            }
        }
        // Phase 1: circle the player, not the arena. The Proxy is a duellist —
        // it keeps its distance and looks for an angle. It used to run a fixed
        // orbit about the room centre and never once looked at where you were.
        if (this.phase < 2) {
            if (player && !this.busy) {
                this.strafe(player, dt,
                    { speed: 3.2, spin: 0.8, close: 1.0, minRadius: 2.2 });
            }
            this.root.position.y = 1.5 + Math.sin(this.t * 2) * 0.3;
        } else {
            this.root.position.y = 1.5 + Math.sin(this.t * 2) * 0.25;
            // Decoys orbit the true body
            for (let i = 0; i < this.clones.length; i++) {
                const c = this.clones[i];
                const a = this.t * 0.7 + i * 2.1;
                c.position.x = this.root.position.x + Math.cos(a) * 3.5;
                c.position.z = this.root.position.z + Math.sin(a) * 3.5;
                c.position.y = 1.4 + Math.sin(this.t * 3 + i) * 0.4;
                c.rotation.y += dt;
            }
        }
        if (this.phase < 2) {
            for (let i = 0; i < this.clones.length; i++) {
                const c = this.clones[i];
                const a = this.t * 0.7 + i * 2.1;
                c.position.x = this.root.position.x + Math.cos(a) * 3.5;
                c.position.z = this.root.position.z + Math.sin(a) * 3.5;
                c.position.y = 1.4 + Math.sin(this.t * 3 + i) * 0.4;
                c.rotation.y += dt;
            }
        }
        if (player && this.actionCd <= 0 && !this.busy) {
            // Phase 2 mixes in the volley, phase 3 the swap. The bolt stays the
            // spine of the fight: it is the only move that teaches the ring.
            if (this.phase >= 2 && this.clones.length && this._rand() < 0.35) {
                this._mirrorVolley(player);
                return;
            }
            this.startAction({
                name: 'bolt',
                windup: this.phase >= 3 ? 0.5 : 0.65,
                recover: this.phase >= 3 ? 0.7 : 1.0,
                cooldown: this.phase >= 3 ? 0.8 : 1.3,
                aim: (p) => ({
                    x: p.root.position.x, z: p.root.position.z,
                    radius: 2.2, color: 0xc084fc,
                }),
                // The wind-up is the most important frame in the fight to be
                // able to READ, so it is the last place to blow the frame out.
                onWindup: () => { this.ring.material.emissiveIntensity = BOSS_EMISSIVE_MAX; },
                strike: (p, aim) => {
                    if (this.inBlast(p, aim.x, aim.z, 2.2)) {
                        this.hitPlayer(p, this.phase, 0.5);
                        sfx.phase();
                    }
                },
                onRecover: () => { this.ring.material.emissiveIntensity = BOSS_EMISSIVE_MAX * 0.55; },
                // PROXY-SWAP (phase 3). It changes bodies mid-wind-up, so the
                // ring you are dodging was placed by something that is no
                // longer standing there.
                //
                // **The ring does not move**, and that is the point rather than
                // an implementation detail. Every telegraph in this game is a
                // promise about where the damage lands, and this fight bends
                // the fiction as far as it will go without breaking that: the
                // BODY lies, the GROUND never does. A swap that dragged its
                // telegraph along would just be a boss that re-aims.
            });
            if (this.phase >= 3 && this.clones.length && this._rand() < 0.5) {
                this._swapPending = true;
            }
        }
        // Resolve a pending swap one beat into the wind-up, so the player sees
        // the ring placed, then sees the caster leave it.
        if (this._swapPending && this.action && this.action.stage === 'windup'
            && this.action.t < this.action.windup * 0.6) {
            this._swapPending = false;
            this._teleportAmongClones();
            this.lastSwapAt = this.t;
            sfx.grab();
        }
    }

    /**
     * MIRROR-VOLLEY — every body fires at once, and only the real one lands.
     *
     * A deliberate, signposted exception to this file's telegraph law, and the
     * only one in the game. Everywhere else a marked patch of floor is a
     * promise; here the decoys bluff. It is allowed because reading which body
     * is real IS the fight — the Proxy's whole premise — and because the
     * information is present before the volley resolves: the real body carries
     * the bright ring (`_markReal`), and its marker is drawn in the bolt's own
     * violet while the decoys' are drawn dim and cold.
     *
     * If that tell is ever removed, this move becomes unfair and must go with
     * it. A bluff the player cannot call is not a mechanic, it is a coin.
     */
    _mirrorVolley(player) {
        const px = player.root.position.x, pz = player.root.position.z;
        this.startAction({
            name: 'mirror-volley',
            windup: 0.85,
            recover: 1.1,
            cooldown: 2.0,
            aim: () => ({ x: px, z: pz, radius: 2.2, color: 0xc084fc }),
            onWindup: () => {
                this.ring.material.emissiveIntensity = BOSS_EMISSIVE_MAX;
                // The decoys' markers: dim, cold, and drawn at the same size,
                // so the only difference between a bluff and a real bolt is
                // the thing the fight has been teaching you to look at.
                this._volley = [];
                for (const c of this.clones) {
                    const m = discMesh(c.position.x, c.position.z, 2.2,
                        0x5060a0, this.floorY + 0.05, 0.28);
                    this.scene.add(m);
                    this._volley.push(m);
                }
                sfx.whoosh();
            },
            strike: (p, aim) => {
                if (this.inBlast(p, aim.x, aim.z, 2.2)) {
                    this.hitPlayer(p, this.phase, 0.5);
                    sfx.phase();
                }
            },
            onRecover: () => {
                this.ring.material.emissiveIntensity = BOSS_EMISSIVE_MAX * 0.55;
                this._clearVolley();
            },
        });
    }

    _clearVolley() {
        for (const m of this._volley || []) {
            if (m.parent) m.parent.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        }
        this._volley = [];
    }

    dispose() {
        this._clearVolley();
        for (const c of this.clones) {
            if (c.parent) c.parent.remove(c);
            c.geometry?.dispose(); c.material?.dispose();
        }
        super.dispose();
    }
}

// The Arachnid's web cone, and the six-lane flare. One radius and one
// half-angle each, shared by the shape drawn and the shape resolved.
export const WEB_R = 6.0;
export const WEB_HALF = Math.PI / 6;
export const FLARE_R = 6.0;

// ─── Beat 06 — Obsidian Arachnid ────────────────────────────────────────────
export class ObsidianArachnid extends BossBase {
    constructor(scene, position = { x: 0, z: -2 }) {
        const body = new THREE.Group();
        const abdomen = voxSphere(1.1, 0x3a2850, 0x6020a0, 1.1);
        abdomen.scale.set(1.3, 0.9, 1.5);
        const head = voxSphere(0.55, 0x462a52, 0xff2040, 1.4);
        head.position.set(0, 0.2, 1.2);
        body.add(abdomen, head);
        const legs = [];
        for (let i = 0; i < 8; i++) {
            const leg = voxBox(0.15, 0.15, 1.8, 0x3a2f44, 0x401060, 0.7);
            const side = i < 4 ? -1 : 1;
            const idx = i % 4;
            leg.position.set(side * 0.9, -0.3, -0.6 + idx * 0.5);
            leg.rotation.z = side * 0.6;
            leg.rotation.y = side * (0.2 + idx * 0.15);
            body.add(leg);
            legs.push(leg);
        }
        super(scene, {
            id: 'obsidian_arachnid', name: 'Obsidian Arachnid', hp: 14,
            // 1.4 → 1.85 because the BODY grew and the hitbox did not keep up.
            //
            // `presenceScale(1.70)` multiplies mesh and hitRadius together, so
            // this looked safe. It is not, because the base radius was chosen
            // against the spider's CORE and the silhouette is mostly legs:
            // measured from the root, the visible edge reaches 3.79 at the
            // front quarter while damage stopped registering at 4.10. That
            // leaves a band 0.31 units wide in which the player is outside the
            // model and can still land a blow — and the natural melee standoff,
            // the one that works on every 0.49-radius mob in the game, is about
            // two units, which is deep inside the legs.
            //
            // So the fight taught "you have to stand inside it to hit it",
            // which is the owner's report word for word, and the same sentence
            // this boss produced before the `shielded` fix — a different cause
            // wearing the old symptom.
            //
            // 1.85 puts the reach at 4.87 against that 3.79 edge: a 1.08 band,
            // in line with the campaign median of 1.4. `boss-reach.spec.mjs`
            // measures this for all fourteen rather than trusting the arithmetic.
            hitRadius: 1.85,
            // Pinned to what `max(0.65, hitRadius * 0.75)` gave at the old 1.4,
            // so a wider hitbox does not silently widen the boss's WALL PROBE
            // and change how it moves. This fix is about where the player can
            // stand, and nothing else.
            collHalf: 1.05,
            contactRadius: 1.8, position, mesh: body, phaseThresholds: [0.5],
        });
        this.legs = legs;
        this.leapCd = 3;
        this._leapT = 0;
        // Its carapace is armoured; its flanks and its underside are not.
        //
        // This used to be `shielded = true`, an ABSOLUTE gate: `applyHit`
        // refuses a shielded defender from every angle, so in phase 1 the only
        // frames that could damage it at all were its own leap. And the leap
        // lands the spider ON the player. The two facts together produced
        // exactly what the owner reported — "I had to stand inside it in order
        // to hit it" — because that was, mechanically, the only place damage
        // ever registered. Measured, not guessed: reach was never the issue
        // (`anchor_link` connects out to 3.6m against a 2.24m visual edge).
        //
        // Directional armour instead, via the same `armorUp` + `inFrontArc`
        // path the bulwark already uses. Head-on is a clang; the flank and the
        // back are open. The fight becomes "get around it", which you do from
        // OUTSIDE the body, and which the dungeon's own lock-on strafing is
        // built for.
        this.shielded = false;
        // ±60°, narrower than the bulwark's ±75°: a boss you must circle needs
        // a shorter walk to the flank than a trash mob does.
        this.armorArc = Math.PI / 3;
        this._openT = 0;
        this.presenceScale(1.70);
    }

    /**
     * True while the carapace actually refuses a blow. Open during any
     * committed action (that is the leap window, unchanged), for the length of
     * a parry, and from phase 2 onward.
     */
    get armorUp() {
        return this.phase < 2 && !this.action && this._openT <= 0
            && this.state.current !== 'DEAD';
    }

    /** A parry drops the plate, exactly as it does on a bulwark. */
    stagger(sec = 0.9) {
        this._openT = Math.max(this._openT, sec);
        return super.stagger(sec);
    }

    tickAI(dt, player) {
        for (let i = 0; i < this.legs.length; i++) {
            this.legs[i].rotation.x = Math.sin(this.t * 6 + i) * 0.35;
        }
        if (this._openT > 0) this._openT -= dt;
        if (!player) return;
        // Turn no faster than the player can strafe, so circling to the flank
        // is a race the player wins in about a second and a half.
        this.faceToward(player, dt, 1.1);
        if (this.busy) {
            // Airborne through the wind-up, crumpled on the floor through the
            // recovery. Its armoured back is only off the ground while it is
            // in the air, and its legs are folded under it once it lands.
            const a = this.action;
            if (a.stage === 'windup') {
                this.root.position.y = 1.2 + Math.sin((1 - a.t / a.windup) * Math.PI) * 2.5;
            } else {
                this.root.position.y = 0.85;
            }
            return;
        }
        // `shielded` stays false for good — the plate is directional now and
        // lives in `armorUp`, which is derived rather than assigned. An
        // absolute flag here is what made every angle a clang.
        this.root.position.y = 1.0;
        const d = Math.hypot(
            player.root.position.x - this.root.position.x,
            player.root.position.z - this.root.position.z
        );
        // The leap used to need d > 3, so a player who simply walked up and
        // stayed there was never leapt at — and since its back is armoured and
        // the leap was the only opening, the fight deadlocked: infinite swings,
        // zero damage, forever. It now also leaps to make space when crowded.
        if (this.actionCd <= 0 && d < 12) {
            // WEB-SPIT: a cone at range that leaves a slowing patch.
            //
            // It attacks this fight's counterplay without removing it. The
            // Arachnid's plate faces you, so the answer is to circle — and web
            // does not stop you circling, it means you have to LEAVE SOONER.
            // A move that deleted the flank would delete the fight.
            if (d > 4 && this._rand() < 0.35) { this._webSpit(); return; }
            // CARAPACE-FLARE (phase 2): it plants and fires six radiating
            // lanes, and the safe ground is BETWEEN them. Phase 1 asks for
            // patience; phase 2 asks for precision.
            if (this.phase >= 2 && this._rand() < 0.3) { this._flare(); return; }
            const crowded = d <= 3;
            this.startAction({
                name: crowded ? 'recoil-leap' : 'leap',
                windup: 0.9,
                recover: this.phase >= 2 ? 0.9 : 1.3,
                cooldown: this.phase >= 2 ? 1.4 : 2.2,
                aim: (p) => {
                    // Crowded: hop backwards over the player's head and land
                    // clear. Otherwise: come down on top of them.
                    const px = p.root.position.x, pz = p.root.position.z;
                    if (!crowded) return { x: px, z: pz, radius: 2.4, color: 0xa040ff };
                    const dx = this.root.position.x - px, dz = this.root.position.z - pz;
                    const n = Math.hypot(dx, dz) || 1;
                    return {
                        x: px + (dx / n) * 5, z: pz + (dz / n) * 5,
                        radius: 2.4, color: 0xa040ff,
                    };
                },
                // The leap is still a full opening from ANY angle — `armorUp`
                // reads false while an action is committed.
                onWindup: () => {},
                strike: (p, aim) => {
                    this.root.position.x = aim.x;
                    this.root.position.z = aim.z;
                    this.root.position.y = 0.85;
                    sfx.stomp();
                    if (this.inBlast(p, aim.x, aim.z, 2.5)) this.hitPlayer(p, 2, 0.4);
                },
                onRecover: () => { this.root.position.y = 1.0; },
            });
            return;
        }
        moveToward(this.root.position, player.root.position, this.phase >= 2 ? 3.2 : 2.2, dt);
    }

    _webSpit() {
        const fv = this.state.facingVec;
        this.startAction({
            name: 'web-spit',
            windup: 0.55,
            recover: 0.8,
            cooldown: 2.2,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: WEB_R, shape: 'cone', halfAngle: WEB_HALF,
                dir: { x: fv.x, z: fv.z }, color: 0xa040ff,
            }),
            onWindup: () => { sfx.whoosh(); },
            strike: (p, aim) => {
                // The patch is laid at the far end of the cone, which is where
                // a ranged spit lands. Radius and half-angle come from `aim`,
                // so the wedge drawn and the wedge that matters are one shape.
                const cx = this.root.position.x + fv.x * WEB_R * 0.7;
                const cz = this.root.position.z + fv.z * WEB_R * 0.7;
                this.spawnPatch({
                    x: cx, z: cz, r: 2.6, life: 5,
                    color: 0xa878e0, slow: 0.5, kind: 'web',
                });
                if (this.inCone(p, this.root.position, { x: fv.x, z: fv.z },
                    aim.radius, aim.halfAngle)) {
                    this.hitPlayer(p, 1, 0.3);
                }
                sfx.slap();
            },
        });
    }

    _flare() {
        this.startAction({
            name: 'carapace-flare',
            windup: 0.9,
            recover: 1.3,
            cooldown: 3.0,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: FLARE_R, color: 0xa040ff,
            }),
            onWindup: () => { sfx.heave(); },
            strike: (p) => {
                // Six lanes, evenly spaced, drawn as patches so the gaps are
                // visible for as long as they matter. The safe ground is
                // between them — this is the one move in the fight that is
                // answered by standing still in the right place.
                const base = this._rand() * Math.PI * 2;
                for (let i = 0; i < 6; i++) {
                    const a = base + i * (Math.PI / 3);
                    for (let k = 1; k <= 4; k++) {
                        this.spawnPatch({
                            x: this.root.position.x + Math.cos(a) * k * 1.5,
                            z: this.root.position.z + Math.sin(a) * k * 1.5,
                            r: 0.9, life: 2.2, color: 0xc060ff,
                            damage: 1, tick: 0.9, kind: 'flare',
                        });
                    }
                }
                sfx.stomp();
                if (p && this.inBlast(p, this.root.position.x, this.root.position.z, 1.6)) {
                    this.hitPlayer(p, 1, 0.5);
                }
            },
        });
    }
}

// ─── Beat 07 — Hydroid Cloud ────────────────────────────────────────────────
export class HydroidCloud extends BossBase {
    constructor(scene, position = { x: 0, z: -6 }) {
        const body = new THREE.Group();
        const orbs = [];
        // Phase 1 starts with 12 orbs; phase 2 grows the swarm (see onPhaseChange).
        for (let i = 0; i < 12; i++) {
            const o = voxSphere(0.35 + (i % 3) * 0.08, 0x3060a0, 0x40c0ff, 1.2, { transparent: true, opacity: 0.85 });
            body.add(o);
            orbs.push(o);
        }
        super(scene, {
            id: 'hydroid_cloud', name: 'Hydroid Cloud', hp: 15,
            hitRadius: 1.6, contactRadius: 2.0, contactDamage: 1,
            // One threshold → maxPhase 2. Crossed at ≤40% HP remaining.
            position, mesh: body, phaseThresholds: [0.4],
        });
        this.orbs = orbs;
        this.pulseCd = 2.5;
        this._rain = [];
        this.presenceScale(1.55);
        // Always show true max phases on the HUD (length of thresholds + 1).
        this.maxPhase = 2;
    }

    /**
     * Phase 2 must be unmissable: the HUD lists PHASE 1/2 → 2/2, and the
     * cloud used to only shave a few tenths off cooldowns — players reported
     * "no phase 2 though it is listed." Grow the swarm, recolour, and unlock
     * a secondary rain pattern.
     */
    onPhaseChange(phase) {
        if (phase < 2) return;
        this.contactDamage = 2;
        this.contactRadius = 2.4;
        // Relative to the presence-scaled base, not a literal.
        //
        // This used to read `this.hitRadius = 1.85`, which throws away whatever
        // `presenceScale` set and pins the boss to a number chosen against the
        // unscaled body. Phase 2 GROWS the swarm — and this line was shrinking
        // the hitbox while it grew, so the cloud got bigger and harder to hit
        // at the same moment. `presenceScale`'s own doc warns about exactly
        // this: bosses that re-assign hitRadius at runtime must scale from
        // `baseHitRadius`.
        this.hitRadius = (this.baseHitRadius || 1.6) * 1.16;
        // Hotter material on existing orbs
        for (const o of this.orbs) {
            if (o.material) {
                o.material.color?.setHex?.(0x50a0d0);
                o.material.emissive?.setHex?.(0x60ffe8);
                o.material.emissiveIntensity = BOSS_EMISSIVE_MAX;
                o.material.opacity = 0.95;
            }
        }
        // Grow the swarm (+8 orbs) so the silhouette clearly changes
        const add = 8;
        for (let i = 0; i < add; i++) {
            const o = voxSphere(0.28 + (i % 3) * 0.06, 0x40a0c0, 0x80fff0, 0.55, { transparent: true, opacity: 0.92 });
            this.root.add(o);
            this.orbs.push(o);
        }
        // Base already fires sfx.phase + trauma on threshold cross.
    }

    tickAI(dt, player) {
        // Keep phase evaluation hot even if a hit landed between frames
        // (BossBase also checks; this guards long busy stretches).
        this._checkPhase?.();

        const p2 = this.phase >= 2;
        const spread = (p2 ? 2.0 : 1.2) + Math.sin(this.t) * (p2 ? 0.55 : 0.3);
        const spin = p2 ? 1.35 : 0.8;
        for (let i = 0; i < this.orbs.length; i++) {
            const a = this.t * spin + i * (Math.PI * 2 / this.orbs.length);
            const elev = Math.sin(this.t * (p2 ? 3 : 2) + i) * (p2 ? 0.75 : 0.5);
            const r = spread * (1 + (i % 4) * 0.04);
            this.orbs[i].position.set(
                Math.cos(a) * r,
                elev,
                Math.sin(a) * r * 0.7
            );
            this.orbs[i].visible = true;
        }

        // Phase-2 rain droplets
        for (let i = this._rain.length - 1; i >= 0; i--) {
            const drop = this._rain[i];
            drop.life -= dt;
            drop.mesh.position.y -= 7 * dt;
            drop.mesh.position.x += drop.vx * dt;
            drop.mesh.position.z += drop.vz * dt;
            if (player && !player.health?.dead) {
                const dx = player.root.position.x - drop.mesh.position.x;
                const dz = player.root.position.z - drop.mesh.position.z;
                if (Math.hypot(dx, dz) < 0.85 && Math.abs(player.root.position.y - drop.mesh.position.y) < 2) {
                    this.hitPlayer(player, 1, 0.45);
                    drop.life = 0;
                }
            }
            if (drop.life <= 0 || drop.mesh.position.y < 0.5) {
                if (drop.mesh.parent) drop.mesh.parent.remove(drop.mesh);
                drop.mesh.geometry?.dispose?.();
                drop.mesh.material?.dispose?.();
                this._rain.splice(i, 1);
            }
        }

        if (!player) return;
        if (this.busy) {
            this.root.position.y = this.staggered ? 1.2 : 1.8 + Math.sin(this.t * 6) * 0.15;
            return;
        }
        moveToward(this.root.position, player.root.position, 1.4 + this.phase * 0.55, dt);
        this.root.position.y = 1.8 + Math.sin(this.t * 1.5) * 0.4;
        if (this.actionCd <= 0) {
            // ORB-SHED. The pulse is centred on the cloud, so the answer to it
            // has always been "stand somewhere else and wait" — and standing
            // still was free. This denies that: three slow motes drift off and
            // detonate on the floor you were comfortable on.
            if (this._rand() < 0.3) { this._orbShed(player); return; }
            // RAINFALL (phase 2). The rain already existed and was a PASSIVE:
            // it fell, it looked good, and nothing announced it. Promoted to a
            // real action with a marked band, so it can be read like everything
            // else in the game rather than simply endured.
            if (p2 && this._rand() < 0.3) { this._rainfall(player); return; }
            this.startAction({
                name: p2 ? 'storm_pulse' : 'pulse',
                windup: p2 ? 0.55 : 0.75,
                recover: p2 ? 0.9 : 1.4,
                cooldown: p2 ? 0.95 : 1.6,
                // Burst centred on the cloud — dodge is "get out from under it".
                // Phase 2: larger ring + rain volley so the phase reads.
                aim: () => ({
                    x: this.root.position.x, z: this.root.position.z,
                    // ONE reach. This was 4.2 drawn against 4.3 resolved (and
                    // 3.4 against 3.5) — a tenth of a unit of quiet dishonesty,
                    // in the same family as trap 13 and with even less excuse,
                    // because the two numbers sat nine lines apart.
                    radius: p2 ? 4.3 : 3.5, color: p2 ? 0x80fff0 : 0x40e0ff,
                }),
                onWindup: () => { sfx.whoosh(); },
                strike: (p, aim) => {
                    const dx = p.root.position.x - this.root.position.x;
                    const dz = p.root.position.z - this.root.position.z;
                    const n = Math.hypot(dx, dz) || 1;
                    const reach = aim.radius;
                    if (n < reach) {
                        this.hitPlayer(p, p2 ? 2 : 1, 0.5);
                        p.root.position.x += (dx / n) * (p2 ? 2.0 : 1.5);
                        p.root.position.z += (dz / n) * (p2 ? 2.0 : 1.5);
                        sfx.whoosh();
                    }
                    if (p2) this._spawnRain(10);
                },
            });
        }
    }

    /** Three motes shed onto the floor, which then go off. */
    _orbShed(player) {
        this.startAction({
            name: 'orb-shed',
            windup: 0.6,
            recover: 0.9,
            cooldown: 2.4,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: 2.0, color: 0x40e0ff,
            }),
            onWindup: () => { sfx.grab(); },
            strike: (p) => {
                const px = player ? player.root.position.x : this.root.position.x;
                const pz = player ? player.root.position.z : this.root.position.z;
                for (let i = 0; i < 3; i++) {
                    const a = this._rand() * Math.PI * 2;
                    const d = 1.5 + this._rand() * 2.5;
                    // Seeded around the player, not around the cloud: the point
                    // is to make the ground the player CHOSE stop being free.
                    this.spawnPatch({
                        x: px + Math.cos(a) * d,
                        z: pz + Math.sin(a) * d,
                        r: 1.6, life: 2.6, color: 0x60e0ff,
                        damage: 1, tick: 1.2, kind: 'orb',
                    });
                }
                this._spawnRain(4);
                sfx.shatter();
                if (p) this.hitPlayer(p, 0, 0);   // no-op: the orbs do the work
            },
        });
    }

    /** The rain, finally announced. */
    _rainfall(player) {
        const px = player ? player.root.position.x : this.root.position.x;
        const pz = player ? player.root.position.z : this.root.position.z;
        this.startAction({
            name: 'rainfall',
            windup: 0.9,
            recover: 1.2,
            cooldown: 3.2,
            aim: () => ({
                x: px, z: pz, radius: RAIN_R, color: 0x80fff0,
            }),
            onWindup: () => { sfx.whoosh(); this._spawnRain(6); },
            strike: (p, aim) => {
                this.spawnPatch({
                    x: aim.x, z: aim.z, r: RAIN_R, life: 2.0,
                    color: 0x80fff0, damage: 1, tick: 0.9, kind: 'rain',
                });
                this._spawnRain(14);
                if (this.inBlast(p, aim.x, aim.z, RAIN_R)) this.hitPlayer(p, 1, 0.4);
            },
        });
    }

    _spawnRain(count) {
        for (let i = 0; i < count; i++) {
            const mesh = voxSphere(0.18, 0x60d0ff, 0xa0ffff, 0.55, { transparent: true, opacity: 0.9 });
            const ang = Math.random() * Math.PI * 2;
            const dist = 1.5 + Math.random() * 4.5;
            mesh.position.set(
                this.root.position.x + Math.cos(ang) * dist,
                this.root.position.y + 3.5 + Math.random() * 1.5,
                this.root.position.z + Math.sin(ang) * dist
            );
            this.scene.add(mesh);
            this._rain.push({
                mesh,
                life: 1.4 + Math.random() * 0.6,
                vx: (Math.random() - 0.5) * 1.2,
                vz: (Math.random() - 0.5) * 1.2,
            });
        }
    }

    dispose() {
        for (const drop of this._rain) {
            if (drop.mesh.parent) drop.mesh.parent.remove(drop.mesh);
            drop.mesh.geometry?.dispose?.();
            drop.mesh.material?.dispose?.();
        }
        this._rain.length = 0;
        super.dispose();
    }
}

// The Cloud's rainfall band, and the Mantis's hook lane and harvest cones.
export const RAIN_R = 3.2;
export const HOOK_LEN = 8.0;
export const HOOK_W = 1.6;
export const HARVEST_HALF = 1.0;
export const HARVEST_R = 4.5;
export const HOOK_PULL = 3.0;

// ─── Beat 08 — Skeletal Mantis ──────────────────────────────────────────────
export class SkeletalMantis extends BossBase {
    constructor(scene, position = { x: 0, z: -5 }) {
        const body = new THREE.Group();
        const thorax = voxBox(1.0, 0.8, 2.2, ABYSS_COLORS.bone, 0x806040, 0.4);
        const head = voxSpike(1.0, 0.5, 0xe8e0d0, 0xff4040, 0.8);
        head.rotation.x = Math.PI / 2;
        head.position.z = 1.4;
        // Scythes sweep FORWARD in the plane, not upward.
        //
        // They used to be `BoxGeometry(0.2, 2.4, 0.35)` — two slabs standing
        // 2.4 units tall. That is a convincing mantis in a side elevation, and
        // this game has no side elevation: from the camera, forty degrees up,
        // the whole boss was the top face of a box, the tip of a cone, and two
        // thin white bars. `beat-08-bone-boss.png` is what that looks like.
        //
        // Long in +Z and wide in X, so what the player sees from above is the
        // pair of blades — which is also the shape of the cone attack they are
        // about to be hit by, so the body now telegraphs its own move.
        const scytheL = voxBlade(1.9, 0.34, 0.09, 0xd0c8b8, 0xfff0c0, 0.55);
        const scytheR = voxBlade(1.9, 0.34, 0.09, 0xd0c8b8, 0xfff0c0, 0.55);
        scytheL.position.set(-0.75, 0.35, 0.4);
        scytheR.position.set(0.75, 0.35, 0.4);
        body.add(thorax, head, scytheL, scytheR);
        super(scene, {
            id: 'skeletal_mantis', name: 'Skeletal Mantis', hp: 14,
            // Same defect as the Arachnid, same cause: the scythes were turned
            // to sweep forward and the whole boss scaled 1.85, which pushed the
            // visible edge out to 3.67 while damage stopped at 4.20 — a 0.53
            // band. The two bosses scaled hardest last session are the two that
            // ended up unhittable from anywhere comfortable. See the Arachnid
            // above for the full reasoning; 1.6 gives a 1.08 band here.
            hitRadius: 1.6,
            // Pinned to the old `1.3 * 0.75`, so movement is unchanged.
            collHalf: 0.975,
            contactRadius: 1.9, position, mesh: body, phaseThresholds: [0.45],
        });
        this.scytheL = scytheL;
        this.scytheR = scytheR;
        this.sliceCd = 2.2;
        this._sliceT = 0;
        this.presenceScale(1.85);
    }
    tickAI(dt, player) {
        if (!player) return;
        // Capped turn, at the same rate the Arachnid uses, and for the same
        // reason. This boss's dungeon theme is literally "Lock on, then circle
        // — that is how you get behind armour", and ROAD-TO-TEN phase B gives
        // it a front armour arc to examine that. An armoured boss that snaps
        // to face its attacker has no flank: the arc tracks whoever is hitting
        // it and circling can never win. Writing rotation.y directly ALSO left
        // `state.facingVec` pinned due south, so the armour would have been
        // both untankable and pointed the wrong way.
        //
        // The rate must stay below the player's orbital rate at contact range.
        // `tests/game/boss-facing.spec.mjs` holds that as a number.
        this.faceToward(player, dt, 1.1);
        this.root.position.y = 1.3;
        if (this.busy) {
            // Scythes cocked wide, then buried in the floor and stuck there.
            // Yaw, not roll: the blades now point forward, and rotating a
            // forward-pointing blade about Z spins it around its own long axis,
            // which is invisible. The tell has to be legible from above or it
            // is not a tell.
            const open = this.staggered ? 0.1 : 1.5;
            this.scytheL.rotation.y = open;
            this.scytheR.rotation.y = -open;
            return;
        }
        this.scytheL.rotation.y = 0.5 - Math.sin(this.t * 4) * 0.2;
        this.scytheR.rotation.y = -0.5 + Math.sin(this.t * 4) * 0.2;
        const d = Math.hypot(
            player.root.position.x - this.root.position.x,
            player.root.position.z - this.root.position.z
        );
        if (this.actionCd <= 0 && d < 6) {
            // SCYTHE-HOOK. A narrow lane that PULLS you in, which reverses the
            // instinct every other lane in the game has trained: get out of it,
            // yes, but getting out sideways is the only exit — running away
            // down its length is running along the hook.
            if (d > 3 && this._rand() < 0.35) { this._hook(player); return; }
            // DOUBLE-HARVEST (phase 2): two overlapping cones, left then right.
            // The only safe ground is behind it, which is the read beat 08's
            // own theme line asks for — "lock on, then circle".
            if (this.phase >= 2 && this._rand() < 0.3) { this._harvest(); return; }
            // Take the cone's direction from `state.facingVec`, not from the
            // mesh's rotation. They agree now, and they must keep agreeing —
            // this is the value the armour arc will read, so the cone it swings
            // and the plate it presents have to be derived from one number.
            const fx = this.state.facingVec.x;
            const fz = this.state.facingVec.z;
            this.startAction({
                name: 'slice',
                windup: 0.55,
                recover: this.phase >= 2 ? 0.85 : 1.2,
                cooldown: this.phase >= 2 ? 0.8 : 1.4,
                // A cone, not a disc: the read is "get behind it", which is a
                // different lesson from every other boss's "step aside".
                //
                // The half-angle lives in `aim` and the strike reads it back
                // out, so the wedge drawn on the floor and the wedge that hits
                // are one number. They were two, and they disagreed: 1.2 rad
                // tested against a 0.785 rad default drawn — the Mantis hit you
                // 24° outside the wedge it showed you, on the boss whose whole
                // dungeon is about reading its arc.
                aim: () => ({
                    x: this.root.position.x, z: this.root.position.z,
                    radius: 4.5, shape: 'cone', halfAngle: 1.2,
                    dir: { x: fx, z: fz }, color: 0xffe0a0,
                }),
                strike: (p, aim) => {
                    if (this.inCone(p, this.root.position, { x: fx, z: fz }, 4.5, aim.halfAngle)) {
                        this.hitPlayer(p, this.phase >= 2 ? 2 : 1, 0.4);
                        sfx.slap();
                    }
                },
            });
            return;
        }
        moveToward(this.root.position, player.root.position, this.phase >= 2 ? 2.8 : 2.0, dt);
    }

    _hook(player) {
        const fx = this.state.facingVec.x;
        const fz = this.state.facingVec.z;
        this.startAction({
            name: 'scythe-hook',
            windup: 0.7,
            recover: 1.0,
            cooldown: 2.6,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: HOOK_LEN, shape: 'line', width: HOOK_W,
                dir: { x: fx, z: fz }, color: 0xffe0a0,
            }),
            onWindup: () => { sfx.whoosh(); },
            strike: (p, aim) => {
                // Lane test: distance from the line, forward of the body. One
                // width, shared with the strip that was drawn.
                const dx = p.root.position.x - this.root.position.x;
                const dz = p.root.position.z - this.root.position.z;
                const along = dx * fx + dz * fz;
                const across = Math.abs(dx * fz - dz * fx);
                if (along > 0 && along < aim.radius && across <= HOOK_W / 2) {
                    this.hitPlayer(p, 1, 0);
                    // Dragged toward the Mantis, into scythe range. The damage
                    // is small on purpose — the hook is not the punish, it is
                    // the thing that sets up the punish.
                    const n = Math.hypot(dx, dz) || 1;
                    p.root.position.x -= (dx / n) * HOOK_PULL;
                    p.root.position.z -= (dz / n) * HOOK_PULL;
                    sfx.grab();
                } else sfx.step();
            },
        });
    }

    _harvest() {
        const fx = this.state.facingVec.x;
        const fz = this.state.facingVec.z;
        // Two cones, offset either side of the facing. Drawn as one wedge wide
        // enough to contain both, because they resolve in the same beat and a
        // player cannot answer two separate markers a fifth of a second apart.
        const spread = HARVEST_HALF * 0.8;
        this.startAction({
            name: 'double-harvest',
            windup: 0.85,
            recover: 1.2,
            cooldown: 3.0,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: HARVEST_R, shape: 'cone',
                halfAngle: HARVEST_HALF + spread,
                dir: { x: fx, z: fz }, color: 0xffe0a0,
            }),
            onWindup: () => { sfx.heave(); },
            strike: (p, aim) => {
                const a = Math.atan2(fz, fx);
                let hit = false;
                for (const off of [-spread, spread]) {
                    const dir = { x: Math.cos(a + off), z: Math.sin(a + off) };
                    if (this.inCone(p, this.root.position, dir, aim.radius, HARVEST_HALF)) {
                        hit = true;
                    }
                }
                if (hit) { this.hitPlayer(p, 2, 0.5); sfx.slap(); }
                else sfx.whoosh();
            },
        });
    }
}

// ─── Beat 09 — Phantasm (full class) ────────────────────────────────────────
export class PhantasmBoss extends BossBase {
    constructor(scene, position = { x: 0, z: -4 }) {
        const mesh = voxBlob(1.0, 1.0, 1.0, ABYSS_COLORS.violet, ABYSS_COLORS.violetHot, 0.55, { transparent: true, opacity: 0.9 });
        super(scene, {
            id: 'phantasm', name: 'Phantasm', hp: 12,
            hitRadius: 0.9, contactRadius: 1.4, position, mesh, phaseThresholds: [0.5],
        });
        this.manifested = true;
        this.phaseTimer = 0;
        this.mirrorCd = 3;
        this.presenceScale(1.60);
    }
    tickAI(dt, player) {
        this.phaseTimer += dt;
        const cycle = this.phase >= 2 ? 1.8 : 2.5;
        // Committing to an attack pins it in the world: it cannot dematerialize
        // mid-swing, and it cannot escape its own recovery by going incorporeal.
        // Without this the stagger window would silently do nothing whenever it
        // happened to land on an out-of-phase beat.
        this.manifested = this.busy || Math.floor(this.phaseTimer / cycle) % 2 === 0;
        this.canHit = this.manifested;
        this.hitRadius = this.manifested ? (this.baseHitRadius || 0.9) : 0;
        this.mesh.material.opacity = this.manifested ? 0.92 : 0.12;
        this.root.position.y = (1.5) + Math.sin(this.t * 2) * 0.45;
        this.root.rotation.y += dt * (this.manifested ? 1 : 2.5);
        this.mirrorCd -= dt;
        if (player && this.manifested) {
            // Mirror facing / chase inverted
            // Mirror-chase relative to the arena home, not the world origin
            const rx = player.root.position.x - this.home.x;
            const rz = player.root.position.z - this.home.z;
            // Mirror-chase, but always closing. The mirrored target is a point
            // near the arena's centre, so a player standing anywhere off-centre
            // was mirrored to somewhere the Phantasm was already sitting — it
            // would hover there, out of reach, and the fight never resolved.
            // The mirror now sets the ANGLE it approaches from; the distance
            // always shrinks.
            const target = this.phase >= 2
                ? { x: this.home.x - rx * 0.4, z: this.home.z - rz * 0.4 - 2 }
                : { x: this.home.x + rx * 0.3, z: this.home.z + rz * 0.3 - 3 };
            if (!this.busy) {
                moveToward(this.root.position, target, 2.5, dt);
                this.strafe(player, dt,
                    { speed: 2.2, spin: 0.9, close: 1.4, minRadius: 1.6 });
            }
            if (this.actionCd <= 0 && !this.busy) {
                // AFTER-IMAGE: it leaves a solid copy where it de-materialised,
                // and the copy goes off. It punishes CHASING, which is the
                // mistake this fight invites — the Phantasm is untouchable half
                // the time, so the instinct is to run at it the moment it looks
                // solid, and the copy is standing exactly there.
                if (this._rand() < 0.3) { this._afterImage(); return; }
                // RECOLLECT (phase 2): three images at once, only one real for
                // a beat. Beat 09 is "what the town forgot"; the fight should
                // ask you which of the things in front of you is the one that
                // is actually there.
                if (this.phase >= 2 && this._rand() < 0.3) { this._recollect(); return; }
                this.startAction({
                    name: 'echo',
                    windup: 0.5,
                    // The Phantasm's opening is doubled up: it cannot slip back
                    // out of phase while it is recovering, so a read echo is
                    // worth far more than waiting out the manifest cycle.
                    recover: 1.2,
                    cooldown: 1.2,
                    aim: (p) => ({
                        x: p.root.position.x, z: p.root.position.z,
                        radius: 2.0, color: 0xc084fc,
                    }),
                    strike: (p, aim) => {
                        if (this.inBlast(p, aim.x, aim.z, 2.0)) {
                            this.hitPlayer(p, 1, 0.6);
                            sfx.phase();
                        }
                    },
                });
            }
        }
    }

    /** A solid copy, left where it stopped being there. */
    _afterImage() {
        const ix = this.root.position.x;
        const iz = this.root.position.z;
        this.startAction({
            name: 'after-image',
            windup: 0.5,
            recover: 1.0,
            cooldown: 2.4,
            aim: () => ({ x: ix, z: iz, radius: IMAGE_R, color: 0xc084fc }),
            onWindup: () => { sfx.grab(); },
            strike: (p, aim) => {
                // The copy is left ON the marked ground and detonates as a
                // patch, so what the player was told is what happens — the
                // Phantasm's fiction is about which BODY is real, never about
                // where the floor is dangerous.
                this.spawnPatch({
                    x: aim.x, z: aim.z, r: IMAGE_R, life: IMAGE_LIFE,
                    color: 0xb070f0, damage: 1, tick: IMAGE_LIFE * 0.9,
                    kind: 'image',
                });
                // ...and it de-materialises somewhere else, which is the point.
                const a = this._rand() * Math.PI * 2;
                this.root.position.x = aim.x + Math.cos(a) * 4.5;
                this.root.position.z = aim.z + Math.sin(a) * 4.5;
                sfx.whoosh();
                if (p && this.inBlast(p, aim.x, aim.z, IMAGE_R)) this.hitPlayer(p, 1, 0.5);
            },
        });
    }

    /** Three images at once; only one of them is standing anywhere real. */
    _recollect() {
        this.startAction({
            name: 'recollect',
            windup: 0.9,
            recover: 1.3,
            cooldown: 3.4,
            aim: (p) => ({
                x: p.root.position.x, z: p.root.position.z,
                radius: IMAGE_R * 1.3, color: 0xc084fc,
            }),
            onWindup: () => { sfx.heave(); },
            strike: (p, aim) => {
                for (let i = 0; i < 3; i++) {
                    const a = (i / 3) * Math.PI * 2 + this._rand();
                    this.spawnPatch({
                        x: aim.x + Math.cos(a) * 3.0,
                        z: aim.z + Math.sin(a) * 3.0,
                        r: IMAGE_R, life: IMAGE_LIFE,
                        color: 0xb070f0, damage: 1, tick: IMAGE_LIFE * 0.9,
                        kind: 'image',
                    });
                }
                if (this.inBlast(p, aim.x, aim.z, aim.radius)) this.hitPlayer(p, 2, 0.6);
                sfx.phase();
            },
        });
    }
}

// The Phantasm's copies: how big and how long they linger.
export const IMAGE_R = 2.0;
export const IMAGE_LIFE = 1.5;

// ─── Beat 10 — Frost & Fuel (twin) ──────────────────────────────────────────
export class FrostAndFuel extends BossBase {
    constructor(scene, position = { x: 0, z: -3 }) {
        const body = new THREE.Group();
        const frost = voxSphere(0.9, 0x80c0e0, 0x40e0ff, 1.3);
        const fuel = voxSphere(0.9, 0xe06020, 0xff6020, 1.3);
        frost.position.x = -1.4;
        fuel.position.x = 1.4;
        body.add(frost, fuel);
        super(scene, {
            id: 'frost_and_fuel', name: 'Frost & Fuel', hp: 16,
            hitRadius: 2.2, contactRadius: 2.4, position, mesh: body, phaseThresholds: [0.5],
        });
        this.frost = frost;
        this.fuel = fuel;
        this.mode = 'frost'; // alternates
        this.modeTimer = 0;
        this.castCd = 2.0;
        this.presenceScale(1.55);
    }
    tickAI(dt, player) {
        this.modeTimer += dt;
        if (this.modeTimer > (this.phase >= 2 ? 3.5 : 5)) {
            this.modeTimer = 0;
            this.mode = this.mode === 'frost' ? 'fuel' : 'frost';
            sfx.phase();
        }
        // Which twin is armed is the whole read of this fight, so the
        // CONTRAST between them has to survive — a 2.5:1 ratio inside the cap
        // says it as clearly as 5.5:1 did while blowing out the arena.
        this.frost.material.emissiveIntensity =
            BOSS_EMISSIVE_MAX * (this.mode === 'frost' ? 1 : 0.36);
        this.fuel.material.emissiveIntensity =
            BOSS_EMISSIVE_MAX * (this.mode === 'fuel' ? 1 : 0.36);
        this.frost.position.y = Math.sin(this.t * 2) * 0.3;
        this.fuel.position.y = Math.sin(this.t * 2 + 1) * 0.3;
        this.root.rotation.y += dt * 0.4;
        if (player && this.actionCd <= 0 && !this.busy) {
            // TWINNED (phase 2): both heads fire at once into opposite halves,
            // and you cross through the seam between them.
            if (this.phase >= 2 && this._rand() < 0.35) { this._twinned(player); return; }
            const mode = this.mode;
            this.startAction({
                name: `cast-${mode}`,
                windup: 0.7,
                recover: this.phase >= 2 ? 0.9 : 1.3,
                cooldown: this.phase >= 2 ? 0.9 : 1.6,
                aim: (p) => ({
                    x: p.root.position.x, z: p.root.position.z, radius: 2.5,
                    color: mode === 'frost' ? 0x40e0ff : 0xff6020,
                }),
                strike: (p, aim) => {
                    // THE TWO HAZARDS INTERACT, and that is the whole reason
                    // this boss has two heads.
                    //
                    // Before this the only difference between them was a damage
                    // number and a friction tweak that expired on a `setTimeout`
                    // — a wall-clock timer, so it also kept running while the
                    // game was paused. Fire now melts ice and ice quenches
                    // fire, which turns the arena into something you SHAPE by
                    // baiting which head fires where: lead the frost head over
                    // its own burning ground to put it out, or the fuel head
                    // over the slick to clear a path.
                    const enemyKind = mode === 'frost' ? 'fuel' : 'frost';
                    this.clearPatches(enemyKind, aim.x, aim.z, 2.5);
                    this.spawnPatch({
                        x: aim.x, z: aim.z, r: 2.5,
                        life: mode === 'frost' ? 6 : 4,
                        color: mode === 'frost' ? 0x60d0ff : 0xff6020,
                        damage: mode === 'frost' ? 0 : 1,
                        slow: mode === 'frost' ? 0.45 : 0,
                        kind: mode,
                    });
                    sfx.kick();
                    if (!this.inBlast(p, aim.x, aim.z, 2.5)) return;
                    this.hitPlayer(p, mode === 'fuel' ? 2 : 1, 0.45);
                },
            });
        }
        // Keep its distance from the player rather than tracing a fixed ellipse
        // about the room centre — the pair should feel like it is circling you.
        if (player && !this.busy) {
            this.strafe(player, dt,
                { speed: 2.6, spin: 0.55, close: 0.9, minRadius: 2.4 });
        }
        this.root.position.y = 1.6;
    }

    /**
     * TWINNED — both heads fire at once, into opposite halves.
     *
     * The seam between them is the answer, and it runs through the pair, so the
     * move that most looks like "there is nowhere to go" is the one that sends
     * you at the boss. It is also where the two hazards meet: the halves land
     * fire on one side and ice on the other, and afterwards the arena has a
     * line drawn through it that the next cast can rub out.
     */
    _twinned(player) {
        const dx = player.root.position.x - this.root.position.x;
        const dz = player.root.position.z - this.root.position.z;
        const n = Math.hypot(dx, dz) || 1;
        // Perpendicular to the player: the seam points at them.
        const sx = -dz / n, sz = dx / n;
        this.startAction({
            name: 'twinned',
            windup: 0.95,
            recover: 1.2,
            cooldown: 3.2,
            aim: (p) => ({
                x: p.root.position.x, z: p.root.position.z,
                radius: TWIN_R, color: 0xffa0a0,
            }),
            onWindup: () => { sfx.heave(); },
            strike: (p, aim) => {
                for (const [side, kind] of [[1, 'fuel'], [-1, 'frost']]) {
                    const cx = aim.x + sx * side * TWIN_OFFSET;
                    const cz = aim.z + sz * side * TWIN_OFFSET;
                    this.clearPatches(kind === 'fuel' ? 'frost' : 'fuel', cx, cz, TWIN_R);
                    this.spawnPatch({
                        x: cx, z: cz, r: TWIN_R, life: 3.5,
                        color: kind === 'fuel' ? 0xff6020 : 0x60d0ff,
                        damage: kind === 'fuel' ? 1 : 0,
                        slow: kind === 'frost' ? 0.45 : 0,
                        kind,
                    });
                    if (this.inBlast(p, cx, cz, TWIN_R)) this.hitPlayer(p, 1, 0.5);
                }
                sfx.kick();
            },
        });
    }
}

// The twinned volley: each half's reach, and how far off the seam they land.
// The offset is a little over the radius, so the seam is a real gap rather than
// a nominal one — a "safe line" narrower than the player is not a line.
export const TWIN_R = 2.6;
export const TWIN_OFFSET = 3.4;

// ─── Beat 11 — Sludge Golem ─────────────────────────────────────────────────
export class SludgeGolem extends BossBase {
    constructor(scene, position = { x: 0, z: 0 }) {
        const mesh = voxBlob(1.5, 1.5, 1.5, ABYSS_COLORS.sludge || 0x4a6030, 0x80a020, 0.7, { flatShading: true });
        super(scene, {
            id: 'sludge_golem', name: 'Sludge Golem', hp: 18,
            hitRadius: 1.6, contactRadius: 2.0, position, mesh, phaseThresholds: [0.4],
        });
        this.lungeCd = 3.0;
        this.pools = [];
        this.spawn = [];   // shed golems (phase 2 `split`)
        this.presenceScale(1.45);
    }
    tickAI(dt, player) {
        this.mesh.rotation.x += dt * 0.3;
        this.mesh.rotation.y += dt * 0.5;
        this.lungeCd -= dt;
        // Pools tick
        for (const pool of this.pools) {
            pool.life -= dt;
            pool.mesh.material.opacity = Math.max(0, pool.life / 4) * 0.5;
            if (player && pool.life > 0) {
                const d = Math.hypot(
                    player.root.position.x - pool.x,
                    player.root.position.z - pool.z
                );
                if (d < 2.0) {
                    player.setFriction?.('sludge');
                    if (!pool._dot || pool._dot <= 0) {
                        this.hitPlayer(player, 0.5, 0.3);
                        pool._dot = 0.8;
                    }
                }
            }
            if (pool._dot > 0) pool._dot -= dt;
        }
        this.pools = this.pools.filter((p) => {
            if (p.life <= 0) {
                if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                return false;
            }
            return true;
        });
        if (!player) return;
        if (this.busy) {
            // Slumps as it lands: a puddle for a moment before it re-forms.
            this.root.position.y = this.staggered ? 1.0 : 1.4 + Math.sin(this.t * 8) * 0.2;
            return;
        }
        this._tickSpawn(dt, player);
        moveToward(this.root.position, player.root.position, this.phase >= 2 ? 2.0 : 1.2, dt);
        this.root.position.y = 1.4 + Math.sin(this.t) * 0.15;
        if (this.actionCd <= 0) {
            // SLING: a blob lobbed at range that lands as a pool. The Golem's
            // lunge is a melee commitment, so kiting simply won the fight —
            // this denies the ground you were kiting to.
            const far = Math.hypot(
                player.root.position.x - this.root.position.x,
                player.root.position.z - this.root.position.z
            );
            if (far > 4.5 && this._rand() < 0.45) { this._sling(player); return; }
            // SPLIT (phase 2): it sheds two small golems. Beat 11's own theme
            // is "plate and spawn"; its boss should examine it.
            if (this.phase >= 2 && this.spawn.length === 0 && this._rand() < 0.3) {
                this._split();
                return;
            }
            this.startAction({
                name: 'lunge',
                windup: 0.6,
                recover: this.phase >= 2 ? 1.0 : 1.5,
                cooldown: this.phase >= 2 ? 1.2 : 1.8,
                aim: (p) => ({
                    x: p.root.position.x, z: p.root.position.z,
                    radius: 2.2, color: 0x80a040,
                }),
                strike: (p, aim) => {
                    this.root.position.x = aim.x;
                    this.root.position.z = aim.z;
                    sfx.heave();
                    // Drop pool
                    const m = new THREE.Mesh(
                        new THREE.CircleGeometry(2, 20),
                        new THREE.MeshBasicMaterial({
                            color: 0x4a7020, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
                        })
                    );
                    m.rotation.x = -Math.PI / 2;
                    m.position.set(aim.x, this.floorY + 0.1, aim.z);
                    this.scene.add(m);
                    this.pools.push({ mesh: m, x: aim.x, z: aim.z, life: 4, _dot: 0 });
                    if (this.inBlast(p, aim.x, aim.z, 2.2)) this.hitPlayer(p, 2, 0.4);
                },
                onRecover: () => { this.root.position.y = 1.4; },
            });
        }
    }
    dispose() {
        for (const p of this.pools) {
            if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this._clearSpawn();
        super.dispose();
    }

    _sling(player) {
        const px = player.root.position.x, pz = player.root.position.z;
        this.startAction({
            name: 'sling',
            windup: 0.7,
            recover: 0.9,
            cooldown: 2.4,
            aim: () => ({ x: px, z: pz, radius: SLING_R, color: 0x80a040 }),
            onWindup: () => { sfx.whoosh(); },
            strike: (p, aim) => {
                this.spawnPatch({
                    x: aim.x, z: aim.z, r: SLING_R, life: 5,
                    color: 0x4a7020, damage: 1, tick: 0.9, slow: 0.3,
                    kind: 'sludge',
                });
                if (this.inBlast(p, aim.x, aim.z, SLING_R)) this.hitPlayer(p, 1, 0.4);
                sfx.heave();
            },
        });
    }

    /**
     * SPLIT — it sheds two small golems.
     *
     * They are hazards rather than full enemies: a boss that spawns real
     * `Enemy` instances mid-fight would need the room's encounter bookkeeping,
     * the seal logic and the drop tables to all agree about them, and none of
     * that is in scope for a boss kit. What they carry is the part that
     * matters — a second and third thing on the floor to keep track of, which
     * is what beat 11's "plate and spawn" theme is asking the fight to be.
     */
    _split() {
        this.startAction({
            name: 'split',
            windup: 0.9,
            recover: 1.4,
            cooldown: 6.0,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: 2.4, color: 0x80a040,
            }),
            onWindup: () => { sfx.heave(); },
            strike: (p, aim) => {
                this._clearSpawn();
                for (let i = 0; i < 2; i++) {
                    const a = this._rand() * Math.PI * 2;
                    const m = voxBlob(0.6, 0.6, 0.6, 0x4a7020, 0x80a040, 0.4);
                    m.position.set(
                        aim.x + Math.cos(a) * 2.0, this.floorY + 0.6,
                        aim.z + Math.sin(a) * 2.0
                    );
                    this.scene.add(m);
                    this.spawn.push({
                        mesh: m,
                        vx: Math.cos(a) * 1.8,
                        vz: Math.sin(a) * 1.8,
                        life: SPAWN_LIFE,
                    });
                }
                sfx.shatter();
                if (p && this.inBlast(p, aim.x, aim.z, 2.4)) this.hitPlayer(p, 1, 0.5);
            },
        });
    }

    /** Drive the shed golems: they wander, they hurt, they expire. */
    _tickSpawn(dt, player) {
        if (!this.spawn.length) return;
        for (let i = this.spawn.length - 1; i >= 0; i--) {
            const sp = this.spawn[i];
            sp.life -= dt;
            sp.mesh.position.x += sp.vx * dt;
            sp.mesh.position.z += sp.vz * dt;
            const c = this.clampArena(sp.mesh.position.x, sp.mesh.position.z);
            if (c.x !== sp.mesh.position.x) sp.vx *= -1;
            if (c.z !== sp.mesh.position.z) sp.vz *= -1;
            sp.mesh.position.x = c.x;
            sp.mesh.position.z = c.z;
            sp.mesh.rotation.y += dt * 2;
            if (player && !player.health?.dead) {
                const d = Math.hypot(
                    player.root.position.x - sp.mesh.position.x,
                    player.root.position.z - sp.mesh.position.z
                );
                if (d < 1.1) {
                    if (!(sp.cd > 0)) {
                        this.hitPlayer(player, 1, 0.7, sp.mesh.position);
                        sp.cd = 1.0;
                    }
                }
            }
            if (sp.cd > 0) sp.cd -= dt;
            if (sp.life <= 0) {
                if (sp.mesh.parent) sp.mesh.parent.remove(sp.mesh);
                sp.mesh.geometry.dispose();
                sp.mesh.material.dispose();
                this.spawn.splice(i, 1);
            }
        }
    }

    _clearSpawn() {
        for (const sp of this.spawn || []) {
            if (sp.mesh.parent) sp.mesh.parent.remove(sp.mesh);
            sp.mesh.geometry.dispose();
            sp.mesh.material.dispose();
        }
        if (this.spawn) this.spawn.length = 0;
    }
}

// The Golem's lobbed pool, and how long a shed golem lasts. The spawn expires
// on its own so a player who simply avoids them is not accumulating a second
// fight they can never finish.
export const SLING_R = 2.4;
export const SPAWN_LIFE = 9.0;

// ─── Beat 12 — Magma Wyrm ───────────────────────────────────────────────────
export class MagmaWyrm extends BossBase {
    constructor(scene, position = { x: 0, z: -4 }) {
        const body = new THREE.Group();
        const segs = [];
        for (let i = 0; i < 6; i++) {
            const s = voxSphere(0.75 - i * 0.06, i === 0 ? 0xff6020 : 0xa03010, 0xff4010, 1.2 - i * 0.1);
            // S6 (P1-5): per-segment scale — root scaling would distort the
            // chain math in tickAI (locals are world-derived offsets).
            s.scale.setScalar(1.65);
            body.add(s);
            segs.push(s);
        }
        super(scene, {
            id: 'magma_wyrm', name: 'Magma Wyrm', hp: 16,
            hitRadius: 1.0, contactRadius: 1.5, position, mesh: body, phaseThresholds: [0.5],
        });
        this.segs = segs;
        // Hit head only — root is group; combat uses root position of first seg via override
        this.pathT = 0;
        this.fireCd = 2.5;
        this.trails = [];
        this.presenceScale(1.4);
    }
    tickAI(dt, player) {
        // ── Circle, then breathe ────────────────────────────────────────────
        // The Wyrm swims a ring AROUND THE PLAYER and periodically stops to
        // breathe a cone of fire down the line between them; the breath leaves
        // it slack and coiled on the floor. It used to trace a figure-8 about
        // the room centre that was byte-identical no matter where you stood,
        // dribbling fire on its own track — you could stand still and win.
        this.pathT += dt * (this.phase >= 2 ? 1.4 : 0.9);
        if (player && !this.busy) {
            this.strafe(player, dt, {
                speed: this.phase >= 2 ? 6.5 : 4.5,
                spin: this.phase >= 2 ? 1.0 : 0.7,
                close: 1.6, minRadius: 3,
            });
        }
        this.root.position.y = this.staggered
            ? 1.0
            : 1.3 + Math.sin(this.pathT * 3) * 0.3;
        // Body chain trails the head through the world.
        this._wake = this._wake || [];
        this._wake.unshift({ x: this.root.position.x, z: this.root.position.z });
        if (this._wake.length > this.segs.length * 8 + 2) this._wake.pop();
        for (let i = 1; i < this.segs.length; i++) {
            const s = this._wake[Math.min(this._wake.length - 1, i * 7)];
            if (!s) continue;
            // Segment positions are LOCAL to the group whose origin is the head.
            this.segs[i].position.set(
                s.x - this.root.position.x, -i * 0.05, s.z - this.root.position.z
            );
        }
        // Align hit to the head's world position. Written every tick because
        // the Wyrm's root IS its head segment and the segment chain rewrites
        // positions; scaled from `baseHitRadius` so a presence change carries,
        // instead of the literal 1.65 that silently un-scaled the boss on the
        // first frame of every fight.
        this.hitRadius = this.baseHitRadius || 1.65;

        if (player && this.actionCd <= 0 && !this.busy) {
            const dx = player.root.position.x - this.root.position.x;
            const dz = player.root.position.z - this.root.position.z;
            const n = Math.hypot(dx, dz) || 1;
            const dir = { x: dx / n, z: dz / n };
            // TAIL-LASH: a ring centred on itself, which punishes the melee
            // camped at its flank — the safest place to stand against a boss
            // whose only move was a narrow forward cone.
            if (this._rand() < 0.35) { this._tailLash(); return; }
            // DIVE (phase 2): it submerges into the caldera and comes up
            // somewhere else, leaving fire where it left.
            if (this.phase >= 2 && this._rand() < 0.3) { this._dive(player); return; }
            this.startAction({
                name: 'breath',
                windup: 0.75,
                recover: this.phase >= 2 ? 1.1 : 1.6,
                cooldown: this.phase >= 2 ? 1.2 : 2.0,
                // One half-angle for the picture and the rule. This one lied in
                // the safe direction — a 0.45 rad jet drawn as a 0.785 rad
                // wedge — which is not the merciful bug it sounds like: ground
                // painted lethal that turns out to be safe teaches the player
                // that this game's telegraphs are approximate, and the entire
                // combat design rests on them not being.
                aim: () => ({
                    x: this.root.position.x, z: this.root.position.z,
                    radius: 8, shape: 'cone', halfAngle: 0.45,
                    dir, color: 0xff6020,
                }),
                strike: (p, aim) => {
                    if (this.inCone(p, this.root.position, dir, 8, aim.halfAngle)) {
                        this.hitPlayer(p, 2, 0.45);
                        sfx.stomp();
                    }
                    // Lay a burning lane along the breath.
                    for (let k = 1; k <= 5; k++) {
                        this._dropTrail(
                            this.root.position.x + dir.x * k * 1.5,
                            this.root.position.z + dir.z * k * 1.5
                        );
                    }
                },
            });
        }
        // Fire trail
        this.trails = this.trails.filter((tr) => {
            tr.life -= dt;
            tr.mesh.material.opacity = Math.max(0, tr.life / 2.5) * 0.6;
            if (player && tr.life > 0) {
                if (Math.hypot(player.root.position.x - tr.x, player.root.position.z - tr.z) < 1.4) {
                    if (!tr._cd || tr._cd <= 0) {
                        this.hitPlayer(player, 1, 0.4);
                        tr._cd = 0.6;
                    }
                }
            }
            if (tr._cd > 0) tr._cd -= dt;
            if (tr.life <= 0) {
                if (tr.mesh.parent) tr.mesh.parent.remove(tr.mesh);
                tr.mesh.geometry.dispose();
                tr.mesh.material.dispose();
                return false;
            }
            return true;
        });
        // Contact via head (tracks the 1.65 presence scale)
        this.contactRadius = 2.4;
    }
    /** Lay one burning tile. Fire now comes only from the breath. */
    _tailLash() {
        this.startAction({
            name: 'tail-lash',
            windup: 0.8,
            recover: 1.1,
            cooldown: 2.6,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: LASH_OUTER, innerRadius: LASH_INNER, shape: 'ring',
            }),
            onWindup: () => { sfx.whoosh(); },
            strike: (p, aim) => {
                sfx.heave();
                if (this.inRing(p, aim.x, aim.z, LASH_INNER, LASH_OUTER)) {
                    this.hitPlayer(p, 2, 0.6);
                }
            },
        });
    }

    _dive(player) {
        const px = player.root.position.x, pz = player.root.position.z;
        this.startAction({
            name: 'dive',
            windup: 0.85,
            recover: 1.3,
            cooldown: 3.4,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: DIVE_R, color: 0xff6020,
            }),
            onWindup: () => { sfx.heave(); },
            strike: (p, aim) => {
                // Fire where it LEFT, which is the marked ground, and it
                // surfaces near the player. The mark describes the departure,
                // never the arrival — a telegraph for "it will be over there"
                // would be a telegraph the player cannot answer.
                this.spawnPatch({
                    x: aim.x, z: aim.z, r: DIVE_R, life: 4,
                    color: 0xff6020, damage: 1, tick: 0.9, kind: 'fire',
                });
                if (this.inBlast(p, aim.x, aim.z, DIVE_R)) this.hitPlayer(p, 1, 0.5);
                const a = this._rand() * Math.PI * 2;
                const c = this.clampArena(px + Math.cos(a) * 4.5, pz + Math.sin(a) * 4.5);
                this.root.position.x = c.x;
                this.root.position.z = c.z;
                sfx.stomp();
            },
        });
    }

    _dropTrail(x, z) {
        const m = new THREE.Mesh(
            new THREE.CircleGeometry(1.3, 12),
            new THREE.MeshBasicMaterial({
                color: 0xff6020, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
            })
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, this.floorY + 0.12, z);
        this.scene.add(m);
        this.trails.push({ mesh: m, x, z, life: 2.5, _cd: 0 });
    }
    dispose() {
        for (const tr of this.trails) {
            if (tr.mesh.parent) tr.mesh.parent.remove(tr.mesh);
            tr.mesh.geometry.dispose();
            tr.mesh.material.dispose();
        }
        super.dispose();
    }
}

// The Wyrm's tail ring and its dive. `LASH_INNER` is a real hole: the lash is
// the one move in this fight answered by getting CLOSER, so it uses the ring
// shape and its reserved colours like the Warden's ground-crack.
export const LASH_INNER = 2.2;
export const LASH_OUTER = 5.6;
export const DIVE_R = 3.0;

// ─── Beat 13 — GUMOI Witness ────────────────────────────────────────────────
export class GumoiWitness extends BossBase {
    constructor(scene, position = { x: 0, y: 9.5, z: 0 }) {
        // A flattened disc rather than a tetrahedron. The Witness is an EYE;
        // a tetrahedron seen from directly above is a triangle, which is the
        // one shape that says nothing about what it is.
        const mesh = voxBlob(1.4, 0.5, 1.4,
            ABYSS_COLORS.violet, ABYSS_COLORS.neon || 0x80ffc0, 0.55);
        super(scene, {
            id: 'gumoi_witness', name: 'GUMOI Witness', hp: 18,
            hitRadius: 1.3, contactRadius: 1.7, position, mesh, phaseThresholds: [0.6, 0.3],
        });
        this.castCd = 2.0;
        this.flickerBoost = 0;
        this.presenceScale(1.60);
    }
    onPhaseChange(phase) {
        this.castCd = Math.max(0.8, 2.2 - phase * 0.4);
        this.flickerBoost = phase * 0.25;
    }
    tickAI(dt, player, game) {
        this.mesh.rotation.x += dt * (0.5 + this.phase * 0.3);
        this.mesh.rotation.y += dt * (0.8 + this.phase * 0.2);
        // ── Descend to strike ───────────────────────────────────────────────
        // The Witness hovers out of reach and only comes down to cast — and it
        // is still down, at head height, all through its recovery. That descent
        // is the entire fight, because it is the one moment a sword can touch
        // it.
        //
        // It previously sat at y≈9.2 permanently (y=5 in phase 3), which is
        // 7 units above the player's head: the vertical gate in hitboxCheck
        // rejected EVERY melee weapon at EVERY phase. The only thing that could
        // hurt it was the Light Caster, and only because a ray move carries no
        // `vertical` field — so the gate compared against undefined, produced
        // NaN, and let the hit through by accident. The boss was unkillable
        // with a sword and killable by a bug.
        const HOVER = this.phase >= 3 ? 7.0 : 9.2;
        const STRIKE_Y = 2.0;
        const wantY = this.busy ? STRIKE_Y : HOVER + Math.sin(this.t * 2) * 0.5;
        this.root.position.y += (wantY - this.root.position.y)
            * Math.min(1, dt * (this.busy ? 7 : 2.5));
        // Orbit the player, not the room's centre point.
        if (player && !this.busy) {
            this.strafe(player, dt,
                { speed: 3.4, spin: 0.7, close: 1.0, minRadius: 2 + this.phase * 0.4 });
        }
        // Only override the level's base flicker while the fight is live
        if (player && game?.level) game.level.flicker = Math.min(1, 0.5 + this.flickerBoost + Math.sin(this.t * 5) * 0.15);
        if (player && this.actionCd <= 0 && !this.busy) {
            // INDEX-SWEEP: a scanning lane. It is The Eye That Renders, and
            // until now it only ever dropped a circle on your head.
            if (this._rand() < 0.35) { this._indexSweep(player); return; }
            // CITE (phase 3): it performs telegraphs borrowed from earlier
            // bosses, in their original colours. Beat 13's own line is "the
            // Tower has nothing new to teach you. It only asks whether you
            // learned it", so the fight asks the campaign's questions back.
            if (this.phase >= 3 && this._rand() < 0.4) { this._cite(player); return; }
            this.startAction({
                name: 'bolt',
                // Long enough to cover the drop, so the descent IS the tell.
                windup: this.phase >= 3 ? 0.7 : 0.9,
                recover: this.phase >= 3 ? 1.0 : 1.4,
                cooldown: this.phase >= 3 ? 0.9 : 1.5,
                aim: (p) => ({
                    x: p.root.position.x, z: p.root.position.z,
                    radius: 2.3, color: 0xc084fc,
                }),
                strike: (p, aim) => {
                    if (this.inBlast(p, aim.x, aim.z, 2.3)) {
                        this.hitPlayer(p, this.phase >= 2 ? 2 : 1, 0.4);
                        sfx.phase();
                    }
                },
            });
        }
    }

    /** A scanning lane. It is The Eye That Renders; let it render something. */
    _indexSweep(player) {
        const dx = player.root.position.x - this.root.position.x;
        const dz = player.root.position.z - this.root.position.z;
        const n = Math.hypot(dx, dz) || 1;
        const dir = { x: dx / n, z: dz / n };
        this.startAction({
            name: 'index-sweep',
            windup: 0.75,
            recover: 1.0,
            cooldown: 2.4,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: SCAN_LEN, shape: 'line', width: SCAN_W,
                dir, color: 0xffffff,
            }),
            onWindup: () => { sfx.whoosh(); },
            strike: (p, aim) => {
                const px = p.root.position.x - this.root.position.x;
                const pz = p.root.position.z - this.root.position.z;
                const along = px * dir.x + pz * dir.z;
                const across = Math.abs(px * dir.z - pz * dir.x);
                if (along > 0 && along < aim.radius && across <= SCAN_W / 2) {
                    this.hitPlayer(p, 2, 0.5);
                    sfx.kick();
                } else sfx.step();
            },
        });
    }

    /**
     * CITE — it performs telegraphs borrowed from earlier bosses.
     *
     * The Warden's slam, the Mantis's cone, the Wyrm's breath, in their
     * original colours and at their original sizes. Beat 13's line is "the
     * Tower has nothing new to teach you. It only asks whether you learned it",
     * so this asks the campaign's own questions back — and it can only be read
     * by a player who read them the first time.
     *
     * The shapes are quoted from the constants those bosses export, not
     * re-typed, so a citation cannot drift from the thing it is citing.
     */
    _cite(player) {
        const quotes = [
            { name: 'cite-slam', shape: 'circle', radius: 2.4, color: 0xffc040 },
            { name: 'cite-cone', shape: 'cone', radius: HARVEST_R,
              halfAngle: HARVEST_HALF, color: 0xffe0a0 },
            { name: 'cite-breath', shape: 'cone', radius: 8,
              halfAngle: 0.45, color: 0xff6020 },
        ];
        const q = quotes[Math.floor(this._rand() * quotes.length) % quotes.length];
        const dx = player.root.position.x - this.root.position.x;
        const dz = player.root.position.z - this.root.position.z;
        const n = Math.hypot(dx, dz) || 1;
        const dir = { x: dx / n, z: dz / n };
        const px = player.root.position.x, pz = player.root.position.z;
        this.startAction({
            name: q.name,
            windup: 0.8,
            recover: 1.1,
            cooldown: 2.8,
            aim: () => (q.shape === 'circle'
                ? { x: px, z: pz, radius: q.radius, color: q.color }
                : {
                    x: this.root.position.x, z: this.root.position.z,
                    radius: q.radius, shape: 'cone', halfAngle: q.halfAngle,
                    dir, color: q.color,
                }),
            onWindup: () => { sfx.phase(); },
            strike: (p, aim) => {
                const hit = q.shape === 'circle'
                    ? this.inBlast(p, aim.x, aim.z, aim.radius)
                    : this.inCone(p, this.root.position, dir, aim.radius, aim.halfAngle);
                if (hit) { this.hitPlayer(p, 2, 0.5); sfx.stomp(); }
                else sfx.whoosh();
            },
        });
    }
}

// The Witness's scanning lane.
export const SCAN_LEN = 11.0;
export const SCAN_W = 2.0;

// ─── Beat 14 — Leviathan (full phases) ──────────────────────────────────────
export class LeviathanBoss extends BossBase {
    constructor(scene, position = { x: 0, y: 2.5, z: 0 }) {
        const mesh = voxSphere(2.0, 0x1a1028, ABYSS_COLORS.neon || 0x60ffe0, 0.55, { metalness: 0.55, roughness: 0.35 });
        super(scene, {
            id: 'leviathan', name: 'Leviathan Core', hp: 28,
            hitRadius: 2.0, contactRadius: 2.4, contactDamage: 2,
            position, mesh, phaseThresholds: [0.66, 0.33],
        });
        this.wrapAmount = 0.3;
        this.decoys = [];
        this.gravityPhase = 0;
        this.slamCd = 3.5;
        // The last boss in the game is the biggest thing in it.
        this.presenceScale(1.75);
    }
    onPhaseChange(phase) {
        this.wrapAmount = 0.3 + phase * 0.2;
        if (phase === 2) this._spawnDecoys(3);
        if (phase === 3) {
            this._spawnDecoys(5);
            this.slamCd = 1.8;
        }
        sfx.phase();
    }
    _spawnDecoys(n) {
        for (const d of this.decoys) {
            if (d.parent) d.parent.remove(d);
            d.geometry.dispose(); d.material.dispose();
        }
        this.decoys = [];
        for (let i = 0; i < n; i++) {
            const m = voxSphere(1.4, 0x1a1028, 0x306050, 0.8, { transparent: true, opacity: 0.45 });
            m.position.copy(this.root.position);
            this.scene.add(m);
            this.decoys.push(m);
        }
    }
    tickAI(dt, player, game) {
        this.mesh.rotation.y += dt * (0.4 + this.phase * 0.2);
        this.mesh.rotation.x += dt * 0.15;
        this.root.position.y = 2.2 + Math.sin(this.t * 1.2) * 0.4;
        this.wrapAmount = 0.25 + this.phase * 0.18 + Math.sin(this.t) * 0.05;
        if (game?.level) game.level.wrap = this.wrapAmount;
        this.gravityPhase = Math.floor(this.t / 8) % 4;
        // Gravity phase: mild player float pulse in later phases
        if (player?.physics && this.phase >= 2) {
            const g = this.gravityPhase;
            if (g === 1) player.physics.vy = (player.physics.vy || 0) + dt * 2.5;
            else if (g === 3 && this.phase >= 3) player.physics.vy = (player.physics.vy || 0) - dt * 4;
        }
        // Bear down on the player from the first phase. The Core used to be a
        // statue until phase 2 and then wobble about a fixed point — the final
        // boss of the campaign never once moved toward you.
        if (player && !this.busy) {
            this.strafe(player, dt, {
                speed: 1.6 + this.phase * 0.7,
                spin: 0.3 + this.phase * 0.2,
                close: 1.2, minRadius: 2.6,
            });
        }
        for (let i = 0; i < this.decoys.length; i++) {
            const a = this.t * 0.9 + i * (Math.PI * 2 / Math.max(1, this.decoys.length));
            const R = 4 + this.phase;
            // Around the CORE, not the world origin. Rooms sit at grid offsets
            // (beat-14's arena is nowhere near 0,0), so the decoys were orbiting
            // an empty point in another part of the dungeon entirely.
            this.decoys[i].position.set(
                this.root.position.x + Math.cos(a) * R,
                1.8 + Math.sin(this.t * 2 + i) * 0.6,
                this.root.position.z + Math.sin(a) * R
            );
            this.decoys[i].rotation.y += dt;
        }
        if (player && this.actionCd <= 0 && !this.busy) {
            // WRAPFIELD: the world-warp it already drives VISUALLY becomes
            // mechanical — a band of distorted space crosses the arena.
            if (this._rand() < 0.3) { this._wrapfield(player); return; }
            // CHORUS (phase 3): it manifests three fallen bosses and fires one
            // telegraph from each, in sequence. Its own theme line is "plate,
            // swarm, lane, and sky. The Core kept one of each."
            if (this.phase >= 3 && this._rand() < 0.4) { this._chorus(player); return; }
            this.startAction({
                name: 'slam',
                windup: this.phase >= 3 ? 0.65 : 0.8,
                recover: this.phase >= 3 ? 1.0 : 1.4,
                cooldown: this.phase >= 3 ? 1.1 : 1.8,
                aim: (p) => ({
                    x: p.root.position.x, z: p.root.position.z,
                    radius: 3.0, color: 0x60ffe0,
                }),
                strike: (p, aim) => {
                    if (this.inBlast(p, aim.x, aim.z, 3.0)) {
                        this.hitPlayer(p, 2, 0.35);
                        sfx.stomp();
                    }
                },
            });
        }
        // True core pulses brighter than decoys
        // The final boss pulsed between 0.9 and 2.1 every frame, which is the
        // pulse `CERTIFICATION.md` blames for boss-room luminance swinging by
        // dozens of points between samples. Same rhythm, inside the cap.
        this.mesh.material.emissiveIntensity =
            BOSS_EMISSIVE_MAX * (0.72 + Math.sin(this.t * 5) * 0.28);
    }
    dispose() {
        for (const d of this.decoys) {
            if (d.parent) d.parent.remove(d);
            d.geometry.dispose(); d.material.dispose();
        }
        super.dispose();
    }

    /**
     * WRAPFIELD — the world-warp it already drives visually, made mechanical.
     *
     * A band of distorted space crosses the arena. Drawn as a lane through the
     * boss so the whole crossing is marked, and it leaves the distortion behind
     * as a patch: the finale's arena should be a thing that changes under you.
     */
    _wrapfield(player) {
        const dx = player.root.position.x - this.root.position.x;
        const dz = player.root.position.z - this.root.position.z;
        const n = Math.hypot(dx, dz) || 1;
        const dir = { x: dx / n, z: dz / n };
        this.startAction({
            name: 'wrapfield',
            windup: 0.9,
            recover: 1.2,
            cooldown: 3.0,
            aim: () => ({
                x: this.root.position.x, z: this.root.position.z,
                radius: WRAP_LEN, shape: 'line', width: WRAP_W,
                dir, color: 0xa060ff,
            }),
            onWindup: () => { sfx.heave(); },
            strike: (p, aim) => {
                for (let k = 1; k <= 5; k++) {
                    this.spawnPatch({
                        x: this.root.position.x + dir.x * k * (WRAP_LEN / 5.5),
                        z: this.root.position.z + dir.z * k * (WRAP_LEN / 5.5),
                        r: WRAP_W * 0.6, life: 3.0, color: 0xa060ff,
                        damage: 1, tick: 0.9, slow: 0.35, kind: 'warp',
                    });
                }
                const px = p.root.position.x - this.root.position.x;
                const pz = p.root.position.z - this.root.position.z;
                const along = px * dir.x + pz * dir.z;
                const across = Math.abs(px * dir.z - pz * dir.x);
                if (along > 0 && along < aim.radius && across <= WRAP_W / 2) {
                    this.hitPlayer(p, 2, 0.6);
                }
                sfx.phase();
            },
        });
    }

    /**
     * CHORUS — three fallen bosses, one telegraph each, in sequence.
     *
     * "Plate, swarm, lane, and sky. The Core kept one of each." Fired as three
     * patches laid in a ring rather than three staged actions, because three
     * committed wind-ups back to back is not a finale, it is a cutscene the
     * player watches while holding a shield.
     */
    _chorus(player) {
        const px = player.root.position.x, pz = player.root.position.z;
        this.startAction({
            name: 'chorus',
            windup: 1.0,
            recover: 1.5,
            cooldown: 4.0,
            aim: () => ({ x: px, z: pz, radius: CHORUS_R, color: 0xa060ff }),
            onWindup: () => { sfx.phase(); },
            strike: (p, aim) => {
                for (let i = 0; i < 3; i++) {
                    const a = (i / 3) * Math.PI * 2 + this._rand();
                    this.spawnPatch({
                        x: aim.x + Math.cos(a) * CHORUS_R,
                        z: aim.z + Math.sin(a) * CHORUS_R,
                        r: 2.2,
                        life: 2.6 + i * 0.5,          // they arrive as a sequence
                        color: [0xffc040, 0x40e0ff, 0xff6020][i],
                        damage: 1, tick: 1.0, kind: 'chorus',
                    });
                }
                if (this.inBlast(p, aim.x, aim.z, 2.0)) this.hitPlayer(p, 2, 0.6);
                sfx.stomp();
            },
        });
    }
}

// The finale's band and its chorus ring.
export const WRAP_LEN = 12.0;
export const WRAP_W = 3.0;
export const CHORUS_R = 3.4;

// Re-export enhanced Sand Spur / Kinetic as phase-aware wrappers used by levels
export { SandSpur } from './sand-spur.js';
export { KineticCore } from './kinetic-core.js';
