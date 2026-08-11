// Room atmosphere — dust motes catching the key light (graphics overhaul ticket 7).
//
// A few hundred slow-drifting particles make a room feel like it contains air.
// Cheap: one Points mesh, no shadows, no collisions. Density is intentionally
// low so it never competes with combat readability.

import * as THREE from 'three';

// Every mote used to be the same size, the same brightness and the same opacity,
// spread evenly through the whole room — including across a sunlit dirt floor in
// the overworld. That is not what dust looks like. It looks like dust ON THE
// LENS: uniform white specks over the entire frame, which the certification
// captures show clearly enough that they read as dead pixels.
//
// Two changes, both about the same idea — dust is only visible where light
// catches it:
//
//  * per-particle size and alpha, so the field has depth instead of reading as
//    one repeated sprite;
//  * a vertical falloff, so motes fade out near the floor and near the ceiling
//    and the band in between is where the eye finds them.
//
// Count is up, because a sparse field of obvious specks reads worse than a
// denser field of faint ones — and the whole thing is still one draw call.
const COUNT = 420;
const SPREAD = 18;
const HEIGHT = 5;

/**
 * Phase F1 — the `atmosphere` channel.
 *
 * `dungeon-kits.js` has declared a distinct atmosphere tag per dungeon since
 * the kits were written — `light_shafts`, `heat_shimmer`, `drips`, `bubbles`,
 * `sparks`, `vapor`, `recursion`, `index_scan`, `phantom_duplicates` and the
 * rest — and **not one of them was read by anything**. All sixteen regions and
 * all fourteen dungeons shared one grey dust field.
 *
 * This is one profile per tag over the SAME Points mesh rather than fourteen
 * particle systems, and that is a design decision, not a shortcut. What
 * separates embers over the Pyre from vapour in the Cryo Vault, seen from a
 * camera seventeen units up, is colour, direction, speed and size — and doing
 * it in one draw call means the Mire can afford four times the density where
 * bubbles want it.
 *
 * `rise` is signed: negative falls. That one number is most of the difference
 * between sparks and drips.
 */
export const ATMOSPHERES = {
    cold_motes: { color: 0x9ab4d0, rise: 0.3, drift: 0.08, size: 0.05, count: 380, opacity: 0.2 },
    sparks: { color: 0xffd060, rise: 1.5, drift: 0.22, size: 0.05, count: 260, opacity: 0.4 },
    drifting_dust: { color: 0xc8a060, rise: 0.15, drift: 0.3, size: 0.07, count: 480, opacity: 0.22 },
    light_shafts: { color: 0xdfeaff, rise: 0.1, drift: 0.05, size: 0.09, count: 520, opacity: 0.3 },
    motes: { color: 0xd4a84b, rise: 0.35, drift: 0.1, size: 0.055, count: 400, opacity: 0.24 },
    grit: { color: 0xff6030, rise: 0.2, drift: 0.34, size: 0.045, count: 460, opacity: 0.2 },
    drips: { color: 0x4a9fd4, rise: -1.9, drift: 0.02, size: 0.06, count: 220, opacity: 0.45 },
    pale_dust: { color: 0xe8e0d0, rise: 0.12, drift: 0.12, size: 0.07, count: 440, opacity: 0.24 },
    phantom_duplicates: { color: 0xb0a890, rise: 0.05, drift: 0.02, size: 0.13, count: 150, opacity: 0.16 },
    vapor: { color: 0xa0e8ff, rise: -0.5, drift: 0.16, size: 0.11, count: 340, opacity: 0.26 },
    bubbles: { color: 0x8fb060, rise: 1.1, drift: 0.06, size: 0.1, count: 300, opacity: 0.34 },
    heat_shimmer: { color: 0xff5520, rise: 1.7, drift: 0.14, size: 0.06, count: 320, opacity: 0.32 },
    index_scan: { color: 0xff40c8, rise: 0.9, drift: 0.01, size: 0.04, count: 500, opacity: 0.28 },
    recursion: { color: 0x8b5cf6, rise: 0.25, drift: 0.26, size: 0.09, count: 360, opacity: 0.26 },
};

/** The field every room fell back to before the tags were wired. */
export const DEFAULT_ATMOSPHERE = {
    color: 0xd8c8a0, rise: 0.4, drift: 0.08, size: 0.055, count: COUNT, opacity: 0.22,
};

export function atmosphereFor(tag) {
    return ATMOSPHERES[tag] || DEFAULT_ATMOSPHERE;
}

