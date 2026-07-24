// All 14 narrative bosses — unique multi-phase arena mechanics.

import * as THREE from 'three';
import { BossBase, moveToward, bounceArena, circleStrafe } from './base.js';
import { sfx } from '../../audio/synth.js';
import { ABYSS_COLORS, CRUST_COLORS } from '../assets/palettes.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { fillBox } from '../../voxel/helpers.js';

function mat(color, emissive = 0x000000, ei = 0.6, extras = {}) {
    return new THREE.MeshStandardMaterial({
        color, emissive, emissiveIntensity: ei, roughness: 0.55, metalness: 0.25, ...extras,
    });
}

// ─── Beat 01 — Crypt Warden ─────────────────────────────────────────────────
export class CryptWarden extends BossBase {
    constructor(scene, position = { x: 0, z: -4 }) {
        const body = new THREE.Group();
        const torso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1.0), mat(CRUST_COLORS.slate, 0x402010, 0.5));
        torso.position.y = 0.2;
        const helm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.1), mat(CRUST_COLORS.iron, CRUST_COLORS.goldLeaf, 1.2));
        helm.position.y = 1.6;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 0.35), mat(0xc0c8d8, 0x80a0ff, 0.8));
        blade.position.set(1.1, 0.4, 0);
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
        // Face player
        const dx = player.root.position.x - this.root.position.x;
        const dz = player.root.position.z - this.root.position.z;
        this.root.rotation.y = Math.atan2(dx, dz);
        if (this.busy) {
            // Blade held overhead through the wind-up, dropped during recovery:
            // the posture alone should tell you which half of the loop this is.
            this.blade.rotation.z = this.staggered ? 1.4 : -0.2;
            return;
        }
        this.blade.rotation.z = Math.sin(this.t * 3) * 0.3;
        if (this.actionCd <= 0 && d < 9) {
            this.startAction({
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
            });
            return;
        }
        // Slow stalk
        if (d > 2) moveToward(this.root.position, player.root.position, this.phase >= 2 ? 2.4 : 1.6, dt);
    }
}

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
            const mesh = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.95, 0),
                mat(opts.color || CRUST_COLORS.slate, opts.emissive || 0x40c0ff, 1.4)
            );
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
                    mesh.material.emissiveIntensity = 2.8;
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
        const u = (this.cycleT % period) / period;
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
        if (player && !spent) {
            const rate = Math.min(1, dt * (this.phase >= 2 ? 0.5 : 0.32));
            this.hub.x += (player.root.position.x - this.hub.x) * rate;
            this.hub.z += (player.root.position.z - this.hub.z) * rate;
        }
        const want = this.phase >= 2 ? 3.4 : 4.2;
        this.ringR = this.ringR == null ? want : this.ringR;
        if (!spent) this.ringR += (want - this.ringR) * Math.min(1, dt * 1.1);

        const spin = spent ? 0.15 : 0.6;
        for (let i = 0; i < this.cores.length; i++) {
            const c = this.cores[i];
            if (c.state.current === 'DEAD') continue;
            const ang = this.t * spin + i * (Math.PI * 2 / 3);
            c.mesh.position.x = this.hub.x + Math.cos(ang) * this.ringR;
            c.mesh.position.z = this.hub.z + Math.sin(ang) * this.ringR;
            c.mesh.position.y = spent
                ? 1.15 + Math.sin(this.t * 3 + i) * 0.08   // sunk to head height
                : c.home.y + Math.sin(this.t * 2 + i) * 0.25;
            c.mesh.rotation.y += dt * (1 + i * 0.3);
            c.mesh.material.emissiveIntensity = charging
                ? 2.6 + Math.sin(this.t * 22) * 0.9
                : spent ? 0.35 : 1.0 + Math.sin(this.t * 4 + i) * 0.5;
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
                        0.55
                    )) {
                        if (!this._beamCd || this._beamCd <= 0) {
                            this.hitPlayer(player, 1, 0.6);
                            this._beamCd = 0.8;
                        }
                    }
                }
            }
        }
        if (this._beamCd > 0) this._beamCd -= dt;
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
    dispose() {
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
        const core = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), mat(0x3a2860, ABYSS_COLORS.violetHot, 1.5));
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.6, 0.12, 8, 32),
            mat(CRUST_COLORS.goldLeaf, CRUST_COLORS.goldLeaf, 1.8)
        );
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
        this.presenceScale(1.15);
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
            const m = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.9, 0),
                mat(0x2a1840, ABYSS_COLORS.violet, 0.9, { transparent: true, opacity: 0.45 })
            );
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
            this.core.material.emissiveIntensity = 1.9;
        }
        for (const c of this.clones) {
            c.material.opacity = 0.4;
            c.material.emissiveIntensity = 0.45;
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
                circleStrafe(this.root.position, player, dt,
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
            this.startAction({
                name: 'bolt',
                windup: this.phase >= 3 ? 0.5 : 0.65,
                recover: this.phase >= 3 ? 0.7 : 1.0,
                cooldown: this.phase >= 3 ? 0.8 : 1.3,
                aim: (p) => ({
                    x: p.root.position.x, z: p.root.position.z,
                    radius: 2.2, color: 0xc084fc,
                }),
                onWindup: () => { this.ring.material.emissiveIntensity = 3.2; },
                strike: (p, aim) => {
                    if (this.inBlast(p, aim.x, aim.z, 2.2)) {
                        this.hitPlayer(p, this.phase, 0.5);
                        sfx.phase();
                    }
                },
                onRecover: () => { this.ring.material.emissiveIntensity = 1.8; },
            });
        }
    }
    dispose() {
        for (const c of this.clones) {
            if (c.parent) c.parent.remove(c);
            c.geometry?.dispose(); c.material?.dispose();
        }
        super.dispose();
    }
}

