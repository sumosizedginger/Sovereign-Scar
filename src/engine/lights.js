// src/engine/lights.js
// Purpose: Ambient + key/fill/rim directional lights.
// Dependencies: ./renderer.js, global THREE

import { scene } from './renderer.js';

import * as THREE from 'three';

// Offset of the key light from its target (the point it's aimed at). Kept
// fixed so the sun angle never changes as the frustum follows the camera.
const KEY_OFFSET = new THREE.Vector3(45, 60, 25);

/**
 * Penumbra width in WORLD UNITS. One voxel is 1 unit, so this is "about a
 * quarter of a block of softening at the shadow edge" — enough to stop the
 * one-texel staircase reading as an artifact, small enough that a cast shadow
 * still says where the thing casting it is.
 *
 * Capped in `shadowTexelRadius` because `shadow.radius` spreads a fixed 9-tap
 * kernel: past roughly 12 texels the taps separate far enough to read as bands
 * rather than as blur, which is a different artifact rather than less of one.
 */
export const SHADOW_SOFTNESS = 0.26;

/** How much key light survives inside a shadow — the bounce stand-in. */
export const SHADOW_FLOOR = 0.86;

/** World-unit softness → texel radius for the light's current map + frustum. */
export function shadowTexelRadius(light, worldUnits = SHADOW_SOFTNESS) {
    const cam = light.shadow.camera;
    const span = Math.abs(cam.right - cam.left) || 60;
    const size = light.shadow.mapSize.width || 2048;
    const texelWorld = span / size;
    return Math.max(1, Math.min(12, worldUnits / texelWorld));
}

let keySunRef = null;

export function initLights() {
    scene.add(new THREE.AmbientLight(0x241a3a, 0.5));

    const keySun = new THREE.DirectionalLight(0xffedd0, 1.35);
    keySun.position.copy(KEY_OFFSET);
    keySun.castShadow = true;
    keySun.shadow.mapSize.set(2048, 2048);
    keySun.shadow.camera.near = 10;
    keySun.shadow.camera.far = 180;
    // Tightened from +/-40 to +/-30 (Graphics.md Phase D) — combined with
    // updateShadowFollow() tracking the camera, this raises effective shadow
    // texel density without losing coverage of the visible play area.
    keySun.shadow.camera.left = -30;
    keySun.shadow.camera.right = 30;
    keySun.shadow.camera.top = 30;
    keySun.shadow.camera.bottom = -30;
    keySun.shadow.bias = -0.0005;
    keySun.shadow.normalBias = 0.02;
    // Softness is specified in WORLD UNITS and converted to a texel radius,
    // because `shadow.radius` alone is meaningless without the map size: the
    // quality tiers swap between 1024 and 4096, which changes the penumbra by
    // 4× if the radius is a constant. Low quality would have had the softest
    // shadows in the game.
    //
    // The old value was `radius = 3.5`, which at 2048 over a ±30 frustum
    // (0.029 world units per texel) is 0.10 units of blur — a tenth of one
    // voxel, i.e. invisible. Ticket 2 shipped "soft shadows" that were not.
    keySun.shadow.radius = shadowTexelRadius(keySun, SHADOW_SOFTNESS);

    // Shadows are not black. Nothing in a real room is lit only by the sun —
    // light bounces off the floor into the shade, and the certification
    // captures show what its absence looks like: cast shadows on the overworld
    // dirt read as holes cut in the ground. `shadow.intensity` below 1 leaves a
    // fraction of the key in shadow, which is a cheap, controllable stand-in
    // for that bounce and costs nothing per frame.
    keySun.shadow.intensity = SHADOW_FLOOR;
    keySun.shadow.camera.updateProjectionMatrix();
    scene.add(keySun);
    // The light's target must be in the scene graph for its matrixWorld to
    // update — otherwise it silently stays at the identity transform (0,0,0)
    // and updateShadowFollow()'s target repositioning below has no effect.
    scene.add(keySun.target);
    keySunRef = keySun;

    const fillNeon = new THREE.DirectionalLight(0x7050aa, 0.7);
    fillNeon.position.set(-35, 15, -25);
    scene.add(fillNeon);

    const rimWarm = new THREE.DirectionalLight(0xff7733, 0.65);
    rimWarm.position.set(10, -5, -40);
    scene.add(rimWarm);

    return { keySun, fillNeon, rimWarm };
}

/**
 * Re-center the key light's shadow frustum on the camera's X position each
 * frame. The level scrolls on X only (2.5D side-scroller); without this the
 * shadow frustum stays fixed at world origin and characters lose their
 * shadow once they scroll outside the original +/-30 unit box.
 * @param {number} cameraX
 */
export function updateShadowFollow(cameraX) {
    if (!keySunRef) return;
    keySunRef.position.set(cameraX + KEY_OFFSET.x, KEY_OFFSET.y, KEY_OFFSET.z);
    keySunRef.target.position.set(cameraX, 0, 0);
}

/**
 * Change the key light's shadow map resolution (used by the quality-tier
 * system). Disposing the existing shadow map forces WebGLRenderer to
 * regenerate it at the new size on the next frame.
 * @param {number} size square shadow map resolution, e.g. 1024/2048/4096
 */
export function setShadowMapSize(size) {
    if (!keySunRef) return;
    if (keySunRef.shadow.mapSize.width === size) return;
    keySunRef.shadow.mapSize.set(size, size);
    // Re-derive the texel radius, or the penumbra changes width every time the
    // player touches the quality setting — a 4× swing between the low and high
    // tiers, with LOW coming out softest.
    keySunRef.shadow.radius = shadowTexelRadius(keySunRef);
    if (keySunRef.shadow.map) {
        keySunRef.shadow.map.dispose();
        keySunRef.shadow.map = null;
    }
}
