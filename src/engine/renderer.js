// src/engine/renderer.js
// Purpose: WebGL renderer, scene, camera, fog, resize, 2.5D camera follow.
// Dependencies: global THREE

import * as THREE from 'three';
import { getSetting } from './settings.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0514);
scene.fog = new THREE.FogExp2(0x0a0514, 0.0035);

export const camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.4,
    400
);
// Phase 01b: locked 2.5D side-scroll camera
camera.position.set(0, 14, 22);
camera.lookAt(0, 8, 0);

export const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// EffectComposer makes several internal renderer.render() calls per frame
// (RenderPass + one full-screen quad per shader pass), and WebGLRenderer
// resets renderer.info.render at the start of EVERY render() call by
// default. With autoReset left on, renderer.info would only ever reflect
// the last pass (a 2-triangle full-screen quad) instead of the whole frame.
// main.js resets it manually once per frame instead (see animate()).
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
// r182 folded the soft kernel into PCFShadowMap and deprecated the old name.
renderer.shadowMap.type = THREE.PCFShadowMap;
// r152+ renamed outputEncoding/sRGBEncoding to outputColorSpace/SRGBColorSpace.
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Postprocessing pipeline ──
// HDR-capable (HalfFloat) render target so bloom (added on top later) has
// headroom and doesn't band; `samples` enables MSAA inside the composer.
const composerTarget = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    { type: THREE.HalfFloatType, samples: 4 }
);
export const composer = new EffectComposer(renderer, composerTarget);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Bloom: only pixels brighter than `threshold` (post tone-map luminance)
// glow — this is what makes neon signs / enemy eyes / grout lines read as
// neon while matte voxel bodies stay crisp. Tune emissiveIntensity on
// individual materials (see characters/builders.js, world/destructibles.js,
// world/level.js) rather than lowering threshold globally.
export const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9,   // strength
    0.5,   // radius
    0.85   // threshold
);
composer.addPass(bloomPass);

// Vignette: subtle darkened corners, reinforcing the existing CSS vignette
// (index.html #vignette) in 3D so it holds up under bloom.
export const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms.offset.value = 0.95;
vignettePass.uniforms.darkness.value = 1.1;
composer.addPass(vignettePass);

// Chromatic aberration: a CRT/retro cue, not a distortion — but even at a
// small amount it reads as a distracting fringe on high-contrast edges
// (checkerboards, grout lines). Disabled by default; the ULTRA quality tier
// (Phase G) turns it on explicitly.
export const rgbShiftPass = new ShaderPass(RGBShiftShader);
rgbShiftPass.uniforms.amount.value = 0.0012;
rgbShiftPass.enabled = false;
composer.addPass(rgbShiftPass);

// Film grain: light synthwave/VHS texture. No scanlines (r185's simplified
// FilmPass only takes intensity + grayscale).
export const filmPass = new FilmPass(0.15, false);
composer.addPass(filmPass);

// SMAA cleans up specular/emissive edges that MSAA (composer target `samples`)
// doesn't fully catch. Runs in linear space, so it must sit before OutputPass.
export const smaaPass = new SMAAPass();
composer.addPass(smaaPass);

// OutputPass applies renderer.toneMapping + outputColorSpace as the final
// step. Any effect pass must be inserted BEFORE this one — nothing after it.
export const outputPass = new OutputPass();
composer.addPass(outputPass);

export function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // composer.setSize() also calls setSize() on every pass (bloom included).
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
}

window.addEventListener('resize', onResize);

// How far the locked camera CENTRE may sit ahead of / behind the wave trigger.
// The reachable arena (below) is measured from these two extremes, so the hero
// and camera clamps always agree on where the locked screen's edges are.
export const CAM_LOCK_AHEAD = 8;
export const CAM_LOCK_BEHIND = 2;

const _edgeProbe = new THREE.Vector3();
/**
 * World-X distance from the camera centre to the screen's side edge at world
 * depth `z`. The camera only translates in X, so this depends solely on the
 * projection (aspect/FOV), the camera's fixed Y/Z, and `z` — not on where the
 * camera currently sits. Used to let the hero walk to the true screen edge.
 */
export function visibleHalfWidthAt(z) {
    _edgeProbe.set(1, 0, 0.5).unproject(camera).sub(camera.position);
    const half = Math.abs(_edgeProbe.z) < 1e-6
        ? NaN
        : Math.abs(_edgeProbe.x * ((z - camera.position.z) / _edgeProbe.z));
    // Guard against a not-yet-sized camera (aspect NaN before first resize).
    return Number.isFinite(half) ? half : 24;
}

/**
 * X range the hero (and penned enemies) may occupy during a scroll-lock: the
 * FULL width of the locked screen at depth `z`, so the player can walk to both
 * visible edges instead of the narrow slab the old fixed offset allowed.
 * `margin` keeps sprites a hair off the very edge.
 */
export function lockedTraverseBoundsX(scrollLockX, z, margin = 2) {
    const w = visibleHalfWidthAt(z);
    return {
        min: (scrollLockX - CAM_LOCK_BEHIND) - w + margin,
        max: (scrollLockX + CAM_LOCK_AHEAD) + w - margin
    };
}

