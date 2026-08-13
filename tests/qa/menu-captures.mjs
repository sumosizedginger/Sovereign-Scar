// PRINT-ONLY QA probe: photograph every menu screen a player can reach.
//
// The menus are the last debug surface (AAA.md Tier 1, HOW-TO-CLOSE-THE-GAP §4)
// and the title screen is the literal first frame anyone sees. Nothing in the
// suite can look at one, so this exists to put them on disk where they can be
// judged the only way a menu can be judged — by looking.
//
// A menu IS a still frame, which is the one case where a photograph is fair
// evidence: there is no motion for it to miss.
//
// It also reports what a picture cannot carry. §4 of the gap doc says the pause
// menu must "dim the scene behind it rather than drawing a box", so the numbers
// here are about the BACKDROP: how dark it actually gets, and how bright the
// brightest thing still shouting through it is. A scrim that leaves a 70 L*
// highlight behind the text is a scrim that is not working, and no amount of
// panel styling fixes it.
//
// Usage: node tests/qa/menu-captures.mjs [outDir]

import fs from 'fs';
import path from 'path';
import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';

const OUT = process.argv[2] || 'docs/media/menus';

// Every screen a player can reach. `world` = must be photographed OVER a real
// rendered room, or the shot judges it against a black void it will never
// actually appear over.
const SCREENS = [
    { name: 'title', world: false, why: 'the first frame anyone sees' },
    { name: 'pause', world: true, why: 'drawn over gameplay — the hard case' },
    { name: 'settings', world: true, why: 'sliders, toggles, selects' },
    { name: 'controls', world: true, why: 'the longest screen' },
    { name: 'scores', world: true, why: 'mostly empty on a fresh save' },
    { name: 'beats', world: true, why: 'Altar Travel' },
    { name: 'altar', world: true, why: 'the shop' },
    { name: 'runMode', world: false, why: 'difficulty choice, reached from New Game' },
];

