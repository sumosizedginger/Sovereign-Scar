// Player construct — modular voxels, physics, combat.

import { createActorRig, recolorActor } from './characters/actor-rig.js';
import { heroSkinPalette, wornSkin, DEFAULT_SKIN } from './characters/hero-skins.js';
import { outfitOf } from './kernel/wardrobe.js';
import { createActorAnimator } from './characters/actor-animator.js';
import { makeFacing } from '../combat/facing.js';
import { ArcSmear } from './fx/arc-smear.js';
import { juice } from './fx/juice.js';
import { vsfx } from './fx/vsfx.js';
import { gsfx } from './audio/sfx-bank.js';
import { HeldWeapon } from './fx/held-weapon.js';
import { HeldShield } from './fx/held-shield.js';
import { GrappleRope } from './fx/grapple-rope.js';
import { HERO_PALETTE } from './assets/palettes.js';
import { VoxelPhysicsBody } from './physics/voxel-physics-body.js';
import { getProfile } from './physics/friction-profiles.js';
import { HealthPool } from './kernel/health.js';
import { Inventory } from './kernel/inventory.js';
import {
    getWeapon, PHASE_BOOT,
    CHARGE_TIME, CHARGE_WINDUP, CHARGE_MOVE_MULT, DASH_ATTACK,
} from './combat/weapons.js';
import { combatSweep, applyHit } from './combat/combat-sweeper.js';
import { GrappleController } from './combat/grapple.js';
import { GuardController, GUARD_SPEED_MULT } from './combat/guard.js';
import { LockOnController } from './combat/lock-on.js';
import { coach } from './ui/coach.js';
import { INPUT_BUFFER } from './input.js';
import {
    comboMove, chains, COMBO_STEPS, COMBO_WINDOW,
} from './combat/combo.js';

/**
 * How fast a smear rotates while it lives, in radians/sec, signed by the step.
 *
 * `ArcSmear` spins the fan about its own centre, so this is the visible
 * HANDEDNESS of a stroke: positive sweeps one way, negative the other. Kept
 * small — 1.6 rad/s over a 0.12s smear is about 11 degrees of travel — because
 * the fan is already drawn at the move's true arc and a smear that rotated far
 * would sweep the picture off the ground the hit test covers, which is the one
 * thing this project will not do with a telegraph.
 */
const SMEAR_SWEEP = 1.6;

/**
 * Half-width of the Light Caster's uncharged ray, in world units.
 *
 * Named because it is now used twice — once to decide what the beam hits and
 * once to draw it — and two hand-copied 0.7s is exactly how a weapon ends up
 * drawn one size and resolved another.
 */
export const RAY_LATERAL = 0.7;

/**
 * How the hero is built, EXPORTED so a spec can check the real thing.
 *
 * These lived inline in the constructor, and `hero-readability.spec.mjs` kept
 * its own copy of them under a comment saying "exactly the options player.js
 * passes". It was not exactly anything — it was a copy, and a copy cannot
 * notice that the original changed. Proved the expensive way: deleting the
 * cloak here, and dropping the rim to the default, and handing the hero the
 * frost faction's colour, all left that spec at 15/15. It was pinning its own
 * constant with great rigour.
 *
 * One object, one owner, imported by whoever needs to know.
 */
export const HERO_RIG = {
    palette: HERO_PALETTE,
    torsoProfileScale: 0.72,
    headProfileScale: 0.9,
    meshScale: 0.39,
    clothingMode: 'casual',
    groundOffset: -0.95,
    // RESERVED TO THE HERO — and "reserved" is a claim a test checks, not a
    // hope. The first pick was a cold cyan, and `hero-readability.spec.mjs`
    // failed it on sight: the frost faction's accent is #60e0ff, near enough the
    // same colour that in a frost room the player would have been marked out in
    // exactly the shade worn by the things trying to kill them.
    //
    // Azure is what is actually free. The bestiary's nine accents run red,
    // orange, amber, two yellow-greens, a pale violet, a near-white and that one
    // cyan; a saturated blue is the only cool region nobody occupies, and it
    // sits opposite both the tan Crust and the red Pyre. Unlike a black outline
    // it ADDS light to the character rather than taking the character away.
    rimColor: 0x4a86ff,
    rimStrength: 0.9,
    // NO CLOAK. Built, measured, and cut — the second accessory this pass added
    // to the hero and the second the owner rejected on sight.
    //
    // It was a `BoxGeometry`: a rigid slab that never moved, because nothing
    // here simulates cloth. The owner's words: it "does not flow like a cape,
    // and looks more like a massive shield on his back." Both true, and no
    // amount of resizing fixes either — a cape that does not move is a board.
    //
    // It also, to its credit, exposed a real rendering bug that predates it by
    // months: the player's contact shadow was being drawn at CHEST height (see
    // `fx/contact-shadow.js`), invisible inside their own silhouette until a
    // wide flat surface gave it something to cut across. That fix stays.
    //
    // AND THE PREMISE IT WAS BUILT ON WAS WRONG. I argued the hero was hard to
    // tell from the enemies, entirely from static greyscale screenshots. The
    // owner, who has played it: "I guarantee you a player can tell the
    // difference." A still frame cannot show the one cue that dominates in
    // play — the figure that answers the controller is the player, every frame,
    // unmistakably. Optimising a photograph is not optimising a game.
    //
    // If hero readability ever does need more, the direction is the one the
    // owner gave: change the player MODEL — proportions, stance, head shape —
    // not another object bolted to its back.
    // If the hard outline is ever turned back on (see actor-rig.js), the hero's
    // is thicker than everyone else's. It is off by default.
    outlineWidth: 0.11,
};

