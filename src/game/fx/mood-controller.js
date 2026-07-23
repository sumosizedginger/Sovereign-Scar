// Crust / Abyss mood switching — post uniforms + layered music beds.
//
// Combat readability rule: mood may change palette/fog/lights, but must never
// blow out bloom/film/vignette past the active quality tier. Altar upgrades
// are stats-only; any “graphics changed after shopping” reports were the
// mood/quality fight (especially Abyss bloom) coinciding with progression.

import * as THREE from 'three';
import { scene, renderer, bloomPass, filmPass, vignettePass } from '../../engine/renderer.js';
import { applyMoodEnvironment } from '../render/mood-environment.js';
import { stopAllDrones, playNoise, initAudio } from '../../audio/synth.js';
import {
    startScore, stopScore, updateScore, setIntensity, currentScore,
} from '../audio/score.js';
import { MOOD_PRESETS } from '../assets/palettes.js';
import { getSetting } from '../../engine/settings.js';
import { getQuality, TIERS } from '../../engine/quality.js';

/**
 * Grid the key light's aim snaps to, in world units.
 *
 * Small enough that the ±30 frustum always covers the room the player is in
 * (rooms are 64 apart, so a 16-unit snap keeps the aim within 8 units of the
 * true centre); large enough that walking around a room does not re-aim the
 * sun every frame and set every shadow edge crawling.
 */
const AIM_SNAP = 16;

/** Cap mood post values so quality tiers stay the presentation ceiling. */
function presentationPost(preset) {
    const tier = TIERS[getQuality()] || TIERS.high;
    const bloomCap = tier.bloom ? (tier.bloomStrength ?? 0.9) : 0;
    return {
        bloom: Math.min(preset.bloom ?? 0.55, bloomCap || 0.55),
        film: Math.min(preset.film ?? 0.08, 0.14),
        vignette: Math.min(preset.vignette ?? 1.05, 1.15),
    };
}

function applyPost(preset) {
    const post = presentationPost(preset);
    if (bloomPass) bloomPass.strength = post.bloom;
    if (filmPass?.uniforms?.intensity) {
        filmPass.uniforms.intensity.value = post.film;
    }
    if (vignettePass?.uniforms?.offset) {
        vignettePass.uniforms.offset.value = post.vignette;
    }
}

export class MoodController {
    constructor() {
        this.mood = 'crust';
        this._noiseAcc = 0;
        this._ramp = null; // { from, to, t, dur }
        this.musicProfile = 'crust';
        this.musicMotif = null; // C7 per-beat/region motif
        this._lights = null;
        // Per-level luminance trim ({ ambient, key, fill } multipliers).
        // Levels sit in one certification band per mood, but their floor
        // palettes differ enough that a single preset cannot hold all of
        // them inside it.
        this.tune = null;
    }

    /** S4: bind engine light objects so presets can drive ambient/key. */
    bindLights({ keySun, fillNeon, rimWarm, ambient } = {}) {
        this._lights = { keySun, fillNeon, rimWarm, ambient };
        this._aim = null;
    }

    /**
     * Point the key light's shadow frustum at (x, z).
     *
     * The frustum is a ±30-unit box and it never moved: it sat on the world
     * origin for the life of the project. Rooms live on a 64-unit grid
     * (`ROOM_STRIDE`), so only the room at grid (0,0) was ever inside it —
     * measured against Beat 01, five of six rooms had no sun shadows at all.
     * Nobody caught it because every dungeon starts at grid (0,0), so the first
     * room you see in any level is the one room that works.
     *
     * Two things this must not do:
     *
     *  - change the sun's DIRECTION. The light is moved together with its
     *    target, preserving the offset, so the shadows keep falling the same
     *    way. Move only the light and you have re-angled the sun per room.
     *  - follow continuously. A directional shadow map is projected from the
     *    frustum, so sliding it a fraction of a unit per frame makes every
     *    shadow edge crawl and shimmer. The aim is SNAPPED to a coarse grid,
     *    which also makes this a no-op on nearly every frame.
     */
    aimKeyLight(x, z) {
        const L = this._lights;
        if (!L?.keySun) return;
        const gx = Math.round(x / AIM_SNAP) * AIM_SNAP;
        const gz = Math.round(z / AIM_SNAP) * AIM_SNAP;
        if (this._aim && this._aim.x === gx && this._aim.z === gz) return;
        this._aim = { x: gx, z: gz };

        const sun = L.keySun;
        const t = sun.target;
        const offX = sun.position.x - t.position.x;
        const offY = sun.position.y - t.position.y;
        const offZ = sun.position.z - t.position.z;
        t.position.set(gx, 0, gz);
        sun.position.set(gx + offX, offY, gz + offZ);
        t.updateMatrixWorld();
        sun.updateMatrixWorld();
        // The shadow camera is derived from the light's world matrix, so it has
        // to be told the matrix changed or the frustum stays where it was —
        // which looks exactly like this fix not working.
        sun.shadow.needsUpdate = true;
    }

