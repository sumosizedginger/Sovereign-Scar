// tests/qa/gear-skin-shots.mjs — can you actually SEE a gear skin?
//
//   node tests/qa/gear-skin-shots.mjs
//
// Writes PNGs to docs/media/gear-skins/ and prints, for each piece of gear, how
// many screen pixels it owns and how far its colour moves when it is skinned.
//
// WHY THIS EXISTS AND WHY IT IS THE POINT
//
// `gear-skins.spec.mjs` proves a skin repaints boxes, changes no geometry, and
// cannot wear an enemy faction's accent. All of that can be true of a change
// nobody can see. A held blade is 0.10 world units thick under a camera 17.5
// units up at 70.7 degrees, and `weapon-models.js` argues in its own header
// that a weapon reads as a SILHOUETTE, not as a colour. If that is right, a
// weapon skin is a changelog entry and the shield is where the money is — and
// the honest way to find out is to measure, not to have a view.
//
// TWO INSTRUMENTS WERE BUILT AND THROWN AWAY BEFORE THIS ONE.
//
// The first counted pixels that changed between a "before" and an "after"
// frame, and took its noise floor from two shots 700 ms apart with the world
// running. Every real reading was taken either side of a room reset, so the
// control carried drifting dust and idle sway the readings did not. It came out
// at 12271 px — LARGER than every change it existed to be the floor for — and
// read literally it declared the hero's own body skin invisible, which the
// pictures plainly disprove.
//
// The second stopped the world with `game.paused` so both frames shared a body
// pose and a dust position, and made the control a real teardown and rebuild
// with identical colours. Better, and still wrong: the control moved 1521 px
// with no art change at all, 4.75% of the window. Something in the render path
// is not still even when the simulation is. Signal was above it — the shield
// moved 2645, the whole outfit 3633 — but a metric whose floor is that close to
// its ceiling cannot tell "faint" from "nothing", and those are the two answers
// this file exists to distinguish.
//
// SO IT STOPPED COUNTING CHANGE AND STARTED MEASURING THE OBJECT.
//
// Each piece of gear is hidden and shown while everything else holds still. The
// pixels that appear ARE the gear — its exact silhouette, at play scale, under
// the real light. That gives the number the whole question turns on, which is
// not "did the colour move" but HOW BIG IS THIS THING ON SCREEN. Then the mean
// colour inside that silhouette is compared across skins.
//
// A frame-differencing metric can be defeated by grain. Asking an object how
// many pixels it occupies cannot: whatever the noise is doing, the blade is
// still the same number of pixels wide.
//
// AND THEN THE THIRD INSTRUMENT WAS WRONG TOO, IN THE OLDEST WAY IN THIS REPO.
//
// It reported the shield's colour moving by dRGB 9 out of 255 and called it
// "barely moves". The picture shows the shield going from a flat grey slab to a
// dark plate with two bright bone rails down its sides — one of the clearest
// changes in the whole set. Both are correct: the face got DARKER and the bands
// got BRIGHTER, and a mean cancels them against each other exactly.
//
// The mean was never the question. `docs/media/README.md` carries the same
// lesson from the terraces, which scored 46/47/47 while the pictures went from
// concrete slabs to correct. So this measures three things about a piece and
// not one: how big it is, how many of ITS OWN pixels actually changed, and how
// much contrast it carries inside its own outline. A redistribution shows up in
// the second and third and is invisible to the first, which is why reporting
// only a mean is how a working art change gets thrown away.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const OUT = 'docs/media/gear-skins';

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
fs.mkdirSync(OUT, { recursive: true });

/** The window the hero occupies, in 1280x720 frame pixels. */
const BOX = { x: 560, y: 250, w: 160, h: 200 };
const SHIP = 'crustwalker';
const SKIN = 'bonewarden';

