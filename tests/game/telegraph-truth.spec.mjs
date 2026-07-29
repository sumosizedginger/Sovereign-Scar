// tests/game/telegraph-truth.spec.mjs — the picture and the rule are one shape.
//
// This game's entire combat design rests on one promise, written down in
// `docs/CONTROLS.md`: every attack is telegraphed, and reading the telegraph is
// the answer. A telegraph that is drawn one size and resolved another breaks
// that promise silently. There is no crash, no failing assertion, and no bug
// report more specific than "the boss feels unfair" — which is the kind of
// complaint that gets answered by nerfing damage instead of fixing the lie.
//
// THREE OF THEM SHIPPED. `BossBase.startAction` forwarded only the shape
// parameters the first two telegraph shapes happened to need, so every boss
// that authored a `halfAngle` or an `innerRadius` had it dropped on the floor
// and drew the default instead:
//
//   Skeletal Mantis  slice   drew 90°   hit at 137°   under-drawn by 24° a side
//   Magma Wyrm       breath  drew 90°   hit at  52°   over-drawn by 19° a side
//   Crypt Warden     sweep   drew 90°   hit at 120°   under-drawn by 15° a side
//   Crypt Warden     crack   drew a 3.83 safe hole against a real one of 3.40
//
// The under-drawn ones hit you on ground the game painted safe. The over-drawn
// one is not the merciful version: ground painted lethal that turns out to be
// safe teaches the player that the telegraphs here are approximate, and then
// the honest ones stop being trusted too.
//
// WHAT THIS FILE ASSERTS, AND WHY IT IS SHAPED THIS WAY
//
// Not "the call site passes halfAngle" — that is a restatement of the fix and
// would pass on a build where `inCone` ignored the argument. It drives each
// boss until it commits, reads the wedge that was actually DRAWN out of the
// telegraph geometry, and then asks the boss's own `strike` whether a player
// standing a hair inside that edge is hit, and one standing a hair outside is
// not. Whatever the mechanism, the floor and the damage have to agree.
//
// Trap 5: this sweeps every cone in the roster, not the one that was broken.

import * as THREE from 'three';
import { CryptWarden, SkeletalMantis, MagmaWyrm } from '../../src/game/bosses/roster.js';
import { Enemy } from '../../src/game/enemy.js';
import { TELL_BAND, TELL_SAFE } from '../../src/game/bosses/base.js';

/** A player that records whether it was struck, and can be teleported. */
function probe() {
    const p = {
        hits: 0,
        root: { position: { x: 0, y: 1.95, z: 4 } },
        state: { facingVec: { x: 0, z: -1 } },
        health: {
            hp: 99, maxHp: 99, dead: false,
            damage() { p.hits++; return { accepted: true }; },
        },
    };
    return p;
}

/**
 * Drive `boss` until it commits an action named `want`, then hand back the
 * telegraph it drew and the committed definition.
 *
 * Ticking rather than calling `startAction` directly is deliberate: it proves
 * the shape reaches the floor through the path the game actually uses. A boss
 * that only draws correctly when a test builds its action by hand is a boss
 * that draws incorrectly in the game.
 */
function commit(boss, player, want, prep, hold) {
    if (prep) prep(boss);
    for (let i = 0; i < 4000; i++) {
        if (hold) hold(boss, player);
        boss.update(1 / 60, player, null);
        const a = boss.action;
        if (a && a.stage === 'windup' && a.def.name === want && boss._telegraph) {
            return { tg: boss._telegraph, def: a.def, aim: a.aim };
        }
    }
    return null;
}

/** Put the player at `r` units from the boss, `ang` radians off its aim. */
function place(player, origin, dir, r, ang) {
    const base = Math.atan2(dir.z, dir.x);
    player.root.position.x = origin.x + Math.cos(base + ang) * r;
    player.root.position.z = origin.z + Math.sin(base + ang) * r;
}

/**
 * The one claim, applied to any cone: the edge of the wedge on the floor is the
 * edge of the wedge that hurts.
 */
