// Multi-phase boss framework — telegraphs, contact damage, phases, HP API.

import * as THREE from 'three';
import { sfx } from '../../audio/synth.js';
import { at as audioAt } from '../../audio/spatial.js';
import { scoreStinger } from '../audio/score.js';
import { juice } from '../fx/juice.js';
import { getActiveRunMode } from '../kernel/run-mode.js';
import { markShadowRoles } from '../render/shadow-roles.js';
import { coach } from '../ui/coach.js';

/**
 * The most emissive a boss part may be.
 *
 * `UnrealBloomPass` runs at threshold 0.85 on post-tonemap luminance, and the
 * roster was setting 1.1, 1.15, 1.2, 1.6 and 2.4. The result is in
 * `beat-10-cryo-boss.png`: the whole arena is one white blob with a couple of
 * blue boxes floating outside it. A boss you cannot see is a fight you cannot
 * read, and the room the fight happens in stops existing.
 *
 * The trade is deliberate and is the same one `world/room-lights.js` makes: a
 * boss should be MENACING BY LIGHT, not by clipping its own pixels. Every boss
 * now registers a real point light (see `_registerGlow`), so the arena is lit
 * from the boss — which is what the blowout was crudely approximating — while
 * the body itself stays a readable silhouette.
 */
export const BOSS_EMISSIVE_MAX = 0.55;

/**
 * How many seconds of "where has the player been standing" a boss remembers.
 *
 * Short enough that changing your approach is felt within one exchange — you
 * back off, and within a few seconds the boss starts reaching for you. Long
 * enough that a single dash through its hitbox does not read as "this player
 * is a melee camper" and flip its whole selection.
 */
export const HABIT_WINDOW = 4;

/**
 * How hard the habit pushes the odds, at the extremes.
 *
 * 0.6 means a player pinned at one end of the range sees a preferred move at
 * 1.6x its base weight and the opposite one at 0.4x. Deliberately not larger:
 * this is meant to make a comfortable range stop being comfortable, not to
 * hand the player a lever that lets them pick the boss's next move. At 1.0 a
 * kiter could suppress everything except gap-closers and learn a new script.
 */
export const HABIT_STRENGTH = 0.6;

/**
 * Chance that recovery flows straight into another action instead of the full
 * cooldown, and how much of the cooldown a chain keeps.
 *
 * Recovery being an UNCONDITIONAL free hit is why boss fights here resolve to
 * "wait, hit, repeat". A quarter of the time the punish has to be earned
 * against a boss that is already moving again — which makes the other three
 * quarters mean something. Phase-gated so the tutorial boss never does it.
 */
export const CHAIN_CHANCE = 0.25;
export const CHAIN_COOLDOWN = 0.35;

/**
 * The two colours a 'ring' telegraph is always drawn in.
 *
 * Every other telegraph in this game says the same thing — *not here, go
 * somewhere else* — and they are all warm, tinted per boss: gold, amber,
 * orange, one violet. That vocabulary is consistent and it works.
 *
 * A ring says the opposite: the safe ground is its CENTRE, and the answer is to
 * close. Drawn in the same gold as a slam, two opposite instructions look alike
 * at the speed a player actually reads them — which is the owner's call here
 * (2026-07-27) and is correct. So a ring gets its own pair and **ignores the
 * casting boss's tint**, because a shape whose meaning is reversed must not be
 * something fourteen separate kit authors each get to re-colour.
 *
 * `TELL_BAND` is the hottest red in the telegraph palette — nothing else in the
 * game is this red, and it is unmistakably "this hurts". `TELL_SAFE` is the only
 * colour in Sovereign Scar that ever means *stand here*, which is why it is not
 * spent on anything else.
 */
export const TELL_BAND = 0xff4038;
export const TELL_SAFE = 0x50f0d0;

/**
 * A ground lane, laid flat: a strip of marked floor running `length` units from
 * (x, z) along `dir`.
 *
 * A free function for the same reason `bossHit` is one — `TriCompiler` is not a
 * `BossBase` subclass and needs to mark ground too. A fourth private
 * implementation of "lay a rectangle on the floor and yaw it" is precisely how
 * the telegraph bugs in this file's history happened, and the yaw below is the
 * exact expression that was once wrong (it drew every lane rotated away from
 * the attack it announced).
 *
 * The -90 degree X tilt maps local (x, y, z) to world (x, z, -y), and a
 * PlaneGeometry extends along local +Y, so the yaw is `atan2(-dx, -dz)`.
 */
export function laneMesh(x, z, dir, length, width, color, y = 1.07, opacity = 0.6) {
    const dlen = Math.hypot(dir.x, dir.z) || 1;
    const geo = new THREE.PlaneGeometry(width, length);
    geo.translate(0, length / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
        side: THREE.DoubleSide, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(-dir.x / dlen, -dir.z / dlen);
    m.position.set(x, y, z);
    return m;
}

/**
 * A filled ground disc, laid flat — the "not here" telegraph, as a bare mesh.
 *
 * Filled, never a donut: `inBlast` and its kin test the whole disc, and this
 * game shipped for months drawing a clear hole at 55% of the radius that was
 * fully lethal. Since a circle telegraph is aimed AT the player, that hole was
 * centred on wherever they were standing when it was cast, every time.
 */
export function discMesh(x, z, radius, color, y = 1.08, opacity = 0.62) {
    const m = new THREE.Mesh(
        new THREE.RingGeometry(0.001, radius, 32),
        new THREE.MeshBasicMaterial({
            color, transparent: true, opacity,
            side: THREE.DoubleSide, depthWrite: false,
        })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return m;
}

/**
 * The halo that says "this is the free hit". A thin ring, deliberately NOT a
 * filled disc, because it marks a target rather than marking ground.
 */
export function haloMesh(x, z, radius, y = 1.05, color = 0xfff0a0) {
    const m = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.65, radius, 24),
        new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.85,
            side: THREE.DoubleSide, depthWrite: false,
        })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return m;
}

/**
 * Land a hostile hit on the player, from a boss.
 *
 * A free function rather than only a method, because **one boss in the roster is
 * not a `BossBase` subclass.** `TriCompiler` is three orbiting cores with a
 * shared HP pool, so it was hand-rolled — and it called `this.hitPlayer(...)`
 * anyway. That method does not exist on it. Measured 2026-07-27: driving the
 * fight with a player parked on a live beam takes **0 damage and throws
 * `this.hitPlayer is not a function`** on the first contact. Beat 02's boss
 * could not hurt you, and the attempt broke the frame it happened on.
 *
 * `from` is what makes the player's guard directional, and `attacker` is what
 * the parry and the score read — which is why this must not be re-implemented
 * per boss. One body, two callers.
 */
export function bossHit(player, amount, iFrameTime = 0.7, origin = null, attacker = null) {
    if (!player || !player.health) return { accepted: false };
    const res = player.health.damage(amount, iFrameTime, 'hostile', {
        from: origin, attacker,
    });
    if (res?.accepted) sfx.hurt();
    return res;
}

/**
 * Clamp every emissive material under an object.
 *
 * Applied in the base constructor rather than at the forty-odd call sites that
 * build boss parts, because three separate files build them (`roster.js`,
 * `sand-spur.js`, `kinetic-core.js`) and this project's most expensive
 * recurring bug is fixing one site out of several. Doing it here also means a
 * boss written next year inherits the rule without knowing it exists.
 *
 * Returns the brightest emissive found BEFORE clamping, and its colour — the
 * glow light is derived from it, so a boss's light matches whatever the author
 * meant its hottest part to be.
 */
export function clampEmissive(root, max = BOSS_EMISSIVE_MAX) {
    let peak = 0;
    let color = 0x000000;
    root?.traverse?.((o) => {
        const mats = o.isMesh ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
            if (!m || m.emissiveIntensity == null) continue;
            const hex = m.emissive?.getHex?.() ?? 0;
            if (hex === 0) continue;                 // not a glowing part
            if (m.emissiveIntensity > peak) { peak = m.emissiveIntensity; color = hex; }
            if (m.emissiveIntensity > max) m.emissiveIntensity = max;
        }
    });
    return { peak, color };
}

/**
 * Base class for every Sovereign Scar arena boss.
 * Subclasses implement tickAI(dt, player, game) and optionally onPhaseChange.
 */
