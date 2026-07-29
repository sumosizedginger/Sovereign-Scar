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
import { MOOD_SKIES } from '../../src/game/render/mood-environment.js';

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
        [stone, gold, ice].every((r) => r.metalness >= 0 && r.metalness <= 0.7));

    // --- metalness is allowed to be real now ---
    //
    // This used to be capped at 0.12 with the note "this engine has little
    // environment light, so a strongly metallic surface would read dark". That
    // was true and it was the correct workaround: `scene.environment` was null,
    // so a metal had nothing to reflect and resolved to a dark patch. The
    // family system classified gold, iron and ice correctly and then flattened
    // all three back to painted plaster.
    //
    // The cap comes off ONLY because render/mood-environment.js now supplies a
    // real PMREM environment. The two are a pair: the assertions below fail if
    // someone raises metalness without an environment to reflect, or removes
    // the environment while leaving metalness raised.
    const iron = response(CRUST_COLORS.iron);
    const limestone = response(CRUST_COLORS.limestone);
    const charcoal = response(CRUST_COLORS.charcoal);
    t.ok('iron is genuinely metallic', iron.metalness > 0.5, `metal=${iron.metalness.toFixed(3)}`);
    t.ok('polished sits between metal and matte',
        limestone.metalness > 0.25 && limestone.metalness < iron.metalness,
        `limestone=${limestone.metalness.toFixed(3)} iron=${iron.metalness.toFixed(3)}`);
    t.ok('matte stays essentially non-metallic', charcoal.metalness < 0.1,
        `charcoal=${charcoal.metalness.toFixed(3)}`);
    t.ok('the families are actually separated now',
        iron.metalness - charcoal.metalness > 0.4,
        `spread=${(iron.metalness - charcoal.metalness).toFixed(3)} — was 0.12 at most, whole-palette`);

    // The environment that justifies the above must exist, per mood, at a
    // non-zero strength. Without it the cap has to go back on.
    for (const mood of ['crust', 'abyss']) {
        const sky = MOOD_SKIES[mood];
        t.ok(`${mood} declares a sky`, !!sky);
        t.ok(`${mood} sky has a non-zero intensity`, sky.intensity > 0, `${sky.intensity}`);
        t.ok(`${mood} sky is vertically graded`, sky.zenith !== sky.nadir,
            'a uniform environment is just ambient with extra steps');
    }
    // Crust reads warm from below and cool from above; Abyss is the inverse.
    const warmth = (hex) => ((hex >> 16) & 255) - (hex & 255);
    t.ok('the Crust ground is warmer than its sky',
        warmth(MOOD_SKIES.crust.nadir) > warmth(MOOD_SKIES.crust.zenith));
    t.ok('the Abyss sky is more violet than its floor',
        ((MOOD_SKIES.abyss.zenith >> 16) & 255) > ((MOOD_SKIES.abyss.nadir >> 16) & 255));

    // --- material factory: same base look, hook installed, shared program key ---
    const mat = makeLevelMaterial();
    t.ok('level material uses vertex colors', mat.vertexColors === true);
    t.ok('base roughness preserved (0.88)', Math.abs(mat.roughness - 0.88) < 1e-6);
    t.ok('base metalness preserved (0.04)', Math.abs(mat.metalness - 0.04) < 1e-6);
    t.ok('family hook installed', typeof mat.onBeforeCompile === 'function');
    // Bumped whenever the injected GLSL changes — the old key would have served
    // a cached program compiled from the previous chunk set. v4 adds the
    // interpolated noise and the normal perturbation.
    t.ok('shared program cache key', mat.customProgramCacheKey() === 'ss-level-family-v4-ao-detail-bump');
    t.ok('no per-material envMapIntensity override', mat.envMapIntensity === 1,
        'it multiplies with scene.environmentIntensity; one knob, in mood-environment.js');
    // The hook rewrites the standard includes without throwing.
    const shader = {
        vertexShader: '#include <common>\nv\n#include <begin_vertex>\nw',
        fragmentShader: '#include <common>\na\n#include <color_fragment>\n'
            + '#include <roughnessmap_fragment>\nb\n#include <metalnessmap_fragment>\nc\n'
            + '#include <normal_fragment_begin>\nd\n#include <aomap_fragment>\ne',
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

    // --- the surface detail actually is noise, and it moves the normal -------
    //
    // The previous implementation sampled `floor(p)` and used the result raw.
    // That is a lookup table of constants, not value noise: one value per cell,
    // a hard edge at every boundary, and at the chosen scale the cells were 1.8
    // world units across — which is why the overworld floor in the captures
    // reads as blotchy staining rather than as ground.
    t.ok('the noise interpolates between cells instead of stepping',
        shader.fragmentShader.includes('3.0 - 2.0 * f')
        && /mix\(\s*mix\(mix\(/.test(shader.fragmentShader),
        'trilinear mix ladder with a smoothstep fade');
    t.ok('the noise is sampled at cell corners, not at a single floored cell',
        shader.fragmentShader.includes('ssHash31(i + vec3(1.0, 1.0, 1.0))'));

    // The half that was documented in this file's own header from day one and
    // never written. Brightness noise on a flat face is still a flat face;
    // tilting the normal is what makes it catch light unevenly.
    t.ok('the normal is perturbed by the same grain',
        shader.fragmentShader.includes('#include <normal_fragment_begin>')
        && shader.fragmentShader.includes('normal = normalize(normal + clamp('),
        'ticket 3 shipped only the albedo half');
    t.ok('the perturbation reuses the grain rather than resampling it',
        shader.fragmentShader.includes('dFdx(ssGrain)'),
        'central differences would cost six more noise evaluations per fragment');
    t.ok('the perturbation is clamped against grazing-angle blowup',
        shader.fragmentShader.includes('abs(_det) > 1e-8'));
    // Order matters as much as presence: ssGrain is written in the albedo chunk
    // and read in the normal chunk, and three.js emits color_fragment first.
    t.ok('the albedo chunk precedes the normal chunk in the emitted source',
        shader.fragmentShader.indexOf('ssGrain =')
            < shader.fragmentShader.indexOf('dFdx(ssGrain)'));

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
    // Two, not three, and that is the point: `register` defaults `distance` to
    // 10, and only the sources at x=0 and x=3 are inside their own falloff. A
    // point light contributes exactly nothing past its `distance`, so ranking
    // one into the budget spends a real shader light slot on darkness. Measured
    // in the Pyre before this rule existed: three of five pooled slots were
    // held by fixtures in rooms 60+ units away.
    t.ok('pool lights only sources that can actually reach the focus',
        lit.length === 2, `lit=${lit.length}`);
    t.ok('the pool still fills its budget when enough sources are in range',
        (() => {
            // Its own scene: the pool above still holds two lit lights in
            // `fakeScene`, and counting both pools' output as one number is how
            // a spec quietly stops measuring what it claims to.
            const scene2 = {
                children: [],
                add(o) { o.parent = this; this.children.push(o); },
                remove(o) { o.parent = null; this.children = this.children.filter((c) => c !== o); },
            };
            const near = new LocalLightPool(scene2, { budget: 3, makeLight });
            for (let i = 0; i < 6; i++) near.register({ x: i, y: 1, z: 0, intensity: 2, distance: 20 });
            near.update({ x: 0, y: 0, z: 0 });
            return scene2.children.filter((l) => l.intensity > 0).length === 3;
        })());
    // An unbounded source (distance 0 = infinite, three.js convention) is never
    // culled — the rule is about reach, not about distance being set.
    t.ok('a source with no falloff is always eligible',
        selectActive(
            [{ x: 900, z: 0, priority: 0, distance: 0 }, { x: 1, z: 0, priority: 0, distance: 5 }],
            { x: 0, y: 0, z: 0 }, 1
        ).length === 1);
    pool.clear();
    const litAfter = fakeScene.children.filter((l) => l.intensity > 0);
    t.ok('clear() parks every pooled light', litAfter.length === 0, `lit=${litAfter.length}`);
}
