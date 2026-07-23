// Material families for the level mesh (Ticket G / Change 6.1).
//
// The whole level used one MeshStandardMaterial at roughness 0.88 / metalness
// 0.04, so stone, iron, bone, ice, gold seams, and magma all responded the
// same. Rather than partition the merged voxel map into extra draw calls, this
// installs the audit's sanctioned bounded `onBeforeCompile` hook: it derives a
// per-fragment roughness/metalness response from the vertex-color CLASS while
// leaving albedo, emissive, fog, shadows, tone mapping, and environment
// lighting exactly as the standard shader computes them. Because albedo is
// untouched, mean scene luminance — and the certification band — is unchanged;
// only specular response differs, giving stone its matte read and metal/ice/
// gold/magma their sheen.
//
// classifyFamily() is a pure mirror of the in-shader logic for unit tests.

import * as THREE from 'three';

export const FAMILY = {
    MATTE: 'matte',       // dry stone, cloth, ash — high roughness, no metal
    POLISHED: 'polished', // ice, wet stone, bone highlights — low roughness
    METAL: 'metal',       // iron, machinery, gold seams — low roughness + metal
    ENERGY: 'energy',     // magma, neon, emissive accents — saturated sheen
};

/** RGB (0..1) → { lum, sat, mx }. */
function props(r, g, b) {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return { lum, sat: mx - mn, mx };
}

/**
 * Classify a 0xRRGGBB color into a material family — the CPU mirror of the GLSL
 * response, used by tests and any game-side logic that wants the class.
 */
export function classifyFamily(hex) {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const { lum, sat } = props(r, g, b);
    if (sat >= 0.5) return FAMILY.ENERGY;              // vivid accents: magma/neon/violet/gold
    if (lum >= 0.5) return FAMILY.POLISHED;            // bright surfaces: ice/limestone/bone
    if (lum >= 0.28 && sat < 0.2) return FAMILY.METAL; // mid neutral grey: iron/machinery
    return FAMILY.MATTE;                               // dark / earthy: charcoal, deep stone
}

/** Continuous polish/metal factors from color props (mirrors the shader math). */
export function response(hex) {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const { lum, sat } = props(r, g, b);
    const brightNeutral = smoothstep(0.5, 0.9, lum) * (1 - smoothstep(0.1, 0.5, sat));
    const saturated = smoothstep(0.35, 0.8, sat);
    const polish = Math.min(1, brightNeutral + saturated);
    // Metalness used to be capped at 0.12 with this note:
    //
    //     this engine has little environment light, so a strongly metallic
    //     surface would read dark
    //
    // Which was true, and the correct workaround for a missing input:
    // `scene.environment` was null, so a metal had nothing to reflect and
    // resolved to a dark surface. The family system classified gold, iron and
    // ice correctly and then flattened all three back to painted plaster.
    //
    // render/mood-environment.js supplies a real PMREM environment now, so the
    // cap comes off and the families separate by soft bands that mirror
    // classifyFamily's thresholds. Bands rather than steps because a hard cut
    // at a luminance boundary shows up as a seam across a gradient wall.
    const metalBand = smoothstep(0.24, 0.32, lum)
        * (1 - smoothstep(0.46, 0.56, lum))
        * (1 - smoothstep(0.14, 0.24, sat));
    const polishedBand = smoothstep(0.46, 0.56, lum)
        * (1 - smoothstep(0.40, 0.52, sat));
    const energyBand = smoothstep(0.38, 0.52, sat);
    const metal = 0.61 * metalBand + 0.31 * polishedBand + 0.20 * energyBand;
    return {
        roughness: clamp(0.88 - 0.45 * polish, 0.2, 1),
        metalness: clamp(0.04 + metal, 0, 0.7),
    };
}

function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// GLSL injected after the standard roughness/metalness includes. It reads the
// `vColor` varying (present because vertexColors is enabled) and reshapes
// roughnessFactor / metalnessFactor only.
const ROUGH_CHUNK = /* glsl */`
#include <roughnessmap_fragment>
{
    float _lum = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
    float _mx = max(max(vColor.r, vColor.g), vColor.b);
    float _mn = min(min(vColor.r, vColor.g), vColor.b);
    float _sat = _mx - _mn;
    float _brightNeutral = smoothstep(0.5, 0.9, _lum) * (1.0 - smoothstep(0.1, 0.5, _sat));
    float _polish = clamp(_brightNeutral + smoothstep(0.35, 0.8, _sat), 0.0, 1.0);
    roughnessFactor = clamp(roughnessFactor - 0.45 * _polish, 0.2, 1.0);
}
`;
const METAL_CHUNK = /* glsl */`
#include <metalnessmap_fragment>
{
    float _lum2 = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
    float _mx2 = max(max(vColor.r, vColor.g), vColor.b);
    float _mn2 = min(min(vColor.r, vColor.g), vColor.b);
    float _sat2 = _mx2 - _mn2;
    float _metalBand = smoothstep(0.24, 0.32, _lum2)
                     * (1.0 - smoothstep(0.46, 0.56, _lum2))
                     * (1.0 - smoothstep(0.14, 0.24, _sat2));
    float _polishedBand = smoothstep(0.46, 0.56, _lum2)
                        * (1.0 - smoothstep(0.40, 0.52, _sat2));
    float _energyBand = smoothstep(0.38, 0.52, _sat2);
    float _m = 0.61 * _metalBand + 0.31 * _polishedBand + 0.20 * _energyBand;
    metalnessFactor = clamp(metalnessFactor + _m, 0.0, 0.7);
}
`;

/**
 * A MeshStandardMaterial for the level mesh with the family response hook. Same
 * base look as before (vertexColors, roughness 0.88, metalness 0.04); the hook
 * only sharpens specular by vertex-color class.
 */
export function makeLevelMaterial(opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: opts.roughness ?? 0.88,
        metalness: opts.metalness ?? 0.04,
        ...opts,
    });
    mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <roughnessmap_fragment>', ROUGH_CHUNK)
            .replace('#include <metalnessmap_fragment>', METAL_CHUNK);
    };
    // Deliberately NOT setting envMapIntensity here. It multiplies with
    // `scene.environmentIntensity`, so setting both gives two knobs for one
    // quantity — and since only level geometry goes through this factory, the
    // effect would be walls reflecting less than the props standing against
    // them, for no reason anybody could later reconstruct. The environment is
    // tuned in one place: render/mood-environment.js.
    // All level materials share this hook → share one compiled program.
    // Bumped to v2 with the metalness rebalance: the old key would have served
    // a cached program compiled from the previous GLSL.
    mat.customProgramCacheKey = () => 'ss-level-family-v2';
    return mat;
}
