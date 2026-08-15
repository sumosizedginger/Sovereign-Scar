// tests/game/player-moves.spec.mjs — Phase C: the player's two new verbs.
//
// WHAT PHASE C IS FOR
//
// Phase B gave fourteen bosses three moves each. Adding opposition without
// adding options makes a harder game, not a deeper one — so the hero gets a
// charged strike (hold the attack button past CHARGE_TIME) and a dash-attack
// (attack mid-dash). Both are additive: a player who never holds the button and
// never attacks out of a dash plays exactly the game that shipped.
//
// WHAT THIS SPEC IS GUARDING, AND WHY EACH CLAIM IS HERE
//
// 1. ARCS IN WORLD SPACE (HANDOFF trap 1). Every shape claim below is stated as
//    "an enemy standing HERE is hit / is not hit", with the player's facing set
//    explicitly. This project has already shipped a backwards swing that passed
//    a green suite because the spec asked about the sign of a rotation angle
//    instead of about the world.
//
// 2. THE DISC IS A DISC. `move.omni` already existed and is a SQUARE — it keeps
//    the lateral gate and only drops the sign of the forward test. A spin whose
//    smear draws a circle and whose hit test reaches 1.41x further into its
//    corners is the player-side version of the telegraph lie this project spent
//    a whole session hunting, so the charged spins use `radial` and this spec
//    pins the corner.
//
// 3. THE COMMIT IS REAL. The charged strike does not resolve on release. It
//    pins the body for CHARGE_WINDUP and lands from where the player stood. If
//    that ever becomes free, the hero is the one thing in the game whose
//    committed attack is not a promise.
//
// 4. THE LUNGE HITS ONCE. A body that is lethal for 0.2s and sweeps every frame
//    hits roughly twelve times at 60fps. That is not a gap-closer, that is the
//    best attack in the game by a factor of twelve.
//
// 5. NO REGRESSION. Tapping still swings, on the same frame, at the same cost.

import * as THREE from 'three';
import { Input } from '../../src/game/input.js';
import { Player, RAY_LATERAL } from '../../src/game/player.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BREAK_STUN } from '../../src/game/combat/guard.js';
import {
    getWeapon, WEAPONS, CHARGE_TIME, CHARGE_WINDUP, CHARGE_MOVE_MULT, DASH_ATTACK,
} from '../../src/game/combat/weapons.js';
import { hitboxCheck } from '../../src/combat/hitbox.js';
import { ArcSmear } from '../../src/game/fx/arc-smear.js';
import { makeFacing } from '../../src/combat/facing.js';

const fakeDom = { addEventListener() {}, removeEventListener() {} };

function makeClock() {
    let t = 100;
    return { now: () => t, advance: (dt) => { t += dt; } };
}

function inputWith(input) {
    input.moveVector = () => ({ x: 0, z: 0 });
    input.padAim = null;
    input.guardHeld = () => false;
    return input;
}

/**
 * An enemy standing on the same floor as the player.
 *
 * The y matters and it bit this spec's first draft. Every hit test in the game
 * has a vertical gate, the hero's rig centre sits at 1.95, and an enemy left at
 * y=0 is 1.95 below it — outside every charged move's vertical tolerance. The
 * spec passed nothing and looked like the feature was broken.
 */
function ent(x, z, hp = 999, y = 1.95) {
    return {
        root: { position: { x, y, z } },
        hitRadius: 0.4,
        state: { current: 'IDLE' },
        hp,
    };
}

/**
 * Build a player parked at the origin, facing +X, holding `weapon`.
 *
 * With no floor the physics body free-falls — 9.2 units in the first second —
 * and every damage claim below silently becomes a claim about altitude. The
 * ground plane is one line and makes the whole file mean what it says.
 */
/**
 * A player whose smear calls are captured instead of drawn.
 *
 * Intercepting `spawn` rather than reading the pool's meshes is deliberate: the
 * claim being tested is about the SHAPE THE GAME ASKS FOR, which is what the
 * call sites in `player.js` decide. Reading the meshes back would test three.js.
 */
function smearProbe(weaponId) {
    const player = makePlayer(weaponId);
    const drawn = [];
    player.arcSmear.spawn = (p) => drawn.push(p);
    return { player, drawn };
}

