// tests/game/reflect-armor.spec.mjs — the answer the game teaches has to work
// on the enemy it is taught about.
//
// A `bulwark` carries a plate that refuses melee and rays from its front cone.
// A `ranged` enemy answers the shield rather than the parry: a bolt already in
// flight is REFLECTED by a raised guard instead of routed through the parry, on
// purpose, because demanding frame-accuracy for something you cannot walk out
// of is a read the game never showed you (see `_updateProjectiles`).
//
// Both are good rules. Together, on the same enemy, they produced a fight in
// which nothing could hurt anything:
//
//   • melee and rays: refused by the plate, from the only angle a shooter lets
//     you approach from;
//   • the parry: never fires, because the reflect intercepts the bolt first —
//     measured at 0 staggers over 100s of perfectly-timed taps, against 17 for
//     the same enemy in melee;
//   • the reflect: the returned bolt arrives from directly in front, because
//     that is where the player who blocked it is standing, so the plate ate it
//     — 49 clangs, 0 damage, while the on-screen `reflect-bolt` hint promised
//     that a blocked bolt kills the thing that fired it.
//
// A `bulwark` with `ai: 'ranged'` is authored in three rooms, so this was three
// live encounters, not a theoretical pairing. The reported symptom was exactly
// what the numbers say: "cannot parry enemy, enemy cannot hit me".
//
// The fix is that a reflect stagger the shooter, which is what a parry does and
// what a reflect is the ranged half of. These specs pin the outcome and, just
// as importantly, pin that the plate still WORKS — a fix that quietly made
// bulwarks meleeable from the front would pass "the bolt kills it" and destroy
// the kind.

import * as THREE from 'three';
import { Enemy } from '../../src/game/enemy.js';
import { applyHit, inFrontArc } from '../../src/game/combat/combat-sweeper.js';
import { coach, resetCoach, setCoachSink } from '../../src/game/ui/coach.js';
import { BEAT_LIST } from './_beat-defs.mjs';

function spawn(opts) {
    return new Enemy(new THREE.Scene(), null, { x: 0, y: 1, z: 0 }, opts);
}

/** A stand-in attacker at a world point, facing the origin. */
function attackerAt(x, z) {
    const len = Math.hypot(x, z) || 1;
    return {
        root: { position: { x, y: 1.95, z } },
        state: { facingVec: { x: -x / len, z: -z / len } },
    };
}

/**
 * Drive one enemy against a player who holds the shield, faces it, and never
 * moves — the answer the game names for a shooter, played perfectly.
 */
function holdShieldAgainst(e, seconds = 60) {
    const p = {
        root: { position: { x: 0, y: 1.95, z: -3 } },
        state: { facingVec: { x: 0, z: 1 } },
        health: { hp: 10, max: 10, dead: false, damage: () => ({ accepted: true }) },
        guard: { raised: true, parryReady: false },
        inventory: { hasItem: () => false },
    };
    let blocked = 0;
    const wasBlocked = e.onBlocked;
    e.onBlocked = (...a) => { blocked++; return wasBlocked?.apply(e, a); };
    const dt = 1 / 60;
    for (let i = 0; i < seconds * 60 && e.state.current !== 'DEAD'; i++) {
        // Keep facing it; the guard arc is directional.
        const dx = e.rig.position.x - p.root.position.x;
        const dz = e.rig.position.z - p.root.position.z;
        const d = Math.hypot(dx, dz) || 1;
        p.state.facingVec = { x: dx / d, z: dz / d };
        e.update(dt, p);
    }
    return { blocked, hp: e.hp, dead: e.state.current === 'DEAD' };
}

