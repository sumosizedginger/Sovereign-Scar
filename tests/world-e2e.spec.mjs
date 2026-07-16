// Browser E2E (Phase W): room-graph dungeon — door transitions, camera
// room-lock bounds, locked doors + keys. Drives the dev test dungeon by
// ticking level.update deterministically (headless swiftshader is too slow
// for realtime input), same pattern as boss-e2e.

import { startServer, findChromeVerbose, sleep } from './harness.mjs';

export async function run(t) {
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
        page.setDefaultTimeout(60000);
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        await page.mouse.click(400, 300);
        await sleep(200);

        const res = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const out = {};
            s.game.atTitle = false;
            s.game.paused = true; // freeze the live loop; we tick manually
            s.menu.close();
            s.game.paused = true;
            s.loadLevel('w-test-dungeon');
            await new Promise((r) => setTimeout(r, 150));
            const level = s.game.level;
            const player = s.player;
            const tick = (n) => { for (let i = 0; i < n; i++) level.update(0.05, s.game); };

            out.boot = {
                room: level.currentRoomId(),
                baked: level.bakedRooms(),
                boundsOk: !!level.cameraBounds && level.cameraBounds.maxX > level.cameraBounds.minX,
                enemies: level.enemies.length,
                spawn: { x: +player.root.position.x.toFixed(1), z: +player.root.position.z.toFixed(1) },
            };

            // 1) Open door N: stand at the threshold, tick → SLIDING → hall
            player.rig.position.set(0, 1.95, -7.4);
            tick(1);
            out.sliding = level.isTransitioning();
            tick(10); // 0.5 s > 0.35 s transition
            out.afterN = {
                room: level.currentRoomId(),
                enemies: level.enemies.length,
                boundsMinZ: level.cameraBounds.minZ,
                pz: +player.root.position.z.toFixed(1),
            };

            // 2) Locked door W without key: bounce, stay in hall
            player.rig.position.set(-9.4, 1.95, -64);
            tick(1);
            out.lockBounce = {
                room: level.currentRoomId(),
                px: +player.root.position.x.toFixed(1),
            };

            // 3) Key pickup in hall
            player.rig.position.set(4, 1.95, -64);
            tick(1);
            out.keysAfterPickup = level.keyStore.smallKeys();

            // 4) Key opens the door; walking through lands in the vault
            player.rig.position.set(-9.4, 1.95, -64);
            tick(1); // consumes key, removes plug
            out.keysAfterOpen = level.keyStore.smallKeys();
            tick(1); // still in the trigger zone → transition starts
            tick(10);
            out.afterW = { room: level.currentRoomId(), baked: level.bakedRooms() };

            // 5) Round-trip: opened door stays open from the vault side
            player.rig.position.set(-57.6, 1.95, -64);
            tick(1);
            tick(10);
            out.roundTrip = { room: level.currentRoomId() };

            s.game.paused = false;
            return out;
        });

        t.ok('dungeon starts in entry', res.boot.room === 'entry', JSON.stringify(res.boot));
        t.ok('only entry baked at start', res.boot.baked.length === 1, res.boot.baked.join(','));
        t.ok('camera bounds set', res.boot.boundsOk);
        t.ok('entry enemy spawned', res.boot.enemies === 1, `e=${res.boot.enemies}`);
        t.ok('spawn in entry room', Math.abs(res.boot.spawn.z - 5) < 1, JSON.stringify(res.boot.spawn));

        t.ok('door trigger starts SLIDING', res.sliding === true);
        t.ok('transition lands in hall', res.afterN.room === 'hall', res.afterN.room);
        t.ok('hall enemy joined combat list', res.afterN.enemies >= 2, `e=${res.afterN.enemies}`);
        t.ok('camera bounds moved to hall', res.afterN.boundsMinZ < -40, `minZ=${res.afterN.boundsMinZ}`);
        t.ok('player crossed the stride', res.afterN.pz < -40, `z=${res.afterN.pz}`);

        t.ok('locked door bounces without key', res.lockBounce.room === 'hall', res.lockBounce.room);
        t.ok('bounce pushed player off the door', res.lockBounce.px > -9.0, `x=${res.lockBounce.px}`);

        t.ok('small key picked up', res.keysAfterPickup === 1, `keys=${res.keysAfterPickup}`);
        t.ok('key consumed on open', res.keysAfterOpen === 0, `keys=${res.keysAfterOpen}`);
        t.ok('unlocked door leads to vault', res.afterW.room === 'vault', res.afterW.room);
        t.ok('far room disposed (≤2 baked)', res.afterW.baked.length <= 2, res.afterW.baked.join(','));
        t.ok('opened door stays open (round-trip)', res.roundTrip.room === 'hall', res.roundTrip.room);

        t.ok('no fatal pageerrors', errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 5).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
