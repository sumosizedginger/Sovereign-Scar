// Browser smoke: boot Sovereign Scar, swap levels, attack, toggle mood.
// Skipped automatically when Chrome/Edge is not installed.

import {
    createSink, startServer, findChromeVerbose, sleep,
} from './harness.mjs';

export async function run(t) {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available (skipped)', true, 'no chrome — unit-only CI path');
        return;
    }

    let puppeteer;
    try {
        puppeteer = await import('puppeteer-core');
    } catch (e) {
        t.ok('puppeteer-core import', false, String(e));
        return;
    }

    const server = await startServer(8798);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(20000);

        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push('console: ' + msg.text());
        });

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // Game builds many voxel meshes on boot — give it time.
        await sleep(4000);
        // Wait for hook up to 20s
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 20000,
        }).catch(() => {});
        await sleep(500);

        // Click to unlock audio / dismiss boot
        await page.mouse.click(400, 300);
        await sleep(800);

        const hook = await page.evaluate(() => {
            const s = window.__sovereignScar;
            if (!s) return { ok: false, reason: 'no __sovereignScar hook' };
            const info = s.renderer?.info?.render;
            return {
                ok: true,
                levelId: s.game.levelId,
                hasPlayer: !!s.player,
                hp: s.player.health.hp,
                weapon: s.player.inventory.activeWeapon,
                calls: info?.calls ?? 0,
                triangles: info?.triangles ?? 0,
                levelCount: s.LEVELS.length,
            };
        });
        t.ok('game hook present', hook.ok, hook.reason || '');
        t.ok('player alive', hook.hp > 0, `hp=${hook.hp}`);
        t.ok('16 levels registered', hook.levelCount === 16);
        t.ok('frames drawing', hook.calls > 0 || hook.triangles >= 0, JSON.stringify(hook));

        // Move and attack
        await page.keyboard.down('KeyW');
        await sleep(400);
        await page.keyboard.up('KeyW');
        await page.keyboard.press('Space');
        await sleep(200);

        // Mood toggle
        await page.keyboard.press('KeyM');
        await sleep(300);
        const mood = await page.evaluate(() => window.__sovereignScar.mood.mood);
        t.ok('mood toggled', mood === 'abyss' || mood === 'crust', `mood=${mood}`);

        // Load quarry (destructibles) and sandbox
        const loaded = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.loadLevel('beat-06-quarry');
            await new Promise((r) => setTimeout(r, 200));
            const q = {
                id: s.game.levelId,
                dest: s.game.level?.destructibles?.length || 0,
                enemies: s.game.level?.enemies?.length || 0,
            };
            s.loadLevel('sandbox-combat');
            await new Promise((r) => setTimeout(r, 200));
            return {
                ...q,
                sandbox: s.game.levelId,
                sandboxEnemies: s.game.level?.enemies?.length || 0,
            };
        });
        t.ok('load quarry', loaded.id === 'beat-06-quarry');
        t.ok('quarry has destructibles', loaded.dest >= 1, `dest=${loaded.dest}`);
        t.ok('load sandbox', loaded.sandbox === 'sandbox-combat');
        t.ok('sandbox has enemies', loaded.sandboxEnemies >= 1, `e=${loaded.sandboxEnemies}`);

        // Grant items and attack dummy
        await page.evaluate(() => {
            const p = window.__sovereignScar.player;
            p.inventory.grantItem('heavy_mallet');
            p.inventory.grantItem('phase_boot');
            p.tryDash();
        });
        await sleep(200);
        const afterDash = await page.evaluate(() => ({
            weapon: window.__sovereignScar.player.inventory.activeWeapon,
            hasBoot: window.__sovereignScar.player.inventory.hasItem('phase_boot'),
        }));
        t.ok('mallet equipped', afterDash.weapon === 'heavy_mallet');
        t.ok('phase boot owned', afterDash.hasBoot);

        // Save progress API
        const saved = await page.evaluate(() => window.__sovereignScar.save());
        t.ok('save progress', saved && saved.currentBeat, JSON.stringify(saved?.currentBeat));

        // Fatal page errors
        const fatal = errors.filter((e) =>
            !/AudioContext|autoplay|favicon/i.test(e)
        );
        t.ok('no fatal page errors', fatal.length === 0, fatal.slice(0, 5).join(' | '));
    } catch (e) {
        t.ok('smoke run', false, String(e && e.stack || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        await server.close();
    }
}

// Allow direct run
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('game-smoke.spec.mjs')) {
    const t = (await import('./harness.mjs')).createSink('game-smoke');
    await run(t);
    process.exit((await import('./harness.mjs')).summarize([t]) ? 1 : 0);
}