export class Player {
    constructor(scene, collisionWorld, getVoxelAt) {
        this.scene = scene;
        this.collisionWorld = collisionWorld;

        // Ticket F: named-pivot rig + procedural animator replace the old
        // single welded figure. Same frozen part builders, same grounding
        // (feet at the physics body's bottom face, rig.y - 0.95).
        // Built in whatever skin the save says, so a returning player is
        // dressed correctly on the first frame rather than being repainted a
        // moment later. `wornSkin` is read again in `applySavedSkin` once the
        // inventory exists — this pass only covers a Player constructed with
        // one already restored, which is not the common path but is a real one.
        this.skin = DEFAULT_SKIN;
        // The two held slots. Kept on the player rather than read out of the
        // inventory inside the update loop, because that loop runs every frame
        // and the answer only moves when something unlocks or the wardrobe is
        // used — and because a level load rebuilds the holders, which then need
        // telling what they are wearing.
        this.weaponSkin = DEFAULT_SKIN;
        this.shieldSkin = DEFAULT_SKIN;
        this.actor = createActorRig(HERO_RIG);
        this.rig = this.actor.root;
        this._inner = this.actor.inner;
        this._eyes = this.actor.eyes;
        this.animator = createActorAnimator(this.actor, { archetype: 'hero', isHero: true });
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
        // Phase C. Three numbers and one object, all of them readable from
        // outside so the HUD and the specs share the player's own state rather
        // than re-deriving it.
        // The melee string. `comboStep` is the step the NEXT press will play,
        // `_sinceSwing` how long ago the last one was. Both live on the player
        // rather than in the combo module because they are per-hero state and
        // the module is a pure derivation — see combat/combo.js.
        this.comboStep = 0;
        this._sinceSwing = Infinity;
        this.chargeT = 0;          // seconds the attack button has been held
        this.chargeArmed = false;  // has crossed CHARGE_TIME (drives the cue)
        this.chargeStrike = null;  // { t, weapon, charge } — committed, locked
        this.dashAttackT = 0;      // seconds the lunging body stays lethal
        this._dashAttackHit = null;
        this.grapple = new GrappleController();
        // The hero used to swing an empty fist with every weapon, and the
        // grapple had no visuals at all — press G and you were simply
        // somewhere else. Both are legibility problems, not decoration:
        // weapon reach and arc differ enough that you have to be able to see
        // what you are holding.
        this.heldWeapon = new HeldWeapon(this.rig);
        this.heldShield = new HeldShield(this.rig);
        this.grappleRope = new GrappleRope(scene);
        this.arcSmear = new ArcSmear(scene); // C8: true 8-way swing arcs

        // Z3: the guard intercepts damage at the single HealthPool entry point,
        // so every enemy and boss route through it without any of them knowing
        // it exists.
        this.guard = new GuardController();
        this.health.damageFilter = (hit) => this.guard.resolve(
            hit, this.rig.position, this.state.facingVec
        );
        this.guard.onParry = (meta) => {
            // Its own sound, not the block clang: a parry and a failed block
            // used to be acoustically identical, which meant the game gave the
            // same feedback for its most and least skilful outcomes.
            gsfx.parry();
            // A parry is the single most skilful thing the player can do, so it
            // gets the loudest feedback the juice layer has: a real hitstop.
            juice.hitstop(0.09);
            juice.addTrauma(0.35);
            // The reward for a clean read is an opening: stagger whoever swung.
            const src = meta && meta.attacker;
            if (src) {
                if (src.knockbackVel) {
                    const dx = src.root.position.x - this.rig.position.x;
                    const dz = src.root.position.z - this.rig.position.z;
                    const d = Math.hypot(dx, dz) || 1;
                    src.knockbackVel.x += (dx / d) * 6;
                    src.knockbackVel.z += (dz / d) * 6;
                }
                if (src.stagger) src.stagger(0.7);
                else if (src.attackCd != null) src.attackCd = Math.max(src.attackCd, 0.7);
                src.onHit?.();
            }
        };
        // Dull and wooden, deliberately unlike the parry's bright ring: you
        // took the hit, you did not beat it.
        this.guard.onBlock = () => {
            gsfx.guardBlock();
            juice.addTrauma(0.12);
            // The shield's real cost is poise, and poise is a pool the player
            // has no reason to look at until something tells them it exists.
            // `docs/CONTROLS.md` explains all of this beautifully and is not in
            // the game; before this the coach had three lines total, against
            // guard, parry, poise, guard-break, lock-on, target-switching, the
            // grapple, the boot, the wedge, the caster, mirror travel, vials
            // and dust.
            coach('guard-poise',
                'Blocking costs poise, not health — watch the pips. '
                + 'Run out and your guard breaks, which is worse than the hit.');
        };
        this.guard.onBreak = () => {
            vsfx.hurt();
            juice.addTrauma(0.5);
            coach('guard-break',
                'Guard broken. Turtling loses to this — let poise recover, '
                + 'or answer with a parry: tap guard as the blow lands.');
        };

        // Z4: Z-targeting. `getCandidates` is installed by the game loop, which
        // is the only thing that knows the live enemy list for the current room.
        this.lockOn = new LockOnController();

        this.frictionName = 'default';
        this._stepAcc = 0;
        this.spawnPoint = { x: 0, y: 1.95, z: 0 };
    }

