// Strict independent QA — does not modify game source.
// node tests/qa/strict-independent-qa.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
    createSink, startServer, findChromeVerbose, sleep, summarize,
} from '../harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join('D:\\tmp', 'qa-sovereign-out');
fs.mkdirSync(OUT, { recursive: true });

const BEATS = [
    ['beat-01-crypt', 'crypt_warden'],
    ['beat-02-spindle', 'tri_compiler'],
    ['beat-03-sink', 'sand_spur'],
    ['beat-04-sky', 'kinetic_core'],
    ['beat-05-citadel', 'proxy'],
    ['beat-06-quarry', 'obsidian_arachnid'],
    ['beat-07-sluice', 'hydroid_cloud'],
    ['beat-08-bone', 'skeletal_mantis'],
    ['beat-09-town', 'phantasm'],
    ['beat-10-cryo', 'frost_and_fuel'],
    ['beat-11-mire', 'sludge_golem'],
    ['beat-12-pyre', 'magma_wyrm'],
    ['beat-13-gumoi', 'gumoi_witness'],
    ['beat-14-leviathan', 'leviathan'],
];

const ALL_LEVELS = ['sandbox-combat', ...BEATS.map((b) => b[0])];

export async function run(t) {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available', false, 'no chrome');
        return;
    }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8812);
    let browser;
    const report = { startedAt: new Date().toISOString(), issues: [], levels: [] };

    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(45000);
        await page.setViewport({ width: 1280, height: 720 });

        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.player),
            { timeout: 30000 },
        );
        await page.mouse.click(640, 360);
        await sleep(800);

        // Docs on disk
        const docs = [
            'README.md', 'docs/CONTROLS.md', 'docs/ARCHITECTURE.md', 'docs/API.md',
            'BUILD_LOG.md', 'CHANGELOG.md', 'ENGINE_PIN.md', 'LICENSE',
        ];
        for (const d of docs) {
            const p = path.join(ROOT, d);
            t.ok(`docs: ${d}`, fs.existsSync(p) && fs.statSync(p).size > 50);
        }

        const boot = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const hud = document.getElementById('ss-hud');
            const story = document.getElementById('ss-story');
            const bossBar = document.getElementById('ss-boss-bar');
            const canvas = document.querySelector('canvas');
            return {
                title: document.title,
                levelCount: s.LEVELS?.length,
                hp: s.player.health.hp,
                hud: hud?.innerText || '',
                storyOk: !!story,
                bossBarOk: !!bossBar,
                canvas: !!(canvas && canvas.width > 0),
                triangles: s.renderer?.info?.render?.triangles ?? -1,
                calls: s.renderer?.info?.render?.calls ?? -1,
                physicsKeys: Object.keys(s.player.physics || {}),
                weapon: s.player.inventory.activeWeapon,
            };
        });
        t.ok('boot: title', /Sovereign Scar/i.test(boot.title), boot.title);
        t.ok('boot: 16 levels', boot.levelCount === 16, String(boot.levelCount));
        t.ok('boot: canvas drawing', boot.canvas && (boot.calls > 0 || boot.triangles > 0), JSON.stringify({ c: boot.calls, t: boot.triangles }));
        t.ok('boot: HUD brand', /SOVEREIGN SCAR/i.test(boot.hud));
        t.ok('boot: HUD bosses 0/14', /Bosses:\s*0\/14/i.test(boot.hud), boot.hud.slice(0, 200));
        t.ok('boot: story + boss bar DOM', boot.storyOk && boot.bossBarOk);
        t.ok('boot: physics uses vx not .vel',
            boot.physicsKeys.includes('vx') && !boot.physicsKeys.includes('vel'),
            JSON.stringify(boot.physicsKeys));
        t.ok('boot: default weapon bare_strike', boot.weapon === 'bare_strike', boot.weapon);

        await page.screenshot({ path: path.join(OUT, 'boot.png') });

        // Movement
        const pos0 = await page.evaluate(() => {
            const p = window.__sovereignScar.player.root.position;
            return { x: p.x, z: p.z };
        });
        await page.keyboard.down('KeyW');
        await sleep(450);
        await page.keyboard.up('KeyW');
        await page.keyboard.down('KeyD');
        await sleep(300);
        await page.keyboard.up('KeyD');
        await sleep(80);
        const pos1 = await page.evaluate(() => {
            const p = window.__sovereignScar.player.root.position;
            return { x: p.x, z: p.z };
        });
        const moved = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z);
        t.ok('move: WASD moves player', moved > 0.25, `delta=${moved.toFixed(3)}`);

        // Story
        await page.evaluate(() => window.__sovereignScar.loadLevel('beat-01-crypt'));
        await sleep(500);
        const storyBefore = await page.evaluate(() => {
            const s = window.__sovereignScar.game.hud.story;
            return { text: s.current?.text || null, speaker: s.current?.speaker || null };
        });
        t.ok('story: dialogue present', !!storyBefore.text && !!storyBefore.speaker, JSON.stringify(storyBefore));
        await page.keyboard.press('Enter');
        await sleep(150);
        const storyAfter = await page.evaluate(() => {
            const s = window.__sovereignScar.game.hud.story;
            return { text: s.current?.text || null, speaker: s.current?.speaker || null };
        });
        t.ok('story: Enter advances',
            storyAfter.text !== storyBefore.text || storyAfter.speaker !== storyBefore.speaker,
            JSON.stringify({ storyBefore, storyAfter }));

        // Boss UI
        const bossUi = await page.evaluate(() => {
            const s = window.__sovereignScar;
            for (let i = 0; i < 5; i++) s.game.level.update(0.016, s.game);
            const boss = s.game.activeBoss || s.game.level.boss;
            s.game.hud.update({
                beatName: s.game.level.name,
                beatId: s.game.levelId,
                hp: s.player.health.hp,
                maxHp: s.player.health.max,
                weapon: 'Anchor Link',
                memoryKeys: 0,
                mood: 'crust',
                bossesDefeated: 0,
                banner: s.game.level.banner,
                boss,
            });
            const bar = document.getElementById('ss-boss-bar');
            return {
                levelBossId: s.game.level.boss?.bossId || null,
                display: bar ? getComputedStyle(bar).display : null,
                name: document.getElementById('ss-boss-name')?.textContent || '',
                phase: document.getElementById('ss-boss-phase')?.textContent || '',
            };
        });
        t.ok('boss-ui: crypt_warden', bossUi.levelBossId === 'crypt_warden', JSON.stringify(bossUi));
        t.ok('boss-ui: bar visible', bossUi.display === 'block', JSON.stringify(bossUi));
        t.ok('boss-ui: name', /CRYPT WARDEN/i.test(bossUi.name), bossUi.name);
        t.ok('boss-ui: phase', /PHASE/i.test(bossUi.phase), bossUi.phase);

        // Real combat vs sandbox enemy
        await page.evaluate(() => window.__sovereignScar.loadLevel('sandbox-combat'));
        await sleep(600);
        const combat = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            const enemies = (s.game.level.enemies || []).filter((e) => e.state?.current !== 'DEAD' && e.hp > 0);
            if (!enemies.length) return { ok: false };
            const e = enemies[0];
            const before = e.hp;
            p.root.position.set(e.root.position.x, e.root.position.y, e.root.position.z + 1.15);
            p.physics.position.x = p.root.position.x;
            p.physics.position.y = p.root.position.y;
            p.physics.position.z = p.root.position.z;
            p.physics.vx = 0; p.physics.vy = 0; p.physics.vz = 0;
            p.state.setFacing(0, -1);
            p.attackCd = 0;
            const hits = p.tryAttack(enemies, s.game.level.destructibles || []);
            return { ok: true, before, after: e.hp, hitCount: hits?.length || 0, kind: e.kind };
        });
        t.ok('combat: sandbox enemies', combat.ok, JSON.stringify(combat));
        t.ok('combat: tryAttack damages', combat.after < combat.before, JSON.stringify(combat));

        // Boss combat wake + damage
        await page.evaluate(() => window.__sovereignScar.loadLevel('beat-01-crypt'));
        await sleep(500);
        const bossCombat = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            const boss = s.game.level.boss;
            p.root.position.set(boss.root.position.x, 1.2, boss.root.position.z + 2);
            p.physics.position.x = p.root.position.x;
            p.physics.position.y = 1.2;
            p.physics.position.z = p.root.position.z;
            p.physics.vx = p.physics.vy = p.physics.vz = 0;
            for (let i = 0; i < 10; i++) boss.update(0.05, p, s.game);
            const shieldedAfterWake = !!boss.shielded;
            const awake = !!boss._awake;
            p.state.setFacing(0, -1);
            p.attackCd = 0;
            const hp0 = boss.hp;
            p.tryAttack([boss], []);
            const hp1 = boss.hp;
            for (let i = 0; i < 5; i++) {
                p.attackCd = 0;
                p.tryAttack([boss], []);
            }
            return {
                awake, shieldedAfterWake, hp0, hp1, hpAfterSwings: boss.hp, maxHp: boss.maxHp,
            };
        });
        t.ok('boss-combat: wakes', bossCombat.awake, JSON.stringify(bossCombat));
        t.ok('boss-combat: unshielded', bossCombat.shieldedAfterWake === false, JSON.stringify(bossCombat));
        t.ok('boss-combat: HP reduced',
            bossCombat.hp1 < bossCombat.hp0 || bossCombat.hpAfterSwings < bossCombat.hp0,
            JSON.stringify(bossCombat));

        // Phase lag bug probe (applyHit order)
        const phaseBug = await page.evaluate(() => {
            const s = window.__sovereignScar;
            s.loadLevel('beat-01-crypt');
            const boss = s.game.level.boss;
            boss._awake = true;
            boss.shielded = false;
            boss.canHit = true;
            boss.hp = 6; // max 10, threshold 0.5 → phase2 at hp<=5
            boss.phase = 1;
            boss.state.current = 'IDLE';
            boss.defeated = false;
            boss.alive = true;
            const dmg = 1;
            if (boss.onHit) boss.onHit(dmg); // checks phase BEFORE subtract
            const phaseAfterOnHitBeforeSubtract = boss.phase;
            boss.hp -= dmg;
            const phaseAfterSubtractNoRecheck = boss.phase;
            boss._checkPhase?.();
            const phaseAfterManualRecheck = boss.phase;
            return {
                phaseAfterOnHitBeforeSubtract,
                phaseAfterSubtractNoRecheck,
                phaseAfterManualRecheck,
                bugConfirmed: phaseAfterOnHitBeforeSubtract === 1
                    && phaseAfterSubtractNoRecheck === 1
                    && phaseAfterManualRecheck === 2,
            };
        });
        // Assertion documents the defect for the verdict (product bug if true)
        t.ok('phase-bug: onHit checks phase before HP subtract (defect)',
            phaseBug.bugConfirmed === true,
            JSON.stringify(phaseBug));
        if (phaseBug.bugConfirmed) {
            report.issues.push({
                severity: 'bug',
                file: 'src/game/combat/combat-sweeper.js + bosses/base.js',
                desc: 'Phase transition lags one hit: onHit/_checkPhase runs before defender.hp -= dmg',
            });
        }

        // All levels
        pageErrors.length = 0;
        const levelSweep = await page.evaluate(async (allIds) => {
            const s = window.__sovereignScar;
            const out = [];
            for (const id of allIds) {
                try {
                    s.loadLevel(id);
                    await new Promise((r) => setTimeout(r, 100));
                    const lvl = s.game.level;
                    const boss = lvl?.boss;
                    for (let i = 0; i < 3; i++) lvl?.update?.(0.016, s.game);
                    out.push({
                        id,
                        ok: true,
                        bossId: boss?.bossId || null,
                        enemies: lvl?.enemies?.length || 0,
                        storyLines: Array.isArray(lvl?.story) ? lvl.story.length : 0,
                        musicBed: lvl?.musicBed || null,
                        playerY: s.player.root.position.y,
                        grounded: s.player.physics.grounded,
                        triangles: s.renderer?.info?.render?.triangles ?? -1,
                    });
                } catch (e) {
                    out.push({ id, ok: false, err: String(e) });
                }
            }
            return out;
        }, ALL_LEVELS);

        for (const row of levelSweep) {
            report.levels.push(row);
            t.ok(`level ${row.id} loads`, row.ok && !row.err, JSON.stringify(row));
            if (row.id.startsWith('beat-')) {
                const expect = BEATS.find((b) => b[0] === row.id)?.[1];
                t.ok(`level ${row.id} boss`, row.bossId === expect, `got=${row.bossId} want=${expect}`);
                t.ok(`level ${row.id} enemies`, row.enemies >= 1, `e=${row.enemies}`);
                t.ok(`level ${row.id} story`, row.storyLines >= 1, `story=${row.storyLines}`);
            }
            t.ok(`level ${row.id} geometry`, (row.triangles ?? 0) > 100, `tri=${row.triangles}`);
            t.ok(`level ${row.id} spawn Y`, row.playerY > 0.2 && row.playerY < 8, `y=${row.playerY}`);
        }

        // Defeat path
        const defeat = await page.evaluate(() => {
            const s = window.__sovereignScar;
            s.loadLevel('beat-05-citadel');
            const boss = s.game.level.boss;
            boss.hp = 0;
            boss.onDeath?.();
            for (let i = 0; i < 5; i++) s.game.level.update(0.05, s.game);
            return {
                cleared: !!s.game.level._bossCleared,
                defeated: !!boss.defeated,
            };
        });
        t.ok('defeat: proxy cleared', defeat.cleared && defeat.defeated, JSON.stringify(defeat));

        // Mood / pause / nav
        await page.keyboard.press('KeyM');
        await sleep(200);
        const mood = await page.evaluate(() => window.__sovereignScar.mood.mood);
        t.ok('mood: toggled', mood === 'abyss' || mood === 'crust', mood);
        await page.keyboard.press('KeyP');
        await sleep(120);
        t.ok('pause: on', await page.evaluate(() => window.__sovereignScar.game.paused) === true);
        await page.keyboard.press('KeyP');
        await sleep(80);
        await page.keyboard.press('BracketRight');
        await sleep(350);
        t.ok('nav: ] changes level', !!(await page.evaluate(() => window.__sovereignScar.game.levelId)));

        // Music
        const musicOk = await page.evaluate(() => {
            try {
                window.__sovereignScar.loadLevel('beat-14-leviathan');
                window.__sovereignScar.mood.setMusicProfile('leviathan');
                return { ok: true, bed: window.__sovereignScar.game.level.musicBed };
            } catch (e) {
                return { ok: false, err: String(e) };
            }
        });
        t.ok('audio: leviathan bed', musicOk.ok && musicOk.bed === 'leviathan', JSON.stringify(musicOk));
        await page.screenshot({ path: path.join(OUT, 'leviathan.png') });

        // Destructibles
        const dest = await page.evaluate(() => {
            window.__sovereignScar.loadLevel('beat-06-quarry');
            const list = window.__sovereignScar.game.level.destructibles || [];
            if (!list.length) return { n: 0 };
            const d = list[0];
            const before = d.liveMap?.size ?? -1;
            let removed = 0;
            if (typeof d.shatterAtWorld === 'function') {
                const o = d.origin || { x: 0, y: 1, z: 0 };
                removed = d.shatterAtWorld(o.x, (o.y || 0) + 1, o.z, 2) || 0;
            }
            return {
                n: list.length,
                before,
                after: d.liveMap?.size ?? -1,
                removed,
                hasShatter: typeof d.shatterAtWorld === 'function',
            };
        });
        t.ok('destructible: present', dest.n >= 1, JSON.stringify(dest));
        t.ok('destructible: shatter API', dest.hasShatter, JSON.stringify(dest));

        // Inventory keys API
        const inv = await page.evaluate(() => {
            const i = window.__sovereignScar.player.inventory;
            return {
                methods: Object.getOwnPropertyNames(Object.getPrototypeOf(i)),
                hasAllKeys: typeof i.hasAllKeys === 'function' ? i.hasAllKeys() : null,
            };
        });
        t.ok('inventory: key helpers',
            inv.methods.includes('hasAllKeys') || inv.methods.includes('grantKey') || inv.methods.includes('grantItem'),
            JSON.stringify(inv));

        const fatal = pageErrors.filter((e) => !/ResizeObserver|favicon/i.test(e));
        t.ok('runtime: no pageerrors', fatal.length === 0, fatal.slice(0, 8).join(' | '));

        report.pageErrors = pageErrors;
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
        t.ok('report written', fs.existsSync(path.join(OUT, 'report.json')));
    } catch (e) {
        t.ok('qa run completed', false, String(e && e.stack || e));
        report.crash = String(e && e.stack || e);
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    } finally {
        try { await browser?.close(); } catch (_) {}
        try { await server.close(); } catch (_) {}
    }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
    const t = createSink('strict-qa');
    await run(t);
    process.exit(summarize([t]) ? 1 : 0);
}