function checkCone(t, label, boss, player, want, prep) {
    const c = commit(boss, player, want, prep);
    t.ok(`${label}: it commits and draws something`, !!c, want);
    if (!c) return;

    const geo = c.tg.geometry;
    t.ok(`${label}: the telegraph is a wedge`, geo.type === 'CircleGeometry', geo.type);

    const drawnHalf = geo.parameters.thetaLength / 2;
    const drawnR = geo.parameters.radius;
    const dir = c.aim.dir;
    const origin = { x: c.aim.x, z: c.aim.z };
    // Well inside the reach so the radius is never what decides it — this claim
    // is about the ANGLE, and a test that could fail for two reasons tells you
    // about neither.
    const r = drawnR * 0.6;

    player.hits = 0;
    place(player, origin, dir, r, drawnHalf - 0.05);
    c.def.strike(player, c.aim, null);
    t.ok(`${label}: inside the drawn edge is hit`, player.hits === 1,
        `drew ±${(drawnHalf * 180 / Math.PI).toFixed(1)}°, stood at `
        + `${((drawnHalf - 0.05) * 180 / Math.PI).toFixed(1)}° and took ${player.hits}`);

    player.hits = 0;
    place(player, origin, dir, r, drawnHalf + 0.05);
    c.def.strike(player, c.aim, null);
    t.ok(`${label}: outside the drawn edge is not`, player.hits === 0,
        `drew ±${(drawnHalf * 180 / Math.PI).toFixed(1)}°, stood at `
        + `${((drawnHalf + 0.05) * 180 / Math.PI).toFixed(1)}° and took ${player.hits}`);

    // And straight behind, which is the answer every cone in this game is
    // asking for. If this ever fails the wedge has been drawn as a disc.
    player.hits = 0;
    place(player, origin, dir, r, Math.PI);
    c.def.strike(player, c.aim, null);
    t.ok(`${label}: directly behind it is safe`, player.hits === 0,
        'getting behind a cone is the whole read');
}

