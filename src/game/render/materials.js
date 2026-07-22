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
    // Metalness is kept small: this engine has little environment light, so a
    // strongly metallic surface would read dark and pull low-ambient (Abyss)
    // rooms below the luminance band. A hint of metal is enough to differentiate
    // iron/machinery without darkening the frame.
    const metal = 0.12 * smoothstep(0.0, 0.3, sat) * (lum >= 0.4 ? 1 : 0.4)
        + 0.10 * (lum >= 0.28 && sat < 0.12 ? 1 : 0);
    return {
        roughness: clamp(0.88 - 0.45 * polish, 0.2, 1),
        metalness: clamp(0.04 + metal, 0, 0.6),
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
    float _m = 0.12 * smoothstep(0.0, 0.3, _sat2) * (_lum2 >= 0.4 ? 1.0 : 0.4)
             + 0.10 * ((_lum2 >= 0.28 && _sat2 < 0.12) ? 1.0 : 0.0);
    metalnessFactor = clamp(metalnessFactor + _m, 0.0, 0.6);
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
    // All level materials share this hook → share one compiled program.
    mat.customProgramCacheKey = () => 'ss-level-family-v1';
    return mat;
}
