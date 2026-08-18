// tests/game/dressing.spec.mjs — the one thing in a room that moves on its own.
//
// GATE IT ON THE PHYSICS, NOT THE PICTURE.
//
// `docs/HOW-TO-CLOSE-THE-GAP.md` §3 item 3 says so in as many words, and the
// reason is the whole shape of this file. A vertex-shader sway moves the MESH.
// The room answers "is there ground here" from the voxel MAP:
//
//     built.getVoxelAt(x, y, z) || platformBuilt?.getVoxelAt?.(x, y, z)
//
// So displacing anything those two maps describe puts the player standing where
// the object used to be while the object is somewhere else. It is silent, it
// survives every screenshot, and no luminance gate can see it.
//
// The dressing therefore lives in a THIRD mesh with its own map that neither
// branch consults. Sections 2 and 3 are the assertions that matter: every cell
// of every hanging piece in the campaign is invisible to the room's voxel
// query, and building the campaign with dressing produces the identical set of
// collision solids as building it without.
//
// WHAT IS NOT TESTED HERE, STATED PLAINLY: whether the sway is visible. That is
// GLSL running on a GPU, and a JS re-implementation of the wave would be two
// copies of one piece of arithmetic agreeing with each other — this project has
// shipped that mistake and named it. Section 5 checks the generated shader
// SOURCE and the uniform WIRING, which is what can be checked honestly here;
// `tests/qa/ambient-motion.mjs` is what watches it move.

import * as THREE from 'three';
import fs from 'node:fs';
import {
    stampDressing, makeDressingMaterial, makeDressingDepthMaterial,
    updateDressingSway, liveSwayCount,
    SWAY_KINDS, FLOOR_CLEARANCE, MAX_HANG, SWAY_X, SWAY_Z,
} from '../../src/game/world/dressing.js';
import { createDungeon, ROOM_STRIDE } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { KITS } from '../../src/game/levels/dungeon-kits.js';
import { rakeRoom } from '../../src/game/world/wall-profile.js';
import { BEAT_LIST } from './_beat-defs.mjs';

/** The hero occupies cells 1 and 2 standing on a floor whose top is y=1. */
const BODY_TOP_CELL = 2;

function keyStoreStub() {
    const open = new Set();
    return {
        isOpen: (id) => open.has(id), open: (id) => open.add(id),
        mapPickup: () => false, takeMapPickup() {},
        isPickupTaken: () => false, takePickup() {},
        visited: () => [], visit() {},
    };
}

function bake(def) {
    const cw = new CollisionWorld();
    const scene = new THREE.Scene();
    const level = createDungeon(
        { scene, collisionWorld: cw, particles: null },
        { ...def, prebake: true }, { keyStore: keyStoreStub() },
    );
    return { level, cw, scene };
}

/** Every solid id currently registered, as a comparable set. */
function solidIds(cw) {
    const out = new Set();
    for (const id of cw.solids ? cw.solids.keys() : []) out.add(id);
    return out;
}

/** A minimal shader object of the shape three.js hands to onBeforeCompile. */
function stubShader() {
    // INCLUDES ONLY WHAT THREE.JS EMITS. The first version of this fixture also
    // carried the `vAoLevel` and `vWorldPosition` lines — the ones the LEVEL
    // material injects — so after both hooks ran there were two world-position
    // assignments, a string `.replace` substituted the first, and the ordering
    // assertion failed against a shader no GPU would ever be handed. A fixture
    // that mimes the output of the thing under test cannot test it.
    return {
        uniforms: {},
        vertexShader: [
            '#include <common>',
            'void main() {',
            '#include <begin_vertex>',
            'gl_Position = projectionMatrix * vec4(transformed, 1.0);',
            '}',
        ].join('\n'),
        fragmentShader: '#include <common>\n#include <color_fragment>\nvoid main() {}',
    };
}

