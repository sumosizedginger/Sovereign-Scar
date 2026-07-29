// Photograph every telegraph shape the game can draw.
//
//   node tests/qa/telegraph-shots.mjs
//
// HANDOFF trap 8: when you change how the game looks, OPEN THE CAPTURES. A
// telegraph is the most load-bearing picture in this game — the whole combat
// design is the promise that reading one is the answer — and until now the only
// way to see a new one was to play to the boss that draws it. Phase B adds a
// move to fourteen bosses, so that needed to stop being true.
//
// Not part of the suite and not a gate. `tests/game/telegraph-truth.spec.mjs`
// already asserts that the shape drawn matches the shape resolved, which is the
// part a machine can judge. What a machine cannot judge is whether the thing on
// the floor READS at a glance from the game's camera — whether the ring's hole
// looks like somewhere to stand rather than a hole in the floor, whether the
// cone's colour separates from the room it is drawn on. That is what these are
// for. Look at them.
//
// Writes docs/media/telegraphs/*.png.

import fs from 'node:fs';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const OUT = 'docs/media/telegraphs';

// Each shot: a level, and the boss action to freeze mid-wind-up. `phase2` drops
// the boss to 40% HP first, because `update` re-derives the phase from HP every
// frame — assigning `boss.phase = 2` is overwritten before it ever chooses.
const SHOTS = [
    { name: 'warden-slam', level: 'beat-01-crypt', move: 'slam', stand: 5,
      note: 'circle — the oldest telegraph in the game, "not here"' },
    { name: 'warden-sweep', level: 'beat-01-crypt', move: 'sweep', stand: 3,
      note: 'cone — "get behind it"' },
    { name: 'warden-crack', level: 'beat-01-crypt', move: 'ground-crack', stand: 6,
      phase2: true, note: 'ring — the only one that means "get IN"' },
    { name: 'mantis-slice', level: 'beat-08-bone', move: 'slice', stand: 3,
      note: 'cone, 137 degrees — the widest in the game' },
    { name: 'wyrm-breath', level: 'beat-12-pyre', move: 'breath', stand: 6,
      note: 'cone, 52 degrees — the narrowest' },
    { name: 'core-charge', level: 'beat-04-sky', move: 'charge', stand: 5,
      note: 'line — "get out of the lane"' },
];

// The Tri-Compiler is not a BossBase subclass and has no `action`, so it cannot
// go through the loop above. Its cycle is driven by hand instead, and it is
// worth the special case: it is the only boss whose telegraph is three lanes at
// once, and the only one whose phase 2 changes the SHAPE of the room.
const TRI_SHOTS = [
    { name: 'tri-sweep', phase2: false, note: 'three lanes — the net, on the floor' },
    { name: 'tri-slam', converge: true, note: 'disc — all three cores land here' },
    { name: 'tri-walls', phase2: true, note: 'phase 2 — the lanes become walls' },
];

