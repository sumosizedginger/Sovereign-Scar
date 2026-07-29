// tests/game/boss-lethality.spec.mjs — can each boss actually beat the player?
//
// The suite asks the opposite question everywhere else, because that is the
// failure that blocks a playthrough: `boss-e2e` drives all fourteen and asserts
// each one can be KILLED, `time-to-kill.mjs` measures how long that takes,
// `boss-reach-e2e` proves there is somewhere to stand and still land a blow.
// Nothing asked whether a boss can land one.
//
// It cost beat 02. `TriCompiler` is the only boss that does not extend
// `BossBase`, and it called `this.hitPlayer(...)` anyway — a method it does not
// have. Its single damage line threw on every beam contact, so the Tri-Compiler
// **could not hurt the player at all**, and the suite was green at 2940 with
// that in it. From the chair it is invisible: the throw aborts the update at
// exactly the moment the beam would have connected, which looks precisely like
// a beam that missed. A fight you cannot lose reads as a fight you are good at.
//
// So: every boss, driven with a player glued to it and no ability to dodge,
// must land damage. Trap 5 — the whole roster, not the one that was broken.
//
// WHAT THIS DELIBERATELY DOES NOT CLAIM
//
// Not how much, not how fast, not how fair. Those are tuning, they belong to
// `tests/qa/time-to-kill.mjs`, and pinning them here would make this file fail
// every time a boss is balanced. This asks one question — *is there a damage
// path at all* — and it is the question that was never being asked.

import * as THREE from 'three';
import {
    CryptWarden, TriCompiler, ProxyBoss, ObsidianArachnid, HydroidCloud,
    SkeletalMantis, PhantasmBoss, FrostAndFuel, SludgeGolem, MagmaWyrm,
    GumoiWitness, LeviathanBoss,
} from '../../src/game/bosses/roster.js';
import { SandSpur } from '../../src/game/bosses/sand-spur.js';
import { KineticCore } from '../../src/game/bosses/kinetic-core.js';

const P = { x: 0, y: 1.4, z: 0 };
const particles = { spawn() {}, burst() {}, update() {} };

const ROSTER = [
    ['crypt warden', () => new CryptWarden(new THREE.Scene(), P)],
    ['tri-compiler', () => new TriCompiler(new THREE.Scene(), [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: -3, z: 0 }])],
    ['sand spur', () => new SandSpur(new THREE.Scene(), null, particles, [{ x: 0, z: 0 }])],
    ['kinetic core', () => new KineticCore(new THREE.Scene(), null, P)],
    ['proxy', () => new ProxyBoss(new THREE.Scene(), P)],
    ['obsidian arachnid', () => new ObsidianArachnid(new THREE.Scene(), P)],
    ['hydroid cloud', () => new HydroidCloud(new THREE.Scene(), P)],
    ['skeletal mantis', () => new SkeletalMantis(new THREE.Scene(), P)],
    ['phantasm', () => new PhantasmBoss(new THREE.Scene(), P)],
    ['frost & fuel', () => new FrostAndFuel(new THREE.Scene(), P)],
    ['sludge golem', () => new SludgeGolem(new THREE.Scene(), P)],
    ['magma wyrm', () => new MagmaWyrm(new THREE.Scene(), P)],
    ['gumoi witness', () => new GumoiWitness(new THREE.Scene(), P)],
    ['leviathan', () => new LeviathanBoss(new THREE.Scene(), P)],
];

/** A player who never dodges and never dies — the easiest target there is. */
function sandbag() {
    const p = {
        hits: 0,
        root: { position: { x: 0, y: 1.4, z: 0 } },
        state: { facingVec: { x: 0, z: -1 } },
        dashTimer: 0,
        guard: { blocking: false, broken: false },
        health: {
            hp: 9999, maxHp: 9999, dead: false,
            damage() { p.hits++; return { accepted: true }; },
        },
    };
    return p;
}

export function run(t) {
    const table = [];

    for (const [name, make] of ROSTER) {
        let boss;
        try { boss = make(); } catch (e) {
            t.ok(`${name}: constructs`, false, String(e));
            continue;
        }
        const p = sandbag();
        // Wake anything that gates on proximity, and open anything that gates
        // on phase — a boss that only bites in phase 3 still has to bite.
        boss._awake = true;
        boss.shielded = false;

        let threw = null;
        let firstHitFrame = -1;
        // 60 seconds. Long enough for the slowest cycle in the roster (the
        // Tri-Compiler's is 5.6s, the Spur's burrow loop is longer) to come
        // round several times at every phase.
        for (let i = 0; i < 3600; i++) {
            // Glued to the body. For the multi-core boss that means riding a
            // core, which is where its beams meet.
            const at = boss.cores
                ? boss.cores.find((c) => c.state.current !== 'DEAD')?.mesh.position
                : boss.root?.position;
            if (at) {
                p.root.position.x = at.x;
                p.root.position.z = at.z;
            }
            // Walk it down through its phases so late-phase-only damage counts.
            if (i === 1200 || i === 2400) {
                if (boss.cores) for (const c of boss.cores) c.hp = Math.max(1, c.hp - 1);
                else if (boss.hp != null) boss.hp = Math.max(1, boss.maxHp * (i === 1200 ? 0.6 : 0.25));
                boss._phaseDirty = true;
            }
            try { boss.update(1 / 60, p, null); } catch (e) { threw = e.message; break; }
            if (p.hits > 0 && firstHitFrame < 0) firstHitFrame = i;
        }

        t.ok(`${name}: driving the fight never throws`, threw === null, threw || 'clean');
        t.ok(`${name}: can damage the player`, p.hits > 0,
            `${p.hits} hits in 60s glued to it — 0 means this fight cannot be lost`);
        table.push([name, p.hits, firstHitFrame < 0 ? '—' : (firstHitFrame / 60).toFixed(1)]);
    }

    // Printed, not asserted. The counts are wildly uneven by design — some
    // bosses are contact damage, some are one committed attack a cycle — and
    // pinning them would turn every balance change into a failure here. It is
    // worth SEEING, though: a boss that lands its first blow at 40 seconds is
    // telling you something about its cycle even if it passes.
    const rows = table
        .map(([n, h, s]) => `${n.padEnd(20)} ${String(h).padStart(4)} hits, first at ${s}s`)
        .join('\n      ');
    t.ok('every boss in the roster is lethal', table.every(([, h]) => h > 0),
        `\n      ${rows}`);
}
