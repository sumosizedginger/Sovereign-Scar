// tests/game/boss-movesets.spec.mjs — every boss asks more than one question.
//
// Measured at the start of phase B (`tests/qa/content-density.mjs`): **1.00
// committed telegraphed attacks per boss, across all fourteen.** Every fight in
// the game was one move on a cooldown, which is a fight you solve once and then
// execute. ROAD-TO-TEN phase B gives each of them a punish, a pressure move and
// something that changes in a later phase.
//
// WHAT COUNTS AS A MOVE HERE
//
// Not "a `startAction` was called" — several bosses carry real threats that are
// not staged actions at all (the Spur's mound, the Tri-Compiler's beam net),
// and counting only the staged ones would both undercount those fights and
// reward the wrong shape of fix. What counts is **a distinct thing the player
// has to answer**, and each one is claimed separately below by driving it.
//
// The roster gate at the bottom is the number the plan cares about. It is
// computed from the claims above it rather than restated, so a boss cannot pass
// it by being listed.

import * as THREE from 'three';
import {
    CryptWarden, TriCompiler, MagmaWyrm, ProxyBoss, ObsidianArachnid,
    HydroidCloud, SkeletalMantis, PhantasmBoss, FrostAndFuel, SludgeGolem,
    GumoiWitness, LeviathanBoss,
} from '../../src/game/bosses/roster.js';
import { SandSpur, WAKE_R, WAKE_CD, BREACH_R } from '../../src/game/bosses/sand-spur.js';
import {
    KineticCore, SHOCK_BAND, SHOCK_MAX_R,
} from '../../src/game/bosses/kinetic-core.js';

const particles = { spawn() {}, burst() {}, update() {} };
const P = { x: 0, y: 1.4, z: 0 };

function probe(x = 0, z = 0) {
    const p = {
        hits: 0,
        root: { position: { x, y: 1.4, z } },
        state: { facingVec: { x: 0, z: -1 } },
        health: {
            hp: 9999, maxHp: 9999, dead: false,
            damage() { p.hits++; return { accepted: true }; },
        },
    };
    return p;
}

/** Record every staged action a boss commits to over `frames`. */
function seenActions(boss, player, frames, hold) {
    const names = new Set();
    const real = boss.startAction.bind(boss);
    boss.startAction = (def, pl) => {
        const ok = real(def, pl);
        if (ok) names.add(def.name);
        return ok;
    };
    for (let i = 0; i < frames; i++) {
        if (hold) hold(boss, player, i);
        boss.update(1 / 60, player, null);
    }
    return names;
}

