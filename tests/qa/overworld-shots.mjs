// tests/qa/overworld-shots.mjs — what the overworld relief actually changed.
//
//   node tests/qa/overworld-shots.mjs [label]
//
// Shoots a fixed set of overworld screens at the gameplay camera and writes
// them to `docs/media/overworld/<label>/`, so a BEFORE run and an AFTER run can
// be put side by side. Label defaults to `after`.
//
// WHY A PAIR AND NOT A NUMBER. The overworld metered a p10-to-p90 luminance
// spread of 11 against 68 to 189 in the dungeons, and the fix took it to 27 —
// but this project has repeatedly had changes that raised every number they
// were judged by and made the game look worse, and it found all of them by
// looking. A contrast figure says the histogram widened. Only the picture says
// whether the ground now reads as ground.
//
// The screens are chosen to cover four of the eight regions and both mirror
// states, because the relief is seeded per screen and per region — one frame
// would show one seed.
//
// ── AND IT CORRECTED THE CLAIM IT WAS BUILT TO ILLUSTRATE ──────────────────
//
// "The overworld is flat" came from `tests/qa/contrast-probe.mjs`, which loads
// a level and samples it where the player lands — for the overworld, the START
// screen. Shooting four screens instead of one says something more specific:
//
//     screen      before   after
//     scarfield       12      47     the start screen
//     r1c4           136     134
//     r4c1            99      98
//     r5c5            97     112
//
// The overworld was never uniformly flat. Its START screen was, and three of
// the four sampled had plenty of contrast already. That the flat one is also
// the first thing a new player sees and the backdrop the title camera shoots
// against is why it mattered, and the change lands almost entirely there —
// four times the spread on the screen that needed it, within noise on the ones
// that did not. A pass that had lifted all four equally would have been a pass
// that flattened three good screens to fix one bad one, and the single-screen
// number could not have told the difference.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const LABEL = process.argv[2] || 'after';
const OUT = `docs/media/overworld/${LABEL}`;

/**
 * Screen ids on the 7x7 grid, with the region each falls in.
 *
 * `scarfield` is the one a new player sees first and the backdrop the title
 * camera shoots against, so it leads. The rest spread across the map so four
 * different region grammars and four different seeds are represented.
 */
const SCREENS = [
    ['scarfield', 'the start screen, and the title backdrop'],
    ['r1c4', 'north-east — spindle country'],
    ['r4c1', 'south-west — quarry country'],
    ['r5c5', 'south-east — cryomire'],
];

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer(8794);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    const page = await browser.newPage();
    await disableGamepads(page);
    // The frame every capture in docs/media uses, so a pair is comparable and
    // so the numbers here can be read against the contrast probe's.
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.setDefaultTimeout(120000);
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });

    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.startNewGame();
        s.game.atTitle = false;
        s.game.paused = false;
        s.menu.close();
    });
    await sleep(700);

    console.log(`label "${LABEL}" -> ${OUT}\n`);
    console.log('screen        centre lum   p10   p90   spread   note');

    for (const [sid, note] of SCREENS) {
        const ok = await page.evaluate(async (id) => {
            const s = window.__sovereignScar;
            s.loadLevel('overworld');
            await new Promise((r) => setTimeout(r, 500));
            try { s.game.level.enterRoom(id, s.game); } catch (e) { return false; }
            // Park the player at the screen centre — where they arrive, and the
            // exact spot the protected disc keeps clear of geometry.
            const o = s.game.level.currentRoomOrigin();
            s.player.root.position.set(o.x, 1.95, o.z);
            s.player.physics.resetVelocity();
            s.cameraRig.snapTo(s.player.root.position);
            return true;
        }, sid);
        if (!ok) { console.log(`${sid.padEnd(12)}  SKIPPED (no such screen)`); continue; }
        await sleep(900);   // let the mood ramp and the lights settle

        const path = `${OUT}/${sid}.png`;
        // WRITE, THEN READ BACK OFF DISK. Passing `encoding: 'base64'` and a
        // `path` together returns the data and writes NOTHING — the first
        // version of this reported four screens of statistics into an empty
        // directory, which is the same shape of failure as the canvas readback
        // below: a probe that appears to be working on data it does not have.
        await page.screenshot({ path });
        const shot = fs.readFileSync(path).toString('base64');

        // READ THE PNG BACK, never the live canvas.
        //
        // The first version of this called `getImageData` on the WebGL canvas
        // and every screen reported a luminance of exactly 0.0. The renderer
        // does not set `preserveDrawingBuffer`, so by the time a script runs the
        // back buffer is already gone — the canvas is genuinely blank to
        // anything that asks it, while the compositor and puppeteer both see the
        // real frame. A probe that reports 0.0 for a picture it just saved at a
        // megabyte is measuring its own plumbing.
        const stat = await page.evaluate(async (b64) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;
            await img.decode();
            const g = document.createElement('canvas');
            g.width = img.width; g.height = img.height;
            const ctx = g.getContext('2d');
            ctx.drawImage(img, 0, 0);
            // The same statistic the certification gate reads: the CENTRE CROP,
            // not the whole frame. The corners are void and letterbox, and
            // averaging them in measures the background rather than the ground.
            const x0 = Math.floor(g.width * 0.25), y0 = Math.floor(g.height * 0.25);
            const w = Math.floor(g.width * 0.5), h = Math.floor(g.height * 0.5);
            const d = ctx.getImageData(x0, y0, w, h).data;
            const lum = [];
            for (let i = 0; i < d.length; i += 4) {
                lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
            }
            lum.sort((a, b) => a - b);
            const p = (q) => lum[Math.floor(lum.length * q)];
            const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
            return { mean, p10: p(0.1), p90: p(0.9) };
        }, shot);
        console.log(`${sid.padEnd(12)} ${stat.mean.toFixed(1).padStart(10)}  `
            + `${stat.p10.toFixed(0).padStart(4)}  ${stat.p90.toFixed(0).padStart(4)}  `
            + `${(stat.p90 - stat.p10).toFixed(0).padStart(6)}   ${note}`);
    }
    console.log(`\nWrote ${SCREENS.length} frames. Compare against the other label:`);
    console.log('  node tests/qa/overworld-shots.mjs before   (with the change reverted)');
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
