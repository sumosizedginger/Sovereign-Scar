// tests/game/weak-points.spec.mjs — the glowing bit has to mean something.
//
// WHAT WAS WRONG
//
// Two bosses model a weak point and light it on a real condition:
//
//   Sand Spur     a gold seam on its head, lit while it is beached
//   Kinetic Core  a bright underside, lit while it is reachable at the top of
//                 its bob
//
// Both were decoration. Measured on the Core before this landed: it is
// reachable for 254 frames in 600 — 42% of the fight — and every one of those
// hits paid a flat 1x. A boss with a genuine timing test that rewards nothing
// for passing it is the one thing this game's combat rules are not supposed to
// allow, and it was signposted in gold the whole time.
//
// WHY MAX AND NOT PRODUCT — the assertion with teeth
//
// The obvious wiring is `vulnerableMult * weakMult`. On the Sand Spur that is
// wrong, and quietly: beaching IS its recovery, so the two windows are the same
// window, and multiplying turns the Spur's punish into 4x. That is not a new
// mechanic, it is the fight ending early (owner's call, 2026-07-27 — spike the
// Core, leave the worm alone).
//
// So the rule is: the best window you are in decides the multiplier, and
// windows never compound. The test below asserts 4x is UNREACHABLE, not merely
// unused — an assertion that only checked "the Spur does 2x" would pass just as
// happily on a build where nothing had been wired up at all.
//
// Trap 5 applies to the last section: the multiplier lives in `applyHit`, which
// every enemy in the game also goes through, so "inert for anything that does
// not set weakOpen" is checked rather than assumed.

import * as THREE from 'three';
import { applyHit } from '../../src/game/combat/combat-sweeper.js';
import { BossBase } from '../../src/game/bosses/base.js';
import { SandSpur } from '../../src/game/bosses/sand-spur.js';
import { KineticCore } from '../../src/game/bosses/kinetic-core.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { Enemy } from '../../src/game/enemy.js';

const move = { damage: 1, range: 2 };
const attacker = { root: { position: { x: 0, y: 1.4, z: 2 } }, state: { facingVec: { x: 0, z: -1 } } };

function makeBoss(opts = {}) {
    return new BossBase(new THREE.Scene(), {
        id: 'weak-test', name: 'Weak Test', hp: 999,
        position: { x: 0, z: 0 }, mesh: new THREE.Group(), ...opts,
    });
}

/** Damage one swing actually takes off, whatever the multipliers decide. */
function hitFor(defender) {
    const before = defender.hp;
    applyHit(defender, move, attacker);
    return before - defender.hp;
}