async function main() {
    const chrome = findChromeVerbose();
    if (!chrome.path) { console.error('No Chrome'); process.exit(2); }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8841);
    fs.mkdirSync(OUT, { recursive: true });

    const browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--window-size=1280,720'],
    });
    const report = { shots: [], errors: [] };
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await disableGamepads(page);
        page.setDefaultTimeout(90000);
        page.on('pageerror', (e) => report.errors.push(String(e.message || e)));

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.menu),
            { timeout: 30000 },
        );
        // ── WHAT PAINTS ON THE VERY FIRST FRAME, WITH NO INPUT ──────────────
        //
        // This is the measurement the whole pass came out of. Photographed at
        // t=1.5s on an untouched page, THREE layers were drawing the game's own
        // name at once: `#boot` (the loading splash, z 5, still saying
        // "loading…"), a HUD toast (z 25, a 323×37 bordered box at [479,497])
        // and `#ss-menu` (z 40, the title screen itself). The toast sat
        // straight through the last menu row, so `Credits` was illegible under
        // a duplicate of the title.
        //
        // Only what is ACTUALLY painting is listed. A census of every element
        // is a census of the DOM; the question is what a player sees.
        await sleep(1500);
        const firstFrame = await page.evaluate(() => [...document.body.children]
            .filter((el) => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return cs.display !== 'none' && cs.visibility !== 'hidden'
                    && Number(cs.opacity) > 0.01 && r.width > 0 && r.height > 0;
            })
            .map((el) => {
                const r = el.getBoundingClientRect();
                return {
                    el: el.id || el.tagName.toLowerCase(),
                    z: getComputedStyle(el).zIndex,
                    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
                    text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70),
                };
            }));
        report.firstFrame = firstFrame;
        await page.screenshot({ path: path.join(OUT, '00-first-frame-untouched.png') });
        console.log('── PAINTING ON THE FIRST FRAME, NO INPUT ──');
        for (const e of firstFrame) {
            console.log(`${e.el.padEnd(12)} z=${String(e.z).padEnd(5)} [${e.rect.join(',')}] ${e.text}`);
        }
        const titleCopies = firstFrame.filter((e) => /SOVEREIGN SCAR/i.test(e.text)).length;
        console.log(`layers showing the title: ${titleCopies}  (1 is correct)\n`);

        await page.mouse.click(400, 300);
        await sleep(500);

        for (const spec of SCREENS) {
            const info = await page.evaluate(async (name, needsWorld) => {
                const s = window.__sovereignScar;
                const menu = s.menu;
                if (needsWorld) {
                    s.game.atTitle = false;
                    menu.close();
                    s.game.paused = false;
                    if (s.game.levelId !== 'beat-01-crypt') s.loadLevel('beat-01-crypt');
                    await new Promise((r) => setTimeout(r, 900));
                    s.game.paused = true;
                }
                if (name === 'title') menu.openTitle();
                else if (name === 'altar') menu.openAltar();
                else {
                    menu.openPause();
                    if (name !== 'pause') { menu.state.push(name); }
                }
                menu.render();
                const view = menu.state.view();
                const el = document.getElementById('ss-menu');
                const panel = el?.lastElementChild;
                const r = panel?.getBoundingClientRect();
                return {
                    screen: name,
                    title: view.title,
                    rows: view.items.length,
                    // Every string a player would read here, so a spec can
                    // assert no dev vocabulary reaches any of them.
                    labels: view.items.map((it) => it.label).filter((l) => l != null && l !== ''),
                    notes: view.items.map((it) => it.note).filter(Boolean),
                    rect: r ? {
                        x: Math.round(r.left), y: Math.round(r.top),
                        w: Math.round(r.width), h: Math.round(r.height),
                        coverage: +((r.width * r.height) / (1280 * 720)).toFixed(3),
                    } : null,
                };
            }, spec.name, spec.world).catch((e) => ({ screen: spec.name, error: String(e.message || e) }));

            await sleep(250);
            const file = path.join(OUT, `${spec.name}.png`);
            await page.screenshot({ path: file });

            // Hand the composited frame back to the page and read its pixels
            // there — the same route silhouette-contrast.mjs uses, because the
            // browser already owns a PNG decoder and node does not.
            const b64 = await page.screenshot({ encoding: 'base64' });
            const lum = await page.evaluate(async (dataB64, rect) => {
                const img = new Image();
                await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + dataB64; });
                const cv = document.createElement('canvas');
                cv.width = img.width; cv.height = img.height;
                const c = cv.getContext('2d', { willReadFrequently: true });
                c.drawImage(img, 0, 0);
                const d = c.getImageData(0, 0, img.width, img.height).data;
                const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
                const lstar = (r, g, b) => {
                    const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
                    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
                };
                const sx = img.width / 1280, sy = img.height / 720;
                const inRect = (x, y) => rect
                    && x >= rect.x * sx && x < (rect.x + rect.w) * sx
                    && y >= rect.y * sy && y < (rect.y + rect.h) * sy;
                const outside = [];
                const inside = [];
                for (let y = 0; y < img.height; y += 2) {
                    for (let x = 0; x < img.width; x += 2) {
                        const i = (y * img.width + x) * 4;
                        const L = lstar(d[i], d[i + 1], d[i + 2]);
                        (inRect(x, y) ? inside : outside).push(L);
                    }
                }
                const stat = (a) => {
                    if (!a.length) return null;
                    a.sort((p, q) => p - q);
                    const mean = a.reduce((s, v) => s + v, 0) / a.length;
                    return {
                        mean: +mean.toFixed(1),
                        p50: +a[Math.floor(a.length * 0.5)].toFixed(1),
                        p99: +a[Math.floor(a.length * 0.99)].toFixed(1),
                        max: +a[a.length - 1].toFixed(1),
                    };
                };
                return { backdrop: stat(outside), panel: stat(inside) };
            }, b64, info.rect || null).catch(() => null);

            report.shots.push({ ...spec, ...info, file, lum });
            const bd = lum?.backdrop;
            console.log(
                `${spec.name.padEnd(9)} ${String(info.rows ?? '?').padStart(3)} rows  `
                + `${info.rect ? `${String(info.rect.w).padStart(4)}x${String(info.rect.h).padStart(3)} ${(info.rect.coverage * 100).toFixed(1).padStart(5)}% frame` : 'no panel     '}  `
                + `backdrop L* mean ${String(bd?.mean ?? '?').padStart(5)}  p99 ${String(bd?.p99 ?? '?').padStart(5)}  max ${String(bd?.max ?? '?').padStart(5)}`
                + (info.error ? `  ERROR ${info.error}` : ''),
            );
        }

        fs.writeFileSync(path.join(OUT, 'menu-captures.json'), JSON.stringify(report, null, 2));
        console.log(`\n${report.shots.length} screens -> ${OUT}`);
        console.log(`page errors: ${report.errors.length}`);
        if (report.errors.length) console.log(report.errors.join('\n'));
    } finally {
        await browser.close();
        await server.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
