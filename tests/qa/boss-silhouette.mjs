// tests/qa/boss-silhouette.mjs — does each boss's hitbox match its body?
//
//   node tests/qa/boss-silhouette.mjs
//
// `measureBody()` has existed in `boss-models.js` since the voxel boss rebuild,
// carrying a docstring that says "Bosses derive hitRadius from this rather than
// carrying a hand-written number, for the same reason enemies do: the number and
// the body must be the same claim."
//
// Nothing has ever called it. Every boss carries a hand-written number.
//
// THIS IS NOT THE GATE, AND DOES NOT WANT TO BE. `tests/game/boss-bodies.spec.mjs`
// already asserts that every boss's hitbox describes its body, and does it better
// than this can: a p85 horizontal radius (so one outlying scythe cannot set the
// whole number) measured after two seconds of ticking, with documented
// exemptions for the Sand Spur and the Magma Wyrm. ROAD-TO-TEN's phase B asks
// for `measureBody` to be "wired in as a bake-time assertion"; that assertion
// already exists under a different name, and duplicating it with a cruder
// measurement would only produce a second opinion nobody asked for.
//
// What this adds is the OTHER lens — whole-silhouette extents, printed cold and
// running side by side, so it is visible which bosses change size at runtime.
// That is the thing worth knowing before phase B starts adding actions that
// scale and reposition bodies: a boss whose peak is triple its cold radius has
// a size that is a runtime property, and any new action has to respect it.
//
// WHAT THE NUMBERS MEAN
//
//   measured  half the larger of the body's world-space X/Z extents, i.e. the
//             radius of the circle that just contains the silhouette from above
//   authored  the `hitRadius` the boss actually fights with
//   ratio     authored / measured
//
// Neither extreme is automatically right, which is why this prints rather than
// asserts. A boss with long thin legs or a wide sweeping tail SHOULD have a
// hitbox tighter than its silhouette — you are meant to hit the body, not the
// shadow. What must not happen is authored >> measured (a hitbox reaching past
// the model into thin air) or authored so small the visible mass is unhittable.
//
// WHY IT MEASURES A RUNNING BOSS, NOT A FRESH ONE
//
// The first version of this measured straight after `new`, and reported the
// Hydroid Cloud's hitbox as 2.74x its body — by far the worst number in the
// table, and completely false. The Cloud is a swarm: its twelve orbs are all
// constructed AT THE ORIGIN and only fly apart in `tickAI`, where the spread
// runs 1.2–2.0 and oscillates with `sin(t)`. A freshly-built Cloud is twelve
// spheres in a heap, which is not a silhouette anybody ever fights.
//
// So every boss is ticked for a second first, and the number reported is the
// PEAK radius over that window — bodies here pulse, orbit and rear up, and the
// hitbox has to be right at the top of the swing, not on average. The cold
// figure is printed alongside, because a big gap between them is itself worth
// seeing: it means the boss's real size is a runtime property.

import * as THREE from 'three';
import { measureBody } from '../../src/game/bosses/boss-models.js';
import {
    CryptWarden, TriCompiler, ProxyBoss, ObsidianArachnid, HydroidCloud,
    SkeletalMantis, PhantasmBoss, FrostAndFuel, SludgeGolem, MagmaWyrm,
    GumoiWitness, LeviathanBoss,
} from '../../src/game/bosses/roster.js';
import { SandSpur } from '../../src/game/bosses/sand-spur.js';
import { KineticCore } from '../../src/game/bosses/kinetic-core.js';
import { CollisionWorld } from '../../src/engine/collision.js';

const scene = () => new THREE.Scene();
const at = { x: 0, z: 0 };
const ring = [{ x: -5, z: -4 }, { x: 5, z: -4 }, { x: 5, z: 4 }, { x: -5, z: 4 }];

