// Browser E2E (S6): visual sanity — luminance bands, character scale,
// grounding, and boss silhouette hierarchy for every level.
// These asserts would have caught P0-1 (7× characters), P0-2 (near-black
// scenes) and P1-5 (bosses smaller than trash mobs).

import { startServer, findChromeVerbose, sleep } from './harness.mjs';

const LUM_BANDS = {
    crust: [45, 90],
    abyss: [35, 75],
};
const PLAYER_TARGET_H = 1.9;
const MOB_TARGET_H = 1.6;

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

    const server = await startServer(8794);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(60000);
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        await page.mouse.click(400, 300);
        await sleep(300);

        const rows = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = false;
            s.menu.close();
            const out = [];
            for (const meta of s.LEVELS) {
                try {
                    s.loadLevel(meta.id);
                    // The boss-intro camera push-in would skew the sample.
                    s.game.bossIntro = null;
                    await new Promise((r) => setTimeout(r, 400));
                    const lum = await s.sampleLuminance();
                    const m = s.measure();
                    out.push({
                        id: meta.id,
                        mood: s.game.level.mood || meta.mood || 'crust',
                        lum,
                        player: m.player,
                        mobs: m.mobs,
                        boss: m.boss,
                        err: null,
                    });
                } catch (e) {
                    out.push({ id: meta.id, err: String(e) });
                }
            }
            return out;
        });

        for (const r of rows) {
            if (r.err) {
                t.ok(`${r.id} sampled`, false, r.err);
                continue;
            }
            const [lo, hi] = LUM_BANDS[r.mood] || LUM_BANDS.crust;
            t.ok(`${r.id} luminance in band`, r.lum >= lo && r.lum <= hi,
                `lum=${r.lum.toFixed(1)} band=[${lo},${hi}] mood=${r.mood}`);

            const pr = r.player.h / PLAYER_TARGET_H;
            t.ok(`${r.id} player scale`, pr >= 0.8 && pr <= 1.2, `h=${r.player.h.toFixed(2)}`);
            t.ok(`${r.id} player grounded`, r.player.minY >= 0.85,
                `minY=${r.player.minY.toFixed(2)} (floor top = 1.0)`);

            let tallestMob = 0;
            for (let i = 0; i < r.mobs.length; i++) {
                const mob = r.mobs[i];
                const mr = mob.h / MOB_TARGET_H;
                t.ok(`${r.id} mob[${i}] scale`, mr >= 0.8 && mr <= 1.2, `h=${mob.h.toFixed(2)}`);
                t.ok(`${r.id} mob[${i}] grounded`, mob.minY >= 0.85, `minY=${mob.minY.toFixed(2)}`);
                tallestMob = Math.max(tallestMob, mob.h);
            }

            if (r.boss) {
                const bar = Math.max(tallestMob * 1.3, r.player.h);
                t.ok(`${r.id} boss silhouette dominates`, r.boss.h >= bar,
                    `boss=${r.boss.h.toFixed(2)} bar=${bar.toFixed(2)} (mob=${tallestMob.toFixed(2)})`);
            }
        }
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
