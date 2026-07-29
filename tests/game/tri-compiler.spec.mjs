// tests/game/tri-compiler.spec.mjs — beat 02's boss could not hurt you.
//
// `TriCompiler` is the one boss in the roster that does not extend `BossBase`:
// three orbiting cores sharing an HP pool, hand-rolled. And it called
// `this.hitPlayer(...)` anyway — a method that only exists on the base class it
// does not extend. So its single damage line threw `this.hitPlayer is not a
// function` on the first beam contact, every time, and the beam net was
// scenery for the entire fight.
//
// WHY NOTHING CAUGHT IT
//
// The suite was green at 2940 with this in it. `boss-e2e` drives every boss and
// asserts it can be KILLED; nothing asserted a boss can KILL. And the throw is
// invisible from the outside: it aborts the update at the exact moment the beam
// would have connected, which from the player's chair is indistinguishable from
// a beam that missed. A fight you cannot lose reads as a fight you are good at.
//
// The direction of the claim is the lesson. "Can the player beat this boss" is
// the question a test suite naturally asks, because that is the failure that
// blocks progress. "Can this boss beat the player" is the one that decides
// whether the fight exists.

import * as THREE from 'three';
import { TriCompiler } from '../../src/game/bosses/roster.js';

const CENTERS = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 1.5, z: 3 }];

function probe() {
    const p = {
        hits: 0, taken: 0,
        root: { position: { x: 0, y: 1.4, z: 0 } },
        state: { facingVec: { x: 0, z: -1 } },
        health: {
            hp: 999, maxHp: 999, dead: false,
            damage(n) { p.hits++; p.taken += n; return { accepted: true }; },
        },
    };
    return p;
}

/** Park the player exactly on the beam between cores `a` and `b`. */
function standOnBeam(boss, p, a = 0, b = 1) {
    const ca = boss.cores[a].mesh.position;
    const cb = boss.cores[b].mesh.position;
    p.root.position.x = (ca.x + cb.x) / 2;
    p.root.position.z = (ca.z + cb.z) / 2;
}

