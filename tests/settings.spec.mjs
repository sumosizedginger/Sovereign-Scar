// tests/settings.spec.mjs
// Pure-node unit spec for src/engine/settings.js — no browser needed.
//
// settings.js reads `window.localStorage` at module-eval time, so each case
// below stubs `globalThis.window` *before* importing the module, and uses a
// cache-busting query string so Node's ESM loader treats each import as a
// fresh module instance (a fresh top-level evaluation) instead of a cached one.

import path from 'path';
import { fileURLToPath } from 'url';
import { createSink, summarize } from './harness.mjs';

const MODULE_PATH = '../src/engine/settings.js';

function memoryStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
        _store: store
    };
}

export async function run(t) {
    // No window.localStorage at all (window exists, no storage key) — must not throw.
    {
        globalThis.window = {};
        let mod;
        try {
            mod = await import(MODULE_PATH + '?case=no-storage');
        } catch (e) {
            t.ok('degrades with no localStorage (import)', false, String(e));
        }
        if (mod) {
            t.ok('degrades with no localStorage (import)', true);
            t.ok('defaults present with no storage', mod.getSetting('difficulty') === 'medium');
            let threw = false;
            try { mod.setSetting('masterVolume', 0.5); } catch (e) { threw = true; }
            t.ok('setSetting does not throw with no storage', !threw);
            t.ok('setSetting still updates in-memory value',
                mod.getSetting('masterVolume') === 0.5);
        }
    }

    // localStorage that throws on access (privacy mode) — must not throw.
    {
        globalThis.window = {
            get localStorage() { throw new Error('blocked'); }
        };
        const mod = await import(MODULE_PATH + '?case=throwing-storage');
        let threw = false;
        try {
            mod.setSetting('sfxVolume', 0.2);
            mod.getProgress();
        } catch (e) { threw = true; }
        t.ok('degrades when localStorage access throws', !threw);
    }

    // Real persistence across a simulated "reload" (same backing store, fresh module).
    {
        const storage = memoryStorage();
        globalThis.window = { localStorage: storage };
        const first = await import(MODULE_PATH + '?case=persist-1');
        first.setSetting('difficulty', 'hard');
        first.setProgress({ highestLevel: 4 });

        globalThis.window = { localStorage: storage }; // same backing Map
        const second = await import(MODULE_PATH + '?case=persist-2');
        t.ok('setting persists across reload', second.getSetting('difficulty') === 'hard');
        t.ok('progress persists across reload', second.getProgress().highestLevel === 4);
    }

    // markProgressFlag dedups.
    {
        globalThis.window = { localStorage: memoryStorage() };
        const mod = await import(MODULE_PATH + '?case=mark-flag');
        mod.markProgressFlag('hintsSeen', 'dash');
        mod.markProgressFlag('hintsSeen', 'dash');
        mod.markProgressFlag('hintsSeen', 'parry');
        t.ok('markProgressFlag dedups', mod.getProgress().hintsSeen.length === 2,
            JSON.stringify(mod.getProgress().hintsSeen));
    }

    // addScore sorts descending and caps at 10.
    {
        globalThis.window = { localStorage: memoryStorage() };
        const mod = await import(MODULE_PATH + '?case=scores');
        for (let i = 0; i < 12; i++) mod.addScore({ score: i * 10, hero: 'a' });
        const scores = mod.getScores();
        t.ok('addScore caps at 10', scores.length === 10, 'len=' + scores.length);
        t.ok('addScore sorts descending', scores[0].score === 110 && scores[9].score === 20,
            JSON.stringify(scores.map((s) => s.score)));
    }

    // resetAll clears storage and in-memory state, and array fields don't alias defaults.
    {
        const storage = memoryStorage();
        globalThis.window = { localStorage: storage };
        const mod = await import(MODULE_PATH + '?case=reset');
        mod.setSetting('difficulty', 'hard');
        mod.markProgressFlag('hintsSeen', 'dash');
        mod.resetAll();
        t.ok('resetAll restores setting defaults', mod.getSetting('difficulty') === 'medium');
        t.ok('resetAll clears progress arrays', mod.getProgress().hintsSeen.length === 0);
        mod.markProgressFlag('hintsSeen', 'roll');
        t.ok('resetAll array fields are independent (no aliasing)',
            mod.getProgress().hintsSeen.length === 1);
    }

    // Scoreboards are isolated by immutable run mode and score version.
    {
        globalThis.window = { localStorage: memoryStorage() };
        const mod = await import(MODULE_PATH + '?case=score-boards');
        mod.addScore({ score: 100, runMode: 'medium', scoreVersion: 1 });
        mod.addScore({ score: 900, runMode: 'survival', scoreVersion: 1 });
        mod.addScore({ score: 800, runMode: 'medium', scoreVersion: 2 });
        mod.addScore({ score: 999, runMode: 'survival', scoreVersion: 1, runId: 'same-run' });
        mod.addScore({ score: 999, runMode: 'survival', scoreVersion: 1, runId: 'same-run' });
        t.ok('score boards isolate run modes',
            mod.getScores({ runMode: 'medium', scoreVersion: 1 }).length === 1
            && mod.getScores({ runMode: 'medium', scoreVersion: 1 })[0].score === 100);
        t.ok('score boards isolate score versions',
            mod.getScores({ runMode: 'medium', scoreVersion: 2 })[0].score === 800);
        t.ok('score submission is idempotent by run ID',
            mod.getScores({ runMode: 'survival', scoreVersion: 1 })
                .filter((entry) => entry.runId === 'same-run').length === 1);
    }

    // difficultyMultipliers.
    {
        globalThis.window = { localStorage: memoryStorage() };
        const mod = await import(MODULE_PATH + '?case=difficulty');
        mod.setSetting('difficulty', 'easy');
        t.ok('easy multipliers', mod.difficultyMultipliers().enemyHp === 0.7);
        mod.setSetting('difficulty', 'hard');
        t.ok('hard multipliers', mod.difficultyMultipliers().enemyDmg === 1.35);
        mod.setSetting('difficulty', 'normal');
        const n = mod.difficultyMultipliers();
        t.ok('normal multipliers', n.enemyHp === 1 && n.enemyDmg === 1);
    }

    // onSettingChange notifies subscribers and unsubscribe works.
    {
        globalThis.window = { localStorage: memoryStorage() };
        const mod = await import(MODULE_PATH + '?case=listener');
        const seen = [];
        const unsub = mod.onSettingChange((k, v) => seen.push([k, v]));
        mod.setSetting('lastHero', 2);
        unsub();
        mod.setSetting('lastHero', 3);
        t.ok('onSettingChange notifies then respects unsubscribe',
            seen.length === 1 && seen[0][0] === 'lastHero' && seen[0][1] === 2,
            JSON.stringify(seen));
    }

    delete globalThis.window;
}

// Directly runnable: `node tests/settings.spec.mjs`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const t = createSink('settings');
    run(t).then(() => process.exit(summarize([t]) ? 1 : 0));
}
