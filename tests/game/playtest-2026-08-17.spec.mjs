// tests/game/playtest-2026-08-17.spec.mjs — three defects reported from play.
//
// The owner played and reported, verbatim:
//
//   1. "sand boss model looks weird, and looks like this before you kill him,
//      and stay like this after you kill him"
//   2. "Black square prevents collection of bottle in dungeon 6"
//   3. "Level 13 my glowing lines left behind by light caster do not show"
//
// One was a bug, one was a design working exactly as intended with no way for
// the player to know that, and one was a gap between two dungeons. All three
// were invisible to 5606 green assertions, which is the usual ratio.

import * as THREE from 'three';
import fs from 'node:fs';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { createBlockerRuntime } from '../../src/game/world/blockers.js';
import { resetCoach, coachSpoken } from '../../src/game/ui/coach.js';
import {
    CryptWarden, TriCompiler, ProxyBoss, ObsidianArachnid, HydroidCloud,
    SkeletalMantis, PhantasmBoss, FrostAndFuel, SludgeGolem, MagmaWyrm,
    GumoiWitness, LeviathanBoss,
} from '../../src/game/bosses/roster.js';
import { SandSpur } from '../../src/game/bosses/sand-spur.js';
import { KineticCore } from '../../src/game/bosses/kinetic-core.js';

const P = { x: 0, y: 1.4, z: 0 };
const particles = { spawn() {}, burst() {}, update() {} };

// Each entry gets the SCENE it was built into, because that is how this file
// counts a corpse — see the note in section 1.
const ROSTER = [
    ['crypt warden', (s) => new CryptWarden(s, P)],
    ['tri-compiler', (s) => new TriCompiler(s, [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: -3, z: 0 }])],
    ['sand spur', (s) => new SandSpur(s, null, particles, [{ x: 0, z: 0 }])],
    ['kinetic core', (s) => new KineticCore(s, null, P)],
    ['proxy', (s) => new ProxyBoss(s, P)],
    ['obsidian arachnid', (s) => new ObsidianArachnid(s, P)],
    ['hydroid cloud', (s) => new HydroidCloud(s, P)],
    ['skeletal mantis', (s) => new SkeletalMantis(s, P)],
    ['phantasm', (s) => new PhantasmBoss(s, P)],
    ['frost & fuel', (s) => new FrostAndFuel(s, P)],
    ['sludge golem', (s) => new SludgeGolem(s, P)],
    ['magma wyrm', (s) => new MagmaWyrm(s, P)],
    ['gumoi witness', (s) => new GumoiWitness(s, P)],
    ['leviathan', (s) => new LeviathanBoss(s, P)],
];

const fakePlayer = () => ({
    root: { position: { x: 4, y: 1.4, z: 0 } },
    state: { facingVec: { x: -1, z: 0 }, current: 'IDLE' },
    health: { damage() {}, dead: false },
    hitRadius: 0.45,
});

/** Visible only if nothing above it is hidden. */
function shown(o) {
    let n = o;
    while (n) { if (n.visible === false) return false; n = n.parent; }
    return true;
}