export class BossBase {
    /**
     * @param {THREE.Scene} scene
     * @param {object} opts
     * @param {string} opts.id
     * @param {string} opts.name
     * @param {number} [opts.hp=12]
     * @param {number} [opts.hitRadius=1.2]
     * @param {number} [opts.contactDamage=1]
     * @param {number} [opts.contactRadius=1.6]
     * @param {number[]} [opts.phaseThresholds] remaining-HP fractions that trigger next phase (e.g. [0.66, 0.33])
     * @param {{x:number,y?:number,z:number}} [opts.position]
     * @param {THREE.Object3D} [opts.mesh] if provided, used as root; else subclass must set this.root
     */
    constructor(scene, opts = {}) {
        const mode = getActiveRunMode();
        this.scene = scene;
        this.bossId = opts.id || 'boss';
        this.bossName = opts.name || 'Unknown Construct';
        const baseHp = opts.hp != null ? opts.hp : 12;
        this.maxHp = Math.max(1, baseHp * mode.bossHp);
        this.hp = this.maxHp;
        this.hitRadius = opts.hitRadius != null ? opts.hitRadius : 1.2;
        this.contactDamage = opts.contactDamage != null ? opts.contactDamage : 1;
        this.contactRadius = opts.contactRadius != null ? opts.contactRadius : 1.6;
        this.phaseThresholds = (opts.phaseThresholds || [0.66, 0.33]).slice().sort((a, b) => b - a);
        this.phase = 1;
        this.maxPhase = this.phaseThresholds.length + 1;
        this.state = { current: 'IDLE', facingVec: { x: 0, z: -1 } };
        this.managedBySystem = true;
        this.canHit = true;
        this.shielded = false;
        this.t = 0;
        this._contactCd = 0;
        this._flash = 0;
        this._telegraph = null;
        this._telegraphLife = 0;
        // Height of the floor the arena is built on. Telegraph rings used to
        // be pinned at an absolute y = 0.08, but room floors sit at y = 1, so
        // every boss telegraph in the game rendered a full unit UNDERGROUND
        // and the player never saw the wind-up they were meant to dodge.
        this.floorY = opts.floorY != null ? opts.floorY : 1.0;
        this.alive = true;
        this.defeated = false;
        // Collision + arena clamp (playtest 2026-07-23 issues 6 and 7).
        // Bosses used to write straight to the transform — circleStrafe into a
        // wall put the body inside masonry, and nothing stopped a walk out the
        // open doorway. Enemies already had resolveMove; bosses did not.
        this.collisionWorld = opts.collisionWorld || null;
        // Half-extent of the legal arena around `home`. Default sits inside a
        // typical room half (8–12) so a doorway gap never becomes an exit.
        this.arenaRadius = opts.arenaRadius != null ? opts.arenaRadius : 7.5;
        // Collision probe uses hitRadius, not the 0.4 enemies use — bosses are
        // presenceScaled up and a thin probe still buries most of the body.
        this.collHalf = opts.collHalf != null
            ? opts.collHalf
            : Math.max(0.65, this.hitRadius * 0.75);

        // ── Zelda boss grammar (see runAction / startAction below) ──────────
        this.action = null;
        this.actionCd = opts.firstActionDelay != null ? opts.firstActionDelay : 1.2;
        this.actionFrequency = mode.actionFrequency;
        this.telegraphDuration = mode.telegraphDuration;
        this.recoveryDuration = mode.bossRecovery;
        // Damage multiplier applied to the boss while it is recovering. 1 =
        // no reward for reading the pattern, which is where the roster was.
        this.vulnerableMult = 1;
        this.staggerMult = opts.staggerMult != null ? opts.staggerMult : 2;
        this._recoverCue = null;

        // ── Weak points ────────────────────────────────────────────────────
        // A boss that MODELS a glowing weak point has to mean it. Two did not:
        // the Sand Spur's gold head seam and the Kinetic Core's underside were
        // both lit on a real condition, and both paid exactly nothing.
        //
        // `weakOpen` is set by the subclass from whatever already drives that
        // light, so the cue and the rule are one condition and cannot drift
        // apart. `applyHit` takes the MAX of this and `vulnerableMult` rather
        // than the product — see the comment there for why 4x was the wrong
        // answer on the Spur.
        //
        // Deliberately NOT a position test. Both weak points sit at their
        // body's XZ centre (the Spur's is on segments[0], which IS the root;
        // the Core's is directly underneath), so "did the hit land within r of
        // the weak point" reduces to "did the hit land" in a top-down game.
        // These are windows in TIME, and the light is already telling the truth
        // about when they are open.
        this.weakOpen = false;
        this.weakMult = opts.weakMult != null ? opts.weakMult : 2;

        // ── Action selection (see defineActions / chooseAction) ────────────
        this.actionSet = null;
        this._recent = [];
        this.habitDist = null;
        // The distance the habit is judged against — roughly this boss's own
        // engagement reach, so "far" means far FOR THIS FIGHT. A wyrm with an
        // 8-unit breath and a golem that lunges 4 do not agree about kiting.
        this.engageRange = opts.engageRange != null ? opts.engageRange : 9;
        // Earliest phase that may chain out of recovery. Default 2 keeps every
        // boss's opening phase honest: the first time you meet it, a read is
        // always worth a free hit.
        this.chainPhase = opts.chainPhase != null ? opts.chainPhase : 2;

        if (opts.mesh) {
            this.root = opts.mesh;
            this.mesh = opts.mesh;
            if (opts.position) {
                this.root.position.set(
                    opts.position.x,
                    opts.position.y != null ? opts.position.y : 1.2,
                    opts.position.z
                );
            }
            if (!this.root.parent) scene.add(this.root);
        } else if (opts.position) {
            this.root = new THREE.Group();
            this.root.position.set(
                opts.position.x,
                opts.position.y != null ? opts.position.y : 1.2,
                opts.position.z
            );
            scene.add(this.root);
        }

        // Done here rather than in fourteen constructors because it WAS in
        // fourteen constructors — three set it and eleven did not, so most of
        // the roster was a silhouette standing on a floor it never touched.
        markShadowRoles(this.root);

        // Bring every glowing part under the bloom threshold, and turn what the
        // author meant by "this bit is hot" into an actual light on the arena.
        const glow = clampEmissive(this.root);
        this._glowColor = glow.color || (opts.glowColor ?? 0xffd0a0);
        // Scaled off the authored peak, so a boss the author lit at 2.4 still
        // ends up the brightest thing in its room — it just does it by lighting
        // the room instead of by clipping.
        // Cut from `3.5 + peak * 1.8` (up to 9). At that level the boss glow was
        // not lighting the arena, it was washing it: the Bone Forest capture
        // came back with the floor lifted to an even pale grey and no shadow
        // under anything. A boss should be the brightest thing in its room by
        // a margin the eye reads as menace, not by removing the room.
        this._glowIntensity = opts.glowIntensity
            ?? Math.min(4.5, 1.8 + glow.peak * 0.9);
        this._glowSource = null;

        // Arena home: bosses that orbit/patrol do it around where they were
        // placed, not the world origin (rooms live at offset origins now).
        this.home = {
            x: this.root ? this.root.position.x : 0,
            z: this.root ? this.root.position.z : 0,
        };
        // Shared movement helpers (moveToward / circleStrafe) read this off the
        // position object so every call site — including direct writes that go
        // through those helpers — routes through resolveMove without each
        // roster method having to pass `this` by hand. Direct XZ writes still
        // get caught by confineToArena() at the end of update().
        this._bindPositionResolve();

        this.onHit = (dmg) => {
            this._flash = 0.12;
            // Snapshot emissive bases once so flash can restore
            this.root?.traverse?.((c) => {
                if (c.material?.emissive && c.userData.baseEmissive == null) {
                    c.userData.baseEmissive = c.material.emissiveIntensity ?? 1;
                }
            });
            audioAt(this.root?.position, () => sfx.kick());
            // Phase check happens after applyHit mutates hp (see update)
            this._phaseDirty = true;
            if (this.afterHit) this.afterHit(dmg);
        };
        this.onDeath = () => {
            this.state.current = 'DEAD';
            this.alive = false;
            this.defeated = true;
            this.canHit = false;
            this.action = null;
            this.vulnerableMult = 1;
            this.clearTelegraph();
            this._hideRecoverCue();
            if (this.root) this.root.visible = false;
            sfx.shatter();
            juice.hitstop(0.25);
            juice.addTrauma(0.6);
            if (this.afterDeath) this.afterDeath();
        };
        // A clang, and — once — what the clang MEANS.
        //
        // `ui/coach.js` opens by saying that a mechanic which can silently
        // refuse input has to be able to say so when it refuses. Directional
        // boss armour was the loudest violation left: a blocked hit played a
        // sound and nothing else, so a player swinging at the Obsidian
        // Arachnid's carapace got a noise with no reason attached and quite
        // reasonably concluded the boss was broken. The bulwark has said this
        // since Z5; the boss that borrowed the bulwark's armour did not borrow
        // its explanation.
        //
        // Only for DIRECTIONAL armour. A boss that is flatly `shielded` is
        // refusing from every angle, and telling the player to go around it
        // would be a lie — those bosses open on a timing window instead.
        this.onBlocked = () => {
            sfx.block();
            if (this.armorUp && !this.shielded) {
                coach('boss-armor',
                    'Its front is plated. Get around to its flank or its back — '
                    + 'or parry, which drops the guard wherever you are standing.');
            }
        };
    }

