// tests/game/choose-action.spec.mjs — the difference between a moveset and a
// fight.
//
// Every boss in this game had exactly one committed attack (measured:
// `content-density.mjs`, mean 1.00 across fourteen). Phase B gives them kits,
// and the moment a boss has more than one move, four questions appear that no
// subclass should be answering for itself:
//
//   1. which moves are even legal from here
//   2. how the odds are weighted between them
//   3. how repetition is prevented
//   4. whether recovery is always a free hit
//
// Fourteen bosses answering those separately is fourteen chances to get one
// subtly wrong, which is this project's most expensive recurring bug (trap 5).
// So they live in `BossBase`, and this pins them.
//
// WHAT IS ACTUALLY BEING CLAIMED
//
// The hard one is the habit. `chooseAction` is not supposed to react to where
// the player is standing THIS FRAME — that is a boss you can bait one move at a
// time. It reacts to where they have been LIVING, over a few seconds. So the
// test drives real time through `trackHabit` rather than setting the field, and
// then asserts the odds actually moved, over enough samples that a lucky roll
// cannot carry it. The RNG is seeded so those runs are reproducible.
//
// Trap 5 again on the last section: the framework is worthless if nothing uses
// it, and this session has spent most of its time finding code that was built
// and never called. The Crypt Warden is driven for real at the bottom.

import * as THREE from 'three';
import {
    BossBase, HABIT_WINDOW, HABIT_STRENGTH, CHAIN_CHANCE, CHAIN_COOLDOWN,
} from '../../src/game/bosses/base.js';
import {
    CryptWarden, CRACK_SAFE, CRACK_OUTER, SWEEP_R, SWEEP_HALF,
} from '../../src/game/bosses/roster.js';

function makeBoss(opts = {}) {
    const b = new BossBase(new THREE.Scene(), {
        id: 'choose-test', name: 'Choose Test', hp: 100,
        position: { x: 0, z: 0 }, mesh: new THREE.Group(), ...opts,
    });
    b.tickAI = () => {};
    b.seedRng(12345);
    return b;
}

function makePlayer(x = 0, z = 4) {
    return {
        root: { position: { x, y: 1.95, z } },
        health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
        state: { facingVec: { x: 0, z: -1 } },
    };
}

/** A menu of moves that do nothing, so selection can be studied on its own. */
const stub = (name, extra = {}) => ({
    name, build: () => ({ name, windup: 0.1, recover: 0.1, cooldown: 0.1 }), ...extra,
});

/** Roll `n` choices and count them by name. */
function histogram(boss, player, dist, n = 4000) {
    const out = {};
    for (let i = 0; i < n; i++) {
        const pick = boss.chooseAction(player, dist);
        const k = pick ? pick.name : '(none)';
        out[k] = (out[k] || 0) + 1;
    }
    return out;
}