export function run(t) {
    // ── Skeletal Mantis — slice ────────────────────────────────────────────
    // Beat 08's stated theme is "Lock on, then circle — that is how you get
    // behind armour." Its own boss was hitting 24° a side outside the wedge it
    // showed, which is precisely the read the dungeon spends four rooms
    // teaching.
    {
        const m = new SkeletalMantis(new THREE.Scene(), { x: 0, z: 0 });
        checkCone(t, 'mantis slice', m, probe(), 'slice');
    }

    // ── Magma Wyrm — breath ────────────────────────────────────────────────
    // The narrow one, and the one that was over-drawn. It also lays a burning
    // lane along the same direction, so the wedge doubles as a map of where the
    // floor is about to be on fire — a second reason it has to be honest.
    {
        const w = new MagmaWyrm(new THREE.Scene(), { x: 0, z: 0 });
        checkCone(t, 'wyrm breath', w, probe(), 'breath');
    }

    // ── Crypt Warden — sweep ───────────────────────────────────────────────
    // The first cone the player ever sees, on the boss that is teaching them
    // that telegraphs can be trusted at all.
    {
        const c = new CryptWarden(new THREE.Scene(), { x: 0, z: 0 });
        checkCone(t, 'warden sweep', c, probe(), 'sweep', (b) => { b._awake = true; });
    }

    // ── The ring, which is the same claim about a different shape ──────────
    // `inRing` is the only hit test in the game whose safe ground is its
    // centre, so the annulus it draws has to have a real hole in it. A ring
    // drawn with the default hole (45% of the outer radius) against an
    // authored inner edge is a boss that hits you for standing where it told
    // you to stand — worse than the cone case, because the instruction was to
    // move TOWARD it.
    {
        const c = new CryptWarden(new THREE.Scene(), { x: 0, z: 0 });
        const p = probe();
        // Phase 2 has to be earned, not assigned: `update` re-derives the phase
        // from HP every frame, so setting `phase = 2` is overwritten before the
        // boss ever chooses. And the Warden stalks, so the player is held out
        // past the safe hole each frame — otherwise the boss walks into range
        // where this move is correctly never offered, and the test would report
        // "it never drew one" as though the telegraph were broken.
        const got = commit(c, p, 'ground-crack',
            (b) => { b._awake = true; b.hp = b.maxHp * 0.4; },
            (b, pl) => {
                pl.root.position.x = b.root.position.x;
                pl.root.position.z = b.root.position.z + 6;
            });
        t.ok('warden crack: it commits and draws something', !!got);
        if (got) {
            const par = got.tg.geometry.parameters;
            t.ok('warden crack: the telegraph is an annulus',
                got.tg.geometry.type === 'RingGeometry', got.tg.geometry.type);

            const origin = { x: got.aim.x, z: got.aim.z };
            const at = (r) => {
                p.hits = 0;
                p.root.position.x = origin.x;
                p.root.position.z = origin.z + r;
                got.def.strike(p, got.aim, null);
                return p.hits;
            };
            t.ok('warden crack: the drawn hole is safe', at(par.innerRadius - 0.05) === 0,
                `hole drawn at ${par.innerRadius}`);
            t.ok('warden crack: just outside the drawn hole is not',
                at(par.innerRadius + 0.05) === 1, `hole drawn at ${par.innerRadius}`);
            t.ok('warden crack: just inside the drawn outer edge hurts',
                at(par.outerRadius - 0.05) === 1, `edge drawn at ${par.outerRadius}`);
            t.ok('warden crack: past the drawn outer edge is safe again',
                at(par.outerRadius + 0.05) === 0, `edge drawn at ${par.outerRadius}`);

            // ── The colour rule, and the second honesty claim ───────────
            //
            // Owner's call 2026-07-27: a ring means the opposite of a circle,
            // so it must not look like one. The band is TELL_BAND and the
            // casting boss's tint is IGNORED — a shape whose instruction is
            // reversed cannot be something fourteen kit authors each re-colour
            // to taste, or the one telegraph in the game that means "get in"
            // ends up wearing thirteen different shades of the colour that
            // means "get out".
            t.ok('warden crack: the band is the reversed-instruction red',
                got.tg.material.color.getHex() === TELL_BAND,
                `#${got.tg.material.color.getHex().toString(16)} vs `
                + `#${TELL_BAND.toString(16)}`);

            // And the safe disc is a telegraph too, so it obeys the same law as
            // everything else in this file: what it paints must be what is
            // true. A "stand here" marker drawn any bigger than the real hole
            // is the worst possible version of this bug — it does not merely
            // fail to warn, it actively sends the player into the band.
            const safe = c._telegraphSafe;
            t.ok('warden crack: the safe centre is marked, not merely absent', !!safe,
                'a dark gap reads as a pit as easily as a refuge');
            if (safe) {
                t.ok('warden crack: the safe marker is the stand-here colour',
                    safe.material.color.getHex() === TELL_SAFE,
                    `#${safe.material.color.getHex().toString(16)}`);
                // Compared against the BAND'S OWN hole, not against an imported
                // constant. The assertions above already tied that hole to the
                // ground the strike spares, so chaining to it here means the
                // stand-here marker is pinned to verified-safe ground rather
                // than to a number this file restates.
                t.ok('warden crack: and it is exactly as big as the safe hole',
                    Math.abs(safe.geometry.parameters.radius - par.innerRadius) < 1e-9,
                    `marked ${safe.geometry.parameters.radius}, hole ${par.innerRadius}`);
                t.ok('warden crack: the two colours are not the same colour',
                    TELL_BAND !== TELL_SAFE);
                // It must not travel with the band. A refuge that is still
                // arriving is not a refuge, and the player has to be able to
                // aim at it from the first frame of the wind-up.
                // NEITHER of them moves, and that is the design, arrived at by
                // opening the capture rather than by reasoning. The band used
                // to travel outward — which sounds like the perfect way to say
                // "come inward" and is not, because scaling an annulus scales
                // both edges, so early in the wind-up the band sat entirely
                // inside the refuge and painted it red. A player obeying the
                // colour would have run out of the only safe ground there was.
                // The size is a claim about where the blow lands, and a claim
                // may not be wrong for the first half of its life.
                const bandBefore = c._telegraph.scale.x;
                const safeBefore = safe.scale.x;
                for (let i = 0; i < 30; i++) c.update(1 / 60, p, null);
                t.ok('warden crack: the refuge never moves',
                    !!c._telegraphSafe && Math.abs(c._telegraphSafe.scale.x - safeBefore) < 1e-6,
                    'you have to be able to aim at it from the first frame');
                t.ok('warden crack: and neither does the band',
                    !!c._telegraph && Math.abs(c._telegraph.scale.x - bandBefore) < 1e-6,
                    c._telegraph ? `${c._telegraph.scale.x.toFixed(3)}` : 'gone');
                t.ok('warden crack: the band is full size from the first frame',
                    Math.abs(bandBefore - 1) < 1e-6,
                    `${bandBefore.toFixed(3)} — a band drawn small covers the refuge`);
                // The refuge is what carries the rising tension instead.
                t.ok('warden crack: the refuge brightens as the strike closes',
                    c._telegraphSafe.material.opacity > safe.material.opacity - 1e-9,
                    'the thing getting louder should be the thing to run to');
            }
        }
    }

    // ── The same claim about the other 119 fights ──────────────────────────
    //
    // Bosses are fourteen encounters. `Enemy` is every other one, and its own
    // telegraph carries the game's first coaching line, verbatim:
    //
    //   "That ring is where the blow will land, not where it started."
    //
    // It was not, for two independent reasons.
    //
    //  1. `_beginWindup` drew the marker 0.9 units AHEAD of the body while
    //     `_resolveMelee` measured from the body CENTRE — two discs of equal
    //     size half a body apart. A player behind a sentinel was hit on ground
    //     nothing had marked; a player at the far edge of the marked ground was
    //     not hit at all. The option that did it was called `reach`, which in
    //     every other line of that class means melee reach, so 0.9 looked
    //     correct at both sites that passed it. It is `offset` now, and melee
    //     passes none.
    //  2. Even with the offset gone, the body is nudged ~0.29 units by
    //     separation inside the very update that commits the attack, so
    //     "measure from the body at strike time" was never the same point as
    //     "the ground that was painted".
    //
    // The fix is to remember the marked ground as data on the ATTACK, and
    // resolve against that. Which is also where this section earns its keep:
    //
    // THIS MUST BE DRIVEN, NOT POKED. The first version of the fix stored the
    // mark next to the ring mesh, and a ring's life is exactly the wind-up — so
    // it had already been disposed on the frame the strike resolved, and the
    // change did nothing in the running game. A spec that called the resolver
    // by hand while the ring was still up reported it working. So the enemy is
    // ticked from commit all the way through resolution, with the player parked
    // on ground that is inside the RING and outside a body-centred disc of the
    // same radius. That one position is the whole difference between the two
    // implementations, and nothing short of a real wind-up reaches it.
    {
        /** Commit a sentinel and hand back the ring it painted. */
        const armed = () => {
            const e = new Enemy(new THREE.Scene(), null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
            const p = probe();
            p.root.position.x = 0;
            p.root.position.z = 0.7;
            for (let i = 0; i < 600; i++) {
                e.update(1 / 60, p, null);
                if (e._pendingStrike && e._tell) break;
            }
            if (!e._pendingStrike || !e._tell) return null;
            return {
                e, p,
                mark: {
                    x: e._tell.position.x,
                    z: e._tell.position.z,
                    r: e._tell.geometry.parameters.outerRadius,
                },
                bodyZ: e.rig.position.z,
            };
        };
        /** Park the player at `z` and let the wind-up run out for real. */
        const resolveWith = (a, z) => {
            a.p.root.position.x = a.mark.x;
            a.p.root.position.z = z;
            a.p.hits = 0;
            for (let k = 0; k < 400 && a.e._pendingStrike; k++) a.e.update(1 / 60, a.p, null);
            return a.p.hits;
        };

        const first = armed();
        t.ok('enemy: a sentinel commits and marks the ground', !!first);

        if (first) {
            t.ok('enemy: the marker is filled, not a donut',
                first.e._tell.geometry.parameters.innerRadius < 0.05,
                `inner ${first.e._tell.geometry.parameters.innerRadius} — `
                + 'the middle of a marker is its safest-looking spot');

            // The marker and the body are NOT at the same place. If this ever
            // stops being true the rest of this section stops testing anything,
            // because every position would answer the same under either rule.
            const drift = Math.abs(first.mark.z - first.bodyZ);
            t.ok('enemy: the marker and the body are not the same point',
                drift > 0.05,
                `${drift.toFixed(2)} units apart — this gap is what the fix is about`);

            t.ok('enemy: the middle of the marker is hit',
                resolveWith(armed(), first.mark.z) === 1);
            t.ok('enemy: the far edge of the marker is hit',
                resolveWith(armed(), first.mark.z + first.mark.r - 0.05) === 1,
                `ring r=${first.mark.r.toFixed(2)}, body ${drift.toFixed(2)} behind it`);
            t.ok('enemy: just outside the marker is not',
                resolveWith(armed(), first.mark.z + first.mark.r + 0.20) === 0,
                `ring r=${first.mark.r.toFixed(2)}`);
            // The direction that used to be wrong: the marker was shoved
            // forward, so behind the enemy was lethal and unpainted.
            t.ok('enemy: the back edge of the marker is hit too',
                resolveWith(armed(), first.mark.z - (first.mark.r - 0.05)) === 1);
            t.ok('enemy: just outside the back is not',
                resolveWith(armed(), first.mark.z - (first.mark.r + 0.20)) === 0);
        }
    }
}