// ─── Beat 06 — Obsidian Arachnid ────────────────────────────────────────────
export class ObsidianArachnid extends BossBase {
    constructor(scene, position = { x: 0, z: -2 }) {
        const body = new THREE.Group();
        const abdomen = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 12), mat(0x3a2850, 0x6020a0, 1.1));
        abdomen.scale.set(1.3, 0.9, 1.5);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), mat(0x462a52, 0xff2040, 1.4));
        head.position.set(0, 0.2, 1.2);
        body.add(abdomen, head);
        const legs = [];
        for (let i = 0; i < 8; i++) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.8), mat(0x3a2f44, 0x401060, 0.7));
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
            hitRadius: 1.4, contactRadius: 1.8, position, mesh: body, phaseThresholds: [0.5],
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
        this.presenceScale(1.3);
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
}

// ─── Beat 07 — Hydroid Cloud ────────────────────────────────────────────────
export class HydroidCloud extends BossBase {
    constructor(scene, position = { x: 0, z: -6 }) {
        const body = new THREE.Group();
        const orbs = [];
        // Phase 1 starts with 12 orbs; phase 2 grows the swarm (see onPhaseChange).
        for (let i = 0; i < 12; i++) {
            const o = new THREE.Mesh(
                new THREE.SphereGeometry(0.35 + (i % 3) * 0.08, 8, 8),
                mat(0x3060a0, 0x40c0ff, 1.2, { transparent: true, opacity: 0.85 })
            );
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
        this.presenceScale(1.35);
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
        this.hitRadius = 1.85;
        // Hotter material on existing orbs
        for (const o of this.orbs) {
            if (o.material) {
                o.material.color?.setHex?.(0x50a0d0);
                o.material.emissive?.setHex?.(0x60ffe8);
                o.material.emissiveIntensity = 2.0;
                o.material.opacity = 0.95;
            }
        }
        // Grow the swarm (+8 orbs) so the silhouette clearly changes
        const add = 8;
        for (let i = 0; i < add; i++) {
            const o = new THREE.Mesh(
                new THREE.SphereGeometry(0.28 + (i % 3) * 0.06, 8, 8),
                mat(0x40a0c0, 0x80fff0, 2.0, { transparent: true, opacity: 0.92 })
            );
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
            this.startAction({
                name: p2 ? 'storm_pulse' : 'pulse',
                windup: p2 ? 0.55 : 0.75,
                recover: p2 ? 0.9 : 1.4,
                cooldown: p2 ? 0.95 : 1.6,
                // Burst centred on the cloud — dodge is "get out from under it".
                // Phase 2: larger ring + rain volley so the phase reads.
                aim: () => ({
                    x: this.root.position.x, z: this.root.position.z,
                    radius: p2 ? 4.2 : 3.4, color: p2 ? 0x80fff0 : 0x40e0ff,
                }),
                onWindup: () => { sfx.whoosh(); },
                strike: (p) => {
                    const dx = p.root.position.x - this.root.position.x;
                    const dz = p.root.position.z - this.root.position.z;
                    const n = Math.hypot(dx, dz) || 1;
                    const reach = p2 ? 4.3 : 3.5;
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

    _spawnRain(count) {
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 6, 6),
                mat(0x60d0ff, 0xa0ffff, 2.2, { transparent: true, opacity: 0.9 })
            );
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

// ─── Beat 08 — Skeletal Mantis ──────────────────────────────────────────────
export class SkeletalMantis extends BossBase {
    constructor(scene, position = { x: 0, z: -5 }) {
        const body = new THREE.Group();
        const thorax = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 2.2), mat(ABYSS_COLORS.bone, 0x806040, 0.4));
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 6), mat(0xe8e0d0, 0xff4040, 0.8));
        head.rotation.x = Math.PI / 2;
        head.position.z = 1.4;
        const scytheL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.35), mat(0xd0c8b8, 0xfff0c0, 0.6));
        const scytheR = scytheL.clone();
        scytheL.position.set(-1.0, 0.5, 0.5);
        scytheR.position.set(1.0, 0.5, 0.5);
        body.add(thorax, head, scytheL, scytheR);
        super(scene, {
            id: 'skeletal_mantis', name: 'Skeletal Mantis', hp: 14,
            hitRadius: 1.3, contactRadius: 1.9, position, mesh: body, phaseThresholds: [0.45],
        });
        this.scytheL = scytheL;
        this.scytheR = scytheR;
        this.sliceCd = 2.2;
        this._sliceT = 0;
        this.presenceScale(1.1);
    }
    tickAI(dt, player) {
        if (!player) return;
        const dx = player.root.position.x - this.root.position.x;
        const dz = player.root.position.z - this.root.position.z;
        this.root.rotation.y = Math.atan2(dx, dz);
        this.root.position.y = 1.3;
        if (this.busy) {
            // Scythes cocked wide, then buried in the floor and stuck there.
            const open = this.staggered ? 0.1 : 1.5;
            this.scytheL.rotation.z = -open;
            this.scytheR.rotation.z = open;
            return;
        }
        this.scytheL.rotation.z = -0.5 + Math.sin(this.t * 4) * 0.2;
        this.scytheR.rotation.z = 0.5 - Math.sin(this.t * 4) * 0.2;
        const d = Math.hypot(dx, dz);
        if (this.actionCd <= 0 && d < 6) {
            const fx = Math.sin(this.root.rotation.y);
            const fz = Math.cos(this.root.rotation.y);
            this.startAction({
                name: 'slice',
                windup: 0.55,
                recover: this.phase >= 2 ? 0.85 : 1.2,
                cooldown: this.phase >= 2 ? 0.8 : 1.4,
                // A cone, not a disc: the read is "get behind it", which is a
                // different lesson from every other boss's "step aside".
                aim: () => ({
                    x: this.root.position.x, z: this.root.position.z,
                    radius: 4.5, shape: 'cone', dir: { x: fx, z: fz },
                    color: 0xffe0a0,
                }),
                strike: (p) => {
                    if (this.inCone(p, this.root.position, { x: fx, z: fz }, 4.5, 1.2)) {
                        this.hitPlayer(p, this.phase >= 2 ? 2 : 1, 0.4);
                        sfx.slap();
                    }
                },
            });
            return;
        }
        moveToward(this.root.position, player.root.position, this.phase >= 2 ? 2.8 : 2.0, dt);
    }
}

