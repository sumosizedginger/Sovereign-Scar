// PRINT-ONLY QA probe: which sounds fire, and when?
//
// Owner report: "Sky monument level started having weird sounds from out of
// nowhere ... occasional and started in the 2nd room."
//
// 04 Sky Monument's rooms in order are plaza (start) then TERRACE — which is
// the first room in the campaign to carry a `platforms()` step pyramid, and the
// first in this dungeon to carry enemies. This counts every call into gsfx,
// sfx and vsfx across four scenarios so "out of nowhere" can be attributed.

import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';

async function main() {
    const chrome = findChromeVerbose();
    if (!chrome.path) { console.error('No Chrome'); process.exit(2); }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8834);
    const browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader',
            '--autoplay-policy=no-user-gesture-required'],
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

            const [bank, synth, vfx] = await Promise.all([
                import('/src/game/audio/sfx-bank.js'),
                import('/src/audio/synth.js'),
                import('/src/game/fx/vsfx.js'),
            ]);

            // Count every sound, tagged by which bank it came from.
            const counts = {};
            const wrap = (obj, tag) => {
                for (const k of Object.keys(obj)) {
                    if (typeof obj[k] !== 'function') continue;
                    const orig = obj[k];
                    obj[k] = (...a) => {
                        const key = `${tag}.${k}`;
                        counts[key] = (counts[key] || 0) + 1;
                        try { return orig(...a); } catch (e) { return undefined; }
                    };
                }
            };
            wrap(bank.gsfx, 'gsfx');
            wrap(synth.sfx, 'sfx');
            wrap(vfx.vsfx, 'vsfx');

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

            // terrace: grid [0,-1], stride 64 => origin (0, -64). half 10.
            // Its step pyramid is at local (7,7), 3 high.
            const Ox = 0, Oz = -64;
            r.room = { origin: { x: Ox, z: Oz } };
            r.pyramidTopGroundY = f2(level.groundY?.(Ox + 7, Oz + 7));
            r.flatGroundY = f2(level.groundY?.(Ox, Oz));

            const baseInput = s.game.input;
            const mkInput = (x, z) => {
                const i = Object.create(baseInput);
                i.moveVector = () => ({ x, z });
                i.padAim = null;
                return i;
            };

            const scenario = (name, place, input, frames, opts = {}) => {
                for (const k of Object.keys(counts)) delete counts[k];
                if (opts.freezeRoom) {
                    // Stay in ONE room: door transitions teleport, and a probe
                    // that walks out of the room it is measuring is measuring
                    // the rest of the dungeon.
                    level.checkDoorTriggers = () => {};
                }
                if (opts.removeEnemies) {
                    for (const e of (level.enemies || [])) {
                        if (e.health) e.health.hp = 0;
                        if (e.state) e.state.current = 'DEAD';
                        e.defeated = true;
                    }
                }
                player.rig.position.set(place.x, place.y, place.z);
                player.physics.resetVelocity();
                player.physics.grounded = true;
                player.physics._wasGrounded = true;
                player.health.fullRestore();
                // A fall anchor left over from somewhere taller earlier in the
                // run — exactly what a knockback used to strand up a tower.
                if (opts.staleAnchor != null) {
                    player.physics._fallStartY = opts.staleAnchor;
                }
                const startY = player.root.position.y;
                for (let i = 0; i < frames; i++) {
                    level.update(1 / 60, s.game);
                    player.update(1 / 60, input, level.enemies || [], []);
                }
                return {
                    name,
                    seconds: f2(frames / 60),
                    movedTo: {
                        x: f2(player.root.position.x),
                        y: f2(player.root.position.y),
                        z: f2(player.root.position.z),
                    },
                    startY: f2(startY),
                    hp: player.health.hp,
                    sounds: { ...counts },
                };
            };

            const flat = { x: Ox, y: r.flatGroundY ?? 1.95, z: Oz };
            const pyramidFoot = { x: Ox + 3, y: r.flatGroundY ?? 1.95, z: Oz + 7 };

            // A — stand perfectly still on flat floor. THE "out of nowhere" case.
            r.a_standStill = scenario('stand still, flat floor, enemies alive',
                flat, mkInput(0, 0), 360);

            // B — same, with every enemy dead: what is left is the WORLD.
            r.b_standStillNoEnemies = scenario('stand still, flat floor, enemies dead',
                flat, mkInput(0, 0), 360, { removeEnemies: true });

            // C — walk on flat floor, staying inside the room.
            r.c_walkFlat = scenario('walk, flat floor, stays in room',
                flat, mkInput(1, 0), 240, { freezeRoom: true });

            // D — walk into and over the step pyramid (multi-Y, the thing that
            // is new about this room).
            r.d_walkPyramid = scenario('walk into the step pyramid',
                pyramidFoot, mkInput(1, 0), 240);

            // ── E — THE REPORT. Walk DOWN the pyramid carrying a fall anchor
            // picked up somewhere taller earlier in the run. Before today's fix
            // the anchor never followed the player down, so an ordinary step
            // off a step read as a long fall: `player.js` plays `vsfx.hurt()`
            // whenever a landing carries damage. An unexplained hurt noise
            // while walking down stairs with nothing nearby is a strong
            // candidate for "weird sounds from out of nowhere", and TERRACE is
            // the first room in this dungeon with stairs to walk down.
            const top = { x: Ox + 7, y: r.pyramidTopGroundY ?? 4.95, z: Oz + 7 };
            r.e_downPyramidStaleAnchor = scenario(
                'walk DOWN the pyramid with a stale high anchor',
                top, mkInput(-1, 0), 240, { staleAnchor: 14 });
            r.e_downPyramidHonestAnchor = scenario(
                'the same walk with an honest anchor',
                top, mkInput(-1, 0), 240);

            return r;
        });

        console.log(JSON.stringify(out, null, 2));
    } finally {
        await browser.close();
        await server.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
