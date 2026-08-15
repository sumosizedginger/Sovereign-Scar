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
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const chrome = findChromeVerbose();
const puppeteer = await import('puppeteer-core');
const server = await startServer(8793);
let browser;

// Where the character sits on a 1280x720 frame.
//
// This used to be a hardcoded (640, 360) with the reasoning "the rig centres the
// look-at on the player, so they land at frame centre". The rig looks at a point
// ABOVE the player's feet and the camera is pitched 56 degrees, so the player's
// body actually renders around y = 395 — and a 26-pixel disc at 360 straddles
// their head and a lot of the floor beyond it. Every number this probe has ever
// printed was diluted by that, and in the crowded rooms it was measuring more
// floor than character.
//
// So the player is PROJECTED now, per frame, per level. `measure` fills these in.
let CX = 640, CY = 360;

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

    async function measureOnce(label, levelId, quiet = false) {
        if (levelId) {
            await page.evaluate(async (l) => { await window.__sovereignScar.loadLevel(l); }, levelId);
            await sleep(2600);
        }
        // Hide HUD so no DOM chrome lands in the crop.
        await page.evaluate(() => window.__sovereignScar.hud?.setHidden?.(true));
        await sleep(400);

        // Ask the renderer where the player is, rather than assuming.
        const at = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const cam = s.camera;
            const p = s.player.root.position;
            const h = s.player.actor?.height || 1.9;
            // Mid-torso, which is the part of the body a disc should sit on —
            // the feet are half in shadow and the head is a sixth of the figure.
            const world = [p.x, p.y - 0.95 + h * 0.55, p.z];
            cam.updateMatrixWorld();
            const project = (v) => {
                const m = cam.projectionMatrix.elements;
                const iv = cam.matrixWorldInverse.elements;
                const e = (M, i, x, y, z) => M[i] * x + M[i + 4] * y + M[i + 8] * z + M[i + 12];
                const vx = e(iv, 0, ...v), vy = e(iv, 1, ...v), vz = e(iv, 2, ...v);
                const cx = m[0] * vx + m[4] * vy + m[8] * vz + m[12];
                const cy = m[1] * vx + m[5] * vy + m[9] * vz + m[13];
                const cw = m[3] * vx + m[7] * vy + m[11] * vz + m[15];
                return [cx / cw, cy / cw];
            };
            const [ndcX, ndcY] = project(world);
            // …and how big they are, so the sampling radii scale with the figure
            // instead of being three more magic numbers.
            const top = project([p.x, p.y - 0.95 + h, p.z]);
            const bot = project([p.x, p.y - 0.95, p.z]);
            const px = (ndcX * 0.5 + 0.5) * 1280;
            const py = (-ndcY * 0.5 + 0.5) * 720;
            const heightPx = Math.abs((top[1] - bot[1]) * 0.5 * 720);
            return { px: +px.toFixed(1), py: +py.toFixed(1), heightPx: +heightPx.toFixed(1) };
        });
        CX = at.px; CY = at.py;

        const b64 = await page.screenshot({ encoding: 'base64' });

        const res = await page.evaluate(async (dataB64, cx, cy, bodyPx) => {
            const img = new Image();
            await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + dataB64; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const sx = img.width / 1280, sy = img.height / 720;
            // Sized from the character's MEASURED on-screen height instead of
            // three constants tuned once against one room. The figure is about
            // 30 px tall at 720p, so the old 26/34/58 disc was roughly twice the
            // body and mostly floor.
            const R_BODY = Math.max(6, bodyPx * 0.36) * sy;
            const R_IN = Math.max(9, bodyPx * 0.52) * sy;
            const R_OUT = Math.max(16, bodyPx * 0.95) * sy;
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

            // Edge test, on every bearing around the body.
            //
            // TWO numbers, because the MAX on its own is a liar. It reports the
            // single luckiest bearing out of 120 — one bright prop behind one
            // shoulder scores 66 while the other 119 bearings score nothing, and
            // the character is still invisible. It read 51 on average across a
            // campaign whose characters dissolve into the floor.
            //
            // The MEDIAN is the honest one: half the outline is at least this
            // strong. It is also the number an outline exists to move, which the
            // body-vs-floor ΔL* above is nearly blind to — a black band lives at
            // the boundary, and a mean over a disc barely notices it.
            //
            // And it walks the ray one pixel at a time rather than sampling two
            // fixed radii. The first version compared r-4 against r+8, which
            // straddles the boundary by twelve pixels — an outline is one or two
            // pixels wide, so that version could not see the thing it was added
            // to measure. It reported no change at all from a band that is
            // plainly visible in the frame.
            const inP = (yy, xx) => {
                const i = (Math.round(yy) * img.width + Math.round(xx)) * 4;
                return [d[i], d[i + 1], d[i + 2]];
            };
            const edges = [];
            for (let a = 0; a < 360; a += 3) {
                const rad = a * Math.PI / 180;
                let step = 0;
                let prev = null;
                for (let r = R_BODY - 12; r <= R_BODY + 14; r += 1) {
                    const L = Lstar(lum(...inP(py + Math.sin(rad) * r, px + Math.cos(rad) * r)));
                    if (prev != null) step = Math.max(step, Math.abs(L - prev));
                    prev = L;
                }
                edges.push(step);
            }
            const sorted = edges.slice().sort((a, b) => a - b);
            const bestEdge = sorted[sorted.length - 1];
            const medEdge = sorted[Math.floor(sorted.length / 2)];
            return {
                medEdgeL: +medEdge.toFixed(1),
                bodyRGB: bA.map((v) => Math.round(v)), floorRGB: fA.map((v) => Math.round(v)),
                bodyL: +bL.toFixed(1), floorL: +fL.toFixed(1),
                dL: +Math.abs(bL - fL).toFixed(1),
                dRGB: +Math.hypot(bA[0] - fA[0], bA[1] - fA[1], bA[2] - fA[2]).toFixed(1),
                bestEdgeL: +bestEdge.toFixed(1),
                samples: { body: body.length, floor: floor.length },
            };
        }, b64, CX, CY, at.heightPx);

        await page.evaluate(() => window.__sovereignScar.hud?.setHidden?.(false));
        if (quiet) return res;
        console.log(
            `${label.padEnd(22)} body L*${String(res.bodyL).padStart(5)}  floor L*${String(res.floorL).padStart(5)}  ` +
            `ΔL* ${String(res.dL).padStart(5)}  ΔRGB ${String(res.dRGB).padStart(5)}  ` +
            `edge ΔL* median ${String(res.medEdgeL).padStart(5)} / max ${res.bestEdgeL}`
        );
        return res;
    }

    /**
     * MEDIAN OF FIVE, not one sample — the fix the luminance gate already needed.
     *
     * This probe re-aims itself at the player every run, which is correct (a
     * fixed pixel was the old bug). But the player is not standing in exactly
     * the same spot run to run, so the FLOOR annulus lands on slightly
     * different ground each time. Measured across three consecutive runs of the
     * SAME build, the overworld floor read 27.8, 30.7 and 34.5 — a spread of
     * nearly seven points, wider than most differences anyone would want to
     * A/B with it.
     *
     * One sample was good enough to say "this room is bad" and not good enough
     * to say "this change helped", which is exactly the question it was being
     * asked. `spread` is printed so a noisy reading cannot be quoted as a
     * precise one.
     */
    async function measure(label, levelId) {
        const runs = [];
        for (let i = 0; i < 5; i++) {
            runs.push(await measureOnce(label, i === 0 ? levelId : null, true));
            await sleep(160);
        }
        const med = (k) => {
            const v = runs.map((r) => r[k]).sort((a, b) => a - b);
            return +v[Math.floor(v.length / 2)].toFixed(1);
        };
        const dLs = runs.map((r) => r.dL);
        const res = {
            ...runs[0],
            bodyL: med('bodyL'), floorL: med('floorL'), dL: med('dL'),
            dRGB: med('dRGB'), bestEdgeL: med('bestEdgeL'), medEdgeL: med('medEdgeL'),
            spread: +(Math.max(...dLs) - Math.min(...dLs)).toFixed(1),
        };
        console.log(
            `${label.padEnd(22)} body L*${String(res.bodyL).padStart(5)}  floor L*${String(res.floorL).padStart(5)}  `
            + `ΔL* ${String(res.dL).padStart(5)} (spread ${res.spread})  `
            + `edge ΔL* median ${String(res.medEdgeL).padStart(5)} / max ${res.bestEdgeL}`
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