// The player's own ten moves.
//
// This file photographed the fourteen bosses and none of the hero, and that gap
// is exactly where trap 21 lived: the Light Caster's charged lance was drawn
// from 5.6 units in front of the player out to 16, most of the way off a
// top-down frame, and resolved over a lane starting at their feet. The suite
// could not see it (`ArcSmear` and `hitboxCheck` were each self-consistent), the
// probe that would have seen it did not exist, and the owner found it by
// playing. A move the player makes is a telegraph too — theirs is just aimed the
// other way — so it gets the same treatment.
//
// `smear-vs-hitbox.mjs` is the numeric half and reports over-draw as zero across
// all ten. Zero over-draw says nothing about whether the shape is ON SCREEN or
// whether it reads as the weapon it belongs to. That is what these are for.
const PLAYER_SHOTS = [
    { name: 'player-bare-strike', weapon: 'bare_strike', note: '50deg — the narrowest swing in the game' },
    { name: 'player-anchor-link', weapon: 'anchor_link', note: '60deg, 1.8 long — the default' },
    { name: 'player-wedge', weapon: 'tectonic_wedge', note: '70deg, 2.2 long' },
    { name: 'player-mallet', weapon: 'heavy_mallet', note: '90deg — the widest' },
    { name: 'player-caster-ray', weapon: 'light_caster', note: 'lane 12 long — drew NOTHING before this' },
    { name: 'player-bare-spin', weapon: 'bare_strike', charged: true, note: 'radial 1.5' },
    { name: 'player-anchor-shock', weapon: 'anchor_link', charged: true, note: 'radial 3.4 — the ring you buy when surrounded' },
    { name: 'player-wedge-thrust', weapon: 'tectonic_wedge', charged: true, note: 'lane 4.6 x 1.1 — reach, not width' },
    { name: 'player-mallet-spin', weapon: 'heavy_mallet', charged: true, note: 'radial 2.6 — every direction at once' },
    { name: 'player-caster-lance', weapon: 'light_caster', charged: true, note: 'lane 16 x 1.8 — the one the owner reported' },
];

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(8791);
let browser;
const failed = [];

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
    page.on('pageerror', (e) => console.error(`  page error: ${e}`));

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });
    await page.mouse.click(400, 300);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sleep(400);
    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.game.atTitle = false;
        s.game.paused = false;
        s.menu.close();
        s.hud?.setHidden?.(true);
    });

    for (const shot of SHOTS) {
        try {
            const got = await page.evaluate(async (cfg) => {
                const s = window.__sovereignScar;
                s.loadLevel(cfg.level);
                s.game.bossIntro = null;
                s.hud?.setHidden?.(true);
                await new Promise((r) => setTimeout(r, 700));

                const lvl = s.game.level;
                const def = lvl.def;
                const bossRoom = Object.keys(def.rooms).find((k) => def.rooms[k].boss);
                if (bossRoom) {
                    lvl.enterRoom(bossRoom, s.game);
                    const rp = lvl.respawnPoint?.();
                    if (rp) s.player.root.position.set(rp.x, rp.y, rp.z);
                }
                s.game.bossIntro = null;
                s.hud?.setHidden?.(true);
                await new Promise((r) => setTimeout(r, 500));

                const b = s.game.level.boss;
                if (!b) return { err: 'no boss' };
                const p = s.player;
                b._awake = true;
                b.shielded = false;
                if (cfg.phase2) { b.hp = Math.max(1, Math.floor(b.maxHp * 0.4)); b._phaseDirty = true; }

                // Drive the boss by hand until it commits the wanted move,
                // holding the player at a fixed standoff so range gates behave.
                //
                // The player has to be made untouchable FIRST. Waiting for a
                // specific move means hurrying past the others, and hurrying an
                // attack past means resolving it — up to fifty seconds of a
                // boss hitting a stationary player. The first run of this
                // script produced six identical dark rectangles and it took
                // opening one to work out they were the death fade, which is
                // trap 8 arriving to collect on its own script.
                const realDamage = p.health.damage.bind(p.health);
                p.health.damage = () => ({ accepted: false });
                const hold = () => {
                    p.root.position.x = b.root.position.x;
                    p.root.position.z = b.root.position.z + cfg.stand;
                };
                let frames = -1;
                for (let i = 0; i < 3000; i++) {
                    hold();
                    b.update(1 / 60, p, s.game);
                    const a = b.action;
                    if (a && a.stage === 'windup' && a.def.name === cfg.move && b._telegraph) {
                        frames = i; break;
                    }
                    if (a) { a.t = Math.min(a.t, 0.02); }   // hurry past moves we do not want
                }
                if (frames < 0) { p.health.damage = realDamage; return { err: `never drew ${cfg.move}` }; }

                // Let it get most of the way through the wind-up — the ring
                // GROWS, so a shot at t=0 shows a shape it never resolves at —
                // then freeze it so the render is not a race.
                const target = b.action.windup * 0.75;
                while (b._telegraph && b.action && b.action.t > target) {
                    hold();
                    b.update(1 / 60, p, s.game);
                }
                // Freeze by stretching BOTH ends of the clock, not one.
                // `update` derives opacity and scale from the RATIO
                // life/max — parking life at a huge number while max stays at
                // 0.95 drives that ratio to ~10^6, and the growth term
                // `0.25 + (1 - u) * 0.75` goes hugely negative. The first fixed
                // run photographed a correctly-lit room with the ring scaled to
                // about minus a million, i.e. nowhere. Hold the ratio at 0.25 —
                // three quarters of the way out, which is what the wind-up
                // actually looks like just before it lands.
                if (b.action) b.action.t = 1e6;
                if (b._telegraph) { b._telegraphMax = 4e6; b._telegraphLife = 1e6; }
                hold();
                // Do NOT drive the camera rig here. Its signature is
                // `update(dt, targetPosition)` — it takes a POINT, not a player
                // and not an options bag, and it owns no camera. Calling it
                // with the player object put `undefined` into the look target
                // and pointed the frame at nowhere. The game's own loop is
                // already driving it correctly; the only thing needed is time,
                // which is what the sleep outside this block is for.
                const tg = b._telegraph;
                const hp = s.player.health;
                return {
                    frames, phase: b.phase,
                    playerHp: hp ? `${hp.hp}/${hp.maxHp}` : '?',
                    drawnScale: +tg.scale.x.toFixed(2),
                    geo: tg.geometry.type,
                    params: JSON.parse(JSON.stringify(tg.geometry.parameters)),
                    scale: +tg.scale.x.toFixed(3),
                };
            }, shot);

            if (got.err) { failed.push(`${shot.name}: ${got.err}`); console.error(`  FAILED ${shot.name}: ${got.err}`); continue; }
            await sleep(1200);   // let the game's own loop settle the camera
            await page.screenshot({ path: `${OUT}/${shot.name}.png` });
            const p = got.params;
            const detail = got.geo === 'CircleGeometry'
                ? `${(p.thetaLength * 180 / Math.PI).toFixed(0)}deg r=${p.radius}`
                : got.geo === 'RingGeometry'
                    ? `hole=${p.innerRadius} edge=${p.outerRadius}`
                    : `${p.width}x${p.height}`;
            process.stdout.write(
                `  ${shot.name.padEnd(16)} ${got.geo.replace('Geometry', '').padEnd(8)} `
                + `${detail.padEnd(22)} phase ${got.phase}  hp ${got.playerHp}  — ${shot.note}\n`);
        } catch (e) {
            failed.push(`${shot.name}: ${e}`);
            console.error(`  FAILED ${shot.name}: ${e}`);
        }
    }
    for (const shot of TRI_SHOTS) {
        try {
            const got = await page.evaluate(async (cfg) => {
                const s = window.__sovereignScar;
                s.loadLevel('beat-02-spindle');
                s.game.bossIntro = null;
                s.hud?.setHidden?.(true);
                await new Promise((r) => setTimeout(r, 700));
                const lvl = s.game.level;
                const bossRoom = Object.keys(lvl.def.rooms).find((k) => lvl.def.rooms[k].boss);
                if (bossRoom) {
                    lvl.enterRoom(bossRoom, s.game);
                    const rp = lvl.respawnPoint?.();
                    if (rp) s.player.root.position.set(rp.x, rp.y, rp.z);
                }
                s.game.bossIntro = null;
                s.hud?.setHidden?.(true);
                await new Promise((r) => setTimeout(r, 500));

                const b = s.game.level.boss;
                if (!b || !b.cores) return { err: 'no tri-compiler in beat 02' };
                const p = s.player;
                p.health.damage = () => ({ accepted: false });
                if (cfg.phase2) for (const c of b.cores) c.hp = 1;

                // Stand in the middle of the trio so the frame is centred on it.
                const hold = () => {
                    if (!b.hub) return;
                    p.root.position.x = b.hub.x;
                    p.root.position.z = b.hub.z;
                };
                // Drive to the wind-up of the cycle we want.
                let ok = false;
                for (let i = 0; i < 6000; i++) {
                    hold();
                    b.update(1 / 60, p, s.game);
                    const wantMode = cfg.converge ? 'converge' : 'sweep';
                    if (b.stage === 'windup' && b.mode === wantMode) { ok = true; break; }
                }
                if (!ok) return { err: 'never reached that wind-up' };
                // Freeze mid-charge by holding the cycle clock still.
                b.update = () => {};
                return {
                    phase: b.phase, mode: b.mode,
                    lanes: (b._lanes || []).length,
                    slam: !!b._slamDisc,
                    beam: (() => {
                        const a = b.cores[0].mesh.position;
                        const c = b.cores[1].mesh.position;
                        return +Math.hypot(c.x - a.x, c.z - a.z).toFixed(2);
                    })(),
                };
            }, shot);
            if (got.err) { failed.push(`${shot.name}: ${got.err}`); console.error(`  FAILED ${shot.name}: ${got.err}`); continue; }
            await sleep(1200);
            await page.screenshot({ path: `${OUT}/${shot.name}.png` });
            process.stdout.write(
                `  ${shot.name.padEnd(16)} phase ${got.phase} ${got.mode.padEnd(9)} `
                + `${got.lanes} lanes, slam ${got.slam ? 'yes' : 'no '}, beam `
                + `${String(got.beam).padEnd(6)} — ${shot.note}
`);
        } catch (e) {
            failed.push(`${shot.name}: ${e}`);
            console.error(`  FAILED ${shot.name}: ${e}`);
        }
    }
    // Clear floor for the hero's own shots. Without this they inherit whichever
    // boss arena ran last — the Tri-Compiler's three cores and their beams sat
    // across every frame, which is a poor background for judging whether a
    // 16-unit lane reads, and the whole point of these is judging by eye.
    await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.loadLevel('beat-01-crypt');
        s.game.bossIntro = null;
        s.hud?.setHidden?.(true);
        await new Promise((r) => setTimeout(r, 800));
        const lvl = s.game.level;
        const plain = Object.keys(lvl.def.rooms).find((k) => !lvl.def.rooms[k].boss);
        if (plain) {
            lvl.enterRoom(plain, s.game);
            const rp = lvl.respawnPoint?.();
            if (rp) s.player.root.position.set(rp.x, rp.y, rp.z);
        }
        s.hud?.setHidden?.(true);
        await new Promise((r) => setTimeout(r, 600));
    });
    await sleep(800);

    for (const shot of PLAYER_SHOTS) {
        try {
            const got = await page.evaluate(async (cfg) => {
                const s = window.__sovereignScar;
                const p = s.player;
                p.inventory.activeWeapon = cfg.weapon;
                s.hud?.setHidden?.(true);
                // Face east, so every shot in the set is comparable and the
                // lane's length runs across the frame rather than into it.
                p.state.facingVec = { x: 1, z: 0 };
                p.state.facing = 1;

                // A smear is 0.12s long and the loop is decaying it, so the
                // race is unwinnable — freeze the pool instead. Stubbing
                // `update` holds every slot at the size and opacity it was
                // SPAWNED with, which is the honest picture: a fan grows 0.6/s
                // over its life, i.e. 7%, and that growth is the smear
                // over-reporting itself. What is drawn here is what the move
                // claims at the instant it resolves.
                p.arcSmear.update = () => {};
                for (const slot of p.arcSmear.pool) { slot.life = 0; slot.mesh.visible = false; }

                const w = (await import('/src/game/combat/weapons.js')).getWeapon(cfg.weapon);
                if (cfg.charged) {
                    if (!w.charge) return { err: `${cfg.weapon} has no charge` };
                    p._resolveCharge({ weapon: w, charge: w.charge }, [], null);
                } else {
                    p.attackCd = 0;
                    p.tryAttack([], null);
                }

                const live = p.arcSmear.pool.find((sl) => sl.life > 0);
                if (!live) return { err: 'nothing was drawn' };
                // Keep it alive across the settle sleep below, and hold it at
                // MID-SWING rather than at the instant of spawn.
                //
                // A swing now wipes across its own life, so age 0 is the first
                // sliver of it — photographing that and concluding the swing is
                // too dim would be judging an animation by its first frame. Age
                // 0.45 is the moment it lands, which is the frame the player is
                // actually reading.
                live.life = 1e6;
                live.mat.uniforms.uAge.value = 0.45;
                live.mat.opacity = 0.9;
                const m = live.mesh;
                const move = cfg.charged ? w.charge : w;
                // The uncharged ray has no `depthTolerance` — its half-width is
                // RAY_LATERAL, over in player.js — so read the width off the
                // lane that was actually drawn rather than printing NaN.
                const lane = m.geometry.getAttribute('position').count === 6;
                return {
                    scale: [+m.scale.x.toFixed(2), +m.scale.z.toFixed(2)],
                    lane,
                    range: move.range,
                    width: move.depthTolerance != null
                        ? move.depthTolerance * 2
                        : (lane ? m.scale.z : null),
                };
            }, shot);

            if (got.err) { failed.push(`${shot.name}: ${got.err}`); console.error(`  FAILED ${shot.name}: ${got.err}`); continue; }
            await sleep(900);
            await page.screenshot({ path: `${OUT}/${shot.name}.png` });
            const shape = got.lane
                ? `lane ${got.scale[0]}x${got.scale[1]}`
                : `fan r=${got.scale[0]}`;
            process.stdout.write(
                `  ${shot.name.padEnd(22)} ${shape.padEnd(16)} `
                + `hits ${got.range}x${got.width.toFixed(2)}  — ${shot.note}\n`);
        } catch (e) {
            failed.push(`${shot.name}: ${e}`);
            console.error(`  FAILED ${shot.name}: ${e}`);
        }
    }
} finally {
    if (browser) await browser.close();
    server.close();
}

const total = SHOTS.length + TRI_SHOTS.length + PLAYER_SHOTS.length;
console.log(`\nwrote ${total - failed.length}/${total} to ${OUT}/`);
if (failed.length) { console.log('failed:'); for (const f of failed) console.log(`  ${f}`); }
console.log('\nNow LOOK at them (trap 8). A telegraph that does not read is a');
console.log('telegraph that is not there, and no number in this file can tell you.');
