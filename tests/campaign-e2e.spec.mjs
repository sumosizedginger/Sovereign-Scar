// Browser E2E (Phase D gate): dev-mode campaign run — fresh save, dev on,
// teleport to every beat, F2-kill every boss, reach the ending, assert
// campaignComplete persisted. Mirrors the manual 10-minute gate run.

import { startServer, findChromeVerbose, sleep, disableGamepads } from './harness.mjs';

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

    const server = await startServer(8793);
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
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));

        // Fresh profile
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.evaluate(() => window.localStorage.clear());
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(300);

        // Fresh save must not be in dev mode; F-keys inert until enabled
        const preDev = await page.evaluate(() => {
            const s = window.__sovereignScar;
            return { enabled: s.dev.enabled, weapon: s.player.inventory.activeWeapon };
        });
        t.ok('fresh profile: dev off', preDev.enabled === false);
        t.ok('fresh profile: bare strike default', preDev.weapon === 'bare_strike', preDev.weapon);

        const result = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = false;
            s.menu.close();
            s.dev.enable(s.game);
            const beats = s.LEVELS.filter((l) => l.id.startsWith('beat-')).map((l) => l.id);
            const kills = [];
            for (const id of beats) {
                s.loadLevel(id);
                s.game.bossIntro = null;
                await new Promise((r) => setTimeout(r, 120));
                const level = s.game.level;
                const boss = level?.boss;
                if (!boss) {
                    kills.push({ id, ok: false, why: 'no boss' });
                    continue;
                }
                s.dev.handleKey('F2', s.game);
                for (let i = 0; i < 5; i++) level.update(0.05, s.game);
                kills.push({ id, ok: !!(boss.defeated || level._bossCleared), why: null });
            }
            // Beat 01 F2 kill must grant + equip the Anchor Link (S-extra)
            const anchor = {
                has: s.player.inventory.weapons.includes('anchor_link'),
            };
            // Drive the leviathan collapse + ending
            for (let i = 0; i < 75; i++) s.game.level.update(0.05, s.game);
            for (let i = 0; i < 30; i++) s.ending.update(0.05);
            const endingPhaseReached = s.ending.phase;
            // Advance through the epilogue slides to the stats card and read
            // the 12.4 ledger reconciliation the final screen must display.
            let ledgerCheck = null;
            if (s.ending.isActive) {
                for (let i = 0; i < 20 && s.ending.phase !== 'stats'; i++) s.ending.advance();
                const el = document.getElementById('ss-ledger-check');
                const card = document.getElementById('ss-ending')?.textContent || '';
                ledgerCheck = el ? {
                    phase: s.ending.phase,
                    reconciled: el.dataset.reconciled === 'true',
                    showsBreakdown: /boss/.test(card) && /Ledger reconciled/.test(card),
                } : { phase: s.ending.phase, reconciled: false, showsBreakdown: false };
            }
            let prog = {};
            try {
                prog = JSON.parse(window.localStorage.getItem('vsbeu.progress') || '{}').sovereignProgress || {};
            } catch (_) {}
            return {
                kills,
                anchor,
                endingPhase: endingPhaseReached,
                ledgerCheck,
                campaignComplete: prog.campaignComplete === true,
                devBadgeShown: document.getElementById('ss-dev-badge')?.style.display !== 'none',
            };
        });

        for (const k of result.kills) {
            t.ok(`dev F2 defeats ${k.id}`, k.ok, k.why || '');
        }
        t.ok('anchor link granted by Warden kill', result.anchor.has);
        t.ok('ending sequence reached', result.endingPhase !== 'idle', `phase=${result.endingPhase}`);
        t.ok('final screen reconciles the score ledger with the displayed total (12.4)',
            !!result.ledgerCheck && result.ledgerCheck.phase === 'stats'
            && result.ledgerCheck.reconciled && result.ledgerCheck.showsBreakdown,
            JSON.stringify(result.ledgerCheck));
        t.ok('campaignComplete persisted', result.campaignComplete);
        t.ok('dev badge visible during run', result.devBadgeShown);
        t.ok('no fatal pageerrors', errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 5).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
