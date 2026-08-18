// src/engine/quality.js
// Purpose: Graphics quality tiers — gates every effect added in Graphics.md
// (Phases A-F) so "max" fidelity is opt-in rather than the forced default.
// Dependencies: ./renderer.js, ./lights.js, ./environment.js

import {
    renderer, composer,
    bloomPass, vignettePass, filmPass, smaaPass, rgbShiftPass
} from './renderer.js';
import { setShadowMapSize } from './lights.js';
import { clearEnvironment } from './environment.js';
// The tier TABLE lives in a DOM-free module so specs can assert on it — this
// file cannot be imported headlessly, because `renderer.js` reads
// `window.innerWidth` at module scope. Re-exported so existing importers
// (`skybox.js`, `mood-controller.js`) are unaffected.
import { TIERS } from './quality-tiers.js';

export { TIERS };


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

    // `env` and `reflections` are GONE from the tier table, and this is the
    // tombstone — same reason `unlockedEndings` has one in settings.js.
    //
    // Both were gated on `world.level`, which is never assigned: context.js
    // exports a bare {} and game/index.js sets `world.game`, `world.player`
    // and `world.collision` and nothing else. So the env arm could not run,
    // and this branch reached `clearEnvironment()` on EVERY tier change
    // including ultra. `_reflector` was worse — zero producers anywhere in the
    // codebase, so ULTRA's headline flag read a field nothing has ever
    // written. (GRAPHICS-OVERHAUL noted `reflections` "reads nothing"; it was
    // then wired to a condition that is never true, which is not the same as
    // fixing it.)
    //
    // Do not restore these by assigning `world.level`. The live IBL path is
    // game/render/mood-environment.js, driven from MoodController; the engine
    // cache here has no producer at all (its only filler was skybox.js, which
    // is unreachable and loads from a directory that does not exist). Making
    // this branch run would null out the environment the mood system just set.
    //
    // The unconditional clear is kept because that is exactly what shipped:
    // MoodController.reapplyVisual() re-applies immediately after every
    // setQuality() call, and removing the clear would be a real visual change
    // hiding inside a cleanup.
    clearEnvironment();

    vignettePass.enabled = t.postExtras;
    filmPass.enabled = t.postExtras;
    smaaPass.enabled = t.postExtras;
    rgbShiftPass.enabled = t.aberration;

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
