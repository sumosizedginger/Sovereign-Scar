// PRINT-ONLY QA probe: where does a grapple actually put you down?
//
// Owner report: "with the grapple, is there a way to make it more consistent?
// I should be able to grapple and land on the ledge, not fall into darkness if
// I'm not pushing forward."
//
// The windworks gap in 04 Sky Monument is the campaign's grapple tutorial.
// This fires the real grapple across it with NO movement input and prints
// where the player ends up relative to the hole.

import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';

async function main() {
    const chrome = findChromeVerbose();
    if (!chrome.path) { console.error('No Chrome'); process.exit(2); }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8833);
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
            player.inventory.grantItem('magnetic_grapple');

            // windworks: grid [1,-1], stride 64 => origin (64, -64).
            // gap rect local z -6..-3  =>  world z in [-70, -66]
            // south rim local -2 (world -66) ; north rim local -7 (world -71)
            const Ox = 64, Oz = -64;
            const gap = { z0: Oz - 6, z1: Oz - 3 + 1 };
            r.gap = { worldZfrom: gap.z0, worldZto: gap.z1 };
            r.rims = {
                southGroundY: f2(level.groundY?.(Ox, Oz - 2)),
                northGroundY: f2(level.groundY?.(Ox, Oz - 7)),
            };
            r.solidUnderGap = [-6, -5, -4, -3].map((lz) =>
                ({ localZ: lz, solid: !!level.getVoxelAt(Ox, 0.5, Oz + lz) }));

            // Aim north, stand on the south rim, do NOT press a direction.
            const startZ = Oz - 2;
            player.rig.position.set(Ox, r.rims.southGroundY ?? 1.95, startZ);
            player.physics.resetVelocity();
            player.physics.grounded = true;
            player.physics._wasGrounded = true;
            player.state.setFacing(0, -1);
            player.health.fullRestore();

            // Find the blocker runtime's anchor points, and fire at the far one.
            const sysWithAnchors = (level.systems || [])
                .find((sy) => Array.isArray(sy.anchorPoints) && sy.anchorPoints.length);
            r.anchorPoints = sysWithAnchors?.anchorPoints?.map((a) => ({
                x: f2(a.x), z: f2(a.z),
            })) ?? null;

            // Drive the REAL path: the blocker's update() reads consumeGrapple().
            let fired = false;
            const realConsume = s.game.input?.consumeGrapple?.bind(s.game.input);
            if (s.game.input) {
                s.game.input.consumeGrapple = () => {
                    if (fired) return false;
                    fired = true;
                    return true;
                };
            }

            // The game's own Input, with only the walk vector held at centre.
            const baseInput = s.game.input;
            const noInput = Object.create(baseInput);
            noInput.moveVector = () => ({ x: 0, z: 0 });
            noInput.padAim = null;

            const trail = [];
            const hpStart = player.health.hp;
            for (let i = 0; i < 240; i++) {
                level.update(1 / 60, s.game);
                // The REAL input object, with the stick centred: the owner's
                // case is "not pushing forward", not "a different input class".
                player.update(1 / 60, noInput, [], []);
                if (i % 10 === 0) {
                    const p = player.root.position;
                    trail.push({
                        f: i, z: f2(p.z), y: f2(p.y),
                        grappling: player.grapple.active,
                        hp: player.health.hp,
                    });
                }
            }
            if (realConsume) s.game.input.consumeGrapple = realConsume;

            const p = player.root.position;
            const insideGap = p.z >= gap.z0 && p.z <= gap.z1;
            r.result = {
                grappleFired: fired,
                startZ: f2(startZ),
                endZ: f2(p.z),
                endY: f2(p.y),
                crossedToNorthRim: p.z < gap.z0,
                endedInsideTheHole: insideGap,
                hpStart, hpEnd: player.health.hp,
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