/**
 * Slow-drifting dust field centred on a room origin. Call setCenter when the
 * player changes rooms so the field follows the camera subject.
 */
/**
 * The largest density any profile asks for. The buffer is allocated once at
 * this size and each profile simply draws a prefix of it (see setProfile), so
 * `count` costs allocation once and nothing per room.
 */
const MAX_COUNT = Math.max(
    COUNT,
    ...Object.values(ATMOSPHERES).map((p) => p.count || 0)
);

/**
 * A tiny deterministic PRNG (mulberry32) for the mote field.
 *
 * The field used to be laid out with Math.random(), so every page load got a
 * different dust cloud. Nobody can see that — but the certification gate can,
 * and it was the largest uncontrolled variable in the frame. `visual-sanity`
 * measures centre-crop contrast (p90 − p10), and on an OPEN level the centre
 * crop is mostly flat floor: the bright tail of that distribution is largely
 * where the additive motes happen to be sitting. Measured on sandbox-combat,
 * identical code produced contrast readings from 11 to 59 across runs, and the
 * reading moved by 3 when an UNUSED import was added to an unrelated file —
 * proof the number was tracking module-load timing and RNG draw order rather
 * than anything about the build.
 *
 * That gate's own header already says a randomly-failing gate is worse than no
 * gate because it trains you to re-run; it says so about the max-vs-median bug
 * that was fixed in the same file. This is the remaining half of that disease,
 * and it is fixed at the source rather than by widening the floor.
 *
 * Gameplay is unaffected: the field still drifts, and one fixed starting layout
 * is no more noticeable than a random one at seventeen units up.
 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class DustMotes {
    constructor(scene, opts = {}) {
        this.scene = scene;
        // Allocate for the densest profile, not for the default. `this.count`
        // is the CAPACITY; how many are actually drawn is per-profile.
        this.capacity = opts.count || MAX_COUNT;
        this.count = this.capacity;
        this.enabled = opts.enabled !== false;
        const rand = mulberry32(opts.seed != null ? opts.seed : 0x5CA12ED);
        this._rand = rand;
        const positions = new Float32Array(this.count * 3);
        const speeds = new Float32Array(this.count);
        const scales = new Float32Array(this.count);
        for (let i = 0; i < this.count; i++) {
            positions[i * 3] = (rand() - 0.5) * SPREAD;
            positions[i * 3 + 1] = rand() * HEIGHT + 1.0;
            positions[i * 3 + 2] = (rand() - 0.5) * SPREAD;
            speeds[i] = 0.15 + rand() * 0.35;
            // Cubed, so most motes are small and a few are near full size —
            // a uniform distribution still reads as "all the same".
            const u = rand();
            scales[i] = 0.35 + u * u * u * 1.5;
        }
        this._speeds = speeds;
        this._origin = { x: 0, z: 0 };
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('moteScale', new THREE.BufferAttribute(scales, 1));
        // The buffer is now sized for the DENSEST profile, so the default
        // draw range ("all of it") is no longer the default DENSITY. Left
        // unset, a level whose atmosphere resolves to the fallback drew all
        // 520 instead of 420 — measured on sandbox-combat as contrast 14 → 7,
        // straight through the visual-sanity floor, at identical luminance.
        // A haze that fails a contrast gate is the exact thing this field is
        // supposed to stay out of the way of.
        this.drawn = Math.min(this.capacity, COUNT);
        geo.setDrawRange(0, this.drawn);
        const mat = new THREE.PointsMaterial({
            color: opts.color != null ? opts.color : 0xd8c8a0,
            size: 0.055,
            transparent: true,
            // Halved. Dust that you notice is dust that is in the way; the
            // field should be something you feel rather than something you
            // count. Additive so motes lift out of light areas and vanish into
            // dark ones instead of sitting on top of both.
            opacity: 0.22,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        // Per-particle size + a vertical fade, injected into the standard points
        // shader so this stays one draw call with no custom material to keep in
        // sync with the renderer's tone mapping and fog.
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uFadeTop = { value: HEIGHT + 1.2 };
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', /* glsl */`#include <common>
attribute float moteScale;
varying float vMoteFade;
uniform float uFadeTop;`)
                .replace('gl_PointSize = size;', /* glsl */`gl_PointSize = size * moteScale;`)
                .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
{
    // Fade in off the floor and out again near the ceiling, so the motes
    // occupy a band of air rather than filling the room corner to corner.
    float h = clamp((transformed.y - 1.0) / max(0.001, uFadeTop - 1.0), 0.0, 1.0);
    vMoteFade = smoothstep(0.0, 0.22, h) * (1.0 - smoothstep(0.72, 1.0, h));
}`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', /* glsl */`#include <common>
varying float vMoteFade;`)
                .replace('#include <premultiplied_alpha_fragment>', /* glsl */`
