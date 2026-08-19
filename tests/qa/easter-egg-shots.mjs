// tests/qa/easter-egg-shots.mjs — LOOK at what got built.
//
//   node tests/qa/easter-egg-shots.mjs
//
// Shoots the three props on their real screens, at the real camera, and the
// hero in every skin at the distance the game is actually played from.
// Writes PNGs to docs/media/easter-eggs/.
//
// WHY THIS IS NOT OPTIONAL
//
// Everything else in this build measures. `tests/qa/easter-eggs.mjs` says the
// props are unburied and walkable to; `tests/game/relics.spec.mjs` says the
// arch clears a standing hero and the ribs taper. All of that can be true of
// something that looks terrible, and this project has the scars to prove it:
// three terrace colours once scored 46/47/47 while the pictures went from
// concrete slabs to correct, and an actor outline improved every metric on
// record and was rejected on sight for making a 30-pixel character worse.
//
// A number cannot see the material. This is the part that can.
//
// THE HERO SHOTS ARE AT PLAY SCALE ON PURPOSE. The hero is 34 px wide at 1280,
// so a skin that reads beautifully in a close-up and vanishes in play is a skin
// that does not exist. Each one is shot from the shipped rig, not a portrait
// camera, and the crop is stated in the filename.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';
import { placedRelics } from '../../src/game/world/relics.js';

const OUT = 'docs/media/easter-eggs';

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

// Hand-written shots for the props that have a specific angle worth composing.
const COMPOSED = [
    { file: 'dragon-tombfields', screen: 'r0c1', want: 'relic:tombfields', at: { x: 1.2, z: 4.5 }, note: 'the dragon, from the road' },
    { file: 'dragon-approach', screen: 'r0c1', want: 'relic:tombfields', at: { x: -7.0, z: 5.0 }, note: 'the skull end' },
    { file: 'dragon-under', screen: 'r0c1', want: 'relic:tombfields', at: { x: -2.0, z: -0.4 }, note: 'standing inside the ribcage' },
    { file: 'well-dry', screen: 'r2c1', want: 'egg:well', at: { x: -1.5, z: 3.4 }, note: 'the dry well' },
    { file: 'miner', screen: 'r6c6', want: 'egg:miner', at: { x: 2.0, z: 1.6 }, note: 'the man in the hole' },
];

// PLUS ONE PER RELIC, GENERATED FROM THE TABLE.
//
// The hand-written list above covered exactly the props that existed the day it
// was written, which means the next relic ships unphotographed and nobody finds
// out until somebody wonders why the folder looks thin. `gear-skin-shots.mjs`
// learned the same thing about its roster of outfits. Two standard angles: from
// the south at the distance the interact prompt appears, and from directly
// beside it, which is where the fixed 70.7-degree camera is least forgiving.
const relicShots = placedRelics().flatMap((r) => ([
    {
        file: `relic-${r.region}-approach`, screen: r.screen, want: r.id,
        at: { x: r.x, z: r.z + 4.6 }, note: `${r.label}, walking up to it`,
    },
    {
        file: `relic-${r.region}-beside`, screen: r.screen, want: r.id,
        at: { x: r.x + 3.4, z: r.z + 0.8 }, note: `${r.label}, from beside`,
    },
]));

const SHOTS = [...COMPOSED, ...relicShots];