    get current() {
        return this.mood;
    }

    apply(moodName, opts = {}) {
        const { audio = true, music } = opts;
        this.mood = moodName in MOOD_PRESETS ? moodName : 'crust';
        // Only a caller that mentions tune changes it (level loads always
        // do); the ramp-completion apply keeps the active level's trim.
        if ('tune' in opts) this.tune = opts.tune || null;

        this.reapplyVisual();

        if (audio && !getSetting('reduceHorrorAudio')) {
            try { initAudio(); } catch (_) {}
            // NOTHING SUSTAINED GOES UNDER THE SCORE. This used to start a raw
            // oscillator here — a square at 80 Hz in the Crust, a triangle at
            // 220 Hz in the Abyss — with no envelope, no reverb, no end, wired
            // straight to the destination. It survived the rewrite that
            // replaced the drone soundtrack with a real one, so the game came
            // out with an actual score playing on top of the exact hum the
            // score was written to get rid of. The Abyss one was the worse of
            // the two: 220 Hz sits in the middle of the melody's register, so
            // it did not read as atmosphere, it read as a fault in the mix.
            //
            // stopAllDrones stays as a sweep, so a save resumed from an older
            // build cannot leave one running.
            stopAllDrones();
            // The per-level track wins over the generic mood bed: a dungeon
            // gets its own key and tempo, not "the minor one" again.
            const bed = this.musicTrack || music
                || (this.mood === 'abyss' ? 'abyss' : 'crust');
            this.musicProfile = bed;
            startScore(bed);
        }
    }

    /**
     * Re-derive every visual value (background, fog, post, lights) from the
     * current mood + tune + quality tier. Quality changes and mood changes
     * both funnel here, so the composed result is identical in any call
     * order (Ticket C determinism gate).
     */
    reapplyVisual() {
        const preset = MOOD_PRESETS[this.mood] || MOOD_PRESETS.crust;
        const tune = this.tune || {};

        scene.background = new THREE.Color(preset.background);

        // Image-based lighting. This was null for the entire life of the
        // project, which is why materials.js capped metalness at 0.12 — a
        // metal with nothing to reflect just reads dark. Rebuilt here rather
        // than at level load so a Crust↔Abyss flip takes the reflection with
        // it; the maps are cached per mood, so the flip is a lookup.
        applyMoodEnvironment(scene, renderer, this.mood);

        if (scene.fog) {
            scene.fog.color.setHex(preset.fog);
            scene.fog.density = preset.fogDensity;
        }

        applyPost(preset);

        if (this._lights) {
            const L = this._lights;
            if (L.ambient && preset.ambient != null) {
                L.ambient.color.setHex(preset.ambient);
                L.ambient.intensity = (preset.ambientIntensity ?? 0.5) * (tune.ambient ?? 1);
            }
            if (L.keySun && preset.key != null) {
                L.keySun.color.setHex(preset.key);
                L.keySun.intensity = (preset.keyIntensity ?? 1.35) * (tune.key ?? 1);
            }
            if (L.fillNeon && preset.fillIntensity != null) {
                L.fillNeon.intensity = preset.fillIntensity * (tune.fill ?? 1);
            }
            // Rim was bound but never driven, so it sat on the engine default
            // (0.65) in both moods. It is the light that separates a silhouette
            // from the fog behind it, and the Abyss needs more of it than the
            // Crust — leaving it fixed is part of why Abyss rooms read as flat.
            if (L.rimWarm && preset.rimIntensity != null) {
                L.rimWarm.intensity = preset.rimIntensity * (tune.rim ?? 1);
            }
        }
    }

