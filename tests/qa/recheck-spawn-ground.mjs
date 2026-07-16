// Independent recheck: spawn solid + grounded after settle on every level.
// Does not modify game source.

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
        t.ok('chrome', false, 'no chrome');
        return;
    }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8810);
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
        await sleep(800);

        // Clear progress bias toward last-failed level if any
        await page.evaluate(() => {
            try {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const k = localStorage.key(i);
                    if (/sovereign|progress|scar/i.test(k || '')) localStorage.removeItem(k);
                }
            } catch (_) {}
        });

        const boot = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player.root.position;
            return {
                levelId: s.game.levelId,
                y: p.y,
                grounded: s.player.physics.grounded,
                scaleHint: s.game.level?.map ? 'ok' : 'no',
                levelCount: s.LEVELS.length,
                hp: s.player.health.hp,
                triangles: s.renderer?.info?.render?.triangles ?? 0,
            };
        });
        t.ok('boot hook', boot.levelCount === 15, JSON.stringify(boot));

        // Wait on initial level settle
        await sleep(1200);
        const bootSettle = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            const sp = p.spawnPoint;
            const g = s.game.level.getVoxelAt;
            return {
                id: s.game.levelId,
                y: +p.root.position.y.toFixed(3),
                z: +p.root.position.z.toFixed(3),
                grounded: p.physics.grounded,
                solidSpawn: !!g(sp.x, 0.1, sp.z),
                solidFeet: !!g(p.root.position.x, p.root.position.y - p.physics.extents.y - 0.05, p.root.position.z),
                spawn: sp,
                hp: p.health.hp,
            };
        });
        t.ok('boot settle: not freefalling', bootSettle.y > 0.5 && bootSettle.y < 8,
            JSON.stringify(bootSettle));
        t.ok('boot settle: grounded or near floor', bootSettle.grounded || bootSettle.y > 0.8,
            JSON.stringify(bootSettle));
        t.ok('boot settle: solid under spawn', bootSettle.solidSpawn, JSON.stringify(bootSettle));

        const levelIds = await page.evaluate(() => window.__sovereignScar.LEVELS.map((l) => l.id));
        const results = [];

        for (const id of levelIds) {
            errors.length = 0;
            await page.evaluate((levelId) => {
                window.__sovereignScar.loadLevel(levelId);
            }, id);
            // Let several physics frames run
            await sleep(900);
            const r = await page.evaluate(() => {
                const s = window.__sovereignScar;
                const p = s.player;
                const sp = p.spawnPoint || s.game.level.spawn;
                const g = s.game.level.getVoxelAt;
                const feetY = p.root.position.y - p.physics.extents.y;
                // solid bounds
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                for (const sol of s.collisionWorld.solids) {
                    minX = Math.min(minX, sol.minX);
                    maxX = Math.max(maxX, sol.maxX);
                    minZ = Math.min(minZ, sol.minZ);
                    maxZ = Math.max(maxZ, sol.maxZ);
                }
                return {
                    id: s.game.levelId,
                    name: s.game.level?.name,
                    spawn: { ...sp },
                    pos: {
                        x: +p.root.position.x.toFixed(3),
                        y: +p.root.position.y.toFixed(3),
                        z: +p.root.position.z.toFixed(3),
                    },
                    grounded: p.physics.grounded,
                    vy: +p.physics.vy.toFixed(3),
                    solidAtSpawnY01: !!g(sp.x, 0.1, sp.z),
                    solidAtFeet: !!g(p.root.position.x, feetY - 0.02, p.root.position.z),
                    solidBelowFeet: !!g(p.root.position.x, feetY - 0.2, p.root.position.z),
                    hp: p.health.hp,
                    dead: p.health.dead,
                    enemies: s.game.level?.enemies?.length || 0,
                    dest: s.game.level?.destructibles?.length || 0,
                    solidBounds: Number.isFinite(minX) ? { minX, maxX, minZ, maxZ, n: s.collisionWorld.solids.length } : null,
                    triangles: s.renderer?.info?.render?.triangles ?? 0,
                };
            });
            const fatal = errors.filter((e) => !/AudioContext|autoplay|favicon|AbortError/i.test(e));
            r.errors = fatal.slice(0, 4);
            results.push(r);

            const playableY = r.pos.y > 0.4 && r.pos.y < 12;
            const notTerminalFall = r.vy > -20 || r.grounded;
            t.ok(`${id}: loaded`, r.id === id, JSON.stringify(r));
            t.ok(`${id}: solid under spawn`, r.solidAtSpawnY01, JSON.stringify(r.spawn));
            t.ok(`${id}: player Y playable`, playableY, `y=${r.pos.y} grounded=${r.grounded} vy=${r.vy}`);
            t.ok(`${id}: grounded after settle`, r.grounded === true, JSON.stringify({ y: r.pos.y, vy: r.vy }));
            t.ok(`${id}: not dead from fall`, r.dead === false && r.hp > 0, `hp=${r.hp}`);
            t.ok(`${id}: no fatal page errors`, fatal.length === 0, fatal.join(' | '));
            t.ok(`${id}: draws tris`, r.triangles > 0, `tri=${r.triangles}`);
        }

        // Movement on sandbox without falling
        await page.evaluate(() => window.__sovereignScar.loadLevel('sandbox-combat'));
        await sleep(600);
        const before = await page.evaluate(() => {
            const p = window.__sovereignScar.player.root.position;
            return { x: p.x, y: p.y, z: p.z, g: window.__sovereignScar.player.physics.grounded };
        });
        await page.keyboard.down('KeyW');
        await sleep(500);
        await page.keyboard.up('KeyW');
        await page.keyboard.down('KeyA');
        await sleep(400);
        await page.keyboard.up('KeyA');
        await sleep(200);
        const after = await page.evaluate(() => {
            const p = window.__sovereignScar.player.root.position;
            return { x: p.x, y: p.y, z: p.z, g: window.__sovereignScar.player.physics.grounded };
        });
        const moved = Math.hypot(after.x - before.x, after.z - before.z);
        t.ok('move: displacement', moved > 0.3, JSON.stringify({ before, after, moved }));
        t.ok('move: stayed grounded-ish', after.g === true && after.y > 0.5 && after.y < 6,
            JSON.stringify(after));

        // Combat still works on solid ground
        const combat = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            const e = (s.game.level.enemies || []).find((x) => x.hp > 0 && x.state?.current !== 'DEAD');
            if (!e) return { ok: false };
            const hp0 = e.hp;
            p.root.position.set(e.root.position.x, p.root.position.y, e.root.position.z + 1.1);
            p.physics.position && (p.physics.position.x = p.root.position.x);
            // position is shared ref to root.position usually
            p.physics.grounded = true;
            p.physics.vy = 0;
            p.attackCd = 0;
            p.state.setFacing(0, -1);
            p.tryAttack(s.game.level.enemies, s.game.level.destructibles || []);
            return { ok: true, hp0, hp1: e.hp, grounded: p.physics.grounded, y: p.root.position.y };
        });
        t.ok('combat: damage on ground', combat.ok && combat.hp1 < combat.hp0, JSON.stringify(combat));

        // Mood / pause
        await page.keyboard.press('KeyM');
        await sleep(200);
        const mood = await page.evaluate(() => window.__sovereignScar.mood.mood);
        t.ok('mood toggle', mood === 'abyss' || mood === 'crust', mood);
        await page.keyboard.press('KeyP');
        await sleep(150);
        const paused = await page.evaluate(() => window.__sovereignScar.game.paused);
        t.ok('pause', paused === true);
        await page.keyboard.press('KeyP');

        // Save
        const save = await page.evaluate(() => window.__sovereignScar.save());
        t.ok('save', !!save?.currentBeat, JSON.stringify(save?.currentBeat));

        // Death + respawn stays on floor
        await page.evaluate(() => {
            const p = window.__sovereignScar.player;
            p.health.iFrames = 0;
            p.health.damage(99);
        });
        await sleep(2000);
        const respawn = await page.evaluate(() => {
            const p = window.__sovereignScar.player;
            return {
                dead: p.health.dead,
                hp: p.health.hp,
                y: +p.root.position.y.toFixed(3),
                grounded: p.physics.grounded,
                spawn: p.spawnPoint,
            };
        });
        t.ok('respawn: alive', respawn.dead === false && respawn.hp > 0, JSON.stringify(respawn));
        t.ok('respawn: on floor', respawn.y > 0.5 && respawn.y < 8, JSON.stringify(respawn));
        await sleep(800);
        const afterRespawn = await page.evaluate(() => {
            const p = window.__sovereignScar.player;
            return { y: +p.root.position.y.toFixed(3), grounded: p.physics.grounded };
        });
        t.ok('respawn: stays grounded', afterRespawn.grounded && afterRespawn.y > 0.5,
            JSON.stringify(afterRespawn));

        // VOXEL_SCALE sanity via floor extent vs half
        const scaleCheck = await page.evaluate(() => {
            window.__sovereignScar.loadLevel('beat-01-crypt');
            return new Promise((r) => setTimeout(() => {
                const s = window.__sovereignScar;
                const g = s.game.level.getVoxelAt;
                r({
                    at0: !!g(0, 0.1, 0),
                    at7: !!g(0, 0.1, 7),
                    atSpawn: !!g(s.game.level.spawn.x, 0.1, s.game.level.spawn.z),
                    atNeg9: !!g(0, 0.1, -9),
                    at12: !!g(0, 0.1, 12), // outside half=10 should be false
                    spawn: s.game.level.spawn,
                });
            }, 200));
        });
        t.ok('scale: floor at origin', scaleCheck.at0);
        t.ok('scale: floor at z=7 (old void)', scaleCheck.at7, JSON.stringify(scaleCheck));
        t.ok('scale: outside half is empty', scaleCheck.at12 === false, JSON.stringify(scaleCheck));

        await page.screenshot({ path: path.join(OUT, 'recheck-grounded.png') });
        fs.writeFileSync(path.join(OUT, 'recheck-levels.json'), JSON.stringify(results, null, 2));

        const bad = results.filter((r) => !r.grounded || !r.solidAtSpawnY01 || r.pos.y < 0.4);
        t.ok('ALL levels grounded+solid spawn', bad.length === 0,
            bad.map((b) => `${b.id} y=${b.pos.y} g=${b.grounded} solid=${b.solidAtSpawnY01}`).join('; '));
    } catch (e) {
        t.ok('recheck completed', false, String(e && e.stack || e));
    } finally {
        if (browser) await browser.close().catch(() => {});
        await server.close();
    }
}

const direct = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('recheck-spawn-ground.mjs');
if (direct) {
    const t = createSink('recheck-spawn');
    await run(t);
    process.exit(summarize([t]) ? 1 : 0);
}
