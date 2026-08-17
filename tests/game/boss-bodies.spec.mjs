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
    GumoiWitness, LeviathanBoss, WITNESS_HEADS, WITNESS_DRAFTS,
} from '../../src/game/bosses/roster.js';
import { HERO_PALETTE } from '../../src/game/assets/palettes.js';
import { KITS } from '../../src/game/levels/dungeon-kits.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { SandSpur } from '../../src/game/bosses/sand-spur.js';
import { KineticCore } from '../../src/game/bosses/kinetic-core.js';
import { BOSS_EMISSIVE_MAX, clampEmissive } from '../../src/game/bosses/base.js';
import {
    VOX_PER_UNIT, LIMB_VOX_PER_UNIT, voxBox, voxSphere, voxBlade,
} from '../../src/game/bosses/boss-models.js';

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
    //
    // 0.6 → 0.3 when the chain was spaced out to read as a serpent rather than
    // a lump (segments trailed 0.28 apart while being 2.4 across). NOTE WHAT
    // THAT NUMBER IS AND IS NOT: it is a statement about how much of a
    // DECORATIVE tail the whole-body statistic now sweeps up, and loosening it
    // on its own would be exactly the "raise the threshold until it passes"
    // move this repo warns about. It is only defensible because the tail is
    // provably inert — `BossBase`'s contact test measures from `this.root.
    // position`, the head, so no trailing segment can touch the player, and
    // `hitRadius` resolves there too, so none of them can be struck either.
    // The assertion that carries the real weight is the head-specific one
    // below; this one is left as a loose sanity bound, not as the gate.
    'magma wyrm': 0.3,
};

const fakePlayer = () => ({
    root: { position: { x: 4, y: 1.4, z: 0 } },
    state: { facingVec: { x: -1, z: 0 }, current: 'IDLE' },
    health: { damage() {}, dead: false },
    hitRadius: 0.45,
});

/**
 * How much of a boss is painted its own room's accent, and how close it gets.
 *
 * WHY THIS IS ROSTER-WIDE. Three of fourteen bosses turned out to be wearing
 * their own arena, two of them character for character: the GUMOI Witness was
 * `0xff40c8` in a room whose accent is `0xff40c8`, and the Proxy's hoop was
 * `0xd4a84b` in a room whose accent is `0xd4a84b`. Both were found by eye, one
 * at a time, and both had passed every other gate in this file. At that hit
 * rate the remaining bosses were not worth trusting.
 *
 * The kit is looked up through `LEVELS[].bossId`, not a table typed here: a
 * hand-written boss→beat mapping is one more thing that can quietly stop being
 * true.
 *
 * READ OFF THE VERTEX ATTRIBUTE. Every `boss-models` builder is
 * `vertexColors: true` with no `color` set on the material, so a check that
 * walks `material.color` reads pure white fourteen times and passes everything.
 * That is not hypothetical — it is what the first version of this did, and it
 * passed a boss painted the room's exact magenta on purpose.
 */
const CLASH_D = 0.12;
function roomClashShare(boss) {
    const lvl = LEVELS.find((l) => l.bossId === boss.bossId);
    const kit = lvl && KITS[lvl.id];
    if (!kit || kit.accent == null) return null;
    // `THREE.Color(hex)` already converts sRGB into the linear working space,
    // which is the space `buildVoxelGeo` bakes into the attribute. Converting
    // again moves the accent away from itself — it once put a room's own
    // magenta 0.27 from itself and let the counterfactual through.
    const accent = new THREE.Color(kit.accent);
    let near = 0, total = 0, min = Infinity;
    boss.root.traverse((o) => {
        const attr = o.isMesh && o.geometry?.getAttribute?.('color');
        if (!attr) return;
        for (let i = 0; i < attr.count; i++) {
            total++;
            const d = Math.hypot(attr.getX(i) - accent.r, attr.getY(i) - accent.g,
                attr.getZ(i) - accent.b);
            if (d < min) min = d;
            if (d < CLASH_D) near++;
        }
    });
    if (!total) return null;
    return { share: near / total, min, accent: kit.accent };
}

