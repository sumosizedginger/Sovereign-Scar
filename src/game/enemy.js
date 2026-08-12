// Hostile constructs — chase, charge, and ranged AI variants.

import * as THREE from 'three';
import { createActorRig } from './characters/actor-rig.js';
import { createActorAnimator } from './characters/actor-animator.js';
import { bodyFor, childBody } from './characters/bodies.js';
import { attachEnemyProp } from './assets/enemy-props.js';
import { makeFacing } from '../combat/facing.js';
import { ENEMY_PALETTES } from './assets/palettes.js';
import { sfx } from '../audio/synth.js';
import { gsfx } from './audio/sfx-bank.js';
import { at as audioAt } from '../audio/spatial.js';
import { getActiveRunMode } from './kernel/run-mode.js';
import { coach } from './ui/coach.js';
import { inGuardArc } from './combat/guard.js';
import { applyHit } from './combat/combat-sweeper.js';

/**
 * What a bolt is worth once you have sent it back.
 *
 * Used to be a constant multiplier of the projectile's attack damage (2×, or
 * 4× on a parry). Enemy HP scales with the campaign curve while that constant
 * did not, so by Beat 07 a held-shield reflect could never kill an ordinary
 * shooter at any difficulty or upgrade level (best case 3 damage into 3.5 HP).
 * The owner's report that "a parry is required" was the arithmetic, not a
 * feel call.
 *
 * Now a held-shield reflect is worth the shooter's own max HP — "your own shot
 * kills you" is true at every beat by construction. A parry-timed reflect is
 * still strictly better (1.5× max HP) so the skill ceiling survives.
 */
const REFLECT_HELD_HP_FRAC = 1.0;
const REFLECT_PARRY_HP_FRAC = 1.5;

/**
 * How long a returned bolt opens the thing it came from.
 *
 * A reflect is the ranged half of a parry — that is the stated design (see the
 * comment on the guard branch in `_updateProjectiles`: a shooter is answered by
 * HOLDING the shield, because demanding frame-accuracy on something you cannot
 * walk out of is a read the game never showed you). So it buys the same reward
 * a parry does, for the same reason `stagger()` exists: whatever makes this
 * enemy hard to hit, the read undoes.
 *
 * Without it, the bolt arrives from directly in front — because that is where
 * the player who blocked it is standing — and a defender with directional
 * armour eats its own shot. That is not a hypothetical: a `bulwark` with
 * `ai: 'ranged'` is authored in three rooms (Beat 05 westgallery, Beat 08
 * gravecanopy, Beat 11 cardfile), and it turned every one of them into a
 * stalemate that the game actively taught the player to lose:
 *
 *   • its plate refuses melee and rays from the front;
 *   • it never swings, so `armor-front`'s "parry its swing" cannot happen;
 *   • a bolt in flight is reflected rather than parried, so the parry verb
 *     never fires against it at all — 0 staggers over 100 seconds of perfect
 *     taps, against 17 for the same enemy in melee;
 *   • and the reflect, the one answer left, clanged off that same plate 49
 *     times for 0 damage while `reflect-bolt` promised on screen that a
 *     blocked bolt kills the thing that fired it.
 *
 * Nothing could hurt anything. The reported symptom was exactly that: "cannot
 * parry enemy, enemy cannot hit me".
 *
 * Matches the parry's own stagger length so the two halves of one verb pay out
 * the same. It is deliberately applied to EVERY reflect, not just armoured
 * ones: an unarmoured shooter dies to the bolt anyway (frac 1.0 of max HP), so
 * this is invisible there and cannot regress it.
 */
const REFLECT_STAGGER = 0.7;

/**
 * The mote's burst, as three numbers that MUST agree.
 *
 * They are named because they were three separate literals — the distance the
 * mote parks at, the radius it draws, and the radius it resolves against — and
 * a burst whose drawn ring does not match the range it damages is a telegraph
 * that lies. This is the kind that the owner reported as having "no way to
 * avoid their hit or defend against it", so the tell had better be honest.
 *
 * What you have to do to escape is `MOTE_BURST - MOTE_HOLD` = 0.6 units, and
 * how long you have to do it in is `MOTE_WINDUP` seconds. It used to be 0.8
 * units in 0.5s while the ring was drawn wider than the mote ever came — the
 * numbers were survivable on paper and unreadable in play. Now the mote comes
 * visibly INSIDE the circle it paints, and stepping off it is a short walk
 * with most of a second to make it.
 *
 * The other half of the answer is the shield: a mote's burst carries a real
 * origin, so it lands in the guarded cone if you turn and face it. That was
 * always true and always useless, because a blocked hit still chipped you and
 * a mote cannot be answered with a sword. With chip damage now zero, standing
 * your ground and facing it is a genuine second answer.
 */
// Idle look-around, for enemies outside aggro range. Kept slow and narrow on
// purpose: this must read as a creature noticing the room, never as a patrol,
// and it must never sweep so far that a player reads it as "it has seen me".
/** How far either side of its spawn facing an idle enemy will glance. */
export const IDLE_ARC = 1.15;          // radians, ~66 degrees
/** Rough seconds between glances; jittered per enemy either side of this. */
const IDLE_DWELL = 2.6;
/** Radians per second while glancing — a look, not a snap. */
const IDLE_TURN_RATE = 1.05;

const MOTE_HOLD = 2.0;
const MOTE_BURST = 2.6;
const MOTE_WINDUP = 0.85;

/**
 * Phase D1 — what happens to an enemy the director refuses.
 *
 * `DENIED_RETRY` is the cooldown it is left with. Short, because being refused
 * is not a punishment and not a rhythm — it is a queue, and an enemy that
 * waited its turn should get one soon. Long enough that a room at one token
 * does not thrash the director sixty times a second.
 *
 * `PRESSURE_TIME` is how long it repositions before asking again. Roughly one
 * beat: enough for the movement to read as intent rather than jitter.
 */
/**
 * How high an enemy climbs, and how far up it bothers to look for ground.
 *
 * `ENEMY_STEP` is one cell, the same as the hero's `MAX_STEP_HEIGHT`. Anything
 * larger and a chaser walks up a wall; anything smaller and terraced rooms —
 * which is now every room — become impassable to half the bestiary.
 */
export const ENEMY_STEP = 1;
const ENEMY_MAX_GROUND_Y = 8;

export const DENIED_RETRY = 0.3;
export const PRESSURE_TIME = 0.7;

/**
 * The Frost Chorus's volley (Phase D2). `VOLLEY_GAP` is the beat between bolts
 * — long enough to be three events rather than a shotgun, short enough that
 * walking out of the fan between the first and last is a real move and not a
 * stroll. `VOLLEY_FAN` is the angle between adjacent lanes.
 */
export const VOLLEY_GAP = 0.26;
export const VOLLEY_FAN = 0.30;

/**
 * Phase D3 — the Weaver's strand.
 *
 * A slow line laid across the room. It is deliberately NOT collision: a strand
 * that blocked movement would be new geometry appearing mid-fight in a room the
 * player may have to cross to reach a door, and this project has already
 * shipped two softlocks (the seal, the door bounce). It slows, which changes
 * every route in the room without ever closing one.
 *
 * `WEB_LIFE` is long enough that a room accumulates a shape over a fight and
 * short enough that a fight you are losing is not a fight in treacle.
 */
export const WEB_LEN = 8.0;
export const WEB_W = 1.5;
export const WEB_LIFE = 9.0;
export const WEB_SLOW = 0.4;

/**
 * Phase D3 — the Censer's pulse.
 *
 * Heals and shields everything nearby EXCEPT itself. That exception is the
 * whole enemy: it cannot save itself, so the question it asks is not "how do I
 * beat this" but "what do I kill first", which is a question nothing else in
 * the bestiary has ever asked. Its own health is low to match — the answer has
 * to be cheap once you have seen it.
 */
export const CENSE_R = 7.0;
export const CENSE_HEAL = 1.5;
export const CENSE_SHIELD = 1.4;

