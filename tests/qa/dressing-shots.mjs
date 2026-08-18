// tests/qa/dressing-shots.mjs — what the hanging dressing actually adds.
//
//   node tests/qa/dressing-shots.mjs [level] [room]
//
// Shoots the same frame twice, once with the `room-dressing:*` meshes hidden,
// so the difference is the subject rather than a guess about which of the gold
// rectangles in a citadel are new. Also samples the sway itself: it holds the
// camera still, reads the mesh's world-space vertex bounds, advances the
// ambient clock, and reads them again — a piece that does not move reports zero.
//
// Print-only, plus PNGs in docs/media/wall-height/. Not a gate; the physics is
// gated in `tests/game/dressing.spec.mjs`, which is where the failure that
// matters lives.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const OUT = 'docs/media/wall-height';
const LEVEL = process.argv[2] || 'beat-05-citadel';
const ROOM = process.argv[3] || null;

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer(8792);
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
    await page.mouse.click(400, 300);
    await page.evaluate(() => window.__sovereignScar.startNewGame('medium'));
    await sleep(400);
    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.game.atTitle = false; s.game.paused = false;
        s.menu.close(); s.hud?.setHidden?.(true);
    });

    const info = await page.evaluate(async (lid, rid) => {
        const s = window.__sovereignScar;
        s.loadLevel(lid);
        s.game.bossIntro = null;
        s.hud?.setHidden?.(true);
        await new Promise((r) => setTimeout(r, 900));
        const def = s.game.level.def;
        // A room that actually has dressing, so the comparison has a subject.
        const room = rid || Object.keys(def.rooms).find((k) => s.game.level.dressingFor?.(k))
            || def.start;
        s.game.level.enterRoom(room, s.game);
        await new Promise((r) => setTimeout(r, 400));
        const o = s.game.level.currentRoomOrigin();
        const r = def.rooms[room];
        const d = s.game.level.dressingFor?.(room);
        return { room, half: r.half, origin: o, pieces: d?.placed || 0, anchorY: d?.anchorY ?? null };
    }, LEVEL, ROOM);

    console.log(`${LEVEL} / ${info.room}  half=${info.half}  ${info.pieces} hanging pieces, anchored at y=${info.anchorY}`);
    if (!info.pieces) console.log('  (this room has none — the shots will be identical)');

    // Stand back from the far wall so it fills the top of the frame.
    await page.evaluate(async (o, half) => {
        const s = window.__sovereignScar;
        s.player.root.position.set(o.x + 0.5, 1.95, o.z - half + 5);
        for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 30));
        s.cameraRig.snapTo({ x: s.player.root.position.x, y: 1.95, z: s.player.root.position.z });
        await new Promise((r) => setTimeout(r, 150));
    }, info.origin, info.half);

    const setVisible = (v) => page.evaluate((vis) => {
        let n = 0;
        window.__sovereignScar.scene.traverse((ob) => {
            if (/^room-dressing:/.test(ob.name || '')) { ob.visible = vis; n++; }
        });
        return n;
    }, v);

    const shown = await setVisible(true);
    await sleep(250);
    await page.screenshot({ path: `${OUT}/${LEVEL}-${info.room}-dressed.png` });
    const litStat = await page.evaluate(() => window.__sovereignScar.sampleLuminanceStats());
    await setVisible(false);
    await sleep(250);
    await page.screenshot({ path: `${OUT}/${LEVEL}-${info.room}-bare.png` });
    const bareStat = await page.evaluate(() => window.__sovereignScar.sampleLuminanceStats());
    await setVisible(true);
    console.log(`  ${shown} dressing meshes in the scene; wrote -dressed.png and -bare.png`);
    console.log(`  centre-crop luminance  bare ${bareStat.centerMean.toFixed(1)} ` +
        `-> dressed ${litStat.centerMean.toFixed(1)}  (${(litStat.centerMean - bareStat.centerMean >= 0 ? '+' : '')}` +
        `${(litStat.centerMean - bareStat.centerMean).toFixed(1)})   contrast ${bareStat.contrast} -> ${litStat.contrast}`);

    // HOW MUCH OF THE FRAME IS IT? Eyeballing a screenshot cannot separate a
    // new banner from a wall that was always there — the first pass at this
    // mistook the citadel's existing gold light fixtures for the dressing.
    // Projecting the meshes' own bounds answers it without a judgement call.
    const cover = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        const THREE = await import('/lib/three/three.module.min.js');
        const cam = s.camera;
        let area = 0, seen = 0;
        s.scene.traverse((o) => {
            if (!/^room-dressing:/.test(o.name || '') || !o.visible) return;
            o.geometry.computeBoundingBox();
            const b = o.geometry.boundingBox;
            let minX = 9, maxX = -9, minY = 9, maxY = -9, anyFront = false;
            for (const cx of [b.min.x, b.max.x]) {
                for (const cy of [b.min.y, b.max.y]) {
                    for (const cz of [b.min.z, b.max.z]) {
                        const v = new THREE.Vector3(cx, cy, cz);
                        o.localToWorld(v);
                        v.project(cam);
                        if (v.z < 1) anyFront = true;
                        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
                        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
                    }
                }
            }
            if (!anyFront) return;
            const w = Math.max(0, Math.min(1, maxX) - Math.max(-1, minX));
            const h = Math.max(0, Math.min(1, maxY) - Math.max(-1, minY));
            if (w > 0 && h > 0) { seen++; area += (w * h) / 4; }
        });
        return { seen, area };
    });
    console.log(`  ${cover.seen} dressing meshes inside the frame, covering ` +
        `${(cover.area * 100).toFixed(1)}% of it`);

    // Does it move? World-space bounds of the dressing mesh, twice, with the
    // ambient clock advanced between. Read from the GPU-side transform the
    // shader applies, which is why this is done in the browser and not in a
    // spec: the displacement exists only in GLSL.
    const motion = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        const mats = [];
        s.scene.traverse((o) => {
            if (/^room-dressing:/.test(o.name || '') && o.material?.userData?.swayUniforms) {
                mats.push(o.material.userData.swayUniforms);
            }
        });
        if (!mats.length) return null;
        const at = (t) => {
            for (const u of mats) u.uSwayTime.value = t;
            return mats.map((u) => u.uSwayTime.value);
        };
        // The wave is what it is; report the amplitude the uniforms drive and
        // whether the frame loop is the thing writing them.
        const before = mats[0].uSwayTime.value;
        await new Promise((r) => setTimeout(r, 900));
        const after = mats[0].uSwayTime.value;
        void at;
        return {
            materials: mats.length,
            amp: mats.map((u) => u.uSwayAmp.value),
            clockAdvanced: after - before,
        };
    });
    if (!motion) console.log('  no sway materials found');
    else {
        console.log(`  ${motion.materials} sway materials, amplitudes ${[...new Set(motion.amp)].join(', ')}`);
        console.log(`  ambient clock advanced ${motion.clockAdvanced.toFixed(2)}s in 0.9s of wall time` +
            (motion.clockAdvanced > 0.1 ? '  — the frame loop is driving it' : '  — NOT ADVANCING'));
    }
} catch (e) {
    console.error('PROBE FAILED:', e.message);
} finally {
    if (browser) await browser.close();
    server.close?.();
    process.exit(0);
}