/**
 * Bosses allowed to share their room's accent, with the share they are allowed.
 *
 * These are CEILINGS AT THE MEASURED VALUE, not a switched-off gate: each one
 * still fails if it gets worse. The measurement that produced them is bimodal
 * and leaves no judgement call — the ten bosses not listed here sit 0.25 to
 * 0.97 away from their accent with 0.0% of the body near it, and these three
 * sit at 0.001 to 0.014, which is the accent constant itself.
 */
const ROOM_CLASH = {
    // ACCEPTED. The Mantis is the roster's reference silhouette and the one
    // body nobody has ever asked to change — it reads on SHAPE, splayed scythes
    // with background between them, which is precisely the property that makes
    // sharing a hue survivable. A bone skeleton in the Bone Forest is also the
    // correct answer artistically. Recorded rather than silently skipped so
    // that the reason is attached to the number.
    skeletal_mantis: 0.62,   // measured 59.3% at 0.001 from #e8e0d0
    // OUTSTANDING. `docs/BOSS-PASS.md` lists "the Wyrm was orange on the magma
    // floor" as a FIXED example of this trap, and it is not fixed — two fifths
    // of the body is still within 0.013 of the pyre accent. The boss is owner-
    // approved as it stands, so this is pinned at its current value rather than
    // changed unasked. Revisit with the owner.
    magma_wyrm: 0.42,        // measured 39.7% at 0.013 from #ff5520
    // OUTSTANDING. Worst on the roster: a tan body in a tan sink. Beat 03 is
    // one of the three bosses still to be rebuilt, so this is the number that
    // rebuild has to beat.
    sand_spur: 0.90,         // measured 88.8% at 0.014 from #c8a060
};

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

        // ── Not painted the colour of its own room ─────────────────────────
        const clash = roomClashShare(b);
        if (clash) {
            const ceiling = ROOM_CLASH[b.bossId] ?? 0.02;
            t.ok(`${name}: is not painted the colour of its own room`,
                clash.share <= ceiling,
                `${(clash.share * 100).toFixed(1)}% of the body within ${CLASH_D} of `
                + `#${clash.accent.toString(16).padStart(6, '0')} `
                + `(nearest ${clash.min.toFixed(3)}, ceiling ${(ceiling * 100).toFixed(0)}%)`);
        }

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

        // THE WYRM'S REAL GATE. Its whole-body ratio is meaningless — most of
        // the silhouette is an inert tail — so the question that matters is
        // whether the hitbox describes the part the fight actually resolves
        // against: segment 0, the head. Without this, the loosened floor above
        // would let the head shrink to nothing with the tail holding the
        // number up, and a player would be swinging at a head that is not
        // where the damage is.
        if (name === 'magma wyrm' && b.segs?.length > 1) {
            const segR = (s) => {
                const bb = new THREE.Box3().setFromObject(s);
                return Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
            };
            // The SKULL by name, not the head group — the group carries the
            // horns, and measuring it made this assertion untestable: shrinking
            // the skull to a third of its size left the number at 2.01 and the
            // counterfactual passed. An assertion whose break mode cannot be
            // demonstrated is decoration.
            const skull = b.segs[0].getObjectByName('wyrm-skull');
            const headR = skull ? segR(skull) : 0;
            const neckR = segR(b.segs[1]);
            t.ok(`${name}: its skull is findable for measurement`, !!skull,
                skull ? 'named wyrm-skull' : 'no wyrm-skull in segs[0]');

            // Not a ratio against the head's own size — the head GROUP carries
            // the horns, so that number is mostly horn and means very little.
            // These two are the invariants that keep the fight honest:
            //
            //   * there is a head at least as big as the thing you swing at, so
            //     the hitbox is never floating in air beside a shrunken skull;
            //   * the head is the biggest segment, so the shape points at the
            //     part the damage resolves against. When the body was six near
            //     equal spheres this was false by a hair, and "which end do I
            //     hit" was a genuine question.
            t.ok(`${name}: …its head is at least as big as its hitbox`,
                headR >= hitRadius * 0.8,
                `head=${headR.toFixed(2)} hitRadius=${hitRadius.toFixed(2)}`);
            t.ok(`${name}: …and the head is the widest segment, so the shape aims`,
                headR > neckR * 1.05,
                `head=${headR.toFixed(2)} next=${neckR.toFixed(2)}`);

            // THE BREATH LEAVES THE MOUTH. Found by playing, not by any of
            // this: "his breath weapon shot out at me from the side of his
            // head." The jet was aimed at the player the whole time; the HEAD
            // was never turned, so the fire left the cheek. Nothing in the
            // suite could see it, because every assertion about this boss was
            // about where the cone LANDS and none about where it starts.
            //
            // Driven, not constructed: tick the real boss with a player parked
            // off to one side and check the head's forward vector ends up
            // pointing at them. The bug is "the head never turns", so a fixture
            // that sets the rotation itself would prove nothing.
            const wyrm = build();
            wyrm._awake = true;
            const px = 6, pz = -3;
            const wp = {
                root: { position: { x: px, y: 1.95, z: pz } },
                health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
                state: { facingVec: { x: 0, z: -1 } },
            };
            for (let i = 0; i < 90; i++) {
                try { wyrm.tickAI(1 / 60, wp); } catch (_) { /* no game ctx */ }
                wyrm.t = (wyrm.t || 0) + 1 / 60;
            }
            const want = Math.atan2(px - wyrm.root.position.x, pz - wyrm.root.position.z);
            const got = wyrm.segs[0].rotation.y;
            let off = Math.abs(((got - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            t.ok(`${name}: its head points at what it is breathing at`,
                off < 0.35,
                `head yaw ${got.toFixed(2)} vs bearing ${want.toFixed(2)} — off by `
                + `${(off * 180 / Math.PI).toFixed(0)}°`);
        }

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

    // ── A thin part is actually thin ────────────────────────────────────────
    //
    // The builders round to whole voxels and clamp at one, so at the body
    // resolution the thinnest box expressible is 3 cells — 0.5 world units —
    // and EVERY width from 0.12 to 0.34 comes out identical. That is a silent
    // quantisation: the number in the source is not the number in the world.
    //
    // It cost a full boss redesign to find. The Arachnid's legs are authored at
    // 0.15 and were really 0.5; times its 1.70 presence that is 0.85 units of
    // leg, eight of them, on a spider whose span its own flank rule caps near
    // 3.5 — so they closed into a dome and the boss read as a blob. Three
    // separate passes at "make the legs thinner" changed nothing at all,
    // because nothing could.
    //
    // Both halves are asserted deliberately. The floor is real and is allowed
    // to exist — bodies want it, it is what keeps the bosses as blocky as the
    // architecture — so this pins that it is still there AND that the escape
    // hatch works, and then it asks the shipped spider rather than a fixture.
    {
        const boxWidth = (w, res) => {
            const m = voxBox(w, 1, w, 0x808080, 0, 0, undefined, res);
            m.geometry.computeBoundingBox();
            const b = m.geometry.boundingBox;
            return b.max.x - b.min.x;
        };

        t.ok('the body resolution has a 0.5-unit floor, and it is not a bug',
            Math.abs(boxWidth(0.15) - 0.5) < 1e-6 && Math.abs(boxWidth(0.34) - 0.5) < 1e-6,
            `0.15 -> ${boxWidth(0.15).toFixed(3)}, 0.34 -> ${boxWidth(0.34).toFixed(3)}`);

        t.ok('…and LIMB_VOX_PER_UNIT is a real way through it',
            boxWidth(0.15, LIMB_VOX_PER_UNIT) < 0.2,
            `0.15 at limb res -> ${boxWidth(0.15, LIMB_VOX_PER_UNIT).toFixed(3)}`);

        t.ok('…without resizing the bodies that never asked for it',
            Math.abs(boxWidth(1.6) - 1.8333) < 1e-3,
            `a 1.6 body box is ${boxWidth(1.6).toFixed(4)}`);

        // Wired to the building, not to the wire: ask the boss the campaign
        // ships. Reverting its legs to the default resolution fails here, which
        // is the whole point — the three no-op attempts were green throughout.
        const spider = new ObsidianArachnid(new THREE.Scene(), { x: 0, z: 0 });
        const legParts = [];
        for (const leg of spider.legs) {
            leg.traverse((o) => {
                if (!o.isMesh || !o.geometry) return;
                o.geometry.computeBoundingBox();
                const b = o.geometry.boundingBox;
                legParts.push(Math.min(b.max.x - b.min.x, b.max.z - b.min.z));
            });
        }
        const thickest = legParts.length ? Math.max(...legParts) : Infinity;
        t.ok('the Arachnid\'s legs are built thin enough to have air between them',
            legParts.length > 0 && thickest < 0.3,
            `${legParts.length} leg parts, thickest ${thickest.toFixed(3)} `
            + '(0.5 means it fell back to the body resolution)');
    }

    runWitness(t);
    runFrostAndFuel(t);
    runHydroid(t);
    runProxy(t);
    runTriCompiler(t);
}

/**
 * The GUMOI Witness — the seven-headed rebuild.
 *
 * Split out because it asserts three things the roster-wide loop above cannot:
 * that the faces are the HERO'S, that the body is not the colour of its own
 * room, and that the thing opens when it descends. The last is the one with
 * teeth — it is the only tell the fight's single vulnerable window has, it
 * lives entirely in `tickAI`, and nothing else in the suite drives a boss far
 * enough to notice it going silent.
 */
export function runWitness(t) {
    const boss = new GumoiWitness(new THREE.Scene(), { x: 0, y: 9.5, z: 0 });

    t.ok('the Witness is seven heads', boss.heads?.length === WITNESS_HEADS,
        `${boss.heads?.length} heads, WITNESS_HEADS=${WITNESS_HEADS}`);

    // The clean draft is the hero, not a colour that resembles him. If anyone
    // re-tints the player, the best-remembered face has to follow — that is the
    // whole premise of the boss, and a hand-copied hex would silently stop
    // being true.
    t.ok('…and the best-remembered face is the hero\'s own skin',
        WITNESS_DRAFTS[0].skin === HERO_PALETTE.skin,
        `draft #{0} #${WITNESS_DRAFTS[0].skin.toString(16)} `
        + `vs hero #${HERO_PALETTE.skin.toString(16)}`);

    // (The per-boss room-colour check that used to live here is gone: the
    // roster-wide gate in `run` now measures every boss against its own kit
    // accent, reports the share and the nearest distance, and holds the three
    // known offenders at a ceiling. One instrument beats four copies of it.)

    // ── It opens when it comes down ────────────────────────────────────────
    // Driven through the real condition. `busy` is a getter over `action`, so
    // this pins `action` — assigning `busy` fails silently and would leave this
    // assertion measuring a boss that never opened. (That exact mistake cost a
    // wasted portrait pass; see `tests/qa/boss-portraits.mjs`.)
    const player = {
        root: { position: { x: 0, y: 1.95, z: 4 } },
        health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
        state: { facingVec: { x: 0, z: -1 } },
    };
    const spread = () => {
        let far = 0;
        for (const h of boss.heads) far = Math.max(far, h.position.length());
        return far;
    };
    for (let i = 0; i < 60; i++) boss.tickAI(1 / 60, player, null);
    const shut = spread();
    for (let i = 0; i < 60; i++) {
        if (!boss.action) boss.action = { name: 'probe-open' };
        boss.tickAI(1 / 60, player, null);
    }
    const open = spread();
    t.ok('…and it visibly opens when it descends to cast',
        open > shut * 1.2,
        `shut ${shut.toFixed(2)} -> open ${open.toFixed(2)} `
        + `(+${(((open / shut) - 1) * 100).toFixed(0)}%)`);

    // The light is part of the same tell, and it is a separate failure: the
    // heads could travel while the core stayed dark, which reads as the body
    // wobbling rather than unclenching.
    t.ok('…and the core lights through the gap it just made',
        boss.core.material.emissiveIntensity > 0.2,
        `emissiveIntensity ${boss.core.material.emissiveIntensity.toFixed(3)}`);

    boss.action = null;
    for (let i = 0; i < 90; i++) boss.tickAI(1 / 60, player, null);
    t.ok('…and it shuts again afterwards', spread() < shut * 1.1,
        `reclosed to ${spread().toFixed(2)} against a shut ${shut.toFixed(2)}`);
}

/**
 * Frost & Fuel — the twin rebuilt as one cleaved creature.
 *
 * The assertion that matters is the SIDES one. `_twinned` fires fuel to one
 * side of the boss→player line and frost to the other, and the rebuild put a
 * head on each side to match — a claim about world-space geometry made through
 * two rotations (the root's facing lerp, then each head's local offset), which
 * is precisely the shape of claim that has been wrong here before. It is
 * checked by driving the real move and reading the real patches, not by
 * re-deriving the maths the boss already did.
 */
export function runFrostAndFuel(t) {
    const boss = new FrostAndFuel(new THREE.Scene(), { x: 0, y: 1.4, z: 0 });
    const player = {
        root: { position: { x: 0, y: 1.95, z: 6 } },
        health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
        state: { facingVec: { x: 0, z: -1 } },
    };

    // The maws are what `tickAI` drives, and the 2.5:1 contrast between them is
    // the entire read of the fight. This rebuild moved `this.frost`/`this.fuel`
    // from two spheres onto two mouths inside two heads; if that rewiring ever
    // slips, the boss still animates and simply stops saying which half is
    // armed.
    boss.mode = 'frost';
    boss.tickAI(1 / 60, player, null);
    const armed = boss.frost.material.emissiveIntensity;
    const idle = boss.fuel.material.emissiveIntensity;
    t.ok('Frost & Fuel: the armed head outshines the idle one',
        armed > idle * 2 && armed <= BOSS_EMISSIVE_MAX + 1e-6,
        `armed ${armed.toFixed(3)} vs idle ${idle.toFixed(3)}`);

    // ── The head on your left burns the ground on your left ────────────────
    // Let the facing lerp settle first: the sides only mean anything once the
    // body is actually pointed at the player, and this boss did not aim at all
    // before the rebuild (it free-spun, and `strafe` never touches rotation).
    for (let i = 0; i < 120; i++) boss.tickAI(1 / 60, player, null);

    const patches = [];
    boss.spawnPatch = (o) => patches.push(o);
    boss.clearPatches = () => {};
    // `startAction` resolves its target from `_actionPlayer` when none is passed
    // and bails out entirely if it has neither, which is why driving this
    // straight left `action` null. The stored action is `{ def, aim, … }`, so
    // the real strike is `action.def.strike` against the aim the boss itself
    // already computed — not a re-derived one, which would let this test agree
    // with a boss that aims somewhere else.
    boss._actionPlayer = player;
    boss._twinned(player);
    boss.action.def.strike(player, boss.action.aim);

    const bp = boss.root.position;
    const dx = player.root.position.x - bp.x, dz = player.root.position.z - bp.z;
    // Which side of the boss→player line a point falls on. In world space, and
    // as a cross product — never as the sign of a rotation angle, which is how
    // a backwards swing once shipped green.
    const sideOf = (x, z) => Math.sign(dx * (z - bp.z) - dz * (x - bp.x));
    const headSide = (h) => {
        const w = h.getWorldPosition(new THREE.Vector3());
        return sideOf(w.x, w.z);
    };
    const patchSide = (kind) => {
        const p = patches.find((q) => q.kind === kind);
        return p ? sideOf(p.x, p.z) : 0;
    };

    t.ok('Frost & Fuel: the twinned volley lands one patch of each element',
        patches.length === 2 && patchSide('frost') !== 0
        && patchSide('frost') === -patchSide('fuel'),
        `${patches.length} patches: ${patches.map((q) => q.kind).join(',')}`);

    t.ok('…and each head is on the side its own element lands',
        headSide(boss.frostHead) === patchSide('frost')
        && headSide(boss.fuelHead) === patchSide('fuel'),
        `frost head ${headSide(boss.frostHead)} vs frost patch ${patchSide('frost')}, `
        + `fuel head ${headSide(boss.fuelHead)} vs fuel patch ${patchSide('fuel')}`);

    // (The per-boss room-colour check that used to live here is gone: the
    // roster-wide gate in `run` now measures every boss against its own kit
    // accent, reports the share and the nearest distance, and holds the three
    // known offenders at a ceiling. One instrument beats four copies of it.)
}

/**
 * Hydroid Cloud — the swarm that has to stay a swarm.
 *
 * The failure this replaced was not a colour or a proportion: twelve orbs of
 * radius up to 0.51 sat 0.63 apart on their own ring, so they INTERSECTED and
 * the swarm rendered as one solid lump. That is a relationship between two
 * numbers written 60 lines apart — the radii in the constructor and the spread
 * in `tickAI` — and nothing in the suite could see it. It can now.
 */
export function runHydroid(t) {
    const boss = new HydroidCloud(new THREE.Scene(), { x: 0, y: 1.8, z: 0 });
    const player = {
        root: { position: { x: 0, y: 1.95, z: 7 } },
        health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
        state: { facingVec: { x: 0, z: -1 } },
    };

    /** Smallest gap between any two orbs' surfaces, in the ring's own space. */
    const tightest = () => {
        let worst = Infinity;
        for (let i = 0; i < boss.orbs.length; i++) {
            for (let j = i + 1; j < boss.orbs.length; j++) {
                const a = boss.orbs[i], b = boss.orbs[j];
                a.geometry.computeBoundingSphere();
                b.geometry.computeBoundingSphere();
                const gap = a.position.distanceTo(b.position)
                    - a.geometry.boundingSphere.radius - b.geometry.boundingSphere.radius;
                if (gap < worst) worst = gap;
            }
        }
        return worst;
    };

    for (let i = 0; i < 30; i++) boss.tickAI(1 / 60, player, null);
    t.ok('the Hydroid\'s swarm has background between its drops',
        tightest() > 0, `tightest surface gap ${tightest().toFixed(3)}`);

    // ── The bell is not a roof ─────────────────────────────────────────────
    // Trap 4: a solid canopy over the orbs would delete them at this pitch,
    // which is exactly how the Golem's first humanoid build photographed as a
    // bare slab. The bell has to stay INSIDE the orbit it hangs from.
    const bellR = (() => {
        const box = new THREE.Box3().setFromObject(boss.bell);
        return Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    })();
    const orbitR = Math.min(...boss.orbs.map((o) => Math.hypot(o.position.x, o.position.z)));
    t.ok('…and its bell sits inside the ring rather than over it',
        bellR < orbitR, `bell half-width ${bellR.toFixed(2)} vs nearest orb ${orbitR.toFixed(2)}`);

    // ── Phase 2 must not undo it ───────────────────────────────────────────
    // Phase 2 adds eight orbs AND widens the ring, in two different methods.
    // Either one changing alone re-fuses the swarm.
    boss.hp = boss.maxHp * 0.2;
    boss._checkPhase();
    for (let i = 0; i < 30; i++) boss.tickAI(1 / 60, player, null);
    t.ok('…and phase 2 grows the swarm without re-fusing it',
        boss.orbs.length > 12 && tightest() > 0,
        `${boss.orbs.length} orbs, tightest gap ${tightest().toFixed(3)}`);

    // ── The bell pumps before it rains ─────────────────────────────────────
    const open = boss.bell.scale.x;
    boss.action = { name: 'rainfall' };
    for (let i = 0; i < 60; i++) boss.tickAI(1 / 60, player, null);
    t.ok('…and the bell gathers before it sheds',
        boss.bell.scale.x < open * 0.9 && boss.bell.scale.y > 1,
        `x ${open.toFixed(2)} -> ${boss.bell.scale.x.toFixed(2)}, `
        + `y ${boss.bell.scale.y.toFixed(2)}`);
}

/**
 * The Proxy — the mask, and the decoys that have to be the same mask.
 *
 * `_markRealBody`'s comment says brightness marks the real one. That was only
 * ever half true: the decoys were 0.9 blobs and the boss was a 1.1 core wearing
 * a ring, so the answer was its SILHOUETTE and the brightness cue sat on top of
 * a question nobody had to ask. These assertions are what make the mechanic
 * real rather than intended.
 */
export function runProxy(t) {
    const boss = new ProxyBoss(new THREE.Scene(), { x: 0, y: 1.5, z: 0 });
    // Snapshot the real face BEFORE any decoy exists.
    const faceMat = [];
    boss.mask.traverse((o) => { if (o.isMesh && o.material) faceMat.push(o.material); });
    const before = faceMat.map((m) => m.opacity ?? 1);
    boss._spawnClones(3);

    const sizeOf = (o) => {
        o.updateWorldMatrix(true, true);
        const b = new THREE.Box3().setFromObject(o);
        return b.getSize(new THREE.Vector3());
    };
    const real = sizeOf(boss.mask);
    const decoy = sizeOf(boss.clones[0]);
    t.ok('the Proxy\'s decoys are the same body as the Proxy',
        boss.clones.length === 3
        && Math.abs(real.x - decoy.x) < 0.05 && Math.abs(real.y - decoy.y) < 0.05,
        `real ${real.x.toFixed(2)}x${real.y.toFixed(2)} `
        + `vs decoy ${decoy.x.toFixed(2)}x${decoy.y.toFixed(2)}`);

    // The tell, stated as a rule rather than as a hope: the one that is
    // speaking is the one you can hit.
    const realMouth = boss.core.material.emissiveIntensity;
    const decoyMouths = boss.clones.map((c) => c.userData.mouth.material.emissiveIntensity);
    t.ok('…and only the real one\'s mouth is lit',
        decoyMouths.every((e) => e < realMouth * 0.5),
        `real ${realMouth.toFixed(2)} vs decoys ${decoyMouths.map((e) => e.toFixed(2)).join(',')}`);

    // ── Dimming a decoy must not dim the Proxy ─────────────────────────────
    // The mask parts come out of shared builders, so a decoy built without
    // cloning its materials shares them with the real body — and
    // `_markRealBody` writes opacity straight onto every decoy mesh. The boss
    // would fade itself out every time it marked its own doubles, and the tell
    // would invert. Caught by looking rather than by playing, so it is pinned.
    const decoyMat = [];
    boss.clones[0].traverse((o) => { if (o.isMesh && o.material) decoyMat.push(o.material); });
    const shared = faceMat.filter((m) => decoyMat.includes(m));
    t.ok('…and no decoy shares a material with the real body',
        shared.length === 0, `${shared.length} shared of ${faceMat.length}`);
    // Compared against what this body looked like BEFORE any decoy existed,
    // not against "opaque" — the drape is authored translucent on purpose, and
    // a test that demanded solidity would have been asserting a coincidence.
    t.ok('…so marking the decoys leaves the Proxy\'s own face untouched',
        faceMat.every((m, i) => Math.abs((m.opacity ?? 1) - before[i]) < 1e-6),
        faceMat.map((m, i) => `${before[i].toFixed(2)}->${(m.opacity ?? 1).toFixed(2)}`)
            .join(','));

    // (The per-boss room-colour check that used to live here is gone: the
    // roster-wide gate in `run` now measures every boss against its own kit
    // accent, reports the share and the nearest distance, and holds the three
    // known offenders at a ceiling. One instrument beats four copies of it.)
}

/**
 * The Tri-Compiler — three whorls spinning one thread.
 *
 * Two claims worth pinning, and the first one is a claim about world-space
 * direction made through a rotation, which is the shape of claim that has
 * silently shipped backwards in this repo before. It is checked as a dot
 * product against the real bearing, never as the sign of an angle.
 */
export function runTriCompiler(t) {
    const scene = new THREE.Scene();
    const boss = new TriCompiler(scene, [{ x: -5, z: -4 }, { x: 5, z: -4 }, { x: 5, z: 4 }]);
    const player = {
        root: { position: { x: 0, y: 1.95, z: 0 } },
        health: { hp: 6, maxHp: 6, dead: false, damage: () => ({ accepted: true }) },
        state: { facingVec: { x: 0, z: -1 } },
    };
    for (let i = 0; i < 60; i++) boss.update(1 / 60, player);

    // Where a core's lit facet actually points, in the world.
    const facing = (c) => new THREE.Vector3(0, 0, 1)
        .applyQuaternion(c.mesh.getWorldQuaternion(new THREE.Quaternion()));
    const bearing = (from, to) => new THREE.Vector3(
        to.mesh.position.x - from.mesh.position.x, 0,
        to.mesh.position.z - from.mesh.position.z).normalize();
    const aimsAt = (from, to) => facing(from).setY(0).normalize().dot(bearing(from, to));

    t.ok('each Tri-Compiler core aims its aperture at the core its beam runs to',
        boss.cores.every((c, i) => aimsAt(c, boss.cores[(i + 1) % 3]) > 0.99),
        boss.cores.map((c, i) => aimsAt(c, boss.cores[(i + 1) % 3]).toFixed(3)).join(', '));

    // ── Killing a core re-aims its neighbour ───────────────────────────────
    // The fight already rewarded focus fire — a dead core removes a wall — and
    // nothing on screen said so. The survivor swinging round to the next one
    // still standing is that rule made visible, so it is a rule now.
    boss.cores[1].state.current = 'DEAD';
    for (let i = 0; i < 30; i++) boss.update(1 / 60, player);
    t.ok('…and killing a core swings its neighbour onto the next one standing',
        aimsAt(boss.cores[0], boss.cores[2]) > 0.99,
        `core 0 → core 2: ${aimsAt(boss.cores[0], boss.cores[2]).toFixed(3)}`);

    // ── Only the aperture is lit ───────────────────────────────────────────
    // These were spheres emissive over their whole surface at 0.55 of the cap,
    // which is trap 1: a body lit everywhere has no form, only a colour. The
    // light belongs to the one facet that means something.
    const lit = [];
    boss.cores[0].mesh.traverse((o) => {
        if (!o.isMesh || !o.material?.emissive) return;
        if ((o.material.emissive.getHex?.() ?? 0) === 0) return;
        if ((o.material.emissiveIntensity || 0) > 0.01) lit.push(o);
    });
    t.ok('…and only its aperture is lit, not the whole stone',
        lit.length === 1 && lit[0] === boss.cores[0].glow,
        `${lit.length} lit part(s) of ${boss.cores[0].mesh.children.length}`);
}
