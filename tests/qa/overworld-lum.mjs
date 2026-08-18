// tests/qa/overworld-lum.mjs — the overworld's sixteen certification samples.
//
//   node tests/qa/overworld-lum.mjs [region]
//
// Print-only. Sweeps one representative screen per overworld region in BOTH
// mirror states and reports centre-crop luminance against the certification
// band, using the same sampler, the same screens and the same bands as
// `tests/visual-sanity.spec.mjs`.
//
// WHY IT EXISTS. Those sixteen samples are gated, and until this the only way
// to see them was a twenty-minute full-suite run. The overworld ground-relief
// pass put one of them — pyre, in the Abyss state — 4.5 points under the floor,
// and iterating on that against the whole suite would have cost hours. It took
// three measured attempts here: pull back the scorch decal (71.5 -> 73.3),
// make the terrace shade mood-aware because the Abyss floors are already dark
// (-> 75.5), and then a modest `ABYSS_REGION_MULT` lift, which is the mechanism
// that already existed for exactly this (-> 79.8).
//
// It is a PROBE, not a gate: `visual-sanity` is the gate, and this reads its
// `LUM_BANDS` rather than carrying a copy. A probe that disagrees with the gate
// is worse than no probe — `lum-probe.mjs` carried its own bands for months and
// sent people chasing regressions that were not there.

import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';
import { LUM_BANDS } from '../visual-sanity.spec.mjs';

/**
 * One representative screen per region, PINNED TO THE SAME ONES the gate uses
 * (`OVERWORLD_REGIONS` in `tests/visual-sanity.spec.mjs`). A probe that samples
 * different places from the gate it is meant to predict is a probe that sends
 * someone chasing a regression that is not there.
 */
const REGIONS = {
    tombfields: 'r1c1', spindle: 'r1c3', pyre: 'r2c5', sinklands: 'r3c1',
    citadel: 'sink', quarry: 'r5c1', cryomire: 'r5c6', bonetown: 'r6c2',
};
const ONLY = process.argv[2] || null;

const chrome = findChromeVerbose();
const puppeteer = await import('puppeteer-core');
const server = await startServer(8798);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path, headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    const page = await browser.newPage();
    await disableGamepads(page);
    page.setDefaultTimeout(180000);
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });
    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.startNewGame(); s.game.atTitle = false; s.game.paused = false; s.menu.close();
    });
    await sleep(500);

    const entries = Object.entries(REGIONS).filter(([r]) => !ONLY || r === ONLY);
    const rows = await page.evaluate(async (regions) => {
        const s = window.__sovereignScar;
        const out = [];
        for (const [region, screen] of regions) {
            for (const state of ['crust', 'abyss']) {
                s.patchOverworld({ pos: { world: 'overworld', screen, x: 0, z: 0 }, state });
                s.loadLevel('overworld');
                await new Promise((r) => setTimeout(r, 900));
                const got = [];
                for (let i = 0; i < 5; i++) {
                    got.push(await s.sampleLuminanceStats());
                    await new Promise((r) => setTimeout(r, 150));
                }
                const med = (k) => got.map((g) => g[k]).sort((a, b) => a - b)[2];
                out.push({
                    region, screen, state, lum: med('centerMean'),
                    contrast: med('contrast'), mood: s.game.level?.mood || state,
                });
            }
        }
        return out;
    }, entries);

    console.log('region        state   lum    band        contrast');
    let bad = 0;
    for (const r of rows) {
        const [lo, hi] = LUM_BANDS[r.mood] || LUM_BANDS.crust;
        const ok = r.lum >= lo && r.lum <= hi;
        if (!ok) bad++;
        console.log(`${r.region.padEnd(12)} ${r.state.padEnd(6)} ${r.lum.toFixed(1).padStart(6)}  `
            + `[${lo},${hi}]   ${String(r.contrast).padStart(6)}  ${ok ? '' : '  <-- OUT'}`);
    }
    console.log(bad ? `\n${bad} OUT OF BAND` : '\nall in band');
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
