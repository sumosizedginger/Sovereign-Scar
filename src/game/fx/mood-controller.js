// Crust / Abyss mood switching — post uniforms + layered music beds.

import * as THREE from 'three';
import { scene, bloomPass, filmPass, vignettePass } from '../../engine/renderer.js';
import {
    playDrone, stopAllDrones, playNoise, initAudio,
    startMusicBed, stopMusicBed, updateMusicBed,
} from '../../audio/synth.js';
import { MOOD_PRESETS } from '../assets/palettes.js';
import { getSetting } from '../../engine/settings.js';

export class MoodController {
    constructor() {
        this.mood = 'crust';
        this._noiseAcc = 0;
        this._ramp = null; // { from, to, t, dur }
        this.musicProfile = 'crust';
        this._lights = null;
    }

    /** S4: bind engine light objects so presets can drive ambient/key. */
    bindLights({ keySun, fillNeon, rimWarm, ambient } = {}) {
        this._lights = { keySun, fillNeon, rimWarm, ambient };
    }

    get current() {
        return this.mood;
    }

    apply(moodName, { audio = true, music } = {}) {
        const preset = MOOD_PRESETS[moodName] || MOOD_PRESETS.crust;
        this.mood = moodName in MOOD_PRESETS ? moodName : 'crust';

        scene.background = new THREE.Color(preset.background);
        if (scene.fog) {
            scene.fog.color.setHex(preset.fog);
            scene.fog.density = preset.fogDensity;
        }

        if (bloomPass) bloomPass.strength = preset.bloom;
        if (filmPass?.uniforms?.intensity) {
            filmPass.uniforms.intensity.value = preset.film;
        }
        if (vignettePass?.uniforms?.offset) {
            vignettePass.uniforms.offset.value = preset.vignette;
        }

        if (this._lights) {
            const L = this._lights;
            if (L.ambient && preset.ambient != null) {
                L.ambient.color.setHex(preset.ambient);
                L.ambient.intensity = preset.ambientIntensity ?? 0.5;
            }
            if (L.keySun && preset.key != null) {
                L.keySun.color.setHex(preset.key);
                L.keySun.intensity = preset.keyIntensity ?? 1.35;
            }
        }

        if (audio && !getSetting('reduceHorrorAudio')) {
            try { initAudio(); } catch (_) {}
            stopAllDrones();
            const d = preset.drone;
            // Keep a thin single drone under the bed for character
            if (d) playDrone(d.type, d.freq, (d.vol || 0.05) * 0.55, 'music', d.id || 'mood');
            const bed = music || (this.mood === 'abyss' ? 'abyss' : 'crust');
            this.musicProfile = bed;
            startMusicBed(bed);
        }
    }

    /** Switch to boss / leviathan bed without changing visual mood. */
    setMusicProfile(name) {
        if (getSetting('reduceHorrorAudio')) return;
        try { initAudio(); } catch (_) {}
        this.musicProfile = name;
        startMusicBed(name);
    }

    /** Smooth 1.5s phase-shift ramp (Beat 05). */
    startRamp(toMood, duration = 1.5) {
        const from = MOOD_PRESETS[this.mood] || MOOD_PRESETS.crust;
        const to = MOOD_PRESETS[toMood] || MOOD_PRESETS.abyss;
        this._ramp = { from, to, t: 0, dur: duration, toName: toMood };
    }

    update(dt) {
        if (this._ramp) {
            this._ramp.t += dt;
            const u = Math.min(1, this._ramp.t / this._ramp.dur);
            const a = this._ramp.from, b = this._ramp.to;
            if (bloomPass) bloomPass.strength = a.bloom + (b.bloom - a.bloom) * u;
            if (filmPass?.uniforms?.intensity) {
                filmPass.uniforms.intensity.value = a.film + (b.film - a.film) * u;
            }
            if (vignettePass?.uniforms?.offset) {
                vignettePass.uniforms.offset.value = a.vignette + (b.vignette - a.vignette) * u;
            }
            const bg = new THREE.Color(a.background).lerp(new THREE.Color(b.background), u);
            scene.background = bg;
            if (scene.fog) {
                scene.fog.color.copy(bg);
                scene.fog.density = a.fogDensity + (b.fogDensity - a.fogDensity) * u;
            }
            if (this._lights) {
                const L = this._lights;
                if (L.ambient && a.ambient != null && b.ambient != null) {
                    L.ambient.color.copy(new THREE.Color(a.ambient).lerp(new THREE.Color(b.ambient), u));
                    const ai = a.ambientIntensity ?? 0.5, bi = b.ambientIntensity ?? 0.5;
                    L.ambient.intensity = ai + (bi - ai) * u;
                }
                if (L.keySun && a.key != null && b.key != null) {
                    L.keySun.color.copy(new THREE.Color(a.key).lerp(new THREE.Color(b.key), u));
                    const ak = a.keyIntensity ?? 1.35, bk = b.keyIntensity ?? 1.35;
                    L.keySun.intensity = ak + (bk - ak) * u;
                }
            }
            if (u >= 1) {
                this.apply(this._ramp.toName, { audio: true, music: 'abyss' });
                this._ramp = null;
            }
        }

        const preset = MOOD_PRESETS[this.mood];
        if (preset?.noisePulse && !getSetting('reduceHorrorAudio')) {
            this._noiseAcc += dt;
            if (this._noiseAcc > 2.8) {
                this._noiseAcc = 0;
                playNoise(0.4, 0.12, 'bandpass', 800, 2400, 0.6, 'music');
            }
        }
        updateMusicBed(dt);
    }

    toggle() {
        this.apply(this.mood === 'crust' ? 'abyss' : 'crust');
    }
}