// ─── Beat 09 — Phantasm (full class) ────────────────────────────────────────
export class PhantasmBoss extends BossBase {
    constructor(scene, position = { x: 0, z: -4 }) {
        const mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(1.0, 0),
            mat(ABYSS_COLORS.violet, ABYSS_COLORS.violetHot, 1.6, { transparent: true, opacity: 0.9 })
        );
        super(scene, {
            id: 'phantasm', name: 'Phantasm', hp: 12,
            hitRadius: 0.9, contactRadius: 1.4, position, mesh, phaseThresholds: [0.5],
        });
        this.manifested = true;
        this.phaseTimer = 0;
        this.mirrorCd = 3;
        this.presenceScale(1.25);
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
                circleStrafe(this.root.position, player, dt,
                    { speed: 2.2, spin: 0.9, close: 1.4, minRadius: 1.6 });
            }
            if (this.actionCd <= 0 && !this.busy) {
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
}

// ─── Beat 10 — Frost & Fuel (twin) ──────────────────────────────────────────
export class FrostAndFuel extends BossBase {
    constructor(scene, position = { x: 0, z: -3 }) {
        const body = new THREE.Group();
        const frost = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 14), mat(0x80c0e0, 0x40e0ff, 1.3));
        const fuel = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 14), mat(0xe06020, 0xff6020, 1.3));
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
        this.presenceScale(1.35);
    }
    tickAI(dt, player) {
        this.modeTimer += dt;
        if (this.modeTimer > (this.phase >= 2 ? 3.5 : 5)) {
            this.modeTimer = 0;
            this.mode = this.mode === 'frost' ? 'fuel' : 'frost';
            sfx.phase();
        }
        this.frost.material.emissiveIntensity = this.mode === 'frost' ? 2.2 : 0.4;
        this.fuel.material.emissiveIntensity = this.mode === 'fuel' ? 2.2 : 0.4;
        this.frost.position.y = Math.sin(this.t * 2) * 0.3;
        this.fuel.position.y = Math.sin(this.t * 2 + 1) * 0.3;
        this.root.rotation.y += dt * 0.4;
        if (player && this.actionCd <= 0 && !this.busy) {
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
                    if (!this.inBlast(p, aim.x, aim.z, 2.5)) return;
                    this.hitPlayer(p, mode === 'fuel' ? 2 : 1, 0.45);
                    if (mode === 'frost') {
                        // Slow: temporary friction ice feel
                        p.setFriction?.('ice');
                        setTimeout(() => p.setFriction?.('default'), 2000);
                    }
                    sfx.kick();
                },
            });
        }
        // Keep its distance from the player rather than tracing a fixed ellipse
        // about the room centre — the pair should feel like it is circling you.
        if (player && !this.busy) {
            circleStrafe(this.root.position, player, dt,
                { speed: 2.6, spin: 0.55, close: 0.9, minRadius: 2.4 });
        }
        this.root.position.y = 1.6;
    }
}