    get hpFrac() {
        return this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    }

    /**
     * Hook the shared movement helpers onto this boss's root position.
     * Safe to call again after collisionWorld / arenaRadius is wired late
     * (attachBoss may supply them after construction).
     */
    _bindPositionResolve() {
        if (!this.root?.position) return;
        this.root.position._ssResolve = (px, pz, nx, nz) => this.resolveMove(px, pz, nx, nz);
    }

    /**
     * Slide a proposed step through the collision world, then hard-clamp to
     * the arena box around `home`. Either layer alone leaves a hole: collision
     * without a clamp still walks out an open door; a clamp without collision
     * still tunnels into a pillar the player cannot reach past.
     */
    resolveMove(px, pz, nx, nz) {
        let x = nx, z = nz;
        if (this.collisionWorld?.resolveMove) {
            const r = this.collisionWorld.resolveMove(px, pz, nx, nz, this.collHalf);
            x = r.x;
            z = r.z;
        }
        return this.clampArena(x, z);
    }

    /** Axis-aligned clamp around `home` — the backstop that keeps a boss in the room. */
    clampArena(x, z) {
        if (this.arenaRadius == null || !this.home) return { x, z };
        const r = this.arenaRadius;
        return {
            x: Math.max(this.home.x - r, Math.min(this.home.x + r, x)),
            z: Math.max(this.home.z - r, Math.min(this.home.z + r, z)),
        };
    }

    /**
     * Force the body back inside the legal arena. Called at the end of every
     * update so leaps, knockbacks, and any direct `root.position` writes the
     * shared helpers do not see still cannot leave the room.
     */
    confineToArena() {
        if (!this.root || this.arenaRadius == null) return;
        const c = this.clampArena(this.root.position.x, this.root.position.z);
        this.root.position.x = c.x;
        this.root.position.z = c.z;
    }

    /**
     * Turn the body toward the player at a capped rate, keeping
     * `state.facingVec` and the mesh yaw in step.
     *
     * `state.facingVec` has existed on every boss since the class was written
     * and was never once updated — a fixed `{x:0,z:-1}`. Nothing read it, so
     * nothing broke, but it meant a boss could not express ANY directional
     * rule: `inFrontArc` against a facing that never turns is a plate welded
     * to due north. Bosses that want directional armour call this.
     *
     * `rotation.y = atan2(fv.x, fv.z)` maps rig-local +Z onto the facing
     * vector — the same convention as `player.js` and `enemy.js`, so a mesh
     * built head-forward along +Z points where it is going.
     *
     * The rate is the whole design. It must be SLOWER than the player can
     * orbit, or the armoured arc tracks whoever is attacking and the flank the
     * fight is built around is geometrically unreachable — the exact bug that
     * once made the bulwark unkillable by melee.
     */
    faceToward(player, dt, turnRate = 1.1) {
        if (!player?.root) return;
        const dx = player.root.position.x - this.root.position.x;
        const dz = player.root.position.z - this.root.position.z;
        if (Math.hypot(dx, dz) < 1e-6) return;
        const want = Math.atan2(dx, dz);
        // First sight of the player SNAPS. `state.facingVec` defaults to
        // {x:0,z:-1} — due south — which for a mesh built head-forward along
        // +Z is 180° from where the player enters. Easing from that default at
        // a deliberately slow turn rate meant the boss opened every fight
        // rotating on the spot for the better part of two seconds, with its
        // armoured face pointed at nothing: measured, the first 1.4s of the
        // Arachnid fight had its plate facing away and every swing landing
        // free. A boss should be oriented when the doors shut, not a beat and
        // a half later.
        if (!this._faced) {
            this._faced = true;
            this.state.facingVec = { x: Math.sin(want), z: Math.cos(want) };
            this.root.rotation.y = want;
            return;
        }
        const have = Math.atan2(this.state.facingVec.x, this.state.facingVec.z);
        let delta = want - have;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const step = turnRate * dt;
        const a = Math.abs(delta) <= step ? want : have + Math.sign(delta) * step;
        this.state.facingVec = { x: Math.sin(a), z: Math.cos(a) };
        this.root.rotation.y = a;
    }

    /**
     * S6 (P1-5): uniform visual-presence scale — grows the mesh and the
     * combat radii together so gameplay matches the silhouette. Call once
     * at the end of a subclass constructor. Bosses that re-assign
     * hitRadius at runtime must use this.baseHitRadius for the reset value.
     */
    presenceScale(k) {
        if (!this.root || !k || k === 1) return;
        this.root.scale.multiplyScalar(k);
        this.hitRadius *= k;
        this.contactRadius *= k;
        this.baseHitRadius = this.hitRadius;
    }

    _checkPhase() {
        if (this.state.current === 'DEAD') return;
        const frac = this.hpFrac;
        // phase 1 until first threshold crossed, then 2, etc.
        let next = 1;
        for (let i = 0; i < this.phaseThresholds.length; i++) {
            if (frac <= this.phaseThresholds[i]) next = i + 2;
        }
        if (next > this.phase) {
            const prev = this.phase;
            this.phase = next;
            // Two halves of one event: the alarm, placed at the boss so you
            // know which way to look, and the score agreeing with it on the
            // next beat. Until now only the first existed — `sfx.phase()` fired
            // on every phase change in the game and the music never noticed.
            audioAt(this.root?.position, () => sfx.phase());
            scoreStinger(next);
            juice.hitstop(0.12);
            juice.addTrauma(0.45);
            if (this.onPhaseChange) this.onPhaseChange(this.phase, prev);
        }
    }