/**
 * Follow target on X only. Y/Z locked. Optional level scroll-lock + parallax.
 * @param {{x:number,y:number,z:number}} target
 * @param {object|null} level
 */
export function updateCamera(target, level) {
    let desiredX = target.x;
    if (level) {
        if (level.scrollLocked && level.scrollLockX != null) {
            // Prevent camera from advancing past wave lock
            desiredX = Math.min(desiredX, level.scrollLockX + CAM_LOCK_AHEAD);
            // Keep player on-screen: also pull camera if player goes left of lock
            desiredX = Math.max(desiredX, level.scrollLockX - CAM_LOCK_BEHIND);
        }
        if (level.length != null) {
            desiredX = Math.max(10, Math.min(level.length - 10, desiredX));
        }
    }
    camera.position.x += (desiredX - camera.position.x) * 0.1;
    camera.position.y = 14;
    camera.position.z = 22;
    camera.lookAt(camera.position.x, 8, 0);

    if (level && level.backgroundLayers) {
        for (const layer of level.backgroundLayers) {
            const rate = layer.userData.scrollRate || 0;
            layer.position.x = -camera.position.x * rate;
        }
    }
}

// ── A1: Cinematic camera rig (staged cutscenes, src/narrative/scenes.js) ──
// A parallel rig to updateCamera(): it eases BOTH the position and the look
// target so a scene can dolly and reframe. While active it OWNS the camera —
// the main loop must not call updateCamera(), and shakeCamera() (bosses.js)
// bows out so it doesn't fight the dolly by caching a mid-move baseX/baseY.
let _cineActive = false;
const _cinePos = new THREE.Vector3();
const _cineLook = new THREE.Vector3();
const _cineTargetPos = new THREE.Vector3();
const _cineTargetLook = new THREE.Vector3();
let _cineDuration = 0;
let _cineRoll = 0;       // dutch tilt (radians about the view axis)
let _cineTargetRoll = 0;

// A cut (not a dolly): duration 0, reduced motion, or fast-cutscene test mode.
function _cineInstant() {
    return _cineDuration <= 0
        || getSetting('reduceMotion')
        || (typeof window !== 'undefined' && window.__fastCutscenes);
}

/**
 * Point the cine rig at new targets, easing over `duration` seconds.
 * @param {{pos:{x,y,z}, look:{x,y,z}, duration?:number, roll?:number}} shot
 *   roll: a static dutch tilt (radians) applied after the lookAt — the alien
 *   scenes use a small one. It eases with the dolly; a cut snaps it.
 */
export function setCineCamera({ pos, look, duration = 0.8, roll = 0 }) {
    // First activation captures the live rig so the opening move eases FROM
    // wherever the camera actually sits (usually the wide follow rig).
    if (!_cineActive) {
        _cinePos.copy(camera.position);
        _cineLook.set(camera.position.x, 8, 0); // updateCamera's look target
        _cineRoll = 0;
    }
    _cineActive = true;
    _cineDuration = duration;
    _cineTargetPos.set(pos.x, pos.y, pos.z);
    _cineTargetLook.set(look.x, look.y, look.z);
    _cineTargetRoll = roll || 0;
    if (_cineInstant()) {
        _cinePos.copy(_cineTargetPos);
        _cineLook.copy(_cineTargetLook);
        _cineRoll = _cineTargetRoll;
        _applyCine();
    }
}

// Apply the eased rig to the real camera: position, look, then dutch tilt
// (rotateZ AFTER lookAt rolls about the view axis).
function _applyCine() {
    camera.position.copy(_cinePos);
    camera.lookAt(_cineLook);
    if (_cineRoll) camera.rotateZ(_cineRoll);
}

/** Release the camera back to updateCamera()'s follow rig. */
export function clearCineCamera() {
    _cineActive = false;
    _cineRoll = 0;
    _cineTargetRoll = 0;
}

/** True while a scene owns the camera. */
export function cineCameraActive() {
    return _cineActive;
}

/** Tick the cine rig once: ease toward targets, apply, drive parallax. */
export function updateCineCamera(dt, level) {
    if (!_cineActive) return;
    if (_cineInstant()) {
        _cinePos.copy(_cineTargetPos);
        _cineLook.copy(_cineTargetLook);
        _cineRoll = _cineTargetRoll;
    } else {
        // Exponential ease: ~98% of the way there after `duration` seconds,
        // framerate-independent (survives the dt<=0.05 slow-mo floor).
        const k = 1 - Math.exp(-dt * (4 / Math.max(0.0001, _cineDuration)));
        _cinePos.lerp(_cineTargetPos, k);
        _cineLook.lerp(_cineTargetLook, k);
        _cineRoll += (_cineTargetRoll - _cineRoll) * k;
    }
    _applyCine();
    // Parallax keys off camera.position.x; updateCamera isn't running now, so
    // the cine rig must drive the background layers itself.
    if (level && level.backgroundLayers) {
        for (const layer of level.backgroundLayers) {
            const rate = layer.userData.scrollRate || 0;
            layer.position.x = -camera.position.x * rate;
        }
    }
}
