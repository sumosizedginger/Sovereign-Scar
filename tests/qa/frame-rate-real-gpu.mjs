// Real-GPU frame-rate measurement — OPEN_QUESTIONS.md §4 has been waiting on this.
// Headed Chrome, real GPU, no swiftshader. Measures frame time in the overworld
// and inside dungeon rooms, plus draw calls and triangle counts.
//
//   node tests/qa/frame-rate-real-gpu.mjs
//
// Opens a REAL browser window (headless: false) — that is the whole point; the
// suite's headless swiftshader path runs at ~1.5 fps and can certify nothing
// about frame rate. Print-only, never wired into run-all.mjs.
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

const server = await startServer(8791);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: false,
        defaultViewport: { width: 1280, height: 720 },
        args: [
            '--no-sandbox',
            '--window-size=1300,800',
            '--enable-gpu-rasterization',
            '--ignore-gpu-blocklist',
            '--enable-unsafe-webgpu',
        ],
    });
    const page = (await browser.pages())[0] || await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await disableGamepads(page);
    page.setDefaultTimeout(40000);

    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 40000 });
    await sleep(1500);

    // Confirm we are on a real GPU, not swiftshader.
    const gpu = await page.evaluate(() => {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        };
    });
    console.log('GPU:', JSON.stringify(gpu));

    await page.mouse.click(640, 400);
    await page.evaluate(() => window.__sovereignScar.startNewGame());
    await sleep(3000);

    // Frame-time sampler: hooks rAF, collects N frames, returns percentiles.
    async function sample(label, frames = 320) {
        const out = await page.evaluate((n) => new Promise((resolve) => {
            const dts = [];
            let last = performance.now();
            let count = 0;
            function tick(now) {
                const dt = now - last; last = now;
                if (count++ > 8) dts.push(dt);   // skip warmup frames
                if (dts.length >= n) {
                    const s = window.__sovereignScar;
                    const info = s.renderer?.info;
                    resolve({
                        dts,
                        calls: info?.render?.calls ?? null,
                        tris: info?.render?.triangles ?? null,
                        programs: info?.programs?.length ?? null,
                        geometries: info?.memory?.geometries ?? null,
                        textures: info?.memory?.textures ?? null,
                    });
                    return;
                }
                requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        }), frames);
        const d = out.dts.slice().sort((a, b) => a - b);
        const pct = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
        const mean = d.reduce((a, b) => a + b, 0) / d.length;
        console.log(
            `${label.padEnd(28)} mean ${mean.toFixed(2)}ms (${(1000 / mean).toFixed(0)} fps)  ` +
            `p50 ${pct(0.5).toFixed(2)}  p95 ${pct(0.95).toFixed(2)}  p99 ${pct(0.99).toFixed(2)}  ` +
            `worst ${d[d.length - 1].toFixed(1)}  | calls ${out.calls} tris ${out.tris} progs ${out.programs} geo ${out.geometries} tex ${out.textures}`
        );
        return { label, mean, p95: pct(0.95), p99: pct(0.99), worst: d[d.length - 1], ...out, dts: undefined };
    }

    const results = [];
    results.push(await sample('overworld (start screen)'));

    // Walk around the overworld a little, then sample while moving.
    await page.keyboard.down('KeyW');
    results.push(await sample('overworld (moving)'));
    await page.keyboard.up('KeyW');

    // Into dungeons: entry room and boss room of a few beats.
    const levels = await page.evaluate(() => window.__sovereignScar.LEVELS
        .filter((l) => /^beat-/.test(l.id)).map((l) => l.id));
    console.log('levels:', levels.length);

    for (const id of ['beat-01-crypt', 'beat-07-sluice', 'beat-14-leviathan']) {
        await page.evaluate(async (lid) => {
            const s = window.__sovereignScar;
            await s.loadLevel(lid);
        }, id);
        await sleep(2500);
        results.push(await sample(`${id} entry`, 240));

        // Jump to the boss room.
        const wentBoss = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const g = s.game?.roomGraph || s.game?.rooms;
            if (!g) return false;
            const rooms = g.rooms || g._rooms || [];
            const boss = (Array.isArray(rooms) ? rooms : Object.values(rooms))
                .find((r) => r.kind === 'boss' || r.isBoss || r.role === 'boss');
            if (!boss) return false;
            g.enterRoom ? g.enterRoom(boss.id ?? boss.key) : null;
            const p = g.respawnPoint ? g.respawnPoint() : null;
            if (p && s.player) { s.player.mesh.position.set(p.x, p.y, p.z); }
            return true;
        });
        if (wentBoss) { await sleep(2500); results.push(await sample(`${id} boss`, 240)); }
    }

    console.log('\npage errors:', errors.length);
    errors.slice(0, 12).forEach((e) => console.log('  ', e.slice(0, 220)));

    console.log('\n=== SUMMARY (60fps budget = 16.67ms) ===');
    for (const r of results) {
        const verdict = r.p95 <= 16.67 ? 'OK' : r.p95 <= 33.3 ? 'BELOW 60' : 'BELOW 30';
        console.log(`${r.label.padEnd(28)} p95 ${r.p95.toFixed(1)}ms  ${verdict}`);
    }
} catch (e) {
    console.error('FAILED:', e);
} finally {
    if (browser) await browser.close();
    await server.close();
}
