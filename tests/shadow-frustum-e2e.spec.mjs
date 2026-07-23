// Browser E2E — every room of every beat is inside the key light's shadow
// frustum.
//
// This is the assertion that would have caught the bug. The key light's shadow
// camera is a ±30-unit box, and it was aimed at the world origin and never
// moved. Rooms live on a 64-unit grid (`ROOM_STRIDE` in world/room-graph.js),
// so exactly one room per dungeon — the one at grid (0,0) — was ever inside it.
// Measured against Beat 01 before the fix:
//
//     tomb           (0,    0)   LIT
//     corridor       (0,  -64)   NO SUN SHADOWS
//     predecessor    (0, -128)   NO SUN SHADOWS
//     secret       (-64, -128)   NO SUN SHADOWS
//     antechamber    (0, -192)   NO SUN SHADOWS
//     warden         (0, -256)   NO SUN SHADOWS
//
// Five of six. It survived for the life of the project because every dungeon
// STARTS at grid (0,0): the first room you ever see in any level is the one
// room that works, so nothing looked wrong until you walked somewhere.
//
// The sweep is the point — a spot check of one room would have passed against
// the broken build.

import { startServer, findChromeVerbose, sleep, disableGamepads } from './harness.mjs';
import { readFileSync } from 'node:fs';

export async function run(t) {
    // Guard the engine pin while we are here. `src/engine/lights.js` exports
    // `updateShadowFollow`, which looks exactly like the fix for this bug and
    // is not: it takes a single `cameraX` and pins the target's Z to zero, a
    // leftover from the engine's 2.5D side-scroller origins. This game is
    // top-down on a two-dimensional room grid, so wiring it up would fix the X
    // axis and silently break the Z one. Locked Decision D5 forbids editing
    // engine code, so it cannot be deleted — it can only be left unused.
    const gameSrc = ['index.js', 'fx/mood-controller.js', 'world/room-graph.js']
        .map((f) => readFileSync(new URL(`../src/game/${f}`, import.meta.url), 'utf8'))
        .join('\n');
    t.ok('game code does not use the engine\'s updateShadowFollow',
        !/updateShadowFollow/.test(gameSrc),
        'single-axis, pins target Z to 0 — it cannot aim at a room grid');

    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }
    let puppeteer;
    try {
        puppeteer = await import('puppeteer-core');
    } catch (e) {
        t.ok('puppeteer-core', false, String(e));
        return;
    }

    const server = await startServer(8792);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(60000);
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(300);

        const rows = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = false;
            s.menu.close();
            const out = [];

            for (const meta of s.LEVELS) {
                try {
                    s.loadLevel(meta.id);
                    s.game.bossIntro = null;
                    await new Promise((r) => setTimeout(r, 350));

                    const lvl = s.game.level;
                    const roomIds = lvl?.def?.rooms ? Object.keys(lvl.def.rooms) : [];
                    const rooms = [];
                    const aims = [];

                    if (!roomIds.length) {
                        // Overworld / sandbox: no room graph, so the aim falls
                        // back to the player. Still has to cover where they are.
                        await new Promise((r) => setTimeout(r, 200));
                        const p = s.player.root.position;
                        rooms.push({
                            id: '(no room graph)',
                            x: +p.x.toFixed(1), z: +p.z.toFixed(1),
                            covered: s.keyLightCovers(p.x, p.z),
                        });
                        aims.push(s.keyLightAim());
                    } else {
                        for (const roomId of roomIds) {
                            lvl.enterRoom(roomId, s.game);
                            // One frame for the aim to be applied.
                            await new Promise((r) => setTimeout(r, 90));
                            const o = lvl.currentRoomOrigin();
                            rooms.push({
                                id: roomId,
                                x: o.x, z: o.z,
                                covered: s.keyLightCovers(o.x, o.z),
                                // The room is 2*half across; its far corner must
                                // be covered too, or only the centre is lit.
                                cornerCovered: s.keyLightCovers(
                                    o.x + (lvl.def.rooms[roomId].half || 12) * 0.9,
                                    o.z + (lvl.def.rooms[roomId].half || 12) * 0.9
                                ),
                            });
                            aims.push(s.keyLightAim());
                        }
                    }
                    out.push({ id: meta.id, rooms, aims, err: null });
                } catch (e) {
                    out.push({ id: meta.id, err: String(e) });
                }
            }
            return out;
        });

        let totalRooms = 0, covered = 0;
        for (const r of rows) {
            if (r.err) {
                t.ok(`${r.id} swept`, false, r.err);
                continue;
            }
            const missed = r.rooms.filter((rm) => !rm.covered);
            const cornersMissed = r.rooms.filter((rm) => rm.cornerCovered === false);
            totalRooms += r.rooms.length;
            covered += r.rooms.length - missed.length;

            t.ok(`${r.id} every room is inside the shadow frustum`, missed.length === 0,
                `${r.rooms.length - missed.length}/${r.rooms.length}`
                + (missed.length ? ` missed: ${missed.map((m) => `${m.id}(${m.x},${m.z})`).join(' ')}` : ''));
            t.ok(`${r.id} room corners are covered too`, cornersMissed.length === 0,
                `${cornersMissed.length} rooms lit only at the centre`);

            // The sun must not have been RE-ANGLED per room. Moving the light
            // without its target would aim every room correctly and change the
            // direction the shadows fall in each one, which is worse than the
            // bug: it looks like the world is spinning around the player.
            const offsets = r.aims.filter(Boolean).map((a) => `${a.offset.x},${a.offset.y},${a.offset.z}`);
            const distinct = [...new Set(offsets)];
            t.ok(`${r.id} the sun keeps one direction across rooms`, distinct.length <= 1,
                `offsets seen: ${distinct.join(' | ')}`);
        }

        t.ok('campaign-wide shadow coverage', covered === totalRooms,
            `${covered}/${totalRooms} rooms — was 1 per dungeon before ticket 4`);
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
