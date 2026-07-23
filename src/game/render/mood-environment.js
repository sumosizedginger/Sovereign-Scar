// A procedural environment map, so metal can be metal.
//
// `scene.environment` was null. The engine has had a PMREM builder
// (`src/engine/environment.js`) and a skybox loader since the beginning and
// nothing ever called either, so every physically-based material in the game
// was doing its specular maths against no environment at all.
//
// The consequence was already written down, in `src/game/render/materials.js`:
//
//     Metalness is kept small: this engine has little environment light, so a
//     strongly metallic surface would read dark
//
// So the material-family system correctly classified every voxel colour as
// matte, polished, metal or energy — and then capped metalness at **0.12**,
// because a metal with nothing to reflect is just a dark surface. Gold seams,
// iron, ice and the whole Cryo Vault were doing an impression of painted
// plaster. The cap was a correct workaround for a missing input, and it stayed
// long enough to look like an art decision.
//
// The map is GENERATED, not loaded: a 64×32 canvas gradient per mood. That
// keeps the zero-build, offline-first promise — no new asset files, no fetch —
// and at this scale image-based lighting is about the *direction* of the
// reflection, not its detail. 64×32 is plenty for "the sky is up and cool, the
// ground is down and warm", which is the entire signal a voxel world needs.

import * as THREE from 'three';

/** Equirectangular source size. Small on purpose — see the note above. */
const ENV_W = 64, ENV_H = 32;

/**
 * Vertical gradient stops per mood, from zenith (v=0) to nadir (v=1).
 *
 * Three bands rather than two: a horizon term is what makes a reflection read
 * as an environment rather than as a tint. Without it a metal surface picks up
 * one colour from above and one from below and looks like a two-tone toy.
 */
const MOOD_SKIES = {
    crust: {
        zenith: 0x4c5a6e,   // cool overcast, well above the dust
        horizon: 0x9c8a68,  // the warm haze the Crust actually sits in
        nadir: 0x3a3226,    // ochre ground bounce
        intensity: 0.55,
    },
    abyss: {
        zenith: 0x6b46c1,   // violet — the Abyss identity lives here
        horizon: 0x4a3a72,
        nadir: 0x1e2438,    // cold floor, per the plan
        intensity: 0.60,
    },
};

// How these intensities were arrived at, because the obvious value is wrong:
//
// `scene.environment` feeds MeshStandardMaterial BOTH a specular reflection and
// a diffuse irradiance term. The second one is ambient light by another name.
// Switching the environment on at 0.85 therefore behaved exactly like raising
// the ambient: every level's mean luminance rose (the overworld went 79 → 96 and
// broke the top of its band) and centre-crop contrast FELL across the board
// (Beat 05 108 → 67, Beat 01 82 → 72). The plan predicted this would move
// specular response without moving albedo. It did not, and that is recorded
// here rather than papered over by retuning the band around it.
//
// So the environment landed conservative on its own (0.34 / 0.30 — enough for
// metal to resolve as metal, band-neutral, reversible), and the rest of the
// budget was spent in the ambient/key rebalance instead, where it belongs: an
// environment map is *directional* ambient — it knows the sky is above and the
// ground below, which a flat AmbientLight cannot. Trading flat ambient for
// environment is a strict improvement in contrast. Raising both is not.
//
// The values below are the post-rebalance ones. They are higher than the
// interim figures because flat ambient came down at the same time (Crust
// 1.70 → 0.78, Abyss 3.40 → 1.55), so the total light is roughly held while
// more of it now arrives with a direction attached.

let pmrem = null;
/** moodName -> { texture, source } */
const cache = {};

function lerpHex(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return [
        Math.round(ar + (br - ar) * t),
        Math.round(ag + (bg - ag) * t),
        Math.round(ab + (bb - ab) * t),
    ];
}

/** Build the equirectangular gradient for a mood as a CanvasTexture. */
export function buildSkyTexture(mood = 'crust') {
    if (typeof document === 'undefined') return null; // headless unit runs
    const sky = MOOD_SKIES[mood] || MOOD_SKIES.crust;
    const c = document.createElement('canvas');
    c.width = ENV_W; c.height = ENV_H;
    const g = c.getContext('2d');
    const img = g.createImageData(ENV_W, ENV_H);

    for (let y = 0; y < ENV_H; y++) {
        // v goes zenith (0) → nadir (1); the horizon sits at v = 0.5.
        const v = y / (ENV_H - 1);
        let rgb;
        if (v <= 0.5) {
            // Squared toward the horizon so the sky reads as a dome rather
            // than as a linear wipe.
            const t = v / 0.5;
            rgb = lerpHex(sky.zenith, sky.horizon, t * t);
        } else {
            const t = (v - 0.5) / 0.5;
            rgb = lerpHex(sky.horizon, sky.nadir, Math.sqrt(t));
        }
        for (let x = 0; x < ENV_W; x++) {
            const i = (y * ENV_W + x) * 4;
            img.data[i] = rgb[0];
            img.data[i + 1] = rgb[1];
            img.data[i + 2] = rgb[2];
            img.data[i + 3] = 255;
        }
    }

    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

/**
 * Install the environment map for `mood` on `scene`. Cached per mood, so a
 * Crust↔Abyss flip costs one lookup after the first pass through each.
 *
 * Degrades to no environment rather than throwing: PMREM generation can fail
 * on some headless/ANGLE configurations, and the game must still render
 * (flat, no reflections) instead of dying at a level load.
 *
 * @returns {boolean} whether an environment is now installed
 */
export function applyMoodEnvironment(scene, renderer, mood = 'crust') {
    if (!scene || !renderer) return false;
    const key = mood in MOOD_SKIES ? mood : 'crust';
    const sky = MOOD_SKIES[key];

    if (!cache[key]) {
        const source = buildSkyTexture(key);
        if (!source) return false;
        try {
            if (!pmrem) {
                pmrem = new THREE.PMREMGenerator(renderer);
                pmrem.compileEquirectangularShader();
            }
            const rt = pmrem.fromEquirectangular(source);
            cache[key] = { texture: rt.texture, source };
        } catch (e) {
            source.dispose();
            return false;
        }
    }

    scene.environment = cache[key].texture;
    if ('environmentIntensity' in scene) scene.environmentIntensity = sky.intensity;
    return true;
}

/** Tear down the cache (level teardown / tests). */
export function disposeMoodEnvironments(scene = null) {
    for (const k of Object.keys(cache)) {
        cache[k].texture?.dispose?.();
        cache[k].source?.dispose?.();
        delete cache[k];
    }
    pmrem?.dispose?.();
    pmrem = null;
    if (scene) scene.environment = null;
}

/** Exposed for the spec — the intent, without needing a GL context. */
export { MOOD_SKIES };
