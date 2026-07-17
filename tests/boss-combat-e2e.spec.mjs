// Browser E2E: every boss is beatable through REAL combat — the player's
// actual tryAttack path (swept arcs, boss shields/armor/phase windows,
// multi-core), not the hp=0 shortcut boss-e2e uses. This is the automated
// stand-in for the Phase R "boss beatable" half of the manual playthrough.
//
// Method: warp into the boss room (enterRoom — position teleports trip door
// triggers), then a chase-and-swing loop: each 0.05s tick, stand beside the
// nearest living target, face it, swing, tick the level. God-heal each tick
// (we certify killability, not survivability). If half the budget passes
// with no damage dealt, rotate to the next weapon.

import { startServer, findChromeVerbose, sleep } from './harness.mjs';

const BEATS = [
    'beat-01-crypt', 'beat-02-spindle', 'beat-03-sink', 'beat-04-sky',
    'beat-05-citadel', 'beat-06-quarry', 'beat-07-sluice', 'beat-08-bone',
    'beat-09-town', 'beat-10-cryo', 'beat-11-mire', 'beat-12-pyre',
    'beat-13-gumoi', 'beat-14-leviathan',
];

export async function run(t) {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }
    const puppeteer = (await import('puppeteer-core')).default;
    const server = await startServer(8792);
    let browser;
    const errors = [];
    try {
        browser = await puppeteer.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(120000);
        page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        await page.mouse.click(400, 300);
        await sleep(300);

        const results = await page.evaluate(async (BEATS) => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = false;
            s.menu.close();
            const out = [];
            const WEAPONS = ['tectonic_wedge', 'heavy_mallet', 'light_caster', 'anchor_link'];
            const BUDGET = 3000; // × 0.05s = 150 simulated seconds per boss

            for (const levelId of BEATS) {
                const r = { levelId, cleared: false, simSeconds: 0, weapon: null, hpLeft: null, err: null };
                try {
                    s.loadLevel(levelId);
                    s.game.bossIntro = null;
                    // Don't let the B4 collapse cascade fire the real ending
                    if (levelId === 'beat-14-leviathan') s.game.startEnding = () => {};
                    const level = s.game.level;
                    const player = s.player;
                    for (const w of WEAPONS) player.inventory.addWeapon(w);
                    const rid = Object.keys(level.def.rooms).find((k) => level.def.rooms[k].boss);
                    level.enterRoom(rid, s.game);
                    const boss = level.boss;

                    const living = () => {
                        if (boss.cores) {
                            const c = boss.cores.find((x) => x.state.current !== 'DEAD');
                            return c ? c.root.position : null;
                        }
                        return boss.state?.current === 'DEAD' ? null : boss.root.position;
                    };
                    const hpOf = () => (boss.hpFrac != null ? boss.hpFrac : boss.hp / (boss.maxHp || 1));

                    let wi = 0;
                    player.inventory.setWeapon(WEAPONS[wi]);
                    let lastHp = hpOf();
                    let stale = 0;
                    let i = 0;
                    for (; i < BUDGET; i++) {
                        if (level._bossCleared) break;
                        const bp = living();
                        if (bp) {
                            // Play it like a player: kite at range while the
                            // boss is shielded/unhittable (baits the Arachnid
                            // leap, waits out Phantasm dematerialization),
                            // dart in and swing when the window opens.
                            const guarded = !boss.cores
                                && (boss.shielded || boss.canHit === false);
                            const dist = guarded ? 6 : 1.2;
                            player.rig.position.set(bp.x + dist, 1.95, bp.z + 0.4);
                            player.physics.resetVelocity();
                            player.physics.grounded = true;
                            player.state.setFacing(-1, 0);
                            player.health.hp = player.health.max; // god: killability only
                            if (!guarded) {
                                player.attackCd = 0;
                                player.tryAttack(level.enemies, level.destructibles);
                            }
                        }
                        level.update(0.05, s.game);
                        const hp = hpOf();
                        if (hp < lastHp - 0.001) { stale = 0; lastHp = hp; } else { stale++; }
                        // No damage for 15 sim-seconds → try the next weapon
                        if (stale > 300 && wi < WEAPONS.length - 1) {
                            wi++;
                            player.inventory.setWeapon(WEAPONS[wi]);
                            stale = 0;
                        }
                    }
                    // Let defeat wiring (collapse systems etc.) settle a few ticks
                    for (let k = 0; k < 5; k++) level.update(0.05, s.game);
                    r.cleared = !!level._bossCleared;
                    r.simSeconds = +(i * 0.05).toFixed(1);
                    r.weapon = WEAPONS[wi];
                    r.hpLeft = +hpOf().toFixed(2);
                } catch (e) {
                    r.err = String(e).slice(0, 300);
                }
                out.push(r);
            }
            return out;
        }, BEATS);

        for (const r of results) {
            t.ok(`${r.levelId} boss falls to real combat`,
                r.cleared && !r.err,
                r.err || `in ${r.simSeconds}s (weapon ${r.weapon}, hpFrac left ${r.hpLeft})`);
        }
        t.ok('no fatal pageerrors',
            errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 5).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