export class Enemy {
    /**
     * @param {string} kind sentinel | scarab | frost | bulwark | mote | lancer | brood
     * @param {string} [opts.ai] chase | charge | ranged | lunge | drift  (default by kind)
     */
    constructor(scene, collisionWorld, position, opts = {}) {
        const mode = getActiveRunMode();
        this.kind = opts.kind || 'sentinel';
        this.ai = opts.ai || defaultAi(this.kind);
        const pal = ENEMY_PALETTES[this.kind] || ENEMY_PALETTES.sentinel;
        // Ticket F: named-pivot rig + archetype animator — sentinel, scarab,
        // and frost diverge in rest pose and gait, not just palette.
        //
        // …and now in BODY. Every enemy in the game used to be built at exactly
        // these defaults, because no level ever passed anything else: the
        // bulwark, the mote and the lancer were one silhouette in three
        // colours. `bodies.js` carries the per-kind proportions and explains
        // why the knob that already existed could not have done this.
        const body = { ...bodyFor(this.kind), ...(opts.body || {}) };
        this.actor = createActorRig({
            palette: pal,
            torsoProfileScale: opts.scaleProfile || body.torsoProfileScale,
            headProfileScale: body.headProfileScale,
            meshScale: opts.meshScale || body.meshScale,
            bodyScale: body.bodyScale,
            clothingMode: 'casual',
            groundOffset: 0, // enemy rig origin sits on the floor (rig.y = floor top)
        });
        this.rig = this.actor.root;
        this._inner = this.actor.inner;
        this.animator = createActorAnimator(this.actor, { archetype: this.kind });
        this.rig.position.set(position.x, position.y != null ? position.y : 1.0, position.z);
        scene.add(this.rig);
        this.scene = scene;

        this.root = this.rig;
        this.state = makeFacing(-1);
        this.state.current = 'IDLE';
        // DERIVED from the body, not written next to it. The old default was a
        // hand-typed 0.5 against a rig that measures 0.490 — right, but only by
        // coincidence, and it would have stayed 0.5 for a bulwark now 1.4× as
        // wide. A hitbox that disagrees with the body it belongs to is the
        // single worst bug this genre has: the player sees a swing connect and
        // the game says it did not.
        this.hitRadius = opts.hitRadius || this.actor.radius;
        const baseHp = opts.hp != null ? opts.hp : 3;
        this.hp = Math.max(1, baseHp * mode.enemyHp);
        this.maxHp = this.hp;
        this.speed = opts.speed || (this.ai === 'charge' ? 2.8 : 2.2);
        this.damage = opts.damage || 1;
        this.collisionWorld = collisionWorld;
        this.aggroRange = opts.aggroRange || 10;
        // Melee reach is measured from the SURFACE, not the centre. Written as
        // a flat 1.4 it described the sentinel exactly (0.9 + its 0.49 radius)
        // and nothing else: a bulwark stopping 1.4 from the player's centre
        // would have had a third of its body inside them, and the telegraph
        // ring it draws (attackRange + 0.3) would have lied by the same amount.
        this.attackRange = opts.attackRange
            || (this.ai === 'ranged' ? 7 : 0.9 + this.hitRadius);
        // Wall probe. Enemies used a flat 0.4 regardless of size, which buries
        // a wide body in masonry — the same mistake bosses made before the
        // playtest fix, and fixed the same way.
        //
        // 0.8 of the body, and NOT floored at the old 0.4: a floor that high is
        // wider than the mote (0.349) and the brood's children, and a probe
        // wider than the thing it is probing for refuses gaps the body would
        // fit through. At the sentinel's 0.490 this evaluates to 0.392, which
        // is the 0.4 everything used to use — the reference kind is unchanged.
        this.collHalf = opts.collHalf != null
            ? opts.collHalf
            : Math.min(this.hitRadius, Math.max(0.2, this.hitRadius * 0.8));
        // The prop is built AFTER attackRange, because the lance is sized from
        // it: the visible point and the reach that resolves damage are the same
        // number by construction rather than by two people agreeing.
        // `reach` here is the MELEE reach, always — never `attackRange`.
        //
        // Passing attackRange looked obviously right and was wrong for exactly
        // one case: a ranged lancer's attackRange is 7, so it was handed a
        // 6.4-metre pike whose butt hung five metres through the floor. Nothing
        // in the game looked wrong, because the lance pointed down through
        // solid ground — it was found by a bounding-box assertion in
        // visual-sanity, measuring a mob 7.58 units tall.
        //
        // The lance represents a thrust, and a thrust is a melee distance; a
        // shooter's range is not a thing it is holding.
        this.prop = attachEnemyProp(this.actor, this.kind, {
            radius: this.hitRadius,
            height: this.actor.height,
            reach: 0.9 + this.hitRadius,
        });
        this.attackCd = 0;
        this.knockbackVel = { x: 0, z: 0 };
        this._flash = 0;
        this._chargeT = 0;
        this._chargeDir = null;
        // Attack telegraphs. Every hostile action winds up first: the enemy
        // freezes, a ring marks the ground it is about to strike, and only
        // when the windup expires is damage resolved — against the player's
        // position AT THAT MOMENT. Previously an enemy simply called
        // player.health.damage() the instant its cooldown expired and you
        // were in range, so a hit was unavoidable and unreadable: no tell to
        // react to, and no way to step out of it once committed.
        this.windup = (opts.windup != null ? opts.windup : 0.45) * mode.telegraphDuration;
        this.actionFrequency = mode.actionFrequency;
        this.projectileSpeed = mode.projectileSpeed;
        this._windupT = 0;
        this._pendingStrike = null;
        this._strikeMark = null;
        this._tell = null;
        this._tellLife = 0;
        this._tellMax = 0;
        this.loot = opts.loot || null;
        this.onDeath = opts.onDeath || null;
        this.projectiles = [];

        // Z5 — the traits that make a kind ask a different question.
        //
        // frontArmor: melee from inside the front cone is refused outright.
        //   The answers are to flank it (which is why lock-on strafing exists)
        //   or to parry its swing, which opens `_openT`.
        // hover: sits above melee reach entirely, so it must be answered at
        //   range. `flyHeight` is measured from the floor the enemy spawned on.
        // split: comes apart on death into `split` weaker copies. The level
        //   supplies the spawner via attachSplit(), because only the level
        //   knows how to register a new enemy with the room.
        this.frontArmor = !!opts.frontArmor || this.kind === 'bulwark';
        // A plate is only a puzzle if the player can get behind it. Facing used
        // to snap at the player every frame, which pinned the armoured cone on
        // whoever was attacking: `inFrontArc` was true for every swing from
        // every angle, and a bulwark was literally unkillable by melee. The
        // flank the kind is built around was geometrically unreachable.
        //
        // 2.2 rad/s is derived, not picked. The plate spans ±75° (PI/2.4), so
        // the player must win 1.31 rad of relative bearing. Circling at speed
        // 5.5 from melee range (~1.5) is 3.7 rad/s of orbit, so the net gain is
        // ~1.5 rad/s — just under a second of committed strafing to open the
        // back. Fast enough to feel earned, slow enough that standing still and
        // swinging never works. Infinity leaves every other kind bit-for-bit
        // identical to before.
        this.turnRate = opts.turnRate != null ? opts.turnRate
            : (this.frontArmor ? 2.2 : Infinity);
        this.hover = opts.hover != null ? opts.hover : this.kind === 'mote';
        // Cruise height is deliberately ABOVE every melee vertical gate
        // (heavy_mallet gate ≈ 2.0 against a player at 1.95 → anything under
        // ~3.2 is swingable). The mote used to live there permanently, so a
        // melee loadout had no answer except a parry the game never taught.
        // It now DESENDS to `strikeHeight` while winding up a burst — the
        // window is the punish, the cruise height is the identity.
        this.flyHeight = opts.flyHeight != null ? opts.flyHeight : 3.4;
        // ~1.0 above the floor puts the body well inside every melee gate
        // without parking it on the ground like a grounded stagger does.
        this.strikeHeight = opts.strikeHeight != null ? opts.strikeHeight : 1.05;
        this.split = opts.split || (this.kind === 'brood' ? 2 : 0);
        this.generation = opts.generation || 0;
        this._openT = 0;      // armour-down window bought by a parry
        this._lungeT = 0;
        this._lungeDir = null;
        // Phase D1 — the encounter director. Nullable, and a null director
        // grants every request, so the sandbox, the levels that predate this
        // and every existing spec behave exactly as they did. It is adopted by
        // `EncounterDirector.update`, not wired at the spawn sites: there are
        // five of those across two files and a missed one is an enemy with an
        // unlimited attack licence that nothing would report.
        this.director = null;
        this._pressureT = 0;

        // Phase D2 — the elite twists. All four are options rather than
        // subclasses, because an elite IS an ordinary enemy with one thing
        // changed; a subclass would be a second place for every future bestiary
        // fix to be forgotten.
        this.elite = !!opts.elite;
        this.eliteName = opts.eliteName || null;
        this.eliteId = opts.eliteId || null;
        // Read by `combat-sweeper.inFrontArc`. Undefined leaves the bulwark's
        // own ±75° default untouched.
        if (opts.armorArc != null) this.armorArc = opts.armorArc;
        this.doubleLunge = !!opts.doubleLunge;
        this.volley = opts.volley || 0;
        this.childSplit = opts.childSplit || 0;
        this._lungeChained = false;
        this._volleyLeft = 0;
        this._volleyT = 0;
        this._volleyDir = null;
        // Phase D3.
        this.webs = [];     // Weaver strands, owned by the body that spun them
        this._shieldT = 0;  // Censer grant; `shielded` is derived from it
        // The elite's health bar reuses the boss bar wholesale — it reads
        // `bossName`, `hp`, `maxHp` and the phase pair off whatever it is
        // handed, and an elite is exactly a thing with a name and a health bar.
        if (this.eliteName) {
            this.bossName = this.eliteName;
            this.phase = 1;
            this.maxPhase = 1;
        }
        // THREE BODIES, ONE POOL (Mote Cluster). `applyHit` writes
        // `defender.hp` directly, so the pool is installed as an accessor over
        // that exact property — every damage path in the game, present and
        // future, lands in the shared number without knowing it exists.
        if (opts.sharedPool) {
            const pool = opts.sharedPool;
            if (pool.hp == null) {
                pool.hp = this.hp;
                pool.max = this.hp;
            }
            Object.defineProperty(this, 'hp', {
                get: () => pool.hp,
                set: (v) => { pool.hp = v; },
                configurable: true,
            });
            this.maxHp = pool.max;
            this.sharedPool = pool;
        }
        // Which way this body circles when it cannot commit. Derived from where
        // it was placed rather than random, so a room's enemies fan out both
        // ways and a spec driving the same room twice gets the same fight.
        this._orbitSign = ((Math.floor(position.x) + Math.floor(position.z)) & 1) ? 1 : -1;
        this._driftT = Math.random() * Math.PI * 2;
        // Playtest issue 7: clamp to the room the enemy was baked into so a
        // chase never walks out a doorway. Optional — unit tests and the
        // sandbox omit it and behave as before.
        this.roomBounds = opts.roomBounds || null;
        // Optional, and null-safe everywhere it is used: the sandbox and most
        // unit specs build enemies with no level at all, and those behave
        // exactly as they did before this existed.
        this.getVoxelAt = opts.getVoxelAt || null;
        // Spawned onto the ground rather than at a flat y=1. Enemy positions are
        // authored in a table that predates terracing, so a body authored on
        // what is now a step began its life inside it — before it had taken a
        // single step.
        if (this.getVoxelAt) this.seatOnGround();
        this._lastGroundX = this.rig.position.x;
        this._lastGroundZ = this.rig.position.z;
        if (this.hover) {
            this._groundY = this.rig.position.y;
            this.rig.position.y = this._groundY + this.flyHeight;
            coach('mote-air',
                'That one flies. Wait for it to dive into its burst — then swing. A parry also drops it.');
        }

        this.onHit = () => {
            this._flash = 0.15;
            this._snapshotEmissiveBases();
            this.animator?.hit(); // flash PLUS stagger lean (Ticket F)
            // The impact sound belongs to combat-sweeper, which is the only
            // place that knows whether the hit wounded or killed.
        };
        // Z5: a plate that eats a swing has to SOUND like it, or the player
        // reads "my attack missed" instead of "that side is armoured" and
        // never learns the counterplay.
        this.onBlocked = opts.onBlocked || (() => {
            // The clang itself comes from combat-sweeper, which knows whether
            // this was a plate or a generic shield; doubling it here made one
            // impact sound like two.
            this._flash = 0.1;
            this._snapshotEmissiveBases();
            // The clang says "that did nothing". It does not say WHY, and a
            // player who never saw this dungeon's theme hint has no way to
            // infer a rule from a sound. Once, at the exact moment it matters.
            if (this.frontArmor) {
                // The advice has to match the enemy in front of you. "Parry its
                // swing" is good counsel for a bulwark that swings and useless
                // for one that shoots — and a ranged bulwark is authored in
                // three rooms, so the untrue half of this line was the only
                // instruction those fights ever gave.
                // Separate ids, not one id with two strings: `coach` speaks an
                // id once per session, so sharing one would mean whichever
                // bulwark you met first silenced the other's rule forever — and
                // a melee bulwark is met first in every route through the game.
                if (this.ai === 'ranged') {
                    coach('armor-front-ranged',
                        'That plate turns blades, and this one keeps its distance. '
                        + 'Circle behind it — or hold guard and send its own bolt back into it.');
                } else {
                    coach('armor-front',
                        'That plate turns blades. Circle behind it — or parry its swing to drop it.');
                }
            }
        });
    }