    /**
     * Wear `id`, repainting the live rig.
     *
     * Cheap to call every frame — a no-op unless the skin actually changed —
     * so the caller does not have to track what is already on. That matters
     * because the two callers are a level load and an unlock, and neither of
     * them knows what the other did.
     *
     * @returns {boolean} `true` if the hero's appearance changed
     */
    setSkin(id) {
        const next = id || DEFAULT_SKIN;
        if (next === this.skin) return false;
        // The rig is repainted BEFORE `this.skin` is updated, so a refused
        // swap — a palette that somehow changed the vertex count — leaves the
        // player correctly describing the skin they are still wearing. A field
        // that says `bonewarden` over a body that is still Crustwalker is the
        // kind of disagreement that outlives the bug that caused it.
        if (!recolorActor(this.actor, HERO_RIG, heroSkinPalette(next, HERO_PALETTE))) return false;
        this.skin = next;
        return true;
    }

    /**
     * Dress the weapon and the shield. The holders rebuild on the next frame's
     * `set`, which now keys on the skin as well as on what is equipped.
     *
     * @returns {boolean} `true` if either slot changed
     */
    setGearSkins(weaponId, shieldId) {
        const w = weaponId || DEFAULT_SKIN;
        const s = shieldId || DEFAULT_SKIN;
        if (w === this.weaponSkin && s === this.shieldSkin) return false;
        this.weaponSkin = w;
        this.shieldSkin = s;
        return true;
    }

    /**
     * Put the hero in whatever the save says they own and chose — all three
     * slots, not only the body.
     *
     * Returns whether ANYTHING changed. The body's repaint can legitimately
     * refuse (see `setSkin`) while the gear still moves, so the two results
     * are OR-ed rather than the body's being taken as the answer for all three.
     */
    applySavedSkin() {
        const worn = outfitOf(this.inventory);
        const body = this.setSkin(worn.hero);
        const gear = this.setGearSkins(worn.weapon, worn.shield);
        return body || gear;
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
        this.guard.reset();
        this.lockOn.release();
        this.chargeT = 0;
        this.chargeArmed = false;
        this.chargeStrike = null;
        this.dashAttackT = 0;
        this._dashAttackHit = null;
    }

    /**
     * Is a press right now the next step of a live string?
     *
     * Read by the input gate as well as by `tryAttack`, because the two have to
     * agree: the gate is what lets a press through DURING the recovery of the
     * previous swing, and a string that `tryAttack` would continue but the gate
     * refuses is a string that only exists in this file.
     */
    comboReady() {
        return this.comboStep > 0 && chains(this._sinceSwing);
    }

    tryAttack(enemies, destructibles, opts = {}) {
        // The cooldown gate yields to a live string. That is the whole point of
        // a combo — the second press lands inside the first swing's recovery,
        // which is exactly what `attackCd` exists to forbid. It yields to
        // nothing else: outside the window `comboReady` is false and this is
        // the same gate it always was.
        if ((this.attackCd > 0 && !this.comboReady()) || this.health.dead) return [];
        const weapon = getWeapon(this.inventory.activeWeapon);
        if (weapon.ray) {
            // Light Caster ray — handled by caller with LightLineSystem ideally
            this.attackCd = weapon.cooldown;
            // Ray weapons POINT (no melee arc): the pose library's
            // light_caster profile holds an aim pose instead of a sweep.
            this.animator?.attack('light_caster', {
                windup: 0.05,
                strikeDur: 0.16,
                recover: 0.2,
            });
            gsfx.attack('light_caster');
            const hits = [];
            const range = weapon.range || 12;
            // The ray had NO visual whatsoever — the caller was supposed to draw
            // it with the LightLineSystem and never did, so the only feedback
            // for the game's one ranged weapon was the sound and whatever it
            // happened to kill. Drawn as the lane it resolves: from the player,
            // `range` long, as wide as the lateral gate below.
            this.arcSmear.spawn({
                position: this.rig.position,
                facingVec: this.state.facingVec,
                color: weapon.smearColor || 0xfff0a0,
                lift: 0.75,
                lane: { length: range, width: RAY_LATERAL * 2 },
            });
            // The ray reaches a switch the same way it reaches an enemy — all
            // the way down the lane, at the lane's own width.
            this._strike(destructibles, range, RAY_LATERAL + 0.6);
            for (const e of enemies) {
                if (!e || e.state?.current === 'DEAD') continue;
                if (e.canHit === false || e.shielded) continue;
                const ox = e.root.position.x - this.rig.position.x;
                const oz = e.root.position.z - this.rig.position.z;
                const fv = this.state.facingVec;
                const forward = ox * fv.x + oz * fv.z;
                const lateral = Math.abs(-ox * fv.z + oz * fv.x);
                if (forward > 0 && forward < range && lateral < RAY_LATERAL + (e.hitRadius || 0)) {
                    applyHit(e, weapon, this);
                    hits.push(e);
                }
            }
            return hits;
        }

        // ── The string ──────────────────────────────────────────────────────
        //
        // Which step this press is depends on how long ago the last one was,
        // and NOTHING ELSE — not on whether it connected. A string that only
        // advanced on a hit would break every time the player whiffed the first
        // swing of an approach, which is the swing most likely to whiff.
        //
        // `move` replaces `weapon` from here down, and it has to replace it
        // EVERYWHERE: the cooldown, the smear's radius and arc, the sweep, the
        // hit test and the damage all come off one object, because a finisher
        // that resolves 2.34 units while drawing 1.8 is the same defect as a
        // boss telegraph that lies.
        const step = this.comboReady() ? this.comboStep : 0;
        const move = comboMove(weapon, step);
        this.comboStep = (step + 1) % COMBO_STEPS;
        this._sinceSwing = 0;

        this.attackCd = move.cooldown || 0.3;
        // Body commits to the same swing the smear draws: snap windup,
        // strike matching the 0.12s smear life, settle within the cooldown.
        this.animator?.attack(this.inventory.activeWeapon, {
            windup: 0.07,
            strikeDur: 0.12,
            recover: Math.max(0.12, (move.cooldown || 0.3) - 0.19),
        });
        gsfx.attack(this.inventory.activeWeapon);
        this.arcSmear.spawn({
            position: this.rig.position,
            facingVec: this.state.facingVec,
            radius: move.range || 1.8,
            // The weapon's OWN arc, not the pool's default 110 degrees. The fan
            // still under-draws the rectangle's far corners and still leaves the
            // hole at the hilt — that is what makes it read as a sword rather
            // than a pie — but it no longer covers ground the swing cannot reach.
            arc: move.arcRad,
            color: move.smearColor || 0x7fe0ff,
            // The return stroke sweeps back the other way. This is the only
            // thing separating the three pictures at a glance, and without it a
            // string reads as one swing getting bigger.
            spin: (move.sweep || 1) * SMEAR_SWEEP,
        });

        // THE FINISHER CARRIES YOU. Applied through the physics body rather
        // than by writing the position, so it is resolved against the world
        // like any other motion — a lunge that teleported through a wall would
        // undo the line-of-sight work in the move directly above it.
        if (move.push) {
            const fv = this.state.facingVec;
            this.physics.applyImpulse(fv.x * move.push * 4, 0, fv.z * move.push * 4);
        }

        const hits = combatSweep(this, enemies, move, this.physics.getVoxelAt);
        for (const h of hits) applyHit(h, move, this);

        if (weapon.shatter && destructibles) {
            const fv = this.state.facingVec;
            const px = this.rig.position.x + fv.x * 1.2;
            const pz = this.rig.position.z + fv.z * 1.2;
            const py = this.rig.position.y + 0.5;
            for (const d of destructibles) {
                // Struck-by-anything targets are handled by `_strike` below, on
                // every weapon. Letting them through here too would fire them
                // twice per swing for the two weapons that shatter.
                if (d?.struckByAnything) continue;
                if (d && d.shatterAtWorld) {
                    const n = d.shatterAtWorld(px, py, pz, weapon.shatterRadius || 3);
                    if (n > 0) {
                        vsfx.shatter();
                        // Playtest issue 1: shatter used to throw away its
                        // return value except for the sound. Breaking ore is
                        // the verb the Heavy Mallet toast promises — pay it.
                        this.onShatter?.(d, n);
                    }
                }
            }
        }
        this._strike(destructibles, 1.2, 2.0);
        return hits;
    }