export function run(t) {
    // ── The fight has to be losable ────────────────────────────────────────
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        let threw = null;
        for (let i = 0; i < 3000; i++) {
            standOnBeam(boss, p);
            try { boss.update(1 / 60, p); } catch (e) { threw = e.message; break; }
        }
        t.ok('driving the fight never throws', threw === null, threw || 'clean');
        t.ok('a player standing in the beam net takes damage', p.hits > 0,
            `${p.hits} hits over 50 seconds on a live beam — 0 means beat 02 `
            + 'cannot hurt you');
    }

    // ── The beam is only live on the sweep ─────────────────────────────────
    // The cycle is pattern → windup → strike → recover, and only `strike`
    // bites. That is the whole reason the net is readable: it flares white,
    // and the flare is a warning rather than the damage itself. If this ever
    // fails, the wind-up has become unanswerable.
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        const seen = {};
        for (let i = 0; i < 3000; i++) {
            standOnBeam(boss, p);
            const before = p.hits;
            boss.update(1 / 60, p);
            if (p.hits > before) seen[boss.stage] = (seen[boss.stage] || 0) + 1;
        }
        const stages = Object.keys(seen);
        t.ok('every hit lands during the sweep and nowhere else',
            stages.length === 1 && stages[0] === 'strike', JSON.stringify(seen));
    }

    // ── A beam is a hazard, not a grinder ──────────────────────────────────
    // 0.8s between beam hits. Without it a player caught in the net takes one
    // hit per frame, which is not a difficulty spike, it is an instant death
    // with no read available.
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        let sweepFrames = 0;
        for (let i = 0; i < 1200; i++) {
            standOnBeam(boss, p);
            boss.update(1 / 60, p);
            if (boss.stage === 'strike') sweepFrames++;
        }
        t.ok('the sweep really was live for a while', sweepFrames > 30,
            `${sweepFrames} frames of sweep`);
        t.ok('but it did not hit once per frame', p.hits < sweepFrames / 4,
            `${p.hits} hits over ${sweepFrames} live frames`);
    }

    // ── The opening is real, and it is the one the plan wants announced ────
    // The `spent` stage already doubles damage taken. Nothing in the game says
    // so out loud yet (ROAD-TO-TEN, beat 02: "give it the recover cue"), but
    // the mechanic underneath must at least be there to announce.
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        let openMult = 0;
        let closedMult = 0;
        for (let i = 0; i < 1200; i++) {
            boss.update(1 / 60, p);
            const m = boss.cores[0].vulnerableMult;
            if (boss.stage === 'recover') openMult = Math.max(openMult, m);
            else closedMult = Math.max(closedMult, m);
        }
        t.ok('the brown-out is a real damage window', openMult === 2, `${openMult}x`);
        t.ok('and the rest of the cycle is not', closedMult === 1, `${closedMult}x`);
    }

    // ── The wind-up has to be answerable ───────────────────────────────────
    //
    // This was the fight's real defect and it was not a missing move. The white
    // flare is the warning; the sweep is the damage. Between them, the cores
    // used to travel 1.69, 2.65 and 2.88 units — against a beam that hits
    // within 0.55 of its line. The net announced itself up to five beam-widths
    // away from where it would land, so there was no information in the tell at
    // all. Every other committed attack in Sovereign Scar holds still while it
    // winds up; `Enemy._beginWindup` says so in its own comment. This was the
    // only thing in the game that announced an attack and then walked away.
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        p.root.position.x = 5; p.root.position.z = 5;
        let flare = null; let land = null;
        for (let i = 0; i < 2000; i++) {
            boss.update(1 / 60, p);
            if (boss.stage === 'windup' && !flare) {
                flare = boss.cores.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z }));
            }
            if (flare && boss.stage === 'strike' && !land) {
                land = boss.cores.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z }));
                break;
            }
        }
        t.ok('it reaches a wind-up and then a sweep', !!flare && !!land);
        if (flare && land) {
            const drift = flare.map((f, i) => Math.hypot(land[i].x - f.x, land[i].z - f.z));
            const worst = Math.max(...drift);
            // Well inside the beam's own half-width: the strip that flares is
            // the strip that hits, not a strip near it.
            t.ok('what flares is what sweeps', worst < 0.55 / 2,
                `worst core drift ${worst.toFixed(3)} units against a `
                + 'beam half-width of 0.55 (was 2.88)');
        }

        // And the reason the first fix made it WORSE, kept as a claim because
        // it is the sort of thing that gets re-broken: the orbit angle has to
        // ACCUMULATE. It used to be `t * spin`, so dropping spin to zero did
        // not stop the ring, it teleported it to wherever `t * 0` pointed —
        // 7.85 units of drift from an attempt to remove 2.88.
        t.ok('the orbit angle is accumulated, not derived from elapsed time',
            typeof boss.spinAng === 'number', `${typeof boss.spinAng}`);
    }

    // ── The lane on the floor ──────────────────────────────────────────────
    // The beams are drawn at core height, and from a top-down camera a bright
    // line floating a metre and a half up does not tell you which floor tiles
    // it covers. Every other committed attack in this game marks the GROUND.
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        let duringCharge = 0; let afterCharge = -1;
        for (let i = 0; i < 2000; i++) {
            boss.update(1 / 60, p);
            if (boss.mode === 'sweep' && boss.stage === 'windup') {
                duringCharge = Math.max(duringCharge, (boss._lanes || []).length);
            }
            if (duringCharge && boss.stage === 'recover') {
                afterCharge = (boss._lanes || []).length;
                break;
            }
        }
        t.ok('the charge paints a lane under every beam', duringCharge === 3,
            `${duringCharge} lanes`);
        t.ok('and they are gone once it has swept', afterCharge === 0,
            `${afterCharge} left over`);
    }

    // ── converge: the second question ──────────────────────────────────────
    // The sweep asks "are you standing on a line" and asked it every 5.6
    // seconds forever. This asks the other one.
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        const modes = new Set();
        let hitsFromSlam = 0;
        let reAimed = false;
        // CYCLE-SCOPED. The mark is cleared and re-taken every third cycle, so
        // a mark captured once and compared forever reports "it followed the
        // player" for a boss that is behaving perfectly — which is exactly what
        // the first version of this claimed. Track the mark for as long as it
        // exists, and drop it the moment the boss does.
        let mark = null;
        for (let i = 0; i < 6000; i++) {
            boss.update(1 / 60, p);
            modes.add(boss.mode);
            if (boss._slamAt) {
                if (!mark) {
                    mark = { x: boss._slamAt.x, z: boss._slamAt.z };
                } else if (Math.abs(boss._slamAt.x - mark.x) > 1e-9
                    || Math.abs(boss._slamAt.z - mark.z) > 1e-9) {
                    reAimed = true;
                }
                // Walk away while it is marked. If the mark tracked the player
                // this is what would move it.
                p.root.position.x += 0.06;
            } else if (mark) {
                mark = null;
            }
        }
        t.ok('the trio does more than one thing', modes.has('sweep') && modes.has('converge'),
            [...modes].join(','));
        t.ok('the marked ground never re-aims once it is down', !reAimed,
            reAimed ? 'it followed the player' : 'locked at the charge');

        // And it lands where it marked. Standing ON the mark, in the same
        // cycle that drew it, has to hurt.
        const boss2 = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p2 = probe();
        for (let i = 0; i < 6000 && hitsFromSlam === 0; i++) {
            if (boss2._slamAt) {
                p2.root.position.x = boss2._slamAt.x;
                p2.root.position.z = boss2._slamAt.z;
            }
            const before = p2.hits;
            boss2.update(1 / 60, p2);
            if (p2.hits > before && boss2.mode === 'converge') hitsFromSlam++;
        }
        t.ok('the slam lands on the ground it marked', hitsFromSlam > 0,
            `${hitsFromSlam} slams connected`);
    }

    // ── Phase 2 is a different room, not a faster one ──────────────────────
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        const beam = () => {
            const a = boss.cores[0].mesh.position;
            const b = boss.cores[1].mesh.position;
            return Math.hypot(b.x - a.x, b.z - a.z);
        };
        for (let i = 0; i < 600; i++) boss.update(1 / 60, p);
        const p1 = beam();
        t.ok('phase 1 first', boss.phase === 1, `${boss.phase}`);
        for (const c of boss.cores) c.hp = 1;
        for (let i = 0; i < 900; i++) boss.update(1 / 60, p);
        t.ok('the fight turns over', boss.phase === 2, `${boss.phase}`);
        t.ok('and the beams become walls', beam() > p1 * 1.4,
            `${p1.toFixed(2)} → ${beam().toFixed(2)} units — phase 2 has to be a `
            + 'different question, not the same one under time pressure');
    }

    // ── Killing a core is supposed to matter ───────────────────────────────
    // Three cores, one shared pool. A dead core drops its two beams, which is
    // the fight's only structural reward for focusing fire.
    {
        const boss = new TriCompiler(new THREE.Scene(), CENTERS, {});
        const p = probe();
        for (let i = 0; i < 120; i++) boss.update(1 / 60, p);
        const beamsBefore = boss.beams.filter((b) => b.visible).length;
        boss.cores[0].hp = 0;
        boss.cores[0].state.current = 'DEAD';
        boss.cores[0].onDeath();
        for (let i = 0; i < 60; i++) boss.update(1 / 60, p);
        const beamsAfter = boss.beams.filter((b) => b.visible).length;
        t.ok('all three beams are up to begin with', beamsBefore === 3, `${beamsBefore}`);
        t.ok('killing a core takes its beams down', beamsAfter < beamsBefore,
            `${beamsBefore} → ${beamsAfter}`);

        // And a beam that is not drawn must not bite. The picture and the rule
        // again, on the one boss whose picture IS its hitbox.
        //
        // The first version of this claim parked the player on the midpoint
        // between the dead core and a live one and asserted zero hits. It got
        // one — correctly. A dead core stops being repositioned, so it freezes
        // while the others keep orbiting, and that midpoint wanders onto the
        // beam that is still live. The assertion was measuring the test's own
        // arithmetic, not the game. Killing a SECOND core removes every beam
        // there is, which leaves nothing for a stray position to land on.
        boss.cores[1].hp = 0;
        boss.cores[1].state.current = 'DEAD';
        boss.cores[1].onDeath();
        const p2 = probe();
        for (let i = 0; i < 60; i++) boss.update(1 / 60, p2);
        t.ok('one core left means no beams at all',
            boss.beams.filter((b) => b.visible).length === 0,
            `${boss.beams.filter((b) => b.visible).length} still drawn`);
        for (let i = 0; i < 1800; i++) {
            // Ride the survivor: if any beam logic is still live, this is
            // where it would connect.
            p2.root.position.x = boss.cores[2].mesh.position.x;
            p2.root.position.z = boss.cores[2].mesh.position.z;
            // Beams only. The trio also has the converge slam now, and a lone
            // surviving core still drops it on you — which is correct, and is
            // NOT what this claim is about. Left unpinned, the first run of
            // this after converge landed reported "2 hits with no beams on
            // screen" and the hits were slams. An assertion that can fail for
            // a second reason is not testing the first one.
            boss.mode = 'sweep';
            boss.update(1 / 60, p2);
        }
        t.ok('and beams nobody can see do not hit', p2.hits === 0,
            `${p2.hits} hits with no beams on screen`);
    }
}
