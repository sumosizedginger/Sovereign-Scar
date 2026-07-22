// Focused luminance probe — samples every level's mean luminance exactly the
// way tests/visual-sanity.spec.mjs does, without the scale/grounding asserts.
// Use this to retune MOOD_PRESETS / per-level lightTune without paying for a
// full suite run. Run from the repo root:  node tests/qa/lum-probe.mjs
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

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
                const lumA = await s.sampleLuminance();
                await new Promise((r) => setTimeout(r, 300));
                const lumB = await s.sampleLuminance();
                out.push({
                    id: meta.id,
                    mood: s.game.level.mood || meta.mood || 'crust',
                    lum: Math.max(lumA, lumB),
                });
            } catch (e) {
                out.push({ id: meta.id, err: String(e) });
            }
        }
        return out;
    });

    for (const r of rows) {
        if (r.err) { console.log(`${r.id}  ERR ${r.err}`); continue; }
        const band = r.mood === 'abyss' ? [35, 75] : [45, 90];
        const ok = r.lum >= band[0] && r.lum <= band[1] ? 'ok  ' : 'FAIL';
        console.log(`${ok} ${r.id.padEnd(20)} mood=${r.mood.padEnd(6)} lum=${r.lum.toFixed(1)} band=[${band}]`);
    }
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