    /**
     * Show a glowing telegraph disc at world XZ for `life` seconds.
     * @param {number} x
     * @param {number} z
     * @param {number} radius
     * @param {number} [life=0.85]
     * @param {number} [color=0xff4040]
     */
    telegraphAt(x, z, radius, life = 0.85, color = 0xff4040) {
        this.clearTelegraph();
        // FILLED, not a donut. This drew a ring from 55% of the radius to the
        // edge while `inBlast` hit the whole disc, so the middle 55% was
        // painted as safe ground and was not. Worse than it sounds: a circle
        // telegraph is aimed AT the player, so the hole was centred on wherever
        // they were standing when it was cast, every single time, on the oldest
        // and most-used attack shape in the game.
        //
        // Found by photographing the tutorial boss's slam (`tests/qa/
        // telegraph-shots.mjs`) — the player is standing in the hole in that
        // picture, and the slam hits them. Nothing in a green suite says so;
        // `inBlast` was always correct and the drawing was always wrong.
        // Opacity comes down a little because a filled disc covers roughly
        // three times the area a donut of the same radius does, and the player
        // has to stay visible underneath it.
        const geo = new THREE.RingGeometry(0.001, radius, 32);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.62,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, this.floorY + 0.08, z);
        this.scene.add(ring);
        this._telegraph = ring;
        this._telegraphLife = life;
        this._telegraphMax = life;
    }

    clearTelegraph() {
        // The ring's companion safe-disc. Disposed with the band it belongs to
        // — a "stand here" marker outliving the attack that made it safe would
        // be the most expensive leftover mesh in the game.
        if (this._telegraphSafe) {
            if (this._telegraphSafe.parent) this._telegraphSafe.parent.remove(this._telegraphSafe);
            this._telegraphSafe.geometry?.dispose();
            this._telegraphSafe.material?.dispose();
            this._telegraphSafe = null;
        }
        if (this._telegraph) {
            if (this._telegraph.parent) this._telegraph.parent.remove(this._telegraph);
            this._telegraph.geometry?.dispose();
            this._telegraph.material?.dispose();
            this._telegraph = null;
        }
        this._telegraphLife = 0;
    }

    // ── Zelda boss grammar ──────────────────────────────────────────────────
    //
    // A Link to the Past boss is a loop the player learns by watching:
    //
    //   PATTERN  the boss does something readable — it circles, it stalks, it
    //            surfaces. You get to breathe, and to plan.
    //   WINDUP   it commits. A telegraph names WHERE the blow lands, and the
    //            boss stops doing anything else so the commitment is legible.
    //   STRIKE   damage resolves against where you are AT THAT MOMENT, so
    //            stepping off the marked ground is always enough.
    //   RECOVER  it is spent: motionless, open, and taking double damage.
    //            This is your turn, and you only get it because you dodged.
    //
    // That last beat is the one the roster was missing. Attacks fired off bare
    // cooldowns, and hitting the boss was equally good at every instant — so
    // there was no reason to read anything, and no reward for having read it.
    // RECOVER is what turns a damage race into a conversation.

    /** True while a committed action owns the boss; pattern movement should yield. */
    get busy() {
        return this.action != null;
    }

    /** True during the recovery window — the boss is open and taking bonus damage. */
    get staggered() {
        return this.action != null && this.action.stage === 'recover';
    }

    /**
     * Commit the boss to one attack.
     *
     * @param {object} def
     * @param {string}   def.name       for tests and debugging
     * @param {number}   [def.windup]   seconds of readable commitment
     * @param {number}   [def.recover]  seconds of open, double-damage stagger
     * @param {function} [def.aim]      (player) => { x, z, radius?, shape?, color?, dir? }
     *                                  the telegraph. Called once, at windup start.
     * @param {function} [def.strike]   (player, aim, game) => void — resolve damage
     * @param {function} [def.onRecover] (game) => void
     * @param {number}   [def.cooldown] seconds before the next action may start
     * @param {object}   [player]       target; defaults to the one update() saw.
     *                                  Committing to an attack with no target
     *                                  is refused rather than aimed at nothing.
     */
    /**
     * Declare the moves this boss chooses between.
     *
     * Each entry:
     *   name     what it is called, for specs and for the no-repeat rule
     *   build    () => an action def, exactly as `startAction` takes one
     *   weight   relative likelihood before any adjustment (default 1)
     *   range    [min, max] distance GATE — outside it, the move is not on the
     *            menu at all. A gate, not a rule: several moves are usually
     *            legal at once, so range narrows the choice without dictating
     *            it. A boss that answers every distance with exactly one move
     *            is solved once and executed forever after.
     *   phase    earliest phase it unlocks in (default 1)
     *   prefers  'close' | 'far' | undefined — how the player's HABIT shifts it
     */
    defineActions(list) {
        this.actionSet = list.map((a) => ({ weight: 1, phase: 1, ...a }));
        return this.actionSet;
    }

    /**
     * Seeded RNG, so a whole fight can be replayed exactly.
     *
     * `chooseAction` has to be random — a deterministic boss is a boss you
     * memorise — but a spec that cannot reproduce a sequence can only ever
     * assert vague things about it. Specs set `boss.seedRng(n)` and drive a
     * hundred choices knowing the run is repeatable.
     */
    seedRng(n) {
        this._seed = (n >>> 0) || 1;
    }

    _rand() {
        if (this._seed == null) {
            // Seed from the boss id, so two bosses in a room do not act in
            // lockstep but a given boss is still reproducible run to run.
            let h = 2166136261;
            for (const ch of String(this.bossId)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
            this._seed = (h >>> 0) || 1;
        }
        this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
        return this._seed / 4294967296;
    }

    /**
     * Remember roughly how far away the player likes to stand.
     *
     * ONE NUMBER, AND IT IS THE WHOLE DIFFERENCE BETWEEN A PATTERN AND AN
     * OPPONENT. A boss that picks moves only from the CURRENT distance is
     * reacting; a boss that picks from where you have been living is reading
     * you. A player who never leaves melee starts seeing the move that punishes
     * camping; a player who kites starts seeing the gap-closer. Neither is told
     * this is happening — it just stops being possible to find one comfortable
     * range and stay there.
     *
     * An exponential average rather than a ring buffer: same behaviour, no
     * allocation, and `HABIT_WINDOW` reads as the number of seconds of memory
     * it has. Seeded on first sight so it does not spend four seconds easing up
     * from zero and treating the player as a permanent melee camper.
     */
    trackHabit(dist, dt) {
        if (!Number.isFinite(dist)) return;
        if (this.habitDist == null) { this.habitDist = dist; return; }
        const k = 1 - Math.exp(-Math.max(0, dt) / HABIT_WINDOW);
        this.habitDist += (dist - this.habitDist) * k;
    }

    /**
     * Where the player has been living, as -1 (glued to the boss) → +1 (kiting
     * at the edge of its reach). 0 if there is no habit yet.
     */
    get habitBias() {
        if (this.habitDist == null) return 0;
        const mid = (this.engageRange || 9) * 0.5;
        return Math.max(-1, Math.min(1, (this.habitDist - mid) / mid));
    }

    /**
     * Pick a move, or null if nothing is legal right now.
     *
     * Nothing here is in a subclass, on purpose. These four rules are the
     * difference between a moveset and a fight, and fourteen bosses
     * re-implementing them is fourteen chances to get one subtly wrong — which
     * is this project's most expensive recurring bug.
     */
    chooseAction(player, dist) {
        const set = this.actionSet;
        if (!set || !set.length) return null;

        const legal = set.filter((a) => {
            if (this.phase < a.phase) return false;
            if (a.range && (dist < a.range[0] || dist > a.range[1])) return false;
            return a.when ? a.when(this, player, dist) : true;
        });
        if (!legal.length) return null;

        const bias = this.habitBias;
        const r1 = this._recent[this._recent.length - 1];
        const r2 = this._recent[this._recent.length - 2];

        const weights = legal.map((a) => {
            let w = Math.max(0, a.weight);
            // Habit. A camper sees the anti-camp move more; a kiter sees the
            // gap-closer more.
            if (a.prefers === 'far') w *= 1 + bias * HABIT_STRENGTH;
            else if (a.prefers === 'close') w *= 1 - bias * HABIT_STRENGTH;
            // Never three times running. Not "never twice" — a boss that can
            // never repeat is its own kind of predictable, and a doubled-up
            // punish is a real moment. Three is where it becomes a loop.
            if (a.name === r1 && a.name === r2) w = 0;
            return Math.max(0, w);
        });

        let total = weights.reduce((s, w) => s + w, 0);
        // Everything suppressed (one move on the menu, just used twice). The
        // no-repeat rule must never leave a boss standing there doing nothing:
        // being boring beats being inert.
        if (total <= 0) return legal[Math.floor(this._rand() * legal.length)] || legal[0];

        let roll = this._rand() * total;
        for (let i = 0; i < legal.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return legal[i];
        }
        return legal[legal.length - 1];
    }

    /**
     * Choose and commit in one call — what a subclass's `tickAI` actually uses.
     * Returns the entry started, or null.
     */
    actIfReady(player, dist) {
        if (this.action || this.actionCd > 0 || this.state.current === 'DEAD') return null;
        const pick = this.chooseAction(player, dist);
        if (!pick) return null;
        if (!this.startAction(pick.build(this), player)) return null;
        this._recent.push(pick.name);
        if (this._recent.length > 4) this._recent.shift();
        return pick;
    }

    startAction(def, player) {
        if (this.action || this.state.current === 'DEAD') return false;
        const target = player || this._actionPlayer;
        if (def.aim && !target) return false;
        const windup = (def.windup != null ? def.windup : 0.7) * this.telegraphDuration;
        const aim = def.aim ? def.aim(target) : null;
        this.action = {
            def, aim, stage: 'windup', t: windup,
            windup, recover: (def.recover != null ? def.recover : 0.9) * this.recoveryDuration,
        };
        if (aim) {
            // Every shape parameter an `aim` can carry has to be forwarded, not
            // just the ones the first two shapes needed. This dropped
            // `innerRadius` and `halfAngle` on the floor, and the failure mode
            // is the worst one this file has: the telegraph is DRAWN with the
            // default while the strike is TESTED with the authored value, so
            // the picture and the rule disagree by a couple of units and the
            // player is punished for reading correctly. Measured before the
            // fix: the Warden's sweep drew a 90° wedge and hit in a 120° one,
            // and its ring drew a safe hole of 3.83 while the safe hole was
            // 3.40. Both silent, both green. Spread the whole aim.
            this.telegraphShape(aim.shape || 'circle', {
                x: aim.x, z: aim.z,
                radius: aim.radius != null ? aim.radius : 2.2,
                innerRadius: aim.innerRadius,
                halfAngle: aim.halfAngle,
                width: aim.width,
                dir: aim.dir, life: windup, color: aim.color,
            });
        }
        // Every sound a boss action makes is placed at the boss, HERE, in the
        // framework — not at the fourteen roster call sites that write
        // `onWindup: () => sfx.whoosh()`. Placement a boss author has to
        // remember is placement that will be missing from boss fifteen, and a
        // wind-up you cannot locate is the exact cue this whole feature exists
        // to deliver. Wrapping the hook rather than the sound also means a boss
        // that plays two sounds, or a sound the base does not know about, is
        // placed for free.
        if (def.onWindup) audioAt(this.root?.position, () => def.onWindup(this));
        return true;
    }

    /** Drive the committed action. Called from update() before tickAI. */
    runAction(dt, player, game) {
        if (this.actionCd > 0) this.actionCd -= dt;
        const a = this.action;
        if (!a) return;
        a.t -= dt;
        if (a.t > 0) return;

        if (a.stage === 'windup') {
            // Resolve against where the player IS, not where the telegraph was.
            if (a.def.strike && player && !player.health?.dead) {
                audioAt(this.root?.position, () => a.def.strike(player, a.aim, game));
            }
            this.clearTelegraph();
            a.stage = 'recover';
            a.t = a.recover;
            // Open the window: stop shielding, take double, and SHOW it.
            this._preRecoverShield = this.shielded;
            this.shielded = false;
            this.vulnerableMult = this.staggerMult;
            this._showRecoverCue();
            return;
        }

        // Recovery over — close the window and go back to the pattern.
        this.vulnerableMult = 1;
        if (this._preRecoverShield != null) {
            this.shielded = this._preRecoverShield;
            this._preRecoverShield = null;
        }
        this._hideRecoverCue();
        this.actionCd = (a.def.cooldown != null ? a.def.cooldown : 1.4) / this.actionFrequency;
        // Chain: a quarter of the time, past the opening phase, come out of
        // recovery already winding up again. `_recent` is untouched, so the
        // no-three-in-a-row rule still applies across a chain — a chain is a
        // shorter gap, not a licence to repeat.
        if (this.phase >= this.chainPhase && this._rand() < CHAIN_CHANCE) {
            this.actionCd *= CHAIN_COOLDOWN;
            this.chainedLast = true;
        } else {
            this.chainedLast = false;
        }
        if (a.def.onRecover) audioAt(this.root?.position, () => a.def.onRecover(game));
        this.action = null;
    }

    /**
     * The stagger has to be visible or it may as well not exist — the same
     * mistake that left every boss telegraph rendering a metre underground.
     * A bright halo sits at the boss's feet for exactly as long as the window.
     */
    _showRecoverCue() {
        this._hideRecoverCue();
        if (!this.root) return;
        const r = Math.max(1.0, this.contactRadius * 0.9);
        const geo = new THREE.RingGeometry(r * 0.65, r, 24);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xfff0a0, transparent: true, opacity: 0.85,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const halo = new THREE.Mesh(geo, mat);
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(this.root.position.x, this.floorY + 0.05, this.root.position.z);
        this.scene.add(halo);
        this._recoverCue = halo;
        sfx.block();
    }

    _hideRecoverCue() {
        if (!this._recoverCue) return;
        if (this._recoverCue.parent) this._recoverCue.parent.remove(this._recoverCue);
        this._recoverCue.geometry?.dispose();
        this._recoverCue.material?.dispose();
        this._recoverCue = null;
    }

    /**
     * Shaped telegraphs. A circle means "stand somewhere else"; a cone means
     * "get behind it"; a line means "get out of the lane"; a ring means the
     * opposite of a circle — "get IN". One ring for every attack in the game
     * taught the player nothing about which was coming.
     *
     * @param {'circle'|'cone'|'line'|'ring'} kind
     */
    telegraphShape(kind, opts = {}) {
        const { x = 0, z = 0, radius = 2.2, life = 0.7, dir = null } = opts;
        // 'ring' is the one shape whose SAFE ground is its centre, so it has to
        // draw a real hole rather than the filled-looking annulus every other
        // telegraph uses.
        //
        // IT IS DRAWN FULL SIZE FROM THE FIRST FRAME, and that is a reversal.
        // The first version animated the band outward from the boss's feet,
        // because "something travelling out" is a lovely way to say "the answer
        // is inward". Then the capture was opened: scaling an annulus scales
        // BOTH its edges, so at a quarter size the band covered 0.85 to 2.13 —
        // entirely inside the 3.40 refuge. For the first half of every wind-up
        // the safe ground was painted red, on the one telegraph in the game
        // whose instruction is to run into the middle of it. A player obeying
        // the colour would have fled the only safe ground there was.
        //
        // There is no honest way to scale it: a fixed inner edge with a growing
        // outer one is a different annulus each frame, not a transform. So the
        // band states the truth and holds it, and the rising tension is carried
        // by the safe disc brightening instead. An animation that is wrong for
        // half its life is worth less than a shape that is right for all of it.
        if (kind === 'ring') {
            this.clearTelegraph();
            const inner = opts.innerRadius != null ? opts.innerRadius : radius * 0.45;
            const geo = new THREE.RingGeometry(Math.max(0.1, inner), radius, 40);
            const mat = new THREE.MeshBasicMaterial({
                // TELL_BAND, never the caller's tint. Every other telegraph in
                // the game takes its colour from the boss that cast it, which
                // is right when they all mean the same thing — but this one
                // means the OPPOSITE, and a shape whose instruction is reversed
                // cannot be left wearing whatever gold the author happened to
                // like. Owner's call, 2026-07-27: opposite meanings, opposite
                // colours. Enforced here so it holds for all fourteen kits
                // rather than for the one boss that remembered.
                color: TELL_BAND,
                transparent: true, opacity: 0.7,
                side: THREE.DoubleSide, depthWrite: false,
            });
            const m = new THREE.Mesh(geo, mat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(x, this.floorY + 0.07, z);
            this.scene.add(m);
            this._telegraph = m;
            this._telegraphLife = life;
            this._telegraphMax = life;

            // The safe hole, stated positively. Absence of hazard is not an
            // instruction — the first captures of this move showed a dark gap
            // that reads as a pit as easily as a refuge, and the whole point of
            // the shape is that the player has to choose to run INTO it. This
            // disc does not grow with the band: it is where the ground is going
            // to be safe, and it is that size from the first frame.
            const safeGeo = new THREE.CircleGeometry(Math.max(0.1, inner), 32);
            const safeMat = new THREE.MeshBasicMaterial({
                color: TELL_SAFE,
                transparent: true, opacity: 0.3,
                side: THREE.DoubleSide, depthWrite: false,
            });
            const safe = new THREE.Mesh(safeGeo, safeMat);
            safe.rotation.x = -Math.PI / 2;
            safe.position.set(x, this.floorY + 0.05, z);
            this.scene.add(safe);
            this._telegraphSafe = safe;
            return;
        }
        if (kind === 'circle' || !dir) {
            this.telegraphAt(x, z, radius, life, opts.color != null ? opts.color : 0xff4040);
            return;
        }
        this.clearTelegraph();
        const dlen = Math.hypot(dir.x, dir.z) || 1;
        const dx = dir.x / dlen, dz = dir.z / dlen;
        let geo;
        if (kind === 'cone') {
            const half = opts.halfAngle != null ? opts.halfAngle : Math.PI / 4;
            geo = new THREE.CircleGeometry(radius, 24, -half, half * 2);
        } else {
            const w = opts.width != null ? opts.width : 1.4;
            geo = new THREE.PlaneGeometry(w, radius);
            geo.translate(0, radius / 2, 0);
        }
        const mat = new THREE.MeshBasicMaterial({
            color: opts.color != null ? opts.color : 0xff4040,
            transparent: true, opacity: 0.6,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const m = new THREE.Mesh(geo, mat);
        // Laid flat, then yawed. The -90° X tilt maps local (x,y,z) to world
        // (x, z, -y), so the two geometries need DIFFERENT yaws to end up
        // pointing the same way: the cone's wedge is centred on local +X,
        // while the plane extends along local +Y. Solving each through the
        // tilt gives the two atan2 forms below.
        //
        // These were previously a single shared expression with a sign error,
        // which drew every cone and lane rotated away from the attack it was
        // announcing — a telegraph that actively lies is worse than none,
        // because the player is punished for reading it correctly.
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = kind === 'cone'
            ? Math.atan2(-dz, dx)
            : Math.atan2(-dx, -dz);
        m.position.set(x, this.floorY + 0.07, z);
        this.scene.add(m);
        this._telegraph = m;
        this._telegraphLife = life;
        this._telegraphMax = life;
    }

    /** Cone hit test in the XZ plane — matches the 'cone' telegraph. */
    inCone(player, origin, dir, radius, halfAngle = Math.PI / 4) {
        if (!player) return false;
        const dx = player.root.position.x - origin.x;
        const dz = player.root.position.z - origin.z;
        const d = Math.hypot(dx, dz);
        if (d > radius) return false;
        const len = Math.hypot(dir.x, dir.z) || 1;
        const dot = (dx * dir.x + dz * dir.z) / (d || 1) / len;
        return dot >= Math.cos(halfAngle);
    }

    /**
     * Annulus hit test in the XZ plane — matches the 'ring' telegraph.
     * The inverse of `inBlast`: the centre is the SAFE ground. Beyond the
     * outer edge is also safe, so a player who was already far enough out is
     * not punished for a read they could not have made.
     */
    inRing(player, x, z, inner, outer) {
        if (!player) return false;
        const d = Math.hypot(player.root.position.x - x, player.root.position.z - z);
        return d >= inner && d <= outer;
    }

    /**
     * Circle the player, staying inside the arena.
     *
     * Wraps `circleStrafe` with this boss's own clamp, and exists so that the
     * six strafe call sites in the roster cannot each forget it. That is not a
     * hypothetical: every one of them was calling the bare helper, and the
     * clamp silently absorbed the result — see the comment in `circleStrafe`.
     */
    strafe(player, dt, opts = {}) {
        circleStrafe(this.root.position, player, dt, {
            ...opts,
            clamp: (x, z) => this.clampArena(x, z),
            home: this.home,
            orbitCentre: (x, z, want) => {
                if (this.arenaRadius == null || !this.home) return { x, z };
                // Shrink the legal box by the ring radius, then clamp the
                // player into it. If the box is smaller than the ring, the
                // centre collapses to the middle of the arena, which is the
                // only point where the ring is as legal as it can be.
                const r = Math.max(0, this.arenaRadius - want);
                return {
                    x: Math.max(this.home.x - r, Math.min(this.home.x + r, x)),
                    z: Math.max(this.home.z - r, Math.min(this.home.z + r, z)),
                };
            },
        });
    }

    /**
     * Lay a lingering hazard patch on the floor.
     *
     * Five of the remaining kits need one — the Arachnid's web, the Cloud's
     * shed orbs, both of Frost & Fuel's elements, the Golem's pools and the
     * Wyrm's dive ring — and five private implementations of "a circle on the
     * ground that does something while you stand in it" is exactly the shape
     * of every telegraph bug in this file's history. One implementation, and
     * the drawn radius IS the tested radius by construction.
     *
     * A patch is not a telegraph. It is a hazard that has already landed, so
     * unlike a telegraph it is allowed to persist, and standing in it is a
     * choice the player is making with full information.
     *
     * @param {object} o
     * @param {number} o.x @param {number} o.z @param {number} o.r
     * @param {number} [o.life=4]       seconds before it fades
     * @param {number} [o.color]
     * @param {number} [o.damage=0]     per tick, on `o.tick` seconds
     * @param {number} [o.tick=0.8]
     * @param {number} [o.slow=0]       0..1 fraction of speed removed
     * @param {string} [o.kind]         tag, for hazards that react to each other
     */
    spawnPatch(o) {
        const mesh = discMesh(o.x, o.z, o.r, o.color != null ? o.color : 0x60c0a0,
            this.floorY + 0.04, 0.42);
        this.scene.add(mesh);
        this.patches = this.patches || [];
        this.patches.push({
            x: o.x, z: o.z, r: o.r,
            life: o.life != null ? o.life : 4,
            maxLife: o.life != null ? o.life : 4,
            damage: o.damage || 0,
            tick: o.tick != null ? o.tick : 0.8,
            cd: 0,
            slow: o.slow || 0,
            kind: o.kind || 'patch',
            mesh,
        });
        return this.patches[this.patches.length - 1];
    }

    /**
     * Age every patch, apply what it does, and drop it when it dies.
     *
     * `player.hazardSlow` is written rather than the speed itself: the player
     * owns its own movement, and a boss reaching into it would be a second
     * place where speed is decided. A boss that never spawns a patch pays
     * nothing here.
     */
    tickPatches(dt, player) {
        if (!this.patches || !this.patches.length) return;
        let slow = 0;
        for (let i = this.patches.length - 1; i >= 0; i--) {
            const h = this.patches[i];
            h.life -= dt;
            h.cd -= dt;
            h.mesh.material.opacity = 0.42 * Math.max(0, Math.min(1, h.life / (h.maxLife * 0.4)));
            if (player && !player.health?.dead) {
                const d = Math.hypot(player.root.position.x - h.x, player.root.position.z - h.z);
                if (d <= h.r) {
                    if (h.slow > slow) slow = h.slow;
                    if (h.damage > 0 && h.cd <= 0) {
                        this.hitPlayer(player, h.damage, 0.6, { x: h.x, z: h.z });
                        h.cd = h.tick;
                    }
                }
            }
            if (h.life <= 0) {
                if (h.mesh.parent) h.mesh.parent.remove(h.mesh);
                h.mesh.geometry.dispose();
                h.mesh.material.dispose();
                this.patches.splice(i, 1);
            }
        }
        // ACCUMULATE, never assign. A boss is no longer the only thing in the
        // game that can slow the player — the Weaver's strands write here too —
        // and a plain assignment means whichever of them happens to tick last
        // in the frame wins. The player clears this at the top of its own
        // update, so every writer starts from zero each frame and the worst
        // hazard the player is standing in is the one that counts.
        if (player) player.hazardSlow = Math.max(player.hazardSlow || 0, slow);
    }

    /**
     * Remove every patch matching `kind` — how two hazards cancel.
     *
     * Frost & Fuel is the only fight that needs it and it is the fight's whole
     * reason to have two heads: fire melts ice, ice quenches fire, so the arena
     * becomes something you SHAPE by baiting which head fires where.
     */
    clearPatches(kind, x, z, r) {
        if (!this.patches) return 0;
        let n = 0;
        for (let i = this.patches.length - 1; i >= 0; i--) {
            const h = this.patches[i];
            if (kind && h.kind !== kind) continue;
            if (x != null && Math.hypot(h.x - x, h.z - z) > (r || 0) + h.r) continue;
            if (h.mesh.parent) h.mesh.parent.remove(h.mesh);
            h.mesh.geometry.dispose();
            h.mesh.material.dispose();
            this.patches.splice(i, 1);
            n++;
        }
        return n;
    }

    /** Radial hit test in the XZ plane — matches the 'circle' telegraph. */
    inBlast(player, x, z, radius) {
        if (!player) return false;
        return Math.hypot(
            player.root.position.x - x,
            player.root.position.z - z
        ) < radius;
    }

    /**
     * Z3: the single point every boss deals player damage through. It exists so
     * the guard can be DIRECTIONAL — the filter needs to know where the blow
     * came from, and threading that through twenty-odd call sites by hand is
     * how you get nineteen of them right.
     *
     * `origin` overrides the hit's apparent source for attacks that land away
     * from the boss's body (a fireball, a floor slam at a telegraphed point):
     * you guard the direction of the thing hitting you, not the thing that
     * threw it.
     */
    hitPlayer(player, amount, iFrameTime = 0.7, origin = null) {
        return bossHit(player, amount, iFrameTime,
            origin || this.root?.position, this);
    }

    /**
     * Z3: a parried boss is forced straight into its recovery window — the
     * attack it committed to never resolves, and the punish halo opens early.
     * Reusing the existing recover stage means a parry reward is already
     * telegraphed, already doubles damage, and already cleans itself up.
     */
    stagger(sec = 0.9) {
        if (this.state.current === 'DEAD') return false;
        const a = this.action;
        if (a && a.stage === 'windup') {
            this.clearTelegraph();
            a.stage = 'recover';
            a.t = Math.max(a.recover, sec);
            this._preRecoverShield = this.shielded;
            this.shielded = false;
            this.vulnerableMult = this.staggerMult;
            this._showRecoverCue();
            return true;
        }
        if (a && a.stage === 'recover') {
            a.t = Math.max(a.t, sec); // extend an open window
            return true;
        }
        this.actionCd = Math.max(this.actionCd, sec);
        return false;
    }

    /**
     * Damage player if within contact radius (respects i-frames via health.damage).
     */
    tryContact(player, dt) {
        if (this._contactCd > 0) this._contactCd -= dt;
        if (!player || player.health?.dead || this.state.current === 'DEAD') return;
        if (this._contactCd > 0 || !this.root) return;
        const p = player.root.position;
        const b = this.root.position;
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        if (Math.hypot(dx, dz) < this.contactRadius && Math.abs(p.y - b.y) < 2.5) {
            this.hitPlayer(player, this.contactDamage, 0.85);
            this._contactCd = 0.75;
        }
    }

    update(dt, player, game) {
        if (this.state.current === 'DEAD') return;
        this.t += dt;
        // Hazard patches age whether or not the boss is mid-action — they are
        // ground that has already been changed, not something it is doing.
        this.tickPatches(dt, player);

        // Re-evaluate phases after combat has applied hp deltas this frame
        if (this._phaseDirty) {
            this._phaseDirty = false;
            this._checkPhase();
        } else {
            // Also catch external hp mutations
            this._checkPhase();
        }

        if (this._telegraph && this._telegraphLife > 0) {
            this._telegraphLife -= dt;
            const u = Math.max(0, this._telegraphLife / (this._telegraphMax || 1));
            this._telegraph.material.opacity = 0.25 + u * 0.55;
            // A ring holds its size — see telegraphShape. Everything else keeps
            // the pulse it has always had.
            if (!this._telegraphSafe) {
                this._telegraph.scale.setScalar(0.9 + (1 - u) * 0.25);
            }
            // The refuge brightens as the strike closes. This is the whole
            // animation on a ring, and it points the right way: the thing
            // getting louder is the thing to run to.
            if (this._telegraphSafe) {
                this._telegraphSafe.material.opacity = 0.18 + (1 - u) * 0.34;
            }
            if (this._telegraphLife <= 0) this.clearTelegraph();
        }

        if (this._flash > 0) {
            this._flash -= dt;
            const flashing = this._flash > 0;
            this.root?.traverse?.((c) => {
                if (c.material?.emissive) {
                    const base = c.userData?.baseEmissive ?? 1;
                    c.material.emissiveIntensity = flashing ? Math.min(3.5, base + 1.4) : base;
                }
            });
        }

        // Subclasses read this in aim() callbacks, which fire inside
        // startAction() and so have no player argument of their own.
        this._actionPlayer = player;
        this.runAction(dt, player, game);
        if (this._recoverCue && this.root) {
            this._recoverCue.position.set(
                this.root.position.x, this.floorY + 0.05, this.root.position.z
            );
            const a = this.action;
            const u = a && a.recover ? Math.max(0, a.t / a.recover) : 0;
            this._recoverCue.material.opacity = 0.45 + u * 0.45;
            this._recoverCue.scale.setScalar(1 + (1 - u) * 0.3);
        }

        this.tickAI(dt, player, game);
        this.tryContact(player, dt);
        // Always last: even a one-frame leap that tunnels a thin wall, or a
        // roster method that wrote position without the helpers, ends the
        // frame somewhere the player can stand.
        this.confineToArena();
    }

    /** Override in subclasses. */
    tickAI(_dt, _player, _game) {}

    dispose() {
        this.clearTelegraph();
        this._hideRecoverCue();
        this.clearPatches();
        if (this.root?.parent) this.root.parent.remove(this.root);
        this.root?.traverse?.((c) => {
            c.geometry?.dispose?.();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
                else c.material.dispose?.();
            }
        });
    }
}

/**
 * Register a boss into a level shell: combat list + system tick + win hook.
 * @param {object} level createLevelShell result
 * @param {BossBase|object} boss entity with update/dispose and combat fields
 * @param {object} [opts]
 * @param {string} [opts.nextBeat]
 * @param {string} [opts.toast]
 * @param {function} [opts.onDefeat]
 */
export function attachBoss(level, boss, opts = {}) {
    boss.managedBySystem = true;
    // Wire collision + arena from the level when the constructor never saw them.
    // Beat factories construct with (scene, position) and never received a
    // collisionWorld; the level always has one.
    if (boss && !boss.cores) {
        if (!boss.collisionWorld) {
            boss.collisionWorld = level.collisionWorld || opts.collisionWorld || null;
        }
        if (opts.arenaRadius != null) boss.arenaRadius = opts.arenaRadius;
        else if (level.halfSize != null) {
            // Level room size always wins over the constructor default so a
            // boss in a half=8 room gets 6.75, not the generic 7.5.
            // Stay inside the room half by a margin so doorways are not exits.
            boss.arenaRadius = Math.max(3, level.halfSize - 1.25);
        }
        // Re-home to the boss room origin when the factory placed the boss
        // off-centre (common: a few units north of origin) — the arena clamp
        // is around home, and home was the spawn point, not the room centre.
        if (opts.home) {
            boss.home = { x: opts.home.x, z: opts.home.z };
        } else if (level.bossHome) {
            boss.home = { x: level.bossHome.x, z: level.bossHome.z };
        }
        boss._bindPositionResolve?.();
    }
    // Multi-core containers (Tri-Compiler): only cores are combat targets.
    // Pushing the container itself breaks applyHit (getter-only aggregate hp).
    if (boss.cores) {
        for (const c of boss.cores) {
            c.managedBySystem = true;
            if (!c.collisionWorld) {
                c.collisionWorld = level.collisionWorld || opts.collisionWorld || null;
            }
            if (c.arenaRadius == null && level.halfSize != null) {
                c.arenaRadius = Math.max(3, level.halfSize - 1.25);
            }
            c._bindPositionResolve?.();
            if (!level.enemies.includes(c)) level.enemies.push(c);
        }
    } else if (!level.enemies.includes(boss)) {
        level.enemies.push(boss);
    }
    level.boss = boss;
    level.bossId = boss.bossId || opts.id;
    level.bossName = boss.bossName || opts.name;

    // Bosses live at their room's grid origin now, not the world origin:
    // a prebaked boss must not target the player from elsewhere in the
    // dungeon. While the player is outside the wake radius the boss still
    // animates, but sees no player (every targeting path guards on it).
    const anchor = boss.home || boss.cores?.[0]?.home || boss.root?.position;
    const WAKE_RADIUS = 40;

    // The boss's glow, as a light on the arena rather than as clipped pixels.
    // Registered here because this is the only place that sees both the boss
    // and the level's light pool. Priority 2 outranks the room's own fixtures
    // (priority 1) — while you are fighting a boss, the boss is the light.
    const glowBodies = boss.cores?.length ? boss.cores : [boss];
    const pool = level.localLights;
    if (pool) {
        for (const b of glowBodies) {
            if (!b?.root) continue;
            b._glowSource = pool.register({
                x: b.root.position.x, y: b.root.position.y + 0.6, z: b.root.position.z,
                color: b._glowColor ?? 0xffd0a0,
                intensity: b._glowIntensity ?? 4.5,
                distance: 18,
                priority: 2,
            });
        }
    }

    level.addSystem({
        update(dt, game) {
            const p = game.player?.root?.position;
            const awake = !anchor || !p
                || Math.hypot(p.x - anchor.x, p.z - anchor.z) <= WAKE_RADIUS;
            if (boss.update) boss.update(dt, awake ? game.player : null, game);
            // The light follows the body. A boss glow pinned to the spawn point
            // would light the place the boss used to be, which is worse than no
            // light at all — it tells the player to look somewhere wrong.
            for (const b of glowBodies) {
                const s = b?._glowSource;
                if (!s || !b.root) continue;
                s.x = b.root.position.x;
                s.y = b.root.position.y + 0.6;
                s.z = b.root.position.z;
                // A dead boss stops lighting the room.
                s.intensity = (b.state?.current === 'DEAD' || b.defeated)
                    ? 0 : (b._glowIntensity ?? 4.5);
            }
            // Win condition (getter-safe for multi-core)
            const dead = !!(boss.defeated
                || boss.state?.current === 'DEAD'
                || (boss.cores && boss.cores.every((c) => c.state?.current === 'DEAD')));
            if (dead && !level._bossCleared) {
                level._bossCleared = true;
                const id = boss.bossId || opts.id || 'boss';
                game.recordBoss?.(id);
                const msg = opts.toast || `${boss.bossName || 'Boss'} defeated`;
                game.hud?.toast?.(msg, 3200);
                if (opts.nextBeat) game.unlockAndSave?.(opts.nextBeat);
                if (opts.onDefeat) opts.onDefeat(game, boss);
                if (game.hud?.story) {
                    game.hud.story.queue([
                        { speaker: 'SYSTEM', text: msg },
                        ...(opts.defeatStory || []),
                    ]);
                }
            }
            // Expose live boss HUD stats
            if (game) {
                game.activeBoss = (boss.state?.current === 'DEAD' || boss.defeated) ? null : boss;
            }
        },
        dispose() {
            try { boss.dispose?.(); } catch (_) {}
        },
    });
    return boss;
}

/**
 * Circle the player while closing.
 *
 * A boss that holds a fixed radius from a player who is chasing it is simply
 * unreachable — it backs away exactly as fast as you approach, forever. That
 * is what a naive "orbit the player at R" does, and it is worse than the fixed
 * arena orbits it replaced, because at least those could be walked into.
 *
 * So the radius only ever shrinks: the boss strafes around you and spirals in,
 * which reads as circling for an opening and still guarantees the fight closes.
 *
 * @param {{x:number,z:number}} pos       mutated in place
 * @param {object} player
 * @param {number} dt
 * @param {object} [opts]
 * @param {number} [opts.speed=3]         travel speed
 * @param {number} [opts.spin=0.7]        radians/sec around the player
 * @param {number} [opts.close=0.8]       units/sec the radius tightens by
 * @param {number} [opts.minRadius=2]     never spiral closer than this
 */
/**
 * Resolve a proposed step. Prefer an explicit `resolve` (function or boss with
 * resolveMove); otherwise honour a `_ssResolve` bound on the position object
 * by BossBase. Without either, write straight through (tests, pure utilities).
 */
function applyResolve(pos, px, pz, nx, nz, resolve) {
    const fn = resolve
        || (typeof pos?._ssResolve === 'function' ? pos._ssResolve : null);
    if (!fn) {
        pos.x = nx;
        pos.z = nz;
        return;
    }
    const r = typeof fn === 'function'
        ? fn(px, pz, nx, nz)
        : fn.resolveMove(px, pz, nx, nz);
    pos.x = r.x;
    pos.z = r.z;
}

export function circleStrafe(pos, player, dt, opts = {}) {
    if (!player) return;
    const { speed = 3, spin = 0.7, close = 0.8, minRadius = 2 } = opts;
    let px = player.root.position.x, pz = player.root.position.z;
    // ORBIT A CENTRE THAT HAS ROOM FOR THE RING.
    //
    // The ring is centred on the player; the arena clamp is a box around the
    // boss's home. When the player stands near a wall, most of the ring is
    // outside the boss's legal area, and every fallback below is just a
    // different way of failing gracefully at an impossible request. Measured
    // on the Magma Wyrm with the player at (5, 5): 92% of a sixty-second fight
    // pressed against the clamp, and — after two rounds of fallbacks — a
    // stable micro-oscillation of 0.04 units over the final five seconds. The
    // boss was not stuck on a bug by then. It was stuck on the geometry.
    //
    // So move the centre instead: orbit the nearest point to the player around
    // which a full ring fits. The boss circles slightly off-centre from you and
    // keeps moving, which is the behaviour the fight was written for; hugging a
    // wall to freeze the boss stops working, which is the behaviour it was not.
    if (opts.orbitCentre) {
        const want0 = Math.max(minRadius, Math.hypot(pos.x - px, pos.z - pz));
        const c = opts.orbitCentre(px, pz, want0);
        px = c.x; pz = c.z;
    }
    const dx = pos.x - px, dz = pos.z - pz;
    const cur = Math.hypot(dx, dz) || 0.001;
    const want = Math.max(minRadius, cur - close * dt);
    const a = Math.atan2(dz, dx) + spin * dt;
    const tx = px + Math.cos(a) * want, tz = pz + Math.sin(a) * want;
    // Step toward the strafe point WITHOUT overshooting it. moveToward has no
    // clamp, so once the spiral reaches its minimum radius a full step sails
    // past the target and lands further out than it started — the boss ends up
    // jittering in and out instead of holding the ring.
    // The step this strafe WANTS to take: the arc it would cover in one frame
    // at its own spin rate, capped by its speed. Refusal is measured against
    // this, never against the step that survived clamping — see below.
    const ideal = Math.min(speed * dt, Math.max(1e-6, want * Math.abs(spin) * dt));
    if (!tryStrafeStep(pos, px, pz, want, a, speed, dt, ideal, opts)) {
        // Blocked. Orbit the other way instead of pressing into the wall.
        //
        // The strafe ring is centred on the PLAYER; the arena clamp is a box
        // around the boss's HOME. Those are different shapes in different
        // places, and neither knew about the other, so a player standing near
        // a wall put most of the ring outside the boss's legal area — the boss
        // walked into the boundary and the clamp quietly ate every step after
        // that. Measured on the Magma Wyrm with the player at (5, 5): **92% of
        // a sixty-second fight spent pressed against the clamp, 10 units of
        // total travel.** A boss whose whole design is "it swims a ring around
        // you" stood still, and it stood still hardest exactly when the player
        // did the natural thing and backed toward a wall.
        //
        // Reversing is the whole fix and it is one line of intent: if the ring
        // cannot be followed clockwise from here, follow it anticlockwise. The
        // boss keeps circling, along the part of the ring that exists.
        const back = Math.atan2(dz, dx) - spin * dt;
        if (!tryStrafeStep(pos, px, pz, want, back, speed, dt, ideal, opts)) {
            // Both ways blocked — which happens in a corner, where the whole
            // arc at this radius is outside the arena. The ring does not fit,
            // so stop trying to hold it and CLOSE. Reversing alone only moved
            // the Wyrm from 10.0 to 15.3 units of travel and left it on the
            // clamp 92% of the time; the ring it was defending simply did not
            // exist from where it was standing.
            //
            // Closing is also the right read: a boss pinned against a wall by
            // its own orbit should come at you, not shuffle.
            const cx = px - pos.x, cz = pz - pos.z;
            const cd = Math.hypot(cx, cz) || 1;
            // Toward the player if there is room to close, otherwise back into
            // the middle of the arena.
            //
            // The second fallback is the one that actually unsticks it, and the
            // measurement is why it exists: the Wyrm jams at 2.94 units from a
            // player whose ring it wants to hold at 3.0. Both arcs are outside
            // the clamp AND it is already inside its own minimum radius, so
            // "orbit the other way" and "close the distance" both correctly
            // refuse — and it stands there. Travel over the last five seconds
            // of a sixty-second fight: 0.00. Backing toward the centre is
            // always legal, always leaves the corner, and reads as a boss
            // repositioning rather than a boss glitching.
            const ox = pos.x, oz = pos.z;
            let gx = cx / cd, gz = cz / cd;
            let room = cd - minRadius;
            if (room <= 0.05 && opts.home) {
                gx = opts.home.x - pos.x;
                gz = opts.home.z - pos.z;
                const gd = Math.hypot(gx, gz) || 1;
                gx /= gd; gz /= gd;
                room = Math.min(gd, speed * dt);
            }
            if (room > 0.001) {
                const step = Math.min(room, speed * dt);
                applyResolve(pos, ox, oz, ox + gx * step, oz + gz * step, opts.resolve);
                if (opts.clamp) {
                    const c = opts.clamp(pos.x, pos.z);
                    pos.x = c.x; pos.z = c.z;
                }
            }
        }
    }
}

/**
 * One strafe step toward the ring point at angle `a`. Returns false if the
 * step was refused — by collision, or by the arena clamp — so the caller can
 * try the other direction.
 */
function tryStrafeStep(pos, px, pz, want, a, speed, dt, ideal, opts) {
    let tx = px + Math.cos(a) * want;
    let tz = pz + Math.sin(a) * want;
    if (opts.clamp) {
        const c = opts.clamp(tx, tz);
        tx = c.x; tz = c.z;
    }
    const ddx = tx - pos.x, ddz = tz - pos.z;
    const dd = Math.hypot(ddx, ddz);
    const step = Math.min(dd, speed * dt);
    if (dd <= 1e-6) return false;
    const ox = pos.x, oz = pos.z;
    applyResolve(pos, ox, oz, ox + (ddx / dd) * step, oz + (ddz / dd) * step, opts.resolve);
    // Clamp the RESULT, not just the target, and measure the refusal here.
    //
    // Clamping only the target was the first version and it detected nothing:
    // the step "succeeded" inside this function and `BossBase.confineToArena`
    // undid it at the end of the update, several stack frames away. The Wyrm's
    // pinned time did not move at all — 92% before and after — because the
    // reversal was being chosen on the strength of a step that had already
    // been thrown away. **A guard has to run where the thing it guards
    // happens.**
    if (opts.clamp) {
        const c = opts.clamp(pos.x, pos.z);
        pos.x = c.x; pos.z = c.z;
    }
    const moved = Math.hypot(pos.x - ox, pos.z - oz);
    // Measured against the step the strafe WANTED, not against `step` — which
    // is already the clamped, truncated version and therefore always nearly
    // satisfied. That was the second version of this guard and it detected
    // nothing either: the Wyrm was creeping 0.0026 units per frame toward a
    // target the clamp had cut down to 0.0026 units away, which passed a
    // "did you move a tenth of your step" test every single frame while the
    // boss stood still. **Comparing an outcome against a budget the failure
    // already shrank is how a guard measures its own excuse.**
    return moved > ideal * 0.3;
}

/** Utility: move entity toward point with simple speed. */
export function moveToward(pos, target, speed, dt, resolve) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const ox = pos.x, oz = pos.z;
    applyResolve(pos, ox, oz,
        ox + (dx / d) * speed * dt,
        oz + (dz / d) * speed * dt,
        resolve);
    return d;
}

/** Utility: bounce inside axis-aligned arena. */
export function bounceArena(pos, vel, center, radius) {
    const minX = center.x - radius, maxX = center.x + radius;
    const minZ = center.z - radius, maxZ = center.z + radius;
    if (pos.x < minX || pos.x > maxX) {
        vel.x *= -1;
        pos.x = Math.max(minX, Math.min(maxX, pos.x));
        return true;
    }
    if (pos.z < minZ || pos.z > maxZ) {
        vel.z *= -1;
        pos.z = Math.max(minZ, Math.min(maxZ, pos.z));
        return true;
    }
    return false;
}
