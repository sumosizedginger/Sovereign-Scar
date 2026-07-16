// tests/smoke.spec.mjs
// Browser spec: boots the static server + headless Chrome, loads each page in
// PAGES, and asserts it renders cleanly. Self-contained (owns its own server +
// browser lifecycle) so it can run standalone or be included in run-all.mjs.

import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { startServer, findChromeVerbose, sleep, createSink, summarize } from './harness.mjs';

const PORT = Number(process.env.PORT) || 8765;

// Each entry: path relative to the server root, plus what counts as "proof it
// rendered" beyond "no console errors" (index.html has the hitbox/collision
// proof panel; examples get the same treatment once Phase 3 adds them).
const PAGES = [
    // Product entry is Sovereign Scar (not the kit demo HUD)
    {
        path: 'index.html',
        hudSelector: '#ss-hud',
        mustContain: ['SOVEREIGN SCAR'],
        renderHook: '__sovereignScar',
        waitMs: 4000,
        waitUntil: 'domcontentloaded',
    },
    { path: 'examples/topdown-8way.html', hudSelector: '#hud', mustContain: ['topdown-8way example', 'facing'] },
    { path: 'examples/voxel-showcase.html', hudSelector: '#hud', mustContain: ['voxel-showcase example', 'quality tier'] }
];

async function checkPage(page, errors, base, entry, t) {
    errors.length = 0;
    // SwiftShader (software WebGL, needed on GPU-less CI runners) is much
    // slower than hardware rendering — give the first frame room to land.
    const waitUntil = entry.waitUntil || 'networkidle0';
    await page.goto(base + entry.path, { waitUntil, timeout: 60000 });
    await sleep(entry.waitMs || 500);

    const filtered = errors.filter((e) => !/AudioContext|autoplay|favicon/i.test(e));
    t.ok(entry.path + ': zero console errors', filtered.length === 0, filtered.join(' | '));

    if (entry.hudSelector) {
        const hudText = await page.$eval(entry.hudSelector, (el) => el.textContent).catch(() => '');
        for (const needle of entry.mustContain) {
            t.ok(entry.path + ': HUD reports "' + needle + '"', hudText.includes(needle),
                'hud=' + JSON.stringify(hudText));
        }
    }

    const hookName = entry.renderHook || '__engineKit';
    const renderCalls = await page.evaluate((hn) => {
        const hook = window[hn];
        return hook && hook.renderer && hook.renderer.info && hook.renderer.info.render
            ? hook.renderer.info.render.calls
            : -1;
    }, hookName);
    t.ok(entry.path + ': renderer actually drew frames', renderCalls > 0,
        'renderer.info.render.calls=' + renderCalls);

    const canvasOk = await page.evaluate(() => !!document.querySelector('canvas'));
    t.ok(entry.path + ': canvas present', canvasOk);
}

export async function run(t) {
    const { path: exe, candidates } = findChromeVerbose();
    if (!exe) {
        t.ok('Chrome/Edge available (set CHROME_PATH if not found)', false,
            'CHROME_PATH=' + JSON.stringify(process.env.CHROME_PATH || null)
            + '; checked: ' + JSON.stringify(candidates));
        return;
    }

    const server = await startServer(PORT);
    let browser;
    try {
        // GPU-less CI runners report GL_VENDOR/GL_RENDERER "Disabled" and
        // refuse WebGL under --use-gl=angle (no real GPU to back it) — use
        // SwiftShader software rendering there (Chromium's own CI does the
        // same on Linux; --enable-unsafe-swiftshader is required on modern
        // Chrome to actually allow the fallback). Local dev machines have a
        // real GPU, so keep the faster hardware path there.
        const glArgs = process.env.CI
            ? ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
            : ['--use-gl=angle'];
        browser = await puppeteer.launch({
            executablePath: exe,
            headless: 'new',
            args: [...glArgs, '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage']
        });

        // One browser, ONE page, reused for every navigation. Both a fresh
        // browser per page and a shared browser with a fresh page (tab) per
        // page reliably hung mid-run under SwiftShader (reproduced on a
        // local Windows box and on GitHub's Linux runners) — creating a
        // second browser context/tab appears to be the actual unstable
        // operation, not navigation itself. page.goto() to a new URL on the
        // same page/tab is the one pattern that held up.
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
        await page.setViewport({ width: 1280, height: 720 });

        for (const entry of PAGES) {
            try {
                await checkPage(page, errors, server.url, entry, t);
            } catch (e) {
                t.ok(entry.path + ': loaded and checked without crashing', false,
                    String(e && e.message || e));
            }
        }
    } finally {
        if (browser) await browser.close();
        await server.close();
    }
}

// Directly runnable: `node tests/smoke.spec.mjs`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const t = createSink('smoke');
    run(t).then(() => process.exit(summarize([t]) ? 1 : 0));
}
