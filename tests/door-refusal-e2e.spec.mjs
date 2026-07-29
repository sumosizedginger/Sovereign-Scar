// Browser E2E: a door you cannot open must not be able to trap you.
//
// Reported: "I got stuck trying to go through a door but I didn't have a key
// and it bounced me back to being stuck." Beat 12, small keys 0.
//
// Every refusal — the seal, the exit fallback, and the locked/boss door — did
// the same three lines inline:
//
//     game.player.rig.position.x -= n.x * 1.4;
//     game.player.rig.position.z -= n.z * 1.4;
//     game.player.physics.resetVelocity();
//
// A raw write to the position with NO collision resolution, of a fixed 1.4,
// against a locked door whose trigger reaches 1.2. Two ways to be trapped:
//
//   • the 1.4 goes wherever it points — through walls, off ledges, into lava —
//     because nothing consults the collision world;
//   • if anything blocks it, or 1.4 simply is not enough, the player is still
//     inside the 1.2 trigger next frame. `checkDoorTriggers` runs every frame
//     with no cooldown, so the door refuses again, and again, and each refusal
//     calls `resetVelocity()` — so the player can never build the momentum to
//     walk out. The bounce becomes the cage.
//
// The cooldown is the actual guarantee and is what this spec is mostly about:
// even if geometry blocks the push completely, the player keeps their input.

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
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }

    const server = await startServer(8809);
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
            const STRIDE = 64;
            const NORMAL = { N: { x: 0, z: -1 }, S: { x: 0, z: 1 },
                W: { x: -1, z: 0 }, E: { x: 1, z: 0 } };

            // How far INTO a solid a point is, 0 when merely touching.
            //
            // A boolean `collisionWorld.blocked()` is the wrong instrument
            // here: `resolveMove` parks a mover at exactly `minZ - half`, and
            // `_overlap` is a strict inequality, so "pressed against a wall"
            // versus "inside a wall" comes down to floating-point rounding on
            // that one equality. Walking into a plugged boss doorway — which
            // this spec does deliberately, for two seconds — reported five
            // false positives that way. Depth answers the question that was
            // actually being asked.
            function penetration(x, z, half = 0.4) {
                let worst = 0;
                for (const sd of s.game.collisionWorld.solids) {
                    const dx = Math.min(x + half - sd.minX, sd.maxX - (x - half));
                    const dz = Math.min(z + half - sd.minZ, sd.maxZ - (z - half));
                    if (dx > 0 && dz > 0) worst = Math.max(worst, Math.min(dx, dz));
                }
                return worst;
            }
            const PENETRATION_EPS = 0.05;

            // Sweep EVERY locked door in the campaign. Beat 01's corridor has
            // open floor behind it, so the blind 1.4 never met geometry there
            // and the collision assertion below would have been decorative on
            // that fixture alone. Doors elsewhere sit in corners, beside pillars
            // and on ledges — which is where the owner hit this, in Beat 12.
            //
            // One door at a time, placed immediately before it is tested: the
            // player is a singleton, so building every fixture up front and
            // testing afterwards leaves all of them pointing at the LAST
            // placement. An earlier draft did exactly that and reported three
            // rooms as putting the player inside geometry when what it had
            // actually measured was one room's spawn, three times.
            const BEATS = ['beat-01-crypt', 'beat-02-spindle', 'beat-03-sink',
                'beat-04-sky', 'beat-05-citadel', 'beat-06-quarry', 'beat-07-sluice',
                'beat-08-bone', 'beat-09-town', 'beat-10-cryo', 'beat-11-mire',
                'beat-12-pyre', 'beat-13-gumoi', 'beat-14-leviathan'];
            const out = { doors: [], worstRefusals: 0, insideSolid: [],
                pinned: [], badFixture: [], skipped: [], opened: [] };

            for (const beat of BEATS) {
                s.loadLevel(beat);
                s.game.bossIntro = null;
                const lvl = s.game.level;
                const doors = [];
                for (const [rid, room] of Object.entries(lvl.def.rooms)) {
                    for (const d of room.doors || []) {
                        // Both refusable door types. A boss door with no boss key takes
                        // the same bounce path as a locked one.
                        if (d.type === 'locked' || d.type === 'boss') {
                            doors.push({ rid, room, door: d });
                        }
                    }
                }
                for (const found of doors) {
                    const id = `${beat}/${found.rid}:${found.door.side}`;
                    lvl.enterRoom(found.rid, s.game);
                    // Guarantee a REFUSAL. Draining small keys is not enough:
                    // a boss door with the boss key in hand OPENS and starts a
                    // room transition, and a transition pins the player at the
                    // next room's entry point without consulting collision. An
                    // earlier draft measured that pin and reported five boss
                    // doors as "the refusal put me inside a solid" — about
                    // doors that had not refused anything.
                    lvl.keyStore.trySpendSmallKey = () => false;
                    lvl.keyStore.hasBossKey = () => false;
                    const roomBefore = lvl.currentRoomId();

                    const o = { x: found.room.grid[0] * STRIDE, z: found.room.grid[1] * STRIDE };
                    const half = found.room.half;
                    const side = found.door.side;
                    const at = found.door.at || 0;
                    const p = s.player;

                    // Step back from the doorway until we find open floor. Some
                    // rooms build props right inside the door, and a fixture
                    // spawning inside one would blame the refusal for its own
                    // placement.
                    let x = o.x, z = o.z, placed = false;
                    for (const INSET of [1.2, 1.7, 2.2, 2.8, 3.4]) {
                        if (side === 'N') { x = o.x + at; z = o.z - half + INSET; }
                        else if (side === 'S') { x = o.x + at; z = o.z + half - INSET; }
                        else if (side === 'W') { x = o.x - half + INSET; z = o.z + at; }
                        else { x = o.x + half - INSET; z = o.z + at; }
                        if (penetration(x, z) <= PENETRATION_EPS) { placed = true; break; }
                    }
                    if (!placed) { out.skipped.push(id); continue; }
                    p.rig.position.set(x, 1.95, z);
                    p.physics.resetVelocity(); p.physics.grounded = true;
                    if (penetration(p.rig.position.x, p.rig.position.z) > PENETRATION_EPS) {
                        out.badFixture.push(id);
                        continue;
                    }

                    let refusals = 0;
                    const realToast = s.game.hud.toast.bind(s.game.hud);
                    s.game.hud.toast = (msg, ms) => {
                        if (/Locked|small key|boss key/i.test(String(msg))) refusals++;
                        return realToast(msg, ms);
                    };
                    const n = NORMAL[side];
                    let deepest = 0;
                    // Walk INTO the locked door for two seconds, as a player would.
                    for (let i = 0; i < 120; i++) {
                        p.physics.update(s.game.collisionWorld, 1 / 60, {
                            wishX: n.x, wishZ: n.z, speed: 6, half: 0.4,
                        });
                        p.rig.position.y = 1.95; p.physics.grounded = true;
                        lvl.update(1 / 60, s.game);
                        deepest = Math.max(deepest,
                            penetration(p.rig.position.x, p.rig.position.z));
                    }
                    s.game.hud.toast = realToast;

                    // Stop pushing and leave. If the refusal were still firing
                    // every frame, resetVelocity would pin the player in place.
                    // Stop pushing and leave. The property that matters is not
                    // "travelled N units" — rooms differ, and a wall 1.2 behind
                    // you is legitimate — but that the door lets go once you
                    // stop asking it. Count refusals AFTER walking away.
                    for (let i = 0; i < 60; i++) {
                        p.physics.update(s.game.collisionWorld, 1 / 60, {
                            wishX: -n.x, wishZ: -n.z, speed: 6, half: 0.4,
                        });
                        p.rig.position.y = 1.95; p.physics.grounded = true;
                        lvl.update(1 / 60, s.game);
                    }
                    let refusalsAfterLeaving = 0;
                    s.game.hud.toast = (msg, ms) => {
                        if (/Locked|small key|boss key/i.test(String(msg))) {
                            refusalsAfterLeaving++;
                        }
                        return realToast(msg, ms);
                    };
                    for (let i = 0; i < 120; i++) {
                        p.physics.update(s.game.collisionWorld, 1 / 60, {
                            wishX: 0, wishZ: 0, speed: 6, half: 0.4,
                        });
                        p.rig.position.y = 1.95; p.physics.grounded = true;
                        lvl.update(1 / 60, s.game);
                    }
                    s.game.hud.toast = realToast;

                    // If the room changed, this door let us through and the
                    // measurements above are about a transition, not a refusal.
                    if (lvl.currentRoomId() !== roomBefore) {
                        out.opened.push(id);
                        continue;
                    }
                    out.doors.push(id);
                    out.worstRefusals = Math.max(out.worstRefusals, refusals);
                    if (deepest > PENETRATION_EPS) {
                        out.insideSolid.push(`${id} (${deepest.toFixed(2)} deep)`);
                    }
                    if (refusalsAfterLeaving > 0) {
                        out.pinned.push(`${id} (${refusalsAfterLeaving} refusals after leaving)`);
                    }
                }
            }
            return out;
        });

        t.ok('locked doors were found to test',
            r.doors && r.doors.length >= 8, `${r.doors?.length || 0} locked + boss doors swept`);
        t.ok('every door tested actually refused the player',
            r.opened.length === 0,
            r.opened.length ? `these opened instead: ${r.opened.join(', ')}`
                : `${r.doors.length} doors all held shut`);
        t.ok('a refused door does not re-fire every frame',
            r.worstRefusals > 0 && r.worstRefusals <= 5,
            `worst door refused ${r.worstRefusals}x while being walked into for 2s `
            + `— unfixed this is one per frame`);
        t.ok('the fixture stands the player in open floor at every door it tests',
            r.badFixture.length === 0,
            r.badFixture.length ? `spawned in geometry: ${r.badFixture.join(', ')}`
                : `${r.doors.length} doors tested, ${r.skipped.length} skipped for `
                  + `having no open floor inside the doorway`);
        t.ok('a refusal never places the player inside a solid',
            r.insideSolid.length === 0,
            r.insideSolid.length ? r.insideSolid.join(', ')
                : `${r.doors.length} doors, none put the player in geometry`);
        t.ok('the player can always walk away from a refused door',
            r.pinned.length === 0,
            r.pinned.length ? `still refusing after the player left: ${r.pinned.join(', ')}`
                : `${r.doors.length} doors, all went quiet once the player stepped off`);

        t.ok('no fatal pageerrors',
            errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 4).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