export function run(t) {
    // ── The multiplier itself ──────────────────────────────────────────────
    {
        const plain = makeBoss();
        t.ok('a boss with nothing open takes the base damage', hitFor(plain) === 1);

        const weak = makeBoss();
        weak.weakOpen = true;
        t.ok('a lit weak point doubles it', hitFor(weak) === 2, 'weakMult defaults to 2');

        const recovering = makeBoss();
        recovering.vulnerableMult = 2;
        t.ok('so does a recovery window', hitFor(recovering) === 2);

        // THE ONE THAT MATTERS. Both open at once must not compound.
        const both = makeBoss();
        both.weakOpen = true;
        both.vulnerableMult = 2;
        const d = hitFor(both);
        t.ok('both windows open at once is still 2x, not 4x', d === 2,
            `took ${d} — a product here is the Sand Spur's fight ending early`);

        // ...and max really is max, not "recovery wins". A weak point worth
        // more than the recovery must be able to say so.
        const bigger = makeBoss({ weakMult: 3 });
        bigger.weakOpen = true;
        bigger.vulnerableMult = 2;
        t.ok('the larger of the two wins', hitFor(bigger) === 3, 'max, not first-past-the-post');

        const smaller = makeBoss({ weakMult: 1.5 });
        smaller.weakOpen = true;
        smaller.vulnerableMult = 2;
        t.ok('and it is still the larger when the recovery is bigger',
            hitFor(smaller) === 2);
    }

    // ── A closed weak point is closed ──────────────────────────────────────
    {
        const shut = makeBoss();
        shut.weakOpen = false;
        shut.weakMult = 5;
        t.ok('a big multiplier on a closed weak point pays nothing',
            hitFor(shut) === 1, 'weakOpen is the gate, not weakMult');
    }

    // ── The Kinetic Core: a timing test that now pays ──────────────────────
    {
        const core = new KineticCore(new THREE.Scene(), new CollisionWorld(), { x: 0, z: 0 }, {});
        const player = {
            root: { position: { x: 0, y: 1.95, z: 4 } },
            health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
            state: { facingVec: { x: 0, z: -1 } },
        };

        // Drive it until the bob opens the window, then until it shuts.
        let openSeen = false, shutSeen = false;
        let openDamage = null, shutBlocked = null;
        for (let i = 0; i < 600 && !(openSeen && shutSeen); i++) {
            core.tickAI(1 / 60, player, null);
            core.t += 1 / 60;
            if (core.canHit && !openSeen) {
                openSeen = true;
                t.ok('the Core lights its underside exactly when it is reachable',
                    core.weakOpen === true,
                    'one condition drives the light and the damage');
                core.hp = 100;
                openDamage = hitFor(core);
            } else if (!core.canHit && !shutSeen) {
                shutSeen = true;
                t.ok('and unlights it when it is not', core.weakOpen === false);
                core.hp = 100;
                shutBlocked = hitFor(core);
            }
        }
        t.ok('the Core opens and shuts within a fight-length window',
            openSeen && shutSeen, `open=${openSeen} shut=${shutSeen}`);
        t.ok('a hit in the open window pays double', openDamage === 2,
            `took ${openDamage} — it paid a flat 1 before this`);
        t.ok('a hit in the shut window is refused entirely', shutBlocked === 0,
            `took ${shutBlocked} — shielded while unreachable`);
    }

    // ── The Sand Spur: an honest sign, not a bigger number ─────────────────
    {
        const spur = new SandSpur(new THREE.Scene(), new CollisionWorld(), null,
            [{ x: -5, z: -4 }, { x: 5, z: -4 }, { x: 5, z: 4 }, { x: -5, z: 4 }]);
        t.ok('the Spur starts with its seam dark', spur.weakOpen === false);

        // A fresh Spur is underground, and a buried Spur cannot be hit at all —
        // the first draft of this test forgot that and read 0 damage, which is
        // `applyHit` refusing the swing before any multiplier is consulted, not
        // a multiplier answering wrongly.
        spur.hp = 100;
        t.ok('a buried Spur cannot be hit at all', hitFor(spur) === 0,
            'shielded while submerged — nothing below is about this case');

        // Beaching is driven from a fuller game context than a unit test has,
        // so the surfaced state is set directly rather than waited for. The
        // claim under test is what a beached Spur PAYS, not how it beaches.
        spur.hp = 100;
        spur.submerged = false;
        spur.canHit = true;
        spur.shielded = false;
        spur.weakOpen = true;
        spur.vulnerableMult = 2;      // beaching is its recovery; both are open
        const beached = hitFor(spur);
        t.ok('a beached Spur still takes exactly double, not quadruple',
            beached === 2,
            `took ${beached} — the owner's call was to spike the Core and leave `
            + 'the worm alone, and max() is what makes that true');
    }

    // ── Inert for everything that does not opt in (trap 5) ─────────────────
    // `applyHit` is the whole game's damage path, not the boss's.
    {
        const e = new Enemy(new THREE.Scene(), null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        e.hp = 50;
        const plain = hitFor(e);
        t.ok('an ordinary enemy is untouched by any of this', plain === 1,
            `took ${plain}`);
        t.ok('and has no weak window to leave open by accident',
            e.weakOpen === undefined, `weakOpen=${e.weakOpen}`);

        // A defender with no state at all must not throw on the new branch.
        const bare = { hp: 5, root: { position: { x: 0, y: 1, z: 0 } } };
        applyHit(bare, move, attacker);
        t.ok('a bare defender still takes its hit', bare.hp === 4, `hp=${bare.hp}`);
    }
}
