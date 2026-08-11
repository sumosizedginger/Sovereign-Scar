// Character/ground separation in shipped frames — print-only probe.
//
// AAA.md section 3. Answers one question: can you see your own character?
//
// The actor material carries a fresnel rim (actor-rig.js:58) whose stated job is
// "silhouette separation regardless of the floor colour". Fresnel is strongest
// where the surface normal is perpendicular to the view ray and vanishes where it
// points at the camera. The rig sits at height 18 / back 12 — a 56 degree pitch —
// so the camera looks down the normals of the head and shoulders, which is most of
// what it can see of a character. This probe measures whether the separation
// survives that.
//
// Method: screenshot the real composited frame, hand the PNG back to the page,
// decode it on a 2D canvas, and compare the pixels covering the character against
// an annulus of floor just outside them. Reports mean CIE-L* difference and mean
// RGB distance. No modelling of the shader — it reads the shipped frame.
import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const chrome = findChromeVerbose();
const puppeteer = await import('puppeteer-core');
const server = await startServer(8793);
let browser;

// Where the character sits on a 1280x720 frame: the rig centres the look-at on
// the player, so they land at frame centre, slightly above it (lookY 0.5).
const CX = 640, CY = 360;

try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path, headless: false,
        defaultViewport: { width: 1280, height: 720 },
        args: ['--no-sandbox', '--window-size=1300,800'],
    });
    const page = (await browser.pages())[0] || await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await disableGamepads(page);
    page.setDefaultTimeout(40000);
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 40000 });
    await sleep(1500);
    await page.mouse.click(640, 400);
    await page.evaluate(() => window.__sovereignScar.startNewGame());
    await sleep(3000);

    async function measure(label, levelId) {
        if (levelId) {
            await page.evaluate(async (l) => { await window.__sovereignScar.loadLevel(l); }, levelId);
            await sleep(2600);
        }
        // Hide HUD so no DOM chrome lands in the crop.
        await page.evaluate(() => window.__sovereignScar.hud?.setHidden?.(true));
        await sleep(400);
        const b64 = await page.screenshot({ encoding: 'base64' });

        const res = await page.evaluate(async (dataB64, cx, cy) => {
            const img = new Image();
            await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + dataB64; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const sx = img.width / 1280, sy = img.height / 720;
            const R_BODY = 26 * sy;      // the character occupies roughly this radius
            const R_IN = 34 * sy;        // floor annulus starts outside the body
            const R_OUT = 58 * sy;
            const d = ctx.getImageData(0, 0, img.width, img.height).data;

            const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
            const Lstar = (Y) => (Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16);

            const body = [], floor = [];
            const px = cx * sx, py = cy * sy;
            for (let y = Math.floor(py - R_OUT); y <= py + R_OUT; y++) {
                for (let x = Math.floor(px - R_OUT); x <= px + R_OUT; x++) {
                    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
                    const dist = Math.hypot(x - px, y - py);
                    const i = (y * img.width + x) * 4;
                    const p = [d[i], d[i + 1], d[i + 2]];
                    if (dist <= R_BODY) body.push(p);
                    else if (dist >= R_IN && dist <= R_OUT) floor.push(p);
                }
            }
            const avg = (arr) => arr.reduce((a, p) => [a[0] + p[0] / arr.length, a[1] + p[1] / arr.length, a[2] + p[2] / arr.length], [0, 0, 0]);
            const bA = avg(body), fA = avg(floor);
            const bL = Lstar(lum(...bA)), fL = Lstar(lum(...fA));

            // Edge test: the strongest single step anywhere on the body boundary.
            let bestEdge = 0;
            for (let a = 0; a < 360; a += 3) {
                const rad = a * Math.PI / 180;
                const inP = (yy, xx) => { const i = (Math.round(yy) * img.width + Math.round(xx)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
                const p1 = inP(py + Math.sin(rad) * (R_BODY - 4), px + Math.cos(rad) * (R_BODY - 4));
                const p2 = inP(py + Math.sin(rad) * (R_BODY + 8), px + Math.cos(rad) * (R_BODY + 8));
                const dl = Math.abs(Lstar(lum(...p1)) - Lstar(lum(...p2)));
                if (dl > bestEdge) bestEdge = dl;
            }
            return {
                bodyRGB: bA.map((v) => Math.round(v)), floorRGB: fA.map((v) => Math.round(v)),
                bodyL: +bL.toFixed(1), floorL: +fL.toFixed(1),
                dL: +Math.abs(bL - fL).toFixed(1),
                dRGB: +Math.hypot(bA[0] - fA[0], bA[1] - fA[1], bA[2] - fA[2]).toFixed(1),
                bestEdgeL: +bestEdge.toFixed(1),
                samples: { body: body.length, floor: floor.length },
            };
        }, b64, CX, CY);

        await page.evaluate(() => window.__sovereignScar.hud?.setHidden?.(false));
        console.log(
            `${label.padEnd(22)} body L*${String(res.bodyL).padStart(5)}  floor L*${String(res.floorL).padStart(5)}  ` +
            `ΔL* ${String(res.dL).padStart(5)}  ΔRGB ${String(res.dRGB).padStart(5)}  strongest edge ΔL* ${res.bestEdgeL}`
        );
        return res;
    }

    console.log('\n=== CHARACTER / GROUND SEPARATION (shipped frames) ===\n');
    const out = [];
    out.push({ ...await measure('overworld crust', null), label: 'overworld crust' });
    for (const [label, id] of [
        ['beat-01 crypt', 'beat-01-crypt'],
        ['beat-09 town', 'beat-09-town'],
        ['beat-12 pyre', 'beat-12-pyre'],
        ['beat-14 leviathan', 'beat-14-leviathan'],
    ]) out.push({ ...await measure(label, id), label });

    console.log('\nReference points for ΔL* (perceptual lightness, 0-100):');
    console.log('  < 10  the shape is legible only by colour, not by value — it dissolves when it stops moving');
    console.log('  ~20   readable at a glance');
    console.log('  > 30  reads instantly, the way a black outline or a hard rim light reads');
    const mean = out.reduce((a, r) => a + r.dL, 0) / out.length;
    console.log(`\nmean ΔL* across ${out.length} places: ${mean.toFixed(1)}`);
    console.log(`mean strongest-edge ΔL*: ${(out.reduce((a, r) => a + r.bestEdgeL, 0) / out.length).toFixed(1)}`);
} catch (e) {
    console.error('FAILED', e);
} finally {
    if (browser) await browser.close();
    await server.close();
}
