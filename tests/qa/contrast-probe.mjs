// Print-only contrast probe — samples every level's luminance DISTRIBUTION the
// way tests/visual-sanity.spec.mjs does (median of five), and prints the
// p90 − p10 spread beside the mean.
//
// This exists because the mean cannot tell a well-lit room from a flat one. A
// room with a strong key and deep shadows meters LOWER than the same room under
// a flat ambient wash, so for as long as the gate banded only the mean, the
// cheapest way to pass it was to flatten the art. Read these numbers before
// setting CONTRAST_FLOOR: it is meant to be a ratchet set just under today's
// worst room, not a cliff that fails on the day it lands.
//
// Run from the repo root:  node tests/qa/contrast-probe.mjs
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

const server = await startServer(8796);
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
    await page.mouse.click(400, 300);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
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
                // Median of five, matching the gate: Beat 13's flicker shader
                // and Beat 14's wrap shader make single samples unreliable.
                const got = [];
                for (let i = 0; i < 5; i++) {
                    got.push(await s.sampleLuminanceStats());
                    await new Promise((r) => setTimeout(r, 160));
                }
                const med = (key) => {
                    const v = got.map((g) => g[key]).sort((a, b) => a - b);
                    return v[Math.floor(v.length / 2)];
                };
                out.push({
                    id: meta.id,
                    mood: s.game.level.mood || meta.mood || 'crust',
                    mean: med('mean'),
                    spread: med('spread'),
                    cMean: med('centerMean'),
                    cP10: med('centerP10'),
                    cP90: med('centerP90'),
                    contrast: med('contrast'),
                });
            } catch (e) {
                out.push({ id: meta.id, err: String(e) });
            }
        }
        return out;
    });

    console.log('level                 mood    mean  full  |  cMean  p10  p90  CONTRAST');
    console.log('-'.repeat(72));
    let worst = Infinity, worstId = '';
    for (const r of rows) {
        if (r.err) { console.log(`${r.id.padEnd(21)} ERR ${r.err}`); continue; }
        console.log(
            `${r.id.padEnd(21)} ${r.mood.padEnd(7)} ${r.mean.toFixed(1).padStart(5)}`
            + ` ${String(r.spread).padStart(5)}  |  ${r.cMean.toFixed(1).padStart(5)}`
            + ` ${String(r.cP10).padStart(4)} ${String(r.cP90).padStart(4)}`
            + ` ${String(r.contrast).padStart(9)}`
        );
        if (r.contrast < worst) { worst = r.contrast; worstId = r.id; }
    }
    console.log('-'.repeat(72));
    console.log(`worst centre contrast: ${worst} (${worstId})`);
    console.log(`=> a ratchet floor set today would be ${Math.max(0, worst - 2)}`);
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
