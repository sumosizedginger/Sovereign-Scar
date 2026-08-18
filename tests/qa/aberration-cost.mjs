// tests/qa/aberration-cost.mjs — what chromatic aberration costs THIS hero.
//
//   node tests/qa/aberration-cost.mjs [level]
//
// The owner reported the player model looking worse on ultra than on low.
// Isolating the four ultra-only effects one at a time (`quality-hero.mjs`)
// pointed at exactly one of them: the RGB shift. This measures its cost in the
// only units that matter — the hero's own size on screen.
//
// THE ARITHMETIC. `RGBShiftShader` documents `amount` as "1 is width of input"
// and samples red at `vUv + offset` and blue at `vUv - offset`, so the red-to-
// blue separation is TWICE the amount, as a fraction of the frame's width:
//
//     split_px = 2 * amount * frameWidth
//
// At the shipped 0.0012 that is 3.1 px across a 1280-wide frame. The number
// only means something next to the subject: this game's hero is a hard-edged
// voxel figure about 30 px tall in normal play, with arms a handful of pixels
// wide, so a 3 px channel split is a large fraction of the thing it is being
// applied to. A full-screen constant is a subtle rim on a 400 px character and
// a smear on a 30 px one, and nothing in the effect knows the difference.
//
// WHY THE METRICS DID NOT FIND THIS AND THE PICTURES DID, recorded because it
// cost a rebuild: `quality-hero.mjs` sampled a `|R-B|` ring at a fixed radius
// around the hero's bounding-box centre. The hero is tall and narrow, so at
// that radius the ring is mostly SAND — and sand is brown, which has a large
// R-B all by itself. It read ~50 on every tier including the ones with the
// effect switched off. The fringe here is sampled on the silhouette itself.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const OUT = 'docs/media/quality';
const LEVEL = process.argv[2] || 'overworld';
const SHIPPED = 0.0012;
const AMOUNTS = [0, 0.0002, 0.0004, 0.0008, SHIPPED];

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer(8798);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--window-size=1280,720'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await disableGamepads(page);
    page.setDefaultTimeout(90000);
    page.on('pageerror', (e) => console.log('  pageerror', String(e).slice(0, 140)));

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });
    await page.mouse.click(400, 300);
    await page.evaluate(() => window.__sovereignScar.startNewGame('medium'));
    await sleep(500);
    await page.evaluate(async (lid) => {
        const s = window.__sovereignScar;
        s.game.atTitle = false; s.game.paused = false;
        s.menu.close(); s.hud?.setHidden?.(true);
        if (s.game.levelId !== lid) s.loadLevel(lid);
        s.game.bossIntro = null;
        await new Promise((r) => setTimeout(r, 900));
        s.hud?.setHidden?.(true);
    }, LEVEL);
    await sleep(700);
    await page.evaluate(() => window.__sovereignScar.applyQualitySetting('ultra'));
    await sleep(600);

    const box = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        const THREE = await import('/lib/three/three.module.min.js');
        const b = new THREE.Box3().setFromObject(s.player.root);
        let mnX = 9, mxX = -9, mnY = 9, mxY = -9;
        for (const x of [b.min.x, b.max.x]) {
            for (const y of [b.min.y, b.max.y]) {
                for (const z of [b.min.z, b.max.z]) {
                    const v = new THREE.Vector3(x, y, z).project(s.camera);
                    mnX = Math.min(mnX, v.x); mxX = Math.max(mxX, v.x);
                    mnY = Math.min(mnY, v.y); mxY = Math.max(mxY, v.y);
                }
            }
        }
        return {
            cx: ((mnX + mxX) / 2 + 1) / 2 * 1280,
            cy: (1 - (mnY + mxY) / 2) / 2 * 720,
            w: ((mxX - mnX) / 2) * 1280,
            h: ((mxY - mnY) / 2) * 720,
        };
    });
    console.log(`${LEVEL} — hero on screen: ${box.w.toFixed(0)} x ${box.h.toFixed(0)} px ` +
        `at 1280x720 (this camera; ~30px tall at the standard gameplay distance)\n`);
    console.log(`  amount    split px   % of hero width   fringe   sat    detail`);

    for (const amt of AMOUNTS) {
        await page.evaluate((a) => {
            const c = window.__sovereignScar.composer;
            const p = (c.passes || []).find((q) => q.uniforms
                && 'amount' in q.uniforms && 'angle' in q.uniforms);
            if (p) { p.enabled = a > 0; p.uniforms.amount.value = a; }
        }, amt);
        await sleep(450);
        const b64 = await page.screenshot({ encoding: 'base64' });
        const m = await page.evaluate(async (d64, bx) => {
            const img = new Image();
            await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + d64; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const c2 = cv.getContext('2d', { willReadFrequently: true });
            c2.drawImage(img, 0, 0);
            const d = c2.getImageData(0, 0, img.width, img.height).data;
            const at = (x, y) => { const i = (y * img.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

            // THE SILHOUETTE, found rather than assumed: the hero is the only
            // thing in this patch that is not sand, so a pixel counts as
            // "figure" when it is far from the local sand colour. That is what
            // makes the fringe number describe the character instead of the
            // ground the earlier ring was sitting on.
            const x0 = Math.round(bx.cx - bx.w), x1 = Math.round(bx.cx + bx.w);
            const y0 = Math.round(bx.cy - bx.h), y1 = Math.round(bx.cy + bx.h);
            // Sand reference: the median of a ring well outside the figure.
            const ref = [];
            for (let a2 = 0; a2 < 64; a2++) {
                const r = bx.h * 1.8;
                const x = Math.round(bx.cx + Math.cos(a2 / 64 * 6.283) * r);
                const y = Math.round(bx.cy + Math.sin(a2 / 64 * 6.283) * r);
                if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
                ref.push(at(x, y));
            }
            const med = (k) => ref.map((p) => p[k]).sort((p, q) => p - q)[Math.floor(ref.length / 2)] || 0;
            const sand = [med(0), med(1), med(2)];
            const isFigure = (p) => Math.hypot(p[0] - sand[0], p[1] - sand[1], p[2] - sand[2]) > 42;

            const body = [], edge = [];
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    if (x < 1 || y < 1 || x >= img.width - 1 || y >= img.height - 1) continue;
                    const p = at(x, y);
                    if (!isFigure(p)) continue;
                    body.push(p);
                    // An EDGE pixel of the figure: it has a non-figure
                    // neighbour. That is where a channel split shows.
                    const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
                    if (n.some((q) => !isFigure(q))) edge.push(p);
                }
            }
            if (!body.length) return null;
            const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
            const Ls = (Y) => (Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16);
            const avg = (a) => a.reduce((p, v) => p + v, 0) / (a.length || 1);
            const sats = body.map((p) => {
                const mx = Math.max(...p), mn = Math.min(...p);
                return mx === 0 ? 0 : (mx - mn) / mx;
            });
            const Lb = body.map((p) => Ls(lum(p[0], p[1], p[2])));
            const mean = avg(Lb);
            return {
                px: body.length, edgePx: edge.length,
                fringe: +avg(edge.map((p) => Math.abs(p[0] - p[2]))).toFixed(1),
                sat: +avg(sats).toFixed(3),
                detail: +Math.sqrt(avg(Lb.map((v) => (v - mean) ** 2))).toFixed(1),
            };
        }, b64, box);

        const split = 2 * amt * 1280;
        console.log(`  ${String(amt).padEnd(8)} ${split.toFixed(2).padStart(7)}px  ` +
            `${(100 * split / box.w).toFixed(1).padStart(12)}%   ` +
            (m ? `${String(m.fringe).padStart(6)}  ${String(m.sat).padStart(5)}  ${String(m.detail).padStart(6)}` : ' (no figure found)'));

        const pad = Math.max(50, box.h * 1.1);
        const crop = await page.screenshot({
            encoding: 'base64',
            clip: { x: Math.max(0, box.cx - pad), y: Math.max(0, box.cy - pad), width: pad * 2, height: pad * 2 },
        });
        fs.writeFileSync(`${OUT}/${LEVEL}-aberration-${String(amt).replace('.', '')}.png`,
            Buffer.from(crop, 'base64'));
    }
    console.log(`\ncrops in ${OUT}/${LEVEL}-aberration-*.png`);
} catch (e) {
    console.error('PROBE FAILED:', e.message);
} finally {
    if (browser) await browser.close();
    server.close?.();
    process.exit(0);
}
