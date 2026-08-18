// tests/qa/quality-hero.mjs — what each quality tier does to the HERO.
//
//   node tests/qa/quality-hero.mjs [level]
//
// The owner reported that the player model looks WORSE on ultra than on low.
// Four things separate the two tiers (`engine/quality.js`), and any of them
// could be it:
//
//     knob            low     ultra
//     pixelRatio        1       2
//     bloom           off     on, strength 1.2   (med 0.7, high 0.9)
//     postExtras      off     on  (vignette + film grain + SMAA)
//     aberration      off     on  (RGB channel split)
//
// So the probe measures each tier, then ISOLATES the ultra-only effects by
// switching them off one at a time. Reading the tier table and picking the
// suspicious-looking line is how you get a plausible answer instead of a
// correct one — `renderer.js` already calls chromatic aberration "a
// distracting fringe on high-contrast edges", which makes it the obvious
// suspect and therefore the one most worth testing rather than assuming.
//
// FOUR NUMBERS, because a hero can be spoiled in four different ways and each
// of them looks fine to at least one of the others:
//
//   detail   luminance spread INSIDE the body. A figure has dark trousers, a
//            red tunic and a face; a bloomed smear does not. This is the number
//            that catches "washed out", and separation cannot.
//   sep      body L* minus the ring around it. Catches "dissolves into floor".
//   THERE IS NO FRINGE COLUMN HERE, and its absence is the point. A first
//   version sampled |R-B| on a RING at a fixed radius from the hero's
//   bounding-box centre. The hero is tall and narrow, so at that radius the
//   ring is mostly sand — and sand is brown, which has a large R-B of its own.
//   It read ~50 on every tier, including the ones with the effect switched
//   OFF, and would have cleared the real culprit. Measuring a channel split
//   needs the figure's own silhouette; that lives in `aberration-cost.mjs`.
//   sat      mean saturation of the body. Bloom lifts toward white, which is
//            what turns a red tunic pink.
//
// Print-only, plus PNGs in docs/media/quality/. Not a gate.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const OUT = 'docs/media/quality';
const LEVEL = process.argv[2] || 'overworld';
const TIERS = ['low', 'med', 'high', 'ultra'];

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer(8796);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--window-size=1280,720'],
    });
    const page = await browser.newPage();
    // deviceScaleFactor 2, and this is not a detail. `setQuality` does
    // `setPixelRatio(Math.min(window.devicePixelRatio, t.pixelRatio))`, and a
    // default headless page reports devicePixelRatio 1 — so `Math.min(1, 2)`
    // is 1 on EVERY tier and the single biggest difference between low and
    // ultra silently does not happen. The first run of this probe reported
    // every tier as identical for exactly that reason, which is a fact about
    // the probe and not about the game.
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
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
    await sleep(600);

    /** Measure the hero in the frame as it currently stands. */
    const measure = async (label) => {
        const at = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const THREE = await import('/lib/three/three.module.min.js');
            const box = new THREE.Box3().setFromObject(s.player.root);
            let mnX = 9, mxX = -9, mnY = 9, mxY = -9;
            for (const x of [box.min.x, box.max.x]) {
                for (const y of [box.min.y, box.max.y]) {
                    for (const z of [box.min.z, box.max.z]) {
                        const v = new THREE.Vector3(x, y, z).project(s.camera);
                        mnX = Math.min(mnX, v.x); mxX = Math.max(mxX, v.x);
                        mnY = Math.min(mnY, v.y); mxY = Math.max(mxY, v.y);
                    }
                }
            }
            return {
                cx: ((mnX + mxX) / 2 + 1) / 2 * 1280,
                cy: (1 - (mnY + mxY) / 2) / 2 * 720,
                px: ((mxY - mnY) / 2) * 720,
            };
        });
        const b64 = await page.screenshot({ encoding: 'base64' });
        // A CROP OF THE HERO, at the size the owner is looking at them. The
        // full 1280x720 frame is not the picture in question.
        const pad = Math.max(60, at.px * 1.2);
        const crop = await page.screenshot({
            encoding: 'base64',
            clip: {
                x: Math.max(0, at.cx - pad), y: Math.max(0, at.cy - pad),
                width: pad * 2, height: pad * 2,
            },
        });
        const m = await page.evaluate(async (d64, cx, cy, bodyPx) => {
            const img = new Image();
            await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + d64; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const c2 = cv.getContext('2d', { willReadFrequently: true });
            c2.drawImage(img, 0, 0);
            const d = c2.getImageData(0, 0, img.width, img.height).data;
            // THE SCREENSHOT IS IN DEVICE PIXELS, the projection is in CSS
            // pixels. With deviceScaleFactor 2 the image is 2560x1440 and the
            // sample coordinates are still 1280x720 — so the first run of this
            // measured a patch near the top-left corner of the frame and
            // reported detail 0.7 for every tier, which is the background
            // being uniform rather than the hero being flat.
            const sx = img.width / 1280, sy = img.height / 720;
            cx *= sx; cy *= sy; bodyPx *= sy;
            const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
            const Ls = (Y) => (Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16);
            const R_BODY = Math.max(5, bodyPx * 0.30);
            const R_IN = Math.max(11, bodyPx * 0.66);
            const R_OUT = Math.max(18, bodyPx * 1.05);
            const bodyL = [], sats = [];
            let bs = [0, 0, 0], bn = 0, fs = [0, 0, 0], fn = 0;
            for (let y = Math.floor(cy - R_OUT); y <= cy + R_OUT; y++) {
                for (let x = Math.floor(cx - R_OUT); x <= cx + R_OUT; x++) {
                    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
                    const dist = Math.hypot(x - cx, y - cy);
                    const i = (y * img.width + x) * 4;
                    const r = d[i], g = d[i + 1], b = d[i + 2];
                    if (dist <= R_BODY) {
                        bs[0] += r; bs[1] += g; bs[2] += b; bn++;
                        bodyL.push(Ls(lum(r, g, b)));
                        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                        sats.push(mx === 0 ? 0 : (mx - mn) / mx);
                    }
                    if (dist >= R_IN && dist <= R_OUT) { fs[0] += r; fs[1] += g; fs[2] += b; fn++; }
                }
            }
            const avg = (a) => a.reduce((p, v) => p + v, 0) / (a.length || 1);
            const bL = Ls(lum(bs[0] / bn, bs[1] / bn, bs[2] / bn));
            const fL = Ls(lum(fs[0] / fn, fs[1] / fn, fs[2] / fn));
            const mean = avg(bodyL);
            const sd = Math.sqrt(avg(bodyL.map((v) => (v - mean) ** 2)));
            return {
                body: +bL.toFixed(1), sep: +(bL - fL).toFixed(1),
                detail: +sd.toFixed(1), sat: +avg(sats).toFixed(3),
                px: +bodyPx.toFixed(0),
            };
        }, b64, at.cx, at.cy, at.px);
        console.log(`  ${label.padEnd(26)} ${String(m.px).padStart(3)}px  ` +
            `detail ${String(m.detail).padStart(5)}   sat ${String(m.sat).padStart(5)}   ` +
            `sep ${String(m.sep).padStart(5)}   ` +
            `body L* ${String(m.body).padStart(5)}`);
        return { b64, crop, m };
    };

    console.log(`${LEVEL} — the hero at each tier\n`);
    console.log(`  ${'tier'.padEnd(26)} size   detail        sat         sep       body`);
    for (const tier of TIERS) {
        await page.evaluate((q) => window.__sovereignScar.applyQualitySetting(q), tier);
        await sleep(700);
        const { b64, crop } = await measure(tier);
        fs.writeFileSync(`${OUT}/${LEVEL}-${tier}.png`, Buffer.from(b64, 'base64'));
        fs.writeFileSync(`${OUT}/${LEVEL}-${tier}-hero.png`, Buffer.from(crop, 'base64'));
    }

    // ── Isolate. Ultra, then each of its extras switched off in turn ───────
    console.log(`\n  ultra, with one thing switched off at a time:`);
    await page.evaluate((q) => window.__sovereignScar.applyQualitySetting(q), 'ultra');
    await sleep(700);

    // Passes are identified by their UNIFORM SIGNATURE, not by class name and
    // not off the dev bridge (which exposes the composer but not its passes).
    //
    // The first version matched /Vignette|Shader/ against the constructor name
    // — and the vignette, the RGB shift, the flicker, the wrap AND the colour
    // grade are all `ShaderPass`. It switched off five passes, called the
    // result "vignette", and `setQuality` only re-enables four of them, so the
    // colour grade stayed off for every row after it. Every number below that
    // line described a different game.
    const PASS_SIG = {
        bloom: 'p.constructor.name === "UnrealBloomPass"',
        film: 'p.constructor.name === "FilmPass"',
        smaa: 'p.constructor.name === "SMAAPass"',
        // The two ShaderPasses the tier table owns, told apart by what they
        // actually take: the vignette has darkness/offset, the RGB shift has
        // amount/angle. Neither name appears anywhere at runtime.
        vignette: 'p.uniforms && "darkness" in p.uniforms && "offset" in p.uniforms',
        aberration: 'p.uniforms && "amount" in p.uniforms && "angle" in p.uniforms',
    };

    const setPass = (kind, on) => page.evaluate(([sig, enable]) => {
        const c = window.__sovereignScar.composer;
        const match = new Function('p', `return ${sig};`);
        let n = 0;
        for (const p of c.passes || []) {
            let hit = false;
            try { hit = !!match(p); } catch (_) { hit = false; }
            if (hit) { p.enabled = enable; n++; }
        }
        return n;
    }, [PASS_SIG[kind], on]);

    const passOff = async (label, kind) => {
        // EXACTLY ONE, or the row is a lie about which pass it turned off.
        const hit = await setPass(kind, false);
        if (hit !== 1) {
            console.log(`  ${label.padEnd(26)} !! matched ${hit} passes, expected 1 — skipped`);
            await setPass(kind, true);
            return;
        }
        await sleep(500);
        const { crop } = await measure(label);
        fs.writeFileSync(`${OUT}/${LEVEL}-ultra-no-${label.replace(/\W+/g, '')}-hero.png`,
            Buffer.from(crop, 'base64'));
        // Back on, explicitly. `applyQualitySetting` re-enables only the four
        // passes the tier table owns, so restoring by tier alone would leave
        // anything else off for the rest of the run.
        await setPass(kind, true);
        await page.evaluate((q) => window.__sovereignScar.applyQualitySetting(q), 'ultra');
        await sleep(500);
    };

    await passOff('aberration', 'aberration');
    await passOff('bloom', 'bloom');
    await passOff('film grain', 'film');
    await passOff('vignette', 'vignette');
    await passOff('SMAA', 'smaa');

    // Bloom strength alone, since ultra runs 1.2 against high's 0.9 and med's
    // 0.7 — if strength is the whole story, ultra at 0.7 should read as med.
    console.log(`\n  ultra, sweeping bloom strength (ultra ships 1.2):`);
    for (const st of [0, 0.4, 0.7, 0.9, 1.2]) {
        await page.evaluate((s2) => {
            const c = window.__sovereignScar.composer;
            const b = (c.passes || []).find((p) => /bloom/i.test(p.constructor?.name || ''));
            if (b) { b.enabled = s2 > 0; b.strength = s2; }
        }, st);
        await sleep(450);
        await measure(`strength ${st}`);
    }
} catch (e) {
    console.error('PROBE FAILED:', e.message);
} finally {
    if (browser) await browser.close();
    server.close?.();
    process.exit(0);
}