    /**
     * Mark the ground the enemy is committing to strike. Mirrors the boss
     * telegraph (bosses/base.js) so both read the same to the player.
     */
    telegraphAt(x, z, radius, life, color = 0xff5533) {
        // The single most important rule in the game, said the first time the
        // game asks the player to obey it. Every hostile action in Sovereign
        // Scar winds up first and resolves against where you are THEN — which
        // is a generous, readable design that the player has to notice before
        // it helps them.
        coach('telegraph-ring',
            'That ring is where the blow will land, not where it started. '
            + 'Walk out of it, or dash through — a dash has invulnerable frames.');
        this.clearTelegraph();
        // Filled, for the same reason BossBase.telegraphAt is: the resolve
        // tests the whole disc, so drawing the middle half as clear floor
        // painted safe ground that was not.
        const geo = new THREE.RingGeometry(0.001, radius, 24);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        // Sit just above the floor the enemy is standing on. An absolute y
        // here (as the boss telegraph uses) buries the ring: room floors are
        // at y = 1, so the tell rendered underneath the ground and the player
        // saw no warning at all.
        // A hovering enemy's tell still belongs on the FLOOR — painted at
        // altitude it is invisible from a top-down camera and unreadable
        // against the thing casting it.
        ring.position.set(x, (this.hover ? this._groundY : this.rig.position.y) + 0.06, z);
        this.scene.add(ring);
        this._tell = ring;
        this._tellLife = life;
        this._tellMax = life;
        this._tellAt = { x, z, r: radius };
    }

    clearTelegraph() {
        this._tellAt = null;
        if (this._tell) {
            if (this._tell.parent) this._tell.parent.remove(this._tell);
            this._tell.geometry?.dispose();
            this._tell.material?.dispose();
            this._tell = null;
        }
        this._tellLife = 0;
    }

    /** Snapshot body emissives once so hit flash can restore (not wipe to black). */
    _snapshotEmissiveBases() {
        this.rig?.traverse?.((c) => {
            if (!c.material?.emissive || c.userData.baseEmissiveHex != null) return;
            c.userData.baseEmissiveHex = c.material.emissive.getHex();
            c.userData.baseEmissiveIntensity = c.material.emissiveIntensity ?? 0;
        });
    }

    _applyFlashEmissive(flashing) {
        this.rig?.traverse?.((c) => {
            if (!c.material?.emissive) return;
            if (flashing) {
                c.material.emissive.setHex(0xff4040);
                // Body materials intentionally have intensity 0 (rim is shader-only);
                // flash must raise it or the hit read is invisible.
                c.material.emissiveIntensity = Math.max(
                    c.userData.baseEmissiveIntensity ?? 0, 0.85
                );
            } else {
                c.material.emissive.setHex(c.userData.baseEmissiveHex ?? 0x000000);
                if (c.userData.baseEmissiveIntensity != null) {
                    c.material.emissiveIntensity = c.userData.baseEmissiveIntensity;
                }
            }
        });
    }

    /**
     * Commit to an attack that lands `windup` seconds from now. The enemy
     * holds still while winding up (that pause IS the tell), and `resolve`
     * decides at strike time whether it actually connects.
     */
    _beginWindup(resolve, opts = {}) {
        // Phase D1. THE choke point: every committed attack in the bestiary
        // routes through here, so the concurrency rule is stated once instead
        // of at the eight AI call sites that build wind-ups.
        //
        // A denial REFUNDS most of the cooldown the caller just spent. The
        // callers all set `attackCd` before calling — that ordering predates
        // the director — so without the refund a denied enemy would eat its
        // full two-second cooldown for an attack it never made, and a room at
        // one token would go quiet instead of staying dangerous.
        if (this.director && !this.director.request(this)) {
            this.attackCd = Math.min(this.attackCd, DENIED_RETRY);
            this._pressureT = PRESSURE_TIME;
            return false;
        }
        const dur = opts.windup != null ? opts.windup : this.windup;
        this._windupT = dur;
        this._pendingStrike = resolve;
        const fv = this.state.facingVec;
        // The marked ground, remembered as DATA on the ATTACK.
        //
        // `_resolveMelee` used to measure from `this.rig.position` at strike
        // time, which is a different point from the one the ring was painted at
        // — measured, 0.29 units apart on a sentinel, because the body is nudged
        // by separation inside the same update that commits the attack. (The
        // docstring below is right that the enemy holds still THROUGH the
        // wind-up: drift is 0.000 over 200 frames. It is the commit frame itself
        // that moves it.)
        //
        // This lives here and not next to the mesh, and that placement is the
        // whole fix. The first version stored it in `telegraphAt` beside the
        // ring — and the ring's life is exactly the wind-up, so it had already
        // been disposed by the frame the strike resolved. `_strikeMark` was
        // null at the only moment it was ever read, the change did nothing in
        // the running game, and a spec that called `strike` by hand while the
        // ring was still up reported it working. Trap 12 wearing a new coat.
        // The mark now outlives the picture of it, and the end-to-end
        // assertion in `telegraph-truth.spec.mjs` drives a real wind-up to
        // resolution rather than poking the resolver.
        // How far AHEAD of the body to mark, and how big. This offset used to
        // be called `reach`, and the name is why two melee sites passed 0.9
        // into it: `reach` in this class means melee reach everywhere else, so
        // 0.9 looked like the right value and was a 0.9-unit forward shove of
        // the telegraph away from the ground that actually got hit. It is
        // `offset` now, and melee passes none.
        //
        // ONE offset and ONE radius, used for the mark and for the picture of
        // it. They were briefly two copies of the same defaulting expression;
        // the counterfactual that shoved the ring forward again caught them
        // drifting apart, which is the whole failure this file is about,
        // reproduced inside the fix for it.
        const offset = opts.offset != null ? opts.offset : 0;
        const radius = opts.radius || (this.attackRange + 0.3);
        const markX = this.rig.position.x + fv.x * offset;
        const markZ = this.rig.position.z + fv.z * offset;
        this._strikeMark = { x: markX, z: markZ, r: radius };
        this.telegraphAt(markX, markZ, radius, dur, opts.color);
        // Sync rule 1 (Ticket F): the body's windup pose shares the ring's
        // exact life, so the raise peaks as the ring peaks. Frost aims (point
        // profile), scarab compresses low, sentinel pulls a slash back.
        this.animator?.startWindup(dur,
            this.ai === 'ranged' ? 'light_caster'
                : this.kind === 'scarab' ? 'bare_strike' : 'anchor_link');
        // The wind-up whoosh is THE cue this game asks the player to act on, and
        // it is the one most often made by something off the side of the frame.
        // Placed here in the base rather than at the eight call sites that build
        // windups, for the same reason `BossBase` places its own.
        audioAt(this.rig?.position, () => sfx.whoosh());
        return true;
    }

    /**
     * Land a melee strike only if the player is still inside the marked area.
     * This is what makes a hit avoidable: walking or dashing clear during the
     * windup means the swing whiffs.
     */
    _resolveMelee(player, damage, reach) {
        // Resolve against the RING, not the body. `reach` stays as the fallback
        // for any caller that resolves without having marked anything.
        const mark = this._strikeMark;
        const ox = mark ? mark.x : this.rig.position.x;
        const oz = mark ? mark.z : this.rig.position.z;
        const r = mark ? mark.r : reach;
        const dx = player.root.position.x - ox;
        const dz = player.root.position.z - oz;
        if (Math.hypot(dx, dz) > r) {
            sfx.step(); // whiff — the player got out in time
            return false;
        }
        // Z3: `from` is what makes the guard directional — block the sentinel
        // in front of you and the scarab behind you still opens your back.
        const res = player.health.damage(damage, 0.9, 'hostile', {
            from: this.rig.position, attacker: this,
        });
        if (res.accepted) sfx.hurt();
        return res.accepted;
    }