export function run(t) {
    // ── The pairing is real, and this is where it lives ────────────────────
    {
        const rooms = [];
        for (const def of BEAT_LIST) {
            for (const [rid, room] of Object.entries(def.rooms)) {
                for (const e of room.enemies || []) {
                    if (e.kind === 'bulwark' && e.ai === 'ranged') rooms.push(`${def.id}/${rid}`);
                }
            }
        }
        // Not an assertion that the count must stay 3 — level authors may add
        // more. The point is that the combination IS authored, so the systemic
        // fix below is load-bearing rather than defensive.
        t.ok('armoured shooters are authored in the campaign', rooms.length > 0,
            rooms.join(', ') || 'none');
    }

    // ── The bug, stated as the thing the player experiences ────────────────
    {
        const e = spawn({ kind: 'bulwark', hp: 3, ai: 'ranged' });
        const r = holdShieldAgainst(e);
        t.ok('a held shield kills an armoured shooter with its own bolt',
            r.dead, `hp ${r.hp.toFixed(2)} left after 60s, ${r.blocked} blocked by the plate`);
    }
    {
        // The control that proves the fix is about the PLATE and not about
        // reflects in general: an unarmoured shooter already died to this and
        // must still die to it.
        const e = spawn({ kind: 'frost', hp: 3, ai: 'ranged' });
        const r = holdShieldAgainst(e);
        t.ok('an unarmoured shooter still dies to its own bolt',
            r.dead, `hp ${r.hp.toFixed(2)} left after 60s`);
    }

    // ── The plate still has to be a plate ──────────────────────────────────
    {
        const e = spawn({ kind: 'bulwark', hp: 5 });
        e.state.setFacing(0, -1);                 // facing the attacker below
        const front = attackerAt(0, -2);
        t.ok('the attacker is genuinely inside the front cone', inFrontArc(e, front));
        const hp0 = e.hp;
        applyHit(e, { damage: 1 }, front);
        t.ok('a plate still refuses melee from the front',
            e.hp === hp0, `hp ${hp0} → ${e.hp}`);

        const back = attackerAt(0, 2);
        const hp1 = e.hp;
        applyHit(e, { damage: 1 }, back);
        t.ok('a plate still opens from behind', e.hp < hp1, `hp ${hp1} → ${e.hp}`);
    }
    {
        // The armoured SHOOTER is still armoured against blades — the fix must
        // not have turned it into an ordinary enemy that happens to shoot.
        const e = spawn({ kind: 'bulwark', hp: 5, ai: 'ranged' });
        e.state.setFacing(0, -1);
        const hp0 = e.hp;
        applyHit(e, { damage: 1 }, attackerAt(0, -2));
        t.ok('an armoured shooter still refuses melee from the front',
            e.hp === hp0, `hp ${hp0} → ${e.hp}`);
    }

    // ── The stagger is the mechanism, so assert the mechanism ──────────────
    {
        const e = spawn({ kind: 'bulwark', hp: 99, ai: 'ranged' });
        t.ok('an armoured shooter starts with its plate up', e.armorUp);
        const r = holdShieldAgainst(e, 30);
        t.ok('a reflect drops the plate rather than bouncing off it',
            e.hp < 99, `hp ${e.hp.toFixed(2)} of 99 after 30s, ${r.blocked} plate blocks`);
    }

    // ── The hint has to describe the enemy it is attached to ───────────────
    {
        // A ranged bulwark never swings, so "parry its swing" is advice that
        // cannot be followed. Asserted through the coach itself rather than by
        // reading the source: what matters is that a player who meets the melee
        // bulwark first — which every route through the campaign does — still
        // gets told the shooter's rule when they meet the shooter.
        const said = [];
        resetCoach();
        setCoachSink((text) => said.push(text));
        try {
            spawn({ kind: 'bulwark', hp: 3 }).onBlocked();
            const melee = said.length;
            spawn({ kind: 'bulwark', hp: 3, ai: 'ranged' }).onBlocked();

            t.ok('the melee plate teaches the parry',
                melee === 1 && /parry its swing/.test(said[0]), said[0] || '(silent)');
            t.ok('the shooter is still taught after the melee bulwark spoke',
                said.length === 2, `${said.length} hints for 2 kinds of plate`);
            t.ok('the shooter is not told to parry a swing it does not have',
                said[1] && !/parry/.test(said[1]) && /bolt/.test(said[1]),
                said[1] || '(silent)');
        } finally {
            setCoachSink(null);
            resetCoach();
        }
    }
}