gl_FragColor.a *= vMoteFade;
#include <premultiplied_alpha_fragment>`);
        };
        mat.customProgramCacheKey = () => 'ss-dust-motes-v2';
        this.points = new THREE.Points(geo, mat);
        this.points.name = 'dust-motes';
        this.points.frustumCulled = false;
        if (this.enabled) scene.add(this.points);
    }

    setCenter(x, z) {
        this._origin.x = x;
        this._origin.z = z;
        this.points.position.x = x;
        this.points.position.z = z;
    }

    setColor(hex) {
        if (this.points?.material) this.points.material.color.setHex(hex);
    }

    /**
     * Adopt a dungeon's authored atmosphere.
     *
     * Everything here is a material or a scalar — nothing rebuilds the buffer —
     * so a room transition costs the same as changing a colour, and the field
     * that was already in flight simply starts behaving differently. Rebuilding
     * would pop every particle to a new position on the frame you walk through
     * a door, which is the one moment the player is looking at the whole screen.
     */
    setProfile(profile) {
        const p = profile || DEFAULT_ATMOSPHERE;
        this.profile = p;
        this._rise = p.rise != null ? p.rise : 0.4;
        this._drift = p.drift != null ? p.drift : 0.08;
        const mat = this.points?.material;
        if (!mat) return;
        mat.color.setHex(p.color);
        mat.size = p.size != null ? p.size : 0.055;
        mat.opacity = p.opacity != null ? p.opacity : 0.22;

        // DENSITY, the sixth field — and until now the only one of the six
        // that did nothing. Every profile has carried a `count` since the
        // table was written, the header justifies the design with "the Mire
        // can afford four times the density where bubbles want it", and
        // setProfile read the other five and never this one. `this.count` was
        // fixed at construction and index.js builds `new DustMotes(scene)`
        // with no options, so all fourteen dungeons and every region ran the
        // same 420 motes.
        //
        // Drawn as a prefix of the full buffer rather than by rebuilding it.
        // The comment above is right that rebuilding pops every particle to a
        // new position on the one frame the player is looking at the whole
        // screen; a draw-range change costs nothing and pops nothing.
        const want = Math.min(this.capacity, p.count || this.capacity);
        this.drawn = want;
        this.points.geometry.setDrawRange(0, want);
    }

    /** Adopt an atmosphere by its kit tag. */
    setAtmosphere(tag) {
        this.setProfile(atmosphereFor(tag));
    }

    update(dt) {
        if (!this.enabled || !this.points.visible) return;
        const pos = this.points.geometry.getAttribute('position');
        const arr = pos.array;
        const rise = this._rise != null ? this._rise : 0.4;
        const drift = this._drift != null ? this._drift : 0.08;
        const top = HEIGHT + 1.2;
        for (let i = 0; i < this.count; i++) {
            const s = this._speeds[i];
            arr[i * 3 + 1] += s * dt * rise;
            arr[i * 3] += Math.sin(arr[i * 3 + 1] * 0.7 + i) * dt * drift;
            arr[i * 3 + 2] += Math.cos(arr[i * 3 + 1] * 0.5 + i * 0.3) * dt * drift;
            // Wrap at whichever end this atmosphere is heading for. Drips and
            // vapour FALL, and a falling field that recycled at the ceiling
            // would drain the room and then be empty.
            if (rise >= 0 ? arr[i * 3 + 1] > top : arr[i * 3 + 1] < 1.0) {
                arr[i * 3 + 1] = rise >= 0 ? 1.0 : top;
                // Recycled from the same seeded stream as the initial layout.
                // Math.random() here would put the nondeterminism straight back
                // in through the wrap path a few seconds after load, which is
                // exactly when a capture is taken.
                arr[i * 3] = (this._rand() - 0.5) * SPREAD;
                arr[i * 3 + 2] = (this._rand() - 0.5) * SPREAD;
            }
        }
        pos.needsUpdate = true;
    }

    setEnabled(on) {
        this.enabled = !!on;
        this.points.visible = this.enabled;
        if (this.enabled && !this.points.parent) this.scene.add(this.points);
        if (!this.enabled && this.points.parent) this.scene.remove(this.points);
    }

    dispose() {
        if (this.points.parent) this.scene.remove(this.points);
        this.points.geometry.dispose();
        this.points.material.dispose();
    }
}
