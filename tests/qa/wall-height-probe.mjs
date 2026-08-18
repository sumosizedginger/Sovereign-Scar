// tests/qa/wall-height-probe.mjs — what a wall height actually does to the frame.
//
//   node tests/qa/wall-height-probe.mjs
//
// Print-only, plus PNGs in docs/media/wall-height/. Not a gate.
//
// Two questions, and the second is the one that decides how tall a wall may be:
//
//   1. How much of the frame is WALL rather than floor, at each height? That is
//      the thing the ticket is buying — "it changes how a room feels on entry".
//   2. Does the near wall hide the player? The camera is FIXED-YAW (camera-rig
//      never rotates about Y; `index.js` puts it at look + (0, 17.5, +6.125)),
//      so the S wall (z = +half) is always the one between the lens and the
//      hero, and the N wall (z = -half) is always the one you look AT. Those
//      two walls therefore have completely different budgets, and the current
//      code gives them the same number.
//
// The player position matters more than the room does: hard against the S wall
// is the worst case and the middle of the room is the common one, so both are
// shot. Anything measured only from a spawn point would miss it entirely.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const OUT = 'docs/media/wall-height';
const LEVEL = process.argv[2] || 'beat-01-crypt';
const ROOM = process.argv[3] || null;

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer(8791);
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
    page.on('pageerror', (e) => console.log('  pageerror', String(e).slice(0, 120)));

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });
    await page.mouse.click(400, 300);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
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
        const room = rid || def.start;
        s.game.level.enterRoom(room, s.game);
        await new Promise((r) => setTimeout(r, 400));
        const r = def.rooms[room];
        return { room, half: r.half, wallH: r.wallH ?? 4, doors: (r.doors || []).map((d) => d.side + d.at) };
    }, LEVEL, ROOM);
    console.log(`${LEVEL} / ${info.room}   half=${info.half}  wallH=${info.wallH}  doors=${info.doors.join(' ')}`);

    // Where the room sits in world space — rooms are laid out on a stride, so
    // the room's own origin is the only honest anchor.
    //
    // NOT `cameraBounds`. That rect is `[o - half, o + half + 1]` — it spans the
    // OUTER faces of the wall cells, because cell `half` occupies world
    // `[half, half+1]`. Insetting it by a body half-extent puts the player
    // INSIDE the wall, which is what the first run of this probe did: the hero
    // was extruded, fell out of the world, and four of five readings described
    // the void (lum 40, contrast 6) rather than the room. The INNER wall face
    // is at `o ± half`, and that is what a body may touch.
    const origin = await page.evaluate(() => window.__sovereignScar.game.level.currentRoomOrigin());
    const cx = origin.x;
    const cz = origin.z;
    // The two ends are NOT symmetric, and assuming they were pushed the hero
    // through the north wall on the second run of this probe. Cell `k` occupies
    // world `[k, k+1]`, so the +half wall's inner face is at `+half` while the
    // -half wall's inner face is at `-half + 1`. The interior of a half=7 room
    // is z ∈ [-6, 7], and its centre is +0.5, not 0 — which is exactly what
    // `cellToWorld` has always said.
    const B = 0.45;                       // a 0.4 body, plus a hair
    const hiZ = cz + info.half - B;
    const loZ = cz - info.half + 1 + B;
    const hiX = cx + info.half - B;
    const mid = 0.5;

    // Offset in the other axis so a sample never lands in a doorway.
    const off = Math.max(2, info.half - 3);
    const spots = [
        ['centre', cx + mid, cz + mid],
        ['at-S-wall', cx + off, hiZ],   // +z — between the lens and the hero
        ['at-N-wall', cx + off, loZ],   // -z — the wall you look at
        ['at-E-wall', hiX, cz + off],
        ['SE-corner', hiX, hiZ],
    ];

    for (const [name, px, pz] of spots) {
        const stat = await page.evaluate(async (x, z, rid) => {
            const s = window.__sovereignScar;
            // Re-enter first: a teleport that lands in a doorway trips the
            // transition, so every sample starts from a known room.
            s.game.level.enterRoom(rid, s.game);
            await new Promise((r) => setTimeout(r, 120));
            s.player.root.position.set(x, 1.95, z);
            // Let the rig lerp settle, then snap so the frame is not mid-ease.
            for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 30));
            s.cameraRig?.snapTo?.({ x: s.player.root.position.x, y: s.player.root.position.y, z: s.player.root.position.z });
            await new Promise((r) => setTimeout(r, 120));
            const cam = s.camera;
            // Where is the hero ON SCREEN? Project the head, in NDC. THREE is
            // not on the dev bridge, so it comes from the module cache — the
            // page already loaded it, so this is a lookup, not a second copy.
            const THREE = await import('/lib/three/three.module.min.js');
            const headY = s.player.root.position.y + 0.95;
            const head = new THREE.Vector3(x, headY, z);

            // IS THE HERO ACTUALLY VISIBLE? Cast the real ray, at the real
            // scene, rather than deciding from the picture. The first frame
            // this probe produced put the hero at screen (846, 495) and there
            // was no hero there — the south wall was in front of them. A
            // projected screen position says where they WOULD be drawn; it
            // says nothing about whether anything is drawn on top.
            const ray = new THREE.Raycaster();
            const from = cam.position.clone();
            const dir = head.clone().sub(from);
            const dist = dir.length();
            ray.set(from, dir.normalize());
            ray.far = dist - 0.05;   // stop just short of the hero themselves
            const blockers = [];
            s.scene.traverse((o) => {
                if (!o.isMesh || !o.visible || o.name === 'void-plane') return;
                // The hero's own body must not count as blocking the hero.
                let n = o, mine = false;
                while (n) { if (n === s.player.root) { mine = true; break; } n = n.parent; }
                if (!mine) blockers.push(o);
            });
            const hits = ray.intersectObjects(blockers, false);
            const blocked = hits.length > 0;
            const blockedAt = blocked ? hits[0].distance : null;
            // WHAT blocked, not just that something did — the first run said
            // the hero was hidden while standing at the NORTH wall, which is
            // behind them from the lens, so the answer had to be some other
            // object and the probe could not say which.
            const blockedBy = blocked
                ? { name: hits[0].object.name || hits[0].object.type,
                    at: { x: +hits[0].point.x.toFixed(1), y: +hits[0].point.y.toFixed(1), z: +hits[0].point.z.toFixed(1) } }
                : null;

            head.project(cam);
            const lum = await s.sampleLuminanceStats();
            return {
                ndcX: head.x, ndcY: head.y,
                cam: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
                mean: lum.mean, contrast: lum.contrast,
                blocked, blockedAt, blockedBy, dist,
                px: s.player.root.position.x, pz: s.player.root.position.z,
            };
        }, px, pz, info.room);
        const file = `${OUT}/${LEVEL}-${info.room}-${name}.png`;
        await page.screenshot({ path: file });
        const sx = ((stat.ndcX + 1) / 2 * 1280).toFixed(0);
        const sy = ((1 - stat.ndcY) / 2 * 720).toFixed(0);
        console.log(`  ${name.padEnd(12)} player at (${stat.px.toFixed(1)}, ${stat.pz.toFixed(1)})  ` +
            `screen ${String(sx).padStart(4)},${String(sy).padStart(3)}  ` +
            `cam y=${stat.cam.y.toFixed(1)} z=${stat.cam.z.toFixed(1)}  ` +
            `lum=${String(stat.mean.toFixed(0)).padStart(3)} ` +
            (stat.blocked
                ? `HIDDEN by ${stat.blockedBy.name} at (${stat.blockedBy.at.x}, ${stat.blockedBy.at.y}, ${stat.blockedBy.at.z})`
                : 'visible'));
    }
    console.log(`\nwrote ${spots.length} frames to ${OUT}/`);
} catch (e) {
    console.error('PROBE FAILED:', e.message);
} finally {
    if (browser) await browser.close();
    server.close?.();
    process.exit(0);
}