    /**
     * Anything on the destructible list that ANY hit sets off.
     *
     * `weapon.shatter` gates the loop above, and it is only true of the Tectonic
     * Wedge and the Heavy Mallet — which is right for ore, because breaking rock
     * is what those two are for and that gating is the reward for carrying them.
     * It was catastrophically wrong for the puzzle switch, which rode the same
     * list on the assumption that "every weapon already routes a swing through
     * it". Every weapon does not. A player holding the Anchor Link or the Light
     * Caster could not activate a switch at all, and switches are the entire
     * puzzle vocabulary of the seven even-numbered dungeons.
     *
     * So a target may opt in to being struck by anything. The ore does not, and
     * nothing about it changes.
     */
    _strike(destructibles, forward = 1.2, radius = 2.0) {
        if (!destructibles) return;
        const fv = this.state.facingVec;
        const py = this.rig.position.y + 0.5;
        // Sampled ALONG the reach rather than at one point on it, so a 16-unit
        // beam does not have to be modelled as a 16-unit-wide ball to cover its
        // own length. `radius` stays the lane's half-width at every sample.
        const steps = Math.max(1, Math.ceil(forward / radius));
        for (let i = 1; i <= steps; i++) {
            const at = (forward * i) / steps;
            const px = this.rig.position.x + fv.x * at;
            const pz = this.rig.position.z + fv.z * at;
            for (const d of destructibles) {
                if (d?.struckByAnything && d.shatterAtWorld) d.shatterAtWorld(px, py, pz, radius);
            }
        }
    }

    /**
     * Phase C — the charge, one frame of it.
     *
     * The state machine is deliberately small: hold, arm, release, commit,
     * resolve. The two rules that matter are both about what CANNOT happen.
     *
     * A charge cannot be held through a guard break. The break is the game's
     * punishment for turtling and it already drains attack and dash; letting a
     * charge survive it would hand the player a free committed move the instant
     * the stun ended, which is the same bug input buffering was careful not to
     * introduce.
     *
     * A committed strike cannot be steered. Once `chargeStrike` exists the
     * player is locked in place for `CHARGE_WINDUP` and the strike resolves
     * from where they stood. That is what makes the hero readable — this game
     * asks every boss in it to keep that promise, and the player does not get
     * an exemption.
     */
    _updateCharge(dt, input, enemies, destructibles) {
        if (this.health.dead) {
            this.chargeStrike = null;
            this.chargeT = 0;
            this.chargeArmed = false;
            return;
        }
        if (this.chargeStrike) {
            this.chargeStrike.t -= dt;
            if (this.chargeStrike.t <= 0) {
                const cs = this.chargeStrike;
                this.chargeStrike = null;
                this._resolveCharge(cs, enemies, destructibles);
            }
            return;
        }
        const weapon = getWeapon(this.inventory.activeWeapon);
        if (!weapon.charge || this.guard.broken) {
            this.chargeT = 0;
            this.chargeArmed = false;
            return;
        }
        // Guarding is the other committed stance; you cannot wind a swing
        // behind your own shield, or the shield stops being a trade.
        const held = !!input.attackHeld?.() && !this.guard.raised;
        if (held) {
            this.chargeT += dt;
            if (!this.chargeArmed && this.chargeT >= CHARGE_TIME) {
                this.chargeArmed = true;
                this._chargePulse = 0;
                gsfx.chargeReady();
                coach('charge-attack',
                    'Held long enough — let go for a committed strike. '
                    + 'It hits harder and wider, but you cannot move while it lands.');
            }
            // The ring keeps pulsing while the charge is banked. One cue at the
            // moment it arms is not enough: the player is looking at the fight,
            // and a tell you can miss by blinking is a tell that does not exist
            // for anyone playing with the sound off.
            if (this.chargeArmed) {
                this._chargePulse = (this._chargePulse || 0) + dt;
                if (this._chargePulse >= 0.22) {
                    this._chargePulse = 0;
                    this.arcSmear.spawn({
                        position: this.rig.position,
                        facingVec: this.state.facingVec,
                        radius: 1.1,
                        color: weapon.charge.smearColor || 0xffffff,
                        arc: Math.PI * 2,
                        lift: 0.1,
                    });
                }
            }
            return;
        }
        if (this.chargeArmed) this._commitCharge(weapon);
        this.chargeT = 0;
        this.chargeArmed = false;
    }

