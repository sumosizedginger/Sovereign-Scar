// C8: top-down attack smear that follows the TRUE 8-way facing vector.
// The engine smear (src/engine/smear.js) is authored for side-view ±X facing;
// rather than patch it, this game-side pool draws a flat XZ fan rotated to
// facingVec — correct for the overhead camera on every heading.

import * as THREE from 'three';

const POOL_SIZE = 6;
const LIFETIME = 0.12;
/**
 * A beam stays on screen longer than a sword stroke.
 *
 * The Caster is fired across a whole room; at the melee smear's 0.12s its own
 * shot was gone before the eye found the far end of it, which is part of why a
 * ranged weapon read as having no feedback at all.
 */
const BEAM_LIFETIME = 0.2;
const ARC_ANGLE = Math.PI * 0.61;

/**
 * A lane: the rectangle a thrust or a beam ACTUALLY hits.
 *
 * `hitboxCheck`'s non-radial path is a rectangle — a lateral gate of
 * `depthTolerance` and a forward reach of `range`. For a swing 1.8 long and 60
 * degrees wide a fan is a fair drawing of that rectangle and looks like a
 * sword, so ordinary swings keep it. For the Wedge's 4.6-by-0.55 thrust and the
 * Caster's 16-by-0.9 lance it is not a drawing of the rectangle at all: the fan
 * starts at 35% of its radius, so the beam was drawn from 5.6 units in front of
 * the player out to 16 — the entire near half of the lane, which is where
 * anything you are fighting stands, had nothing drawn in it, and the far end
 * was most of the way off the screen.
 *
 * Local space is x = 0..1 forward, z = -0.5..0.5 across, so the caller scales
 * by (length, 1, width) and gets the hitbox.
 */
function makeLaneGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5,
        0, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5,
    ], 3));
    return geo;
}

