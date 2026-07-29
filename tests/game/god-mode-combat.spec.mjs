// tests/game/god-mode-combat.spec.mjs — god mode means "I do not die", and
// nothing else.
//
// Dev god mode wrapped `player.health.damage` and returned `{accepted:false}`
// before calling through. That is one line and it looks obviously correct. It
// is not: `HealthPool.damage` is where `damageFilter` runs, and `damageFilter`
// is `GuardController.resolve` — so returning early silently switched OFF the
// parry, the verb the entire defensive kit is built around.
//
// The consequence is not "the dev takes no damage". It is that a `bulwark`'s
// plate can never be opened by the answer the game names for it, so a player in
// god mode inside a SEALED room is locked in with an enemy that can neither
// hurt them nor be hurt. Measured in beat-05 greathall before the fix: 89 enemy
// wind-ups, 0 staggers, 0 damage in either direction, door still shut after two
// minutes. With god off, the same fight ends in 7 wind-ups and 3 parries.
//
// The wrapper has broken combat this way once before — an earlier version took
// `(n, iframes)` and dropped the rest, eating the `meta.from` the directional
// guard resolves against, so the shield never engaged at all. That is the same
// bug twice: a dev toggle that quietly changes the rules of the fight. Hence
// this file, which pins the RULES rather than the wrapper's shape.

import { HealthPool } from '../../src/game/kernel/health.js';
import { GuardController, PARRY_WINDOW } from '../../src/game/combat/guard.js';
import { installGodDamageWrapper } from '../../src/game/dev/dev-mode.js';

/**
 * The SHIPPED wrapper, not a reproduction of it.
 *
 * The first draft of this file copied the wrapper's body, because `DevMode`
 * builds DOM on construction. Reverting the real fix then left 19 of 23
 * assertions green — they were exercising the copy. `installGodDamageWrapper`
 * was extracted so the spec can drive the real code; a spec that reproduces
 * the logic it is guarding passes whatever the shipped code does.
 */
function installGodWrapper(health, flag) {
    installGodDamageWrapper(health, () => flag.on);
}

/** A player-ish target with a real guard wired to a real health pool. */
function makeTarget() {
    const health = new HealthPool(6);
    const guard = new GuardController();
    guard.hasShield = true;
    const pos = { x: 0, y: 1.95, z: 0 };
    const facing = { x: 0, z: 1 };          // looking at +Z, where the attacker is
    const staggered = [];
    guard.onParry = (meta) => { if (meta?.attacker) staggered.push(meta.attacker); };
    health.damageFilter = (hit) => guard.resolve(hit, pos, facing);
    return { health, guard, staggered, pos, facing };
}

/** An attacker standing in front of the target. */
function attacker() {
    return { id: 'attacker', position: { x: 0, y: 1, z: 2 } };
}

/** Swing at the target from the front, with the guard tapped just in time. */
function swingIntoParry(tgt) {
    const a = attacker();
    tgt.guard.update(1 / 60, false);          // release, so the next press is an edge
    tgt.guard.update(1 / 60, true);           // rising edge opens the parry window
    return tgt.health.damage(1, 0.9, 'hostile', { from: a.position, attacker: a });
}

