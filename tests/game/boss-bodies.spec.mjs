// tests/game/boss-bodies.spec.mjs — the roster is made of the same stuff as
// the rest of the game, it is big enough to be the subject of its own room,
// and every boss's hitbox describes the body you can see.
//
// What this replaces: fourteen bosses built out of three.js primitives —
// twelve spheres, seven boxes, three icosahedrons, a torus, two dodecahedrons,
// two cones — in a game whose world, props, hero, enemies and held weapons are
// all voxels. `assets/weapon-models.js` had already written down the reason
// that is wrong ("a smooth sword in a blocky world reads as a bug") and the
// roster did it anyway, fourteen times, including a final boss that was a plain
// sphere.
//
// Two of the assertions here are the ones with teeth:
//
//   * **No primitive geometry may come back.** It is one line to type
//     `new THREE.SphereGeometry` and it will look fine in isolation.
//   * **Every hitRadius tracks its own body.** Bosses were given 1.4–1.85×
//     presence in the same pass; a hitbox that did not come with them is a
//     swing that visibly connects and does nothing, which is the single worst
//     bug this genre has and is invisible to every other test in the suite.

import * as THREE from 'three';
import fs from 'node:fs';
import {
    CryptWarden, TriCompiler, ProxyBoss, ObsidianArachnid, HydroidCloud,
    SkeletalMantis, PhantasmBoss, FrostAndFuel, SludgeGolem, MagmaWyrm,
    GumoiWitness, LeviathanBoss,
} from '../../src/game/bosses/roster.js';
import { SandSpur } from '../../src/game/bosses/sand-spur.js';
import { KineticCore } from '../../src/game/bosses/kinetic-core.js';
import { BOSS_EMISSIVE_MAX, clampEmissive } from '../../src/game/bosses/base.js';
import { VOX_PER_UNIT, voxBox, voxSphere, voxBlade } from '../../src/game/bosses/boss-models.js';

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

/**
 * Bosses whose hitbox deliberately tracks part of the body rather than all of
 * it. Both are documented rather than excluded silently — an unexplained
 * exception list is how a gate stops meaning anything.
 */
const PARTIAL_BODY = {
    // The Spur spends most of its cycle underground, and the warm-up loop below
    // lands mid-cycle. Measured while burrowed, the only visible mesh is the
    // weak seam, so the body reads far smaller than the boss the player fights.
    // Measured at construction — head out, before the first tick — it is 1.81
    // against a hitRadius of 1.50, i.e. 0.83. The exemption is about WHEN the
    // measurement happens, not about the hitbox being wrong.
    'sand spur': 0,
    // The Wyrm's root IS its head segment and the tail trails behind it through
    // `segs`. The fight resolves against the head on purpose (see the comment
    // at the `hitRadius` assignment in its tickAI), so measuring the whole
    // serpent and demanding the hitbox cover it would be asking for a different
    // fight, not for a correct hitbox.
    'magma wyrm': 0.6,
};

const fakePlayer = () => ({
    root: { position: { x: 4, y: 1.4, z: 0 } },
    state: { facingVec: { x: -1, z: 0 }, current: 'IDLE' },
    health: { damage() {}, dead: false },
    hitRadius: 0.45,
});

/** p85 horizontal radius of the visible body, measured from the root's own XZ. */
function bodyRadius(target) {
    target.updateWorldMatrix(true, true);
    const origin = target.position;
    const v = new THREE.Vector3();
    const radii = [];
    target.traverse((o) => {
        if (o.visible === false) return;
        const pos = o.isMesh && o.geometry?.getAttribute?.('position');
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            radii.push(Math.hypot(v.x - origin.x, v.z - origin.z));
        }
    });
    if (!radii.length) return 0;
    radii.sort((a, b) => a - b);
    // p85, not the furthest vertex. The furthest vertex on a boss holding a
    // weapon is the tip of the weapon, and a hitbox that reaches it would let
    // the player damage the Warden by touching his sword.
    return radii[Math.floor(radii.length * 0.85)];
}

