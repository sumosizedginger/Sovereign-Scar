// PRINT-ONLY QA probe: the drop-damage report.
//
// Owner report: "Why am I losing health with a 1 square drop once I pick up a
// cipher lens? ... this drop and take damage is pissing me off."
//
// VoxelPhysicsBody measures a fall as `_fallStartY - landingY`. This probe asks
// one question: does `_fallStartY` actually track where you left the ground?
//
// Nothing here asserts. It prints what the running game does.

import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';

async function main() {
    const chrome = findChromeVerbose();
    if (!chrome.path) { console.error('No Chrome'); process.exit(2); }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8831);
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
            const r = {};
            const f2 = (n) => +Number(n).toFixed(2);

            const snap = () => ({
                incoming: player.health.incomingDamageMult,
                environment: player.health.environmentDamageMult,
            });
            r.multipliers = { atBoot: snap() };

            s.startNewGame('hard');
            await new Promise((k) => setTimeout(k, 500));
            r.runMode = s.progress().runMode;
            r.multipliers.afterStartingHardRun = snap();

            s.game.atTitle = false;
            s.game.paused = true;
            s.menu?.close?.();
            s.game.paused = true;
            s.loadLevel('beat-04-sky');
            await new Promise((k) => setTimeout(k, 1000));

            const level = s.game.level;
            player.setGetVoxelAt(level.getVoxelAt.bind(level));
            player.health.fullRestore();
            r.anchorOnArrival = f2(phys._fallStartY);

            // ── The ascent room's tall step tower: grid [0,-2], stride 64.
            // steps(map, h, -6, -6, 4) => a 4-high pyramid at local (-6,-6).
            const Ox = 0, Oz = -128;
            const towerX = Ox - 6, towerZ = Oz - 6;
            const groundY = (x, z) => level.groundY?.(x, z);
            r.tower = { x: towerX, z: towerZ, topGroundY: f2(groundY(towerX, towerZ)) };
            r.flatGroundY = f2(groundY(Ox, Oz));

            // Walk the player and report whether they actually moved.
            const step = (frames, wishX, wishZ) => {
                const events = [];
                for (let i = 0; i < frames; i++) {
                    const res = phys.update(s.game.collisionWorld, 1 / 60, {
                        wishX, wishZ, speed: 5.5, half: 0.4,
                    });
                    if (res.landed) {
                        events.push({
                            atY: f2(player.root.position.y),
                            reportedFall: f2(res.fallDistance),
                            damage: f2(res.damage),
                        });
                    }
                }
                return events;
            };

            const place = (x, y, z) => {
                player.rig.position.set(x, y, z);
                phys.resetVelocity();
                phys.grounded = true;
                phys._wasGrounded = true;
            };

            // ── CASE 1: climb the tower, walk back down. No combat. ───────────
            place(towerX + 5, r.flatGroundY, towerZ);
            player.health.fullRestore();
            const climb = step(150, -1, 0);
            r.case1_climb = {
                endedAtY: f2(player.root.position.y),
                endedAtX: f2(player.root.position.x),
                anchorAfterClimb: f2(phys._fallStartY),
                landedEvents: climb,
            };
            const down = step(200, 1, 0);
            r.case1_walkDown = {
                endedAtY: f2(player.root.position.y),
                anchor: f2(phys._fallStartY),
                landedEvents: down,
                hp: player.health.hp,
            };

            // ── CASE 2: take a knockback while up on the tower, then come down.
            // combat-sweeper.js applies exactly applyImpulse(kx, 1.5, kz).
            place(towerX, groundY(towerX, towerZ), towerZ);
            player.health.fullRestore();
            phys.applyImpulse(0, 1.5, 0);
            step(60, 0, 0); // let the hop settle
            r.case2_afterKnockbackOnTower = {
                y: f2(player.root.position.y),
                anchor: f2(phys._fallStartY),
            };
            const hp0 = player.health.hp;
            const downHit = step(260, 1, 0);
            r.case2_walkDown = {
                endedAtY: f2(player.root.position.y),
                endedAtX: f2(player.root.position.x),
                anchor: f2(phys._fallStartY),
                landedEvents: downHit,
                hpBefore: hp0,
                hpAfter: player.health.hp,
            };

            // ── CASE 3: the anchor is now stale-high. Does an ordinary 1-cell
            // step-off ANYWHERE still bill you for the tower you left minutes ago?
            const staleAnchor = f2(phys._fallStartY);
            // Find a real 1-cell ledge on flat ground and step off it.
            let ledge = null;
            for (let x = Ox - 8; x < Ox + 8 && !ledge; x += 1) {
                for (let z = Oz - 8; z < Oz + 8; z += 1) {
                    const a = groundY(x, z), b = groundY(x + 1, z);
                    if (a == null || b == null) continue;
                    if (Math.abs((a - b) - 1) < 0.01) { ledge = { x, z, hi: a, lo: b }; break; }
                }
            }
            r.case3 = { staleAnchor, ledge };
            if (ledge) {
                place(ledge.x - 0.3, ledge.hi, ledge.z);
                phys._fallStartY = staleAnchor; // as the run left it
                player.health.fullRestore();
                const before = player.health.hp;
                const startX = player.root.position.x;
                const ev = step(120, 1, 0);
                r.case3.result = {
                    movedFrom: f2(startX),
                    movedTo: f2(player.root.position.x),
                    actualDrop: 1,
                    landedEvents: ev,
                    hpBefore: before,
                    hpAfter: player.health.hp,
                    hpLost: f2(before - player.health.hp),
                };
                // Counterfactual: same drop, honest anchor.
                place(ledge.x - 0.3, ledge.hi, ledge.z);
                phys._fallStartY = ledge.hi;
                player.health.fullRestore();
                const before2 = player.health.hp;
                const ev2 = step(120, 1, 0);
                r.case3.withHonestAnchor = {
                    landedEvents: ev2,
                    hpLost: f2(before2 - player.health.hp),
                };
            }

            // ── CASE 4: does the anchor survive a level change? ────────────────
            phys._fallStartY = 999;
            s.loadLevel('beat-03-sink');
            await new Promise((k) => setTimeout(k, 900));
            r.case4_anchorAfterLevelChange = f2(phys._fallStartY);

            return r;
        });

        console.log(JSON.stringify(out, null, 2));
    } finally {
        await browser.close();
        await server.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
