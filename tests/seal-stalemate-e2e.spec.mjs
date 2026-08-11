// Browser E2E: a sealed room can hold you, but it cannot hold you forever.
//
// `tests/game/room-seal.spec.mjs` checks the seal against level DATA — never
// the entry room, never one with an overworld exit, never one holding something
// unreachable. That is everything a static check can see, and it was not
// enough: a RUNTIME state existed in which the fight simply stopped resolving.
// With dev god mode on, `health.damage` returned before `damageFilter`, so no
// parry could fire, so a bulwark's plate never dropped, so beat-05's greathall
// held the player against an enemy that could neither hurt them nor be hurt.
// Two minutes of that measured 89 enemy wind-ups, 0 staggers and 0 damage in
// either direction, with the door still shut.
//
// That cause is fixed in `dev/dev-mode.js`. This spec is about the guarantee
// rather than the cause: whatever produces the NEXT dead fight, the door has to
// open eventually. It runs against the real room graph because the valve lives
// inside the level closure and reads live enemy HP — the shape of the fix is
// not something a source-level assertion can honestly check.

import { startServer, findChromeVerbose, disableGamepads, sleep } from './harness.mjs';

export async function run(t) {
    let puppeteer;
    try {
        puppeteer = (await import('puppeteer-core')).default;
    } catch (e) {
        t.ok('puppeteer-core', false, String(e));
        return;
    }
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.skip('Chrome not found');
        return;
    }

    const server = await startServer(8804);
    let browser;
    const errors = [];
    try {
        browser = await puppeteer.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(300000);
        page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(500);

        const r = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false; s.game.paused = false; s.menu.close();

            /** Enter beat-05's sealed greathall with the fight untouched. */
            function greathall() {
                s.loadLevel('beat-05-citadel');
                s.game.bossIntro = null;
                const lvl = s.game.level;
                lvl.enterRoom('greathall', s.game);
                const p = s.player;
                // Park the player in the middle, out of everyone's way. The
                // enemies will still come — that is the point of the control.
                p.physics.resetVelocity(); p.physics.grounded = true;
                p.health.hp = p.health.max;
                return { lvl, p };
            }

            const out = {};

            // 1. The seal engages at all.
            {
                const { lvl } = greathall();
                out.sealedOnEntry = !!lvl.sealState();
                out.remaining = lvl.sealState()?.remaining || 0;
            }

            // 2. A genuine stalemate opens it. Freeze the encounter completely:
            //    nothing moves, nothing swings, no HP changes anywhere.
            {
                const { lvl, p } = greathall();
                const foes = (lvl.enemies || []).filter(
                    (e) => e.state?.current !== 'DEAD' && !e.defeated);
                let openedAfter = null;
                for (let i = 0; i < 60 * 20 && openedAfter === null; i++) {   // 60s at dt 1/20
                    // Hold the fight completely still: no attacks, no chasing,
                    // no damage in either direction.
                    for (const e of foes) { e.attackCd = 99; e._windupT = 0; e._pendingStrike = null; }
                    p.physics.resetVelocity(); p.physics.grounded = true;
                    p.health.hp = p.health.max;
                    lvl.update(1 / 20, s.game);
                    if (!lvl.sealState()) openedAfter = +(i / 20).toFixed(1);
                }
                out.stalemateOpenedAfter = openedAfter;
                out.stalemateEnemiesStillAlive = foes.filter(
                    (e) => e.state?.current !== 'DEAD' && !e.defeated).length;
            }

            // 3. THE CONTROL. A fight in progress must NOT trip the valve, or
            //    the seal is a 45-second timer and means nothing. Same duration,
            //    same standing-still player — the only difference is that hits
            //    are landing.
            {
                const { lvl, p } = greathall();
                const foes = (lvl.enemies || []).filter(
                    (e) => e.state?.current !== 'DEAD' && !e.defeated);
                let openedEarly = false, chips = 0;
                for (let i = 0; i < 60 * 20; i++) {
                    // A slow trickle of damage — one chip every 5 seconds, far
                    // slower than any real fight, and never enough to kill.
                    if (i % 100 === 0) {
                        const alive = foes.filter(
                            (e) => e.state?.current !== 'DEAD' && !e.defeated);
                        if (alive.length) { alive[0].hp -= 0.01; chips++; }
                    }
                    for (const e of foes) { e.attackCd = 99; e._windupT = 0; e._pendingStrike = null; }
                    p.physics.resetVelocity(); p.physics.grounded = true;
                    p.health.hp = p.health.max;
                    lvl.update(1 / 20, s.game);
                    if (!lvl.sealState()) { openedEarly = true; break; }
                }
                out.liveFightHeld = !openedEarly;
                out.liveFightChips = chips;
                out.liveFightAlive = foes.filter(
                    (e) => e.state?.current !== 'DEAD' && !e.defeated).length;
            }

            // 4. Clearing the room is still the normal way out.
            {
                const { lvl } = greathall();
                for (const e of lvl.enemies || []) {
                    if (e.managedBySystem) continue;
                    if (e.state) e.state.current = 'DEAD';
                    e.defeated = true;
                }
                out.clearedReleases = !lvl.sealState();
            }
            return out;
        });

        t.ok('a sealed room holds the player on entry',
            r.sealedOnEntry, `${r.remaining} enemies standing`);
        t.ok('clearing the room releases the seal', r.clearedReleases);

        // The valve itself.
        t.ok('a total stalemate releases the seal',
            r.stalemateOpenedAfter !== null && r.stalemateOpenedAfter >= 40,
            `opened after ${r.stalemateOpenedAfter}s of a frozen fight`);
        t.ok('the stalemate release does not require killing anything',
            r.stalemateEnemiesStillAlive > 0,
            `${r.stalemateEnemiesStillAlive} still standing when the door opened`);

        // …and the control that stops it being a plain timer.
        t.ok('a fight still resolving is NOT released by the valve',
            r.liveFightHeld,
            `held for 60s across ${r.liveFightChips} chips of damage, `
            + `${r.liveFightAlive} enemies alive`);

        t.ok('no fatal pageerrors',
            errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 4).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
