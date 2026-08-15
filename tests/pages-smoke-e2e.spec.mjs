// tests/pages-smoke-e2e.spec.mjs — boot the DEPLOYED shape, not the dev server.
//
// WHAT MAKES THIS DIFFERENT FROM EVERY OTHER BROWSER SPEC HERE
//
// The rest of the browser suite serves the repository root at `/`, which is the
// one environment the game has always worked in. GitHub Pages serves a STAGED
// SUBSET of the repo from a SUBPATH:
//
//     dev      http://127.0.0.1:8799/            whole repo at the root
//     Pages    https://…github.io/Sovereign-Scar/ dist-pages/ under a prefix
//
// Two things can be wrong in the second that cannot be wrong in the first: a
// file the staging step forgot to copy, and a path that resolves from the
// origin root instead of the project subpath. A root-relative `/src/…` works
// perfectly on the dev server and 404s on Pages.
//
// So this spec builds the artifact, serves ONLY that directory, and serves it
// ONLY under `/Sovereign-Scar/`. Anything the page asks for outside the prefix
// gets a 404 and is recorded — which is what turns "the path is wrong" from an
// invisible difference into a failed assertion. The obvious way to write this
// test wrong is to point it at the ordinary root server and call the result a
// Pages check; the `escaped` counter below is the thing that would catch me
// having done that.

import fs from 'fs';
import http from 'http';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { findChromeVerbose, disableGamepads, sleep } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-pages');

/** The exact prefix the real deployment lives under. */
const BASE = '/Sovereign-Scar/';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

/**
 * Serve `dist-pages` at `/Sovereign-Scar/` and nothing anywhere else.
 *
 * `escaped` counts requests that fell outside the prefix. On the real host
 * those would be requests to `https://sumosizedginger.github.io/…`, i.e. to
 * somebody else's site.
 */
function startSubpathServer(dir, port) {
    const state = { escaped: [], missing: [] };
    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (!urlPath.startsWith(BASE)) {
            state.escaped.push(urlPath);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('outside the project subpath');
            return;
        }
        let rel = urlPath.slice(BASE.length);
        if (rel === '' || rel.endsWith('/')) rel += 'index.html';
        const file = path.join(dir, path.normalize(rel));
        if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            state.missing.push(urlPath);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(fs.readFileSync(file));
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve({
            url: `http://127.0.0.1:${port}${BASE}`,
            state,
            close: () => new Promise((r) => server.close(r)),
        }));
    });
}

export async function run(t) {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.skip('no Chrome found: ' + chrome.candidates.join(' | '));
        return;
    }

    // Build it here rather than assuming a previous step left one behind. A
    // spec that silently measures a stale `dist-pages/` is a spec that goes
    // green after the change that broke the build.
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pages.mjs')],
        { cwd: ROOT, stdio: 'pipe' });
    t.ok('the Pages artifact builds', fs.existsSync(path.join(DIST, 'index.html')));

    const { validate } = await import('../scripts/validate-pages.mjs');
    const problems = validate(DIST);
    t.ok('…and validates as a publishable shape', problems.length === 0,
        problems.join(' | '));

    const puppeteer = await import('puppeteer-core');
    const server = await startSubpathServer(DIST, 8851);
    let browser = null;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader',
                '--window-size=1280,720'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await disableGamepads(page);
        page.setDefaultTimeout(90000);

        const consoleErrors = [];
        const pageErrors = [];
        const failedRequests = [];
        page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
        page.on('pageerror', (e) => pageErrors.push(e.message));
        page.on('requestfailed', (r) => failedRequests.push(r.url()));
        page.on('response', (r) => {
            if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
        });

        // ── 1. IT LOADS FROM THE SUBPATH ───────────────────────────────────
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar?.menu), { timeout: 45000 });
        t.ok('the game boots from /Sovereign-Scar/', true);

        // ── 2. NOTHING ASKED FOR ANYTHING OUTSIDE THE SUBPATH ──────────────
        // This is the whole point of the spec. A single root-relative path
        // anywhere in the runtime lands here.
        t.ok('no request escaped the project subpath',
            server.state.escaped.length === 0,
            server.state.escaped.slice(0, 5).join(', '));
        t.ok('…and nothing 404d inside it',
            server.state.missing.length === 0,
            server.state.missing.slice(0, 5).join(', '));
        t.ok('…and no request failed at the network layer',
            failedRequests.length === 0, failedRequests.slice(0, 5).join(', '));

        // ── 3. IT IS A REAL WEBGL2 GAME, NOT A BLANK PAGE ──────────────────
        const boot = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const gl = s.renderer?.getContext?.();
            return {
                webgl2: !!(gl && typeof WebGL2RenderingContext !== 'undefined'
                    && gl instanceof WebGL2RenderingContext),
                triangles: s.renderer?.info?.render?.triangles ?? 0,
                hasScene: !!s.scene,
                hasComposer: !!s.composer,
                passes: s.composer?.passes?.length ?? 0,
            };
        });
        t.ok('WebGL2 initialised', boot.webgl2 === true, JSON.stringify(boot));
        t.ok('the post stack is assembled', boot.passes >= 4, `${boot.passes} passes`);

        // ── 4. A NEW GAME STARTS AND A DUNGEON LOADS ───────────────────────
        const played = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.startNewGame?.();
            await new Promise((r) => setTimeout(r, 600));
            await s.loadLevel('beat-01-crypt');
            await new Promise((r) => setTimeout(r, 1200));
            return {
                levelId: s.game?.levelId || null,
                hp: s.player?.health?.hp ?? 0,
                triangles: s.renderer?.info?.render?.triangles ?? 0,
                enemies: s.game?.level?.enemies?.length ?? 0,
            };
        });
        t.ok('a dungeon loads', played.levelId === 'beat-01-crypt', JSON.stringify(played));
        t.ok('…and it draws geometry', played.triangles > 1000, `${played.triangles} tris`);
        t.ok('…with the player alive', played.hp > 0, `hp=${played.hp}`);

        // ── 5. SAVES SURVIVE, WHICH IS localStorage UNDER https ────────────
        // The origin is different on Pages from the dev server, so this is the
        // first place a save could silently fail to persist.
        const saved = await page.evaluate(() => {
            const s = window.__sovereignScar;
            s.game?.save?.();
            const keys = Object.keys(localStorage);
            return { keys, any: keys.length > 0 };
        });
        t.ok('progress is written to localStorage', saved.any, saved.keys.join(','));

        // ── 6. A RELOAD FROM THE SUBPATH STILL WORKS ───────────────────────
        // The title screen boots differently once a save exists, and a relative
        // path that happens to work on first load can still break on the second
        // if anything resolves against the previous document URL.
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar?.menu), { timeout: 45000 });
        await sleep(500);
        t.ok('it reloads clean from the subpath', true);
        t.ok('…still with nothing outside the subpath',
            server.state.escaped.length === 0,
            server.state.escaped.slice(0, 5).join(', '));

        // ── 7. NO FATAL SCRIPT ERRORS ANYWHERE IN ALL THAT ─────────────────
        // AudioContext autoplay warnings are expected in headless with no
        // gesture and are not a deployment problem.
        const fatal = [...pageErrors, ...consoleErrors]
            .filter((m) => !/AudioContext|autoplay|favicon|WebGL.*deprecat/i.test(m));
        t.ok('no fatal page errors', fatal.length === 0, fatal.slice(0, 4).join(' | '));
    } finally {
        if (browser) await browser.close();
        await server.close();
    }
}
