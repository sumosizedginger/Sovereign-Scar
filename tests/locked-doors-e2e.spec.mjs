// Every locked and boss door in the campaign must be openable ON FOOT.
//
// Regression guard for a campaign-blocking bug: locked doors are filled by a
// solid `bakePlug` collider, but the unlock trigger sat 0.3 past the wall
// line — behind that solid matter. The plug stopped the player ~0.9 short, so
// the trigger could never fire, the key was never spent, and NO locked door in
// the game could be opened by walking into it. Every existing door test
// teleported or called enterRoom directly, so all of them passed.
//
// This walks the real physics body into each door, which is the only way to
// catch a trigger that geometry makes unreachable.

import { startServer, findChromeVerbose, disableGamepads, sleep } from './harness.mjs';

export async function run(t) {
    let puppeteer;
    try {
        puppeteer = await import('puppeteer-core');
    } catch (e) {
        t.ok('puppeteer-core', false, String(e));
        return;
    }
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }

    const server = await startServer(8795);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(90000);
        await page.setViewport({ width: 800, height: 600 });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));

        await page.goto(`${server.url}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.player),
            { timeout: 30000 }
        );
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(1000);

        const dungeons = await page.evaluate(
            () => window.__sovereignScar.LEVELS.map((l) => l.id).filter((id) => id !== 'overworld')
        );

        const unreachable = [];
        let walked = 0;

        for (const id of dungeons) {
            await page.evaluate((i) => window.__sovereignScar.loadLevel(i), id);
            await sleep(1300);
            const res = await page.evaluate(() => {
                const s = window.__sovereignScar;
                const lvl = s.game.level, p = s.player, game = s.game;
                if (!lvl.def || !lvl.def.rooms) return { doors: [] };
                const SIDE = {
                    N: { dx: 0, dz: -1 }, S: { dx: 0, dz: 1 },
                    W: { dx: -1, dz: 0 }, E: { dx: 1, dz: 0 },
                };
                const out = [];
                for (const [roomId, room] of Object.entries(lvl.def.rooms)) {
                    for (const door of room.doors || []) {
                        const type = door.type || 'open';
                        if (type !== 'locked' && type !== 'boss') continue;
                        const o = { x: room.grid[0] * 64, z: room.grid[1] * 64 };
                        const n = SIDE[door.side];
                        const at = door.at || 0;
                        let opened = false;
                        // Start close to the wall. This spec is about whether
                        // the unlock trigger can be reached from against the
                        // plug — not about pathing across the room. Terraces,
                        // magma vents and meltable ice walls all sit on door
                        // centre lines deeper in; a player walks around them,
                        // and simulating that here would mean widening offsets
                        // until the test went green, which proves nothing. A
                        // couple of small offsets cover clutter near the wall.
                        for (const off of [0, 1.5, -1.5]) {
                            lvl.enterRoom(roomId, game);
                            if (type === 'boss') lvl.keyStore.grantBossKey();
                            else lvl.keyStore.grantSmallKey();
                            const startRoom = lvl.currentRoomId();
                            const keysBefore = lvl.keyStore.smallKeys();
                            const inset = room.half - 2;
                            p.rig.position.set(
                                o.x + (n.dz !== 0 ? at + off : n.dx * inset),
                                1.95,
                                o.z + (n.dx !== 0 ? at + off : n.dz * inset)
                            );
                            p.physics.resetVelocity();
                            const step = () => {
                                lvl.update(0.05, game);
                                if (lvl.currentRoomId() !== startRoom) return true;
                                return type === 'locked'
                                    && lvl.keyStore.smallKeys() < keysBefore;
                            };
                            // Straight in…
                            for (let i = 0; i < 80 && !opened; i++) {
                                p.physics.update(game.collisionWorld, 0.05,
                                    { wishX: n.dx, wishZ: n.dz, speed: 5.5, half: 0.4 });
                                if (step()) opened = true;
                            }
                            // …then slide back onto the door's centre line.
                            for (let i = 0; i < 80 && !opened; i++) {
                                const tx = o.x + (n.dz !== 0 ? at : p.rig.position.x - o.x);
                                const tz = o.z + (n.dx !== 0 ? at : p.rig.position.z - o.z);
                                const dx = tx - p.rig.position.x, dz = tz - p.rig.position.z;
                                p.physics.update(game.collisionWorld, 0.05, {
                                    wishX: n.dx || (Math.abs(dx) > 0.1 ? Math.sign(dx) : 0),
                                    wishZ: n.dz || (Math.abs(dz) > 0.1 ? Math.sign(dz) : 0),
                                    speed: 5.5, half: 0.4,
                                });
                                if (step()) opened = true;
                            }
                            if (opened) break;
                        }
                        out.push({ room: roomId, to: door.to, side: door.side, type, opened });
                    }
                }
                return { doors: out };
            });
            for (const d of res.doors) {
                walked++;
                if (!d.opened) unreachable.push(`${id} ${d.room}->${d.to} (${d.side},${d.type})`);
            }
        }

        t.ok('the campaign has locked doors to walk into', walked > 40, `walked=${walked}`);
        t.ok('every locked/boss door can be opened on foot',
            unreachable.length === 0,
            unreachable.length ? unreachable.slice(0, 6).join(' | ') : `all ${walked} open`);
        t.ok('no fatal pageerrors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
        if (browser) await browser.close();
        await server.close();
    }
}
