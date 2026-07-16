// Independent check: every level spawn sits above solid floor voxels.
import puppeteer from 'puppeteer-core';
import { startServer, findChrome, sleep } from '../harness.mjs';

const chrome = findChrome();
if (!chrome) {
    console.error('No chrome');
    process.exit(2);
}
const server = await startServer(8797);
const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader'],
});
const page = await browser.newPage();
await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__sovereignScar?.player, { timeout: 25000 });
await sleep(500);

const report = await page.evaluate(async () => {
    const s = window.__sovereignScar;
    const out = [];
    for (const L of s.LEVELS) {
        s.loadLevel(L.id);
        await new Promise((r) => setTimeout(r, 80));
        // settle physics a bit
        for (let i = 0; i < 30; i++) { /* frames happen async */ }
        await new Promise((r) => setTimeout(r, 400));
        const p = s.player.root.position;
        const gv = s.game.level.getVoxelAt;
        const under = gv(p.x, p.y - 1.0, p.z) || gv(p.x, p.y - 1.2, p.z) || gv(p.x, 0.1, p.z);
        out.push({
            id: L.id,
            x: +p.x.toFixed(2),
            y: +p.y.toFixed(2),
            z: +p.z.toFixed(2),
            grounded: s.player.physics.grounded,
            under,
            vy: +s.player.physics.vy.toFixed(2),
        });
    }
    return out;
});

let fail = 0;
for (const r of report) {
    const ok = r.y > 0.5 && r.y < 20 && r.under && r.vy > -5;
    console.log((ok ? 'OK ' : 'BAD') + ' ' + JSON.stringify(r));
    if (!ok) fail++;
}
await browser.close();
await server.close();
process.exit(fail ? 1 : 0);