    /** Release: lock the body, then resolve a beat later. */
    _commitCharge(weapon) {
        const charge = weapon.charge;
        this.chargeStrike = { t: CHARGE_WINDUP, weapon, charge };
        this.attackCd = Math.max(this.attackCd, CHARGE_WINDUP + (charge.recover || 0.5));
        this.animator?.attack(this.inventory.activeWeapon, {
            windup: CHARGE_WINDUP,
            strikeDur: 0.16,
            recover: Math.max(0.16, (charge.recover || 0.5) - 0.16),
        });
        gsfx.chargeRelease(this.inventory.activeWeapon);
        this.physics.resetVelocity();
    }

    /** The committed move lands. Returns the hit list, for the specs. */
    _resolveCharge(cs, enemies = [], destructibles = null) {
        const { charge } = cs;
        const fv = this.state.facingVec;
        // The smear is drawn to the shape that resolves, not to a convenient
        // one: a disc gets four overlapping fans covering the full turn, a lane
        // gets a narrow wedge whose width is the lane's.
        if (charge.radial) {
            for (let i = 0; i < 4; i++) {
                this.arcSmear.spawn({
                    position: this.rig.position,
                    facingVec: { x: Math.cos(i * Math.PI / 2), z: Math.sin(i * Math.PI / 2) },
                    radius: charge.range,
                    color: charge.smearColor || 0xffffff,
                    spin: 9,
                });
            }
        } else {
            // A thrust and a beam are RECTANGLES — that is literally what
            // `hitboxCheck` resolves for any non-radial move — so they are drawn
            // as the rectangle, starting at the player and reaching exactly as
            // far as they hit. Drawing them as a sector was the player-side
            // version of the telegraph lie this project spent a whole session
            // hunting in the bosses: the Caster's lance resolved over a lane
            // 1.8 wide beginning at the player's feet and was drawn as a wedge
            // beginning five and a half units in front of them.
            this.arcSmear.spawn({
                position: this.rig.position,
                facingVec: fv,
                color: charge.smearColor || 0xffffff,
                lane: { length: charge.range, width: charge.depthTolerance * 2 },
            });
        }
        juice.addTrauma(0.22);

        const hits = combatSweep(this, enemies, charge, this.physics.getVoxelAt);
        for (const h of hits) {
            applyHit(h, charge, this);
            // The shockwave's job is the opening, not the kill.
            if (charge.stagger) {
                if (h.stagger) h.stagger(charge.stagger);
                else if (h.attackCd != null) h.attackCd = Math.max(h.attackCd, charge.stagger);
            }
        }

        if (charge.shatter && destructibles) {
            // A spin breaks what is around it; a thrust breaks what is in
            // front of it. Same rule as the ordinary swing, same offset.
            const px = this.rig.position.x + (charge.radial ? 0 : fv.x * charge.range * 0.5);
            const pz = this.rig.position.z + (charge.radial ? 0 : fv.z * charge.range * 0.5);
            const py = this.rig.position.y + 0.5;
            for (const d of destructibles) {
                if (!d || !d.shatterAtWorld || d.struckByAnything) continue;
                const n = d.shatterAtWorld(px, py, pz, charge.shatterRadius || 3);
                if (n > 0) {
                    vsfx.shatter();
                    this.onShatter?.(d, n);
                }
            }
        }
        // A charged move sets off a switch whatever it is charged with — a
        // radial one from where the player stands, a lane one down its length.
        // A radial move is sampled at the player, not ahead of them — a spin
        // that reached forward only would be a spin that could not set off the
        // switch it just swept through behind your back.
        if (charge.radial) this._strike(destructibles, 0, charge.range);
        else this._strike(destructibles, charge.range, charge.depthTolerance + 0.6);
        this.onChargeStrike?.(charge, hits);
        return hits;
    }

    /**
     * Phase C — the dash-attack.
     *
     * Attacking mid-dash converts the dash into a committed lunge. Before this,
     * dash was purely defensive: the i-frame window was the entire product, and
     * against anything that shoots there was no way to spend a dash offensively
     * at all. The lunge is the gap-closer, and it costs the rest of the dash —
     * you are pointed one way for its whole length and cannot turn out of it.
     */
    tryDashAttack(enemies) {
        if (this.dashTimer <= 0 || this.health.dead) return false;
        const weapon = getWeapon(this.inventory.activeWeapon);
        const fv = this.state.facingVec;
        this.physics.applyImpulse(fv.x * DASH_ATTACK.impulse, 0, fv.z * DASH_ATTACK.impulse);
        this.dashTimer += DASH_ATTACK.extend;
        this.dashAttackT = DASH_ATTACK.active;
        this._dashAttackHit = new Set();
        this.attackCd = (weapon.cooldown || 0.3) + DASH_ATTACK.recover;
        gsfx.attack(this.inventory.activeWeapon);
        this.arcSmear.spawn({
            position: this.rig.position,
            facingVec: fv,
            radius: (weapon.range || 1.8) * 1.2,
            color: weapon.smearColor || 0x7fe0ff,
            arc: 0.7,
        });
        this.animator?.attack(this.inventory.activeWeapon, {
            windup: 0.03,
            strikeDur: DASH_ATTACK.active,
            recover: DASH_ATTACK.recover,
        });
        return true;
    }

