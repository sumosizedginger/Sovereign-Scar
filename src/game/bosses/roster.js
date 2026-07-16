// All 14 narrative bosses — unique multi-phase arena mechanics.

import * as THREE from 'three';
import { BossBase, moveToward, bounceArena } from './base.js';
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
            id: 'crypt_warden', name: 'Crypt Warden', hp: 10, hitRadius: 1.1,
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
        this.slamCd -= dt;
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
        this.blade.rotation.z = Math.sin(this.t * 3) * 0.3;
        if (this.slamCd <= 0 && d < 9) {
            this.slamCd = this.phase >= 2 ? 1.5 : 2.4;
            this._slamT = 0.7;
            this.telegraphAt(player.root.position.x, player.root.position.z, 2.2, 0.7, 0xffc040);
            this._slamPos = { x: player.root.position.x, z: player.root.position.z };
        }
        if (this._slamT > 0) {
            this._slamT -= dt;
            if (this._slamT <= 0 && this._slamPos) {
                const pd = Math.hypot(
                    player.root.position.x - this._slamPos.x,
                    player.root.position.z - this._slamPos.z
                );
                if (pd < 2.4) {
                    player.health.damage(this.phase >= 2 ? 2 : 1, 0.5);
                    sfx.stomp();
                } else sfx.block();
            }
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
        const orbit = this.phase >= 2 ? 1.2 : 0.4;
        for (let i = 0; i < this.cores.length; i++) {
            const c = this.cores[i];
            if (c.state.current === 'DEAD') continue;
            const ang = this.t * (0.6 + i * 0.15) + i * (Math.PI * 2 / 3);
            c.mesh.position.x = c.home.x + Math.cos(ang) * orbit * 1.5;
            c.mesh.position.z = c.home.z + Math.sin(ang) * orbit * 1.5;
            c.mesh.position.y = c.home.y + Math.sin(this.t * 2 + i) * 0.25;
            c.mesh.rotation.y += dt * (1 + i * 0.3);
            c.mesh.material.emissiveIntensity = 1.0 + Math.sin(this.t * 4 + i) * 0.5;
            // Beam damage between living cores
            if (player && !player.health?.dead && this.phase >= 2) {
                const next = this.cores[(i + 1) % this.cores.length];
                if (next.state.current !== 'DEAD') {
                    if (pointNearSegment(
                        player.root.position,
                        c.mesh.position,
                        next.mesh.position,
                        0.55
                    )) {
                        if (!this._beamCd || this._beamCd <= 0) {
                            player.health.damage(1, 0.6);
                            sfx.hurt();
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
        // Soft orbit only in phase 1; later phases hold post-teleport spots with drift
        if (this.phase < 2) {
            const ang = this.t * 0.5;
            this.root.position.x = Math.cos(ang) * (2 + this.phase);
            this.root.position.z = -3 + Math.sin(ang) * (2 + this.phase * 0.5);
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
        if (player && this.castCd <= 0) {
            this.castCd = this.phase >= 3 ? 1.1 : 1.8;
            this.telegraphAt(player.root.position.x, player.root.position.z, 2.0, 0.65, 0xc084fc);
            this._bolt = { x: player.root.position.x, z: player.root.position.z, t: 0.65 };
        }
        if (this._bolt) {
            this._bolt.t -= dt;
            if (this._bolt.t <= 0) {
                if (player && Math.hypot(
                    player.root.position.x - this._bolt.x,
                    player.root.position.z - this._bolt.z
                ) < 2.2) {
                    player.health.damage(this.phase, 0.5);
                    sfx.phase();
                }
                this._bolt = null;
            }
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
        this.shielded = true; // armor; underside weak when leaping
        this.presenceScale(1.3);
    }
    tickAI(dt, player) {
        for (let i = 0; i < this.legs.length; i++) {
            this.legs[i].rotation.x = Math.sin(this.t * 6 + i) * 0.35;
        }
        this.leapCd -= dt;
        if (!player) return;
        if (this._leapT > 0) {
            this._leapT -= dt;
            this.shielded = false;
            this.root.position.y = 1.2 + Math.sin((1 - this._leapT / 0.9) * Math.PI) * 2.5;
            if (this._leapT <= 0) {
                this.shielded = this.phase < 2;
                this.root.position.y = 1.0;
                this.root.position.x = this._leapTarget.x;
                this.root.position.z = this._leapTarget.z;
                sfx.stomp();
                if (Math.hypot(
                    player.root.position.x - this.root.position.x,
                    player.root.position.z - this.root.position.z
                ) < 2.5) player.health.damage(2, 0.4);
            }
            return;
        }
        this.shielded = this.phase < 2;
        moveToward(this.root.position, player.root.position, this.phase >= 2 ? 3.2 : 2.2, dt);
        this.root.position.y = 1.0;
        const d = Math.hypot(
            player.root.position.x - this.root.position.x,
            player.root.position.z - this.root.position.z
        );
        if (this.leapCd <= 0 && d > 3 && d < 12) {
            this.leapCd = this.phase >= 2 ? 2.0 : 3.2;
            this._leapT = 0.9;
            this._leapTarget = { x: player.root.position.x, z: player.root.position.z };
            this.telegraphAt(this._leapTarget.x, this._leapTarget.z, 2.4, 0.9, 0xa040ff);
            this.shielded = false;
        }
    }
}

// ─── Beat 07 — Hydroid Cloud ────────────────────────────────────────────────
export class HydroidCloud extends BossBase {
    constructor(scene, position = { x: 0, z: -6 }) {
        const body = new THREE.Group();
        const orbs = [];
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
            position, mesh: body, phaseThresholds: [0.4],
        });
        this.orbs = orbs;
        this.pulseCd = 2.5;
        this.presenceScale(1.35);
    }
    tickAI(dt, player) {
        const spread = 1.2 + this.phase * 0.5 + Math.sin(this.t) * 0.3;
        for (let i = 0; i < this.orbs.length; i++) {
            const a = this.t * 0.8 + i * (Math.PI * 2 / this.orbs.length);
            const elev = Math.sin(this.t * 2 + i) * 0.5;
            this.orbs[i].position.set(
                Math.cos(a) * spread,
                elev,
                Math.sin(a) * spread * 0.7
            );
        }
        this.pulseCd -= dt;
        if (player) {
            // Drift toward player
            moveToward(this.root.position, player.root.position, 1.4 + this.phase * 0.4, dt);
            this.root.position.y = 1.8 + Math.sin(this.t * 1.5) * 0.4;
            if (this.pulseCd <= 0) {
                this.pulseCd = this.phase >= 2 ? 1.6 : 2.5;
                this.telegraphAt(this.root.position.x, this.root.position.z, 3.2, 0.7, 0x40e0ff);
                this._pulse = 0.7;
            }
            if (this._pulse > 0) {
                this._pulse -= dt;
                if (this._pulse <= 0) {
                    const d = Math.hypot(
                        player.root.position.x - this.root.position.x,
                        player.root.position.z - this.root.position.z
                    );
                    if (d < 3.5) {
                        player.health.damage(1, 0.5);
                        // knock slightly
                        const dx = player.root.position.x - this.root.position.x;
                        const dz = player.root.position.z - this.root.position.z;
                        const n = Math.hypot(dx, dz) || 1;
                        player.root.position.x += (dx / n) * 1.5;
                        player.root.position.z += (dz / n) * 1.5;
                        sfx.whoosh();
                    }
                }
            }
        }
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
        this.sliceCd -= dt;
        this.scytheL.rotation.z = -0.5 + Math.sin(this.t * 4) * 0.2;
        this.scytheR.rotation.z = 0.5 - Math.sin(this.t * 4) * 0.2;
        if (!player) return;
        const dx = player.root.position.x - this.root.position.x;
        const dz = player.root.position.z - this.root.position.z;
        this.root.rotation.y = Math.atan2(dx, dz);
        moveToward(this.root.position, player.root.position, this.phase >= 2 ? 2.8 : 2.0, dt);
        this.root.position.y = 1.3;
        const d = Math.hypot(dx, dz);
        if (this.sliceCd <= 0 && d < 6) {
            this.sliceCd = this.phase >= 2 ? 1.3 : 2.1;
            this._sliceT = 0.55;
            // Wide slash telegraph in front
            const fx = Math.sin(this.root.rotation.y);
            const fz = Math.cos(this.root.rotation.y);
            this.telegraphAt(
                this.root.position.x + fx * 2.2,
                this.root.position.z + fz * 2.2,
                2.8, 0.55, 0xffe0a0
            );
            this._sliceDir = { x: fx, z: fz };
        }
        if (this._sliceT > 0) {
            this._sliceT -= dt;
            this.scytheL.rotation.z = -1.5;
            this.scytheR.rotation.z = 1.5;
            if (this._sliceT <= 0 && player) {
                // Cone in front
                const toP = {
                    x: player.root.position.x - this.root.position.x,
                    z: player.root.position.z - this.root.position.z,
                };
                const pd = Math.hypot(toP.x, toP.z) || 1;
                const dot = (toP.x * this._sliceDir.x + toP.z * this._sliceDir.z) / pd;
                if (pd < 4.5 && dot > 0.35) {
                    player.health.damage(this.phase >= 2 ? 2 : 1, 0.4);
                    sfx.slap();
                }
            }
        }
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
        this.manifested = Math.floor(this.phaseTimer / cycle) % 2 === 0;
        this.canHit = this.manifested;
        this.hitRadius = this.manifested ? (this.baseHitRadius || 0.9) : 0;
        this.mesh.material.opacity = this.manifested ? 0.92 : 0.12;
        this.root.position.y = (1.5) + Math.sin(this.t * 2) * 0.45;
        this.root.rotation.y += dt * (this.manifested ? 1 : 2.5);
        this.mirrorCd -= dt;
        if (player && this.manifested) {
            // Mirror facing / chase inverted
            const px = player.root.position.x;
            const pz = player.root.position.z;
            const target = this.phase >= 2
                ? { x: -px * 0.4, z: -pz * 0.4 - 2 }
                : { x: px * 0.3, z: pz * 0.3 - 3 };
            moveToward(this.root.position, target, 2.5, dt);
            if (this.mirrorCd <= 0) {
                this.mirrorCd = 2.4;
                this.telegraphAt(player.root.position.x, player.root.position.z, 1.8, 0.5, 0xc084fc);
                this._echo = { x: player.root.position.x, z: player.root.position.z, t: 0.5 };
            }
            if (this._echo) {
                this._echo.t -= dt;
                if (this._echo.t <= 0) {
                    if (Math.hypot(
                        player.root.position.x - this._echo.x,
                        player.root.position.z - this._echo.z
                    ) < 2) {
                        player.health.damage(1, 0.6);
                        sfx.phase();
                    }
                    this._echo = null;
                }
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
        this.castCd -= dt;
        if (player && this.castCd <= 0) {
            this.castCd = this.phase >= 2 ? 1.4 : 2.2;
            const color = this.mode === 'frost' ? 0x40e0ff : 0xff6020;
            this.telegraphAt(player.root.position.x, player.root.position.z, 2.3, 0.7, color);
            this._cast = {
                x: player.root.position.x, z: player.root.position.z, t: 0.7,
                mode: this.mode,
            };
        }
        if (this._cast) {
            this._cast.t -= dt;
            if (this._cast.t <= 0 && player) {
                if (Math.hypot(
                    player.root.position.x - this._cast.x,
                    player.root.position.z - this._cast.z
                ) < 2.5) {
                    player.health.damage(this._cast.mode === 'fuel' ? 2 : 1, 0.45);
                    if (this._cast.mode === 'frost') {
                        // Slow: temporary friction ice feel
                        player.setFriction?.('ice');
                        setTimeout(() => player.setFriction?.('default'), 2000);
                    }
                    sfx.kick();
                }
                this._cast = null;
            }
        }
        // Slow orbit
        this.root.position.x = Math.sin(this.t * 0.4) * 3;
        this.root.position.z = -3 + Math.cos(this.t * 0.4) * 2;
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
                        player.health.damage(0.5, 0.3);
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
        moveToward(this.root.position, player.root.position, this.phase >= 2 ? 2.0 : 1.2, dt);
        this.root.position.y = 1.4 + Math.sin(this.t) * 0.15;
        if (this.lungeCd <= 0) {
            this.lungeCd = this.phase >= 2 ? 2.0 : 3.2;
            this.telegraphAt(player.root.position.x, player.root.position.z, 2.0, 0.6, 0x80a040);
            this._lunge = { x: player.root.position.x, z: player.root.position.z, t: 0.6 };
        }
        if (this._lunge) {
            this._lunge.t -= dt;
            if (this._lunge.t <= 0) {
                this.root.position.x = this._lunge.x;
                this.root.position.z = this._lunge.z;
                sfx.heave();
                // Drop pool
                const m = new THREE.Mesh(
                    new THREE.CircleGeometry(2, 20),
                    new THREE.MeshBasicMaterial({
                        color: 0x4a7020, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
                    })
                );
                m.rotation.x = -Math.PI / 2;
                m.position.set(this._lunge.x, 0.1, this._lunge.z);
                this.scene.add(m);
                this.pools.push({ mesh: m, x: this._lunge.x, z: this._lunge.z, life: 4, _dot: 0 });
                if (player && Math.hypot(
                    player.root.position.x - this._lunge.x,
                    player.root.position.z - this._lunge.z
                ) < 2.2) player.health.damage(2, 0.4);
                this._lunge = null;
            }
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
        this.pathT += dt * (this.phase >= 2 ? 1.4 : 0.9);
        const R = 5 + this.phase;
        // Head follows figure-8
        const hx = Math.sin(this.pathT) * R;
        const hz = Math.sin(this.pathT * 2) * (R * 0.5) - 2;
        // Chain segments
        let px = hx, pz = hz;
        for (let i = 0; i < this.segs.length; i++) {
            if (i === 0) {
                this.segs[i].position.set(0, 0, 0);
                this.root.position.set(px, 1.3 + Math.sin(this.pathT * 3) * 0.3, pz);
            } else {
                const target = this.segs[i - 1].position;
                // local chain
                const ang = this.pathT - i * 0.35;
                this.segs[i].position.set(
                    Math.sin(ang) * R - hx,
                    -i * 0.05,
                    Math.sin(ang * 2) * (R * 0.5) - 2 - hz
                );
            }
        }
        // Align hit to head world pos (radii track the 1.65 presence scale)
        this.hitRadius = 1.65;
        this.fireCd -= dt;
        // Fire trail
        this.trails = this.trails.filter((tr) => {
            tr.life -= dt;
            tr.mesh.material.opacity = Math.max(0, tr.life / 2.5) * 0.6;
            if (player && tr.life > 0) {
                if (Math.hypot(player.root.position.x - tr.x, player.root.position.z - tr.z) < 1.4) {
                    if (!tr._cd || tr._cd <= 0) {
                        player.health.damage(1, 0.4);
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
        if (this.fireCd <= 0) {
            this.fireCd = this.phase >= 2 ? 0.9 : 1.6;
            const m = new THREE.Mesh(
                new THREE.CircleGeometry(1.3, 12),
                new THREE.MeshBasicMaterial({
                    color: 0xff6020, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
                })
            );
            m.rotation.x = -Math.PI / 2;
            m.position.set(this.root.position.x, 0.12, this.root.position.z);
            this.scene.add(m);
            this.trails.push({ mesh: m, x: this.root.position.x, z: this.root.position.z, life: 2.5, _cd: 0 });
            this.telegraphAt(this.root.position.x, this.root.position.z, 1.5, 0.3, 0xff8040);
        }
        if (player) {
            // Contact via head (tracks the 1.65 presence scale)
            this.contactRadius = 2.4;
        }
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
        this.root.position.y = (this.phase >= 3 ? 5 : 9.2) + Math.sin(this.t * 2) * 0.5;
        // Orbit
        const R = 2 + this.phase;
        this.root.position.x = Math.cos(this.t * 0.7) * R;
        this.root.position.z = Math.sin(this.t * 0.7) * R;
        if (game?.level) game.level.flicker = Math.min(1, 0.5 + this.flickerBoost + Math.sin(this.t * 5) * 0.15);
        this.castCd -= dt;
        if (player && this.castCd <= 0) {
            this.castCd = this.phase >= 3 ? 1.0 : 1.8;
            this.telegraphAt(player.root.position.x, player.root.position.z, 2.1, 0.55, 0xc084fc);
            this._bolt = { x: player.root.position.x, z: player.root.position.z, t: 0.55 };
        }
        if (this._bolt) {
            this._bolt.t -= dt;
            if (this._bolt.t <= 0 && player) {
                if (Math.hypot(
                    player.root.position.x - this._bolt.x,
                    player.root.position.z - this._bolt.z
                ) < 2.3) {
                    player.health.damage(this.phase >= 2 ? 2 : 1, 0.4);
                    sfx.phase();
                }
                this._bolt = null;
            }
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
        // Orbit wobble in phase 2+
        if (this.phase >= 2) {
            this.root.position.x = Math.sin(this.t * 0.5) * (1 + this.phase);
            this.root.position.z = Math.cos(this.t * 0.4) * (1 + this.phase * 0.5);
        }
        for (let i = 0; i < this.decoys.length; i++) {
            const a = this.t * 0.9 + i * (Math.PI * 2 / Math.max(1, this.decoys.length));
            const R = 4 + this.phase;
            this.decoys[i].position.set(
                Math.cos(a) * R,
                1.8 + Math.sin(this.t * 2 + i) * 0.6,
                Math.sin(a) * R
            );
            this.decoys[i].rotation.y += dt;
        }
        this.slamCd -= dt;
        if (player && this.slamCd <= 0) {
            this.slamCd = this.phase >= 3 ? 1.6 : 3.0;
            this.telegraphAt(player.root.position.x, player.root.position.z, 2.8, 0.8, 0x60ffe0);
            this._slam = { x: player.root.position.x, z: player.root.position.z, t: 0.8 };
        }
        if (this._slam) {
            this._slam.t -= dt;
            if (this._slam.t <= 0 && player) {
                if (Math.hypot(
                    player.root.position.x - this._slam.x,
                    player.root.position.z - this._slam.z
                ) < 3.0) {
                    player.health.damage(2, 0.35);
                    sfx.stomp();
                }
                this._slam = null;
            }
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