    /**
     * Z3: interrupted — drop any committed swing and stand open. This is the
     * reward a parry buys the player, so it must cancel the pending strike
     * rather than merely delaying it.
     */
    stagger(sec = 0.7) {
        this._windupT = 0;
        this._pendingStrike = null;
        this._strikeMark = null;
        // Give the token back on the same frame the swing is cancelled. The
        // prune would find it next frame anyway, but a parry's whole reward is
        // that the fight moves — holding the room's only attack licence for an
        // attack that no longer exists is the opposite.
        this.director?.release(this);
        this._chargeT = 0;
        this._lungeT = 0;
        this.clearTelegraph();
        this.attackCd = Math.max(this.attackCd, sec);
        // Z5: one rule, uniformly applied — a parry undoes whatever makes this
        // enemy hard to hit. The bulwark drops its plate; the mote drops out
        // of the air. That single sentence is the whole reward structure, and
        // it means neither kind can ever become unkillable if the player
        // skipped the item that was "meant" to answer it.
        this._openT = Math.max(this._openT, sec);
        if (this.hover) this._groundedT = Math.max(this._groundedT || 0, sec);
        this.animator?.hit();
    }

    /** Z5: true while the front plate actually refuses melee. */
    get armorUp() {
        return this.frontArmor && this._openT <= 0 && this.state.current !== 'DEAD';
    }

    /**
     * The floor under this enemy — where anything it drops belongs.
     *
     * A hovering enemy's `root.position.y` is `_groundY + flyHeight`, i.e. 3.4
     * units up, and every drop was being spawned there: hearts from a slain
     * mote hung in mid-air, and `HeartDrop.update` only collects within 2.0
     * units of vertical, so they were not merely ugly — they were
     * unreachable. Killing a mote paid you nothing at all.
     */
    get dropY() {
        return this.hover ? this._groundY : this.rig.position.y;
    }

    /**
     * True while a hovering enemy is out of sword reach. False during a parry
     * ground, and during the burst windup dive — those are the melee windows.
     */
    get airborne() {
        if (!this.hover || this.state.current === 'DEAD') return false;
        if (this._groundedT > 0) return false;
        if (this._windupT > 0) return false;
        return true;
    }

    update(dt, player) {
        // A cluster shares one pool, so emptying it kills every body in it.
        // `applyHit` only ever marks the body it struck, which would otherwise
        // leave two motes alive at zero HP — unkillable, since every further
        // hit takes the pool further below zero and never marks them.
        if (this.sharedPool && this.hp <= 0 && this.state.current !== 'DEAD') {
            this.state.current = 'DEAD';
            this.onDeath?.();
        }
        if (this.state.current === 'DEAD') {
            this.rig.visible = false;
            this.clearTelegraph();
            this._clearProjectiles();
            this.animator?.setDead(true);
            return;
        }
        this._frameMove = 0;
        this._updateAI(dt, player);
        this._separateFrom(player);
        // Ticket F: pose from the same clocks the AI runs on. The animator
        // writes only local pivot rotations; root position/yaw stay AI-owned,
        // so hitboxes (root.position + hitRadius) never drift from the body.
        if (this.animator) {
            const sp = dt > 0 ? this._frameMove / dt : 0;
            this.animator.setLocomotion({
                speed: sp,
                wishX: sp > 0.2 ? this.state.facingVec.x : 0,
                wishZ: sp > 0.2 ? this.state.facingVec.z : 0,
                grounded: true,
            });
            this.animator.update(dt);
        }
    }

