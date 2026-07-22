// tests/game/material-hierarchy.spec.mjs
// Ticket G — material & lighting hierarchy. Covers the material-family classifier
// and response, the mean-preserving surface mottling, and the pooled local-light
// budget. All GL-free: materials/attributes construct fine in node.

import * as THREE from 'three';
import {
    FAMILY, classifyFamily, response, makeLevelMaterial,
} from '../../src/game/render/materials.js';
import { mottleColors } from '../../src/game/render/surface-detail.js';
import { selectActive, LocalLightPool } from '../../src/game/fx/local-light-pool.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../../src/game/assets/palettes.js';

export function run(t) {
    // --- classifier: palette classes land in the right family ---
    t.ok('iron reads as metal', classifyFamily(CRUST_COLORS.iron) === FAMILY.METAL,
        classifyFamily(CRUST_COLORS.iron));
    t.ok('ice reads as polished', classifyFamily(ABYSS_COLORS.ice) === FAMILY.POLISHED,
        classifyFamily(ABYSS_COLORS.ice));
    t.ok('limestone reads as polished', classifyFamily(CRUST_COLORS.limestone) === FAMILY.POLISHED,
        classifyFamily(CRUST_COLORS.limestone));
    t.ok('magma reads as energy', classifyFamily(ABYSS_COLORS.magma) === FAMILY.ENERGY,
        classifyFamily(ABYSS_COLORS.magma));
    t.ok('neon reads as energy', classifyFamily(ABYSS_COLORS.neon) === FAMILY.ENERGY,
        classifyFamily(ABYSS_COLORS.neon));
    t.ok('deep stone reads as matte', classifyFamily(CRUST_COLORS.slateDark) === FAMILY.MATTE,
        classifyFamily(CRUST_COLORS.slateDark));

    // --- response: matte stays rough, sheen families sharpen specular ---
    const stone = response(CRUST_COLORS.slate);
    const gold = response(CRUST_COLORS.goldLeaf);
    const ice = response(ABYSS_COLORS.ice);
    t.ok('matte stone stays rough (≥0.8)', stone.roughness >= 0.8, `r=${stone.roughness}`);
    t.ok('gold seam is glossier than stone', gold.roughness < stone.roughness,
        `gold=${gold.roughness} stone=${stone.roughness}`);
    t.ok('ice is glossier than stone', ice.roughness < stone.roughness,
        `ice=${ice.roughness}`);
    t.ok('all roughness within bounds',
        [stone, gold, ice].every((r) => r.roughness >= 0.2 && r.roughness <= 1));
    t.ok('all metalness within bounds',
        [stone, gold, ice].every((r) => r.metalness >= 0 && r.metalness <= 0.6));

    // --- material factory: same base look, hook installed, shared program key ---
    const mat = makeLevelMaterial();
    t.ok('level material uses vertex colors', mat.vertexColors === true);
    t.ok('base roughness preserved (0.88)', Math.abs(mat.roughness - 0.88) < 1e-6);
    t.ok('base metalness preserved (0.04)', Math.abs(mat.metalness - 0.04) < 1e-6);
    t.ok('family hook installed', typeof mat.onBeforeCompile === 'function');
    t.ok('shared program cache key', mat.customProgramCacheKey() === 'ss-level-family-v1');
    // The hook rewrites the standard includes without throwing.
    const shader = {
        fragmentShader: 'a\n#include <roughnessmap_fragment>\nb\n#include <metalnessmap_fragment>\nc',
    };
    const beforeLen = shader.fragmentShader.length;
    mat.onBeforeCompile(shader);
    // The chunk re-includes the standard fragment then reshapes the factor, so
    // the include remains but the family math is injected around it.
    t.ok('hook injects roughness family math',
        shader.fragmentShader.includes('_polish')
        && shader.fragmentShader.includes('roughnessFactor = clamp'));
    t.ok('hook injects metalness family math',
        shader.fragmentShader.includes('metalnessFactor = clamp'));
    t.ok('hook keeps the standard includes',
        shader.fragmentShader.includes('#include <roughnessmap_fragment>')
        && shader.fragmentShader.includes('#include <metalnessmap_fragment>'));
    t.ok('hook grew the shader', shader.fragmentShader.length > beforeLen);

    // --- mottling: deterministic and mean-preserving ---
    function coloredGeo() {
        const g = new THREE.BufferGeometry();
        const N = 400;
        const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            pos[i * 3] = (i % 10); pos[i * 3 + 1] = ((i / 10) | 0) % 10; pos[i * 3 + 2] = (i % 7);
            col[i * 3] = 0.5; col[i * 3 + 1] = 0.42; col[i * 3 + 2] = 0.36; // uniform mid grey
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return g;
    }
    function meanLum(geo) {
        const c = geo.getAttribute('color');
        let s = 0;
        for (let i = 0; i < c.count; i++) {
            s += 0.299 * c.getX(i) + 0.587 * c.getY(i) + 0.114 * c.getZ(i);
        }
        return s / c.count;
    }
    const g1 = coloredGeo();
    const before = meanLum(g1);
    mottleColors(g1, 0.06);
    const after = meanLum(g1);
    t.ok('mottling preserves mean luminance (<1%)', Math.abs(after - before) / before < 0.01,
        `before=${before.toFixed(4)} after=${after.toFixed(4)}`);
    t.ok('mottling actually varied the surface',
        (() => { const c = g1.getAttribute('color'); return c.getX(0) !== c.getX(37); })());
    // Determinism: same geometry mottled again matches.
    const g2 = coloredGeo();
    mottleColors(g2, 0.06);
    const c1 = g1.getAttribute('color'), c2 = g2.getAttribute('color');
    let identical = true;
    for (let i = 0; i < c1.count; i++) if (Math.abs(c1.getX(i) - c2.getX(i)) > 1e-9) identical = false;
    t.ok('mottling is deterministic', identical);
    // Graceful no-op without attributes.
    t.ok('mottle no-ops on bare geometry',
        mottleColors(new THREE.BufferGeometry(), 0.06) instanceof THREE.BufferGeometry);

    // --- local-light selection: budget of nearest / highest priority ---
    const sources = [
        { x: 0, z: 0, priority: 0 },   // nearest to focus
        { x: 30, z: 0, priority: 0 },
        { x: 3, z: 0, priority: 0 },
        { x: 40, z: 40, priority: 0 },
        { x: 50, z: 0, priority: 0 },
        { x: 60, z: 0, priority: 5 },  // far but high priority → should win a slot
    ];
    const chosen = selectActive(sources, { x: 0, y: 0, z: 0 }, 4);
    t.ok('selection respects the budget', chosen.length === 4, `n=${chosen.length}`);
    t.ok('nearest source chosen', chosen.includes(sources[0]));
    t.ok('high-priority far source chosen', chosen.includes(sources[5]));
    t.ok('a far low-priority source is dropped', !chosen.includes(sources[3]));
    t.ok('fewer sources than budget returns all',
        selectActive(sources.slice(0, 3), { x: 0, z: 0 }, 4).length === 3);

    // --- pool bookkeeping with an injected light factory ---
    const fakeScene = {
        children: [],
        add(o) { o.parent = this; this.children.push(o); },
        remove(o) { o.parent = null; this.children = this.children.filter((c) => c !== o); },
    };
    const makeLight = () => ({
        color: { setHex() {} }, intensity: 0, distance: 0,
        position: { set() {} }, parent: null,
    });
    const pool = new LocalLightPool(fakeScene, { budget: 3, makeLight });
    for (const s of sources) pool.register({ x: s.x, y: 1, z: s.z, intensity: 2, priority: s.priority });
    pool.update({ x: 0, y: 0, z: 0 });
    const lit = fakeScene.children.filter((l) => l.intensity > 0);
    t.ok('pool lights exactly the budget', lit.length === 3, `lit=${lit.length}`);
    pool.clear();
    const litAfter = fakeScene.children.filter((l) => l.intensity > 0);
    t.ok('clear() parks every pooled light', litAfter.length === 0, `lit=${litAfter.length}`);
}