/** Each boss with its real constructor, in campaign order. */
const ROSTER = [
    ['01 Crypt Warden', () => new CryptWarden(scene(), { ...at })],
    ['02 Tri-Compiler', () => new TriCompiler(scene(), ring.slice(0, 3))],
    ['03 Sand Spur', () => new SandSpur(scene(), new CollisionWorld(), null, ring)],
    ['04 Kinetic Core', () => new KineticCore(scene(), new CollisionWorld(), { ...at }, {})],
    ['05 The Proxy', () => new ProxyBoss(scene(), { x: 0, y: 1.5, z: 0 })],
    ['06 Obsidian Arachnid', () => new ObsidianArachnid(scene(), { ...at })],
    ['07 Hydroid Cloud', () => new HydroidCloud(scene(), { ...at })],
    ['08 Skeletal Mantis', () => new SkeletalMantis(scene(), { ...at })],
    ['09 Phantasm', () => new PhantasmBoss(scene(), { ...at })],
    ['10 Frost & Fuel', () => new FrostAndFuel(scene(), { ...at })],
    ['11 Sludge Golem', () => new SludgeGolem(scene(), { ...at })],
    ['12 Magma Wyrm', () => new MagmaWyrm(scene(), { ...at })],
    ['13 GUMOI Witness', () => new GumoiWitness(scene(), { ...at })],
    ['14 Leviathan Core', () => new LeviathanBoss(scene(), { ...at })],
];

const rows = [];
for (const [name, make] of ROSTER) {
    let boss;
    try {
        boss = make();
    } catch (e) {
        rows.push({ name, error: e.message });
        continue;
    }
    const root = boss.root || boss.mesh;
    if (!root) { rows.push({ name, error: 'no root' }); continue; }
    const cold = measureBody(root);

    // Run it. A player is parked at melee range so distance-gated behaviour
    // engages; `_awake` is forced because the Warden gates its whole tick on it.
    const player = {
        root: { position: { x: 0, y: 1.95, z: 4 } },
        health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
        state: { facingVec: { x: 0, z: -1 } },
    };
    boss._awake = true;
    let peak = cold.radius, height = cold.height;
    for (let i = 0; i < 60; i++) {
        try { boss.tickAI?.(1 / 60, player, null); } catch (_) { /* needs a fuller game ctx */ }
        boss.t = (boss.t || 0) + 1 / 60;
        const m = measureBody(root);
        if (m.radius > peak) peak = m.radius;
        if (m.height > height) height = m.height;
    }

    rows.push({
        name,
        cold: cold.radius,
        measured: peak,
        height,
        // TriCompiler is not a BossBase subclass and carries no hitRadius at
        // all — it is hit through its three orbiting cores instead. Recorded
        // as a finding rather than crashed on.
        authored: boss.hitRadius,
        contact: boss.contactRadius,
        ratio: boss.hitRadius != null ? boss.hitRadius / (peak || 1) : null,
    });
}

const num = (v, w) => (v == null ? '—' : v.toFixed(2)).padStart(w);

console.log('\n=== boss hitbox vs body silhouette ===');
console.log('  measured = radius of the circle containing the body from above');
console.log('  authored = the hitRadius it actually fights with\n');
console.log('  boss                      cold    peak  height  authored  contact   ratio  picture');
for (const r of rows) {
    if (r.error) { console.log(`  ${r.name.padEnd(22)}  ERROR: ${r.error}`); continue; }
    // 20 columns = 2x the measured radius; '#' marks where the hitbox ends.
    const bar = r.ratio == null
        ? 'no hitRadius — hit through its cores'
        : Array.from({ length: 21 }, (_, i) => {
            const col = Math.max(0, Math.min(20, Math.round(r.ratio * 10)));
            return i === col ? '#' : (i === 10 ? '|' : '.');
        }).join('');
    console.log(
        `  ${r.name.padEnd(22)}  ${num(r.cold, 6)}  ${num(r.measured, 6)}`
        + `  ${num(r.height, 6)}  ${num(r.authored, 8)}`
        + `  ${num(r.contact, 7)}  ${num(r.ratio, 6)}  ${bar}`
    );
}
console.log('\n  ("|" is parity: hitbox exactly the silhouette. Left = tighter than the');
console.log('   body, which is usually right. Right = the hitbox reaches past the model.)');

const over = rows.filter((r) => !r.error && r.ratio != null && r.ratio > 1.05);
const under = rows.filter((r) => !r.error && r.ratio != null && r.ratio < 0.5);
console.log(`\n  reaching past the body (ratio > 1.05): ${over.length}`
    + (over.length ? ' — ' + over.map((r) => `${r.name} ${r.ratio.toFixed(2)}`).join(', ') : ''));
console.log(`  less than half the body  (ratio < 0.50): ${under.length}`
    + (under.length ? ' — ' + under.map((r) => `${r.name} ${r.ratio.toFixed(2)}`).join(', ') : ''));