/**
 * Is the ground point (x, z) inside one spawned smear? Player at the origin.
 *
 * This mirrors `ArcSmear`'s own geometry — a lane is the rectangle
 * `[0, length] x [-width/2, width/2]`, a fan runs from 35% of its radius to its
 * radius over `arc` radians — and it is the one duplicated piece of knowledge
 * in the file. The alternative is asserting on vertex buffers, which would pin
 * the implementation instead of the promise.
 */
function insideDrawn(d, x, z) {
    const fx = d.facingVec?.x ?? 1;
    const fz = d.facingVec?.z ?? 0;
    const len = Math.hypot(fx, fz) || 1;
    const forward = (x * fx + z * fz) / len;
    const lateral = (-x * fz + z * fx) / len;
    if (d.lane) {
        return forward >= 0 && forward <= d.lane.length
            && Math.abs(lateral) <= d.lane.width / 2;
    }
    const radius = d.radius ?? 2;
    const r = Math.hypot(x, z);
    if (r < radius * 0.35 || r > radius) return false;
    const arc = d.arc ?? Math.PI * 0.61;
    if (arc >= Math.PI * 2) return true;
    return Math.abs(Math.atan2(lateral, forward)) <= arc / 2;
}

function makePlayer(weapon = 'heavy_mallet') {
    const scene = new THREE.Scene();
    const player = new Player(scene, new CollisionWorld(), (x, y) => y < 1);
    player.rig.position.set(0, 1.95, 0);
    player.inventory.activeWeapon = weapon;
    player.state.setFacing(1, 0);
    return player;
}

/** Step the real update loop, keeping the clock and the sim in step. */
function step(player, input, clock, seconds, enemies = [], dt = 1 / 60) {
    let left = seconds;
    while (left > 1e-9) {
        const d = Math.min(dt, left);
        clock.advance(d);
        player.update(d, input, enemies, null);
        left -= d;
    }
}

const down = (input, code) => input._onKeyDown({ code, preventDefault() {} });
const up = (input, code) => input._onKeyUp({ code });