export function run(t) {
    // ── 1. A dead boss leaves no body ──────────────────────────────────────
    //
    // `onDeath` hid `this.root`. For twelve of the fourteen that is the whole
    // boss; for the Sand Spur it is the HEAD, because its other five segments
    // are siblings in the scene rather than children of it. Measured before the
    // fix: 20 of 28 meshes still visible on a boss the player had just killed,
    // including the mound still crossing the floor.
    //
    // KILLED WHILE SURFACED, which is the only state you can kill it in — it
    // beaches itself, and that beached window is the whole fight. Killed while
    // burrowed its segments are already hidden and the defect cannot be seen,
    // which is exactly how a probe reports a corpse-free arena.
    // COUNTED FROM THE SCENE, NOT FROM `bossParts`. The first draft of this
    // enumerated the boss's meshes with the very helper the fix added, so
    // removing a line from that helper hid the parts from the FIX and from the
    // TEST at the same time and the counterfactual stayed green. A boss is
    // built into a scene and nothing else is in it; what is visible in that
    // scene afterwards is the corpse, and no code under test gets a say.
    for (const [name, build] of ROSTER) {
        const scene = new THREE.Scene();
        let b;
        try { b = build(scene); } catch (e) {
            t.ok(`${name} constructs`, false, e.message);
            continue;
        }
        // THE BODY IS WHAT WAS IN THE SCENE WHEN IT WAS BUILT. Everything a
        // boss adds later — fire trails, lobbed pools, spawned minions,
        // telegraph discs — is transient FX that outlives it on purpose and
        // expires on its own timer, and demanding those vanish the instant it
        // dies would be asserting the wrong thing. Snapshotting at construction
        // separates the two without asking any code under test which is which.
        const body = new Set();
        scene.traverse((o) => { if (o.isMesh) body.add(o); });
        const visible = () => [...body].filter(shown).length;
        const p = fakePlayer();
        for (let i = 0; i < 40; i++) {
            if (b.submerged !== undefined) b.submerged = false;
            try { b.update(0.05, p, {}); } catch (_) { /* headless gaps */ }
        }
        const alive = visible();
        t.ok(`${name} has a body to hide`, alive > 0, `${alive} meshes visible alive`);
        for (const c of b.cores || [b]) {
            try { c.onDeath(); } catch (e) {
                t.ok(`${name} dies cleanly`, false, e.message);
            }
        }
        const left = visible();
        t.ok(`${name} leaves no corpse on the floor`, left === 0,
            `${left} of ${alive} meshes still visible after death`);
    }

    // ── 2. The Vector Staff does not switch itself off for one dungeon ─────
    //
    // Read from SOURCE, and scanned rather than listed. The rule is "every
    // dungeon the player can be carrying the staff in fires light lines", and a
    // hand-typed list of those dungeons is one more thing that stops being true
    // the first time the staff moves — which is precisely how beat 13 came to
    // be the single gap between the beat that grants it and the beat that
    // reprises it.
    {
        const beats = LEVELS.filter((l) => /^beat-/.test(l.id)).map((l) => l.id).sort();
        const src = (id) => {
            const f = `src/game/levels/${id}.js`;
            return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
        };
        const grantsAt = beats.findIndex((id) => /grantItem\(['"]vector_staff['"]\)/.test(src(id)));
        t.ok('some dungeon grants the Vector Staff', grantsAt >= 0,
            grantsAt >= 0 ? `${beats[grantsAt]}` : 'none found');
        const after = grantsAt >= 0 ? beats.slice(grantsAt) : [];
        const missing = after.filter((id) => !/attachLightLinesOnCast\(/.test(src(id)));
        t.ok('every dungeon from there on fires light lines', missing.length === 0,
            missing.length ? `silent in ${missing.join(', ')}` : `${after.length} dungeons`);
        // And the reverse, so this cannot be satisfied by attaching it to all
        // fourteen: before the staff exists the system is pointless weight.
        const before = grantsAt > 0 ? beats.slice(0, grantsAt) : [];
        const early = before.filter((id) => /attachLightLinesOnCast\(/.test(src(id)));
        t.ok('and no dungeon fires them before the staff exists', early.length === 0,
            early.length ? early.join(', ') : `${before.length} dungeons clean`);
    }

    // ── 3. The dark shroud says what it wants ──────────────────────────────
    //
    // Not a bug — the shroud is a real barrier and the Caster is what drops it.
    // The defect is that it never said so: a player standing in it with a
    // mallet got a black square, no reaction, and a reward they could see and
    // could not take. `ui/coach.js` opens by saying a mechanic that can
    // silently refuse input must be able to say so when it refuses.
    {
        const scene = new THREE.Scene();
        const ctx = { scene, collisionWorld: new CollisionWorld() };
        const level = { addSystem: (s) => s, getVoxelAt: () => false };
        const blocker = {
            type: 'caster_dark', id: 'spec-dark',
            rect: { x0: -3, x1: 3, z0: -3, z1: 3 },
        };
        let rt = null;
        try {
            rt = createBlockerRuntime(ctx, level, blocker, { x: 0, z: 0 });
        } catch (e) {
            t.ok('a caster_dark shroud builds headlessly', false, e.message);
        }
        if (rt && rt.update) {
            const game = (weapon, owns) => ({
                player: {
                    root: { position: { x: 0, y: 1.95, z: 0 } },
                    inventory: {
                        activeWeapon: weapon,
                        hasItem: (id) => owns.includes(id),
                    },
                },
            });
            // Standing in it with the wrong weapon, and without the Caster at
            // all: silent, because the line would spoil an item two dungeons
            // away and every shroud sits after the beat that grants it.
            resetCoach();
            rt.update(1 / 60, game('heavy_mallet', []));
            t.ok('a player who has not found the Caster is not told about it',
                coachSpoken('caster-dark') === false);
            // Owning it and holding the wrong thing is the reported case.
            resetCoach();
            rt.update(1 / 60, game('heavy_mallet', ['light_caster']));
            t.ok('a player who owns the Caster is told to equip it',
                coachSpoken('caster-dark') === true);
            // And holding it, the shroud drops rather than lectures.
            resetCoach();
            rt.update(1 / 60, game('light_caster', ['light_caster']));
            t.ok('and holding it says nothing, because it just works',
                coachSpoken('caster-dark') === false);
            try { rt.dispose(); } catch (_) { /* headless gaps */ }
        }
    }
}
