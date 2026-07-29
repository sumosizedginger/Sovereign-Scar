// src/engine/quality.js
// Purpose: Graphics quality tiers — gates every effect added in Graphics.md
// (Phases A-F) so "max" fidelity is opt-in rather than the forced default.
// Dependencies: ./renderer.js, ./lights.js, ./environment.js, ../context.js

import {
    renderer, composer,
    bloomPass, vignettePass, filmPass, smaaPass, rgbShiftPass
} from './renderer.js';
import { setShadowMapSize } from './lights.js';
import { applyEnvironmentForTheme, clearEnvironment } from './environment.js';
import { world } from '../context.js';

export const TIERS = {
    low: {
        pixelRatio: 1, bloom: false, bloomStrength: 0, shadowMap: 1024,
        env: false, postExtras: false, aberration: false, reflections: false
    },
    med: {
        pixelRatio: 1.5, bloom: true, bloomStrength: 0.7, shadowMap: 2048,
        env: true, postExtras: false, aberration: false, reflections: false
    },
    high: {
        // 4096: 2048 across a ±30 frustum is 2048/60 = ~34 texels per world
        // unit, not the ~68 an earlier version of this comment claimed — the
        // arithmetic dropped the factor of two on the frustum's full span. Thin
        // either way for blocky geometry (graphics overhaul ticket 2), and the
        // penumbra is derived from this number, so it had to be right.
        pixelRatio: 2, bloom: true, bloomStrength: 0.9, shadowMap: 4096,
        env: true, postExtras: true, aberration: false, reflections: false
    },
    ultra: {
        pixelRatio: 2, bloom: true, bloomStrength: 1.2, shadowMap: 4096,
        env: true, postExtras: true, aberration: true, reflections: true
    }
};

// MSAA sample count is fixed at composer-construction time (see renderer.js)
// and is intentionally NOT re-tiered here — recreating the composer's render
// target at runtime is more risk than the visual payoff justifies. All other
// knobs below are safe to flip live.

let current = 'high';

function readInitialTier() {
    try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('quality');
        if (fromUrl && TIERS[fromUrl]) return fromUrl;
        const fromStorage = window.localStorage && window.localStorage.getItem('gfxQuality');
        if (fromStorage && TIERS[fromStorage]) return fromStorage;
    } catch (e) {
        // localStorage/URLSearchParams unavailable (e.g. some headless
        // contexts) — fall through to the default tier.
    }
    // Phones/tablets (touch as PRIMARY pointer) default a tier down: the
    // bloom/shadow budget tuned for desktop GPUs is a slideshow on mid-range
    // mobile. An explicit URL param or stored choice above still wins.
    try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
            return 'med';
        }
    } catch (e) { /* ignore */ }
    return 'high';
}

/** Apply a quality tier by name. Safe to call repeatedly / mid-game. */
export function setQuality(name) {
    const tier = TIERS[name] ? name : 'high';
    current = tier;
    const t = TIERS[tier];

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, t.pixelRatio));
    composer.setPixelRatio(renderer.getPixelRatio());

    bloomPass.enabled = t.bloom;
    bloomPass.strength = t.bloomStrength;

    setShadowMapSize(t.shadowMap);

    // Apply/clear immediately rather than waiting for the next level load —
    // works in both directions (dropping a tier clears it now; raising a
    // tier re-applies from the env cache now, if that theme's texture has
    // already loaded).
    if (t.env && world.level) {
        applyEnvironmentForTheme(world.level.theme);
    } else {
        clearEnvironment();
    }

    vignettePass.enabled = t.postExtras;
    filmPass.enabled = t.postExtras;
    smaaPass.enabled = t.postExtras;
    rgbShiftPass.enabled = t.aberration;

    if (world.level && world.level._reflector) {
        world.level._reflector.visible = t.reflections;
    }

    try {
        if (window.localStorage) window.localStorage.setItem('gfxQuality', tier);
    } catch (e) {
        // ignore — persistence is a convenience, not a requirement
    }
}

export function getQuality() {
    return current;
}

export function cycleQuality() {
    const order = ['low', 'med', 'high', 'ultra'];
    const idx = order.indexOf(current);
    setQuality(order[(idx + 1) % order.length]);
    return current;
}

/** Call once at bootstrap, after the renderer/composer/lights exist. */
export function initQuality() {
    setQuality(readInitialTier());
}