export function run(t) {
    // ── 1. No smooth primitives in the boss files ──────────────────────────
    // Read from source, because this is a rule about what gets typed next time,
    // not about the objects that happen to exist right now.
    const FILES = [
        'src/game/bosses/roster.js',
        'src/game/bosses/sand-spur.js',
        'src/game/bosses/kinetic-core.js',
    ];
    // Flat ground decals (telegraph rings, blast circles) are exempt: they are
    // markings ON a surface, not bodies, and a voxel ring would read as a
    // staircase drawn on the floor.
    const ALLOWED = new Set(['Buffer', 'Circle', 'Ring', 'Plane']);
    for (const f of FILES) {
        const src = fs.readFileSync(f, 'utf8');
        const found = [...src.matchAll(/THREE\.(\w+)Geometry/g)]
            .map((m) => m[1])
            .filter((k) => !ALLOWED.has(k));
        t.ok(`${f}: no smooth primitive bodies`, found.length === 0,
            found.length ? `still using ${[...new Set(found)].join(', ')}` : 'voxels only');
    }

    // The builders themselves produce voxel geometry at a stated resolution.
    t.ok('boss voxels are authored per world unit', VOX_PER_UNIT >= 4 && VOX_PER_UNIT <= 10,
        `${VOX_PER_UNIT}/unit`);
    {
        // A builder's world size must match what it was asked for, or every
        // body in the roster is silently the wrong scale.
        const box = voxBox(2, 1, 3, 0x808080);
        box.updateWorldMatrix(true, true);
        const b = new THREE.Box3().setFromObject(box);
        const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
        const near = (a, e) => Math.abs(a - e) <= 2 / VOX_PER_UNIT;
        t.ok('voxBox is the size it is asked for', near(w, 2) && near(h, 1) && near(d, 3),
            `${w.toFixed(2)} x ${h.toFixed(2)} x ${d.toFixed(2)}`);
        // The scale must live in the GEOMETRY. Call sites do
        // `mesh.scale.setScalar(3.1)` right after building, and a builder that
        // parks its factor in mesh.scale has it silently overwritten.
        t.ok('voxel builders leave mesh.scale free for the caller',
            box.scale.x === 1 && box.scale.y === 1 && box.scale.z === 1,
            `scale=${box.scale.x}`);
        const s = voxSphere(1.5, 0x808080);
        s.updateWorldMatrix(true, true);
        const sb = new THREE.Box3().setFromObject(s);
        t.ok('voxSphere is the radius it is asked for',
            near((sb.max.x - sb.min.x) / 2, 1.5), `${((sb.max.x - sb.min.x) / 2).toFixed(2)}`);
        // A blade must be long along Z — the axis that reads from above. Built
        // along Y it is the two-pixel line the old roster shipped.
        const blade = voxBlade(2.0, 0.3, 0.1, 0x808080);
        blade.updateWorldMatrix(true, true);
        const bb = new THREE.Box3().setFromObject(blade);
        t.ok('a blade is long in Z, not tall in Y',
            (bb.max.z - bb.min.z) > (bb.max.y - bb.min.y) * 3,
            `z=${(bb.max.z - bb.min.z).toFixed(2)} y=${(bb.max.y - bb.min.y).toFixed(2)}`);
    }

    // ── 2. Emissive stays under the bloom threshold ────────────────────────
    // The roster shipped 1.1, 1.15, 1.2, 1.6 and 2.4 against a bloom threshold
    // of 0.85 — `beat-10-cryo-boss.png` is the whole arena as one white blob.
    t.ok('the cap is below the bloom threshold', BOSS_EMISSIVE_MAX < 0.85, `${BOSS_EMISSIVE_MAX}`);
    {
        // The clamp must actually find and lower a hot part, and report it.
        const hot = new THREE.Group();
        hot.add(voxSphere(1, 0x404040, 0xff2200, 2.4));
        const res = clampEmissive(hot);
        t.ok('the clamp reports the authored peak', Math.abs(res.peak - 2.4) < 1e-6, `${res.peak}`);
        t.ok('the clamp reports the hot colour', res.color === 0xff2200);
        let after = 0;
        hot.traverse((o) => { if (o.isMesh) after = Math.max(after, o.material.emissiveIntensity); });
        t.ok('the clamp lowers it', after === BOSS_EMISSIVE_MAX, `${after}`);
        // Non-glowing parts are left alone — clamping a black emissive would
        // report a peak of zero for every boss and disable the glow light.
        const cold = new THREE.Group();
        cold.add(voxSphere(1, 0x404040));
        t.ok('parts with no emissive are ignored', clampEmissive(cold).peak === 0);
    }

    // ── 3. Every boss: built, clamped, sized, and hit-matched ──────────────
    for (const [name, build] of ROSTER) {
        let b;
        try { b = build(); } catch (e) {
            t.ok(`${name} constructs`, false, String(e.message));
            continue;
        }
        t.ok(`${name} constructs`, true);

        // Warm up. Several bosses build their parts at the origin and place
        // them in tickAI (the Hydroid's twelve orbs orbit, the Wyrm's segments
        // trail), so a freshly-constructed body is a pile at (0,0,0).
        const p = fakePlayer();
        for (let i = 0; i < 40; i++) {
            try { b.update(0.05, p, {}); } catch (_) { /* headless gaps */ }
        }

        const target = b.cores?.[0]?.root || b.root;
        const hitRadius = b.cores?.[0]?.hitRadius ?? b.hitRadius;

        // No part of any boss may exceed the bloom cap, however it was built.
        let peak = 0;
        target.traverse((o) => {
            if (!o.isMesh || !o.material?.emissive) return;
            if ((o.material.emissive.getHex?.() ?? 0) === 0) return;
            peak = Math.max(peak, o.material.emissiveIntensity || 0);
        });
        t.ok(`${name}: no part exceeds the bloom cap`, peak <= BOSS_EMISSIVE_MAX + 1e-6,
            `peak=${peak}`);

        // Presence: the boss is the subject of its own room. A room half is
        // 8–12 units, so a body under ~1.6 across reads as furniture.
        const r = bodyRadius(target);
        t.ok(`${name}: has the presence of a boss`, r >= 0.8,
            `body radius ${r.toFixed(2)}`);

        // The one that matters. A hitbox smaller than the body is a swing that
        // connects and does nothing; a hitbox much larger is a hit on empty
        // air. Both read to the player as the game being broken.
        const floor = PARTIAL_BODY[name] ?? 0.75;
        const ratio = r > 0 ? hitRadius / r : 1;
        t.ok(`${name}: the hitbox describes the body`,
            ratio >= floor && (floor === 0 || ratio <= 1.6),
            `hitRadius=${hitRadius.toFixed(2)} body=${r.toFixed(2)} ratio=${ratio.toFixed(2)}`);

        // A glow light was derived, so the boss lights its arena instead of
        // clipping its own pixels.
        if (!b.cores) {
            t.ok(`${name}: carries a glow colour for its arena light`,
                typeof b._glowColor === 'number' && typeof b._glowIntensity === 'number',
                `${b._glowIntensity}`);
        }
    }

    // ── 4. The two bosses whose shape was wrong for the camera ─────────────
    {
        const m = new SkeletalMantis(new THREE.Scene(), P);
        const box = new THREE.Box3().setFromObject(m.scytheL);
        const spanZ = box.max.z - box.min.z;
        const spanY = box.max.y - box.min.y;
        t.ok('the mantis scythes sweep forward rather than standing up',
            spanZ > spanY, `z=${spanZ.toFixed(2)} y=${spanY.toFixed(2)}`);
        // …and the tell that opens them has to be visible from above, which
        // means yaw. Rolling a forward-pointing blade about its own long axis
        // is a rotation the player cannot see.
        m.scytheL.rotation.set(0, 0, 0);
        // `busy` is a getter over `this.action`, so it cannot be assigned —
        // give it a real action instead, which is also closer to the frame the
        // player actually sees.
        m.action = { stage: 'windup', name: 'slice', t: 0 };
        m.tickAI(0.05, fakePlayer());
        t.ok('the mantis opens its scythes in yaw, where the camera can see it',
            Math.abs(m.scytheL.rotation.y) > 0.5 && Math.abs(m.scytheL.rotation.z) < 1e-6,
            `y=${m.scytheL.rotation.y.toFixed(2)} z=${m.scytheL.rotation.z.toFixed(2)}`);
    }
    {
        const w = new CryptWarden(new THREE.Scene(), P);
        const box = new THREE.Box3().setFromObject(w.blade);
        t.ok('the warden holds a blade with a footprint, not a vertical line',
            (box.max.z - box.min.z) > (box.max.y - box.min.y),
            `z=${(box.max.z - box.min.z).toFixed(2)} y=${(box.max.y - box.min.y).toFixed(2)}`);
    }

    // ── 5. Runtime hitRadius writes must scale with presence ───────────────
    // `presenceScale` grows mesh and radii together; a boss that later assigns
    // `this.hitRadius = <literal>` throws that away on the first frame. Two
    // did. Read the source rather than the runtime, because the bug only shows
    // up on the specific frame the assignment runs.
    {
        const src = fs.readFileSync('src/game/bosses/roster.js', 'utf8');
        const bad = [...src.matchAll(/this\.hitRadius\s*=\s*([0-9.]+)\s*;/g)].map((m) => m[1]);
        t.ok('no boss re-assigns hitRadius from a bare literal',
            bad.length === 0,
            bad.length ? `literals: ${bad.join(', ')} — scale from this.baseHitRadius` : 'all derived');
    }
}