    /**
     * Keep a body's width between us and the player.
     *
     * The AI stops advancing at `attackRange`, but nothing stopped the PLAYER
     * from walking straight through an enemy, and the two then stand in the
     * same square metre. That is bad enough to look at — the reported symptom
     * was a mob standing on the player's head — but it also breaks the maths
     * that every directional rule is built on: at zero separation there is no
     * bearing, so `inFrontArc` answers "armoured" by default and a bulwark you
     * are hugging cannot be flanked at all.
     *
     * The enemy is what yields, never the player: shoving the player's rig
     * fights their input, and being able to body a construct out of your way
     * is the correct-feeling half of the trade. Movement goes through the
     * collision world so nobody gets pushed into a wall.
     */
    _separateFrom(player) {
        if (!player?.root || this.hover || this.state.current === 'DEAD') return;
        if (player.health?.dead) return;
        const min = (this.hitRadius || 0.5) + 0.5;
        let dx = this.rig.position.x - player.root.position.x;
        let dz = this.rig.position.z - player.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d >= min) return;
        let len = d;
        if (d < 1e-4) {
            // Exactly co-located: back out along our own facing, which is the
            // one direction we know the player did not come from.
            dx = -this.state.facingVec.x; dz = -this.state.facingVec.z; len = 1;
        }
        this._move(dx, dz, len, min - d);
    }

    _updateAI(dt, player) {
        if (this.attackCd > 0) this.attackCd -= dt;
        if (this._openT > 0) this._openT -= dt;
        if (this.hover) {
            // Height is the mechanic. Three stations, in priority order:
            //   1. grounded by a parry  → floor (full melee opening)
            //   2. winding up a burst   → strikeHeight (melee can connect)
            //   3. otherwise            → flyHeight cruise (out of reach)
            // The dive is the tell: when it drops, swing. A player who never
            // picked up the Light Caster still has an answer.
            if (this._groundedT > 0) this._groundedT -= dt;
            this._driftT += dt * 1.6;
            let target;
            if (this._groundedT > 0) {
                target = this._groundY;
            } else if (this._windupT > 0) {
                target = this._groundY + this.strikeHeight;
            } else {
                target = this._groundY + this.flyHeight + Math.sin(this._driftT) * 0.22;
            }
            // Ease rather than teleport, so the dive and the climb both read.
            this.rig.position.y += (target - this.rig.position.y) * Math.min(1, dt * 9);
        }

        // Telegraph ring pulses brighter as the strike approaches
        if (this._tell && this._tellLife > 0) {
            this._tellLife -= dt;
            const u = Math.max(0, this._tellLife / (this._tellMax || 1));
            this._tell.material.opacity = 0.8 - u * 0.45;
            this._tell.scale.setScalar(0.75 + (1 - u) * 0.35);
            if (this._tellLife <= 0) this.clearTelegraph();
        }
        if (this._flash > 0) {
            this._flash -= dt;
            this._applyFlashEmissive(this._flash > 0);
        }

        this.rig.position.x += this.knockbackVel.x * dt;
        this.rig.position.z += this.knockbackVel.z * dt;
        this.knockbackVel.x *= 0.85;
        this.knockbackVel.z *= 0.85;
        this._clampToRoom();

        this._updateProjectiles(dt, player);
        // Before the wind-up gate below, not after: the rest of a volley has to
        // keep firing while the enemy is standing still, and the enemy standing
        // still is precisely what a wind-up looks like. The strands and the
        // shield are here for the same reason — a Weaver mid-wind-up still owns
        // the webs it already spun.
        this._tickVolley(dt);
        this._tickWebs(dt, player);
        if (this._shieldT > 0) {
            this._shieldT -= dt;
            const on = this._shieldT > 0;
            if (on !== !!this.shielded) this._applyFlashEmissive(on);
            this.shielded = on;
        }

        if (!player || player.health?.dead) return;
        const px = player.root.position.x;
        const pz = player.root.position.z;
        const dx = px - this.rig.position.x;
        const dz = pz - this.rig.position.z;
        const dist = Math.hypot(dx, dz);

        // Committed attack: hold still, keep facing locked to where the
        // telegraph was placed, and resolve when the windup runs out. Facing
        // must NOT track the player here — a tell that re-aims every frame is
        // not a tell, and sidestepping it would be impossible.
        if (this._windupT > 0) {
            this._windupT -= dt;
            if (this._windupT <= 0) {
                const strike = this._pendingStrike;
                this._pendingStrike = null;
                this._windupT = 0;
                // Sync rules 2-3 (Ticket F): resolve snaps the strike pose
                // for ≤0.12s then recovers through the cooldown — and a
                // whiff still plays it, so dodging reads as a dodge.
                this.animator?.strike(0.12, Math.min(0.6, Math.max(0.2, this.attackCd)));
                if (strike) audioAt(this.rig?.position, () => strike(player, dist));
                this._strikeMark = null;   // the attack is over; the mark goes with it
                this.director?.release(this);
            }
            return;
        }

        // Out of aggro range this used to be a bare `return` — the enemy ran
        // no branch at all. Measured (`tests/qa/ambient-motion.mjs`): across
        // four levels, enemy BODIES idle-animated on 87-94% of their parts, but
        // **0 of 31 enemy roots ever changed facing.** They breathed, and they
        // never looked anywhere. That is the difference between a prop and a
        // creature, and it is the whole of this branch.
        if (dist >= this.aggroRange) { this._idleLook(dt); return; }

        this._faceToward(dx, dz, dt);

        // Phase D1 — pressure. An enemy that was refused a token must NOT
        // simply stand there: that is the conga line with extra steps, and it
        // makes the whole system read as the game turning enemies off. It
        // closes, holds its own preferred range, and circles. It looks about to
        // attack, which is honest — the threat is real, only the commit is
        // staged.
        // The window RE-ARMS while the room is still full, and drops the moment
        // this enemy's turn comes up. A fixed timer was the first version and
        // it yo-yoed: 0.7s of backing off to the standoff, then 0.45s of chase
        // walking straight back into melee to be refused again, forever. The
        // enemy has to know whether it is still queued, not merely that it was
        // refused recently.
        if (this._pressureT > 0) {
            const free = !this.director || this.director.canCommit(this);
            if (free && this.attackCd <= 0) {
                this._pressureT = 0;   // our turn
            } else {
                this._pressureT = free ? this._pressureT - dt : PRESSURE_TIME;
                this._pressureMove(dt, dx, dz, dist);
                return;
            }
        }

        if (this.ai === 'charge') {
            this._aiCharge(dt, player, dx, dz, dist);
        } else if (this.ai === 'ranged') {
            this._aiRanged(dt, player, dx, dz, dist);
        } else if (this.ai === 'lunge') {
            this._aiLunge(dt, player, dx, dz, dist);
        } else if (this.ai === 'drift') {
            this._aiDrift(dt, player, dx, dz, dist);
        } else if (this.ai === 'weave') {
            this._aiWeave(dt, player, dx, dz, dist);
        } else if (this.ai === 'censer') {
            this._aiCenser(dt, player, dx, dz, dist);
        } else {
            this._aiChase(dt, player, dx, dz, dist);
        }
    }

    /**
     * Z5 — lancer. A charge closes the gap; a lunge covers it in one committed
     * thrust down a lane locked at windup time, damaging anything along the
     * path. The counterplay is lateral, not backwards: you cannot outrun it,
     * you step out of the lane. That is a different reflex from every other
     * enemy in the game, which is the entire reason the kind exists.
     */
    _aiLunge(dt, player, dx, dz, dist) {
        if (this._lungeT > 0) {
            this._lungeT -= dt;
            this._move(this._lungeDir.x, this._lungeDir.z, 1, this.speed * 4.2 * dt);
            if (this.attackCd <= 0) {
                const px = player.root.position.x - this.rig.position.x;
                const pz = player.root.position.z - this.rig.position.z;
                if (Math.hypot(px, pz) < 1.5) {
                    this.attackCd = 0.8 / this.actionFrequency;
                    player.health.damage(this.damage + 1, 0.6, 'hostile', {
                        from: this.rig.position, attacker: this,
                    });
                    sfx.stomp();
                    this._lungeT = 0;
                }
            }
            if (this._lungeT <= 0) this._chainLunge();
            return;
        }
        // Stay at lunge distance: too close and the kind loses its identity.
        if (dist < 3) {
            this._move(-dx, -dz, dist, this.speed * 0.8 * dt);
        } else if (dist > 9) {
            this._move(dx, dz, dist, this.speed * 0.75 * dt);
        }
        if (this.attackCd <= 0 && dist <= 9) {
            this.attackCd = (2.0 / this.actionFrequency) + this.windup;
            this._lungeChained = false;  // a fresh lunge may chain again
            const dir = { x: dx / dist, z: dz / dist };
            this._beginWindup(() => {
                this._lungeT = 0.42;
                this._lungeDir = dir;
                sfx.whoosh();
            }, {
                windup: 0.6 * getActiveRunMode().telegraphDuration,
                // A long, narrow tell drawn down the lane it will travel.
                offset: 4.5, radius: 1.5, color: 0xff5533,
            });
        }
    }

    /**
     * Z5 — mote. Cruises above sword height, then dives to strikeHeight while
     * winding up its burst. Melee's answer is the dive window (or a parry that
     * grounds it fully); range still works at any altitude. Closes patiently
     * and pulses a short-range burst so "just ignore it" fails.
     */
    _aiDrift(dt, player, dx, dz, dist) {
        if (dist > MOTE_HOLD) {
            this._move(dx, dz, dist, this.speed * 0.55 * dt);
        }
        if (this.attackCd <= 0 && dist < MOTE_BURST) {
            this.attackCd = (1.8 / this.actionFrequency) + this.windup;
            this._beginWindup((p, d) => {
                if (d < MOTE_BURST) {
                    p.health.damage(this.damage, 0.7, 'hostile', {
                        from: this.rig.position, attacker: this,
                    });
                    sfx.hurt();
                } else sfx.step();
            }, {
                windup: MOTE_WINDUP * getActiveRunMode().telegraphDuration,
                offset: 0, radius: MOTE_BURST, color: 0xc084fc,
            });
        }
    }

    /**
     * Phase D3 — the Weaver.
     *
     * Keeps its distance and spins strands across the floor. It is the first
     * enemy that changes the ROOM rather than attacking you: on its own it is
     * nearly harmless, and next to anything that closes it is the reason you
     * could not get away. That is the whole design — it is a force multiplier,
     * so the answer is to deal with it before the room fills up.
     */
    _aiWeave(dt, player, dx, dz, dist) {
        if (dist < 4.5) this._move(-dx, -dz, dist, this.speed * 0.85 * dt);
        else if (dist > 9) this._move(dx, dz, dist, this.speed * 0.6 * dt);
        if (this.attackCd <= 0 && dist < 11) {
            this.attackCd = (2.6 / this.actionFrequency) + this.windup;
            // Across the player, not at them. A strand laid along the line
            // between us would be the one line the player is already past;
            // laid across it, it is the ground they are about to use.
            const ux = dx / (dist || 1), uz = dz / (dist || 1);
            const dir = { x: -uz, z: ux };
            this._beginWindup(() => this._spawnWeb(dir.x, dir.z), {
                windup: 0.7 * getActiveRunMode().telegraphDuration,
                offset: 0, radius: 1.2, color: 0xcfe8ff,
            });
        }
    }

    /** Lay a strand centred on this body, running along (dirX, dirZ). */
    _spawnWeb(dirX, dirZ) {
        const half = WEB_LEN / 2;
        const x = this.rig.position.x;
        const z = this.rig.position.z;
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(WEB_LEN, 0.05, WEB_W),
            new THREE.MeshBasicMaterial({
                color: 0xcfe8ff, transparent: true, opacity: 0.34,
                depthWrite: false,
            })
        );
        mesh.position.set(x, (this._groundY != null ? this._groundY : this.rig.position.y) + 0.05, z);
        // The box's long axis is +X; rotation.y = φ maps it to (cos φ, -sin φ).
        mesh.rotation.y = Math.atan2(-dirZ, dirX);
        mesh.renderOrder = 2;
        this.scene.add(mesh);
        this.webs.push({
            mesh,
            x0: x - dirX * half, z0: z - dirZ * half,
            x1: x + dirX * half, z1: z + dirZ * half,
            life: WEB_LIFE,
        });
        sfx.whoosh();
    }

    /**
     * Age the strands and slow whoever is standing on one.
     *
     * `player.hazardSlow` is accumulated with a max, never assigned — the
     * player clears it at the top of its own frame, so several strands (and a
     * boss's patches, in a room that has both) compose instead of the last
     * writer winning.
     */
    _tickWebs(dt, player) {
        if (!this.webs.length) return;
        for (let i = this.webs.length - 1; i >= 0; i--) {
            const w = this.webs[i];
            w.life -= dt;
            w.mesh.material.opacity = 0.34 * Math.max(0, Math.min(1, w.life / (WEB_LIFE * 0.35)));
            if (player && !player.health?.dead && distToSegment(
                player.root.position.x, player.root.position.z, w.x0, w.z0, w.x1, w.z1
            ) <= WEB_W / 2 + 0.35) {
                player.hazardSlow = Math.max(player.hazardSlow || 0, WEB_SLOW);
            }
            if (w.life <= 0) {
                if (w.mesh.parent) w.mesh.parent.remove(w.mesh);
                w.mesh.geometry.dispose();
                w.mesh.material.dispose();
                this.webs.splice(i, 1);
            }
        }
    }

    /**
     * Phase D3 — the Censer.
     *
     * Heals and shields its neighbours, never itself. The shield refuses damage
     * outright for its duration, so a room with a live Censer in it cannot be
     * ground down — the fight does not get harder, it gets IMPOSSIBLE, and the
     * only reading that works is to go through the Censer first. That is the
     * point: the game has never once asked the player to choose a target.
     *
     * It reads its neighbours off the director, which is the only thing that
     * knows the room's live list. Without one it is a harmless hovering lamp,
     * which is the correct failure: a support with nothing to support.
     */
    _aiCenser(dt, player, dx, dz, dist) {
        if (dist < 6) this._move(-dx, -dz, dist, this.speed * 0.95 * dt);
        else if (dist > 10) this._move(dx, dz, dist, this.speed * 0.5 * dt);
        if (this.attackCd <= 0) {
            this.attackCd = (3.2 / this.actionFrequency) + this.windup;
            this._beginWindup(() => this._cense(), {
                windup: 0.8 * getActiveRunMode().telegraphDuration,
                offset: 0, radius: CENSE_R, color: 0xffd880,
            });
        }
    }

    _cense() {
        const peers = this.director?.peers?.() || [];
        let touched = 0;
        for (const e of peers) {
            if (e === this || !e || e.state?.current === 'DEAD') continue;
            // The room's live list is not all Enemies. `attachBoss` pushes the
            // BOSS into it, and dummy targets live there too — neither carries a
            // `rig`, and reading through one crashed the whole update mid-frame,
            // which from the outside looks exactly like an enemy that stopped
            // moving. Bosses are excluded on purpose as well as defensively: a
            // support that can top up a boss is not a priority puzzle, it is an
            // unwinnable fight.
            const pos = e.rig?.position || e.root?.position;
            if (!pos || e.bossId || e.defeated || e.hp == null) continue;
            if (Math.hypot(pos.x - this.rig.position.x,
                pos.z - this.rig.position.z) > CENSE_R) continue;
            e.hp = Math.min(e.maxHp || e.hp, e.hp + CENSE_HEAL);
            e._shieldT = Math.max(e._shieldT || 0, CENSE_SHIELD);
            touched++;
        }
        // Its own voice either way: a pulse that found nobody still happened,
        // and hearing it fizzle is how the player learns the Censer is only
        // dangerous in company.
        if (touched) {
            gsfx.weakPoint();
            // The one lesson the campaign has never taught. Said once, the
            // first time a shield actually goes up, because that is the frame
            // where "why did my hit do nothing" is the question in the room.
            coach('censer',
                'That one is holding the others up — healing them and turning '
                + 'your hits away. Kill it first; everything else gets easier.');
        } else sfx.step();
    }

    /**
     * Phase D2 — the Lance Captain's second thrust.
     *
     * Perpendicular to the first, and that direction is the entire design. The
     * counterplay to a lunge is to step ACROSS its lane rather than run from
     * it, so the second lane is drawn through wherever that step just put you.
     * The answer stops being "dodge" and becomes "keep moving".
     *
     * The facing is set to the new lane BEFORE the wind-up, because
     * `_beginWindup` marks the ground `offset` units along `state.facingVec` —
     * mark first and turn afterwards and the ring would promise one lane while
     * the body ran down another, which is the exact defect the telegraph work
     * in `_beginWindup` exists to prevent.
     */
    _chainLunge() {
        if (!this.doubleLunge || this._lungeChained) return;
        if (this.state.current === 'DEAD') return;
        this._lungeChained = true;
        const d = this._lungeDir || this.state.facingVec;
        const dir = { x: -d.z, z: d.x };
        this.state.setFacing(dir.x, dir.z);
        this.rig.rotation.y = Math.atan2(dir.x, dir.z);
        this.attackCd = 0;
        this._beginWindup(() => {
            this._lungeT = 0.42;
            this._lungeDir = dir;
            sfx.whoosh();
        }, {
            // Shorter than the first: the second thrust is a follow-up, and a
            // full-length tell would give the player time to simply walk away
            // from a combination that is supposed to demand one more decision.
            windup: 0.42 * getActiveRunMode().telegraphDuration,
            offset: 4.5, radius: 1.5, color: 0xff5533,
        });
    }

    /**
     * Phase D2 — the Frost Chorus's volley.
     *
     * Three bolts in sequence rather than one, fanned across the lane that was
     * locked at wind-up time. Sequence and not simultaneity is the point: three
     * bolts fired together are a wall you step out of once, three fired 0.26s
     * apart across a fan are a rhythm you have to keep moving through.
     *
     * The lanes are locked when the tell resolves and never re-aimed, so the
     * volley stays a thing you can read and beat rather than a thing that
     * follows you.
     */
    _tickVolley(dt) {
        if (this._volleyLeft <= 0) return;
        this._volleyT -= dt;
        if (this._volleyT > 0) return;
        const i = this._volleyShots - this._volleyLeft;
        const spread = (i - (this._volleyShots - 1) / 2) * VOLLEY_FAN;
        const c = Math.cos(spread), s = Math.sin(spread);
        const d = this._volleyDir;
        this._spawnProjectile(d.x * c - d.z * s, d.x * s + d.z * c);
        this._volleyLeft--;
        if (this._volleyLeft > 0) this._volleyT = VOLLEY_GAP;
    }

    /**
     * The distance this kind wants to be at when it is not attacking.
     *
     * Per-AI, because "waiting your turn" is a different shape for each of
     * them: a shooter waits on a firing line, a lancer waits at the far end of
     * a lane it can cover in one thrust, a chaser waits just outside its own
     * swing. A single number would have made every enemy in the game wait in
     * the same ring, which is the visual signature of a spawn circle.
     */
    _pressureRange() {
        if (this.ai === 'ranged') return Math.min(this.attackRange - 0.6, 6.2);
        if (this.ai === 'lunge') return 6;
        if (this.ai === 'drift') return MOTE_HOLD;
        if (this.ai === 'charge') return 4.2;
        return this.attackRange * 1.4 + 0.4;
    }

    /** Hold the preferred range and orbit. */
    _pressureMove(dt, dx, dz, dist) {
        if (!(dist > 1e-4)) return;
        const ux = dx / dist, uz = dz / dist;
        const err = dist - this._pressureRange();
        if (Math.abs(err) > 0.35) {
            this._move(ux, uz, 1, Math.sign(err) * this.speed * 0.7 * dt);
        }
        // Tangential. Without it a room's worth of held-back enemies converges
        // on one arc of the same circle and reads as a queue.
        const s = this._orbitSign;
        this._move(-uz * s, ux * s, 1, this.speed * 0.5 * dt);
    }

    /**
     * Rotate facing toward (dx, dz), capped at `turnRate` radians per second.
     * An infinite turn rate takes the snap path so the arithmetic below cannot
     * perturb the kinds that never needed it.
     */
    /**
     * Look around while nothing is happening.
     *
     * Deliberately NOT a sine sweep. A continuously rotating enemy reads as a
     * radar dish, not as something alive — a creature turns, then holds, then
     * turns somewhere else. So this picks a new heading, spends `turn` seconds
     * getting there at a slow rate, and then dwells before choosing again.
     *
     * The heading is drawn from a per-enemy seeded sequence rather than
     * `Math.random()`, so a room full of enemies does not scan in unison and a
     * replay of the same room looks the same twice — the certification captures
     * include rooms with enemies standing in them.
     *
     * It sweeps around the facing the enemy SPAWNED with, not around whatever
     * it happens to be looking at, or the arc walks: each new offset would
     * compound on the last and an idle enemy would slowly rotate on the spot
     * forever, which was the first version and looked drunk.
     */
    _idleLook(dt) {
        if (this._idleSeed === undefined) {
            const p = this.rig?.position || { x: 0, z: 0 };
            // Position-derived so it is stable for this spawn without needing
            // anything threaded through the constructor.
            let h = Math.imul((p.x * 73856093) ^ (p.z * 19349663) | 0, 2654435761);
            this._idleSeed = () => {
                h = Math.imul(h ^ (h >>> 15), 2246822507);
                h = Math.imul(h ^ (h >>> 13), 3266489909);
                return ((h ^= h >>> 16) >>> 0) / 4294967296;
            };
            // Anchor to the RIG's rotation — what the player can actually see —
            // not to `state.facingVec`. The two are not guaranteed to agree at
            // spawn, and when they disagree, reading the vector makes the very
            // first glance snap the body through the difference. The spec
            // caught exactly that: a 2.72 rad jump against a 1.15 rad arc.
            // Syncing the vector to the rig here means the glance starts from
            // where the enemy is already pointing, whatever built it.
            this._idleHome = this.rig.rotation.y;
            this.state.setFacing(Math.sin(this._idleHome), Math.cos(this._idleHome));
            this._idleYaw = this._idleHome;
            this._idleT = 0.4 + this._idleSeed() * IDLE_DWELL;
        }

        this._idleT -= dt;
        if (this._idleT <= 0) {
            this._idleT = IDLE_DWELL * (0.6 + this._idleSeed() * 0.9);
            this._idleYaw = this._idleHome + (this._idleSeed() * 2 - 1) * IDLE_ARC;
        }

        // Turn at a slow fixed rate, not `turnRate` — combat turn speeds are
        // tuned for tracking a running player and make a glance look like a
        // snap. Everything else about facing still goes through the same
        // `state.setFacing` + `rig.rotation.y` pair, so nothing downstream has
        // to know this branch exists.
        const have = Math.atan2(this.state.facingVec.x, this.state.facingVec.z);
        let delta = this._idleYaw - have;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const step = IDLE_TURN_RATE * dt;
        const a = Math.abs(delta) <= step ? this._idleYaw : have + Math.sign(delta) * step;
        this.state.setFacing(Math.sin(a), Math.cos(a));
        this.rig.rotation.y = Math.atan2(this.state.facingVec.x, this.state.facingVec.z);
    }

    _faceToward(dx, dz, dt) {
        if (this.turnRate === Infinity) {
            this.state.setFacing(dx, dz);
        } else if (Math.hypot(dx, dz) > 1e-6) {
            const want = Math.atan2(dx, dz);
            const have = Math.atan2(this.state.facingVec.x, this.state.facingVec.z);
            let delta = want - have;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            const step = this.turnRate * dt;
            const a = Math.abs(delta) <= step ? want : have + Math.sign(delta) * step;
            this.state.setFacing(Math.sin(a), Math.cos(a));
        }
        this.rig.rotation.y = Math.atan2(this.state.facingVec.x, this.state.facingVec.z);
    }

    _aiChase(dt, player, dx, dz, dist) {
        if (dist > this.attackRange && dist > 0.2) {
            this._move(dx, dz, dist, this.speed * dt);
        } else if (this.attackCd <= 0) {
            this.attackCd = (0.9 / this.actionFrequency) + this.windup;
            const reach = this.attackRange + 0.4;
            // No offset: `_resolveMelee` measures from the body centre.
            this._beginWindup((p) => this._resolveMelee(p, this.damage, reach), {
                radius: reach,
            });
        }
    }

    _aiCharge(dt, player, dx, dz, dist) {
        if (this._chargeT > 0) {
            this._chargeT -= dt;
            const sp = this.speed * 2.4 * dt;
            this._move(this._chargeDir.x, this._chargeDir.z, 1, sp);
            if (dist < 1.3 && this.attackCd <= 0) {
                this.attackCd = 0.7 / this.actionFrequency;
                player.health.damage(this.damage + 0.5, 0.5, 'hostile', {
                    from: this.rig.position, attacker: this,
                });
                sfx.stomp();
                this._chargeT = 0;
            }
            return;
        }
        if (dist > 3.5 && this.attackCd <= 0) {
            // Rear up before charging, marking the lane it will run down, so
            // the charge can be read and stepped out of instead of simply
            // arriving. The direction is locked at windup time.
            this.attackCd = (2.2 / this.actionFrequency) + this.windup;
            const dir = { x: dx / dist, z: dz / dist };
            this._beginWindup(() => {
                this._chargeT = 0.55;
                this._chargeDir = dir;
                sfx.stomp();
            }, { windup: 0.5 * getActiveRunMode().telegraphDuration, offset: 2.2, radius: 1.6, color: 0xffaa33 });
        } else if (dist > this.attackRange) {
            this._move(dx, dz, dist, this.speed * 0.7 * dt);
        } else if (this.attackCd <= 0) {
            this.attackCd = (1.0 / this.actionFrequency) + this.windup;
            const reach = this.attackRange + 0.4;
            this._beginWindup((p) => this._resolveMelee(p, this.damage, reach), {
                radius: reach,
            });
        }
    }

    _aiRanged(dt, player, dx, dz, dist) {
        // Keep distance
        if (dist < 4) {
            this._move(-dx, -dz, dist, this.speed * 0.9 * dt);
        } else if (dist > 8) {
            this._move(dx, dz, dist, this.speed * 0.7 * dt);
        }
        if (this.attackCd <= 0 && dist < this.attackRange) {
            // Take aim first — the shot leads where you were, not where you
            // are, so moving during the windup makes it miss.
            this.attackCd = (1.6 / this.actionFrequency) + this.windup;
            const dir = { x: dx / dist, z: dz / dist };
            this._beginWindup(() => {
                if (this.volley > 1) {
                    this._volleyShots = this.volley;
                    this._volleyLeft = this.volley;
                    this._volleyT = 0;      // the first bolt leaves immediately
                    this._volleyDir = dir;
                } else {
                    this._spawnProjectile(dir.x, dir.z);
                }
            }, {
                windup: 0.55 * getActiveRunMode().telegraphDuration,
                offset: 1.1,
                // A wider muzzle ring for a volley. The ring marks where the
                // shots come FROM, not where they go — the bolts are their own
                // tell in flight — but a three-shot wind-up that looks exactly
                // like a one-shot wind-up tells the player nothing at all.
                radius: this.volley > 1 ? 1.5 : 0.9,
                color: 0x66ccff,
            });
        }
    }

    _spawnProjectile(fx, fz) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0x80e0ff,
                emissive: 0x40c0ff,
                emissiveIntensity: 1.5,
            })
        );
        mesh.position.copy(this.rig.position);
        mesh.position.y += 1.0;
        this.scene.add(mesh);
        this.projectiles.push({
            mesh, vx: fx * 9 * this.projectileSpeed, vz: fz * 9 * this.projectileSpeed,
            life: 2.5, damage: this.damage,
        });
    }

    _updateProjectiles(dt, player) {
        this.projectiles = this.projectiles.filter((p) => {
            p.life -= dt;
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.z += p.vz * dt;

            if (p.reflected) {
                // The bolt belongs to the player now. It no longer threatens
                // them; it threatens the thing that fired it.
                if (this.state.current !== 'DEAD') {
                    const d = Math.hypot(
                        this.rig.position.x - p.mesh.position.x,
                        this.rig.position.z - p.mesh.position.z
                    );
                    if (d < (this.hitRadius || 0.5) + 0.45) {
                        // Open it BEFORE resolving. A returned bolt always
                        // arrives from the front — that is where the player who
                        // blocked it was standing — so an armoured defender
                        // would otherwise turn its own shot away. See
                        // REFLECT_STAGGER.
                        this.stagger(REFLECT_STAGGER);
                        applyHit(this, { damage: p.damage }, player);
                        p.life = 0;
                    }
                }
            } else if (player && !player.health?.dead) {
                const d = Math.hypot(
                    player.root.position.x - p.mesh.position.x,
                    player.root.position.z - p.mesh.position.z
                );
                if (d < 0.7) {
                    // A shooter must be answerable by HOLDING the shield, not
                    // by parrying it. A parry is a timed read of a wind-up you
                    // can see; a bolt already in flight gives you the travel
                    // time and nothing else, so demanding frame-accuracy for
                    // something you cannot walk out of is asking for a read
                    // the game never showed you. Facing it is the whole skill.
                    //
                    // `inGuardArc` rather than a second hand-rolled dot product:
                    // the cone the shield covers has exactly one definition, and
                    // the copy that used to live here (`toward > 0.45`, ~63°)
                    // silently disagreed with the 60° the guard actually uses.
                    const covered = inGuardArc(
                        player.root.position, player.state?.facingVec, p.mesh.position);
                    const guarding = !!player.guard?.raised;
                    // The Reflector Plate is now the PASSIVE version of a verb
                    // everyone has: it bounces frontal shots with no shield up
                    // and no button held. Before, it was the only way to bounce
                    // anything at all, and all it did was delete the bolt.
                    const plate = !!player.inventory?.hasItem?.('reflector_plate');
                    if (covered && (guarding || plate)) {
                        this._reflect(p, player);
                    } else {
                        // A projectile's "from" is the shot itself, not the
                        // shooter — you guard the incoming bolt's direction.
                        const r = player.health.damage(p.damage, 0.5, 'hostile', {
                            from: p.mesh.position, attacker: this, projectile: true,
                        });
                        if (r.accepted) sfx.hurt();
                        p.life = 0;
                    }
                }
            }
            if (p.life <= 0) {
                if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                return false;
            }
            return true;
        });
    }

    /**
     * Send a bolt back at whoever fired it.
     *
     * Aimed at the shooter rather than simply negated, because "the shot came
     * back" is the feedback that teaches the verb. A bolt that merely vanished
     * (which is all the Reflector Plate used to do) reads as "my shield ate it"
     * — true, but it never tells the player that facing a shooter is an
     * offensive option.
     */
    _reflect(p, player) {
        const dx = this.rig.position.x - p.mesh.position.x;
        const dz = this.rig.position.z - p.mesh.position.z;
        const len = Math.hypot(dx, dz) || 1;
        // Homed at the shooter's CURRENT position, not simply negated: a bolt
        // fired while the shooter was strafing would otherwise come back to
        // where it was standing a second ago and miss for reasons the player
        // cannot see.
        const speed = Math.hypot(p.vx, p.vz) * 1.25;
        p.vx = (dx / len) * speed;
        p.vz = (dz / len) * speed;
        p.reflected = true;
        // Damage is a fraction of THIS shooter's max HP, not a multiple of its
        // attack. Held-shield = full HP (kills by construction); parry is the
        // bonus. See REFLECT_*_HP_FRAC above for the history.
        const frac = player.guard?.parryReady ? REFLECT_PARRY_HP_FRAC : REFLECT_HELD_HP_FRAC;
        p.damage = Math.max(1, (this.maxHp || 1) * frac);
        p.life = Math.max(p.life, 2.5);
        // Recoloured to the player's gold so a bolt in flight always says whose
        // it is. At this camera distance the direction of travel alone is not
        // readable fast enough to matter.
        p.mesh.material.color.setHex(0xffd060);
        p.mesh.material.emissive.setHex(0xffa020);
        // The shooter's answer, stated the first time the player stumbles into
        // it. A reflect now kills an ordinary shooter outright, and a player who
        // does not know that is a player who keeps running at ranged enemies.
        coach('reflect-bolt',
            'You sent that back. A blocked bolt kills the thing that fired it — '
            + 'facing a shooter with the shield up is an attack, not a retreat.');
        sfx.block();
    }

    _clearProjectiles() {
        for (const p of this.projectiles) {
            if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this.projectiles = [];
    }

    /**
     * The height this body's feet belong at, given the ground under (x, z).
     *
     * Returns null when nothing knows — no voxel query, or a column with no
     * standable surface — and every caller leaves the body where it is in that
     * case, so an enemy without a level behaves exactly as it always did.
     *
     * Bottom-up, matching `walkableCells` in room-graph and the hero's own
     * physics: the lowest surface with room to stand is the floor. Searching
     * top-down would put a Bone Grove enemy on the roof of the canopy it is
     * supposed to be walking under.
     */
    _groundAt(x, z) {
        const solid = this.getVoxelAt;
        if (!solid) return null;
        for (let top = 1; top <= ENEMY_MAX_GROUND_Y; top++) {
            if (!solid(x, top - 0.5, z)) continue;
            if (solid(x, top + 0.5, z)) continue;
            return top;
        }
        return null;
    }

    /** The surface this body is standing on right now. */
    _standingY() {
        const y = this.hover && this._groundY != null
            ? this._groundY : this.rig.position.y;
        return y;
    }

    _move(dx, dz, dist, sp) {
        const x0 = this.rig.position.x, z0 = this.rig.position.z;
        const nx = x0 + (dx / dist) * sp;
        const nz = z0 + (dz / dist) * sp;
        if (this.collisionWorld) {
            const r = this.collisionWorld.resolveMove(x0, z0, nx, nz, this.collHalf);
            this.rig.position.x = r.x;
            this.rig.position.z = r.z;
        } else {
            this.rig.position.x = nx;
            this.rig.position.z = nz;
        }
        this._clampToRoom();
        // Phase E2 left this body two-dimensional. Terraces live in the PLATFORM
        // map, meshed deliberately without XZ solids so a step is standable and
        // can never wall anything off — which means `resolveMove` cannot see one
        // — and nothing ever wrote `rig.position.y` after the spawn set it to a
        // flat 1.0. So an enemy that walked onto raised ground did not climb it,
        // it walked INTO it, and stood there submerged with only its head
        // showing, which is exactly what the owner photographed. A flyer keeps
        // its cruising height and only re-bases the ground it measures from.
        this._followGround();
        // Gait speed comes from distance actually covered, so a wall-pinned
        // enemy stops stepping instead of moonwalking in place.
        this._frameMove = (this._frameMove || 0)
            + Math.hypot(this.rig.position.x - x0, this.rig.position.z - z0);
    }

    /**
     * Sit this body on the ground beneath it.
     *
     * Snapped, not eased. An ease looks better on a gentle ramp and is a lie on
     * a one-cell step: the body spends the ease submerged, and the whole point
     * of this is that a submerged enemy is unreadable and unhittable. The step
     * itself is one cell, which is a shin.
     *
     * A drop of more than `ENEMY_STEP` is still taken — an enemy chased off a
     * ledge should be ON the lower floor, not hovering over it — but a RISE of
     * more than one cell is refused and the body is pushed back out of the
     * cliff it walked into, because a chaser that levitates up a four-high
     * terrace is a worse bug than one that gives up.
     */
    /**
     * Put this body on the ground WHEREVER that ground is, ignoring the step
     * limit. For spawning and for re-seating after a bake, never for walking.
     *
     * The distinction is the whole of it, and collapsing the two left four
     * bodies buried after the first attempt at this. A body already standing
     * inside a three-high terrace is not trying to climb it — it is in it, and
     * the step limit that correctly stops a chaser scaling a cliff also
     * correctly refuses to lift that body out, forever. Placement is not
     * locomotion, and the room's own pickups have needed the same distinction
     * (`room-graph.js` lifts those out of terraces too).
     */
    seatOnGround() {
        const p = this.rig.position;
        const g = this._groundAt(p.x, p.z);
        if (g == null) return false;
        this._lastGroundX = p.x;
        this._lastGroundZ = p.z;
        if (this.hover) {
            this._groundY = g;
            p.y = g + this.flyHeight;
        } else {
            p.y = g;
        }
        return true;
    }

    _followGround() {
        const p = this.rig.position;
        const g = this._groundAt(p.x, p.z);
        if (g == null) return;
        const from = this._standingY();
        if (g - from > ENEMY_STEP) {
            // Walked into a wall the collision world could not see. Undo the
            // step rather than climb it.
            p.x = this._lastGroundX != null ? this._lastGroundX : p.x;
            p.z = this._lastGroundZ != null ? this._lastGroundZ : p.z;
            return;
        }
        this._lastGroundX = p.x;
        this._lastGroundZ = p.z;
        if (this.hover) {
            this._groundY = g;
            p.y = g + this.flyHeight;
        } else {
            p.y = g;
        }
    }

    /**
     * Keep this enemy inside the room it was baked into. Clamp, do not
     * reflect — bouncing off an invisible wall in a doorway looks broken;
     * refusing to follow the player out is the Zelda convention.
     */
    _clampToRoom() {
        const b = this.roomBounds;
        if (!b) return;
        this.rig.position.x = Math.max(b.minX, Math.min(b.maxX, this.rig.position.x));
        this.rig.position.z = Math.max(b.minZ, Math.min(b.maxZ, this.rig.position.z));
    }

    /** Drop every strand this body spun. Called on death and on dispose. */
    _clearWebs() {
        for (const w of this.webs) {
            if (w.mesh.parent) w.mesh.parent.remove(w.mesh);
            w.mesh.geometry.dispose();
            w.mesh.material.dispose();
        }
        this.webs.length = 0;
    }

    dispose() {
        this._clearProjectiles();
        this._clearWebs();
        this.clearTelegraph();
        if (this.actor) this.actor.dispose();
        else if (this.rig.parent) this.rig.parent.remove(this.rig);
    }
}