export function run(t) {
    // ── Distance is a GATE, not a rule ─────────────────────────────────────
    {
        const b = makeBoss();
        b.defineActions([
            stub('near', { range: [0, 3] }),
            stub('mid', { range: [2, 7] }),
            stub('far', { range: [6, 12] }),
        ]);
        const p = makePlayer();

        t.ok('a move out of range is not on the menu',
            !Object.keys(histogram(b, p, 10, 200)).includes('near'));
        t.ok('nor is one whose range starts beyond us',
            !Object.keys(histogram(b, p, 1, 200)).includes('far'));

        // The point of a gate: ranges OVERLAP, so more than one move is
        // usually legal and the choice stays open.
        const overlap = Object.keys(histogram(b, p, 2.5, 400)).sort();
        t.ok('overlapping ranges leave a real choice', overlap.length === 2,
            `at 2.5 units the menu was: ${overlap.join(', ')}`);
        t.ok('and the choice is between the right two',
            overlap.join() === 'mid,near', overlap.join());

        // Nothing legal must be survivable — the boss falls through to its own
        // movement rather than standing still or throwing.
        t.ok('a distance with no legal move returns null',
            b.chooseAction(p, 40) === null);
        t.ok('and so does a boss with no moves defined',
            makeBoss().chooseAction(p, 3) === null);
    }

    // ── Weights ────────────────────────────────────────────────────────────
    {
        const b = makeBoss();
        b.defineActions([stub('common', { weight: 3 }), stub('rare', { weight: 1 })]);
        const h = histogram(b, makePlayer(), 3);
        const ratio = h.common / h.rare;
        t.ok('weights move the odds in the right direction', h.common > h.rare,
            `common=${h.common} rare=${h.rare}`);
        t.ok('roughly in proportion', ratio > 2.4 && ratio < 3.6,
            `ratio ${ratio.toFixed(2)}, expected ~3 (the no-repeat rule bends it slightly)`);
        t.ok('and the rare one still happens', h.rare > 0,
            'a weight of 1 against 3 is uncommon, not impossible');
    }

    // ── The habit: where the player LIVES, not where they are ──────────────
    {
        const p = makePlayer();

        // A camper: four seconds glued to the boss.
        const camper = makeBoss();
        camper.defineActions([
            stub('gapCloser', { prefers: 'far' }),
            stub('antiCamp', { prefers: 'close' }),
        ]);
        for (let i = 0; i < 300; i++) camper.trackHabit(1.0, 1 / 60);

        // A kiter: four seconds at the edge of its reach.
        const kiter = makeBoss();
        kiter.defineActions([
            stub('gapCloser', { prefers: 'far' }),
            stub('antiCamp', { prefers: 'close' }),
        ]);
        for (let i = 0; i < 300; i++) kiter.trackHabit(8.5, 1 / 60);

        t.ok('a camper reads as close', camper.habitBias < -0.5,
            `bias ${camper.habitBias.toFixed(2)}`);
        t.ok('a kiter reads as far', kiter.habitBias > 0.5,
            `bias ${kiter.habitBias.toFixed(2)}`);

        // Both are asked from the SAME distance. Only the history differs, so
        // any difference in the answer is the habit and nothing else.
        const hc = histogram(camper, p, 5);
        const hk = histogram(kiter, p, 5);
        // A MARGIN, not just ">". With the habit disabled these two are a coin
        // flip, and a coin flip passes a bare ">" half the time — the first
        // draft of this asserted exactly that and survived the counterfactual
        // at 2018 vs 1982. At full bias the weights are 1.6 vs 0.4, so a real
        // effect is a landslide; anything close to even means it is not there.
        t.ok('the camper sees clearly more of the move that punishes camping',
            hc.antiCamp > hc.gapCloser * 1.5,
            `antiCamp=${hc.antiCamp} gapCloser=${hc.gapCloser} — needs a margin, `
            + 'not a nose');
        t.ok('the kiter sees clearly more of the gap-closer',
            hk.gapCloser > hk.antiCamp * 1.5,
            `gapCloser=${hk.gapCloser} antiCamp=${hk.antiCamp}`);
        // It must be a thumb on the scale, not a switch. A player who learns
        // "kite and it only ever gap-closes" has just learned a new script.
        t.ok('the disfavoured move is still common for a camper',
            hc.gapCloser > hc.antiCamp * 0.3,
            `gapCloser=${hc.gapCloser} vs antiCamp=${hc.antiCamp} — habit must not `
            + 'become a lever the player can pull to pick the boss\'s move');
        t.ok('HABIT_STRENGTH stays under a full override', HABIT_STRENGTH < 1,
            `${HABIT_STRENGTH}`);
    }

    // ── The habit has a memory, and it fades ───────────────────────────────
    {
        const b = makeBoss();
        for (let i = 0; i < 300; i++) b.trackHabit(1.0, 1 / 60);   // camped
        const camped = b.habitDist;
        // Now back off and hold there for one window.
        for (let i = 0; i < 60 * HABIT_WINDOW; i++) b.trackHabit(9.0, 1 / 60);
        t.ok('backing off is noticed', b.habitDist > camped + 3,
            `${camped.toFixed(2)} → ${b.habitDist.toFixed(2)} after ${HABIT_WINDOW}s`);

        // ...but a single frame at a new distance is not a personality change.
        const c = makeBoss();
        for (let i = 0; i < 300; i++) c.trackHabit(1.0, 1 / 60);
        c.trackHabit(9.0, 1 / 60);
        t.ok('one frame at a new range barely moves it', c.habitDist < 1.2,
            `${c.habitDist.toFixed(3)} — a dash through the boss must not read as kiting`);

        // First sight seeds rather than easing up from zero, or a boss spends
        // its opening seconds believing the player is in its lap.
        const fresh = makeBoss();
        fresh.trackHabit(7.5, 1 / 60);
        t.ok('the first reading is taken as-is', Math.abs(fresh.habitDist - 7.5) < 1e-9,
            `${fresh.habitDist}`);
        t.ok('a boss with no habit yet is unbiased', makeBoss().habitBias === 0);
    }

    // ── Never three in a row ───────────────────────────────────────────────
    {
        const b = makeBoss();
        b.defineActions([stub('a'), stub('b')]);
        const p = makePlayer();

        // Drive real selections through actIfReady so `_recent` is maintained
        // by the production path, not by the test.
        const seq = [];
        for (let i = 0; i < 300; i++) {
            b.action = null; b.actionCd = 0;
            const pick = b.actIfReady(p, 3);
            if (pick) seq.push(pick.name);
        }
        t.ok('it keeps choosing', seq.length > 250, `${seq.length} picks`);

        let worst = 1, run = 1;
        for (let i = 1; i < seq.length; i++) {
            run = seq[i] === seq[i - 1] ? run + 1 : 1;
            if (run > worst) worst = run;
        }
        t.ok('nothing ever fires three times running', worst <= 2,
            `longest run was ${worst}`);
        t.ok('but twice in a row does happen', worst === 2,
            'a boss that can never repeat is its own kind of predictable');
    }

    // ── The no-repeat rule must never leave a boss inert ───────────────────
    // One move on the menu, just used twice: suppressing it would freeze the
    // boss. Being boring beats being a statue.
    {
        const b = makeBoss();
        b.defineActions([stub('only')]);
        const p = makePlayer();
        b._recent = ['only', 'only'];
        const pick = b.chooseAction(p, 3);
        t.ok('a boss with one move still uses it after two in a row',
            pick && pick.name === 'only', String(pick && pick.name));
    }

    // ── Determinism, so a fight can be replayed ────────────────────────────
    {
        const runOnce = () => {
            const b = makeBoss();
            b.defineActions([stub('a'), stub('b'), stub('c')]);
            b.seedRng(999);
            const p = makePlayer();
            const out = [];
            for (let i = 0; i < 60; i++) {
                b.action = null; b.actionCd = 0;
                out.push(b.actIfReady(p, 3)?.name);
            }
            return out.join(',');
        };
        t.ok('the same seed replays the same fight', runOnce() === runOnce());

        const other = makeBoss();
        other.defineActions([stub('a'), stub('b'), stub('c')]);
        other.seedRng(1000);
        const p = makePlayer();
        const alt = [];
        for (let i = 0; i < 60; i++) {
            other.action = null; other.actionCd = 0;
            alt.push(other.actIfReady(p, 3)?.name);
        }
        t.ok('a different seed does not', alt.join(',') !== runOnce());

        // Two bosses of different kinds must not act in lockstep on defaults.
        const x = makeBoss({ id: 'alpha' });
        const y = makeBoss({ id: 'beta' });
        x._seed = null; y._seed = null;
        const xs = Array.from({ length: 20 }, () => x._rand().toFixed(6)).join();
        const ys = Array.from({ length: 20 }, () => y._rand().toFixed(6)).join();
        t.ok('unseeded bosses of different ids diverge', xs !== ys);
    }

    // ── Phase gating ───────────────────────────────────────────────────────
    {
        const b = makeBoss();
        b.defineActions([stub('early'), stub('late', { phase: 2 })]);
        const p = makePlayer();
        t.ok('a phase-2 move is not offered in phase 1',
            !Object.keys(histogram(b, p, 3, 300)).includes('late'));
        b.phase = 2;
        t.ok('and is offered in phase 2',
            Object.keys(histogram(b, p, 3, 300)).includes('late'));
    }

    // ── Chaining out of recovery ───────────────────────────────────────────
    {
        const p = makePlayer();
        // Phase 1 must never chain: the first time you meet a boss, reading it
        // is always worth a free hit.
        const p1 = makeBoss();
        p1.defineActions([stub('a')]);
        let chained = 0;
        for (let i = 0; i < 400; i++) {
            p1.action = null; p1.actionCd = 0;
            p1.actIfReady(p, 3);
            p1.runAction(9, p, null);   // through the windup
            p1.runAction(9, p, null);   // through the recovery
            if (p1.chainedLast) chained++;
        }
        t.ok('phase 1 never chains', chained === 0, `${chained} chains in 400`);

        const p2 = makeBoss();
        p2.defineActions([stub('a')]);
        p2.phase = 2;
        let n = 0, cds = [];
        for (let i = 0; i < 1200; i++) {
            p2.action = null; p2.actionCd = 0;
            p2.actIfReady(p, 3);
            p2.runAction(9, p, null);
            p2.runAction(9, p, null);
            if (p2.chainedLast) { n++; cds.push(p2.actionCd); }
        }
        const rate = n / 1200;
        t.ok('phase 2 chains about a quarter of the time',
            Math.abs(rate - CHAIN_CHANCE) < 0.05,
            `${(rate * 100).toFixed(1)}% over 1200, expected ${CHAIN_CHANCE * 100}%`);
        t.ok('and a chain really does shorten the gap',
            cds.length > 0 && cds.every((c) => c > 0),
            'a chained cooldown is shorter, never zero — the recovery still resolves');
        t.ok('the chain keeps a real fraction of the cooldown',
            CHAIN_COOLDOWN > 0 && CHAIN_COOLDOWN < 1, `${CHAIN_COOLDOWN}`);
    }

    // ── INTEGRATION: the Crypt Warden actually uses it ─────────────────────
    // Framework nobody calls is the thing this session keeps finding. The
    // tutorial boss is driven for real here; deleting its `defineActions` or
    // its `actIfReady` call fails this.
    {
        const w = new CryptWarden(new THREE.Scene(), { x: 0, z: 0 });
        w.seedRng(4242);
        w._awake = true;
        const p = makePlayer(0, 3);

        t.ok('the Warden declares a moveset', Array.isArray(w.actionSet) && w.actionSet.length === 3,
            `${w.actionSet && w.actionSet.length} moves`);
        t.ok('punish, pressure and phase',
            w.actionSet.map((a) => a.name).sort().join() === 'ground-crack,slam,sweep',
            w.actionSet.map((a) => a.name).join());

        const seen = {};
        for (let i = 0; i < 400; i++) {
            w.action = null; w.actionCd = 0;
            const pick = w.actIfReady(p, 3);
            if (pick) seen[pick.name] = (seen[pick.name] || 0) + 1;
        }
        t.ok('it slams', (seen.slam || 0) > 0, JSON.stringify(seen));
        t.ok('and it sweeps', (seen.sweep || 0) > 0, JSON.stringify(seen));
        t.ok('neither dominates the fight',
            Math.min(seen.slam, seen.sweep) / 400 > 0.15, JSON.stringify(seen));

        // The sweep is a close-range move; at slam range it must not appear,
        // or the cone telegraph would be drawn where the player cannot be hit.
        const far = {};
        for (let i = 0; i < 200; i++) {
            w.action = null; w.actionCd = 0;
            const pick = w.actIfReady(makePlayer(0, 8), 8);
            if (pick) far[pick.name] = (far[pick.name] || 0) + 1;
        }
        t.ok('at 8 units only the slam is on the menu',
            !far.sweep && far.slam > 0, JSON.stringify(far));

        // The tutorial boss must not chain — beat 01 is teaching that reading a
        // wind-up buys you a free hit, and a chain is that promise broken.
        t.ok('the Warden opens in a non-chaining phase', w.chainPhase >= 2,
            `chainPhase=${w.chainPhase}, phase=${w.phase}`);
    }

    // ── The ring: a telegraph that means the opposite of every other one ────
    //
    // Every telegraph in the game so far says "not here". This one says "here,
    // and nowhere else". If `inRing` ever agreed with `inBlast` the move would
    // silently become a slam with a bigger radius — a wrong answer that plays
    // perfectly smoothly and would never be reported as a bug, only as the
    // fight feeling arbitrary. So the geometry is asserted, not the wiring.
    {
        const w = new CryptWarden(new THREE.Scene(), { x: 0, z: 0 });
        w.seedRng(77);
        w._awake = true;
        const cx = w.root.position.x, cz = w.root.position.z;
        const at = (r) => w.inRing(makePlayer(cx, cz + r), cx, cz, CRACK_SAFE, CRACK_OUTER);

        t.ok('the centre is safe', !at(0));
        t.ok('and stays safe right up to the inner edge', !at(CRACK_SAFE - 0.1));
        t.ok('the band hurts', at(CRACK_SAFE + 0.1) && at((CRACK_SAFE + CRACK_OUTER) / 2)
            && at(CRACK_OUTER - 0.1));
        t.ok('and beyond the outer edge is safe again', !at(CRACK_OUTER + 0.1),
            'a player against the far wall had no read to make');

        // The safe hole must clear the boss's own body, or "get in" would mean
        // "stand inside it and take contact damage", which is not an answer.
        t.ok('the safe hole is bigger than the boss', CRACK_SAFE > w.contactRadius + 1,
            `safe ${CRACK_SAFE} vs contact ${w.contactRadius.toFixed(2)}`);

        // The worst case is dead centre of the band: whichever edge is nearer
        // is the answer, so the required travel is HALF the band, not all of
        // it. At 5.5 u/s and a 0.95s wind-up that must be comfortable, because
        // this is the gentlest phase move in the game by design.
        const worstTravel = (CRACK_OUTER - CRACK_SAFE) / 2;
        t.ok('the worst case is reachable with time to spare',
            worstTravel < 5.5 * 0.95 * 0.6,
            `${worstTravel.toFixed(2)} units against ${(5.5 * 0.95).toFixed(2)} of travel`);

        // Phase gating, on the real boss rather than a stub.
        const p1 = {};
        for (let i = 0; i < 200; i++) {
            w.action = null; w.actionCd = 0;
            const pick = w.actIfReady(makePlayer(cx, cz + 6), 6);
            if (pick) p1[pick.name] = (p1[pick.name] || 0) + 1;
        }
        t.ok('phase 1 never cracks the ground', !p1['ground-crack'], JSON.stringify(p1));

        w.phase = 2;
        const p2 = {};
        for (let i = 0; i < 400; i++) {
            w.action = null; w.actionCd = 0;
            const pick = w.actIfReady(makePlayer(cx, cz + 6), 6);
            if (pick) p2[pick.name] = (p2[pick.name] || 0) + 1;
        }
        t.ok('phase 2 does', (p2['ground-crack'] || 0) > 0, JSON.stringify(p2));
        t.ok('and phase 2 is a different fight, not the same one faster',
            (p2['ground-crack'] || 0) / 400 > 0.15, JSON.stringify(p2));

        // It is not offered at someone already standing in the safe hole —
        // that would be a turn where the boss does nothing.
        const inside = {};
        for (let i = 0; i < 200; i++) {
            w.action = null; w.actionCd = 0;
            const pick = w.actIfReady(makePlayer(cx, cz + 2), 2);
            if (pick) inside[pick.name] = (inside[pick.name] || 0) + 1;
        }
        t.ok('never fired at a player already in the safe centre',
            !inside['ground-crack'], JSON.stringify(inside));
    }

    // ── The picture and the rule must be the same shape ─────────────────────
    //
    // The worst bug this framework can have, and it shipped twice in the same
    // hour undetected: the strike is tested against the AUTHORED shape while
    // the telegraph is drawn with the DEFAULT one, because `startAction` only
    // forwarded the parameters the first two shapes happened to need. The
    // player then stands on ground the game drew as safe and takes a hit.
    //
    // Nothing about that is visible from either file, both were green, and no
    // amount of playing beat 01 would produce a bug report more specific than
    // "the sweep feels unfair". So the drawn geometry is read back and compared
    // against the numbers the hit test uses. Measured before the fix: the cone
    // drew 90° and hit at 120°; the ring drew a 3.83 safe hole against a real
    // one of 3.40.
    {
        const w = new CryptWarden(new THREE.Scene(), { x: 0, z: 0 });
        w._awake = true;
        const p = makePlayer(0, 3);

        /** Commit `name` and hand back the telegraph mesh it drew. */
        const drawn = (name) => {
            w.action = null;
            w.actionCd = 0;
            const entry = w.actionSet.find((a) => a.name === name);
            w.startAction(entry.build(w), p);
            return w._telegraph;
        };

        const cone = drawn('sweep').geometry;
        t.ok('the sweep draws a wedge', cone.type === 'CircleGeometry', cone.type);
        t.ok('as wide as the wedge that hits',
            Math.abs(cone.parameters.thetaLength - SWEEP_HALF * 2) < 1e-9,
            `drew ${(cone.parameters.thetaLength * 180 / Math.PI).toFixed(0)}° total, `
            + `hits across ${(SWEEP_HALF * 360 / Math.PI).toFixed(0)}°`);
        t.ok('and reaching as far', Math.abs(cone.parameters.radius - SWEEP_R) < 1e-9,
            `${cone.parameters.radius} vs ${SWEEP_R}`);

        w.phase = 2;
        const ring = drawn('ground-crack').geometry;
        t.ok('the crack draws an annulus', ring.type === 'RingGeometry', ring.type);
        t.ok('whose hole is the safe hole',
            Math.abs(ring.parameters.innerRadius - CRACK_SAFE) < 1e-9,
            `drew ${ring.parameters.innerRadius}, safe at ${CRACK_SAFE}`);
        t.ok('and whose outer edge is the outer edge',
            Math.abs(ring.parameters.outerRadius - CRACK_OUTER) < 1e-9,
            `drew ${ring.parameters.outerRadius}, safe past ${CRACK_OUTER}`);

        // The ring is the one telegraph that does NOT move. Growing it was
        // tried and reverted: scaling an annulus scales both edges, so a band
        // at quarter size sits inside the refuge and paints it red for the
        // first half of the wind-up. See telegraph-truth.spec.mjs.
        t.ok('the ring is full size immediately', Math.abs(w._telegraph.scale.x - 1) < 1e-6,
            `${w._telegraph.scale.x.toFixed(3)}`);
        const life = w.action.windup;
        for (let i = 0; i < 199 && w._telegraph; i++) w.update(life / 200, p);
        t.ok('and stays that size right up to the strike',
            !!w._telegraph && Math.abs(w._telegraph.scale.x - 1) < 1e-6,
            w._telegraph ? w._telegraph.scale.x.toFixed(3) : 'cleared early');
    }
}
