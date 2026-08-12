// tests/qa/player-captures.mjs — the game AS A PLAYER SEES IT.
//
//   node tests/qa/player-captures.mjs            → docs/media/player/<set>/
//   node tests/qa/player-captures.mjs --set=after
//
// WHY THIS IS NOT `certification-captures.mjs`
//
// That script hides the HUD on purpose, because its job is to certify that the
// CAMERA frames the room and that no void bleeds in at the edges. Chrome would
// be in the way of the thing it measures.
//
// Which means the entire 44-image certification set is a picture of a game
// nobody plays. Every judgement this project has made about how it LOOKS has
// been made from frames with the interface deliberately removed. The two loudest
// first-impression problems — "this looks like a developer build" and "where is
// my character" — are both invisible in that set: the first because the HUD is
// hidden, the second because a still frame of an empty room does not contain a
// player to lose.
//
// So this set is the other half, and its rules are the opposite:
//
//   * the HUD stays ON. It is the subject, not the obstruction.
//   * the player is IN frame, at real gameplay size.
//   * enemies are alive and awake where the shot is about combat.
//
// A `-clean` HUD-free twin is written next to each frame, because judging the
// character's readability needs the interface out of the way even though
// judging the interface needs it in.
//
// MIMING IS BANNED HERE
//
// Runs start through `startNewGame()`, never `click, ArrowDown, Enter`. Those
// three keystrokes silently stopped starting a run when the title menu gained a
// row, and the visual gate read the resulting no-run-started screen as a
// rendering regression. Every state this script wants, it asks for by name and
// then VERIFIES it got — `assertions` at the bottom is the whole point of that
// verification, and an empty set of them would mean the pictures cannot be
// trusted.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const setArg = (process.argv.find((a) => a.startsWith('--set=')) || '').slice(6);
const SET = setArg || 'before';
const OUT = `docs/media/player/${SET}`;

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(8791);
let browser;
const written = [];
const failed = [];
const checks = [];

/** Record a claim about the state the picture was taken in. */
const claim = (name, ok, detail = '') => {
    checks.push({ name, ok: !!ok, detail });
    if (!ok) process.stdout.write(`  !! ${name} — ${detail}\n`);
};

