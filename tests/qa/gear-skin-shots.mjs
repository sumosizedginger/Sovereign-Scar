// tests/qa/gear-skin-shots.mjs — can you actually SEE a gear skin?
//
//   node tests/qa/gear-skin-shots.mjs
//
// Writes PNGs to docs/media/gear-skins/ and prints, for every outfit and every
// piece of held gear, how many screen pixels the piece owns and what the skin
// actually does to it.
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
// is not still even when the simulation is. Signal was above it, but a metric
// whose floor is that close to its ceiling cannot tell "faint" from "nothing",
// and those are the two answers this file exists to distinguish.
//
// SO IT STOPPED COUNTING CHANGE AND STARTED MEASURING THE OBJECT.
//
// Each piece of gear is hidden and shown while everything else holds still. The
// pixels that appear ARE the gear — its exact silhouette, at play scale, under
// the real light. Whatever the render noise is doing, the blade is still the
// same number of pixels wide.
//
// AND THEN THAT WAS WRONG TOO, IN THE OLDEST WAY IN THIS REPO.
//
// It reported the shield's mean colour moving by dRGB 9 out of 255 and called
// it "barely moves". The picture shows a flat grey slab becoming a dark plate
// with two bright bone rails down its sides — one of the clearest changes in
// the set. Both are correct: the face got DARKER and the bands got BRIGHTER,
// and a mean cancels them against each other exactly. `docs/media/README.md`
// carries the same lesson from the terraces, which scored 46/47/47 while the
// pictures went from concrete slabs to correct.
//
// So it reports three things about a piece and not one: how big it is, how many
// of ITS OWN pixels moved, and how much contrast it carries inside its own
// outline. A redistribution shows up in the second and third and is invisible
// to the first, which is how a working art change gets thrown away.
//
// EVERY OUTFIT, NOT ONE. The baseline for a piece is the same picture whatever
// is being worn, so it is shot once and every skin is compared against it. That
// is what makes the table below a comparison between outfits rather than four
// separate claims that each happen to sound fine on their own.

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
const WEAPONS = ['anchor_link', 'tectonic_wedge', 'heavy_mallet', 'light_caster'];

