// Material families for the level mesh (Ticket G / Change 6.1 + graphics overhaul).
//
// The whole level used one MeshStandardMaterial at roughness 0.88 / metalness
// 0.04, so stone, iron, bone, ice, gold seams, and magma all responded the
// same. Rather than partition the merged voxel map into extra draw calls, this
// installs the audit's sanctioned bounded `onBeforeCompile` hook: it derives a
// per-fragment roughness/metalness response from the vertex-color CLASS
// while leaving albedo, emissive, fog, shadows, tone mapping, and environment
// lighting exactly as the standard shader computes them.
//
// Graphics overhaul ticket 1: ambient occlusion used to live in the colour
// attribute, which (a) lights washed out and (b) flipped material families in
// corners. AO is now a separate `aoLevel` attribute applied to indirect light
// only — the same place three.js puts aoMap.
//
// Graphics overhaul ticket 3: triplanar value noise on albedo + a tiny normal
// perturbation, mean-preserving so the certification band survives. Scale
// varies by family (stone coarse, ice fine, metal brushed streaks).

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
// roughnessFactor / metalnessFactor only. Colour is clean albedo after ticket 1.
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

// Apply baked AO to indirect light only (three.js aoMap contract). Direct
// sunlight is left alone so contact darkening reads as shade, not dirt.
const AO_CHUNK = /* glsl */`
#include <aomap_fragment>
{
    float ambientOcclusion = vAoLevel;
    reflectedLight.indirectDiffuse *= ambientOcclusion;
    #if defined( USE_ENVMAP ) && defined( STANDARD )
        float dotNVao = saturate( dot( geometryNormal, geometryViewDir ) );
        reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNVao, ambientOcclusion, material.roughness );
    #endif
}
`;

// Value-noise helpers, INTERPOLATED.
//
// The previous version sampled `floor(p)` and used the result raw. That is not
// value noise, it is a lookup table of constants: every cell holds one value and
// there is a hard edge at every cell boundary. At `p = wp * 0.55` a cell is 1.8
// world units, so what landed on screen was hard-edged blotches nearly two
// metres across — visible all over the overworld dirt in the certification
// captures, where it reads as staining or mud rather than as the material of
// the ground. Trilinear interpolation with a smoothstep fade is what makes the
// same hash into grain.
//
// Still mean-preserving: interpolated value noise averages 0.5, so `n*2-1`
// averages 0 and the luminance certification band is undisturbed. That property
// is the reason the amplitude could be raised at all.
const NOISE_GLSL = /* glsl */`
float ssHash31(vec3 c) {
    return fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float ssValueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);            // smoothstep fade — no cell edges
    float n000 = ssHash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = ssHash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = ssHash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = ssHash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = ssHash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = ssHash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = ssHash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = ssHash31(i + vec3(1.0, 1.0, 1.0));
    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
    );
}
// Carried from the albedo pass to the normal pass. GLSL permits a non-const
// global assigned inside main, and this is the cheapest way to avoid computing
// the same two octaves twice in one fragment.
float ssGrain;
float ssBumpAmp;
`;

// Triplanar grain: two octaves of interpolated value noise on world axes.
// Family-scaled: stone coarse, metal finer, energy accents left nearly clean.
const DETAIL_CHUNK = /* glsl */`
#include <color_fragment>
{
    // Frequency raised 0.55 → 1.7 when the interpolation landed.
    //
    // Interpolating the old scale did not make grain, it made CLOUDS: a 1.8
    // world-unit cell with a smooth fade between neighbours is a soft blob two
    // metres across, and a floor covered in those reads as fog or damp, not as
    // stone. The un-interpolated version got away with a low frequency because
    // its hard cell edges supplied the detail; adding the fade removed the only
    // thing making it look like anything. At 1.7 a cell is ~0.6 units — just
    // under a voxel — which is the scale the eye reads as surface.
    // 1.15, and a gentler second octave.
    //
    // Two passes to get here, both from looking at the Crypt capture rather
    // than at a number. At 0.55 the interpolated noise was CLOUDS — soft blobs
    // two metres across that read as fog on the floor. At 1.7 with a 2.9×
    // second octave it was STATIC — the floor came out as a dense speckle,
    // and the fine octave lands near three pixels at this camera height, which
    // is where it stops being texture and starts being aliasing. 1.15 puts the
    // coarse cell just under a voxel and keeps the fine one above the pixel.
    vec3 p = vWorldPosition * 1.15;
    float n1 = ssValueNoise(p);
    float n2 = ssValueNoise(p * 2.1);
    ssGrain = (n1 * 0.7 + n2 * 0.3) * 2.0 - 1.0; // [-1,1], mean ~0
    float _dlum = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
    float _dsat = max(max(vColor.r, vColor.g), vColor.b) - min(min(vColor.r, vColor.g), vColor.b);
    // Halved. The amplitude that was invisible under the OLD hard-cell noise
    // is loud under interpolated noise, because a smooth gradient reads as
    // shading while a hard cell edge reads as an edge — same number, different
    // signal. mottleColors() documents the original intent: sub-navigational,
    // never competing with the hazard contrast the gameplay read depends on.
    float amp = 0.035;
    if (_dlum >= 0.28 && _dsat < 0.2) amp = 0.026;      // metal — subtle brush
    if (_dsat >= 0.5) amp = 0.018;                       // energy — keep accents clean
    if (_dlum >= 0.5) amp = 0.022;                       // polished/ice
    // The bump follows the same family split as the albedo grain, so a surface
    // never looks smoother than it is coloured, or vice versa.
    //
    // 1.5, down from 4.5. At 4.5 the perturbation was strong enough to fight
    // the key light across a whole floor, and the certification capture of the
    // Crypt came back looking like the room was full of smoke. A normal
    // perturbation is meant to make a flat face catch light unevenly, not to
    // become the thing you are looking at.
    ssBumpAmp = amp * 2.2;
    float f = 1.0 + ssGrain * amp;
    diffuseColor.rgb = clamp(diffuseColor.rgb * f, 0.0, 1.0);
}
`;