    /**
     * The lunging body is lethal for as long as it is lunging, and each thing it
     * runs through is hit ONCE. Without the set a lunge would tick damage every
     * frame it overlapped, which at 60fps is roughly twelve hits — the move
     * would not be a gap-closer, it would be the best attack in the game.
     */
    _tickDashAttack(dt, enemies, destructibles) {
        if (this.dashAttackT <= 0) return [];
        this.dashAttackT -= dt;
        const expired = this.dashAttackT <= 0;
        // The lunge's body is lethal, and it is a body — sampled where it is,
        // not in front of itself.
        this._strike(destructibles, 0, DASH_ATTACK.radius);
        if (!enemies || !enemies.length) {
            if (expired) { this.dashAttackT = 0; this._dashAttackHit = null; }
            return [];
        }
        const weapon = getWeapon(this.inventory.activeWeapon);
        const move = {
            damage: (weapon.damage != null ? weapon.damage : 1) * DASH_ATTACK.damageMult,
            knockback: weapon.knockback || 2,
            radial: true,
            range: DASH_ATTACK.radius,
            depthTolerance: DASH_ATTACK.radius,
            vertical: 1.4,
        };
        const landed = [];
        for (const e of combatSweep(this, enemies, move, this.physics.getVoxelAt)) {
            if (this._dashAttackHit.has(e)) continue;
            this._dashAttackHit.add(e);
            applyHit(e, move, this);
            landed.push(e);
        }
        if (expired) {
            this.dashAttackT = 0;
            this._dashAttackHit = null;
        }
        return landed;
    }

    tryDash() {
        if (this.dashCd > 0 || this.health.dead) return false;
        const ownsBoot = this.inventory.hasItem('phase_boot') || this.inventory.items.phase_boot;
        const boot = PHASE_BOOT;
        // Without Phase Boot: short hop only (not full gap-cross dash)
        // THE DASH NOW MOVES AT THE SPEED THE DASH DECLARES.
        //
        // This used to hand `dashSpeed` to `physics.applyImpulse`, and
        // `VoxelPhysicsBody.update` hard-assigns `this.vx = wx * speed` on the
        // very next tick while there is movement input — which there always is
        // during a dash. The impulse was overwritten before it moved the player
        // a single frame. `dashSpeed: 18` existed in exactly two places: where
        // it was defined, and where it was thrown away.
        //
        // What actually shipped was the flat `speed: dashTimer > 0 ? 14` in
        // `update()`, so the whole dash was 14 x 0.14 = 1.96 units, of which
        // walking would have covered 0.77 anyway. Net gain over just running:
        // 1.19 units — about one cell. Hence the report, which is precise: "the
        // dash, even after picking up the dash boots, is only like 1 square".
        //
        // Carried on the player and read by `update()` instead, so the number
        // in the weapon table is the number the body moves at: 18 x 0.14 = 2.52
        // units, enough to clear a gap, which is what the item promises.
        const power = ownsBoot ? boot.dashSpeed : boot.hopSpeed;
        const dur = ownsBoot ? boot.dashDuration : boot.dashDuration * 0.6;
        const fv = this.state.facingVec;
        this._dashSpeed = power;
        this._dashDuration = dur;
        this._dashDir = { x: fv.x, z: fv.z };
        this.dashTimer = dur;
        this.dashCd = ownsBoot ? boot.cooldown : boot.cooldown * 1.2;
        // C3: Ghost-step upgrade extends dash i-frames.
        // Floor the window at 0.3s: the raw dash is 0.14s (0.084s before the
        // Phase Boot), which is shorter than a reaction and made dashing
        // useless as a defensive option — there was effectively no way to
        // avoid a hit once it was coming.
        const iWindow = Math.max(0.3, dur + 0.05) + (this.dashIframeBonus || 0);
        this.health.iFrames = Math.max(this.health.iFrames, iWindow);
        gsfx.dash();
        // A TRAIL, NOT A SWING.
        //
        // This called `spawn` with no `arc`, so it fell to the default
        // `ARC_ANGLE = PI * 0.61` — a 110-degree fan, the exact shape a sword
        // swing draws, at radius 2, wired to nothing at all. The dash has no
        // hitbox by design, so the game was drawing an attack it could not
        // deliver: "the dash ... does not hit an enemy at all, but there is a
        // swing animation" is the report, and the animation was the lie.
        //
        // A narrow streak along the facing reads as MOVEMENT. It says where the
        // body went, which is the only thing the dash actually does.
        this.arcSmear.spawn({
            position: this.rig.position,
            facingVec: fv,
            radius: ownsBoot ? 2 : 1.2,
            color: boot.smearColor,
            arc: 0.26,
        });
        return true;
    }

