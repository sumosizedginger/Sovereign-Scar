// Final recheck #4: units already separate; this is live browser evidence.
// Spawn/ground all levels, beat-09 soak, combat, boss single-step.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    createSink, startServer, findChromeVerbose, sleep, summarize,
} from '../harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');

function filterErrors(errors) {
    return errors.filter((e) => !/AudioContext|autoplay|favicon|AbortError/i.test(e));
}

export async function run(t) {
    fs.mkdirSync(OUT, { recursive: true });
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome', false, 'missing');
        return;
    }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8820);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push('console: ' + msg.text());
        });

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(3500);
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.player),
            { timeout: 25000 },
        );
        await page.mouse.click(640, 360);
        await sleep(500);

        // ── Boot grounded ─────────────────────────────────────────────────
        await sleep(900);
        const boot = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            return {
                id: s.game.levelId,
                y: +p.root.position.y.toFixed(3),
                g: p.physics.grounded,
                solid: !!s.game.level.getVoxelAt(p.spawnPoint.x, 0.1, p.spawnPoint.z),
                hp: p.health.hp,
                levels: s.LEVELS.length,
            };
        });
        t.ok('boot grounded solid', boot.g && boot.solid && boot.y > 0.5, JSON.stringify(boot));
        t.ok('15 levels', boot.levels === 15);

        // ── All levels ────────────────────────────────────────────────────
        const ids = await page.evaluate(() => window.__sovereignScar.LEVELS.map((l) => l.id));
        const rows = [];
        for (const id of ids) {
            errors.length = 0;
            await page.evaluate((levelId) => window.__sovereignScar.loadLevel(levelId), id);
            await sleep(id === 'beat-04-sky' ? 2000 : 900);
            const r = await page.evaluate(() => {
                const s = window.__sovereignScar;
                const p = s.player;
                const sp = p.spawnPoint;
                const g = s.game.level.getVoxelAt;
                const managed = (s.game.level.enemies || [])
                    .filter((e) => e.managedBySystem)
                    .map((e) => e.kind || 'bossish');
                return {
                    id: s.game.levelId,
                    y: +p.root.position.y.toFixed(3),
                    g: p.physics.grounded,
                    vy: +p.physics.vy.toFixed(2),
                    solid: !!g(sp.x, 0.1, sp.z),
                    feet: !!g(p.root.position.x, p.root.position.y - p.physics.extents.y - 0.05, p.root.position.z),
                    hp: p.health.hp,
                    dead: p.health.dead,
                    enemies: s.game.level?.enemies?.length || 0,
                    managed,
                };
            });
            const fatal = filterErrors(errors);
            r.err = fatal.length;
            r.errSample = fatal.slice(0, 2);
            rows.push(r);
            t.ok(`${id}: solid+grounded+alive`,
                r.solid && r.g && r.y > 0.4 && r.y < 12 && !r.dead && r.hp > 0,
                JSON.stringify(r));
            t.ok(`${id}: no errors`, fatal.length === 0, fatal.join(' | '));
        }
        const bad = rows.filter((r) => !r.solid || !r.g || r.err > 0 || r.y < 0.4);
        t.ok('ALL levels OK', bad.length === 0,
            bad.map((b) => `${b.id} g=${b.g} s=${b.solid} e=${b.err}`).join('; '));

        // ── beat-09 soak + double-update check ────────────────────────────
        errors.length = 0;
        await page.evaluate(() => window.__sovereignScar.loadLevel('beat-09-town'));
        await sleep(400);
        const p9meta = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const ph = (s.game.level.enemies || []).find((e) => e.managedBySystem);
            return {
                managed: !!ph?.managedBySystem,
                canHit0: ph?.canHit,
                enemyCount: s.game.level.enemies?.length,
            };
        });
        t.ok('beat-09: phantasm managedBySystem', p9meta.managed, JSON.stringify(p9meta));

        // Sample canHit over ~6s wall time (phase period 2.5s) — should toggle once
        const phaseSamples = [];
        for (let i = 0; i < 12; i++) {
            await sleep(500);
            phaseSamples.push(await page.evaluate(() => {
                const ph = (window.__sovereignScar.game.level.enemies || [])
                    .find((e) => e.managedBySystem);
                return {
                    canHit: ph?.canHit,
                    hitR: ph?.hitRadius,
                    y: ph ? +ph.root.position.y.toFixed(3) : null,
                    g: window.__sovereignScar.player.physics.grounded,
                    py: +window.__sovereignScar.player.root.position.y.toFixed(3),
                };
            }));
        }
        const soakFatal = filterErrors(errors);
        const canHitVals = [...new Set(phaseSamples.map((s) => s.canHit))];
        t.ok('beat-09: soak 6s zero errors', soakFatal.length === 0, soakFatal.slice(0, 3).join(' | '));
        t.ok('beat-09: player stayed grounded', phaseSamples.every((s) => s.g && s.py > 0.5),
            JSON.stringify(phaseSamples.slice(-1)));
        t.ok('beat-09: canHit phases both true and false (single-step dt)',
            canHitVals.includes(true) && canHitVals.includes(false),
            `vals=${JSON.stringify(canHitVals)} samples=${JSON.stringify(phaseSamples.map((s) => s.canHit))}`);

        // ── Combat ────────────────────────────────────────────────────────
        await page.evaluate(() => window.__sovereignScar.loadLevel('sandbox-combat'));
        await sleep(700);
        const before = await page.evaluate(() => {
            const p = window.__sovereignScar.player.root.position;
            return { x: p.x, z: p.z, y: p.y, g: window.__sovereignScar.player.physics.grounded };
        });
        await page.keyboard.down('KeyW');
        await sleep(400);
        await page.keyboard.up('KeyW');
        await sleep(100);
        const afterMove = await page.evaluate(() => {
            const p = window.__sovereignScar.player.root.position;
            return { x: p.x, z: p.z, y: p.y, g: window.__sovereignScar.player.physics.grounded };
        });
        t.ok('move grounded', afterMove.g && Math.hypot(afterMove.x - before.x, afterMove.z - before.z) > 0.15,
            JSON.stringify({ before, afterMove }));

        const combat = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            const e = (s.game.level.enemies || []).find((x) => x.hp > 0 && x.state?.current !== 'DEAD');
            if (!e) return { ok: false };
            const hp0 = e.hp;
            p.root.position.set(e.root.position.x, p.root.position.y, e.root.position.z + 1.1);
            p.physics.grounded = true;
            p.physics.vy = 0;
            p.attackCd = 0;
            p.state.setFacing(0, -1);
            p.tryAttack(s.game.level.enemies, s.game.level.destructibles || []);
            return { ok: true, hp0, hp1: e.hp, y: p.root.position.y, g: p.physics.grounded };
        });
        t.ok('combat damages enemy', combat.ok && combat.hp1 < combat.hp0, JSON.stringify(combat));

        // Keyboard attack path
        await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            const e = (s.game.level.enemies || []).find((x) => x.hp > 0 && x.state?.current !== 'DEAD');
            if (!e) return;
            p.root.position.set(e.root.position.x, 1.95, e.root.position.z + 1.15);
            p.physics.grounded = true;
            p.physics.vy = 0;
            p.attackCd = 0;
            p.state.setFacing(0, -1);
            window.__qaE = e;
            window.__qaHp = e.hp;
        });
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Space');
            await sleep(200);
        }
        const combat2 = await page.evaluate(() => ({
            hp0: window.__qaHp,
            hp1: window.__qaE?.hp,
            cd: window.__sovereignScar.player.attackCd,
        }));
        t.ok('Space attack reduces HP', combat2.hp1 < combat2.hp0, JSON.stringify(combat2));

        // Mood / pause / save
        await page.keyboard.press('KeyM');
        await sleep(150);
        const mood = await page.evaluate(() => window.__sovereignScar.mood.mood);
        t.ok('mood', mood === 'abyss' || mood === 'crust', mood);
        await page.keyboard.press('KeyP');
        await sleep(100);
        let paused = await page.evaluate(() => window.__sovereignScar.game.paused);
        t.ok('pause', paused === true);
        await page.keyboard.press('KeyP');
        await sleep(100);
        paused = await page.evaluate(() => window.__sovereignScar.game.paused);
        t.ok('unpause', paused === false);
        const save = await page.evaluate(() => window.__sovereignScar.save());
        t.ok('save', !!save?.currentBeat, JSON.stringify(save?.currentBeat));

        // Death/respawn (ensure unpaused)
        await page.evaluate(() => {
            window.__sovereignScar.game.paused = false;
            const p = window.__sovereignScar.player;
            p.health.iFrames = 0;
            p.health.damage(99);
        });
        await sleep(2500);
        const resp = await page.evaluate(() => {
            const p = window.__sovereignScar.player;
            return { dead: p.health.dead, hp: p.health.hp, g: p.physics.grounded, y: +p.root.position.y.toFixed(3) };
        });
        t.ok('respawn alive grounded', !resp.dead && resp.hp > 0 && resp.g && resp.y > 0.5,
            JSON.stringify(resp));

        // Full cycle no errors
        errors.length = 0;
        for (const id of ids) {
            await page.evaluate((levelId) => window.__sovereignScar.loadLevel(levelId), id);
            await sleep(id === 'beat-04-sky' ? 1200 : 350);
            await page.keyboard.press('Space');
        }
        const cycleFatal = filterErrors(errors);
        t.ok('full cycle zero fatal errors', cycleFatal.length === 0, cycleFatal.slice(0, 5).join(' | '));

        fs.writeFileSync(path.join(OUT, 'recheck4.json'), JSON.stringify({
            boot, rows, p9meta, phaseSamples, combat, combat2, resp,
        }, null, 2));
        await page.screenshot({ path: path.join(OUT, 'recheck4.png') });
    } catch (e) {
        t.ok('recheck4 completed', false, String(e && e.stack || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        await server.close();
    }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('recheck4-final.mjs')) {
    const t = createSink('recheck4');
    await run(t);
    process.exit(summarize([t]) ? 1 : 0);
}
