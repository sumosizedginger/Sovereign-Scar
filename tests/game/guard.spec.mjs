// tests/game/guard.spec.mjs — Z3, the defensive verb.
//
// The enemy layer already telegraphs everything (windup, ground ring, resolve
// at strike time). Before this ticket the only answer to a telegraph was to
// walk away, which meant the entire telegraph system was decoration. These
// specs pin the contract that makes it a conversation instead:
//
//   frontal + poise      → chipped
//   frontal + on time    → parried, fully negated, attacker staggered
//   from behind          → lands in full, no matter what you are holding
//   poise exhausted      → guard break, and you are open
//   environment          → never blockable

import { HealthPool } from '../../src/game/kernel/health.js';
import {
    GuardController, inGuardArc,
    GUARD_CHIP, PARRY_WINDOW, POISE_MAX, BREAK_STUN,
} from '../../src/game/combat/guard.js';

const AT = { x: 0, z: 0 };
const NORTH = { x: 0, z: -1 };

/** Wire a guard to a pool exactly the way Player does. */
function rig(facing = NORTH) {
    const health = new HealthPool(10);
    const guard = new GuardController();
    health.damageFilter = (hit) => guard.resolve(hit, AT, facing);
    return { health, guard };
}

const inFront = { from: { x: 0, z: -3 } };
const behind = { from: { x: 0, z: 3 } };