export function run(t) {
    // ── The parry works normally ───────────────────────────────────────────
    {
        const tgt = makeTarget();
        const flag = { on: false };
        installGodWrapper(tgt.health, flag);
        const r = swingIntoParry(tgt);
        t.ok('a parry lands with god mode off', r.parried === true, JSON.stringify(r));
        t.ok('a parry staggers the attacker with god mode off',
            tgt.staggered.length === 1, `${tgt.staggered.length} staggered`);
        t.ok('a parry costs no hp', tgt.health.hp === tgt.health.max,
            `hp ${tgt.health.hp}/${tgt.health.max}`);
    }

    // ── …and it still works with god mode ON. This is the whole file. ──────
    {
        const tgt = makeTarget();
        const flag = { on: true };
        installGodWrapper(tgt.health, flag);
        const r = swingIntoParry(tgt);
        t.ok('a parry still staggers the attacker with god mode ON',
            tgt.staggered.length === 1, `${tgt.staggered.length} staggered`);
        t.ok('the parry verdict survives the wrapper', r.parried === true, JSON.stringify(r));
        t.ok('god mode still reports the hit as not accepted', r.accepted === false);
        t.ok('god mode still costs no hp', tgt.health.hp === tgt.health.max,
            `hp ${tgt.health.hp}/${tgt.health.max}`);
    }

    // ── An unguarded hit in god mode: no damage, and no false feedback ─────
    {
        const tgt = makeTarget();
        const flag = { on: true };
        let damageCallbacks = 0;
        tgt.health.onDamage = () => { damageCallbacks++; };
        installGodWrapper(tgt.health, flag);
        const a = attacker();
        // Guard down — nothing to parry, the hit simply arrives.
        tgt.guard.update(1 / 60, false);
        const r = tgt.health.damage(3, 0.9, 'hostile', { from: a.position, attacker: a });
        t.ok('an unguarded hit takes no hp in god mode',
            tgt.health.hp === tgt.health.max, `hp ${tgt.health.hp}/${tgt.health.max}`);
        t.ok('an unguarded hit is not reported as accepted', r.accepted === false);
        t.ok('no hurt feedback fires for zero damage',
            damageCallbacks === 0, `${damageCallbacks} onDamage calls`);
        t.ok('the hurt callback is restored afterwards',
            tgt.health.onDamage !== null, 'onDamage still installed');
    }

    // ── Environment damage uses the OTHER multiplier ───────────────────────
    {
        // `HealthPool.damage` picks `environmentDamageMult` for
        // source === 'environment'. Zeroing only `incomingDamageMult` would
        // have left lava killing a god-mode player — the exact class of bug
        // this wrapper already shipped once by dropping arguments.
        const tgt = makeTarget();
        const flag = { on: true };
        installGodWrapper(tgt.health, flag);
        const r = tgt.health.damage(4, 0.5, 'environment', { from: { x: 0, z: 0 } });
        t.ok('environment damage takes no hp in god mode',
            tgt.health.hp === tgt.health.max, `hp ${tgt.health.hp}/${tgt.health.max}`);
        t.ok('environment damage is not accepted in god mode', r.accepted === false);
    }

    // ── Both multipliers are put back, whatever happened ───────────────────
    {
        const tgt = makeTarget();
        const flag = { on: true };
        tgt.health.incomingDamageMult = 0.5;      // an upgrade the player owns
        tgt.health.environmentDamageMult = 0.25;
        installGodWrapper(tgt.health, flag);
        tgt.health.damage(1, 0.9, 'hostile', { from: { x: 0, z: 2 } });
        t.ok('incomingDamageMult is restored',
            tgt.health.incomingDamageMult === 0.5, String(tgt.health.incomingDamageMult));
        t.ok('environmentDamageMult is restored',
            tgt.health.environmentDamageMult === 0.25, String(tgt.health.environmentDamageMult));

        // …including when the filter throws, or the restore is a leak.
        // i-frames first: an unguarded hit in god mode still arms them, exactly
        // as it does in normal play, and `damage()` returns before the filter
        // while they are up.
        tgt.health.iFrames = 0;
        tgt.health.damageFilter = () => { throw new Error('boom'); };
        let threw = false;
        try { tgt.health.damage(1, 0.9, 'hostile', {}); } catch (e) { threw = true; }
        t.ok('a throwing filter still propagates', threw);
        t.ok('multipliers survive a throwing filter',
            tgt.health.incomingDamageMult === 0.5 && tgt.health.environmentDamageMult === 0.25,
            `${tgt.health.incomingDamageMult} / ${tgt.health.environmentDamageMult}`);
    }

    // ── Turning god mode off leaves the pool exactly as it was ─────────────
    {
        const tgt = makeTarget();
        const flag = { on: true };
        installGodWrapper(tgt.health, flag);
        tgt.health.damage(1, 0.9, 'hostile', { from: { x: 0, z: 2 } });
        flag.on = false;
        const before = tgt.health.hp;
        // A god-mode hit arms i-frames the same as a real one — that is the
        // point of running the real path — so let them lapse before checking
        // that damage resumes.
        tgt.health.iFrames = 0;
        tgt.guard.update(1 / 60, false);
        const r = tgt.health.damage(2, 0.9, 'hostile', { from: { x: 0, z: 2 } });
        t.ok('damage resumes when god mode is switched off',
            r.accepted === true && tgt.health.hp === before - 2,
            `hp ${before} → ${tgt.health.hp}`);
    }

    t.ok('parry window is a real window', PARRY_WINDOW > 0, `${PARRY_WINDOW}s`);

}