// 8850 is outside the block every spec in tests/ reserves. This probe first
// used 8795, which is `locked-doors-e2e`'s, and running the two together failed
// that spec with EADDRINUSE — a suite that is only green when nothing else is
// running is not green.
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
        // `player.js` rewrites `guard.hasShield` from the inventory every frame,
        // so setting that flag directly would be overwritten on the next tick
        // and the shield row would have measured an empty hand.
        s.player.inventory.grantItem('bulwark_shield');
        for (const w of ['tectonic_wedge', 'heavy_mallet', 'light_caster']) {
            s.player.inventory.grantItem(w);
        }
    });
    await page.evaluate(() => window.__sovereignScar.loadLevel('overworld'));
    await sleep(900);

    // Read the outfits out of the table rather than listing them here. A probe
    // with its own copy of the roster silently stops covering the newest thing.
    // PER SLOT, not one list for both. The Ashen has a shield and no weapon on
    // purpose, so a single roster would have quietly skipped the one piece it
    // does dress - a probe that takes the weapon list as the answer for the
    // shield is a probe that stops covering the exact case the table was
    // shaped to keep testable.
    const ART = await page.evaluate(async () => {
        const m = await import('/src/game/assets/gear-skins.js');
        return { weapon: m.gearSkinIds('weapon'), shield: m.gearSkinIds('shield') };
    });
    const SKINS = {
        weapon: ART.weapon.filter((id) => id !== SHIP),
        shield: ART.shield.filter((id) => id !== SHIP),
    };
    // Everything with art anywhere, for the body readings and the stills.
    const ALL = [...new Set([...SKINS.weapon, ...SKINS.shield])];
    console.log(`weapon art: ${SKINS.weapon.join(', ')}`);
    console.log(`shield art: ${SKINS.shield.join(', ')}`);

    /** Stand the hero on the flattest screen, dressed as asked, then stop the world. */
    async function pose({ body, weapon, weaponSkin, shield, shieldSkin }) {
        return page.evaluate(async (o) => {
            const s = window.__sovereignScar;
            s.game.paused = false;
            s.game.level.enterRoom('scarfield', s.game);
            await new Promise((r) => setTimeout(r, 320));
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
            await new Promise((r) => setTimeout(r, 650));
            s.game.paused = true;
            await new Promise((r) => setTimeout(r, 180));
            return {
                holding: !!s.player.heldWeapon?.model,
                shielded: !!s.player.heldShield?.model,
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
        await sleep(130);
    }

    /**
     * Grab the hero window, and write a 4x nearest-neighbour crop of it.
     *
     * Nearest-neighbour because this is voxel art and a bilinear upscale invents
     * gradients the game does not have — exactly the flattering lie that makes a
     * still look better than the thing. The full 1280x720 frame is written only
     * where it is asked for: it is the honest picture, but at 34 px of hero it
     * cannot settle a palette, and 40 of them is 40 MB.
     */
    async function grab(file, { full = false } = {}) {
        if (full && file) await page.screenshot({ path: `${OUT}/${file}.png` });
        const b64 = await page.screenshot({
            clip: { x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h },
            encoding: 'base64',
        });
        if (file) {
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
        }
        return b64;
    }

    /**
     * Everything worth knowing about one piece, shipped versus skinned.
     *
     * `hidden` and `shipped` come from the same pose with the piece toggled off
     * and on, so the pixels that differ ARE the piece. The threshold is
     * deliberately high: a held object against the ground or against the hero's
     * own body is a large difference, and the render noise that defeated this
     * file's second instrument was a small one.
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
                for (const i of mask) {
                    r += img[i]; g += img[i + 1]; bl += img[i + 2];
                    ls.push(lstar(img[i], img[i + 1], img[i + 2]));
                }
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
     * Re-dress a held piece WITHOUT re-posing, while the world is stopped.
     *
     * THIS IS THE CORRECTNESS ARGUMENT OF THE WHOLE FILE, and the fourth thing
     * it got wrong before getting it right. The silhouette mask is a set of
     * pixel indices cut from one frame; it only describes the gear in another
     * frame if the gear occupies exactly the same pixels. The version before
     * this one called `pose()` again for every skin, which re-entered the room
     * and let the idle animation land somewhere slightly else.
     *
     * For the wide weapons that still mostly overlapped and the numbers looked
     * plausible. For the Anchor Link, 0.10 units thick, it did not overlap at
     * all: the mask sampled the GROUND beside the blade, and all three outfits
     * reported a mean near 121,95,65 - which is dirt. Three completely
     * different palettes agreeing to within dRGB 1 is not a palette result, and
     * the pictures said so plainly, because the Drowned blade is green.
     *
     * The holders rebuild on demand and the update loop is not running while
     * paused, so calling `set` directly is both correct and the real code path.
     */
    async function reskin(which, weapon, skin) {
        await page.evaluate((w, wp, sk) => {
            const s = window.__sovereignScar;
            if (w === 'shield') s.player.heldShield.set(true, sk);
            else s.player.heldWeapon.set(wp, sk);
        }, which, weapon, skin);
        await sleep(160);
    }

    /**
     * The hero's own silhouette against the ground that was behind it.
     *
     * Returns the mean L* of both, so the separation is a perceptual number
     * rather than a channel average, plus the spread inside the figure - a
     * character with internal contrast survives a low-separation background
     * better than a flat one does.
     */
    async function figureGround(ground, figure) {
        return page.evaluate(async (b64g, b64f) => {
            const load = async (b64) => {
                const img = new Image();
                img.src = `data:image/png;base64,${b64}`;
                await img.decode();
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                c.getContext('2d').drawImage(img, 0, 0);
                return c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
            };
            const [g, f] = await Promise.all([load(b64g), load(b64f)]);
            const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
            const lstar = (r, gg, b) => {
                const Y = 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
                return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
            };
            const mask = [];
            for (let i = 0; i < g.length; i += 4) {
                const d = Math.abs(g[i] - f[i]) + Math.abs(g[i + 1] - f[i + 1]) + Math.abs(g[i + 2] - f[i + 2]);
                if (d > 45) mask.push(i);
            }
            const n = mask.length || 1;
            const stat = (img) => {
                const ls = []; let r = 0, gg = 0, b = 0;
                for (const i of mask) { r += img[i]; gg += img[i + 1]; b += img[i + 2]; ls.push(lstar(img[i], img[i + 1], img[i + 2])); }
                const mL = ls.reduce((s, v) => s + v, 0) / n;
                const sd = Math.sqrt(ls.reduce((s, v) => s + (v - mL) ** 2, 0) / n);
                return { mean: [r / n, gg / n, b / n].map((v) => Math.round(v)), L: +mL.toFixed(1), spread: +sd.toFixed(1) };
            };
            return { area: mask.length, ground: stat(g), figure: stat(f) };
        }, ground, figure);
    }

    const rows = [];
    const controls = [];

    for (const piece of [...WEAPONS, 'shield']) {
        const which = piece === 'shield' ? 'shield' : 'weapon';
        const weapon = piece === 'shield' ? 'anchor_link' : piece;

        // ONE POSE FOR THE WHOLE PIECE. Everything below happens inside it, so
        // every frame shares a body position, an animation phase and a dust
        // field, and the mask keeps describing the object it was cut from.
        const p = await pose({
            body: SHIP, weapon, shield: which === 'shield',
            weaponSkin: SHIP, shieldSkin: SHIP,
        });
        if (!(which === 'shield' ? p.shielded : p.holding)) {
            rows.push({ piece, outfit: '-', missing: true });
            continue;
        }
        await setVisible(which, false);
        const hidden = await grab(null);
        await setVisible(which, true);
        const shipped = await grab(`${piece}-crustwalker`, { full: piece === 'shield' });

        for (const skin of SKINS[which]) {
            await reskin(which, weapon, skin);
            const skinned = await grab(`${piece}-${skin}`);
            // `outfit`, not `skin` - `compare` returns a `skin` accumulator and
            // the spread below would overwrite the id with it. Two meanings for
            // one short word inside one object is its own bug.
            rows.push({ piece, outfit: skin, ...(await compare(hidden, shipped, skinned)) });
        }

        // THE CONTROL THAT WOULD HAVE CAUGHT THE DRIFT. Put the shipped gear
        // back and measure it against its own baseline: if the mask still
        // describes the object, almost nothing has changed. If the readings
        // above were taken over a moved target this comes back large, and every
        // number for this piece is void.
        await reskin(which, weapon, SHIP);
        const again = await grab(null);
        const back = await compare(hidden, shipped, again);
        controls.push({ piece, area: back.area, changed: back.changed });
    }

    // ── CAN YOU SEE THE HERO AT ALL? ───────────────────────────────────────
    //
    // Everything above measures gear. None of it can catch the failure that
    // actually matters, which is an outfit whose BODY disappears into the
    // ground it is standing on. `hero-skins.js` records at length why the
    // separation rim is azure and why a skin may never touch it; that rim is
    // the safety net, and a net is a thing you are supposed to test.
    //
    // This is the exact version of the figure/ground question. Hiding the rig
    // and showing it gives the hero's true silhouette, and the SAME pixels in
    // the hidden frame are the ground that was behind them. So the comparison
    // is the character against the specific dirt it is standing on, not against
    // an annulus that hopes to have found some.
    //
    // The Ashen is why this exists. It is dust-coloured on purpose - the whole
    // idea is to look like the civilians - and the first picture of it showed a
    // figure that had gone missing. Intent does not exempt an outfit from being
    // visible; a player figure that cannot be found is one that stops answering
    // the controller.
    const bodyRows = [];
    for (const skin of [SHIP, ...ALL]) {
        await pose({
            body: skin, weapon: 'tectonic_wedge', weaponSkin: skin,
            shield: true, shieldSkin: skin,
        });
        await page.evaluate(() => { window.__sovereignScar.player.rig.visible = false; });
        await sleep(150);
        const ground = await grab(null);
        await page.evaluate(() => { window.__sovereignScar.player.rig.visible = true; });
        await sleep(150);
        const figure = await grab(`outfit-${skin}`, { full: true });
        bodyRows.push({ skin, ...(await figureGround(ground, figure)) });
    }

    // ── the picker itself ───────────────────────────────────────────────────
    //
    // A wardrobe is a screen as much as it is a system, and it is the one part
    // of this feature a player interacts with directly. Shot with everything
    // unlocked, so the rows carry real options rather than the "Nothing found
    // yet" state a fresh save shows.
    await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.game.paused = false;
        const w = await import('/src/game/kernel/wardrobe.js');
        const g = await import('/src/game/assets/gear-skins.js');
        for (const id of g.gearSkinIds('weapon')) w.grantOutfit(s.player.inventory, id);
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
    console.log('piece             outfit        area  changed  % of it   dRGB   dL*   contrast within');
    console.log('-'.repeat(88));
    let lastPiece = null;
    for (const r of rows) {
        if (r.missing) { console.log(`${r.piece.padEnd(18)} NOT ON THE BODY`); continue; }
        r.dRGB = Math.round(Math.hypot(...r.ship.mean.map((v, i) => v - r.skin.mean[i])));
        r.dL = +(r.skin.L - r.ship.L).toFixed(1);
        r.pct = (r.changed / (r.area || 1)) * 100;
        console.log(
            (r.piece === lastPiece ? '' : r.piece).padEnd(18)
            + r.outfit.padEnd(13)
            + String(r.area).padStart(5)
            + String(r.changed).padStart(9)
            + `${r.pct.toFixed(0).padStart(8)}%`
            + String(r.dRGB).padStart(7)
            + String(r.dL).padStart(6)
            + `   ${r.ship.spread} -> ${r.skin.spread}`,
        );
        lastPiece = r.piece;
    }
    console.log('-'.repeat(88));

    console.log('\nWHAT THIS SAYS');
    // Area is the ceiling on how much any repaint can matter; `changed` is what
    // it actually spent. A piece can move nearly every pixel it owns and still
    // register almost no shift in mean colour — that is a redistribution, and it
    // is not a failure.
    for (const r of rows) {
        if (r.missing) continue;
        const verdict = r.pct < 15 ? 'THE SKIN DOES NOT REACH IT'
            : r.pct < 50 ? 'partly repainted'
                : r.dRGB < 20 ? 'repainted; mean holds, so it redistributed'
                    : 'repainted outright';
        console.log(`  ${r.piece.padEnd(15)} ${r.outfit.padEnd(12)} ${String(r.area).padStart(4)} px · ${r.pct.toFixed(0).padStart(3)}% moved · ${verdict}`);
    }
    // The one number that is about the SET rather than any one outfit: two
    // outfits that repaint a piece to the same place are one outfit with two
    // names, and nothing else here would notice.
    console.log('\nDO THE OUTFITS DIFFER FROM EACH OTHER?');
    for (const piece of [...WEAPONS, 'shield']) {
        const mine = rows.filter((r) => r.piece === piece && !r.missing);
        if (mine.length < 2) continue;
        let worst = Infinity, pair = '';
        for (let i = 0; i < mine.length; i++) {
            for (let j = i + 1; j < mine.length; j++) {
                const d = Math.round(Math.hypot(...mine[i].skin.mean.map((v, k) => v - mine[j].skin.mean[k])));
                if (d < worst) { worst = d; pair = `${mine[i].outfit} vs ${mine[j].outfit}`; }
            }
        }
        const call = worst < 15 ? 'TOO CLOSE' : worst < 35 ? 'close' : 'distinct';
        console.log(`  ${piece.padEnd(16)} closest pair: ${pair.padEnd(26)} dRGB ${String(worst).padStart(3)}  ${call}`);
        // The means themselves, because a distance is a claim about two numbers
        // and this file has already been wrong twice about numbers it did not
        // print. `shipped` first, then each outfit.
        console.log(`      shipped ${mine[0].ship.mean.join(',').padEnd(14)}` + mine.map((r) => `${r.outfit} ${r.skin.mean.join(',')}`).join('  '));
    }
    console.log('\nCAN YOU SEE THE HERO? figure against the ground actually behind it');
    console.log('outfit         area   figure L*   ground L*    dL*   dRGB   contrast within');
    console.log('-'.repeat(78));
    for (const b of bodyRows) {
        const dL = +(b.figure.L - b.ground.L).toFixed(1);
        const dRGB = Math.round(Math.hypot(...b.figure.mean.map((v, i) => v - b.ground.mean[i])));
        b.dL = dL; b.dRGB = dRGB;
        console.log(
            b.skin.padEnd(15)
            + String(b.area).padStart(5)
            + String(b.figure.L).padStart(12)
            + String(b.ground.L).padStart(12)
            + String(dL).padStart(7)
            + String(dRGB).padStart(7)
            + `   ${b.figure.spread}`,
        );
    }
    const ship = bodyRows.find((b) => b.skin === SHIP);
    console.log('-'.repeat(78));
    // The shipped hero is the bar. Nothing here has to beat it; anything that
    // falls well under it is harder to see than the character the game has
    // always asked people to follow, and that is a gameplay claim, not a taste
    // one.
    for (const b of bodyRows) {
        if (b.skin === SHIP) continue;
        const rel = Math.abs(b.dL) - Math.abs(ship.dL);
        const call = Math.abs(b.dL) < 4 && b.dRGB < 30 ? '*** DISAPPEARS ***'
            : rel < -6 ? 'notably harder to see than the shipped hero'
                : rel < 0 ? 'slightly harder to see' : 'as visible or better';
        console.log(`  ${b.skin.padEnd(14)} |dL*| ${Math.abs(b.dL).toFixed(1).padStart(5)} vs shipped ${Math.abs(ship.dL).toFixed(1)}   dRGB ${String(b.dRGB).padStart(3)} vs ${ship.dRGB}   ${call}`);
    }

    console.log('\nCONTROL - shipped gear put back, measured against its own baseline');
    let voided = 0;
    for (const c of controls) {
        const pct = (c.changed / (c.area || 1)) * 100;
        // A correct control lands near zero. Anything that climbs means the
        // object moved between readings and the mask stopped describing it,
        // which is exactly how this file once reported the colour of dirt.
        const ok = pct < 5;
        if (!ok) voided++;
        console.log(`  ${c.piece.padEnd(16)} ${String(c.changed).padStart(4)} / ${String(c.area).padStart(4)} px  ${pct.toFixed(1).padStart(5)}%  ${ok ? 'stable' : '*** READINGS FOR THIS PIECE ARE VOID ***'}`);
    }
    if (voided) console.log(`\n${voided} piece(s) moved between readings. Do not trust the table above.`);

    console.log(`\nPNGs in ${OUT}/ — the *-zoom.png files are 4x nearest-neighbour crops.`);
} finally {
    await browser?.close();
    await server.close();
}