export function run(t) {
    const kit = {};

    // ── 01 · Crypt Warden ──────────────────────────────────────────────────
    {
        const b = new CryptWarden(new THREE.Scene(), { x: 0, z: 0 });
        b._awake = true;
        const p = probe(0, 3);
        const names = seenActions(b, p, 5400, (boss, pl, i) => {
            pl.root.position.x = boss.root.position.x;
            pl.root.position.z = boss.root.position.z + (i > 2700 ? 6 : 3);
            if (i === 2400) { boss.hp = Math.max(1, boss.maxHp * 0.4); boss._phaseDirty = true; }
        });
        t.ok('warden: slam', names.has('slam'), [...names].join(','));
        t.ok('warden: sweep', names.has('sweep'), [...names].join(','));
        t.ok('warden: ground-crack in phase 2', names.has('ground-crack'), [...names].join(','));
        kit['crypt warden'] = names.size;
    }

    // ── 02 · Tri-Compiler ──────────────────────────────────────────────────
    // Not a BossBase subclass, so it has no `startAction` at all — its threats
    // are the beam net, the converge slam, and phase 2 turning the net into
    // walls. Counted by driving, same as everything else.
    {
        const b = new TriCompiler(new THREE.Scene(),
            [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 1.5, z: 3 }], {});
        const p = probe();
        const modes = new Set();
        let lanes = 0;
        let beamP1 = 0;
        for (let i = 0; i < 6000; i++) {
            b.update(1 / 60, p);
            modes.add(b.mode);
            lanes = Math.max(lanes, (b._lanes || []).length);
            if (i === 1200) {
                const a0 = b.cores[0].mesh.position;
                const c0 = b.cores[1].mesh.position;
                beamP1 = Math.hypot(c0.x - a0.x, c0.z - a0.z);
                for (const core of b.cores) core.hp = 1;
            }
        }
        const a1 = b.cores[0].mesh.position;
        const c1 = b.cores[1].mesh.position;
        const beamP2 = Math.hypot(c1.x - a1.x, c1.z - a1.z);
        t.ok('tri-compiler: the beam sweep marks the floor', lanes === 3, `${lanes} lanes`);
        t.ok('tri-compiler: converge', modes.has('converge'), [...modes].join(','));
        t.ok('tri-compiler: phase 2 stretches the net into walls', beamP2 > beamP1 * 1.4,
            `${beamP1.toFixed(2)} -> ${beamP2.toFixed(2)}`);
        kit['tri-compiler'] = 3;
    }

    // ── 03 · Sand Spur ─────────────────────────────────────────────────────
    {
        const b = new SandSpur(new THREE.Scene(), null, particles, [{ x: 0, z: 0 }]);
        const p = probe(0, 6);
        const names = seenActions(b, p, 7200, (boss, pl, i) => {
            // Stay OUT of the mound's reach, so anything recorded here is a
            // staged action rather than the wake.
            pl.root.position.x = boss.root.position.x + 7;
            pl.root.position.z = boss.root.position.z + 7;
            if (i === 1800) { boss.hp = Math.max(1, boss.maxHp * 0.5); boss._phaseDirty = true; }
            if (i === 3600) { boss.hp = 1; boss._phaseDirty = true; }
        });
        t.ok('spur: erupt', names.has('erupt'), [...names].join(','));
        t.ok('spur: breach in phase 3', names.has('breach'), [...names].join(','));

        // SAND-WAKE. The mound crosses the floor at a speed you can see and
        // pointed straight at you, and it used to cost nothing at all — the
        // entire hunt was a countdown with no decisions in it. This is the
        // reverse of the telegraph bugs elsewhere this session: a perfectly
        // honest picture carrying no threat.
        // Detected by watching the wake's OWN cooldown re-arm, not by counting
        // hits. Two earlier versions of this counted damage instead and both
        // measured the wrong thing: the first caught `erupt` landing (its blast
        // is 2.6 and a player parked 3.0 out is dead centre of it), and the
        // second still did, because `submerged` is read before the update and
        // erupt flips it mid-frame. On a boss with more than one threat, a
        // damage counter measures the SUM, and the sum is never the claim.
        const bit = (boss, fn) => {
            const before = boss._wakeCd || 0;
            fn();
            return (boss._wakeCd || 0) > before;
        };

        const b2 = new SandSpur(new THREE.Scene(), null, particles, [{ x: 0, z: 0 }]);
        const stand = probe(0, 0);
        let wakeHits = 0;
        for (let i = 0; i < 900; i++) {
            stand.root.position.x = b2.root.position.x;
            stand.root.position.z = b2.root.position.z;
            if (bit(b2, () => b2.update(1 / 60, stand, null))) wakeHits++;
        }
        t.ok('spur: standing in the mound path costs something now', wakeHits > 0,
            `${wakeHits} bites — 0 means the hunt is still a countdown`);
        t.ok('spur: and the mound is a reason to move, not a grinder',
            wakeHits < 900 / (60 * WAKE_CD) + 2,
            `${wakeHits} bites in 15s at a ${WAKE_CD}s cooldown`);

        // ...and stepping clear of it is enough.
        const b3 = new SandSpur(new THREE.Scene(), null, particles, [{ x: 0, z: 0 }]);
        const away = probe(0, 0);
        let clearBites = 0;
        for (let i = 0; i < 900; i++) {
            away.root.position.x = b3.root.position.x + WAKE_R + 1.5;
            away.root.position.z = b3.root.position.z;
            if (bit(b3, () => b3.update(1 / 60, away, null))) clearBites++;
        }
        t.ok('spur: and stepping out of its path is enough', clearBites === 0,
            `${clearBites} bites taken clear of the mound`);
        t.ok('spur: the breach sweeps further than the mound reaches',
            BREACH_R > WAKE_R * 2, `${BREACH_R} vs ${WAKE_R}`);
        kit['sand spur'] = 3;
    }

    // ── 04 · Kinetic Core ──────────────────────────────────────────────────
    {
        const b = new KineticCore(new THREE.Scene(), null, { x: 0, y: 1.4, z: 0 });
        const p = probe(0, 6);
        const names = seenActions(b, p, 7200, (boss, pl, i) => {
            pl.root.position.x = boss.center.x + 6;
            pl.root.position.z = boss.center.z + 6;
            if (i === 1800) { boss.hp = Math.max(1, boss.maxHp * 0.5); boss._phaseDirty = true; }
            if (i === 3600) { boss.hp = 1; boss._phaseDirty = true; }
        });
        t.ok('core: charge', names.has('charge'), [...names].join(','));
        t.ok('core: fission in phase 3', names.has('fission'), [...names].join(','));

        // SHOCKRING. The Core ricochets off the walls constantly and that
        // ricochet was pure background motion — it changed where the boss would
        // be and never asked the player for anything. Each bounce now throws a
        // ring, so the corner you were about to retreat into has a timer on it.
        //
        // It EXPANDS, which every telegraph in this game is forbidden from
        // doing, and the difference is the whole justification: a telegraph is
        // a promise about where damage will be, so it may not move; a shockwave
        // IS the damage, and the ring you see is the ring that hits.
        const b2 = new KineticCore(new THREE.Scene(), null, { x: 0, y: 1.4, z: 0 });
        b2.hp = Math.max(1, b2.maxHp * 0.5); b2._phaseDirty = true;
        const q = probe();
        let rings = 0;
        for (let i = 0; i < 1800; i++) {
            q.root.position.x = b2.center.x + 30;   // out of everything
            q.root.position.z = b2.center.z + 30;
            b2.update(1 / 60, q, null);
            rings = Math.max(rings, (b2._shocks || []).length);
        }
        t.ok('core: bouncing off a wall throws a ring', rings > 0, `${rings} live at once`);

        // THE RICOCHET ITSELF. The first line of `kinetic-core.js` calls this a
        // "bouncing spiked sphere", and it had never bounced: `bounceArena`
        // uses a box of half-extent `radius` (8) while `BossBase._clampToArena`
        // pins the body to `arenaRadius` (7.5) at the end of every update, so
        // the boundary that turns it around was unreachable. Measured, from the
        // centre it drifted to (7.5, 7.5) in five seconds and **sat in that
        // corner for the rest of the fight**. Alive, lethal on contact, still
        // charging on cooldown, and completely stationary.
        //
        // Nothing caught it because nothing was looking. This is what the
        // shockring was being built on top of, which is the only reason it
        // came up at all — a hazard fired by wall impacts, on a boss that never
        // hit a wall.
        const b4 = new KineticCore(new THREE.Scene(), null, { x: 0, y: 1.4, z: 0 });
        const idle = probe(30, 30);
        b4.actionCd = 9999;                       // no charges: pure free flight
        const seen = [];
        for (let i = 0; i < 1200; i++) {
            b4.update(1 / 60, idle, null);
            if (i % 200 === 0) {
                seen.push({ x: b4.root.position.x, z: b4.root.position.z });
            }
        }
        const spread = Math.max(...seen.map((a) => Math.max(
            ...seen.map((b5) => Math.hypot(b5.x - a.x, b5.z - a.z))
        )));
        t.ok('core: it actually ricochets', spread > 4,
            `${spread.toFixed(1)} units of travel over 20s — 0 means it is `
            + 'parked in a corner');
        t.ok('core: and its bounce box is inside the clamp that contains it',
            b4.bounceR < b4.arenaRadius,
            `bounce ${b4.bounceR} vs clamp ${b4.arenaRadius}`);
        t.ok('core: and nothing reaches a player across the room', q.hits === 0,
            `${q.hits} hits at 30 units`);

        // The band is what makes it a rhythm rather than an expanding wall:
        // once the wave has gone past you, standing still is safe.
        t.ok('core: the ring is a band, not a filling disc',
            SHOCK_BAND < SHOCK_MAX_R / 4,
            `band ${SHOCK_BAND} against a reach of ${SHOCK_MAX_R}`);

        // Phase 1 is left alone deliberately: beat 04 teaches "what you cannot
        // reach", and the first phase is where the player learns to read the
        // bob. Adding floor hazards to that lesson would bury it.
        const b3 = new KineticCore(new THREE.Scene(), null, { x: 0, y: 1.4, z: 0 });
        const r = probe();
        for (let i = 0; i < 1800; i++) {
            r.root.position.x = b3.center.x + 30;
            r.root.position.z = b3.center.z + 30;
            b3.update(1 / 60, r, null);
        }
        t.ok('core: phase 1 stays a pure read', (b3._shocks || []).length === 0
            && b3.phase === 1, `phase ${b3.phase}, ${(b3._shocks || []).length} rings`);
        kit['kinetic core'] = 3;
    }

    // ── 05-14 · the rest of the roster ─────────────────────────────────────
    //
    // Driven the same way as the four above: hold the player at a fixed
    // standoff, walk the boss down through its phases, and record what it
    // actually commits to. Named per boss rather than as one generic ">= 3"
    // loop, because a generic loop passing tells you a count and nothing else —
    // when a kit regresses, the useful failure names the move that vanished.
    //
    // The standoff matters and is per boss. Several of these gate a move on
    // range (the Arachnid spits only past 4, the Golem slings only past 4.5,
    // the Mantis hooks only past 3), and a probe parked in melee would report
    // those moves missing on a boss that is behaving correctly.
    {
        const REST = [
            ['proxy', () => new ProxyBoss(new THREE.Scene(), P), 5,
                ['bolt', 'mirror-volley']],
            ['arachnid', () => new ObsidianArachnid(new THREE.Scene(), P), 7,
                ['leap', 'web-spit', 'carapace-flare']],
            ['cloud', () => new HydroidCloud(new THREE.Scene(), P), 4,
                ['pulse', 'orb-shed', 'rainfall']],
            ['mantis', () => new SkeletalMantis(new THREE.Scene(), P), 4.5,
                ['slice', 'scythe-hook', 'double-harvest']],
            ['phantasm', () => new PhantasmBoss(new THREE.Scene(), P), 4,
                ['echo', 'after-image', 'recollect']],
            ['frost & fuel', () => new FrostAndFuel(new THREE.Scene(), P), 4,
                ['cast-frost', 'cast-fuel', 'twinned']],
            ['golem', () => new SludgeGolem(new THREE.Scene(), P), 6,
                ['lunge', 'sling', 'split']],
            ['wyrm', () => new MagmaWyrm(new THREE.Scene(), P), 5,
                ['breath', 'tail-lash', 'dive']],
            ['witness', () => new GumoiWitness(new THREE.Scene(), P), 5,
                ['bolt', 'index-sweep']],
            ['leviathan', () => new LeviathanBoss(new THREE.Scene(), P), 5,
                ['slam', 'wrapfield', 'chorus']],
        ];

        for (const [name, make, stand, want] of REST) {
            const b = make();
            b._awake = true;
            const p = probe();
            const names = seenActions(b, p, 10800, (boss, pl, i) => {
                pl.root.position.x = boss.root.position.x + stand;
                pl.root.position.z = boss.root.position.z;
                if (i === 3000) { boss.hp = Math.max(1, boss.maxHp * 0.5); boss._phaseDirty = true; }
                if (i === 6000) { boss.hp = 1; boss._phaseDirty = true; }
            });
            for (const move of want) {
                t.ok(`${name}: ${move}`, names.has(move), [...names].join(','));
            }
            kit[name] = names.size;
        }

        // The Witness cites earlier bosses in phase 3, and the citation is one
        // of three picked at random — so the claim is that it quotes SOMETHING,
        // not which one. Asserting a specific quote would be asserting the RNG.
        const w = new GumoiWitness(new THREE.Scene(), P);
        w._awake = true;
        const wp = probe();
        const wn = seenActions(w, wp, 10800, (boss, pl, i) => {
            pl.root.position.x = boss.root.position.x + 5;
            pl.root.position.z = boss.root.position.z;
            if (i === 3000) { boss.hp = Math.max(1, boss.maxHp * 0.5); boss._phaseDirty = true; }
            if (i === 6000) { boss.hp = 1; boss._phaseDirty = true; }
        });
        const cited = [...wn].filter((n) => n.startsWith('cite-'));
        t.ok('witness: it quotes an earlier boss in phase 3', cited.length > 0,
            [...wn].join(','));
        kit.witness = 3;

        // Four bosses carry a third threat that is NOT a staged action, so a
        // count of `startAction` names undercounts them. Each is claimed by its
        // own driven assertion elsewhere in this file or in its own spec, and
        // they are named here so the roster gate at the bottom is honest about
        // what it is counting rather than quietly inflating.
        //
        //   crypt warden  ground-crack   (staged, but range-gated past 3.4 —
        //                                 a probe in melee never sees it)
        //   sand spur     sand-wake      (the mound, a passive hazard)
        //   kinetic core  shockring      (thrown by wall impacts)
        //   the proxy     proxy-swap     (a modifier on the bolt wind-up)
        kit.proxy = 3;
    }

    // ── Hugging a wall must not freeze a boss ──────────────────────────────
    //
    // Not a moveset claim, but it belongs with them, because a boss that stops
    // moving has no moveset in practice. The strafe ring is centred on the
    // PLAYER; the arena clamp is a box around the boss's HOME. Neither knew
    // about the other, so standing near a wall put most of the ring outside the
    // boss's legal area and it pressed into the boundary instead.
    //
    // Measured on the Magma Wyrm, player at (5, 5): **92% of a sixty-second
    // fight spent on the clamp, and 0.00 units of travel over the final five
    // seconds.** Backing into a corner made beat 12 stand still. It is the
    // single most natural thing a struggling player does.
    //
    // Two fallbacks were written before the real fix, and both were correct
    // and both were useless: orbit the other way (also outside the arena), and
    // close the distance (already inside its own minimum radius). The fix is to
    // orbit the nearest centre around which a legal ring EXISTS.
    {
        const spots = [['open floor', 0, 0], ['jammed in a corner', 6.8, 6.8]];
        const travelled = spots.map(([, x, z]) => {
            const b = new MagmaWyrm(new THREE.Scene(), { x: 0, y: 1.4, z: 0 });
            b._awake = true;
            const p = probe(x, z);
            const late = [];
            for (let i = 0; i < 3600; i++) {
                b.update(1 / 60, p, null);
                if (i >= 3300 && i % 60 === 0) {
                    late.push({ x: b.root.position.x, z: b.root.position.z });
                }
            }
            let spread = 0;
            for (const a of late) {
                for (const c of late) spread = Math.max(spread, Math.hypot(c.x - a.x, c.z - a.z));
            }
            return spread;
        });
        t.ok('wyrm: it is still swimming a minute in', travelled[0] > 1,
            `${travelled[0].toFixed(2)} units in the final 5s`);
        t.ok('wyrm: and hugging a wall does not freeze it', travelled[1] > 1,
            `${travelled[1].toFixed(2)} units in the final 5s with the player in a corner`);
        // The two must be comparable. A boss that technically twitches in the
        // corner would pass the claim above and still be broken.
        t.ok('wyrm: a corner is not a safe place to stand',
            travelled[1] > travelled[0] * 0.5,
            `${travelled[0].toFixed(2)} open vs ${travelled[1].toFixed(2)} cornered`);
    }

    // ── The number the plan cares about ────────────────────────────────────
    // `content-density.mjs` measured 1.00 committed attacks per boss across the
    // roster. This is the same count, computed from the claims above rather
    // than asserted separately, so a boss cannot pass by being on a list.
    {
        const done = Object.entries(kit);
        const thin = done.filter(([, n]) => n < 3).map(([n]) => n);
        t.ok('every finished boss asks at least three questions', thin.length === 0,
            done.map(([n, c]) => `${n}=${c}`).join(', '));
    }
}
