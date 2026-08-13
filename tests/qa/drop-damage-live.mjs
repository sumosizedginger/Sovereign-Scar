// PRINT-ONLY QA probe: what actually damages the player on a small drop?
//
// Owner report: "Why am I losing health with a 1 square drop ... this drop and
// take damage is pissing me off." Reported while playing 04 Sky Monument.
//
// Rather than guess which system fires, this wraps health.damage() and records
// EVERY hit with its source and the physics state at the moment it landed.

import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';

async function main() {
    const chrome = findChromeVerbose();
    if (!chrome.path) { console.error('No Chrome'); process.exit(2); }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8832);
    const browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    try {
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(90000);
        page.on('pageerror', (e) => console.error('PAGEERROR', e.message));

        await page.goto(`${server.url}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.player),
            { timeout: 30000 },
        );
        await page.mouse.click(400, 300);
        await sleep(600);

        const out = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const player = s.player;
            const phys = player.physics;
            const f2 = (n) => (n == null ? null : +Number(n).toFixed(2));
            const r = {};

            s.startNewGame('medium');
            await new Promise((k) => setTimeout(k, 500));
            s.game.atTitle = false;
            s.game.paused = true;
            s.menu?.close?.();
            s.game.paused = true;
            s.loadLevel('beat-04-sky');
            await new Promise((k) => setTimeout(k, 1000));
            const level = s.game.level;
            player.setGetVoxelAt(level.getVoxelAt.bind(level));

            // ── Record every damage event with its source ─────────────────────
            const hits = [];
            const orig = player.health.damage.bind(player.health);
            player.health.damage = (amount, iFrames, source, meta) => {
                hits.push({
                    amount: f2(amount), source: source || 'hostile',
                    atY: f2(player.root.position.y),
                    atX: f2(player.root.position.x),
                    atZ: f2(player.root.position.z),
                    anchor: f2(phys._fallStartY),
                    grounded: phys.grounded,
                });
                return orig(amount, iFrames, source, meta);
            };

            // ── The windworks grapple gap. Room grid [1,-1], stride 64.
            // rect x0..x1 = -2..2, z0..z1 = -6..-3 (LOCAL cells).
            const Ox = 64, Oz = -64;
            const groundY = (x, z) => level.groundY?.(x, z);

            // How deep is the carved gap, actually?
            r.gapGeometry = {
                rimSouthGroundY: f2(groundY(Ox, Oz - 2)),
                insideGapGroundY: [-6, -5, -4, -3].map((lz) => ({
                    localZ: lz, groundY: f2(groundY(Ox, Oz + lz)),
                    solidAtY0: !!level.getVoxelAt(Ox, 0.5, Oz + lz),
                    solidAtY1: !!level.getVoxelAt(Ox, 1.5, Oz + lz),
                })),
                rimNorthGroundY: f2(groundY(Ox, Oz - 7)),
            };

            // ── Walk north off the south rim, straight into the gap ───────────
            player.health.fullRestore();
            player.rig.position.set(Ox, groundY(Ox, Oz - 1) ?? 1.95, Oz - 1);
            phys.resetVelocity(); phys.grounded = true; phys._wasGrounded = true;
            const hpBefore = player.health.hp;
            const startZ = player.root.position.z;
            hits.length = 0;

            const trail = [];
            for (let i = 0; i < 200; i++) {
                phys.update(s.game.collisionWorld, 1 / 60, {
                    wishX: 0, wishZ: -1, speed: 5.5, half: 0.4,
                });
                // The blocker runtime is what catches the fall — run the level.
                level.update(1 / 60, s.game);
                if (i % 20 === 0) {
                    trail.push({
                        f: i, z: f2(player.root.position.z),
                        y: f2(player.root.position.y), hp: player.health.hp,
                    });
                }
            }
            r.walkIntoGap = {
                fromZ: f2(startZ),
                toZ: f2(player.root.position.z),
                finalY: f2(player.root.position.y),
                hpBefore, hpAfter: player.health.hp,
                hpLost: f2(hpBefore - player.health.hp),
                damageEvents: hits.slice(0, 12),
                totalDamageEvents: hits.length,
                trail,
            };

            return r;
        });

        console.log(JSON.stringify(out, null, 2));
    } finally {
        await browser.close();
        await server.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
