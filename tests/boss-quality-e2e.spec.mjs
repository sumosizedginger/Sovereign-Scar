// Browser E2E: every boss fight has to BE a fight.
//
// boss-combat-e2e already proves each boss can be reduced to zero HP. That is
// a much weaker claim than it sounds, and it passed at full green while:
//
//   • 8 of 14 bosses moved on paths that were byte-identical no matter where
//     the player stood — the Sand Spur traced the same four corners forever,
//     and 4 of them had no player-targeted attack at all, so the only way to
//     be hurt was to walk into one;
//   • the GUMOI Witness hovered ~7 units above the player's head, where the
//     vertical gate in hitboxCheck rejects every melee weapon in the game. It
//     was killable only by the Light Caster, and only because a ray move
//     carries no `vertical` field, so the gate compared against undefined,
//     produced NaN, and let the hit through by accident;
//   • the Obsidian Arachnid deadlocked: armoured except mid-leap, and it only
//     leapt at range, so a player who walked up and stayed there swung forever
//     into a boss that could never be damaged and could never open;
//   • no boss anywhere had a recovery window, so reading a wind-up bought you
//     nothing and mashing was optimal everywhere.
//
// So this spec asserts the properties that make the loop a loop, each of which
// is something the "it dies eventually" test cannot see.

import { startServer, findChromeVerbose, disableGamepads, sleep } from './harness.mjs';

const BEATS = [
    'beat-01-crypt', 'beat-02-spindle', 'beat-03-sink', 'beat-04-sky',
    'beat-05-citadel', 'beat-06-quarry', 'beat-07-sluice', 'beat-08-bone',
    'beat-09-town', 'beat-10-cryo', 'beat-11-mire', 'beat-12-pyre',
    'beat-13-gumoi', 'beat-14-leviathan',
];

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
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }

    const server = await startServer(8794);
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

        const results = await page.evaluate(async (BEATS) => {
            const s = window.__sovereignScar;
            s.game.atTitle = false; s.game.paused = false; s.menu.close();

            function enter(id) {
                s.loadLevel(id);
                s.game.bossIntro = null;
                if (id === 'beat-14-leviathan') s.game.startEnding = () => {};
                const lvl = s.game.level;
                const rid = Object.keys(lvl.def.rooms).find((k) => lvl.def.rooms[k].boss);
                lvl.enterRoom(rid, s.game);
                return lvl;
            }

            const isOpen = (boss) => (boss.cores
                ? boss.cores.some((c) => (c.vulnerableMult || 1) > 1)
                : !!boss.staggered);

            // Boss trajectory while the player stands perfectly still at a
            // given spot, never attacking.
            function observe(id, ox, oz) {
                const lvl = enter(id), p = s.player, boss = lvl.boss;
                const tgt = boss.cores ? boss.cores[0] : boss;
                const at = { x: tgt.home.x + ox, z: tgt.home.z + oz };
                const path = [];
                let openTicks = 0, hurtTicks = 0, hp0 = p.health.hp;
                for (let i = 0; i < 900; i++) {
                    p.rig.position.set(at.x, 1.95, at.z);
                    p.physics.resetVelocity(); p.physics.grounded = true;
                    lvl.update(0.05, s.game);
                    if (isOpen(boss)) openTicks++;
                    if (p.health.hp < hp0) { hurtTicks++; hp0 = p.health.hp; }
                    p.health.hp = p.health.max; hp0 = p.health.max;
                    if (i % 60 === 0) {
                        path.push([+tgt.root.position.x.toFixed(2), +tgt.root.position.z.toFixed(2)]);
                    }
                }
                return { path, openTicks, hurtTicks };
            }

            const out = [];
            for (const id of BEATS) {
                const r = { id };
                try {
                    // Two genuinely different vantage points: different angle
                    // AND different distance. (Equal-distance offsets make a
                    // radially symmetric boss look inert when it is not.)
                    const a = observe(id, 7, 0);
                    const b = observe(id, -2, 5);
                    let md = 0;
                    for (let i = 0; i < Math.min(a.path.length, b.path.length); i++) {
                        md = Math.max(md,
                            Math.hypot(a.path[i][0] - b.path[i][0], a.path[i][1] - b.path[i][1]));
                    }
                    r.divergence = +md.toFixed(2);
                    r.openSecs = +((a.openTicks + b.openTicks) * 0.05 / 2).toFixed(1);

                    // Beatable ON FOOT, with MELEE, from floor level, using the
                    // weakest real weapon. No ray weapon, no height cheat.
                    const lvl = enter(id), p = s.player, boss = lvl.boss;
                    p.inventory.addWeapon('anchor_link');
                    p.inventory.setWeapon('anchor_link');
                    const b0 = (boss.cores ? boss.cores[0] : boss).root.position;
                    p.rig.position.set(b0.x + 2, 1.95, b0.z);
                    p.physics.resetVelocity(); p.physics.grounded = true;
                    let conn = 0;
                    for (let i = 0; i < 4000; i++) {
                        const alive = boss.cores
                            ? boss.cores.filter((c) => c.state.current !== 'DEAD')
                            : (boss.state?.current === 'DEAD' ? [] : [boss]);
                        if (!alive.length) break;
                        const bp = alive[0].root.position;
                        const guarded = alive[0].shielded || alive[0].canHit === false;
                        const dx = bp.x - p.rig.position.x, dz = bp.z - p.rig.position.z;
                        const d = Math.hypot(dx, dz) || 1;
                        // Hold just outside contact while guarded, dart in when
                        // the window opens — how a person plays it.
                        const standoff = guarded ? 2.6 : 1.4;
                        const wish = d > standoff ? 1 : (d < standoff - 0.8 ? -1 : 0);
                        p.physics.update(s.game.collisionWorld, 0.05, {
                            wishX: (dx / d) * wish, wishZ: (dz / d) * wish,
                            speed: 6, half: 0.4,
                        });
                        p.state.setFacing(dx / d, dz / d);
                        p.health.hp = p.health.max;
                        if (!guarded && i % 6 === 0) {
                            p.attackCd = 0;
                            if (p.tryAttack(lvl.enemies, lvl.destructibles).length) conn++;
                        }
                        lvl.update(0.05, s.game);
                        if (lvl._bossCleared) break;
                    }
                    r.meleeKills = !!lvl._bossCleared;
                    r.conn = conn;
                } catch (e) { r.err = String(e).slice(0, 200); }
                out.push(r);
            }
            return out;
        }, BEATS);

        for (const r of results) {
            if (r.err) {
                t.ok(`${r.id} boss quality`, false, r.err);
                continue;
            }
            // 1. It is an opponent, not a cutscene: where you stand changes
            //    what it does.
            t.ok(`${r.id} boss reacts to where the player stands`,
                r.divergence > 0.5,
                `max path divergence ${r.divergence} between two vantage points`);
            // 2. Reading it earns something: a real opening, repeatedly.
            t.ok(`${r.id} boss opens a vulnerability window`,
                r.openSecs > 2,
                `open ${r.openSecs}s of 45s`);
            // 3. A sword can finish it. No ray weapon, no climbing, no NaN.
            t.ok(`${r.id} boss falls to melee from floor level`,
                r.meleeKills, `anchor_link, ${r.conn} connections`);
        }
        t.ok('no fatal pageerrors',
            errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 4).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