// The normal perturbation ticket 3 promised, and the header of this file has
// claimed since the day it was written — "triplanar value noise on albedo + a
// tiny normal perturbation". Only the albedo half was ever implemented. It is
// the missing half that matters most: brightness noise on a flat face still
// looks like a flat face with noise on it. Tilting the normal is what makes the
// face CATCH LIGHT unevenly, which is what a real surface does.
//
// Derived from the screen-space derivative of the grain already computed above,
// which is the standard height-to-bump trick and costs four derivative
// instructions — versus the six extra noise evaluations that central
// differences would need, at eight hashes each.
const NORMAL_CHUNK = /* glsl */`
#include <normal_fragment_begin>
{
    vec3 _dpdx = dFdx(vWorldPosition);
    vec3 _dpdy = dFdy(vWorldPosition);
    float _dgx = dFdx(ssGrain);
    float _dgy = dFdy(ssGrain);
    vec3 _r1 = cross(_dpdy, normal);
    vec3 _r2 = cross(normal, _dpdx);
    float _det = dot(_dpdx, _r1);
    if (abs(_det) > 1e-8) {
        vec3 _bump = (_r1 * _dgx + _r2 * _dgy) / _det;
        // Clamped so a grazing-angle fragment, where the derivative explodes,
        // cannot flip the normal and produce a black speckle.
        normal = normalize(normal + clamp(_bump * ssBumpAmp, -0.6, 0.6));
    }
}
`;

/**
 * A MeshStandardMaterial for the level mesh with the family response hook,
 * AO attribute, and triplanar grain. Same base look as before (vertexColors,
 * roughness 0.88, metalness 0.04); the hook only sharpens specular by class
 * and applies contact darkening on the ambient term.
 */
export function makeLevelMaterial(opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: opts.roughness ?? 0.88,
        metalness: opts.metalness ?? 0.04,
        ...opts,
    });
    mat.onBeforeCompile = (shader) => {
        // Vertex: pass aoLevel + world position for triplanar detail.
        // Guard each replace — unit tests feed a minimal shader string that
        // only has the roughness/metalness includes.
        if (shader.vertexShader) {
            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    /* glsl */`#include <common>
attribute float aoLevel;
varying float vAoLevel;
varying vec3 vWorldPosition;`
                )
                .replace(
                    '#include <begin_vertex>',
                    /* glsl */`#include <begin_vertex>
vAoLevel = aoLevel;
vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`
                );
        }
        if (shader.fragmentShader) {
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    /* glsl */`#include <common>
varying float vAoLevel;
varying vec3 vWorldPosition;
${NOISE_GLSL}`
                )
                .replace('#include <color_fragment>', DETAIL_CHUNK)
                .replace('#include <roughnessmap_fragment>', ROUGH_CHUNK)
                .replace('#include <metalnessmap_fragment>', METAL_CHUNK)
                // Must come AFTER the albedo chunk in source order as well as
                // in the shader's execution order: `ssGrain` is written there
                // and read here, and three.js emits color_fragment first.
                .replace('#include <normal_fragment_begin>', NORMAL_CHUNK)
                .replace('#include <aomap_fragment>', AO_CHUNK);
            // Zero aoLevel (missing attribute) must not blacken the mesh.
            shader.fragmentShader = shader.fragmentShader.replace(
                'float ambientOcclusion = vAoLevel;',
                'float ambientOcclusion = vAoLevel > 0.001 ? vAoLevel : 1.0;'
            );
        }
    };
    // Bumped to v3: AO attribute + triplanar detail. Old key would serve a
    // cached program compiled without those varyings.
    // v4: interpolated noise + normal perturbation. The key must change or a
    // cached program compiled against the old chunk set is served instead.
    mat.customProgramCacheKey = () => 'ss-level-family-v4-ao-detail-bump';
    return mat;
}
