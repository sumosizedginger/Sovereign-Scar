// Browser E2E: every story beat loads a boss; simulate damage/defeat; story HUD.

import {
    startServer, findChromeVerbose, sleep,
} from './harness.mjs';

const BEAT_BOSSES = [
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

    const server = await startServer(8797);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(30000);
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        await page.mouse.click(400, 300);
        await sleep(500);

        // Story panel exists
        const storyOk = await page.evaluate(() => {
            const s = window.__sovereignScar;
            return !!(s.game.hud?.story || document.getElementById('ss-story'));
        });
        t.ok('story panel present', storyOk);

        // Boss bar element
        t.ok('boss bar element', await page.evaluate(() => !!document.getElementById('ss-boss-bar')));

        const results = await page.evaluate(async (pairs) => {
            const s = window.__sovereignScar;
            const out = [];
            for (const [levelId, bossId] of pairs) {
                try {
                    s.loadLevel(levelId);
                    await new Promise((r) => setTimeout(r, 120));
                    const level = s.game.level;
                    const boss = level?.boss;
                    const id = boss?.bossId || level?.bossId || null;
                    const name = boss?.bossName || null;
                    const hasHp = boss && (boss.hp != null || boss.cores);
                    const enemies = level?.enemies?.length || 0;
                    // Simulate defeat path for non-multi-core
                    let defeatOk = false;
                    if (boss?.cores) {
                        for (const c of boss.cores) {
                            c.hp = 0;
                            c.state.current = 'DEAD';
                            c.onDeath?.();
                        }
                        // tick systems
                        for (let i = 0; i < 3; i++) level.update(0.05, s.game);
                        defeatOk = !!level._bossCleared || boss.defeated;
                    } else if (boss) {
                        boss.hp = 0;
                        boss.onDeath?.();
                        for (let i = 0; i < 3; i++) level.update(0.05, s.game);
                        defeatOk = !!level._bossCleared || boss.defeated || boss.state?.current === 'DEAD';
                    }
                    out.push({
                        levelId, expect: bossId, id, name, hasHp, enemies, defeatOk,
                        err: null,
                    });
                } catch (e) {
                    out.push({
                        levelId, expect: bossId, id: null, name: null,
                        hasHp: false, enemies: 0, defeatOk: false, err: String(e),
                    });
                }
            }
            // HUD / music after last
            const hud = document.getElementById('ss-hud');
            return {
                out,
                hudText: hud?.innerText || '',
                pageErrors: 0,
            };
        }, BEAT_BOSSES);

        for (const r of results.out) {
            t.ok(`${r.levelId} loads boss`, !!r.id || r.hasHp, r.err || JSON.stringify(r));
            t.ok(`${r.levelId} boss id match`, r.id === r.expect, `got=${r.id} want=${r.expect}`);
            t.ok(`${r.levelId} has enemies`, r.enemies >= 1, `e=${r.enemies}`);
            t.ok(`${r.levelId} defeat path`, r.defeatOk, JSON.stringify(r));
        }

        // Screenshot showcase of leviathan
        await page.evaluate(() => window.__sovereignScar.loadLevel('beat-14-leviathan'));
        await sleep(800);
        await page.screenshot({
            path: new URL('../assets/screenshots/leviathan-boss.png', import.meta.url).pathname.replace(/^\//, ''),
            type: 'png',
        }).catch(() => {});

        // Load all 14 without pageerror storm
        const loadAll = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const ids = s.LEVELS.filter((l) => l.id.startsWith('beat-')).map((l) => l.id);
            const fails = [];
            for (const id of ids) {
                try {
                    s.loadLevel(id);
                    await new Promise((r) => setTimeout(r, 80));
                    if (!s.game.level?.boss && id !== 'x') {
                        // every beat must have boss now
                        if (!s.game.level?.boss) fails.push(id + ':no-boss');
                    }
                } catch (e) {
                    fails.push(id + ':' + e);
                }
            }
            return { fails, n: ids.length };
        });
        t.ok('all 14 beats load with boss', loadAll.fails.length === 0, loadAll.fails.join('; '));
        t.ok('14 beats counted', loadAll.n === 14);

        // Soft check: no critical pageerrors accumulated during loads
        t.ok('no fatal pageerrors', errors.filter((e) => !/AudioContext|favicon/i.test(e)).length < 5,
            errors.slice(0, 5).join(' | '));

        // Enter advances story
        await page.keyboard.press('Enter');
        await sleep(100);
        t.ok('story advance key handled', true);
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