export function run(t) {
    // ── 1. Every dungeon declares a hanging kind, and it is a real one ─────
    for (const [id, kit] of Object.entries(KITS)) {
        t.ok(`${kit.name} declares hanging dressing`, typeof kit.sway === 'string', id);
        t.ok(`…and ${kit.sway} is a kind that exists`, !!SWAY_KINDS[kit.sway],
            `${id} sway=${kit.sway}`);
    }

    // ── 2. THE PHYSICS RULE ────────────────────────────────────────────────
    //
    // Read out of the rooms the GAME baked, via the `dressingFor` seam, not by
    // calling `stampDressing` again — the invariant is about these cells.
    //
    // Sampled at cell CENTRES. A first pass sampled the mesh's VERTICES and
    // reported five hits campaign-wide; every one was a vertex sitting on the
    // shared face with the wall behind it, where the floor of `getVoxelAt`
    // lands in the NEXT cell. It was answering about the wall.
    {
        let cells = 0, seen = 0, tooLow = 0, dressed = 0, dungeons = 0;
        for (const def of BEAT_LIST) {
            const { level } = bake(def);
            dungeons++;
            for (const [rid, room] of Object.entries(def.rooms)) {
                const d = level.dressingFor(rid);
                if (!d) continue;
                dressed++;
                const ox = (room.grid?.[0] || 0) * ROOM_STRIDE;
                const oz = (room.grid?.[1] || 0) * ROOM_STRIDE;
                for (const key of d.map.keys()) {
                    const [lx, ly, lz] = key.split(',').map(Number);
                    cells++;
                    if (ly <= BODY_TOP_CELL) tooLow++;
                    if (level.getVoxelAt(ox + lx + 0.5, ly + 0.5, oz + lz + 0.5)) seen++;
                }
            }
            level.dispose();
        }
        t.ok('the campaign baked hanging dressing at all', cells > 500,
            `${cells} cells across ${dressed} rooms in ${dungeons} dungeons`);
        t.ok('no hanging cell is ever returned by the room\'s voxel query',
            seen === 0, `${seen} of ${cells} cells answered solid`);
        t.ok('and none of it reaches the cells the hero occupies',
            tooLow === 0, `${tooLow} cells at or below y=${BODY_TOP_CELL}`);
    }

    // ── 3. …and it registers no collision at all ───────────────────────────
    //
    // Built twice: once as shipped, once with `sway` stripped from every kit.
    // If the two collision worlds hold the same solids, the dressing added
    // none. Comparing against a REMEMBERED count would go stale the first time
    // a room gained a crate.
    {
        const withIds = new Map();
        for (const def of BEAT_LIST) {
            const { level, cw } = bake(def);
            withIds.set(def.id, solidIds(cw));
            level.dispose();
        }
        const saved = new Map();
        for (const [id, kit] of Object.entries(KITS)) { saved.set(id, kit.sway); delete kit.sway; }
        let mismatched = 0, compared = 0;
        try {
            for (const def of BEAT_LIST) {
                const { level, cw } = bake(def);
                const bare = solidIds(cw);
                const dressed = withIds.get(def.id);
                compared++;
                if (bare.size !== dressed.size) { mismatched++; }
                else for (const id of bare) if (!dressed.has(id)) { mismatched++; break; }
                level.dispose();
            }
        } finally {
            for (const [id, kit] of Object.entries(KITS)) kit.sway = saved.get(id);
        }
        t.ok('the with/without comparison actually ran', compared === BEAT_LIST.length,
            `${compared} dungeons`);
        t.ok('hanging dressing registers no collision solids',
            mismatched === 0, `${mismatched} dungeons differ`);
        t.ok('and the kits were put back', Object.values(KITS).every((k) => !!k.sway));
    }

    // ── 4. Placement rules, and determinism ────────────────────────────────
    {
        const room = { half: 9, wallH: 4, doors: [{ side: 'N', at: 0 }], wallColor: 0x556677 };
        const kit = { ...KITS['beat-05-citadel'] };
        const raked = rakeRoom(room, kit);
        const a = stampDressing(kit, raked, 'spec-room');
        const b = stampDressing(kit, raked, 'spec-room');
        t.ok('a room hangs something', a.placed > 0, `${a.placed} pieces`);
        t.ok('the same room hangs the same thing twice',
            JSON.stringify([...a.map.entries()].sort()) === JSON.stringify([...b.map.entries()].sort()));
        t.ok('a different room hangs something different',
            JSON.stringify([...a.map.keys()].sort())
            !== JSON.stringify([...stampDressing(kit, raked, 'other-room').map.keys()].sort()));

        let minY = Infinity, maxY = -Infinity;
        const zs = new Set(), xs = new Set();
        for (const key of a.map.keys()) {
            const [lx, ly, lz] = key.split(',').map(Number);
            minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
            zs.add(lz); xs.add(lx);
        }
        t.ok('nothing hangs below the clearance floor', minY >= FLOOR_CLEARANCE,
            `lowest y=${minY}, floor=${FLOOR_CLEARANCE}`);
        t.ok('every piece hangs from the same course', maxY === a.anchorY,
            `top y=${maxY}, anchor=${a.anchorY}`);
        t.ok('…and that course is one BELOW the wall top, so the wall shades it',
            a.anchorY === raked.wallH.far - 1,
            `anchor=${a.anchorY}, far wall top=${raked.wallH.far}`);
        t.ok('nothing hangs longer than the shader normalises over',
            maxY - minY < MAX_HANG, `span=${maxY - minY + 1}`);
        // ONE z, and it is the cell in front of the north wall. The rest of the
        // safety argument rests on this: the camera is fixed-yaw, so geometry
        // at the north wall is permanently behind the hero and can never come
        // between them and the lens.
        t.ok('it hangs on one wall only, in front of the far one',
            zs.size === 1 && [...zs][0] === -room.half + 1,
            `z cells: ${[...zs].join(',')}`);
        // The door at N0 occupies cells -1 and 0 (DOOR_WIDTH is 2, and
        // `doorCells` runs `at-1 .. at`). A banner across it is a lintel the
        // player will duck under looking for a trigger. The margin checked
        // here is the DOOR's, derived, not a number copied from the module —
        // the first draft hard-coded 3, which was the old margin, and went red
        // when the module widened its placement rather than when it broke.
        const doorCells = new Set([-1, 0]);
        t.ok('and never across a door on that wall',
            ![...xs].some((x) => doorCells.has(x)),
            `x cells: ${[...xs].sort((p, q) => p - q).join(',')}`);

        const short = stampDressing(kit, rakeRoom({ half: 9, wallH: { far: 4, near: 3 } }, kit), 'r');
        t.ok('a wall with no headroom hangs nothing', short.placed === 0);
        t.ok('a room too small to dress hangs nothing',
            stampDressing(kit, rakeRoom({ half: 4, wallH: 4 }, kit), 'r').placed === 0);
        t.ok('a kit with no sway hangs nothing',
            stampDressing({ name: 'X', accent: 1 }, raked, 'r').placed === 0);
    }

    // ── 5. The shader, and the wire from the frame loop to it ──────────────
    //
    // Source and wiring, which is what is honestly checkable without a GPU.
    // The one thing every other assertion here would survive is the frame loop
    // never calling `updateDressingSway` at all, so that is checked separately,
    // at the call site, below.
    {
        const mat = makeDressingMaterial(9, 0, 0.85);
        const sh = stubShader();
        mat.onBeforeCompile(sh);
        const v = sh.vertexShader;
        t.ok('the droop reaches the vertex stage', /uSwayTime/.test(v) && /transformed\.x \+=/.test(v));
        // ORDERING, and the first draft of this could not fail. It asked
        // whether `transformed.x +=` came before the LAST `vWorldPosition =` —
        // but the droop block ENDS with a `vWorldPosition =` of its own, so
        // wherever the block was injected the answer was yes. Moving the whole
        // block after the world position stayed green.
        //
        // The real rule is that the fragment stage's world position must be the
        // DISPLACED one, or the triplanar grain swims over a swaying banner. So:
        // exactly one assignment survives (the replace substitutes rather than
        // appends), and the droop is above it.
        const worldWrites = (v.match(/vWorldPosition = /g) || []).length;
        t.ok('the world position is written exactly once', worldWrites === 1,
            `${worldWrites} assignments`);
        t.ok('…and the droop happens before it, so the grain follows the cloth',
            worldWrites === 1 && v.indexOf('transformed.x +=') < v.indexOf('vWorldPosition ='));
        t.ok('…and the level material\'s own hook still ran',
            /vAoLevel = aoLevel;/.test(v) && /attribute float aoLevel;/.test(v));
        t.ok('the amplitudes are the exported ones',
            v.includes(SWAY_X.toFixed(3)) && v.includes(SWAY_Z.toFixed(3)));
        // Zero-mean: a bare `sin`/`cos` with nothing added to it. A constant
        // term would drift the geometry one way and slowly change what the
        // luminance gate meters — the failure `room-lights.js` documents.
        const swayLines = v.split('\n').filter((l) => /transformed\.[xz] \+=/.test(l));
        t.ok('both waves are zero-mean', swayLines.length === 2
            && swayLines.every((l) => /\+= sin\(/.test(l) && !/\+= *[\d.]+ *\+/.test(l)),
            swayLines.join(' | '));
        t.ok('the program cache key differs from the level material\'s',
            mat.customProgramCacheKey() !== 'ss-level-family-v4-ao-detail-bump');

        // THE WIRE. `updateDressingSway` has to be writing the uniform object
        // this material actually handed the shader — not a copy of it.
        const uni = mat.userData.swayUniforms;
        t.ok('the material exposes its uniforms', !!uni && 'uSwayTime' in uni);
        t.ok('…and the shader got that exact object', sh.uniforms.uSwayTime === uni.uSwayTime);
        t.ok('stiffness reaches the amplitude', uni.uSwayAmp.value === 0.85);

        // ── The shadow swings with the cloth ───────────────────────────────
        //
        // three.js draws shadow maps with its OWN depth material, which knows
        // nothing about a hook installed on the surface material. Left alone,
        // the banner moves and its shadow stays put — up to 0.26 world units of
        // daylight between an object and its own shadow, on a wall one cell
        // behind it. This was not noticed until the shadow census refused a
        // mesh that received shadows without casting honest ones.
        const dsh = {
            uniforms: {},
            vertexShader: ['#include <common>', 'void main() {',
                '#include <begin_vertex>', '}'].join('\n'),
        };
        makeDressingDepthMaterial(uni).onBeforeCompile(dsh);
        t.ok('the shadow pass carries the same droop',
            /transformed\.x \+= sin\(uSwayTime/.test(dsh.vertexShader));
        t.ok('…on the same uniform objects, not a copy',
            dsh.uniforms.uSwayTime === uni.uSwayTime && dsh.uniforms.uSwayAmp === uni.uSwayAmp);
        t.ok('…and the depth program has a cache key of its own',
            makeDressingDepthMaterial(uni).customProgramCacheKey() !== mat.customProgramCacheKey());
    }

    // ── 6. Registration, and the frame-loop call site ──────────────────────
    {
        const before = liveSwayCount();
        const { level, scene } = bake(BEAT_LIST[0]);
        const live = liveSwayCount();
        t.ok('baking a dungeon registers its dressing for update', live > before,
            `${before} -> ${live}`);
        const meshes = [];
        scene.traverse((o) => { if (/^room-dressing:/.test(o.name || '')) meshes.push(o); });
        t.ok('…and the meshes are named so a probe can find them by intent',
            meshes.length > 0, `${meshes.length} dressing meshes`);
        t.ok('every dressing mesh receives shadow, as the census requires',
            meshes.every((m) => m.receiveShadow === true));
        t.ok('…casts one', meshes.every((m) => m.castShadow === true));
        t.ok('…and casts it from the DISPLACED geometry',
            meshes.every((m) => !!m.customDepthMaterial));

        // THE WIRE AGAIN, and section 5 could not see this one. There it built
        // its own depth material and handed it the uniforms itself, so it was
        // asking whether `makeDressingDepthMaterial` keeps what it is given —
        // never whether `buildDressing` gives it the right thing. Handing the
        // depth pass a COPY leaves the banner and its shadow swinging on two
        // clocks, and that mutation stayed green until this line existed.
        const wired = Object.keys(BEAT_LIST[0].rooms)
            .map((r) => level.dressingFor(r)).filter(Boolean);
        t.ok('the baked rooms have both materials', wired.length > 0 &&
            wired.every((d) => d.material && d.depthMaterial));
        const shareClock = wired.every((d) => {
            const surface = { uniforms: {}, vertexShader: stubShader().vertexShader, fragmentShader: 'x' };
            const depth = { uniforms: {}, vertexShader: stubShader().vertexShader };
            d.material.onBeforeCompile(surface);
            d.depthMaterial.onBeforeCompile(depth);
            return surface.uniforms.uSwayTime === depth.uniforms.uSwayTime;
        });
        t.ok('…and the shadow swings on the SAME clock as the cloth', shareClock);

        updateDressingSway(3.25);
        const anyRoom = Object.keys(BEAT_LIST[0].rooms).map((r) => level.dressingFor(r)).find(Boolean);
        t.ok('the update reaches a baked room\'s uniforms',
            anyRoom?.material.userData.swayUniforms.uSwayTime.value === 3.25);

        level.dispose();
        t.ok('and disposing the dungeon de-registers all of it',
            liveSwayCount() === before, `${liveSwayCount()} left, expected ${before}`);
    }

    // ── 7. The frame loop calls it ─────────────────────────────────────────
    //
    // Every assertion above stays green if `index.js` never runs the update.
    // Read from source, next to the flicker it shares a clock with — if the two
    // ever stop being driven by one `ambientT`, a room's light and its cloth
    // drift apart over a long session and nothing else would notice.
    {
        const src = fs.readFileSync('src/game/index.js', 'utf8');
        t.ok('index.js imports the sway update', /import \{ updateDressingSway \}/.test(src));
        const flicker = src.indexOf('updateRoomLightFlicker(ambientT)');
        const sway = src.indexOf('updateDressingSway(ambientT)');
        t.ok('…and calls it in the frame loop, on the ambient clock', sway > 0);
        t.ok('…alongside the fixture flicker, not on a clock of its own',
            flicker > 0 && Math.abs(src.slice(Math.min(flicker, sway), Math.max(flicker, sway)).split('\n').length) < 8,
            `${Math.abs(sway - flicker)} chars apart`);
    }
}