export function run(t) {
    // --- arc geometry -----------------------------------------------------
    t.ok('hit from dead ahead is inside the guarded cone',
        inGuardArc(AT, NORTH, { x: 0, z: -5 }) === true);
    t.ok('hit from directly behind is outside the cone',
        inGuardArc(AT, NORTH, { x: 0, z: 5 }) === false);
    t.ok('hit from the flank is outside the cone',
        inGuardArc(AT, NORTH, { x: 5, z: 0 }) === false);
    t.ok('a hit with no known origin is not blockable',
        inGuardArc(AT, NORTH, null) === false);

    // --- holding the guard ------------------------------------------------
    {
        const { health, guard } = rig();
        // Hold past the parry window so this is a plain block, not a parry.
        guard.update(0.016, true);
        guard.update(PARRY_WINDOW + 0.05, true);
        const res = health.damage(2, 0.9, 'hostile', inFront);
        // Holding the shield STOPS the hit. It used to leak 25% through, which
        // the owner reported as "holding block still causes you to take
        // damage" — correct, and not what a shield does.
        t.ok('a held guard stops a frontal hit outright',
            health.hp === 10, `hp=${health.hp}`);
        t.ok('the block is reported to the caller', res.blocked === true && res.parried === false);
        t.ok('blocking costs poise', guard.poise < POISE_MAX, `poise=${guard.poise}`);
        t.ok('chip damage is genuinely zero, not merely small', GUARD_CHIP === 0);
    }
    {
        // The cost of turtling is POISE, not a hp leak. Blocking forever still
        // loses — it loses to the guard break, which is the mechanic built for
        // it and which the player can see coming on the HUD pips.
        const { health, guard } = rig();
        guard.update(0.016, true);
        guard.update(PARRY_WINDOW + 0.05, true);
        for (let i = 0; i < 8 && !guard.broken; i++) {
            health.iFrames = 0;
            health.damage(1, 0, 'hostile', inFront);
            guard.update(0.016, true);
        }
        t.ok('holding block through a combo still breaks the guard',
            guard.broken === true, `poise=${guard.poise}`);
        t.ok('...without having taken a point of chip to get there',
            health.hp === 10, `hp=${health.hp}`);
    }

    // --- the parry --------------------------------------------------------
    {
        const { health, guard } = rig();
        guard.update(0.016, true); // rising edge opens the window
        const res = health.damage(3, 0.9, 'hostile', inFront);
        t.ok('a parried hit deals no damage at all', health.hp === 10, `hp=${health.hp}`);
        t.ok('a parry is reported as a parry', res.parried === true && res.accepted === false);
        t.ok('a parry grants no i-frames, so the punish window is real',
            health.iFrames === 0, `iFrames=${health.iFrames}`);
        t.ok('a parry refunds poise in full', guard.poise === POISE_MAX);
        t.ok('the parry counter advances', guard.parries === 1);
    }
    {
        // Holding the button down does NOT keep the window open — otherwise
        // "hold block" would be strictly better than reading the telegraph.
        const { health, guard } = rig();
        guard.update(0.016, true);
        guard.update(PARRY_WINDOW + 0.05, true);
        health.damage(3, 0.9, 'hostile', inFront);
        // This used to read `health.hp < 10` — using chip damage as a proxy for
        // "that was a block, not a parry". The proxy died with the chip. The
        // real difference was never the hp: a parry refunds poise IN FULL and
        // staggers the attacker; a block spends poise and does neither. Assert
        // that, and the test stops depending on a number it never cared about.
        t.ok('the parry window closes while the button stays held',
            guard.parries === 0 && guard.poise < POISE_MAX,
            `parries=${guard.parries} poise=${guard.poise}`);
    }
    {
        // Mashing must not re-open the window mid-flight either: the edge has
        // to be a genuine press, and a release+press is a new read.
        const { guard } = rig();
        guard.update(0.016, true);
        guard.update(0.5, true);
        t.ok('window expires while held', guard.parryReady === false);
        guard.update(0.016, false);
        guard.update(0.016, true);
        t.ok('a fresh press re-opens the window', guard.parryReady === true);
    }

    // --- directionality ---------------------------------------------------
    {
        const { health, guard } = rig();
        guard.update(0.016, true);
        health.damage(2, 0.9, 'hostile', behind);
        t.ok('a guard does not protect your back', health.hp === 8, `hp=${health.hp}`);
        t.ok('a hit from behind is not counted as a parry', guard.parries === 0);
    }
    {
        const { health, guard } = rig();
        guard.update(0.016, true);
        health.damage(2, 0.9, 'environment', inFront);
        t.ok('a shield does not block the floor', health.hp === 8, `hp=${health.hp}`);
    }
    {
        const { health } = rig();
        // Guard never raised.
        health.damage(2, 0.9, 'hostile', inFront);
        t.ok('an unraised guard changes nothing', health.hp === 8, `hp=${health.hp}`);
    }

    // --- guard break ------------------------------------------------------
    {
        const { health, guard } = rig();
        let broke = 0;
        guard.onBreak = () => broke++;
        guard.update(0.016, true);
        guard.update(PARRY_WINDOW + 0.05, true);
        // Poise is POISE_MAX; a single hit that exceeds it must break.
        health.iFrames = 0;
        health.damage(POISE_MAX + 1, 0, 'hostile', inFront);
        t.ok('exhausting poise breaks the guard', guard.broken === true, `poise=${guard.poise}`);
        t.ok('the break fires its callback exactly once', broke === 1);
        t.ok('a broken guard reports itself as not raised', guard.raised === false);

        // While broken, hits land in full even though the button is held.
        health.iFrames = 0;
        const hp0 = health.hp;
        guard.update(0.016, true);
        health.damage(2, 0, 'hostile', inFront);
        t.ok('a broken guard blocks nothing', health.hp === hp0 - 2, `hp=${health.hp}`);

        // ...and it recovers on a timer, with poise restored.
        guard.update(BREAK_STUN + 0.01, false);
        t.ok('the break stun expires', guard.broken === false);
        t.ok('poise is restored by the time the stun ends',
            guard.poise > 0, `poise=${guard.poise}`);
    }

    // --- poise regen ------------------------------------------------------
    {
        const { guard } = rig();
        guard.poise = 0.5;
        guard.update(1.0, false);
        const idle = guard.poise;
        guard.poise = 0.5;
        guard.update(1.0, true);
        t.ok('poise regenerates slower while actively guarding',
            guard.poise < idle, `held=${guard.poise} idle=${idle}`);
    }

    // --- attacker feedback ------------------------------------------------
    {
        const { health, guard } = rig();
        const attacker = { staggered: 0, stagger(s) { this.staggered = s; } };
        guard.onParry = (meta) => meta.attacker.stagger(0.7);
        guard.update(0.016, true);
        health.damage(1, 0.9, 'hostile', { from: { x: 0, z: -2 }, attacker });
        t.ok('a parry hands the attacker back to the player staggered',
            attacker.staggered === 0.7);
    }

    // --- no filter installed ----------------------------------------------
    {
        const health = new HealthPool(10);
        health.damage(3, 0.5);
        t.ok('a pool with no damageFilter behaves exactly as before',
            health.hp === 7 && health.iFrames === 0.5, `hp=${health.hp}`);
    }

    // --- the shield gate --------------------------------------------------
    //
    // Guard and parry are not innate. The hero finds the Bulwark Shield on the
    // predecessor's body partway through Beat 01, whose declared theme is
    // reading a wind-up — a player handed a shield on frame one answers every
    // telegraph by holding a button and never learns to read one.
    {
        const { health, guard } = rig();
        guard.hasShield = false;
        guard.update(0.016, true);
        t.ok('guard will not raise without a shield', guard.raised === false);
        t.ok('...and the parry window never opens', guard.parryReady === false);

        health.damage(2, 0.5, 'hostile', { from: { x: 0, z: -2 } });
        t.ok('a frontal blow lands in full while unarmed',
            health.hp === 8, `hp=${health.hp}`);
        t.ok('poise is untouched, so the shield works the moment it is found',
            guard.poise === POISE_MAX, `poise=${guard.poise}`);
    }
    {
        const { health, guard } = rig();
        guard.hasShield = false;
        guard.update(0.016, true);
        guard.hasShield = true;
        guard.update(0.016, true);
        t.ok('the same held button raises the guard once the shield is owned',
            guard.raised === true);
        health.damage(2, 0.5, 'hostile', { from: { x: 0, z: -2 } });
        t.ok('...and it chips from that frame on', health.hp > 8, `hp=${health.hp}`);
    }
}