    update(dt, input, enemies, destructibles, camera, renderer) {
        // Damage lands from enemy/boss updates elsewhere in the frame; a
        // drop since last frame drives the hurt flinch layer.
        if (this._lastHp != null && this.health.hp < this._lastHp) {
            this.animator?.hit();
        }
        // Hazard slow is LATCHED and cleared here, once, at the top of the
        // frame. Everything that slows the player (boss patches, the Weaver's
        // strands) accumulates into `hazardSlow` with a max during its own
        // update; the player consumes last frame's total and resets the field
        // so nothing has to know when to clear it. Without the reset, walking
        // out of a web in a room with no boss in it left the player slowed for
        // the rest of the game — nothing else would ever have written a zero.
        this._hazardSlow = this.hazardSlow || 0;
        this.hazardSlow = 0;
        this.health.update(dt);
        this.arcSmear.update(dt);
        if (this.attackCd > 0) this.attackCd -= dt;
        // The string's clock. Advanced here rather than from a timestamp so it
        // runs on the GAMEPLAY clock — the same one hitstop and pause already
        // bend — and so a spec can drive a string deterministically without
        // sleeping. Left at Infinity until the first swing, which is what makes
        // a fresh player's first press an opener rather than a resumed string.
        //
        // NOTE THAT THE STEP IS NOT RESET HERE, and that is deliberate rather
        // than an omission. A line doing it was written first and a
        // counterfactual proved it could not fail: `chains()` already refuses
        // anything past the window, so a stale `comboStep` is unreachable —
        // the next press reads as an opener and rewrites it. An extra guard
        // that cannot be observed is a line nobody can maintain honestly.
        if (this._sinceSwing < COMBO_WINDOW * 4) this._sinceSwing += dt;
        if (this.dashCd > 0) this.dashCd -= dt;

        // Z4: resolve the lock first — the facing it produces has to be in hand
        // before movement writes facing, and dropping a dead target must not
        // wait a frame or the guard would cover the wrong arc.
        if (input.consumeLockToggle?.()) {
            this.lockOn.toggle(this.rig.position, this.state.facingVec);
            if (this.lockOn.target) gsfx.lockOn(); else gsfx.lockOff();
        }
        if (input.consumeLockCycle?.()) {
            this.lockOn.cycle(this.rig.position, this.state.facingVec);
            if (this.lockOn.target) gsfx.lockOn();
        }
        const lockFacing = this.health.dead ? null : this.lockOn.update(this.rig.position);
        if (this.health.dead) this.lockOn.release();

        // Z3: guard state for this frame. Dashing drops the shield — the two
        // defensive options stay mutually exclusive so neither is strictly
        // dominant, and i-frames cannot be stacked on top of chip reduction.
        const wantGuard = !!input.guardHeld?.() && this.dashTimer <= 0 && !this.health.dead;
        // You cannot raise what you do not have. The Bulwark Shield is found on
        // the predecessor's body in Beat 01, whose whole theme is reading a
        // wind-up — so the rooms before it teach the dodge, and the shield
        // arrives as a SECOND answer to a question you already know.
        this.guard.hasShield = this.inventory.hasItem('bulwark_shield');
        const wasRaised = this.guard.raised;
        const wasBroken = this.guard.broken;
        this.guard.update(dt, wantGuard);
        if (this.guard.raised !== wasRaised) {
            if (this.guard.raised) gsfx.guardUp(); else gsfx.guardDown();
        }
        if (this.guard.broken && !wasBroken) gsfx.guardBreak();
        if (wantGuard && !this.guard.hasShield) {
            coach('guard-unarmed',
                'Nothing to block with yet — read the ring and walk out of it.');
        }

        // Phase C. Both run before movement, because both can take movement
        // away: a committed charge pins the body, and a lunge owns the heading.
        this._updateCharge(dt, input, enemies, destructibles);
        this._tickDashAttack(dt, enemies, destructibles);

        // Keep the hands matched to the inventory. Cheap — both are a no-op
        // unless what the player owns actually changed.
        this.heldWeapon.set(this.inventory.activeWeapon, this.weaponSkin);
        this.heldShield.set(this.guard.hasShield, this.shieldSkin);

        // Grapple override
        const g = this.grapple.update(dt, this.collisionWorld, 0.4);
        this.grappleRope.update(dt, this.grapple.active ? {
            from: this.grapple.from,
            to: this.grapple.to,
            u: Math.min(1, this.grapple.t / this.grapple.duration),
        } : null);
        if (g.active || g.cancelled || g.arrived) {
            if (g.x != null) {
                this.rig.position.x = g.x;
                this.rig.position.z = g.z;
                if (g.y != null) this.rig.position.y = g.y;
            }
            this.physics.resetVelocity();
        } else {
            // A committed charge does not walk. The wish vector is zeroed
            // rather than the speed, so facing stops updating too — the strike
            // resolves along the heading you released on, which is the heading
            // the smear was about to be drawn along.
            // A DASH IS A COMMITTED MOVE AND OWNS ITS OWN HEADING.
            //
            // This read live stick input for the whole dash, so the dash was
            // steered by whatever the player happened to be holding — and if
            // they let go, which is the natural thing to do when you TAP a
            // dash button, `mv` went to zero and the dash covered no ground at
            // all. Ground friction then ate the rest. That is the larger half
            // of "the dash is only like 1 square": the speed fix alone raises
            // the ceiling, but this is what the player was actually hitting.
            //
            // It is the same defect the grapple was reported for in the same
            // playthrough — "I should be able to grapple and land on the ledge,
            // not fall into darkness if I'm not pushing forward". A traversal
            // verb that silently requires you to keep holding forward is a verb
            // that does nothing on the one input everybody uses.
            //
            // Committed to the heading captured at `tryDash`, so the dash goes
            // where it was aimed, at its own speed, for its own duration.
            // Facing follows `mv`, so this also keeps the body pointed along
            // the dash rather than snapping back on release.
            const mv = this.chargeStrike ? { x: 0, z: 0 }
                : (this.dashTimer > 0 && this._dashDir)
                    ? { x: this._dashDir.x, z: this._dashDir.z }
                    : input.moveVector();
            // A Link to the Past facing model: you face where you walk, and
            // standing still keeps your last facing. Mouse aim used to
            // overwrite this every single frame, so the keyboard never
            // actually controlled which way you were pointing — you swung
            // wherever the cursor happened to sit. It is gone; the pad's
            // right stick is the only optional aim override.
            if (mv.x || mv.z) this.state.setFacing(mv.x, mv.z);
            if (input.padAim) this.state.setFacing(input.padAim.x, input.padAim.z);
            // Z4: a lock outranks both. This is the whole point — facing stops
            // being a side effect of walking, so you can strafe and retreat
            // while still pointed at what you are fighting.
            if (lockFacing) this.state.setFacing(lockFacing.x, lockFacing.z);

            const result = this.physics.update(this.collisionWorld, dt, {
                wishX: mv.x,
                wishZ: mv.z,
                // `hazardSlow` is written by boss hazard patches (BossBase
                // `spawnPatch`) and read HERE, so the player still owns its own
                // speed and a boss never reaches into it. A dash ignores it on
                // purpose: dashing out of a web or a slick is the answer to
                // being in one, and a slow that also slowed the escape would
                // just be damage with extra steps.
                speed: this.dashTimer > 0 ? (this._dashSpeed || PHASE_BOOT.hopSpeed)
                    : this.speed
                        * (this.guard.raised ? GUARD_SPEED_MULT : 1)
                        * (1 - Math.min(0.75, this._hazardSlow || 0))
                        // Winding a charge slows you. That is the tell: an
                        // opponent can see a hero walking wrong, the same way
                        // the hero reads a boss planting its feet.
                        * (this.chargeT > 0 ? CHARGE_MOVE_MULT : 1),
                half: 0.4,
            });
            if (this.dashTimer > 0) this.dashTimer -= dt;

            if (result.landed) {
                gsfx.land();
                if (result.damage > 0) {
                    // Gated on the answer, for the same reason the mote's burst
                    // is: `damage()` refuses during i-frames and under god mode,
                    // and a landing that cost nothing must not sound like one
                    // that did. The other half of this — a fall being MEASURED
                    // against a height left minutes ago — is fixed in
                    // `voxel-physics-body.js`; this is the sound half.
                    const res = this.health.damage(result.damage, 0.5, 'environment');
                    if (res.accepted) vsfx.hurt();
                }
            }

            // Footsteps
            if (this.physics.grounded && (mv.x || mv.z)) {
                this._stepAcc += dt;
                if (this._stepAcc > 0.32) {
                    this._stepAcc = 0;
                    gsfx.footstep(this.surface || 'stone');
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

        // Two different things happen to a press here, and the difference is
        // the whole point.
        //
        // A broken guard is the PUNISHMENT for turtling: for BREAK_STUN seconds
        // you cannot swing, dash, or re-raise. Those inputs are drained and
        // thrown away, so they cannot queue up and all fire the instant the
        // stun ends — buffering a punishment deletes the punishment.
        //
        // A cooldown is not a punishment, it is a rhythm. A press that lands a
        // few frames before the swing is ready is the player asking correctly,
        // slightly early. That press is left ON RECORD (we do not consume while
        // the gate is shut) and fires the moment the cooldown expires, up to
        // INPUT_BUFFER later. Consuming unconditionally — which this used to do
        // — read the press, found the gate shut, and silently binned it.
        //
        // A committed charge drains both for the same reason a guard break
        // does: it is a commitment the player chose, and honouring presses made
        // during it would let them cancel out of their own wind-up.
        if (this.guard.broken || this.chargeStrike) {
            input.consumeAttack();
            input.consumeDash();
        } else {
            if ((this.attackCd <= 0 || this.comboReady()) && input.consumeAttack(INPUT_BUFFER)) {
                // Mid-dash, the same press means something else. Phase C's
                // second half: the dash gets an offensive spend.
                if (this.dashTimer > 0) this.tryDashAttack(enemies);
                else this.tryAttack(enemies, destructibles);
            }
            if (this.dashCd <= 0 && input.consumeDash(INPUT_BUFFER)) this.tryDash();
        }

        const wc = input.consumeWeaponCycle();
        if (wc) this.inventory.cycleWeapon(wc);

        if (this.health.dead) {
            this.state.current = 'DEAD';
        }

        // Ticket F: pose from the gameplay clock. The animator writes only
        // local pivot rotations — root position/yaw above stay physics-owned.
        if (this.animator) {
            const mv2 = (g.active || g.cancelled) ? null : input.moveVector();
            this.animator.setLocomotion({
                speed: this.dashTimer > 0 ? 14 : this.speed,
                wishX: mv2 ? mv2.x : 0,
                wishZ: mv2 ? mv2.z : 0,
                grounded: this.physics.grounded,
            });
            // WITH ITS REAL LENGTH. `setDashing(active)` alone leaves the
            // animator on its built-in default, so the dash pose was being
            // played against the wrong clock and only ever reached a third of
            // its travel before the dash was over. The pose and the move have
            // to agree about how long the move is.
            this.animator.setDashing(this.dashTimer > 0, this.dashTimer > 0
                ? (this._dashDuration || undefined) : undefined);
            this.animator.setGrapple(!!g.active);
            this.animator.setGuarding(this.guard.raised);
            this.animator.setDead(this.health.dead);
            this.animator.update(dt);
        }
        this._lastHp = this.health.hp;
    }

    dispose() {
        this.arcSmear.dispose();
        this.heldWeapon?.dispose();
        this.heldShield?.dispose();
        this.grappleRope?.dispose();
        if (this.rig.parent) this.rig.parent.remove(this.rig);
    }
}
