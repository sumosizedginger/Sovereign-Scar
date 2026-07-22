import { startServer, findChromeVerbose, disableGamepads, sleep } from './harness.mjs';

export async function run(t) {
    let puppeteer;
    try {
        puppeteer = await import('puppeteer-core');
    } catch (error) {
        t.ok('puppeteer-core available', false, String(error));
        return;
    }
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('Chrome available (skipped)', true, 'no Chrome');
        return;
    }

    const server = await startServer(8796);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        await page.setViewport({ width: 1280, height: 720 });
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error.message || error)));
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!window.__sovereignScar, { timeout: 30000 });

        await page.mouse.click(400, 300);
        await sleep(100);
        const modeText = await page.$eval('#ss-menu', (el) => el.textContent);
        t.ok('new campaign presents all four modes',
            ['Easy', 'Medium', 'Hard', 'Survival'].every((name) => modeText.includes(name)), modeText);
        t.ok('mode screen states the one-life contract', modeText.includes('one life') || modeText.includes('One life'), modeText);

        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(500);

        const living = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.progress();
            return {
                mode: p.runMode,
                charges: p.lives?.charges,
                status: p.runStatus,
                hud: document.querySelector('#ss-hud')?.textContent || '',
            };
        });
        t.ok('Survival begins with one living charge',
            living.mode === 'survival' && living.charges === 1 && living.status === 'living', JSON.stringify(living));
        t.ok('HUD exposes mode and active Thread',
            living.hud.includes('SURVIVAL') && living.hud.includes('Thread:'), living.hud);

        await page.keyboard.press('Tab');
        await sleep(100);
        const recall = await page.$eval('#ss-map', (el) => el.textContent);
        t.ok('map keeps the objective recoverable through Recall', recall.includes('RECALL:'), recall);
        await page.keyboard.press('Tab');
        await sleep(100);

        await page.evaluate(() => window.__sovereignScar.player.health.kill());
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const sealed = await page.evaluate(() => {
            const p = window.__sovereignScar.progress();
            return {
                status: p.runStatus,
                lives: p.lives,
                finalScore: p.finalScore,
                scores: window.vsbeuSettings.getScores({ runMode: 'survival', scoreVersion: 1 }),
                deathText: document.querySelector('#ss-hud')?.textContent || '',
            };
        });
        t.ok('Survival death seals before its presentation completes',
            sealed.status === 'dead' && sealed.lives?.status === 'dead' && sealed.lives?.charges === 0,
            JSON.stringify(sealed));
        t.ok('Survival death persists final score exactly once',
            !!sealed.finalScore && sealed.scores.length === 1, JSON.stringify(sealed));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__sovereignScar, { timeout: 30000 });
        const reopened = await page.evaluate(() => {
            const p = window.__sovereignScar.progress();
            const text = document.querySelector('#ss-menu')?.textContent || '';
            return {
                status: p.runStatus,
                scores: window.vsbeuSettings.getScores({ runMode: 'survival', scoreVersion: 1 }).length,
                title: text,
            };
        });
        t.ok('reloading cannot resurrect a sealed Survival run',
            reopened.status === 'dead' && reopened.scores === 1
            && reopened.title.includes('SURVIVAL SEALED'), JSON.stringify(reopened));

        // ── Medium expedition break: the fifth death ends the expedition and
        // reloading the SAME dungeon starts a fresh one at full charges
        // (spec 4.4/12.3 — replenishment after a real break) ──
        await page.evaluate(() => window.localStorage.clear());
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__sovereignScar?.player, { timeout: 30000 });
        await page.mouse.click(400, 300);
        await sleep(150);
        await page.keyboard.press('ArrowDown'); // Easy → Medium
        await page.keyboard.press('Enter');
        await sleep(500);

        const kill = async () => {
            await page.evaluate(() => {
                const s = window.__sovereignScar;
                s.game.atTitle = false; s.game.paused = false; s.menu.close();
                s.player.health.kill();
            });
            // The death card resolves after 1.4s of accumulated raw dt, which
            // under swiftshader can be much longer than 1.4s of wall time —
            // wait for the actual respawn (hp restored) instead of sleeping.
            await page.waitForFunction(
                () => window.__sovereignScar.player.health.hp > 0,
                { timeout: 30000, polling: 200 },
            );
            await sleep(300);
        };

        await page.evaluate(() => {
            const s = window.__sovereignScar;
            s.game.atTitle = false; s.game.paused = false; s.menu.close();
            s.loadLevel('beat-02-spindle');
            s.game.bossIntro = null;
        });
        await sleep(400);
        const mediumStart = await page.evaluate(() => window.__sovereignScar.progress().lives);
        t.ok('Medium expedition opens at five charges',
            mediumStart.charges === 5 && mediumStart.expeditionId === 'beat-02-spindle',
            JSON.stringify(mediumStart));

        for (let i = 0; i < 4; i++) await kill();
        const afterFour = await page.evaluate(() => window.__sovereignScar.progress().lives);
        t.ok('four Medium deaths leave one charge', afterFour.charges === 1,
            JSON.stringify(afterFour));

        await kill(); // fifth death → expedition break → reload same dungeon
        await sleep(1200);
        const afterBreak = await page.evaluate(() => {
            const s = window.__sovereignScar;
            return { lives: s.progress().lives, levelId: s.game.levelId };
        });
        t.ok('expedition break reloads the dungeon with a FRESH five-charge expedition',
            afterBreak.levelId === 'beat-02-spindle'
            && afterBreak.lives.charges === 5
            && afterBreak.lives.expeditionId === 'beat-02-spindle',
            JSON.stringify(afterBreak));

        // ── Hard Death Echo: every death destroys the previous Echo, even a
        // shardless one (spec 6.5) ──
        await page.evaluate(() => window.localStorage.clear());
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__sovereignScar?.player, { timeout: 30000 });
        await page.mouse.click(400, 300);
        await sleep(150);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown'); // Easy → Medium → Hard
        await page.keyboard.press('Enter');
        await sleep(500);
        await page.evaluate(() => {
            const s = window.__sovereignScar;
            s.game.atTitle = false; s.game.paused = false; s.menu.close();
            s.loadLevel('beat-02-spindle');
            s.game.bossIntro = null;
            s.player.inventory.addShards(100);
            // Die away from the room's respawn point — respawning onto the
            // Echo would legitimately collect it before we can assert on it.
            s.player.rig.position.set(4, 1.95, -2);
        });
        await sleep(400);
        await kill();
        const echoAfterRich = await page.evaluate(() => window.__sovereignScar.progress().deathEcho);
        t.ok('Hard death with shards leaves a Death Echo',
            !!echoAfterRich && echoAfterRich.amount === 20, JSON.stringify(echoAfterRich));
        await page.evaluate(() => { window.__sovereignScar.player.inventory.scarShards = 0; });
        await kill();
        const echoAfterPoor = await page.evaluate(() => window.__sovereignScar.progress().deathEcho);
        t.ok('a shardless Hard death still destroys the previous Echo',
            echoAfterPoor == null, JSON.stringify(echoAfterPoor));

        // ── §7 acquisition chains: Resonance Fork (frequency → dig → relay)
        // and Entropy Dust (spore → deliver → return after one wound) ──
        await page.evaluate(() => window.localStorage.clear());
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__sovereignScar?.player, { timeout: 30000 });
        await page.mouse.click(400, 300);
        await sleep(150);
        await page.keyboard.press('ArrowDown'); // Medium
        await page.keyboard.press('Enter');
        await sleep(500);

        const chains = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const out = {};
            s.game.atTitle = false; s.game.paused = true; s.menu.close();
            s.loadLevel('overworld');
            await new Promise((r) => setTimeout(r, 200));
            const level = s.game.level;
            const inv = s.player.inventory;
            const tick = (n) => { for (let i = 0; i < n; i++) level.update(0.05, s.game); };
            const interactAt = (roomId, ox, oz) => {
                level.enterRoom(roomId, s.game);
                const room = level.def.rooms[roomId];
                const origin = { x: room.grid[0] * 64, z: room.grid[1] * 64 };
                s.player.rig.position.set(origin.x + ox, 1.95, origin.z + oz);
                tick(2);
                s.game.input._interactPressed = true;
                tick(2);
            };

            // Relay before the Fork is dug up must NOT grant anything.
            inv.setFlag('chain:fork:frequency');
            interactAt('r4c4', -8, 8);
            out.relayRefusesEarly = !inv.hasItem('resonance_fork');

            // Dig site: recover the dormant Fork.
            interactAt('r4c2', 10, -6);
            out.dugUp = inv.getFlag('chain:fork:dormant');

            // Relay now activates it; Altar Travel gates on this item.
            interactAt('r4c4', -8, 8);
            out.forkActive = inv.hasItem('resonance_fork');

            // Dust: spore → deliver at the camp → refuses early → refined
            // after one more sealed wound.
            inv.setFlag('chain:dust:spore');
            interactAt('r6c1', 8, 6);
            out.delivered = inv.getFlag('chain:dust:delivered');
            interactAt('r6c1', 8, 6);
            out.refusesBeforeBoss = !inv.hasItem('entropy_dust');
            s.game.recordBoss('test-wound');
            interactAt('r6c1', 8, 6);
            out.dustGranted = inv.hasItem('entropy_dust');
            out.dustCharges = inv.consumables?.entropyCharges || 0;
            return out;
        });
        t.ok('relay refuses activation before the Fork is recovered',
            chains.relayRefusesEarly, JSON.stringify(chains));
        t.ok('dig site yields the dormant Resonance Fork', chains.dugUp, JSON.stringify(chains));
        t.ok('weather relay activates the Resonance Fork', chains.forkActive, JSON.stringify(chains));
        t.ok('engineer camp accepts the unstable spore', chains.delivered, JSON.stringify(chains));
        t.ok('refined Dust is withheld until another wound seals',
            chains.refusesBeforeBoss, JSON.stringify(chains));
        t.ok('returning after a sealed wound grants Entropy Dust with charges',
            chains.dustGranted && chains.dustCharges === 3, JSON.stringify(chains));

        t.ok('narrative systems produce no fatal page errors', errors.length === 0, errors.join(' | '));
    } finally {
        if (browser) await browser.close();
        await server.close();
    }
}
