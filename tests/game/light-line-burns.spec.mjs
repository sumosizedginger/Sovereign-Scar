// tests/game/light-line-burns.spec.mjs — the standing line does what it says.
//
// THE BUG THIS EXISTS TO PIN
//
// Beat 12 toasts "the Light Caster now leaves a standing line". The line was a
// lit box. Three quarters of a mechanic were present and wired at one end only:
//
//   hitsEntity()      written, correct, and CALLED BY NOTHING
//   line.hitPoints    computed on every shot, READ BY NOTHING
//   opts.solid        a whole collision branch, PASSED BY NO CALLER
//
// The installer's own comment even described the line as "cosmetic plus a hit
// test" — the hit test did not exist as a behaviour, only as a function.
//
// That is this project's signature failure: an alarm wired to one end of a
// wire. Deleting `hitsEntity` entirely would have kept the suite green and the
// game identical, which is the definition of a mechanic nothing tests.
//
// It was also FOUR TIMES too bright. `emissiveIntensity: 2.2` against a bloom
// threshold of 0.85 and a project ceiling of `BOSS_EMISSIVE_MAX = 0.55` — the
// ceiling that exists because a roster of 1.1–2.4 values turned a boss arena
// into one white blob. And `transparent` was set only inside `update()`, so
// frame one of every line rendered fully opaque before the fade ran once.
//
// WHAT IS DELIBERATELY NOT FIXED: `opts.solid`. Nothing needs a solid line yet,
// and unused code that LOOKS wired is precisely what produced this defect.

import fs from 'fs';
import * as THREE from 'three';
import { LightLineSystem } from '../../src/game/world/light-line-system.js';
import { BOSS_EMISSIVE_MAX } from '../../src/game/bosses/base.js';

/** A target the hit test and `applyHit` will both accept. */
function target(x, z, hp = 10) {
    return {
        root: { position: { x, y: 1, z } },
        state: { current: 'IDLE', facingVec: { x: 0, z: 1 } },
        hitRadius: 0.5,
        hp,
    };
}

const origin = { x: 0, y: 1, z: 0 };
const dir = { x: 0, z: 1 };

export function run(t) {
    // ── 1. SOMETHING STANDING IN THE LINE TAKES DAMAGE ─────────────────────
    {
        const sys = new LightLineSystem(new THREE.Scene(), null);
        sys.fire(origin, dir, { range: 8, life: 3 });
        const inIt = target(0, 4);
        const before = inIt.hp;
        // Long enough to cross at least one burn interval.
        for (let i = 0; i < 60; i++) sys.update(1 / 60, [inIt]);
        t.ok('an enemy standing in the line is damaged',
            inIt.hp < before, `hp ${before} -> ${inIt.hp}`);
    }

    // ── 2. AND SOMETHING BESIDE IT IS NOT ──────────────────────────────────
    // Without this, assertion 1 passes for a system that damages everything in
    // the level and calls it a beam.
    {
        const sys = new LightLineSystem(new THREE.Scene(), null);
        sys.fire(origin, dir, { range: 8, life: 3 });
        const beside = target(6, 4);        // well off the axis
        const behind = target(0, -4);       // behind the muzzle
        const beyond = target(0, 30);       // past the end of the range
        const hp0 = [beside.hp, behind.hp, beyond.hp];
        for (let i = 0; i < 60; i++) sys.update(1 / 60, [beside, behind, beyond]);
        t.ok('an enemy off to one side is untouched', beside.hp === hp0[0], `${beside.hp}`);
        t.ok('an enemy behind the muzzle is untouched', behind.hp === hp0[1], `${behind.hp}`);
        t.ok('an enemy past the end of the range is untouched',
            beyond.hp === hp0[2], `${beyond.hp}`);
    }

    // ── 3. IT IS A HAZARD, NOT A SECOND SWORD ──────────────────────────────
    // Damage is on an interval. A per-frame beam would delete a boss in under a
    // second and would not be a design, it would be an accident.
    {
        const sys = new LightLineSystem(new THREE.Scene(), null);
        sys.fire(origin, dir, { range: 8, life: 3 });
        const e = target(0, 4, 100);
        for (let i = 0; i < 60; i++) sys.update(1 / 60, [e]);   // one second
        const lost = 100 - e.hp;
        t.ok('one second in the line costs a few ticks, not sixty',
            lost > 0 && lost <= 4,
            `${lost} damage in 1s — per-frame would be tens`);
    }

    // ── 4. A DEAD TARGET IS LEFT ALONE ─────────────────────────────────────
    {
        const sys = new LightLineSystem(new THREE.Scene(), null);
        sys.fire(origin, dir, { range: 8, life: 3 });
        const dead = target(0, 4);
        dead.state.current = 'DEAD';
        const hp0 = dead.hp;
        for (let i = 0; i < 60; i++) sys.update(1 / 60, [dead]);
        t.ok('a corpse in the beam is not re-killed', dead.hp === hp0);
    }

    // ── 5. THE LINE EXPIRES, AND STOPS BURNING WHEN IT DOES ────────────────
    {
        const sys = new LightLineSystem(new THREE.Scene(), null);
        sys.fire(origin, dir, { range: 8, life: 0.5 });
        const e = target(0, 4, 100);
        for (let i = 0; i < 60; i++) sys.update(1 / 60, [e]);
        const afterExpiry = e.hp;
        t.ok('the line is gone once its life runs out', sys.lines.length === 0);
        for (let i = 0; i < 120; i++) sys.update(1 / 60, [e]);
        t.ok('…and an expired line does no further damage',
            e.hp === afterExpiry, `${afterExpiry} -> ${e.hp}`);
    }

    // ── 6. BRIGHTNESS ──────────────────────────────────────────────────────
    {
        const sys = new LightLineSystem(new THREE.Scene(), null);
        const L = sys.fire(origin, dir, { range: 8, life: 2 });
        t.ok('the line is not brighter than the brightest boss part',
            L.mat.emissiveIntensity <= BOSS_EMISSIVE_MAX,
            `${L.mat.emissiveIntensity} vs ceiling ${BOSS_EMISSIVE_MAX} — it shipped at 2.2`);
        t.ok('and it is transparent on its very first frame',
            L.mat.transparent === true,
            'set only inside update(), the first frame rendered fully opaque');

        // …and it fades rather than holding full strength to the end.
        const at0 = L.mat.emissiveIntensity;
        for (let i = 0; i < 60; i++) sys.update(1 / 60, []);
        t.ok('it dims as it dies', L.mat.emissiveIntensity < at0,
            `${at0} -> ${L.mat.emissiveIntensity}`);
    }

    // ── 7. THE WIRE IS ACTUALLY CONNECTED ──────────────────────────────────
    // Every assertion above drives `update` directly. The defect was that the
    // LEVEL never handed it any targets — `update(dt)` was called with one
    // argument, so a perfectly working hit test damaged nobody. Read the
    // installer and pin that it passes the enemies.
    {
        const src = new URL('../../src/game/world/light-lines-on-cast.js', import.meta.url);
        const text = fs.readFileSync(src, 'utf8');
        t.ok('the level hands the enemy list to the line system every frame',
            /lines\.update\(dt,\s*level\.enemies/.test(text),
            'update(dt) alone is a hit test nothing is ever asked about');
    }
}