    /**
     * QA snapshot of the composed presentation values (post uniforms +
     * bound light intensities). Used by the determinism e2e spec to prove
     * quality→mood and mood→quality produce identical frames.
     */
    visualSnapshot() {
        const L = this._lights || {};
        return {
            mood: this.mood,
            tune: this.tune,
            bloom: bloomPass ? +bloomPass.strength.toFixed(4) : null,
            bloomEnabled: bloomPass ? !!bloomPass.enabled : null,
            film: filmPass?.uniforms?.intensity ? +filmPass.uniforms.intensity.value.toFixed(4) : null,
            vignette: vignettePass?.uniforms?.offset ? +vignettePass.uniforms.offset.value.toFixed(4) : null,
            background: scene.background?.getHexString?.() || null,
            fog: scene.fog ? { color: scene.fog.color.getHexString(), density: +scene.fog.density.toFixed(6) } : null,
            ambient: L.ambient ? { color: L.ambient.color.getHexString(), intensity: +L.ambient.intensity.toFixed(4) } : null,
            key: L.keySun ? { color: L.keySun.color.getHexString(), intensity: +L.keySun.intensity.toFixed(4) } : null,
            fill: L.fillNeon ? +L.fillNeon.intensity.toFixed(4) : null,
            rim: L.rimWarm ? +L.rimWarm.intensity.toFixed(4) : null,
            environment: scene.environment ? 'set' : null,
            environmentIntensity: scene.environmentIntensity ?? null,
        };
    }

    /** Switch to the boss / leviathan piece without changing visual mood. */
    setMusicProfile(name) {
        if (getSetting('reduceHorrorAudio')) return;
        try { initAudio(); } catch (_) {}
        this.musicProfile = name;
        startScore(name);
    }

    /**
     * Select the track for a dungeon or overworld region by id.
     *
     * Replaces the old `setMusicMotif`, which took a `{ transpose, pattern }`
     * ratio pair and retuned three drones with it. A beat id now resolves to a
     * whole composition — key, mode, tempo, progression, melody — in
     * `audio/tracks.js`.
     */
    setMusicTrack(id) {
        if (!id || this.musicTrack === id) return;
        this.musicTrack = id;
        if (getSetting('reduceHorrorAudio')) return;
        try { initAudio(); } catch (_) {}
        this.musicProfile = id;
        startScore(id);
    }

    /**
     * Adaptive layering: 0 exploring · 1 enemies awake · 2 combat · 3 boss.
     * The tune does not change, it thickens — so there is no seam when a fight
     * starts, and the player feels the room turn without noticing why.
     */
    setMusicIntensity(n) {
        setIntensity(n);
    }

    /** Back-compat shim for the motif API this replaced. */
    setMusicMotif(motif) {
        if (typeof motif === 'string') this.setMusicTrack(motif);
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
            const ap = presentationPost(a), bp = presentationPost(b);
            if (bloomPass) bloomPass.strength = ap.bloom + (bp.bloom - ap.bloom) * u;
            if (filmPass?.uniforms?.intensity) {
                filmPass.uniforms.intensity.value = ap.film + (bp.film - ap.film) * u;
            }
            if (vignettePass?.uniforms?.offset) {
                vignettePass.uniforms.offset.value = ap.vignette + (bp.vignette - ap.vignette) * u;
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
            // Every 2.8s on the MUSIC bus, this was a texture layer nobody
            // wrote — a filtered noise swell arriving often enough to be heard
            // as part of the arrangement. It is a room sound, so it belongs on
            // the effects bus and at a spacing where it registers as the Abyss
            // breathing rather than as a part.
            if (this._noiseAcc > 9) {
                this._noiseAcc = 0;
                playNoise(0.4, 0.09, 'bandpass', 800, 2400, 0.6, 'sfx');
            }
        }
        updateScore(dt);
    }

    toggle() {
        this.apply(this.mood === 'crust' ? 'abyss' : 'crust');
    }
}
