// Game-feel core: trauma screen shake, hitstop timescale, hit flashes,
// damage vignette. Dependency-free so pure-node unit tests can import it;
// index.js binds the vignette pass and camera consumers at boot.

const MAX_SHAKE = 0.35;      // world units at trauma = 1
const TRAUMA_DECAY = 1.6;    // per second
const HITSTOP_SCALE = 0.05;  // timescale during hitstop
const FLASH_TIME = 0.08;     // seconds per material flash

class Juice {
    constructor() {
        this.trauma = 0;
        this.timeScale = 1;
        this.reduceShake = false;
        this.reduceFlash = false;
        this.damageFlash = 0;
        /** Fired with the killed defender; index.js hooks soul motes here. */
        this.onKill = null;
        this._t = 0;
        this._hitstopT = 0;
        this._flashes = [];        // { material, origHex, origIntensity, until }
        this._vignette = null;     // bound pass (index.js)
        this._vignetteBase = null; // uniform value captured at spike time
    }

    /** Bind the composer vignette pass (browser only). */
    bindVignette(pass) {
        this._vignette = pass || null;
    }

    addTrauma(x) {
        this.trauma = Math.min(1, this.trauma + Math.max(0, x));
    }

    /** Freeze gameplay to 5% speed for `sec` REAL seconds; repeats extend. */
    hitstop(sec) {
        this._hitstopT = Math.max(this._hitstopT, sec);
        this.timeScale = HITSTOP_SCALE;
    }

    /** Camera-space offset; amplitude = trauma^2, three-octave smooth noise. */
    shakeOffset() {
        let amp = this.trauma * this.trauma * MAX_SHAKE;
        if (this.reduceShake) amp *= 0.25;
        if (amp <= 0) return { x: 0, y: 0, z: 0 };
        const t = this._t;
        const n = (a, b, c, p) =>
            Math.sin(t * a + p) * 0.55 + Math.sin(t * b + p * 2.1) * 0.3 + Math.sin(t * c + p * 3.7) * 0.15;
        return {
            x: amp * n(39.7, 71.3, 113.9, 0),
            y: amp * 0.6 * n(47.1, 83.7, 127.3, 1.3),
            z: amp * n(43.9, 79.1, 109.7, 2.6),
        };
    }

    /** White-flash every emissive material under a THREE object root. */
    flashTarget(root) {
        if (this.reduceFlash || !root || typeof root.traverse !== 'function') return;
        const until = this._t + FLASH_TIME;
        root.traverse((m) => {
            const mat = m && m.material;
            if (!mat || !mat.emissive || typeof mat.emissive.getHex !== 'function') return;
            if (mat.userData && mat.userData._juiceFlash) {
                mat.userData._juiceFlash.until = until;
                return;
            }
            const entry = {
                material: mat,
                origHex: mat.emissive.getHex(),
                origIntensity: mat.emissiveIntensity != null ? mat.emissiveIntensity : 1,
                until,
            };
            mat.userData = mat.userData || {};
            mat.userData._juiceFlash = entry;
            mat.emissive.setHex(0xffffff);
            mat.emissiveIntensity = 0.85;
            this._flashes.push(entry);
        });
    }

    /** Red vignette pulse on player damage; restores the mood baseline. */
    spikeDamageVignette() {
        const u = this._vignette?.uniforms?.offset;
        if (u && this._vignetteBase == null) this._vignetteBase = u.value;
        this.damageFlash = 1;
    }

    /** Tick with RAW dt (never the scaled dt) so hitstop can end itself. */
    update(dt) {
        this._t += dt;
        this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);

        if (this._hitstopT > 0) {
            this._hitstopT -= dt;
            if (this._hitstopT <= 0) {
                this._hitstopT = 0;
                this.timeScale = 1;
            }
        }

        if (this._flashes.length) {
            for (let i = this._flashes.length - 1; i >= 0; i--) {
                const f = this._flashes[i];
                if (this._t >= f.until) {
                    f.material.emissive.setHex(f.origHex);
                    f.material.emissiveIntensity = f.origIntensity;
                    if (f.material.userData) delete f.material.userData._juiceFlash;
                    this._flashes.splice(i, 1);
                }
            }
        }

        if (this.damageFlash > 0) {
            this.damageFlash *= Math.exp(-6 * dt);
            const u = this._vignette?.uniforms?.offset;
            if (this.damageFlash <= 0.01) {
                this.damageFlash = 0;
                if (u && this._vignetteBase != null) u.value = this._vignetteBase;
                this._vignetteBase = null;
            } else if (u && this._vignetteBase != null) {
                const depth = this.reduceFlash ? 0.27 : 0.55;
                u.value = this._vignetteBase - this.damageFlash * depth;
            }
        }
    }
}

export const juice = new Juice();