// ─── Beat 11 — Sludge Golem ─────────────────────────────────────────────────
export class SludgeGolem extends BossBase {
    constructor(scene, position = { x: 0, z: 0 }) {
        const mesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.5, 1),
            mat(ABYSS_COLORS.sludge || 0x4a6030, 0x80a020, 0.7, { flatShading: true })
        );
        super(scene, {
            id: 'sludge_golem', name: 'Sludge Golem', hp: 18,
            hitRadius: 1.6, contactRadius: 2.0, position, mesh, phaseThresholds: [0.4],
        });
        this.lungeCd = 3.0;
        this.pools = [];
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
        moveToward(this.root.position, player.root.position, this.phase >= 2 ? 2.0 : 1.2, dt);
        this.root.position.y = 1.4 + Math.sin(this.t) * 0.15;
        if (this.actionCd <= 0) {
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
        super.dispose();
    }
}

// ─── Beat 12 — Magma Wyrm ───────────────────────────────────────────────────
export class MagmaWyrm extends BossBase {
    constructor(scene, position = { x: 0, z: -4 }) {
        const body = new THREE.Group();
        const segs = [];
        for (let i = 0; i < 6; i++) {
            const s = new THREE.Mesh(
                new THREE.SphereGeometry(0.75 - i * 0.06, 10, 10),
                mat(i === 0 ? 0xff6020 : 0xa03010, 0xff4010, 1.2 - i * 0.1)
            );
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
            circleStrafe(this.root.position, player, dt, {
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
        // Align hit to head world pos (radii track the 1.65 presence scale)
        this.hitRadius = 1.65;

        if (player && this.actionCd <= 0 && !this.busy) {
            const dx = player.root.position.x - this.root.position.x;
            const dz = player.root.position.z - this.root.position.z;
            const n = Math.hypot(dx, dz) || 1;
            const dir = { x: dx / n, z: dz / n };
            this.startAction({
                name: 'breath',
                windup: 0.75,
                recover: this.phase >= 2 ? 1.1 : 1.6,
                cooldown: this.phase >= 2 ? 1.2 : 2.0,
                aim: () => ({
                    x: this.root.position.x, z: this.root.position.z,
                    radius: 8, shape: 'cone', dir, color: 0xff6020,
                }),
                strike: (p) => {
                    if (this.inCone(p, this.root.position, dir, 8, 0.45)) {
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

// ─── Beat 13 — GUMOI Witness ────────────────────────────────────────────────
export class GumoiWitness extends BossBase {
    constructor(scene, position = { x: 0, y: 9.5, z: 0 }) {
        const mesh = new THREE.Mesh(
            new THREE.TetrahedronGeometry(1.4, 0),
            mat(ABYSS_COLORS.violet, ABYSS_COLORS.neon || 0x80ffc0, 1.8)
        );
        super(scene, {
            id: 'gumoi_witness', name: 'GUMOI Witness', hp: 18,
            hitRadius: 1.3, contactRadius: 1.7, position, mesh, phaseThresholds: [0.6, 0.3],
        });
        this.castCd = 2.0;
        this.flickerBoost = 0;
        this.presenceScale(1.15);
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
            circleStrafe(this.root.position, player, dt,
                { speed: 3.4, spin: 0.7, close: 1.0, minRadius: 2 + this.phase * 0.4 });
        }
        // Only override the level's base flicker while the fight is live
        if (player && game?.level) game.level.flicker = Math.min(1, 0.5 + this.flickerBoost + Math.sin(this.t * 5) * 0.15);
        if (player && this.actionCd <= 0 && !this.busy) {
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
}

// ─── Beat 14 — Leviathan (full phases) ──────────────────────────────────────
export class LeviathanBoss extends BossBase {
    constructor(scene, position = { x: 0, y: 2.5, z: 0 }) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(2.0, 28, 28),
            mat(0x1a1028, ABYSS_COLORS.neon || 0x60ffe0, 1.8, { metalness: 0.55, roughness: 0.35 })
        );
        super(scene, {
            id: 'leviathan', name: 'Leviathan Core', hp: 28,
            hitRadius: 2.0, contactRadius: 2.4, contactDamage: 2,
            position, mesh, phaseThresholds: [0.66, 0.33],
        });
        this.wrapAmount = 0.3;
        this.decoys = [];
        this.gravityPhase = 0;
        this.slamCd = 3.5;
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
            const m = new THREE.Mesh(
                new THREE.SphereGeometry(1.4, 16, 16),
                mat(0x1a1028, 0x306050, 0.8, { transparent: true, opacity: 0.45 })
            );
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
            circleStrafe(this.root.position, player, dt, {
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
        this.mesh.material.emissiveIntensity = 1.5 + Math.sin(this.t * 5) * 0.6;
    }
    dispose() {
        for (const d of this.decoys) {
            if (d.parent) d.parent.remove(d);
            d.geometry.dispose(); d.material.dispose();
        }
        super.dispose();
    }
}

// Re-export enhanced Sand Spur / Kinetic as phase-aware wrappers used by levels
export { SandSpur } from './sand-spur.js';
export { KineticCore } from './kinetic-core.js';
