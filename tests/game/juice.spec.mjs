// tests/game/juice.spec.mjs
// Pure-node spec for the Phase A game-feel core (fx/juice.js) and the
// scar-shard inventory additions. juice.js is dependency-free by design.

import { juice } from '../../src/game/fx/juice.js';
import { Inventory } from '../../src/game/kernel/inventory.js';

function resetJuice() {
    juice.trauma = 0;
    juice.timeScale = 1;
    juice.reduceShake = false;
    juice.reduceFlash = false;
    juice.damageFlash = 0;
    juice._hitstopT = 0;
    juice._flashes.length = 0;
    juice._vignette = null;
    juice._vignetteBase = null;
    juice.onKill = null;
}

// Minimal stand-in for a THREE material with an emissive color
function fakeMaterial(hex = 0x102030) {
    let h = hex;
    return {
        emissive: { getHex: () => h, setHex: (v) => { h = v; } },
        emissiveIntensity: 1,
        userData: {},
        get _hex() { return h; },
    };
}

function fakeRoot(materials) {
    return {
        traverse(fn) {
            for (const m of materials) fn({ material: m });
        },
    };
}

export function run(t) {
    // Trauma clamps at 1 and decays to 0
    resetJuice();
    juice.addTrauma(0.7);
    juice.addTrauma(0.7);
    t.ok('trauma clamps at 1', juice.trauma === 1);
    juice.update(0.5);
    t.ok('trauma decays', juice.trauma < 1 && juice.trauma > 0);
    juice.update(10);
    t.ok('trauma floors at 0', juice.trauma === 0);

    // Shake amplitude: zero at zero trauma, nonzero under trauma, reduced mode
    resetJuice();
    let s = juice.shakeOffset();
    t.ok('no shake at zero trauma', s.x === 0 && s.y === 0 && s.z === 0);
    juice.addTrauma(1);
    juice._t = 0.37; // arbitrary phase
    const full = juice.shakeOffset();
    const fullMag = Math.hypot(full.x, full.y, full.z);
    t.ok('shake nonzero under trauma', fullMag > 0);
    juice.reduceShake = true;
    const reduced = juice.shakeOffset();
    const reducedMag = Math.hypot(reduced.x, reduced.y, reduced.z);
    t.ok('reduceShake quarters amplitude', Math.abs(reducedMag - fullMag * 0.25) < 1e-9);

    // Hitstop: drops timescale, restores after duration, repeats extend
    resetJuice();
    juice.hitstop(0.1);
    t.ok('hitstop drops timescale', juice.timeScale === 0.05);
    juice.update(0.05);
    t.ok('hitstop persists mid-window', juice.timeScale === 0.05);
    juice.hitstop(0.1); // extend
    juice.update(0.08);
    t.ok('repeat extends hitstop', juice.timeScale === 0.05);
    juice.update(0.05);
    t.ok('timescale restores to 1', juice.timeScale === 1);

    // Material flash: sets white, restores original after FLASH_TIME
    resetJuice();
    const mat = fakeMaterial(0x445566);
    juice.flashTarget(fakeRoot([mat]));
    t.ok('flash sets emissive white', mat._hex === 0xffffff);
    t.ok('flash raises intensity', mat.emissiveIntensity === 0.85);
    juice.update(0.2);
    t.ok('flash restores original hex', mat._hex === 0x445566);
    t.ok('flash restores intensity', mat.emissiveIntensity === 1);
    t.ok('flash list drained', juice._flashes.length === 0);

    // reduceFlash skips material flashes entirely
    resetJuice();
    juice.reduceFlash = true;
    const mat2 = fakeMaterial(0x445566);
    juice.flashTarget(fakeRoot([mat2]));
    t.ok('reduceFlash skips material flash', mat2._hex === 0x445566);

    // Damage vignette: captures baseline, dips, restores exactly
    resetJuice();
    const pass = { uniforms: { offset: { value: 0.92 } } };
    juice.bindVignette(pass);
    juice.spikeDamageVignette();
    juice.update(0.016);
    t.ok('vignette dips below baseline', pass.uniforms.offset.value < 0.92);
    juice.update(5);
    t.ok('vignette restores baseline exactly', pass.uniforms.offset.value === 0.92);
    t.ok('vignette baseline cleared', juice._vignetteBase === null);

    // Flash on a root with no emissive materials must not throw
    resetJuice();
    let threw = false;
    try {
        juice.flashTarget({ traverse: (fn) => fn({ material: null }) });
        juice.flashTarget(null);
    } catch (e) { threw = true; }
    t.ok('flashTarget tolerates bad roots', !threw);

    // Scar shards: add/spend/round-trip
    const inv = new Inventory();
    t.ok('shards default 0', inv.scarShards === 0);
    inv.addShards(30);
    t.ok('addShards accumulates', inv.scarShards === 30);
    t.ok('spendShards success', inv.spendShards(12) && inv.scarShards === 18);
    t.ok('spendShards rejects overdraft', !inv.spendShards(999) && inv.scarShards === 18);
    const round = Inventory.fromJSON(inv.toJSON());
    t.ok('shards survive JSON round-trip', round.scarShards === 18);
    const legacy = Inventory.fromJSON({ weapons: ['anchor_link'] });
    t.ok('legacy saves default shards to 0', legacy.scarShards === 0);

    resetJuice();
}