/** Perpendicular distance from a point to a finite segment, in XZ. */
function distToSegment(px, pz, x0, z0, x1, z1) {
    const vx = x1 - x0, vz = z1 - z0;
    const len2 = vx * vx + vz * vz;
    if (len2 < 1e-9) return Math.hypot(px - x0, pz - z0);
    let t = ((px - x0) * vx + (pz - z0) * vz) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x0 + vx * t), pz - (z0 + vz * t));
}

function defaultAi(kind) {
    if (kind === 'scarab') return 'charge';
    if (kind === 'weaver') return 'weave';
    if (kind === 'censer') return 'censer';
    if (kind === 'frost') return 'ranged';
    if (kind === 'mote') return 'drift';
    if (kind === 'lancer') return 'lunge';
    if (kind === 'bulwark') return 'chase'; // slow, armoured, relentless
    if (kind === 'brood') return 'charge';
    return 'chase';
}

/**
 * Z5: wire a splitter's death to the level that owns it. `spawn(pos, opts)`
 * must register the new enemy with the current room the same way the original
 * was registered, or the children will be invisible to combat and never freed.
 */
/**
 * Where a split child can actually stand.
 *
 * The children used to be placed blind at a fixed 1.1 radius around the parent.
 * Kill a brood with its back to a wall and half its offspring materialise
 * INSIDE the masonry: unreachable by any weapon, permanently alive, and every
 * room-clear gate in that dungeon waits on them forever. A softlock produced by
 * standing in an ordinary place.
 *
 * Walk the preferred bearing inward, then try the ring around it, and if the
 * room really is that tight fall back to the parent's own footprint — which is
 * guaranteed free, because something was just standing in it.
 */