const server = await startServer(8794);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--window-size=1280,720'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await disableGamepads(page);
    page.setDefaultTimeout(90000);
    page.on('pageerror', (e) => console.log('  pageerror', String(e).slice(0, 160)));

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });
    await page.mouse.click(400, 300);
    await page.evaluate(() => window.__sovereignScar.startNewGame('medium'));
    await sleep(500);
    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.game.atTitle = false;
        s.game.paused = false;
        s.menu.close();
        s.hud?.setHidden?.(true);
    });
    await page.evaluate(() => window.__sovereignScar.loadLevel('overworld'));
    await sleep(900);

    console.log('shot                 screen   prop              from camera  note');
    console.log('-'.repeat(84));

    for (const shot of SHOTS) {
        const info = await page.evaluate(async (sid, at, want) => {
            const s = window.__sovereignScar;
            s.hud?.setHidden?.(true);

            // A FIXTURE THAT DOES NOT CHECK ITSELF LIES, and this one did
            // twice. Two well shots came out with no well in them and I went
            // looking for the bug in the prop both times. There was none.
            //
            // ENTER THE SCREEN THE WAY THE SAVE DOES. `enterRoom` moves the
            // room graph and nothing else — the overworld keeps its OWN idea of
            // which screen you are on, in `sovereignProgress.overworld.pos`,
            // and its update quietly walks the player back onto that screen.
            // Measured at 62 units in the case that exposed it, with the camera
            // following: a correctly rendered photograph of somewhere else.
            // Writing the saved position and rebuilding the level is the route
            // the game itself uses when you come out of a dungeon.
            //
            // THEN SETTLE UNTIL IT IS ACTUALLY STILL. Re-read the origin every
            // pass, re-place, and stop only when the hero stays put — and if it
            // never settles, say so in the table rather than quietly returning
            // a picture of a field.
            const keys = await import('/src/game/world/keys.js');
            keys.patchOverworld({ pos: { world: 'overworld', screen: sid, x: at.x, z: at.z } });
            s.loadLevel('overworld');
            await new Promise((r) => setTimeout(r, 900));

            let x = 0, z = 0, drift = Infinity;
            for (let pass = 0; pass < 6 && drift > 0.5; pass++) {
                await new Promise((r) => setTimeout(r, 500));
                const o = s.game.level.currentRoomOrigin();
                x = o.x + at.x;
                z = o.z + at.z;
                const y = s.game.level.groundY?.(x, z) ?? 1.95;
                s.player.rig.position.set(x, y, z);
                s.player.physics.position?.set?.(x, y, z);
                // Face north, up-screen, which is the direction the fixed
                // camera looks — so the shot is what a player walking up to it
                // would see.
                s.player.rig.rotation.y = Math.PI;
                await new Promise((r) => setTimeout(r, 500));
                drift = Math.hypot(s.player.rig.position.x - x, s.player.rig.position.z - z);
            }
            // One last placement and a beat for the camera, which eases.
            s.player.rig.position.set(x, s.game.level.groundY?.(x, z) ?? 1.95, z);
            s.player.rig.rotation.y = Math.PI;
            await new Promise((r) => setTimeout(r, 700));

            // THE PROP THIS SHOT IS OF, by name, and how far it is from the
            // hero. The first version took the first `relic:` or `egg:` name
            // anywhere in the scene and so reported the dragon as present on
            // the well's screen and the miner's — every screen the player has
            // visited stays in the scene graph, 64 units apart, so "is it in
            // the scene" was never the question. "Is it in THIS frame" is.
            let node = null;
            s.game.scene.traverse((n) => { if (n.name === want) node = n; });
            const near = node
                ? Math.hypot(node.position.x - s.player.rig.position.x,
                    node.position.z - s.player.rig.position.z)
                : null;
            return { found: node ? want : null, near, x, z, drift: +drift.toFixed(2) };
        }, shot.screen, shot.at, shot.want);

        await sleep(250);
        await page.screenshot({ path: `${OUT}/${shot.file}.png` });
        const dist = info.near == null ? 'ABSENT' : `${info.near.toFixed(1)} away`;
        const drifted = info.drift > 0.5 ? ` NEVER SETTLED (${info.drift})` : '';
        console.log(
            `${shot.file.padEnd(20)} ${shot.screen.padEnd(8)} ${(info.found || 'NOT FOUND').padEnd(17)}`
            + `${dist.padEnd(11)} ${shot.note}${drifted}`,
        );
    }

    // ── the skins, at play scale ────────────────────────────────────────────
    //
    // Same frame, same ground, same light, one variable. Shot on the start
    // screen because it is the flattest and least busy in the game, so the
    // figure is the only thing that changed between the four pictures.
    const skins = await page.evaluate(async () => {
        const m = await import('/src/game/characters/hero-skins.js');
        return m.heroSkinIds();
    });
    console.log('-'.repeat(74));
    for (const id of skins) {
        const ok = await page.evaluate(async (sid) => {
            const s = window.__sovereignScar;
            s.game.level.enterRoom('scarfield', s.game);
            await new Promise((r) => setTimeout(r, 400));
            const o = s.game.level.currentRoomOrigin();
            s.player.rig.position.set(o.x, s.game.level.groundY?.(o.x, o.z) ?? 1.95, o.z);
            s.player.rig.rotation.y = Math.PI;
            // Force the skin regardless of what is unlocked — this is a
            // photograph of the art, not a test of the ownership rules, and
            // those are held in `hero-skins.spec.mjs` where they belong.
            s.player.skin = null;
            const applied = s.player.setSkin(sid);
            s.hud?.setHidden?.(true);
            await new Promise((r) => setTimeout(r, 700));
            return applied;
        }, id);
        await sleep(200);
        await page.screenshot({ path: `${OUT}/skin-${id}.png` });
        // And a crop around the hero, so the colours can be judged as colours
        // rather than squinted at. The full frame above is the honest one.
        await page.screenshot({
            path: `${OUT}/skin-${id}-crop.png`,
            clip: { x: 520, y: 230, width: 240, height: 240 },
        });
        console.log(`skin ${id.padEnd(15)} applied=${ok}`);
    }

    // ── does each skin READ? ────────────────────────────────────────────────
    //
    // THIS BLOCK WAS WRONG FOR ITS WHOLE LIFE AND SAID SO OUT LOUD EVERY RUN.
    //
    // It sampled a disc of radius 9 on the projected chest against an annulus
    // of "floor" 15 to 28 pixels out, and reported that the CRUSTWALKER - the
    // hero this game has shipped with since launch - DISSOLVES against quarry
    // slate. It also gave three completely different skins body values of 42.5,
    // 42.8 and 42.8 on the same ground, which is the signature of a sampler
    // that is not looking at the thing it names: three palettes that far apart
    // cannot agree to a tenth of a point.
    //
    // The annulus is the fault. At 15 to 28 px from a 34-px hero it contains
    // the contact shadow, the held weapon, the shield and whatever prop is
    // nearby - so "floor" was a blend of the character's own furniture, and the
    // disc caught the rim light and the head as much as the shirt.
    //
    // The method now is the one `gear-skin-shots.mjs` settled on: HIDE THE RIG
    // AND SHOW IT. The pixels that differ are the hero's exact silhouette, and
    // the SAME pixels in the hidden frame are the ground that was actually
    // behind them. No disc, no annulus, no guess about where the figure is -
    // the figure is defined by its own absence.
    //
    // Two grounds, because separation is a property of a PAIR. A palette that
    // reads on clay can vanish on slate, and the wardrobe lets a player wear
    // any of them anywhere.
    console.log('-'.repeat(84));
    console.log('skin            screen            px   body L*   floor L*    dL*   dRGB   verdict');
    const FLOORS = [
        ['scarfield', 'tombfields clay'],
        ['r4c0', 'quarry slate'],
    ];
    const readings = [];
    for (const id of skins) {
        for (const [sid, label] of FLOORS) {
            const m = await page.evaluate(async (skinId, screen) => {
                const s = window.__sovereignScar;
                s.game.level.enterRoom(screen, s.game);
                await new Promise((r) => setTimeout(r, 450));
                const o = s.game.level.currentRoomOrigin();
                s.player.rig.position.set(o.x, s.game.level.groundY?.(o.x, o.z) ?? 1.95, o.z);
                s.player.rig.rotation.y = Math.PI;
                s.player.skin = null;
                s.player.setSkin(skinId);
                s.hud?.setHidden?.(true);
                await new Promise((r) => setTimeout(r, 700));
                // Project the hero's CHEST — the shirt is 32.7% of the body and
                // the single colour that decides whether the figure reads.
                const v = s.player.rig.position.clone();
                v.y += 0.35;
                v.project(s.camera);
                return {
                    cx: (v.x * 0.5 + 0.5) * 1280,
                    cy: (-v.y * 0.5 + 0.5) * 720,
                };
            }, id, sid);

            // The world is stopped for the pair, so both frames share a body
            // pose and a dust position and the mask keeps describing the hero.
            await page.evaluate(() => {
                const s = window.__sovereignScar;
                s.game.paused = true;
                s.player.rig.visible = false;
            });
            await sleep(220);
            const bare = await page.screenshot({ encoding: 'base64' });
            await page.evaluate(() => { window.__sovereignScar.player.rig.visible = true; });
            await sleep(220);
            const shown = await page.screenshot({ encoding: 'base64' });
            await page.evaluate(() => { window.__sovereignScar.game.paused = false; });

            const res = await page.evaluate(async (b64g, b64f) => {
                const load = async (b64) => {
                    const img = new Image();
                    await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
                    const cv = document.createElement('canvas');
                    cv.width = img.width; cv.height = img.height;
                    const ctx = cv.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, 0, 0);
                    return ctx.getImageData(0, 0, img.width, img.height).data;
                };
                const [g, f] = await Promise.all([load(b64g), load(b64f)]);
                const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
                const lum = (r, gg, b) => 0.2126 * srgb(r) + 0.7152 * srgb(gg) + 0.0722 * srgb(b);
                const Lstar = (Y) => (Y <= 0.008856 ? 903.3 * Y : 116 * Math.cbrt(Y) - 16);
                let n = 0, bodyY = 0, floorY = 0;
                const bm = [0, 0, 0], fm = [0, 0, 0];
                for (let i = 0; i < g.length; i += 4) {
                    const d = Math.abs(g[i] - f[i]) + Math.abs(g[i + 1] - f[i + 1]) + Math.abs(g[i + 2] - f[i + 2]);
                    if (d <= 45) continue;
                    n++;
                    bodyY += lum(f[i], f[i + 1], f[i + 2]);
                    floorY += lum(g[i], g[i + 1], g[i + 2]);
                    for (let k = 0; k < 3; k++) { bm[k] += f[i + k]; fm[k] += g[i + k]; }
                }
                if (!n) return { body: 0, floor: 0, px: 0, dRGB: 0 };
                // LUMINANCE IS NOT THE WHOLE ANSWER, and taking it as the whole
                // answer is what made the first verdict here wrong twice over.
                // The hero's shirt is #b03030 and quarry slate is grey: a red
                // figure on grey ground separates by HUE and barely at all by
                // value, so a dL*-only rule calls the character this game ships
                // with invisible. Both are reported and the verdict needs both
                // to be small before it says anything alarming.
                return {
                    body: +Lstar(bodyY / n).toFixed(1),
                    floor: +Lstar(floorY / n).toFixed(1),
                    px: n,
                    dRGB: Math.round(Math.hypot(...bm.map((v, k) => (v - fm[k]) / n))),
                };
            }, bare, shown);

            const dL = +(res.body - res.floor).toFixed(1);
            readings.push({ id, label, ...res, dL });
            const verdict = (Math.abs(dL) >= 8 || res.dRGB >= 45) ? 'reads'
                : (Math.abs(dL) >= 4 || res.dRGB >= 25) ? 'weak'
                    : 'DISSOLVES';
            console.log(
                `${id.padEnd(15)} ${label.padEnd(16)} ${String(res.px).padStart(5)}`
                + `${String(res.body).padStart(10)}${String(res.floor).padStart(11)}`
                + ` ${String(dL).padStart(6)} ${String(res.dRGB).padStart(6)}   ${verdict}`,
            );
        }
    }
    // Ranked the way the verdict is decided, or the summary line contradicts
    // the table it summarises. A figure that separates by colour and not by
    // value is not the worst thing here just because one of its two numbers is
    // small.
    const score = (r) => Math.max(Math.abs(r.dL) / 8, (r.dRGB || 0) / 45);
    const worst = readings.slice().sort((a, b) => score(a) - score(b))[0];
    console.log('-'.repeat(84));
    console.log(`worst: ${worst.id} on ${worst.label} - dL* ${worst.dL}, dRGB ${worst.dRGB}`);
    console.log('A skin is a cosmetic, and a cosmetic that makes the player harder');
    console.log('to find is not a cosmetic. DISSOLVES means the figure separates');
    console.log('from its ground neither by value nor by colour - both have to be');
    console.log('small, because a red hero on grey slate is perfectly visible at');
    console.log('a dL* of one.');

    console.log('-'.repeat(84));
    console.log(`PNGs in ${OUT}/`);
    console.log('The full frames are the honest ones — the hero is 34 px wide at');
    console.log('1280 and any judgement made from the crops is a judgement about a');
    console.log('photograph rather than about the game.');
} finally {
    await browser?.close();
    server.close?.();
}