export function run(t) {
    // ── attackHeld reads a level, and consuming the press does not clear it ──
    //
    // The swing keeps its edge trigger; the charge watches the same button held
    // down. If `consumeAttack` cleared the held state too, the charge would die
    // on the frame the ordinary swing fired — which is every single charge.
    {
        const clock = makeClock();
        const input = new Input(fakeDom, { clock: clock.now });
        t.ok('nothing held on a fresh Input', input.attackHeld() === false);
        down(input, 'Space');
        t.ok('Space reads as held', input.attackHeld() === true);
        input.consumeAttack();
        t.ok('consuming the press leaves the button held',
            input.attackHeld() === true,
            'the swing and the charge read different things about the same button');
        up(input, 'Space');
        t.ok('release clears it', input.attackHeld() === false);
        down(input, 'KeyJ');
        t.ok('KeyJ is the other binding', input.attackHeld() === true);
        up(input, 'KeyJ');

        // The pad, through the REAL poll. Poking `_padAttack` by hand was the
        // first draft, and the counterfactual sweep caught it: cutting the one
        // line in `pollGamepad` that actually sets the field left every
        // assertion green, because the spec was setting it itself. A pad player
        // would have had a button that swings but cannot charge, and nothing
        // anywhere would have said so.
        const fakePad = (held) => ({
            id: 'test-pad',
            connected: true,
            buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held && i === 0 })),
            axes: [0, 0, 0, 0],
        });
        input.pollGamepad([fakePad(false)]);
        t.ok('a pad at rest is not holding attack', input.attackHeld() === false);
        input.pollGamepad([fakePad(true)]);
        t.ok('the pad face button reads as held', input.attackHeld() === true);
        input.pollGamepad([fakePad(true)]);
        t.ok('and STAYS held on the second poll', input.attackHeld() === true,
            'the swing is edge-triggered; the charge is not');
        input.pollGamepad([fakePad(false)]);
        t.ok('releasing it clears the hold', input.attackHeld() === false);
    }

    // ── Every weapon has a charge, and they are not the same move ───────────
    {
        const ids = ['bare_strike', 'anchor_link', 'tectonic_wedge', 'heavy_mallet', 'light_caster'];
        for (const id of ids) {
            const c = WEAPONS[id].charge;
            t.ok(`${id} has a charged move`, !!c, 'four weapons should not be four numbers');
            t.ok(`${id} charge declares a vertical gate`, c && c.vertical > 0,
                'hitboxCheck reads it; undefined would fail every height comparison');
        }
        const kinds = new Set(ids.map((id) => WEAPONS[id].charge.kind));
        t.ok('the kit spans more than one charged shape', kinds.size >= 3,
            `got ${[...kinds].join(', ')}`);

        // The design claim, stated as arithmetic: a charge is a CHOICE, not an
        // upgrade. Damage per second over the full commitment must not beat
        // just swinging, or there is no reason to ever tap the button again.
        for (const id of ['heavy_mallet', 'tectonic_wedge', 'anchor_link', 'bare_strike']) {
            const w = WEAPONS[id];
            const c = w.charge;
            const tapDps = w.damage / w.cooldown;
            const chargeDps = c.damage / (CHARGE_TIME + CHARGE_WINDUP + c.recover);
            t.ok(`${id}: charging is not free damage`, chargeDps <= tapDps + 1e-9,
                `charged ${chargeDps.toFixed(2)} dps vs tapped ${tapDps.toFixed(2)} dps`);
        }
    }

    // ── The disc is a disc, in world space ─────────────────────────────────
    //
    // Facing +X, range 2.6. An enemy on the diagonal at 2.5 units is INSIDE the
    // circle and must be hit. One at 3.4 units on the same diagonal sits inside
    // the square that `omni` would have described (|forward| 2.4, |lateral| 2.4,
    // both under 2.6) and must NOT be.
    {
        const atk = { root: { position: { x: 0, y: 1.95, z: 0 } }, state: makeFacing(1) };
        atk.state.setFacing(1, 0);
        const spin = WEAPONS.heavy_mallet.charge;
        const diag = (d) => ent(d * Math.SQRT1_2, d * Math.SQRT1_2);

        t.ok('spin hits straight ahead', hitboxCheck(atk, ent(2.4, 0), spin));
        t.ok('spin hits straight BEHIND', hitboxCheck(atk, ent(-2.4, 0), spin),
            'a 360 spin that respects facing is not a 360 spin');
        t.ok('spin hits to the left', hitboxCheck(atk, ent(0, -2.4), spin));
        t.ok('spin hits to the right', hitboxCheck(atk, ent(0, 2.4), spin));
        t.ok('spin hits on the diagonal inside its radius', hitboxCheck(atk, diag(2.5), spin));
        t.ok('spin MISSES the square corner outside its radius',
            !hitboxCheck(atk, diag(3.4), spin),
            'omni would have hit this; radial is a circle and the smear draws a circle');
        t.ok('spin misses beyond its radius', !hitboxCheck(atk, ent(3.6, 0), spin));

        // The thrust is the opposite claim: long, narrow, and strictly forward.
        const thrust = WEAPONS.tectonic_wedge.charge;
        t.ok('thrust reaches far ahead', hitboxCheck(atk, ent(4.2, 0), thrust));
        t.ok('the ordinary swing does not',
            !hitboxCheck(atk, ent(4.2, 0), WEAPONS.tectonic_wedge),
            'reach is the whole thing the wedge charge buys');
        t.ok('thrust misses behind', !hitboxCheck(atk, ent(-2, 0), thrust));
        t.ok('thrust misses out of its lane', !hitboxCheck(atk, ent(3, 2.0), thrust));
        t.ok('thrust holds a narrow lane', hitboxCheck(atk, ent(3, 0.4), thrust));

        // And it is drawn to the shape that resolves.
        //
        // This claim used to read "the drawn wedge is AT LEAST as wide as the
        // lane", which permitted exactly the failure that shipped: a wedge is
        // never the same shape as a rectangle, so "at least as wide" bought
        // over-draw at every distance and had nothing to say about the fact
        // that the wedge did not start at the player at all. The full
        // both-directions version is at the end of this file; what is pinned
        // here is that the move carries no arc to draw a wedge WITH.
        t.ok('the thrust declares no arc', thrust.arc === undefined,
            'a non-radial move resolves as a rectangle and is drawn as one');
        t.ok('and its lane is narrower than its reach is long',
            thrust.depthTolerance * 2 < thrust.range,
            'reach in a lane is what the wedge charge buys');
    }

    // ── Holding arms the charge; a tap does not ────────────────────────────
    {
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        const player = makePlayer('heavy_mallet');

        down(input, 'Space');
        step(player, input, clock, CHARGE_TIME * 0.6);
        t.ok('short of the threshold, nothing is armed', player.chargeArmed === false);
        t.ok('but the charge is accumulating', player.chargeT > 0);
        up(input, 'Space');
        step(player, input, clock, 1 / 60);
        t.ok('releasing early commits nothing', player.chargeStrike === null,
            'a tap must stay a tap');
        t.ok('and the charge resets', player.chargeT === 0);

        down(input, 'Space');
        step(player, input, clock, CHARGE_TIME + 0.05);
        t.ok('past the threshold it arms', player.chargeArmed === true);
    }

    // ── The commit is real: locked in place, resolves late, from where you were
    {
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        const player = makePlayer('heavy_mallet');
        // Behind the player. A spin has to reach it; nothing else in the kit
        // does, so this enemy is the whole proof the spin happened.
        const behind = ent(-2.0, 0);

        down(input, 'Space');
        step(player, input, clock, CHARGE_TIME + 0.05, [behind]);
        const hpBeforeRelease = behind.hp;
        up(input, 'Space');
        step(player, input, clock, 1 / 60, [behind]);

        t.ok('release commits a strike', !!player.chargeStrike);
        t.ok('which has NOT resolved yet', behind.hp === hpBeforeRelease,
            'a charged move that lands on the release frame is not a commitment');

        // Try to walk out of it. The wish vector must be ignored.
        input.moveVector = () => ({ x: -1, z: 0 });
        const xAtCommit = player.rig.position.x;
        step(player, input, clock, CHARGE_WINDUP * 0.5, [behind]);
        t.ok('the body is pinned during the wind-up',
            Math.abs(player.rig.position.x - xAtCommit) < 0.02,
            `moved ${(player.rig.position.x - xAtCommit).toFixed(3)}`);
        t.ok('and the facing it will resolve along is unchanged',
            player.state.facingVec.x > 0.99,
            'walking backwards mid-commit must not turn the strike around');

        step(player, input, clock, CHARGE_WINDUP, [behind]);
        t.ok('the strike lands after the wind-up',
            behind.hp === hpBeforeRelease - WEAPONS.heavy_mallet.charge.damage,
            `hp ${behind.hp}, expected ${hpBeforeRelease - WEAPONS.heavy_mallet.charge.damage}`);
        t.ok('and the commit is cleared', player.chargeStrike === null);
    }

    // ── Winding a charge slows you, so the hero is readable too ─────────────
    {
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        input.moveVector = () => ({ x: 1, z: 0 });

        const free = makePlayer('heavy_mallet');
        step(free, input, clock, 0.4);
        const freeTravel = free.rig.position.x;

        const winding = makePlayer('heavy_mallet');
        down(input, 'Space');
        step(winding, input, clock, 0.4);
        const windTravel = winding.rig.position.x;
        up(input, 'Space');

        t.ok('a winding player travels less than a free one',
            windTravel < freeTravel - 0.05,
            `${windTravel.toFixed(2)} vs ${freeTravel.toFixed(2)}`);
        t.ok('but is not frozen', windTravel > 0.05,
            'CHARGE_MOVE_MULT is a slow, not a stop');
        t.ok('the multiplier is a real slow', CHARGE_MOVE_MULT > 0 && CHARGE_MOVE_MULT < 1);
    }

    // ── A guard break eats the charge, the same way it eats a press ─────────
    //
    // The break is the punishment for turtling. Letting a charge survive it
    // hands back a free committed move the instant the stun ends — exactly the
    // failure input buffering was careful not to introduce.
    {
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        const player = makePlayer('heavy_mallet');
        const behind = ent(-2.0, 0);

        down(input, 'Space');
        step(player, input, clock, CHARGE_TIME + 0.05, [behind]);
        t.ok('armed before the break', player.chargeArmed === true);

        player.guard.breakT = BREAK_STUN; // `broken` is a getter over this
        step(player, input, clock, 1 / 60, [behind]);
        t.ok('the break drops the charge', player.chargeArmed === false);
        t.ok('and nothing is banked', player.chargeT === 0);

        const hp = behind.hp;
        up(input, 'Space');
        step(player, input, clock, 0.5, [behind]);
        t.ok('releasing after a break costs the player the move', behind.hp === hp,
            'a punishment you can charge through is not a punishment');
    }

    // ── You cannot wind a swing behind your own shield ──────────────────────
    {
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        input.guardHeld = () => true;
        const player = makePlayer('heavy_mallet');
        player.inventory.items.bulwark_shield = true;
        down(input, 'Space');
        step(player, input, clock, CHARGE_TIME + 0.2);
        t.ok('guarding blocks the charge', player.chargeArmed === false,
            'the shield is a trade; charging behind it would make it free');
    }

    // ── The dash-attack ────────────────────────────────────────────────────
    // This block drives `tryDash` / `tryDashAttack` directly rather than
    // through the input layer, so it builds no `Input`.
    {
        const player = makePlayer('anchor_link');
        player.inventory.items.phase_boot = true;

        const target = ent(0.8, 0);
        player.tryDash();
        t.ok('dashing', player.dashTimer > 0);
        const dashLeft = player.dashTimer;

        const converted = player.tryDashAttack([target]);
        t.ok('the dash converts', converted === true);
        t.ok('the lunge is live', player.dashAttackT > 0);
        t.ok('and the dash runs longer for it',
            player.dashTimer > dashLeft,
            `${player.dashTimer.toFixed(3)} vs ${dashLeft.toFixed(3)}`);

        // Now the claim that matters. Tick the whole active window with the
        // target sitting inside the lunge body the entire time.
        let ticks = 0;
        const hpBefore = target.hp;
        while (player.dashAttackT > 0 && ticks < 200) {
            player._tickDashAttack(1 / 60, [target]);
            ticks++;
        }
        const expected = WEAPONS.anchor_link.damage * DASH_ATTACK.damageMult;
        t.ok('the lunge ran for several frames', ticks >= 5, `${ticks} frames`);
        t.ok('and hit exactly once', target.hp === hpBefore - expected,
            `took ${(hpBefore - target.hp).toFixed(2)} over ${ticks} frames, `
            + `expected ${expected} — a per-frame sweep would be ~${ticks}x this`);
        t.ok('the lunge is worth more than a standing swing',
            DASH_ATTACK.damageMult > 1);
    }

    // ── Mid-dash the press means the lunge; on the ground it means the swing ─
    {
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        const player = makePlayer('anchor_link');
        player.inventory.items.phase_boot = true;

        let swings = 0, lunges = 0;
        const realAttack = player.tryAttack.bind(player);
        const realLunge = player.tryDashAttack.bind(player);
        player.tryAttack = (...a) => { swings++; return realAttack(...a); };
        player.tryDashAttack = (...a) => { lunges++; return realLunge(...a); };

        down(input, 'Space');
        step(player, input, clock, 1 / 60);
        up(input, 'Space');
        t.ok('standing still, a press is a swing', swings === 1 && lunges === 0);

        player.attackCd = 0;
        player.tryDash();
        down(input, 'Space');
        step(player, input, clock, 1 / 60);
        up(input, 'Space');
        t.ok('mid-dash, the same press is a lunge', lunges === 1,
            `swings ${swings}, lunges ${lunges}`);
        t.ok('and it did not ALSO swing', swings === 1,
            'one press, one move');
    }

    // ── No regression: tapping still swings, and the ray weapon still fires ─
    {
        const clock = makeClock();
        const input = inputWith(new Input(fakeDom, { clock: clock.now }));
        const player = makePlayer('anchor_link');
        const front = ent(1.2, 0);
        down(input, 'Space');
        step(player, input, clock, 1 / 60, [front]);
        up(input, 'Space');
        t.ok('a tap on the frame it lands still swings',
            front.hp === 999 - WEAPONS.anchor_link.damage,
            `hp ${front.hp}`);

        const caster = makePlayer('light_caster');
        const far = ent(6, 0);
        const rayHits = caster.tryAttack([far], null);
        t.ok('the caster still fires its ordinary ray', rayHits.includes(far));
        t.ok('and its charge reaches further than the ray',
            getWeapon('light_caster').charge.range > getWeapon('light_caster').range);
    }

    // ── Drawn where it hits — the telegraph law, applied to the hero ───────
    //
    // The bosses were held to this for a whole session: the shape on the floor
    // must be the shape that resolves. The player never was, and three separate
    // moves were lying about where their damage went.
    //
    //   the ordinary ray     drew NOTHING AT ALL. The one ranged weapon in the
    //                        game, and the only feedback was the sound.
    //   the charged lance    resolved a lane 1.8 wide starting at the player's
    //                        feet and drew a wedge starting 5.6 units in front
    //                        of them, running out to 16 — most of the way off
    //                        the screen, and nothing drawn where it hit.
    //   every melee swing    drew a fixed 110-degree fan whatever the weapon was
    //                        authored at, so the Bare Strike's 50-degree swing
    //                        promised more than twice the ground it could reach.
    //
    // The claim below is ONE-SIDED on purpose. Over-draw — colour on ground the
    // move cannot reach — is the lie that matters, because it is the player
    // being told they connected when they did not; it must be zero. Under-draw
    // is the opposite error and it is deliberate: the fan keeps its hole at the
    // hilt and stops short of the rectangle's far corners, which is what makes a
    // swing read as a sword instead of a pie, and it errs toward hitting things
    // the player did not expect rather than missing things they did.
    {
        const sample = (drawnList, move) => {
            let over = 0, drawn = 0;
            const attacker = {
                root: { position: { x: 0, y: 1.95, z: 0 } },
                state: { facingVec: { x: 1, z: 0 } },
            };
            for (let x = -18; x <= 18; x += 0.25) {
                for (let z = -18; z <= 18; z += 0.25) {
                    if (!drawnList.some((d) => insideDrawn(d, x, z))) continue;
                    drawn++;
                    const target = {
                        root: { position: { x, y: 1.95, z } },
                        hitRadius: 0, state: { current: 'IDLE' },
                    };
                    if (!hitboxCheck(attacker, target, move)) over++;
                }
            }
            return { over, drawn };
        };

        for (const id of Object.keys(WEAPONS)) {
            const w = getWeapon(id);
            if (!w.damage) continue;
            const { player, drawn } = smearProbe(id);
            player.attackCd = 0;
            player.tryAttack([], null);
            t.ok(`${id} draws something at all`, drawn.length > 0,
                'the ray drew nothing whatsoever before this');
            const move = w.ray
                ? { range: w.range, depthTolerance: RAY_LATERAL, vertical: 99 }
                : w;
            const { over, drawn: cells } = sample(drawn, move);
            t.ok(`${id} is never drawn where it cannot hit`, over === 0,
                `${over} of ${cells} drawn cells are outside the hitbox`);
        }

        for (const id of Object.keys(WEAPONS)) {
            const w = getWeapon(id);
            if (!w.charge) continue;
            const { player, drawn } = smearProbe(id);
            player._resolveCharge({ weapon: w, charge: w.charge }, [], null);
            t.ok(`${w.charge.id} draws something at all`, drawn.length > 0);
            const { over, drawn: cells } = sample(drawn, w.charge);
            t.ok(`${w.charge.id} is never drawn where it cannot hit`, over === 0,
                `${over} of ${cells} drawn cells are outside the hitbox`);
        }

        // And the specific shape, stated directly, because "zero over-draw" is
        // also true of drawing nothing.
        const { player: caster, drawn: lanceDrawn } = smearProbe('light_caster');
        const lance = getWeapon('light_caster').charge;
        caster._resolveCharge({ weapon: getWeapon('light_caster'), charge: lance }, [], null);
        const laneCall = lanceDrawn.find((d) => d.lane);
        t.ok('the lance is drawn as a lane, not a wedge', !!laneCall);
        t.ok('starting at the player', !!laneCall && laneCall.position === caster.rig.position);
        t.ok('as long as it reaches', !!laneCall && laneCall.lane.length === lance.range,
            `${laneCall?.lane?.length} vs range ${lance.range}`);
        t.ok('and as wide as the lane it resolves',
            !!laneCall && laneCall.lane.width === lance.depthTolerance * 2,
            `${laneCall?.lane?.width} vs 2x depthTolerance ${lance.depthTolerance * 2}`);
    }

    // ── The lane is drawn from the player, read off the actual mesh ────────
    //
    // Everything above this point compares *what is drawn* against *what
    // resolves* — and to do that it has to know what is drawn, so `insideDrawn`
    // computes it: a lane is `forward >= 0 && forward <= length`. That is not a
    // reading of the drawing. It is a SECOND IMPLEMENTATION of it, and it agrees
    // with the first by construction.
    //
    // Proof that this matters: push `makeLaneGeometry`'s near edge from 0 out to
    // 0.35 — which is the fan's inner radius, i.e. precisely the bug the owner
    // reported, a 16-unit beam drawn starting 5.6 units in front of them and
    // running off the top-down frame — and every assertion above stays green.
    // The counterfactual sweep is the only thing that found it. Two agreeing
    // models of a picture are not a picture, so this section reads the buffer.
    //
    // Note what the assertion above could NOT see, either: `starting at the
    // player` compares the position handed to `spawn`, which was always right.
    // The mesh sat at the player's feet and the triangles began 5.6 units away.
    {
        const scene = new THREE.Scene();
        const smear = new ArcSmear(scene);
        smear.spawn({
            position: { x: 0, y: 0, z: 0 },
            facingVec: { x: 1, z: 0 },
            lane: { length: 16, width: 1.8 },
        });
        const live = smear.pool.find((s) => s.life > 0);
        t.ok('a lane spawn puts a mesh in the pool', !!live);
        const pos = live.mesh.geometry.getAttribute('position');
        let minX = Infinity, maxX = -Infinity, maxAbsZ = 0;
        for (let i = 0; i < pos.count; i++) {
            minX = Math.min(minX, pos.getX(i));
            maxX = Math.max(maxX, pos.getX(i));
            maxAbsZ = Math.max(maxAbsZ, Math.abs(pos.getZ(i)));
        }
        t.ok('the lane mesh begins at the attacker', minX === 0,
            `near edge at local x=${minX} — the fan's 0.35 inner radius is the reported bug`);
        t.ok('and runs the whole way to its reach', maxX === 1, `far edge at ${maxX}`);
        t.ok('and is exactly its own width across', Math.abs(maxAbsZ - 0.5) < 1e-9);

        // The same claim in world units, because 0.35 of a local unit does not
        // sound like anything and 5.6 metres of missing beam does.
        const nearEdge = live.mesh.scale.x * minX;
        t.ok('so the near end of a 16-long lane is at the player, not out in front',
            Math.abs(nearEdge) < 1e-9,
            `drawn from ${nearEdge.toFixed(2)} units in front of the player`);
        t.ok('and the far end is where it stops hitting',
            Math.abs(live.mesh.scale.x * maxX - 16) < 1e-9);

        // The material carries the LOOK, and the geometry carries the TRUTH.
        //
        // The owner's note was that the swings looked "kindergarten compared to
        // everything else" — one flat additive polygon at a single colour, in
        // front of a renderer doing ACES, bloom and contact shadows. The fix
        // shades inside the hitbox rather than enlarging it, and this pins that
        // choice: the obvious way to make a swing look bigger is to make it
        // bigger, and that is the exact lie the rest of this file exists to
        // stop. If someone reaches for the silhouette instead of the shader,
        // the over-draw assertions above fail — but they would fail late and
        // cryptically, so say it here too.
        t.ok('a smear is shaded, not flat-filled',
            !!live.mat.uniforms && 'uAge' in live.mat.uniforms,
            'a MeshBasicMaterial cannot tell a beam from a blade');
        t.ok('and it knows which of the two it is drawing',
            live.mat.uniforms.uLane.value === 1);
        t.ok('a beam lives longer on screen than a sword stroke',
            live.max > 0.12,
            `${live.max}s — the Caster crosses a room and was gone in 0.12`);

        // A lane must not grow. The fan creeps outward 0.6/s for its life, which
        // is a fair flourish on a shape already drawn short of its own corners
        // and a straight over-claim on one drawn exactly to its hitbox.
        const before = live.mesh.scale.x;
        smear.update(0.05);
        t.ok('and a lane does not creep outward over its life',
            live.mesh.scale.x === before,
            `${before} grew to ${live.mesh.scale.x}`);
        smear.dispose();
    }
}