function makeFanGeometry(arc = ARC_ANGLE, inner = 0.35) {
    // Sector fan in the XZ plane, centred on +X.
    const segments = 12;
    const outer = 1.0;
    const positions = [];
    for (let i = 0; i < segments; i++) {
        const a0 = -arc / 2 + (i / segments) * arc;
        const a1 = -arc / 2 + ((i + 1) / segments) * arc;
        const p = (ang, r) => [Math.cos(ang) * r, 0, Math.sin(ang) * r];
        positions.push(...p(a0, inner), ...p(a1, inner), ...p(a1, outer));
        positions.push(...p(a0, inner), ...p(a1, outer), ...p(a0, outer));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
}

/**
 * The look, and why it is a shader instead of a bigger polygon.
 *
 * The owner's note was that the swings "look kindergarten compared to
 * everything else", and they were right: every attack in the game was one flat
 * additive polygon at a single colour and a single opacity, sitting in front of
 * a renderer that does ACES, HDR bloom, PMREM ambient and contact shadows. It
 * did not read as light, it read as a coloured shape.
 *
 * The fix has a hard constraint, though, and it is the constraint this project
 * spent a whole session earning: **the shape drawn is the shape that hits.**
 * Making a swing look better by making it bigger is the exact lie that was just
 * removed. So the geometry does not change at all — every pixel of extra
 * character is shaded INSIDE the hitbox, and over-draw stays zero by
 * construction because the silhouette is untouched.
 *
 * Local space does all the work, so no UVs are needed:
 *   lane — x runs 0..1 along the reach, z runs -0.5..0.5 across it
 *   fan  — length(xz) is the radius, atan2(z, x) is the angle off centre
 */
const SMEAR_VERT = `
    varying vec3 vPos;
    void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const SMEAR_FRAG = `
    uniform vec3 uColor;
    uniform float uAlpha;
    uniform float uLane;
    uniform float uArc;
    uniform float uAge;
    varying vec3 vPos;

    void main() {
        float a;
        float hot;
        if (uLane > 0.5) {
            // A BEAM. The Light Caster is a ray weapon whose ray was, until
            // now, a rectangle of flat cream. A beam is a hot core with a
            // falloff either side of it, brightest where it leaves the emitter.
            float across = clamp(abs(vPos.z) * 2.0, 0.0, 1.0);
            float core = pow(1.0 - across, 3.0);
            float along = clamp(vPos.x, 0.0, 1.0);
            // Bright at the muzzle, and softened at the very tip so the beam
            // ends rather than being guillotined.
            float muzzle = exp(-along * 2.6);
            float tip = 1.0 - smoothstep(0.90, 1.0, along);
            // One pulse running outward over the smear's life, which is what
            // sells it as discharged rather than painted.
            float pulse = 0.25 * exp(-40.0 * pow(along - uAge * 1.15, 2.0));
            // The 0.18 floor keeps the beam's true width visible: the lane IS
            // the hitbox, and fading its edges to nothing would under-draw a
            // weapon that hits there.
            a = (core * 0.82 + 0.18 + pulse) * tip;
            hot = core + pulse * 2.0;
        } else {
            // A BLADE. A sword swing is a rim of light with a bright leading
            // edge and a trail that falls off behind it — not a filled pie.
            float r = clamp(length(vPos.xz), 0.0, 1.0);
            float ang = atan(vPos.z, vPos.x);
            float t = clamp(abs(ang) / max(uArc, 0.001), 0.0, 1.0);
            // Weighted to the outer radius, where the edge of the weapon is —
            // but only weighted. Falling all the way to black at the hilt made
            // the swing disappear against a lit floor, which is the opposite
            // failure to the one this set out to fix.
            float rim = pow(smoothstep(0.28, 1.02, r), 1.1);
            // Leading edge bright, trailing edge thin. Keying this on the SIGN
            // of the angle would pick a side in local space and read as
            // backwards on half the headings (trap 1, in a shader), so it is
            // symmetric and keyed on distance from the centre line instead.
            float body = mix(1.0, 0.38, t * t);
            // The swing wipes outward across its own life. Generous on both
            // ends: three multiplied falloffs (rim x body x wipe) each of which
            // looked reasonable alone took the mallet's 90-degree sweep down to
            // a smudge you could not find in a screenshot.
            float wipe = smoothstep(-0.45, 0.30, uAge - t * 0.30 + 0.30);
            a = (rim * 0.62 + 0.38) * body * wipe;
            hot = rim * body;
        }
        a = clamp(a, 0.0, 1.0) * uAlpha;
        // Additive: push the core past white so the bloom the renderer already
        // runs picks up the hot centre and nothing else.
        vec3 rgb = uColor * (0.55 + hot * 1.35);
        gl_FragColor = vec4(rgb, a);
    }
`;

export class ArcSmear {
    constructor(scene) {
        this.scene = scene;
        this.geo = makeFanGeometry();
        // Phase C: charged moves are not all the same shape, and a smear that
        // draws a 110-degree fan for a move that hits a half-unit lane is the
        // player-side version of the telegraph lie this project spent a session
        // hunting. Geometries are cached by arc; the default one is `this.geo`
        // and every ordinary swing still uses it untouched.
        this._arcGeos = new Map([[ARC_ANGLE.toFixed(3), this.geo]]);
        this._laneGeo = makeLaneGeometry();
        this.pool = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: new THREE.Color(0xffffff) },
                    uAlpha: { value: 0 },
                    uLane: { value: 0 },
                    uArc: { value: ARC_ANGLE / 2 },
                    uAge: { value: 0 },
                },
                vertexShader: SMEAR_VERT,
                fragmentShader: SMEAR_FRAG,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            // `mat.color` and `mat.opacity` are read by specs, by the telegraph
            // probe and by `spawn` below, all of which predate this being a
            // ShaderMaterial. Kept as live views onto the uniforms rather than
            // rewritten at nine call sites — same names, same meaning.
            Object.defineProperty(mat, 'color', {
                get() { return this.uniforms.uColor.value; },
            });
            Object.defineProperty(mat, 'opacity', {
                get() { return this.uniforms.uAlpha.value; },
                set(v) { this.uniforms.uAlpha.value = v; },
            });
            const mesh = new THREE.Mesh(this.geo, mat);
            mesh.visible = false;
            mesh.renderOrder = 5;
            scene.add(mesh);
            this.pool.push({ mesh, mat, life: 0 });
        }
    }

    /**
     * @param {{x,y,z}} position attacker centre
     * @param {{x,z}} facingVec 8-way facing (needs not be normalized)
     * @param {number} radius world units (move range)
     * @param {number} color hex tint
     */
    spawn({
        position, facingVec, radius = 2, color = 0xffffff, lift = 0.55,
        arc = ARC_ANGLE, spin = 0, lane = null,
    }) {
        let slot = this.pool.find((s) => s.life <= 0);
        if (!slot) slot = this.pool.reduce((a, b) => (a.life < b.life ? a : b));
        const { mesh, mat } = slot;
        slot.spin = spin;
        // A lane is drawn to its hitbox and does NOT grow: a rectangle that
        // creeps outward for the length of the smear is a rectangle that ends
        // up longer and wider than the thing it is a picture of, which is the
        // same lie in slow motion.
        slot.grow = !lane;
        mesh.position.set(position.x, position.y + lift, position.z);
        if (lane) {
            mesh.geometry = this._laneGeo;
            mesh.scale.set(lane.length, 1, Math.max(0.12, lane.width));
            mat.uniforms.uLane.value = 1;
            // A beam wants longer on screen than a sword stroke. The Caster is
            // a ranged weapon fired across a room; at 0.12s its own shot was
            // over before the eye found it.
            slot.max = BEAM_LIFETIME;
        } else {
            mesh.geometry = this._geoFor(arc);
            mesh.scale.setScalar(radius);
            mat.uniforms.uLane.value = 0;
            slot.max = LIFETIME;
        }
        mat.uniforms.uArc.value = Math.max(0.05, arc / 2);
        mat.uniforms.uAge.value = 0;
        // rotation.y = φ maps local +X to world (cos φ, 0, -sin φ);
        // we want it to land on (fx, fz) ⇒ φ = atan2(-fz, fx).
        // (?? not ||: x = 0 is a valid heading on the north/south axes)
        const fx = facingVec?.x ?? 1;
        const fz = facingVec?.z ?? 0;
        mesh.rotation.set(0, Math.atan2(-fz, fx), 0);
        mat.color.setHex(color);
        mat.opacity = 0.85;
        mesh.visible = true;
        slot.life = slot.max;
    }

    /** Cached sector geometry for a given arc, built on first use. */
    _geoFor(arc) {
        const key = arc.toFixed(3);
        let g = this._arcGeos.get(key);
        if (!g) {
            g = makeFanGeometry(arc);
            this._arcGeos.set(key, g);
        }
        return g;
    }

    update(dt) {
        for (const slot of this.pool) {
            if (slot.life <= 0) continue;
            if (slot.spin) slot.mesh.rotation.y += slot.spin * dt;
            slot.life -= dt;
            if (slot.life <= 0) {
                slot.life = 0;
                slot.mesh.visible = false;
                slot.mat.opacity = 0;
                continue;
            }
            const max = slot.max || LIFETIME;
            const k = slot.life / max;
            // `uAge` runs 0 → 1 over the smear's life and drives the wipe and
            // the beam pulse. It is the only thing that makes a swing look
            // SWUNG rather than stamped.
            slot.mat.uniforms.uAge.value = 1 - k;
            // Held flat for the first third, then faded. A smear that starts
            // dimming on frame one never reaches full brightness at the moment
            // it actually connects.
            slot.mat.opacity = 0.9 * Math.min(1, k / 0.66);
            if (slot.grow !== false) slot.mesh.scale.multiplyScalar(1 + 0.6 * dt);
        }
    }

    get activeCount() {
        return this.pool.filter((s) => s.life > 0).length;
    }

    dispose() {
        for (const slot of this.pool) {
            this.scene.remove(slot.mesh);
            slot.mat.dispose();
        }
        for (const g of this._arcGeos.values()) g.dispose();
        this._arcGeos.clear();
        this._laneGeo.dispose();
        this.pool = [];
    }
}
