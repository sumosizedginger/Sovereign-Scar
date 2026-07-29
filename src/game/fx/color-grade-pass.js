// Split-tone colour grade (graphics overhaul ticket 5).
//
// Shadows cool, highlights warm — the single most recognisable "art directed"
// real-time move, and a handful of shader lines. Per-region uniforms let Cryo
// go genuinely cold and Pyre hot at the *grade* level rather than only in
// albedo. Inserted before OutputPass so tone mapping still owns the shoulder.

import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const ColorGradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        // RGB multipliers applied below / above the mid grey pivot.
        shadowTint: { value: { x: 0.92, y: 0.95, z: 1.06 } },
        highlightTint: { value: { x: 1.06, y: 1.02, z: 0.94 } },
        // 0 = off, 1 = full grade. Kept modest — a heavy grade dropped mean
        // luminance below the certification band on already-pale rooms.
        amount: { value: 0.32 },
        // Lift/gain for mild contrast reshape without fighting ACES.
        contrast: { value: 1.02 },
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec3 shadowTint;
        uniform vec3 highlightTint;
        uniform float amount;
        uniform float contrast;
        varying vec2 vUv;
        void main() {
            vec4 c = texture2D(tDiffuse, vUv);
            float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
            // Soft masks around mid grey so the grade does not posterise.
            float shadowW = 1.0 - smoothstep(0.15, 0.55, lum);
            float highW = smoothstep(0.45, 0.85, lum);
            vec3 graded = c.rgb;
            graded = mix(graded, graded * shadowTint, shadowW * amount);
            graded = mix(graded, graded * highlightTint, highW * amount);
            // Mild contrast around 0.5 — keeps pale rooms from reading as glare.
            graded = (graded - 0.5) * contrast + 0.5;
            gl_FragColor = vec4(clamp(graded, 0.0, 1.0), c.a);
        }
    `,
};

/** Per-mood grade presets. Structural surfaces stay near-neutral; grade carries identity. */
export const GRADE_PRESETS = {
    crust: {
        shadowTint: { x: 0.94, y: 0.96, z: 1.05 },
        highlightTint: { x: 1.05, y: 1.02, z: 0.95 },
        amount: 0.28,
        contrast: 1.02,
    },
    abyss: {
        shadowTint: { x: 0.90, y: 0.92, z: 1.10 },
        highlightTint: { x: 1.04, y: 0.98, z: 1.06 },
        amount: 0.30,
        contrast: 1.02,
    },
    cryo: {
        shadowTint: { x: 0.88, y: 0.94, z: 1.12 },
        highlightTint: { x: 0.96, y: 1.02, z: 1.10 },
        amount: 0.34,
        contrast: 1.02,
    },
    pyre: {
        shadowTint: { x: 0.95, y: 0.90, z: 0.92 },
        highlightTint: { x: 1.12, y: 1.02, z: 0.88 },
        amount: 0.36,
        contrast: 1.03,
    },
};

export function createColorGradePass() {
    const pass = new ShaderPass(ColorGradeShader);
    pass.enabled = true;
    return pass;
}

/** Apply a named preset (or raw uniform bag) to an existing grade pass. */
export function applyGradePreset(pass, nameOrOpts = 'crust') {
    if (!pass?.uniforms) return;
    const p = typeof nameOrOpts === 'string'
        ? (GRADE_PRESETS[nameOrOpts] || GRADE_PRESETS.crust)
        : nameOrOpts;
    if (p.shadowTint) {
        pass.uniforms.shadowTint.value.x = p.shadowTint.x;
        pass.uniforms.shadowTint.value.y = p.shadowTint.y;
        pass.uniforms.shadowTint.value.z = p.shadowTint.z;
    }
    if (p.highlightTint) {
        pass.uniforms.highlightTint.value.x = p.highlightTint.x;
        pass.uniforms.highlightTint.value.y = p.highlightTint.y;
        pass.uniforms.highlightTint.value.z = p.highlightTint.z;
    }
    if (p.amount != null) pass.uniforms.amount.value = p.amount;
    if (p.contrast != null) pass.uniforms.contrast.value = p.contrast;
}
