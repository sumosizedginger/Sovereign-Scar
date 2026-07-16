// Diagnostic (not part of npm test): per-level luminance + character metrics.
// Usage: node tests/qa/visual-report.mjs
// Used for the S4 tuning loop and S6 spec calibration.

import { startServer, findChromeVerbose, sleep } from '../harness.mjs';

async function main() {
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
        page.setDefaultTimeout(60000);
        page.on('pageerror', (e) => console.error('pageerror:', String(e.message || e)));
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player));
        await page.mouse.click(400, 300);
        await sleep(400);

        const rows = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = false;
            s.menu.close();
            const out = [];
            for (const meta of s.LEVELS) {
                s.loadLevel(meta.id);
                s.game.bossIntro = null; // camera push-in would skew the sample
                await new Promise((r) => setTimeout(r, 600));
                const lumA = await s.sampleLuminance();
                await new Promise((r) => setTimeout(r, 300));
                const lum = Math.max(lumA, await s.sampleLuminance());
                const m = s.measure();
                out.push({
                    id: meta.id,
                    mood: s.game.level.mood || meta.mood || 'crust',
                    lum: +lum.toFixed(1),
                    playerH: +m.player.h.toFixed(2),
                    playerMinY: +m.player.minY.toFixed(2),
                    mobs: m.mobs.map((x) => `${x.h.toFixed(2)}@${x.minY.toFixed(2)}`).join(' '),
                    bossH: m.boss ? +m.boss.h.toFixed(2) : null,
                    bossMinY: m.boss ? +m.boss.minY.toFixed(2) : null,
                });
            }
            return out;
        });
        console.table(rows);
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
