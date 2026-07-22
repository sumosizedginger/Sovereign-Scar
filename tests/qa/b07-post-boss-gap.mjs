// Live QA: beat-07 weeping-hall gap must be walkable after Hydroid defeat
// (blocker:b07-hall-gap cleared → basalt bridge + physics registration).

import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        console.error('No Chrome');
        process.exit(2);
    }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8817);
    const browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    try {
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(90000);
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));

        await page.goto(`${server.url}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.player),
            { timeout: 30000 },
        );
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(800);

        const res = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = true;
            s.menu.close();
            s.game.paused = true;
            s.loadLevel('beat-07-sluice');
            await new Promise((r) => setTimeout(r, 700));

            const level = s.game.level;
            const player = s.player;
            const out = {};

            // weepinghall grid [0,-1], stride 64 → origin (0, -64)
            // Gap local z -3..-1 → world cells with lz in that range
            const Ox = 0;
            const Oz = -64;
            const gapZs = [-66.5, -66, -65.5, -65, -64.5]; // interior of carved band

            out.gapOpenBefore = gapZs.every((z) => !level.getVoxelAt(Ox, 0.5, z));
            out.northRimSolid = !!level.getVoxelAt(Ox, 0.5, Oz - 4);
            out.southRimSolid = !!level.getVoxelAt(Ox, 0.5, Oz + 0);

            level.keyStore.open('blocker:b07-hall-gap');
            out.blockerOpen = level.keyStore.isOpen('blocker:b07-hall-gap');
            for (let i = 0; i < 4; i++) level.update(0.05, s.game);

            out.gapBridged = gapZs.every((z) => !!level.getVoxelAt(Ox, 0.5, z));
            out.gapSamplesAfter = gapZs.map((z) => ({
                z, solid: !!level.getVoxelAt(Ox, 0.5, z),
            }));

            player.inventory.grantItem('magnetic_grapple');
            player.setGetVoxelAt(level.getVoxelAt.bind(level));
            player.rig.position.set(Ox, 1.95, Oz - 6);
            player.physics.grounded = true;
            player.physics.resetVelocity();
            player.health.fullRestore();
            const hp0 = player.health.hp;

            for (let i = 0; i < 90; i++) {
                player.physics.update(s.game.collisionWorld, 1 / 30, {
                    wishX: 0, wishZ: 1, speed: 5.5, half: 0.4,
                });
                level.update(1 / 30, s.game);
            }
            const p = player.root.position;
            out.walk = {
                x: +p.x.toFixed(2),
                y: +p.y.toFixed(2),
                z: +p.z.toFixed(2),
                grounded: player.physics.grounded,
                hp: player.health.hp,
                hp0,
            };
            // South of former gap, still standing, no env damage from fall catch
            out.walkedAcross = p.z > Oz - 0.5 && player.health.hp === hp0 && p.y > 1.4;

            // Peg span (local) within base grapple
            const hall = level.def.rooms.weepinghall;
            const gap = (hall.blockers || []).find((b) => b.id === 'b07-hall-gap');
            out.pegSpan = Math.abs((gap?.anchor?.z ?? 99) - (gap?.reverseAnchor?.z ?? 0));
            out.dualPegs = !!(gap?.anchor && gap?.reverseAnchor);

            return out;
        });

        const outPath = path.join(__dirname, 'out', 'b07-post-boss-gap.json');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify({ res, errors }, null, 2));
        console.log(JSON.stringify({ res, errors }, null, 2));

        const ok = res.gapOpenBefore
            && res.blockerOpen
            && res.gapBridged
            && res.walkedAcross
            && res.dualPegs
            && res.pegSpan <= 10
            && errors.length === 0;
        console.log(ok ? 'PASS' : 'FAIL');
        process.exit(ok ? 0 : 1);
    } finally {
        await browser.close();
        await server.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
