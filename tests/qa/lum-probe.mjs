// Focused luminance probe — samples every level the way tests/visual-sanity.spec.mjs
// does, without the scale/grounding asserts. Use this to retune MOOD_PRESETS /
// per-level lightTune without paying for a full suite run:
//
//   node tests/qa/lum-probe.mjs
//
// THIS FILE LIED FOR MONTHS AND NOBODY NOTICED, because it is print-only and
// nothing fails when a print-only probe is wrong. It reported ten of sixteen
// levels out of band on a campaign whose real gate was green, in THREE separate
// ways, every one of which the repository had already fixed somewhere else:
//
//  1. It started runs with `click, ArrowDown, Enter`. That is the fixture
//     `visual-sanity.spec.mjs` documents abandoning — adding one menu row moves
//     what ArrowDown selects, and the sequence quietly stopped starting a run at
//     all. `startNewGame` exists on the dev bridge for exactly this.
//  2. It sampled `sampleLuminance` — the WHOLE FRAME. The gate reads the CENTRE
//     CROP, because the frame's corners are void and letterbox and averaging
//     them in measures the background, not the room.
//  3. It carried its own bands, `[35,75]` for abyss and `[45,90]` for crust.
//     Those were replaced by one shared band derived from the measured campaign.
//     Hard-coding a number the gate owns means the copy goes stale silently.
//
// The bands and the sampler now come FROM the spec. A probe that disagrees with
// the gate is worse than no probe: it sends someone chasing a regression that
// is not there, which is what it did on the day it was fixed.
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';
import { LUM_BANDS } from '../visual-sanity.spec.mjs';

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

const server = await startServer(8797);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    const page = await browser.newPage();
    await disableGamepads(page);
    page.setDefaultTimeout(60000);
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), { timeout: 25000 });
    // A real user gesture is still needed (audio unlock); the keystrokes are
    // not — `startNewGame` says what it wants instead of miming a menu.
    await page.mouse.click(400, 300);
    await page.evaluate(() => window.__sovereignScar.startNewGame('medium'));
    await sleep(300);

    const rows = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.game.atTitle = false;
        s.game.paused = false;
        s.menu.close();
        const out = [];
        for (const meta of s.LEVELS) {
            try {
                s.loadLevel(meta.id);
                s.game.bossIntro = null;
                await new Promise((r) => setTimeout(r, 600));
                // Median of three centre-crop reads, as the gate does. The
                // centre crop is the point: `sampleLuminance` averages the
                // whole frame including the void beyond the room.
                const got = [];
                for (let i = 0; i < 3; i++) {
                    got.push(await s.sampleLuminanceStats());
                    await new Promise((r) => setTimeout(r, 160));
                }
                const lum = got.map((g) => g.centerMean).sort((a, b) => a - b)[1];
                const contrast = got.map((g) => g.contrast).sort((a, b) => a - b)[1];
                out.push({
                    id: meta.id,
                    mood: s.game.level.mood || meta.mood || 'crust',
                    lum, contrast,
                });
            } catch (e) {
                out.push({ id: meta.id, err: String(e) });
            }
        }
        return out;
    });

    for (const r of rows) {
        if (r.err) { console.log(`${r.id}  ERR ${r.err}`); continue; }
        const band = LUM_BANDS[r.mood] || LUM_BANDS.crust;
        const ok = r.lum >= band[0] && r.lum <= band[1] ? 'ok  ' : 'FAIL';
        console.log(`${ok} ${r.id.padEnd(20)} mood=${r.mood.padEnd(6)} ` +
            `lum=${r.lum.toFixed(1)} band=[${band}]  contrast=${r.contrast}`);
    }
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