function freeSpotNear(enemy, angle, half = 0.38) {
    const ox = enemy.rig.position.x;
    const oz = enemy.rig.position.z;
    const cw = enemy.collisionWorld;
    const b = enemy.roomBounds;
    const inRoom = (x, z) => !b
        || (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
    if (!cw || typeof cw.blocked !== 'function') {
        const x = ox + Math.cos(angle) * 1.1;
        const z = oz + Math.sin(angle) * 1.1;
        return inRoom(x, z) ? { x, z } : { x: ox, z: oz };
    }
    for (const r of [1.1, 0.8, 0.5]) {
        for (let k = 0; k < 8; k++) {
            // Search outward from the requested bearing so the burst still
            // reads as a burst when there is room for it to.
            const a = angle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
            const x = ox + Math.cos(a) * r;
            const z = oz + Math.sin(a) * r;
            if (!cw.blocked(x, z, half) && inRoom(x, z)) return { x, z };
        }
    }
    return { x: ox, z: oz };
}

/**
 * Half-width of a split child of `kind`, measured off a real rig built from the
 * child body — the same call the child itself will make. Cached, because the
 * only alternatives were building a throwaway rig per death or writing the
 * number down somewhere it could go stale.
 */
const _childHalfCache = new Map();
function measuredHalf(kind) {
    if (_childHalfCache.has(kind)) return _childHalfCache.get(kind);
    const rig = createActorRig({
        palette: ENEMY_PALETTES[kind] || ENEMY_PALETTES.sentinel,
        ...childBody(kind),
        clothingMode: 'casual',
        groundOffset: 0,
    });
    const r = rig.radius;
    rig.dispose();
    _childHalfCache.set(kind, r);
    return r;
}

export function attachSplit(enemy, spawn) {
    if (!enemy || !enemy.split || typeof spawn !== 'function') return enemy;
    const prev = enemy.onDeath;
    // The child's footprint, measured once from the same body the child will
    // actually be built with, so the placement probe and the thing being placed
    // can never describe different sizes.
    const childHalf = measuredHalf(enemy.kind);
    enemy.onDeath = () => {
        prev?.();
        const n = enemy.split;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            // Probe with the child's ACTUAL footprint. The literal 0.38 here
            // described the old fixed child size; a body table that can change
            // would have left the probe describing a child that no longer
            // exists, and a child wider than its probe spawns inside masonry.
            const at = freeSpotNear(enemy, a, childHalf);
            spawn({
                x: at.x,
                y: enemy.rig.position.y,
                z: at.z,
            }, {
                kind: enemy.kind,
                ai: enemy.ai,
                // Children are weaker and — critically — sterile. Without the
                // generation cap a brood clears the room by filling it.
                hp: Math.max(1, Math.round(enemy.maxHp / 2)),
                damage: Math.max(0.5, enemy.damage - 0.5),
                speed: enemy.speed * 1.15,
                // Derived from the parent's body rather than two literals that
                // had to be kept agreeing by hand. `childBody` returns the
                // brood's own proportions at 0.76 size, and hitRadius follows
                // from the measured rig — which lands on 0.379, the number the
                // old hard-coded 0.38 was approximating.
                body: childBody(enemy.kind),
                // Phase D2 — the Brood Mother's children split once more.
                // `childSplit` is the ONLY way this is ever non-zero, and it is
                // not itself inherited, so the cap the original comment
                // describes still holds absolutely: a brood can never clear the
                // room by filling it. Four children of two is eight bodies and
                // then it stops.
                split: enemy.childSplit || 0,
                generation: enemy.generation + 1,
                // Same room as the parent — a doorway must not become an exit
                // for the children of a brood killed on the threshold.
                roomBounds: enemy.roomBounds || null,
            });
        }
    };
    return enemy;
}

