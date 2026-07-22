// Browser E2E (Ticket C): quality and mood settings must resolve
// deterministically in any call order.
//
// The historical defect: engine setQuality wrote raw tier post values
// (bloom strength etc.) while mood.apply wrote mood-capped values — so the
// frame you got depended on which setting the player touched last. The fix
// funnels both paths through MoodController.reapplyVisual(); this spec
// proves the funnel by composing every (quality, mood) pair in both orders
// and asserting byte-identical visual snapshots.

import { startServer, findChromeVerbose, disableGamepads, sleep } from './harness.mjs';

const QUALITIES = ['low', 'med', 'high', 'ultra'];
const MOODS = ['crust', 'abyss'];

export async function run(t) {
    let puppeteer;
    try {
        puppeteer = (await import('puppeteer-core')).default;
    } catch (e) {
        t.ok('puppeteer-core', false, String(e));
        return;
    }
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }

    const server = await startServer(8794);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(60000);
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });

        const rows = await page.evaluate(async ({ QUALITIES, MOODS }) => {
            const s = window.__sovereignScar;
            const out = [];
            const tune = { ambient: 2.5, key: 1.4 }; // a realistic per-level trim
            for (const q of QUALITIES) {
                for (const m of MOODS) {
                    // Order A: quality first, then mood
                    s.applyQualitySetting(q);
                    s.mood.apply(m, { audio: false, tune });
                    const a = s.mood.visualSnapshot();
                    // Scramble state, then Order B: mood first, then quality
                    s.applyQualitySetting(q === 'low' ? 'ultra' : 'low');
                    s.mood.apply(m === 'crust' ? 'abyss' : 'crust', { audio: false, tune: null });
                    s.mood.apply(m, { audio: false, tune });
                    s.applyQualitySetting(q);
                    const b = s.mood.visualSnapshot();
                    out.push({ q, m, a, b });
                }
            }
            // restore defaults for any spec running after us
            s.applyQualitySetting('high');
            s.mood.apply('crust', { audio: false, tune: null });
            return out;
        }, { QUALITIES, MOODS });

        for (const r of rows) {
            const same = JSON.stringify(r.a) === JSON.stringify(r.b);
            t.ok(`quality=${r.q} mood=${r.m} composes order-independently`, same,
                same ? '' : `A=${JSON.stringify(r.a)} B=${JSON.stringify(r.b)}`);
        }
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
