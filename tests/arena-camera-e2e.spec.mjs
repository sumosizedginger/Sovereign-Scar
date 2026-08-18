// Browser E2E: the frame opens for a fight and closes when it is over.
//
// `tests/game/arena-camera.spec.mjs` holds the widen CURVE and the wiring, and
// it can hold nothing else: `camera-rig.js` imports `renderer.js`, which reads
// `window.innerWidth` at module scope, so the rig itself cannot be loaded by
// anything headless. Everything about how it BEHAVES over time — that the widen
// eases rather than snaps, that it comes back down, that the flinch returns the
// camera to where it started, that the arena never drags the frame off the
// player — needs a real rig in a real browser, and that is this file.
//
// It drives `camRig.update` directly with known threat positions rather than
// playing the fight. A real fight is not reproducible: enemies chase, brood
// split, and the widest-threat distance is a `max()` over up to six bodies that
// changes every frame. Driving it means the input is stated and the output is
// the rig's, which is the thing under test. The seal GATE is checked against
// the real room graph in the same run, because that half is reproducible.

import { startServer, findChromeVerbose, disableGamepads, sleep } from './harness.mjs';
import { ARENA_WIDEN_MAX, ARENA_WIDEN_FREE } from '../src/game/camera-framing.js';

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

    const server = await startServer(8812);
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
        await sleep(300);

        const r = await page.evaluate(async (MAX, FREE) => {
            const s = window.__sovereignScar;
            s.startNewGame();
            s.game.atTitle = false; s.game.paused = false; s.menu.close();

            const out = {};

            // ── 1. THE GATE, against the real room graph ───────────────────
            {
                s.loadLevel('beat-10-cryo');
                s.game.bossIntro = null;
                const lvl = s.game.level;
                lvl.enterRoom('coldstore', s.game);
                out.sealed = !!lvl.sealState();
                out.remaining = lvl.sealState()?.remaining || 0;
                const th = lvl.arenaThreats() || [];
                out.threatCount = th.length;
                // The list has to be the SAME enemies the door is counting.
                out.threatsMatchRemaining = th.length === out.remaining;
                out.threatsHaveCoords = th.every(
                    (p) => Number.isFinite(p.x) && Number.isFinite(p.z));

                // Clear the room: the threats go away with the seal.
                for (const e of lvl.enemies || []) {
                    if (e.managedBySystem) continue;
                    if (e.state) e.state.current = 'DEAD';
                    e.defeated = true;
                }
                out.clearedReleases = !lvl.sealState();
                out.clearedThreats = lvl.arenaThreats();
            }

            // An UNSEALED room with enemies in it is not an arena.
            {
                const lvl = s.game.level;
                lvl.enterRoom('glacierhall', s.game);
                const wasSealed = !!lvl.sealState();
                // Break the seal the way the stalemate valve does, leaving the
                // enemies alive: the room still has threats, but it is no
                // longer holding the player, so the camera must not care.
                for (const e of lvl.enemies || []) { if (e.state) e.state.current = 'IDLE'; }
                out.unsealedWasSealed = wasSealed;
            }

            // ── 2. THE RIG, driven with stated inputs ──────────────────────
            //
            // Paused so the frame loop is not writing the same fields.
            s.game.paused = true;
            const rig = s.cameraRig;
            const cam = s.camera;
            const BASE_H = 17.5;                 // index.js CAM_HEIGHT
            const hero = { x: 0, y: 0, z: 0 };
            const step = (dt, n) => { for (let i = 0; i < n; i++) rig.update(dt, hero); };

            const reset = () => {
                rig.clearFocus();
                rig.setSecondSubject(null);
                rig.setArenaThreats(null);
                rig.setBounds(null);            // isolate from the room clamp
                rig.snapTo(hero);
                step(1 / 60, 30);
            };

            reset();
            out.restY = +cam.position.y.toFixed(3);

            // 2a. A fight at knife range costs nothing.
            {
                reset();
                rig.setArenaThreats([{ x: 2, z: 1 }, { x: -1.5, z: 2 }]);
                step(1 / 60, 180);              // 3s
                out.kniferangeW = +rig._arenaW.toFixed(4);
                out.kniferangeY = +cam.position.y.toFixed(3);
            }

            // 2b. A spread-out fight opens the frame, and EASES rather than snaps.
            {
                reset();
                const spread = [{ x: 0, z: 0 }, { x: 11, z: 6 }];   // ~12.5 apart
                rig.setArenaThreats(spread);
                const trace = [];
                for (let i = 0; i < 240; i++) {                     // 4s
                    rig.update(1 / 60, hero);
                    if (i % 12 === 0) trace.push(+rig._arenaW.toFixed(3));
                }
                out.openTrace = trace;
                out.openedW = +rig._arenaW.toFixed(4);
                out.openedY = +cam.position.y.toFixed(3);
                // Eased: after ONE frame it must be a long way short of target.
                reset();
                rig.setArenaThreats(spread);
                rig.update(1 / 60, hero);
                out.afterOneFrameW = +rig._arenaW.toFixed(4);
                // And the look target must NOT have moved toward the threats.
                out.afterOneFrameLookX = +rig._look.x.toFixed(4);
            }

            // 2c. …and it closes again when the room clears.
            {
                rig.setArenaThreats([{ x: 0, z: 0 }, { x: 11, z: 6 }]);
                step(1 / 60, 300);
                const peak = rig._arenaW;
                rig.setArenaThreats(null);
                step(1 / 60, 300);              // 5s
                out.peakW = +peak.toFixed(4);
                out.closedW = +rig._arenaW.toFixed(4);
                out.closedY = +cam.position.y.toFixed(3);
            }

            // 2d. The cap holds against an absurd fight.
            {
                reset();
                rig.setArenaThreats([{ x: 0, z: 0 }, { x: 400, z: 400 }]);
                step(1 / 60, 900);              // 15s, far past settling
                out.absurdW = +rig._arenaW.toFixed(4);
            }

            // 2e. The arena never drags the frame off the player.
            {
                reset();
                rig.setArenaThreats([{ x: 20, z: 20 }, { x: 18, z: 22 }]);
                step(1 / 60, 600);
                out.lookX = +rig._look.x.toFixed(3);
                out.lookZ = +rig._look.z.toFixed(3);
            }

            // 2f. The flinch dips IN and comes home.
            {
                reset();
                const before = cam.position.y;
                rig.sealPunch();
                let lowest = Infinity;
                for (let i = 0; i < 60; i++) {          // 1s, punch is 0.5s
                    rig.update(1 / 60, hero);
                    lowest = Math.min(lowest, cam.position.y);
                }
                step(1 / 60, 120);
                out.punchBefore = +before.toFixed(3);
                out.punchLowest = +lowest.toFixed(3);
                out.punchAfter = +cam.position.y.toFixed(3);
                out.punchCleared = !rig._punch;
            }

            // 2g. A level change does not leave the frame mid-exhale.
            {
                reset();
                rig.setArenaThreats([{ x: 0, z: 0 }, { x: 11, z: 6 }]);
                step(1 / 60, 300);
                out.beforeClearW = +rig._arenaW.toFixed(4);
                rig.clearFocus();
                out.afterClearW = +rig._arenaW.toFixed(4);
                out.afterClearThreats = rig._threats;
            }

            // 2h. Boss + arena together must not SUM.
            //
            // THE SUBJECT HAS TO BE INSIDE THE BOSS CHANNEL'S ENGAGEMENT RANGE
            // (`dist < 26`) or this measures nothing. The first version of this
            // put it at x=30, the boss weight decayed to zero, and "boss alone"
            // was the resting camera — so the comparison was arena-vs-nothing
            // wearing the name of arena-vs-boss. 20 is far enough to saturate
            // the boss widen and near enough to be engaged.
            {
                const far = { x: 20, z: 0 };
                reset();
                rig.setSecondSubject(far);
                step(1 / 60, 600);
                out.bossOnlyY = +cam.position.y.toFixed(3);

                reset();
                rig.setSecondSubject(far);          // boss channel wants a lot
                rig.setArenaThreats([{ x: 20, z: 0 }]);
                step(1 / 60, 600);
                out.bothY = +cam.position.y.toFixed(3);

                // …and the arena channel alone, so the three can be compared.
                reset();
                rig.setArenaThreats([{ x: 20, z: 0 }]);
                step(1 / 60, 600);
                out.arenaOnlyY = +cam.position.y.toFixed(3);
            }

            out.BASE_H = BASE_H;
            s.game.paused = false;
            return out;
        }, ARENA_WIDEN_MAX, ARENA_WIDEN_FREE);

        // ── The gate ───────────────────────────────────────────────────────
        t.ok('a sealed arena reports its threats',
            r.sealed && r.threatCount > 0, `${r.threatCount} threats, sealed=${r.sealed}`);
        t.ok('…and the list is the same fight the door is counting',
            r.threatsMatchRemaining, `${r.threatCount} vs remaining ${r.remaining}`);
        t.ok('…with real coordinates', r.threatsHaveCoords);
        t.ok('clearing the room releases the seal', r.clearedReleases);
        t.ok('…and the threat list goes with it',
            r.clearedThreats === null, `${JSON.stringify(r.clearedThreats)}`);

        // ── The rig ────────────────────────────────────────────────────────
        t.ok('a fight at knife range does not move the camera',
            r.kniferangeW === 0 && Math.abs(r.kniferangeY - r.restY) < 1e-6,
            `w=${r.kniferangeW} y=${r.kniferangeY} vs rest ${r.restY}`);

        t.ok('a spread-out fight opens the frame',
            r.openedW > 0.5 && r.openedY > r.restY + 0.4,
            `w=${r.openedW}, y ${r.restY} -> ${r.openedY}`);
        t.ok('…never past the cap',
            r.openedW <= ARENA_WIDEN_MAX + 1e-6, `${r.openedW} vs ${ARENA_WIDEN_MAX}`);
        t.ok('…and it EASES: one frame gets nowhere near the target',
            r.afterOneFrameW > 0 && r.afterOneFrameW < r.openedW * 0.15,
            `after 1 frame ${r.afterOneFrameW}, settled ${r.openedW}`);
        // A trace that only ever repeats one value is a snap, not an ease.
        {
            const distinct = new Set(r.openTrace).size;
            t.ok('…visibly, over several frames', distinct >= 4,
                `${distinct} distinct values in ${r.openTrace.length}: `
                + r.openTrace.slice(0, 6).join(', '));
        }

        t.ok('the frame closes again when the room clears',
            r.peakW > 0.5 && r.closedW < 0.05,
            `peak ${r.peakW} -> ${r.closedW}`);
        t.ok('…all the way back to where it started',
            Math.abs(r.closedY - r.restY) < 0.15,
            `${r.closedY} vs rest ${r.restY}`);

        t.ok('an absurd fight is still capped',
            Math.abs(r.absurdW - ARENA_WIDEN_MAX) < 1e-3,
            `${r.absurdW} vs ${ARENA_WIDEN_MAX}`);

        // THE POINT OF A SEPARATE CHANNEL. The boss framing slides the look
        // target; this one must not, or a 34-px hero goes off centre to point
        // at the centroid of a room full of chasing bodies.
        t.ok('the arena never drags the frame off the player',
            Math.abs(r.lookX) < 0.01 && Math.abs(r.lookZ) < 0.01,
            `look (${r.lookX}, ${r.lookZ}) with threats 28 units away`);
        t.ok('…not even on the first frame',
            Math.abs(r.afterOneFrameLookX) < 0.01, `${r.afterOneFrameLookX}`);

        t.ok('the seal flinch dips the camera in',
            r.punchLowest < r.punchBefore - 0.3,
            `${r.punchBefore} -> ${r.punchLowest}`);
        t.ok('…and returns it',
            Math.abs(r.punchAfter - r.punchBefore) < 0.05 && r.punchCleared,
            `${r.punchAfter} vs ${r.punchBefore}, cleared=${r.punchCleared}`);

        t.ok('a level change drops the widen immediately',
            r.beforeClearW > 0.5 && r.afterClearW === 0,
            `${r.beforeClearW} -> ${r.afterClearW}`);
        t.ok('…and the threat list with it', r.afterClearThreats === null);

        // THE CONTROL FIRST: both channels must actually be doing something,
        // or "they do not stack" is satisfied by neither of them firing.
        t.ok('the boss channel alone widens the frame',
            r.bossOnlyY > r.restY + 1, `${r.restY} -> ${r.bossOnlyY}`);
        t.ok('the arena channel alone widens the frame',
            r.arenaOnlyY > r.restY + 0.4, `${r.restY} -> ${r.arenaOnlyY}`);
        t.ok('…and the boss channel is the larger claim of the two',
            r.bossOnlyY > r.arenaOnlyY, `boss ${r.bossOnlyY} vs arena ${r.arenaOnlyY}`);
        // So if they summed, `bothY` would sit above BOTH.
        t.ok('boss framing and arena framing do not stack',
            Math.abs(r.bothY - r.bossOnlyY) < 0.05,
            `both ${r.bothY}, boss alone ${r.bossOnlyY}, arena alone ${r.arenaOnlyY}`);

        t.ok('no fatal pageerrors',
            errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 4).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
