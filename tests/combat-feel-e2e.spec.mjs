// End-to-end guards for the playtest fixes, driven through the real game
// loop in a browser: consistent camera scale, keyboard-only facing, enemy
// telegraphs, and heart recovery actually wired into the frame loop.
//
// The unit spec (tests/game/combat-feel.spec.mjs) proves the mechanics in
// isolation; this proves they are connected to the running game.

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
        page.setDefaultTimeout(60000);
        await page.setViewport({ width: 1280, height: 720 });
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
        await sleep(1200);

        // ── Camera scale is identical everywhere ─────────────────────────
        // Measured by unprojecting the frustum edges onto the floor plane —
        // the eyeball test on screenshots previously hid a 21% zoom change.
        const visibleWidth = async (levelId) => {
            await page.evaluate((id) => window.__sovereignScar.loadLevel(id), levelId);
            await sleep(900);
            return page.evaluate(() => {
                const s = window.__sovereignScar;
                const cam = s.game.camera;
                const py = s.player.root.position.y;
                const edge = (ndcx) => {
                    const v = cam.position.clone().set(ndcx, 0, 0.5).unproject(cam);
                    const dir = v.sub(cam.position).normalize();
                    const k = (py - cam.position.y) / dir.y;
                    return cam.position.clone().addScaledVector(dir, k);
                };
                return edge(-1).distanceTo(edge(1));
            });
        };
        const wOver = await visibleWidth('overworld');
        const wDun = await visibleWidth('beat-01-crypt');
        const wLate = await visibleWidth('beat-05-citadel');
        t.ok('dungeon does not zoom in relative to the overworld',
            Math.abs(wOver - wDun) < 0.5, `overworld=${wOver.toFixed(2)} dungeon=${wDun.toFixed(2)}`);
        t.ok('camera scale holds across dungeons of different room sizes',
            Math.abs(wDun - wLate) < 0.5, `crypt=${wDun.toFixed(2)} citadel=${wLate.toFixed(2)}`);

        // ── Facing is keyboard-driven, and the mouse cannot steer it ─────
        await page.evaluate(() => window.__sovereignScar.loadLevel('beat-01-crypt'));
        await sleep(900);
        await page.keyboard.down('KeyD');
        await sleep(500);
        await page.keyboard.up('KeyD');
        const facedRight = await page.evaluate(
            () => ({ ...window.__sovereignScar.player.state.facingVec })
        );
        t.ok('walking right faces right', facedRight.x > 0.9, JSON.stringify(facedRight));

        await page.keyboard.down('KeyW');
        await sleep(500);
        await page.keyboard.up('KeyW');
        const facedUp = await page.evaluate(
            () => ({ ...window.__sovereignScar.player.state.facingVec })
        );
        t.ok('walking up faces up', facedUp.z < -0.9, JSON.stringify(facedUp));

        // Sweep the cursor across the screen — facing must not follow it.
        await page.mouse.move(30, 690);
        await sleep(250);
        await page.mouse.move(1250, 40);
        await sleep(400);
        const afterMouse = await page.evaluate(
            () => ({ ...window.__sovereignScar.player.state.facingVec })
        );
        t.ok('the mouse cannot steer facing any more',
            afterMouse.z < -0.9, JSON.stringify(afterMouse));

        // ── Enemies telegraph instead of hitting on contact ──────────────
        const telegraph = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const p = s.player;
            const e = (s.game.level.enemies || [])[0];
            if (!e) return { skipped: true };
            p.health.hp = p.health.max;
            p.health.iFrames = 0;
            // Stand right on top of it and let the real loop run.
            p.rig.position.set(e.root.position.x + 1.0, p.rig.position.y, e.root.position.z);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return {
                skipped: false,
                windup: e._windupT,
                hasTell: !!e._tell,
                hp: p.health.hp,
                max: p.health.max,
            };
        });
        if (telegraph.skipped) {
            t.ok('enemy telegraph (skipped — no enemy in room)', true, 'no enemy');
        } else {
            t.ok('closing on an enemy does not damage you instantly',
                telegraph.hp === telegraph.max, JSON.stringify(telegraph));
            t.ok('the enemy winds up with a visible telegraph',
                telegraph.windup > 0 && telegraph.hasTell, JSON.stringify(telegraph));
        }

        // ── The windup can be escaped ────────────────────────────────────
        const dodged = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const p = s.player;
            const e = (s.game.level.enemies || [])[0];
            if (!e) return { skipped: true };
            p.health.hp = p.health.max;
            p.health.iFrames = 0;
            e.attackCd = 0;
            e._windupT = 0;
            e.update(0.05, p);          // commit a strike at the current spot
            const committed = e._windupT > 0;
            p.rig.position.x += 8;      // walk clear of the marked ground
            for (let i = 0; i < 40; i++) e.update(0.05, p);
            return { skipped: false, committed, hp: p.health.hp, max: p.health.max };
        });
        if (!dodged.skipped) {
            t.ok('a committed strike can be walked out of',
                dodged.committed && dodged.hp === dodged.max, JSON.stringify(dodged));
        }

        // ── Heart recovery is wired into the frame loop ──────────────────
        const healed = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const p = s.player;
            p.health.hp = 2;
            const before = p.health.hp;
            const pos = p.root.position;
            s.heartDrops.spawn(pos.x, pos.y, pos.z);
            const spawned = s.heartDrops.drops.length;
            // Let the real main loop pick it up.
            for (let i = 0; i < 8; i++) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            return { before, after: p.health.hp, spawned, left: s.heartDrops.drops.length };
        });
        t.ok('a heart spawns into the live level', healed.spawned === 1, JSON.stringify(healed));
        t.ok('walking over a heart restores HP in the running game',
            healed.after > healed.before, JSON.stringify(healed));
        t.ok('the collected heart is removed', healed.left === 0, JSON.stringify(healed));

        // ── Killing an enemy rolls a drop exactly once ───────────────────
        const rolled = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const e = (s.game.level.enemies || [])[0];
            if (!e) return { skipped: true };
            s.player.health.hp = 1; // hurt player → generous drop odds
            e.state.current = 'DEAD';
            for (let i = 0; i < 10; i++) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            return { skipped: false, rolled: e._heartRolled === true };
        });
        if (!rolled.skipped) {
            t.ok('the main loop rolls a heart drop for a slain enemy',
                rolled.rolled === true, JSON.stringify(rolled));
        }

        // ── A boss phase change hands you a heart ────────────────────────
        const bossHeart = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const lvl = s.game.level;
            if (!lvl.enterRoom || !lvl.boss) return { skipped: true };
            lvl.enterRoom('warden', s.game);
            const b = lvl.boss;
            s.game.activeBoss = b;
            s.heartDrops.clear();
            await new Promise((r) => requestAnimationFrame(r));
            const before = s.heartDrops.drops.length;
            b.phase = (b.phase || 1) + 1; // drive it into the next phase
            for (let i = 0; i < 6; i++) {
                await new Promise((r) => requestAnimationFrame(r));
            }
            return { skipped: false, before, after: s.heartDrops.drops.length };
        });
        if (!bossHeart.skipped) {
            t.ok('a boss phase change drops a heart',
                bossHeart.after > bossHeart.before, JSON.stringify(bossHeart));
        }

        t.ok('no fatal pageerrors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
        if (browser) await browser.close();
        await server.close();
    }
}
