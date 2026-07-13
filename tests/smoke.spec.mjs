// tests/smoke.spec.mjs
// Browser spec: boots the static server + headless Chrome, loads each page in
// PAGES, and asserts it renders cleanly. Self-contained (owns its own server +
// browser lifecycle) so it can run standalone or be included in run-all.mjs.

import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { startServer, findChrome, sleep, createSink, summarize } from './harness.mjs';

const PORT = Number(process.env.PORT) || 8765;

// Each entry: path relative to the server root, plus what counts as "proof it
// rendered" beyond "no console errors" (index.html has the hitbox/collision
// proof panel; examples get the same treatment once Phase 3 adds them).
const PAGES = [
    { path: 'index.html', hudSelector: '#hud', mustContain: ['vectorized hitbox', 'AABB collision'] },
    { path: 'examples/topdown-8way.html', hudSelector: '#hud', mustContain: ['topdown-8way example', 'facing'] },
    { path: 'examples/voxel-showcase.html', hudSelector: '#hud', mustContain: ['voxel-showcase example', 'quality tier'] }
];

async function checkPage(browser, base, entry, t) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

    try {
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(base + entry.path, { waitUntil: 'networkidle0', timeout: 30000 });
        await sleep(500); // let a few frames render

        t.ok(entry.path + ': zero console errors', errors.length === 0, errors.join(' | '));

        if (entry.hudSelector) {
            const hudText = await page.$eval(entry.hudSelector, (el) => el.textContent).catch(() => '');
            for (const needle of entry.mustContain) {
                t.ok(entry.path + ': HUD reports "' + needle + '"', hudText.includes(needle),
                    'hud=' + JSON.stringify(hudText));
            }
        }

        const renderCalls = await page.evaluate(() => {
            const hook = window.__engineKit;
            return hook && hook.renderer && hook.renderer.info && hook.renderer.info.render
                ? hook.renderer.info.render.calls
                : -1;
        });
        t.ok(entry.path + ': renderer actually drew frames', renderCalls > 0,
            'renderer.info.render.calls=' + renderCalls);

        const canvasOk = await page.evaluate(() => !!document.querySelector('canvas'));
        t.ok(entry.path + ': canvas present', canvasOk);
    } finally {
        await page.close();
    }
}

export async function run(t) {
    const exe = findChrome();
    if (!exe) {
        t.ok('Chrome/Edge available (set CHROME_PATH if not found)', false,
            'no browser executable found');
        return;
    }

    const server = await startServer(PORT);
    const browser = await puppeteer.launch({
        executablePath: exe,
        headless: 'new',
        args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage']
    });

    try {
        for (const entry of PAGES) {
            await checkPage(browser, server.url, entry, t);
        }
    } finally {
        await browser.close();
        await server.close();
    }
}

// Directly runnable: `node tests/smoke.spec.mjs`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const t = createSink('smoke');
    run(t).then(() => process.exit(summarize([t]) ? 1 : 0));
}