/** Simple floating weak-point orb used by some bosses. */
export class DummyTarget {
    constructor(scene, position, opts = {}) {
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(opts.radius || 0.55, 12, 12),
            new THREE.MeshStandardMaterial({
                color: opts.color || 0x555577,
                emissive: opts.emissive || 0x000000,
                emissiveIntensity: 1.5,
            })
        );
        this.mesh.position.set(position.x, position.y != null ? position.y : 1, position.z);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);
        this.root = this.mesh;
        this.hitRadius = opts.radius || 0.55;
        this.hp = opts.hp != null ? opts.hp : 2;
        this.state = { current: 'IDLE' };
        this._flash = 0;
        this._baseEmissiveHex = this.mesh.material.emissive.getHex();
        this._baseEmissiveIntensity = this.mesh.material.emissiveIntensity ?? 0;
        this.onHit = () => {
            this._flash = 0.12;
            this.mesh.material.emissive.setHex(0xff4040);
        };
        this.onDeath = opts.onDeath || (() => {
            this.mesh.visible = false;
        });
    }

    update(dt) {
        if (this._flash > 0) {
            this._flash -= dt;
            if (this._flash <= 0) {
                this.mesh.material.emissive.setHex(this._baseEmissiveHex);
                this.mesh.material.emissiveIntensity = this._baseEmissiveIntensity;
            }
        }
        if (this.state.current === 'DEAD') this.mesh.visible = false;
    }

    dispose() {
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