// 8850 is outside the block every spec in tests/ reserves. This probe first
// used 8795, which is `locked-doors-e2e`'s, and running the two together
// failed that spec with EADDRINUSE — a suite that is only green when nothing
// else is running is not green.
const server = await startServer(8850);
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
        // The shield is only mounted when the inventory says it is owned —
        // `player.js` rewrites `guard.hasShield` from the inventory every
        // frame, so setting that flag directly would be overwritten on the next
        // tick and the shield row would have measured an empty hand.
        s.player.inventory.grantItem('bulwark_shield');
        for (const w of ['tectonic_wedge', 'heavy_mallet', 'light_caster']) {
            s.player.inventory.grantItem(w);
        }
    });
    await page.evaluate(() => window.__sovereignScar.loadLevel('overworld'));
    await sleep(900);

    /** Stand the hero on the flattest screen, dressed as asked, then stop the world. */
    async function pose({ body, weapon, weaponSkin, shield, shieldSkin }) {
        return page.evaluate(async (o) => {
            const s = window.__sovereignScar;
            s.game.paused = false;
            s.game.level.enterRoom('scarfield', s.game);
            await new Promise((r) => setTimeout(r, 350));
            const org = s.game.level.currentRoomOrigin();
            s.player.rig.position.set(org.x, s.game.level.groundY?.(org.x, org.z) ?? 1.95, org.z);
            s.player.rig.rotation.y = Math.PI;
            s.player.skin = null;
            s.player.setSkin(o.body);
            s.player.inventory.activeWeapon = o.weapon;
            s.player.weaponSkin = o.weaponSkin;
            s.player.shieldSkin = o.shieldSkin;
            s.player.guard.hasShield = !!o.shield;
            s.hud?.setHidden?.(true);
            await new Promise((r) => setTimeout(r, 700));
            s.game.paused = true;
            await new Promise((r) => setTimeout(r, 200));
            return {
                holding: !!s.player.heldWeapon?.model,
                shielded: !!s.player.heldShield?.model,
                weaponSkin: s.player.heldWeapon?.skin || null,
                shieldSkin: s.player.heldShield?.skin || null,
            };
        }, { body, weapon, weaponSkin, shield: shield || false, shieldSkin });
    }

    /** Show or hide one held piece without touching anything else. */
    async function setVisible(which, on) {
        await page.evaluate((w, v) => {
            const s = window.__sovereignScar;
            const m = w === 'shield' ? s.player.heldShield?.model : s.player.heldWeapon?.model;
            if (m) m.visible = v;
        }, which, on);
        await sleep(140);
    }

    /**
     * The hero window, blown up 4x with smoothing OFF.
     *
     * The full frames are the honest picture and are kept, but the hero is 34
     * px wide in them: judging a palette off one is judging it off a rumour.
     * Nearest-neighbour, because this is voxel art and a bilinear upscale
     * invents gradients the game does not have — which is precisely the kind of
     * flattering lie that makes a still look better than the thing.
     */
    async function crop(file) {
        const b64 = await page.screenshot({
            clip: { x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h },
            encoding: 'base64',
        });
        const url = await page.evaluate(async (b) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b}`;
            await img.decode();
            const c = document.createElement('canvas');
            c.width = img.width * 4; c.height = img.height * 4;
            const g = c.getContext('2d');
            g.imageSmoothingEnabled = false;
            g.drawImage(img, 0, 0, c.width, c.height);
            return c.toDataURL('image/png');
        }, b64);
        fs.writeFileSync(`${OUT}/${file}-zoom.png`, Buffer.from(url.split(',')[1], 'base64'));
        return b64;
    }

    async function grab(file) {
        if (file) {
            await page.screenshot({ path: `${OUT}/${file}.png` });
            return crop(file);
        }
        return page.screenshot({
            clip: { x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h },
            encoding: 'base64',
        });
    }

    /**
     * Everything worth knowing about one piece across two skins.
     *
     * `hidden` and `shipped` come from the same pose with the piece toggled
     * off and on, so the pixels that differ ARE the piece — its exact
     * silhouette at play scale under the real light. `skinned` is the same
     * pose again with the skin applied.
     *
     * The threshold is deliberately high. A held object against the ground or
     * against the hero's own body is a large difference; the render noise this
     * file's second instrument tripped over was a small one, and setting the
     * bar where the two do not overlap is what makes the area trustworthy.
     *
     * THREE NUMBERS, BECAUSE ONE LIES. `area` is the ceiling on how much any
     * repaint can matter. `changed` is how many of the piece's own pixels
     * actually moved, which a mean cannot see when one part darkens by as much
     * as another brightens — the exact case that made the shield look like a
     * failure. `spread` is the standard deviation of L* inside the outline:
     * a piece that gains internal contrast has become a shape with parts, and
     * that is most of what makes a small object read from 17.5 units up.
     */
    async function compare(hidden, shipped, skinned) {
        return page.evaluate(async (b64h, b64a, b64b) => {
            const load = async (b64) => {
                const img = new Image();
                img.src = `data:image/png;base64,${b64}`;
                await img.decode();
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                c.getContext('2d').drawImage(img, 0, 0);
                return c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
            };
            const [h, a, b] = await Promise.all([load(b64h), load(b64a), load(b64b)]);
            const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
            const lstar = (r, g, bl) => {
                const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
                return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
            };
            const mask = [];
            for (let i = 0; i < h.length; i += 4) {
                const d = Math.abs(h[i] - a[i]) + Math.abs(h[i + 1] - a[i + 1]) + Math.abs(h[i + 2] - a[i + 2]);
                if (d > 45) mask.push(i);
            }
            const n = mask.length || 1;
            const acc = (img) => {
                let r = 0, g = 0, bl = 0; const ls = [];
                for (const i of mask) { r += img[i]; g += img[i + 1]; bl += img[i + 2]; ls.push(lstar(img[i], img[i + 1], img[i + 2])); }
                const mL = ls.reduce((s, v) => s + v, 0) / n;
                const sd = Math.sqrt(ls.reduce((s, v) => s + (v - mL) ** 2, 0) / n);
                return { mean: [r / n, g / n, bl / n].map((v) => Math.round(v)), L: +mL.toFixed(1), spread: +sd.toFixed(1) };
            };
            let changed = 0;
            for (const i of mask) {
                const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
                if (d > 45) changed++;
            }
            return { area: mask.length, changed, ship: acc(a), skin: acc(b) };
        }, hidden, shipped, skinned);
    }

    /**
     * Pose twice — once shipped, once skinned — and hand back the three frames.
     *
     * The hidden frame is taken in the SHIPPED pose only. It is a picture of the
     * world without the piece in it, and the world is identical in both poses,
     * so shooting it twice would measure the render noise and call it geometry.
     */
    async function measure(which, base, files) {
        const p1 = await pose({ ...base, weaponSkin: SHIP, shieldSkin: SHIP });
        const live = which === 'shield' ? p1.shielded : p1.holding;
        if (!live) return { missing: true };
        await setVisible(which, false);
        const hidden = await grab(null);
        await setVisible(which, true);
        const shipped = await grab(files[0]);
        const key = which === 'shield' ? 'shieldSkin' : 'weaponSkin';
        await pose({ ...base, weaponSkin: SHIP, shieldSkin: SHIP, [key]: SKIN });
        const skinned = await grab(files[1]);
        return compare(hidden, shipped, skinned);
    }

    const rows = [];

    for (const w of ['anchor_link', 'tectonic_wedge', 'heavy_mallet', 'light_caster']) {
        rows.push({
            what: `weapon ${w}`,
            ...(await measure('weapon', { body: SHIP, weapon: w, shield: false },
                [`weapon-${w}-crustwalker`, `weapon-${w}-bonewarden`])),
        });
    }
    rows.push({
        what: 'shield',
        ...(await measure('shield', { body: SHIP, weapon: 'anchor_link', shield: true },
            ['shield-crustwalker', 'shield-bonewarden'])),
    });

    // Whole-outfit stills, for looking at rather than for measuring.
    await pose({ body: SHIP, weapon: 'tectonic_wedge', weaponSkin: SHIP, shield: true, shieldSkin: SHIP });
    await grab('outfit-crustwalker');
    await pose({ body: SKIN, weapon: 'tectonic_wedge', weaponSkin: SKIN, shield: true, shieldSkin: SKIN });
    await grab('outfit-bonewarden');

    // ── the picker itself ───────────────────────────────────────────────────
    //
    // A wardrobe is a screen as much as it is a system, and it is the one part
    // of this feature a player interacts with directly. Shot with the outfit
    // actually unlocked, so the rows carry real options rather than the
    // "Nothing found yet" state a fresh save shows.
    await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.game.paused = false;
        const w = await import('/src/game/kernel/wardrobe.js');
        w.grantOutfit(s.player.inventory, 'bonewarden');
        s.player.applySavedSkin();
        s.menu.mode = 'pause';
        s.menu.state.open('pause');
        s.menu.render();
        document.getElementById('ss-menu').style.display = 'flex';
    });
    await sleep(350);
    await page.screenshot({ path: `${OUT}/menu-pause.png` });
    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.menu.state.push('appearance');
        s.menu.render();
    });
    await sleep(350);
    await page.screenshot({ path: `${OUT}/menu-appearance.png` });

    const px = BOX.w * BOX.h;
    console.log(`\nEach piece hidden and shown at play scale, 1280x720, world stopped.`);
    console.log(`Areas are screen pixels; the whole hero window is ${px} px.\n`);
    console.log('piece                    area   changed  % of it   dRGB   dL*   contrast within');
    console.log('-'.repeat(86));
    for (const r of rows) {
        if (r.missing) { console.log(`${r.what.padEnd(24)} NOT ON THE BODY`); continue; }
        r.dRGB = Math.round(Math.hypot(...r.ship.mean.map((v, i) => v - r.skin.mean[i])));
        r.dL = +(r.skin.L - r.ship.L).toFixed(1);
        r.pct = (r.changed / (r.area || 1)) * 100;
        console.log(
            r.what.padEnd(24)
            + String(r.area).padStart(6)
            + String(r.changed).padStart(10)
            + `${r.pct.toFixed(0).padStart(8)}%`
            + String(r.dRGB).padStart(7)
            + String(r.dL).padStart(6)
            + `   ${r.ship.spread} -> ${r.skin.spread}`,
        );
    }
    console.log('-'.repeat(86));
    console.log('\nWHAT THIS SAYS');
    for (const r of rows) {
        if (r.missing) continue;
        // Area is the ceiling on how much any repaint can matter; `changed` is
        // what it actually spent. A piece can move nearly every pixel it owns
        // and still register almost no shift in mean colour, which is what a
        // redistribution looks like and is not a failure.
        const size = r.area < 150 ? 'a sliver' : r.area < 400 ? 'small' : 'a real surface';
        const verdict = r.pct < 15 ? 'THE SKIN DOES NOT REACH IT'
            : r.pct < 50 ? 'partly repainted'
                : r.dRGB < 20 ? 'repainted, but the mean holds — it redistributed'
                    : 'repainted outright';
        console.log(`  ${r.what.padEnd(22)} ${String(r.area).padStart(5)} px (${size}) · ${r.pct.toFixed(0)}% of its own pixels moved · ${verdict}`);
    }
    console.log(`\nPNGs in ${OUT}/ — the *-zoom.png files are 4x nearest-neighbour crops.`);
} finally {
    await browser?.close();
    await server.close();
}
