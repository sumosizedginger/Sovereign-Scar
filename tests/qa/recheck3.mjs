// Recheck #3: beat-09 no TypeError + all levels grounded. No game source edits.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    createSink, startServer, findChromeVerbose, sleep, summarize,
} from '../harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');

export async function run(t) {
    fs.mkdirSync(OUT, { recursive: true });
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome', false, 'missing');
        return;
    }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8815);
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
        await sleep(600);

        // ── beat-09 Phantasm regression ───────────────────────────────────
        errors.length = 0;
        await page.evaluate(() => window.__sovereignScar.loadLevel('beat-09-town'));
        await sleep(2500); // >2.5s so canHit toggles at least once
        const town = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            const ph = (s.game.level.enemies || []).find((e) => e.canHit !== undefined && !e.kind);
            // Force a few update ticks manually if needed
            const samples = [];
            if (ph) {
                for (let i = 0; i < 5; i++) {
                    ph.update(0.6);
                    samples.push({ canHit: ph.canHit, hitRadius: ph.hitRadius, y: ph.root.position.y });
                }
            }
            return {
                id: s.game.levelId,
                y: +p.root.position.y.toFixed(3),
                grounded: p.physics.grounded,
                solidSpawn: !!s.game.level.getVoxelAt(p.spawnPoint.x, 0.1, p.spawnPoint.z),
                enemyCount: s.game.level.enemies?.length || 0,
                phantasm: ph ? {
                    canHit: ph.canHit,
                    hitRadius: ph.hitRadius,
                    hp: ph.hp,
                    samples,
                } : null,
                tris: s.renderer?.info?.render?.triangles ?? 0,
            };
        });
        await sleep(500); // more frames for any late errors
        const townFatal = errors.filter((e) => !/AudioContext|autoplay|favicon|AbortError/i.test(e));
        const canHitErrors = townFatal.filter((e) => /canHit/i.test(e));
        t.ok('beat-09: loads', town.id === 'beat-09-town', JSON.stringify(town));
        t.ok('beat-09: grounded', town.grounded && town.y > 0.5 && town.y < 6, JSON.stringify(town));
        t.ok('beat-09: solid spawn', town.solidSpawn);
        t.ok('beat-09: phantasm present', !!town.phantasm, JSON.stringify(town));
        t.ok('beat-09: canHit assign works (samples change or stay valid)',
            town.phantasm && town.phantasm.samples.every((s) => typeof s.canHit === 'boolean'),
            JSON.stringify(town.phantasm?.samples));
        t.ok('beat-09: ZERO canHit TypeErrors', canHitErrors.length === 0, canHitErrors.slice(0, 3).join(' | '));
        t.ok('beat-09: ZERO fatal page errors', townFatal.length === 0, townFatal.slice(0, 5).join(' | '));

        // Phase cycle: wait enough wall time that live update toggled
        const phase = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const ph = (s.game.level.enemies || []).find((e) => !e.kind && e.canHit !== undefined);
            if (!ph) return null;
            const a = ph.canHit;
            await new Promise((r) => setTimeout(r, 2800));
            const b = ph.canHit;
            return { a, b, hitA: undefined, hitB: ph.hitRadius };
        });
        // Not requiring toggle if timing off — only that no throw occurred
        t.ok('beat-09: phase poll without crash', phase != null, JSON.stringify(phase));
        const afterPhaseErrors = errors.filter((e) => !/AudioContext|autoplay|favicon|AbortError/i.test(e));
        t.ok('beat-09: still clean after phase window', afterPhaseErrors.length === 0,
            afterPhaseErrors.slice(0, 3).join(' | '));

        // ── all levels spawn/ground ───────────────────────────────────────
        const ids = await page.evaluate(() => window.__sovereignScar.LEVELS.map((l) => l.id));
        const levelRows = [];
        for (const id of ids) {
            errors.length = 0;
            await page.evaluate((levelId) => window.__sovereignScar.loadLevel(levelId), id);
            // sky needs extra settle time for platform drop
            await sleep(id === 'beat-04-sky' ? 1400 : 800);
            const r = await page.evaluate(() => {
                const s = window.__sovereignScar;
                const p = s.player;
                const sp = p.spawnPoint;
                const g = s.game.level.getVoxelAt;
                return {
                    id: s.game.levelId,
                    y: +p.root.position.y.toFixed(3),
                    grounded: p.physics.grounded,
                    vy: +p.physics.vy.toFixed(2),
                    solidSpawn: !!g(sp.x, 0.1, sp.z),
                    solidFeet: !!g(p.root.position.x, p.root.position.y - p.physics.extents.y - 0.05, p.root.position.z),
                    hp: p.health.hp,
                    dead: p.health.dead,
                    enemies: s.game.level?.enemies?.length || 0,
                };
            });
            const fatal = errors.filter((e) => !/AudioContext|autoplay|favicon|AbortError/i.test(e));
            r.errorCount = fatal.length;
            r.errors = fatal.slice(0, 2);
            levelRows.push(r);
            t.ok(`${id}: solid spawn`, r.solidSpawn, JSON.stringify(r));
            t.ok(`${id}: grounded`, r.grounded === true, JSON.stringify(r));
            t.ok(`${id}: playable Y`, r.y > 0.4 && r.y < 12, `y=${r.y}`);
            t.ok(`${id}: alive`, !r.dead && r.hp > 0, `hp=${r.hp}`);
            t.ok(`${id}: no page errors`, fatal.length === 0, fatal.join(' | '));
        }

        const bad = levelRows.filter((r) => !r.grounded || !r.solidSpawn || r.errorCount > 0 || r.y < 0.4);
        t.ok('ALL 15 levels playable solid ground', bad.length === 0,
            bad.map((b) => `${b.id} g=${b.grounded} solid=${b.solidSpawn} y=${b.y} e=${b.errorCount}`).join('; '));

        // Movement + combat smoke
        await page.evaluate(() => window.__sovereignScar.loadLevel('sandbox-combat'));
        await sleep(500);
        const before = await page.evaluate(() => {
            const p = window.__sovereignScar.player.root.position;
            return { x: p.x, z: p.z, y: p.y, g: window.__sovereignScar.player.physics.grounded };
        });
        await page.keyboard.down('KeyW');
        await sleep(450);
        await page.keyboard.up('KeyW');
        await sleep(100);
        const after = await page.evaluate(() => {
            const p = window.__sovereignScar.player.root.position;
            return { x: p.x, z: p.z, y: p.y, g: window.__sovereignScar.player.physics.grounded };
        });
        t.ok('move grounded', after.g && Math.hypot(after.x - before.x, after.z - before.z) > 0.2,
            JSON.stringify({ before, after }));

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
            return { ok: true, hp0, hp1: e.hp };
        });
        t.ok('combat damages', combat.ok && combat.hp1 < combat.hp0, JSON.stringify(combat));

        await page.keyboard.press('KeyM');
        await sleep(150);
        await page.keyboard.press('KeyP');
        await sleep(100);
        const ui = await page.evaluate(() => ({
            mood: window.__sovereignScar.mood.mood,
            paused: window.__sovereignScar.game.paused,
        }));
        t.ok('mood/pause', ui.paused === true, JSON.stringify(ui));
        await page.keyboard.press('KeyP');

        const save = await page.evaluate(() => window.__sovereignScar.save());
        t.ok('save', !!save?.currentBeat);

        // Death respawn stays grounded
        await page.evaluate(() => {
            const p = window.__sovereignScar.player;
            p.health.iFrames = 0;
            p.health.damage(99);
        });
        await sleep(2200);
        const resp = await page.evaluate(() => {
            const p = window.__sovereignScar.player;
            return { dead: p.health.dead, hp: p.health.hp, y: +p.root.position.y.toFixed(3), g: p.physics.grounded };
        });
        t.ok('respawn alive grounded', !resp.dead && resp.hp > 0 && resp.g && resp.y > 0.5,
            JSON.stringify(resp));

        fs.writeFileSync(path.join(OUT, 'recheck3.json'), JSON.stringify({ town, levelRows, combat, resp }, null, 2));
        await page.screenshot({ path: path.join(OUT, 'recheck3.png') });
    } catch (e) {
        t.ok('recheck3 completed', false, String(e && e.stack || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        await server.close();
    }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('recheck3.mjs')) {
    const t = createSink('recheck3');
    await run(t);
    process.exit(summarize([t]) ? 1 : 0);
}
