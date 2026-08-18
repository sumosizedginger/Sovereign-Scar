// tests/qa/title-shot.mjs — what the title screen actually looks like.
//
//   node tests/qa/title-shot.mjs [level]
//
// Shoots the title screen and MEASURES the composition: how much of the frame
// the hero fills, where in it they sit, and whether anything is in front of
// them. Those three numbers are the whole complaint `ui/menu.js` records —
// "the hero, ~30px, sat dead centre directly behind the 44px wordmark" — and
// none of them can be judged from a screenshot without a ruler.
//
// Print-only, plus PNGs in docs/media/title/.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const OUT = 'docs/media/title';
const LEVEL = process.argv[2] || null;

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer(8793);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--window-size=1280,720'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await disableGamepads(page);
    page.setDefaultTimeout(90000);
    page.on('pageerror', (e) => console.log('  pageerror', String(e).slice(0, 140)));

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });
    // The click is only there to unlock audio. In title mode the overlay
    // ITSELF is a click target — `menu.js` activates the selected row when you
    // click anywhere outside a row — so the first version of this probe
    // photographed the difficulty submenu and reported the pause scrim's
    // luminance as the title screen's.
    await page.mouse.click(400, 300);
    await sleep(400);
    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.game.atTitle = true;
        s.game.paused = true;
        s.menu.openTitle();
    });
    await sleep(600);

    if (LEVEL) {
        await page.evaluate(async (lid) => {
            const s = window.__sovereignScar;
            s.loadLevel(lid);
            await new Promise((r) => setTimeout(r, 900));
            // Back to the title over the newly loaded level.
            s.game.atTitle = true;
            s.game.paused = true;
            s.menu.openTitle();
        }, LEVEL);
        await sleep(900);
    }

    const measure = async (label) => {
        const m = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const THREE = await import('/lib/three/three.module.min.js');
            const cam = s.camera;
            const root = s.player.root;
            // The hero's projected extent, from their real bounds — not from a
            // remembered "30px", which is the number this probe exists to
            // replace with one somebody measured today.
            const box = new THREE.Box3().setFromObject(root);
            let minX = 9, maxX = -9, minY = 9, maxY = -9;
            for (const x of [box.min.x, box.max.x]) {
                for (const y of [box.min.y, box.max.y]) {
                    for (const z of [box.min.z, box.max.z]) {
                        const v = new THREE.Vector3(x, y, z).project(cam);
                        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
                        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
                    }
                }
            }
            // Is anything in front of them? Real ray, real scene.
            const mid = new THREE.Vector3(
                (box.min.x + box.max.x) / 2,
                box.min.y + (box.max.y - box.min.y) * 0.65,
                (box.min.z + box.max.z) / 2);
            const from = cam.position.clone();
            const dir = mid.clone().sub(from);
            const dist = dir.length();
            const ray = new THREE.Raycaster(from, dir.normalize());
            ray.far = dist - 0.05;
            const blockers = [];
            s.scene.traverse((o) => {
                if (!o.isMesh || !o.visible || o.name === 'void-plane') return;
                let n = o, mine = false;
                while (n) { if (n === root) { mine = true; break; } n = n.parent; }
                if (!mine) blockers.push(o);
            });
            const hit = ray.intersectObjects(blockers, false)[0] || null;
            const lum = await s.sampleLuminanceStats();
            return {
                boxY: [+box.min.y.toFixed(2), +box.max.y.toFixed(2)],
                rootY: +root.position.y.toFixed(2),
                heightPx: ((maxY - minY) / 2) * 720,
                widthPx: ((maxX - minX) / 2) * 1280,
                ndcX: (minX + maxX) / 2, ndcY: (minY + maxY) / 2,
                camDist: dist,
                pitchDeg: Math.atan2(cam.position.y - mid.y,
                    Math.hypot(cam.position.x - mid.x, cam.position.z - mid.z)) * 180 / Math.PI,
                blocked: !!hit,
                blockedBy: hit ? (hit.object.name || 'Mesh') : null,
                lum: lum.centerMean, contrast: lum.contrast,
            };
        });
        // IS THE HERO READABLE, not just unoccluded? The first version of this
        // probe raycast for a mesh in the way and reported "clear" on a frame
        // where a light fixture's bloom had washed the hero to a white smear.
        // A lamp is not an occluder and a ray cannot see one. Body L* against
        // the ring around it, the method `tests/qa/silhouette-contrast.mjs`
        // settled on.
        const b64 = await page.screenshot({ encoding: 'base64' });
        const sep = await page.evaluate(async (dataB64, cx, cy, bodyPx) => {
            const img = new Image();
            await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + dataB64; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const c2 = cv.getContext('2d', { willReadFrequently: true });
            c2.drawImage(img, 0, 0);
            const d = c2.getImageData(0, 0, img.width, img.height).data;
            const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
            const Lstar = (Y) => (Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16);
            const R_BODY = Math.max(6, bodyPx * 0.32);
            const R_IN = Math.max(10, bodyPx * 0.62);
            const R_OUT = Math.max(18, bodyPx * 1.05);
            let bs = [0, 0, 0], bn = 0, fs = [0, 0, 0], fn = 0;
            const bodyL = [];
            for (let y = Math.floor(cy - R_OUT); y <= cy + R_OUT; y++) {
                for (let x = Math.floor(cx - R_OUT); x <= cx + R_OUT; x++) {
                    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
                    const dist = Math.hypot(x - cx, y - cy);
                    const i = (y * img.width + x) * 4;
                    if (dist <= R_BODY) {
                        bs[0] += d[i]; bs[1] += d[i + 1]; bs[2] += d[i + 2]; bn++;
                        bodyL.push(Lstar(lum(d[i], d[i + 1], d[i + 2])));
                    }
                    else if (dist >= R_IN && dist <= R_OUT) { fs[0] += d[i]; fs[1] += d[i + 1]; fs[2] += d[i + 2]; fn++; }
                }
            }
            if (!bn || !fn) return null;
            const bL = Lstar(lum(bs[0] / bn, bs[1] / bn, bs[2] / bn));
            const fL = Lstar(lum(fs[0] / fn, fs[1] / fn, fs[2] / fn));
            // DETAIL, because separation on its own cannot see the failure it
            // is most likely to be handed. A hero swallowed by a fixture's
            // bloom is a flat white smear, and a flat white smear scores
            // EXCELLENT separation against a dark room — 19.9 in the Bone
            // Forest, on a frame where the character is not visible at all.
            // A real figure has dark trousers, a red tunic and a face; the
            // spread of luminance inside the body disc says which one this is.
            const mean = bodyL.reduce((a, v) => a + v, 0) / bodyL.length;
            const sd = Math.sqrt(bodyL.reduce((a, v) => a + (v - mean) ** 2, 0) / bodyL.length);
            return {
                body: +bL.toFixed(1), around: +fL.toFixed(1),
                sep: +Math.abs(bL - fL).toFixed(1), detail: +sd.toFixed(1),
            };
        }, b64, (m.ndcX + 1) / 2 * 1280, (1 - m.ndcY) / 2 * 720, m.heightPx);
        m.sep = sep;

        console.log(`  ${label.padEnd(10)} hero ${m.heightPx.toFixed(0)}x${m.widthPx.toFixed(0)}px ` +
            `(${(100 * m.heightPx / 720).toFixed(1)}% of frame height)  ` +
            `at ndc ${m.ndcX.toFixed(2)},${m.ndcY.toFixed(2)}  ` +
            `lens ${m.camDist.toFixed(1)}m @ ${m.pitchDeg.toFixed(0)}°  ` +
            (m.blocked ? `HIDDEN by ${m.blockedBy}` : 'clear') +
            `  lum=${m.lum.toFixed(0)} contrast=${m.contrast}` +
            (m.sep ? `  L* ${m.sep.body} vs ${m.sep.around} = sep ${m.sep.sep}` +
                `  detail ${m.sep.detail}` : ''));
        return m;
    };

    const level = await page.evaluate(() => window.__sovereignScar.game.levelId);
    console.log(`title over ${level}`);
    await measure('settled');
    await page.screenshot({ path: `${OUT}/title-${level}.png` });
    // …and again after the drift has run, because a composition that is right
    // for one second and wrong for the next is not composed.
    await sleep(6000);
    await measure('+6s');
    await page.screenshot({ path: `${OUT}/title-${level}-drifted.png` });
    console.log(`\nwrote ${OUT}/title-${level}.png (+ -drifted)`);
} catch (e) {
    console.error('PROBE FAILED:', e.message);
} finally {
    if (browser) await browser.close();
    server.close?.();
    process.exit(0);
}