try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--window-size=1280,720'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await disableGamepads(page);
    page.setDefaultTimeout(60000);

    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });

    /**
     * Shoot the frame as a player sees it, then again with chrome hidden.
     * The HUD is restored afterwards — a capture that left it hidden would
     * silently turn every later "player-facing" frame into a certification one.
     */
    const shoot = async (name, note = '') => {
        await page.evaluate(() => window.__sovereignScar.hud?.setHidden?.(false));
        await sleep(120);
        await page.screenshot({ path: `${OUT}/${name}.png` });
        await page.evaluate(() => window.__sovereignScar.hud?.setHidden?.(true));
        await sleep(120);
        await page.screenshot({ path: `${OUT}/${name}-clean.png` });
        await page.evaluate(() => window.__sovereignScar.hud?.setHidden?.(false));
        written.push(name);
        process.stdout.write(`  ${name.padEnd(26)} ${note}\n`);
    };

    // ── 1. THE LITERAL FIRST FRAME ─────────────────────────────────────────
    // Not "the game after I set it up" — the first thing a new player is shown.
    // Shot before anything else touches the page for exactly that reason.
    await sleep(900);
    await shoot('01-title', 'title screen, untouched');
    claim('the title screen is actually the title screen',
        await page.evaluate(() => window.__sovereignScar.game.atTitle === true));

    // First frame of a NEW GAME — asked for by name.
    await page.evaluate(() => window.__sovereignScar.startNewGame());
    await sleep(1400);
    await shoot('02-first-frame', 'first frame of a new run');
    const started = await page.evaluate(() => {
        const s = window.__sovereignScar;
        return {
            atTitle: s.game.atTitle,
            level: s.game.levelId,
            hp: s.player.health.hp,
            hudText: document.getElementById('ss-hud')?.innerText || '',
            helpVisible: !!document.querySelector('#ss-hud ~ div'),
        };
    });
    claim('a run actually started', started.atTitle === false, JSON.stringify(started));
    claim('the new run opens in the overworld', started.level === 'overworld', started.level);

    // ── 2. ORDINARY TRAVERSAL, CRUST ───────────────────────────────────────
    await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.game.paused = false;
        await new Promise((r) => setTimeout(r, 600));
    });
    await page.keyboard.down('KeyW');
    await sleep(700);
    await page.keyboard.up('KeyW');
    await sleep(200);
    await shoot('03-crust-traversal', 'overworld, moving');

    // ── 3. ORDINARY COMBAT ─────────────────────────────────────────────────
    // A room with live enemies, given time to notice the player and close in,
    // with the player mid-swing. A screenshot of a room where nothing has
    // aggroed is a screenshot of traversal wearing combat's name.
    const combat = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.loadLevel('beat-01-crypt');
        await new Promise((r) => setTimeout(r, 900));
        const lvl = s.game.level;
        const rooms = Object.keys(lvl.def.rooms);
        // The room with the most enemies — an encounter, not a corridor.
        let best = null;
        for (const rid of rooms) {
            const n = (lvl.def.rooms[rid].enemies || []).length;
            if (!best || n > best.n) best = { rid, n };
        }
        lvl.enterRoom(best.rid, s.game);
        const p = lvl.respawnPoint?.();
        if (p) s.player.root.position.set(p.x, p.y, p.z);
        await new Promise((r) => setTimeout(r, 900));

        // Standing on the respawn point is standing in the DOORWAY, and rooms
        // are 64 units apart — so the room's own enemies sat 10.5 units away
        // against an aggro radius of 10, and the "combat" frame was a corridor
        // with two sentinels idling at the far end. Close the distance along the
        // doorway→enemy line, which stays inside the room by construction, and
        // stop short so the shot is a fight rather than a collision.
        const pos = s.player.root.position;
        const live = (s.game.level.enemies || []).filter((e) => !e.dead && e.hp > 0);
        let near = null;
        for (const e of live) {
            const r = e.rig?.position || e.root?.position;
            if (!r) continue;
            const d = Math.hypot(r.x - pos.x, r.z - pos.z);
            if (!near || d < near.d) near = { e, r, d };
        }
        if (near && near.d > 4) {
            const k = (near.d - 3.5) / near.d;
            s.player.root.position.set(
                pos.x + (near.r.x - pos.x) * k,
                pos.y,
                pos.z + (near.r.z - pos.z) * k,
            );
        }
        await new Promise((r) => setTimeout(r, 1300));
        // `e.hp`, not `e.health.hp` — an Enemy owns its pool directly, only the
        // PLAYER has a HealthPool. The first version of this filter asked every
        // enemy for `.health?.hp` and got undefined, so a room with two live
        // sentinels in it reported "0 alive" and the shot would have been filed
        // as combat with nothing in it.
        const alive = (s.game.level.enemies || []).filter((e) => !e.dead && e.hp > 0);
        // "Noticed" has no flag to read: an enemy acts when the player is inside
        // its aggro radius and is otherwise ordinary. So measure the actual
        // condition rather than inventing a state name for it.
        const pp = s.player.root.position;
        const engaged = alive.filter((e) => {
            const r = e.rig?.position || e.root?.position;
            if (!r) return false;
            return Math.hypot(r.x - pp.x, r.z - pp.z) < (e.aggroRange || 10);
        });
        return {
            room: best.rid,
            authored: best.n,
            alive: alive.length,
            awake: engaged.length,
            playerY: +pp.y.toFixed(2),
            nearest: engaged.length
                ? +Math.min(...alive.map((e) => {
                    const r = e.rig?.position || e.root?.position;
                    return r ? Math.hypot(r.x - pp.x, r.z - pp.z) : 1e9;
                })).toFixed(1)
                : null,
        };
    });
    await page.keyboard.press('Space');
    await sleep(140);
    await shoot('04-combat', `${combat.room}: ${combat.alive} alive, ${combat.awake} engaged`);
    claim('the combat shot contains live enemies', combat.alive >= 2, JSON.stringify(combat));
    claim('and they have noticed the player', combat.awake >= 1, JSON.stringify(combat));
    // Teleporting toward an enemy can land the player in geometry or drop them
    // through the floor, and either would produce a picture of nothing.
    claim('and the player is standing on the floor, not falling through it',
        combat.playerY > 0.5 && combat.playerY < 6, JSON.stringify(combat));

    // ── 4. DUNGEON TRAVERSAL ───────────────────────────────────────────────
    await page.evaluate(async () => {
        const s = window.__sovereignScar;
        const lvl = s.game.level;
        lvl.enterRoom(lvl.def.start, s.game);
        const p = lvl.respawnPoint?.();
        if (p) s.player.root.position.set(p.x, p.y, p.z);
        await new Promise((r) => setTimeout(r, 900));
    });
    await shoot('05-crypt-traversal', 'beat-01 entry room');

    // ── 5. A BOSS FIGHT ────────────────────────────────────────────────────
    // The intro push-in is cancelled: it frames the boss's face, which is a
    // portrait, not the fight the player is looking at.
    const boss = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        const lvl = s.game.level;
        const bossRoom = Object.keys(lvl.def.rooms).find((k) => lvl.def.rooms[k].boss);
        lvl.enterRoom(bossRoom, s.game);
        const p = lvl.respawnPoint?.();
        if (p) s.player.root.position.set(p.x, p.y, p.z);
        s.game.bossIntro = null;
        await new Promise((r) => setTimeout(r, 2400));
        const b = s.game.activeBoss || s.game.level?.boss;
        if (b) b._awake = true;
        await new Promise((r) => setTimeout(r, 1600));
        return {
            room: bossRoom,
            name: b?.bossName || null,
            hp: b?.hp ?? null,
            barShown: document.getElementById('ss-boss-bar')?.style.display !== 'none',
        };
    });
    await shoot('06-boss-fight', `${boss.name} — bar ${boss.barShown ? 'up' : 'DOWN'}`);
    claim('the boss shot has a boss in it', !!boss.name, JSON.stringify(boss));
    claim('and its health bar is on screen', boss.barShown, JSON.stringify(boss));

    // ── 6. THE MAP ─────────────────────────────────────────────────────────
    // The map screen draws only rooms the player has VISITED (unless the
    // dungeon's map pickup is held). A fixture that teleports once has visited
    // one room, and a screenshot of it is one square — which is exactly how a
    // working map got photographed as broken and written up as a defect.
    //
    // So visit the dungeon for real: walk the room list, then stand somewhere in
    // the middle of it. That is also the truer picture, because it is what a
    // player halfway through actually has.
    //
    // `mapData()` returns `{ kind, name, mapAll, rooms:[{ …, doors:[] }] }` —
    // rooms, with doors NESTED inside each. The first version of this counted
    // `d.nodes` and `d.doors`, got 0 and 0 from a map that was drawing fine, and
    // would have reported the map as empty for the second time in this project.
    const map = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        const lvl = s.game.level;
        const ids = Object.keys(lvl.def.rooms);
        for (const rid of ids) {
            lvl.enterRoom(rid, s.game);
            await new Promise((r) => setTimeout(r, 90));
        }
        // Settle somewhere that is not the boss room, so the "you are here"
        // marker sits mid-dungeon like a real player's would.
        const mid = ids.find((r) => !lvl.def.rooms[r].boss && r !== lvl.def.start) || lvl.def.start;
        lvl.enterRoom(mid, s.game);
        const p = lvl.respawnPoint?.();
        if (p) s.player.root.position.set(p.x, p.y, p.z);
        await new Promise((r) => setTimeout(r, 500));
        s.mapScreen.open(s.game);
        await new Promise((r) => setTimeout(r, 500));
        const d = s.game.level?.mapData?.() || {};
        const rooms = d.rooms || [];
        return {
            open: s.mapScreen.isOpen,
            rooms: rooms.length,
            visited: rooms.filter((r) => r.visited).length,
            doors: rooms.reduce((n, r) => n + (r.doors || []).length, 0),
            boss: rooms.filter((r) => r.boss).length,
            current: rooms.filter((r) => r.current).length,
        };
    });
    await shoot('07-map', `${map.visited}/${map.rooms} rooms visited, ${map.doors} doors`);
    claim('the map screen is open', map.open, JSON.stringify(map));
    claim('and shows a dungeon that has been walked, not one square',
        map.visited >= 4, JSON.stringify(map));
    claim('and knows where the player is standing',
        map.current === 1, JSON.stringify(map));
    await page.evaluate(() => window.__sovereignScar.mapScreen.close(window.__sovereignScar.game));
    await sleep(300);

    // ── 7. PAUSE ───────────────────────────────────────────────────────────
    const paused = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.menu.openPause();
        s.game.paused = true;
        await new Promise((r) => setTimeout(r, 400));
        return { paused: s.game.paused, menuOpen: !!s.menu.open || !!s.menu.isOpen };
    });
    await shoot('08-pause', `paused=${paused.paused}`);
    claim('the pause shot is actually paused', paused.paused, JSON.stringify(paused));
    await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.menu.close();
        s.game.paused = false;
        await new Promise((r) => setTimeout(r, 300));
    });

    // ── 8. AN ENEMY-DENSE SCENE, AND THE THREE HARD-TO-READ PLACES ─────────
    for (const [id, label] of [
        ['beat-09-town', '09-town'],
        ['beat-12-pyre', '10-pyre'],
        ['beat-14-leviathan', '11-leviathan'],
    ]) {
        try {
            const info = await page.evaluate(async (lid) => {
                const s = window.__sovereignScar;
                s.loadLevel(lid);
                await new Promise((r) => setTimeout(r, 900));
                const lvl = s.game.level;
                let best = null;
                for (const rid of Object.keys(lvl.def.rooms)) {
                    const n = (lvl.def.rooms[rid].enemies || []).length;
                    if (!best || n > best.n) best = { rid, n };
                }
                lvl.enterRoom(best.rid, s.game);
                const p = lvl.respawnPoint?.();
                if (p) s.player.root.position.set(p.x, p.y, p.z);
                s.game.bossIntro = null;
                await new Promise((r) => setTimeout(r, 2000));
                const alive = (s.game.level.enemies || []).filter((e) => !e.dead);
                return { room: best.rid, alive: alive.length };
            }, id);
            await shoot(label, `${info.room}: ${info.alive} enemies`);
            claim(`${label} has the player in a populated room`,
                info.alive >= 1, JSON.stringify(info));
        } catch (e) {
            failed.push(`${label}: ${e}`);
            console.error(`  FAILED ${label}: ${e}`);
        }
    }

    // ── 9. GREYSCALE TWINS ─────────────────────────────────────────────────
    //
    // The readability question is "can you find your character", and colour is
    // the weakest of the three things that answer it — it is also the one that
    // fails for the ~8% of players with a colour vision deficiency, and the one
    // that vanishes the moment the room's light is the same hue as the hero.
    // So every clean frame gets a desaturated twin, and if the player cannot be
    // found in THAT, the shape and value work is not finished regardless of what
    // the colour version looks like.
    //
    // Luma weights, not a naive channel average: (0.2126, 0.7152, 0.0722) is
    // what the eye actually does, and an average makes blue far too light —
    // which would flatter a hero whose accent is blue.
    for (const name of written) {
        const src = `${OUT}/${name}-clean.png`;
        const b64 = fs.readFileSync(src).toString('base64');
        const out = await page.evaluate(async (dataB64) => {
            const img = new Image();
            await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + dataB64; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, cv.width, cv.height);
            const px = d.data;
            for (let i = 0; i < px.length; i += 4) {
                const y = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
                px[i] = px[i + 1] = px[i + 2] = y;
            }
            ctx.putImageData(d, 0, 0);
            return cv.toDataURL('image/png').split(',')[1];
        }, b64);
        fs.writeFileSync(`${OUT}/${name}-grey.png`, Buffer.from(out, 'base64'));
    }

    console.log('');
    console.log(`wrote ${written.length * 3} images to ${OUT}/ (each shot + -clean + -grey)`);
    if (failed.length) {
        console.log(`FAILED ${failed.length}:`);
        for (const f of failed) console.log(`  ${f}`);
    }
    const bad = checks.filter((c) => !c.ok);
    console.log('');
    console.log(`state claims: ${checks.length - bad.length}/${checks.length} held`);
    for (const c of bad) console.log(`  BROKEN CLAIM  ${c.name} — ${c.detail}`);
    console.log(`page errors during the run: ${errors.length}`);
    for (const e of errors.slice(0, 5)) console.log(`  ${e}`);
    if (bad.length) process.exitCode = 1;
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
