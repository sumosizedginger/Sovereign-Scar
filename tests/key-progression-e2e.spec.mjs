// Every small/boss key across all 14 beats must be physically approachable
// from a room entry (collision free cell within pickup radius 1.1) so
// players can collect keys before doors that require them.
//
// Regression for: boss key on a y>=1 solid pedestal (beat-01 secret) and
// dry-islet keys built as XZ walls (beat-11 mirefloor) — both uncollectable
// on foot even though graph validation and teleport tests passed.

import { startServer, findChromeVerbose, disableGamepads, sleep } from './harness.mjs';

export async function run(t) {
    let puppeteer;
    try {
        puppeteer = await import('puppeteer-core');
    } catch (e) {
        t.ok('puppeteer-core', false, String(e));
        return;
    }
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }

    const server = await startServer(8798);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(90000);
        await page.setViewport({ width: 800, height: 600 });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));

        await page.goto(`${server.url}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.player),
            { timeout: 30000 },
        );
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(1000);

        const dungeons = await page.evaluate(
            () => window.__sovereignScar.LEVELS.map((l) => l.id).filter((id) => id.startsWith('beat-')),
        );
        t.ok('campaign has 14 beats', dungeons.length === 14, `n=${dungeons.length}`);

        const unreachable = [];
        let checked = 0;

        for (const id of dungeons) {
            const res = await page.evaluate(async (dungeonId) => {
                const s = window.__sovereignScar;
                const raw = localStorage.getItem('vsbeu.progress');
                const prog = raw ? JSON.parse(raw) : {};
                if (prog.sovereignProgress?.dungeons) {
                    delete prog.sovereignProgress.dungeons[dungeonId];
                }
                localStorage.setItem('vsbeu.progress', JSON.stringify(prog));

                s.loadLevel(dungeonId);
                await new Promise((r) => setTimeout(r, 900));
                const lvl = s.game.level;
                if (!lvl?.def?.rooms) return { id: dungeonId, bad: ['no dungeon'], n: 0 };

                const solids = s.game.collisionWorld.solids;
                const half = 0.4;
                const ROOM_STRIDE = 64;

                function blocked(px, pz) {
                    for (const sol of solids) {
                        if (px + half > sol.minX && px - half < sol.maxX
                            && pz + half > sol.minZ && pz - half < sol.maxZ) {
                            return true;
                        }
                    }
                    return false;
                }

                function roomOf(px, pz) {
                    for (const [rid, room] of Object.entries(lvl.def.rooms)) {
                        const ox = room.grid[0] * ROOM_STRIDE;
                        const oz = room.grid[1] * ROOM_STRIDE;
                        if (Math.abs(px - ox) <= room.half + 1.5
                            && Math.abs(pz - oz) <= room.half + 1.5) {
                            return rid;
                        }
                    }
                    return null;
                }

                function entryPoints(rid) {
                    const room = lvl.def.rooms[rid];
                    const ox = room.grid[0] * ROOM_STRIDE;
                    const oz = room.grid[1] * ROOM_STRIDE;
                    const pts = [];
                    pts.push({
                        x: ox + (room.spawn?.x || 0),
                        z: oz + (room.spawn?.z || 0),
                    });
                    for (const door of room.doors || []) {
                        const w = door.width || 2;
                        const cells = [];
                        for (let i = 0; i < w; i++) {
                            const c = (door.at || 0) - Math.floor(w / 2) + i;
                            if (door.side === 'N') cells.push({ x: c, z: -room.half });
                            else if (door.side === 'S') cells.push({ x: c, z: room.half });
                            else if (door.side === 'W') cells.push({ x: -room.half, z: c });
                            else cells.push({ x: room.half, z: c });
                        }
                        const cx = cells.reduce((a, c) => a + c.x, 0) / cells.length;
                        const cz = cells.reduce((a, c) => a + c.z, 0) / cells.length;
                        const n = { N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, W: { x: -1, z: 0 }, E: { x: 1, z: 0 } }[door.side];
                        pts.push({
                            x: ox + cx + 0.5 - n.x * 2.5,
                            z: oz + cz + 0.5 - n.z * 2.5,
                        });
                    }
                    pts.push({ x: ox, z: oz });
                    return pts.filter((pt) => !blocked(pt.x, pt.z));
                }

                function canReach(sx, sz, tx, tz, room) {
                    const ox = room.grid[0] * ROOM_STRIDE;
                    const oz = room.grid[1] * ROOM_STRIDE;
                    const bound = room.half + 2;
                    const step = 0.5;
                    const q = [[sx, sz]];
                    const seen = new Set([`${sx.toFixed(2)},${sz.toFixed(2)}`]);
                    while (q.length) {
                        const [x, z] = q.shift();
                        if (Math.hypot(x - tx, z - tz) < 1.05) return true;
                        for (const [dx, dz] of [
                            [step, 0], [-step, 0], [0, step], [0, -step],
                            [step, step], [-step, step], [step, -step], [-step, -step],
                        ]) {
                            const nx = Math.round((x + dx) / step) * step;
                            const nz = Math.round((z + dz) / step) * step;
                            if (Math.abs(nx - ox) > bound || Math.abs(nz - oz) > bound) continue;
                            const sk = `${nx.toFixed(2)},${nz.toFixed(2)}`;
                            if (seen.has(sk)) continue;
                            if (blocked(nx, nz)) continue;
                            seen.add(sk);
                            q.push([nx, nz]);
                        }
                    }
                    return false;
                }

                const pickups = (lvl.pickups || []).filter((pk) => /key/i.test(pk.label || ''));
                const bad = [];
                for (const pk of pickups) {
                    const px = pk.mesh.position.x;
                    const pz = pk.mesh.position.z;
                    const rid = roomOf(px, pz);
                    if (!rid) {
                        bad.push(`${pk.label}@?`);
                        continue;
                    }
                    const room = lvl.def.rooms[rid];
                    let approach = Infinity;
                    for (let z = pz - 2; z <= pz + 2; z += 0.25) {
                        for (let x = px - 2; x <= px + 2; x += 0.25) {
                            if (blocked(x, z)) continue;
                            const d = Math.hypot(x - px, z - pz);
                            if (d < approach) approach = d;
                        }
                    }
                    if (approach >= 1.1) {
                        bad.push(`${pk.label}@${rid} approach=${approach.toFixed(2)}`);
                        continue;
                    }
                    let ok = false;
                    for (const e of entryPoints(rid)) {
                        if (canReach(e.x, e.z, px, pz, room)) {
                            ok = true;
                            break;
                        }
                    }
                    if (!ok) bad.push(`${pk.label}@${rid} no path`);
                }

                // Walk-collect beat-01 keys on foot (not teleport) as a hard check
                let walk = null;
                if (dungeonId === 'beat-01-crypt') {
                    const p = s.player;
                    const seek = (tx, tz, frames = 200) => {
                        for (let i = 0; i < frames; i++) {
                            const dx = tx - p.rig.position.x;
                            const dz = tz - p.rig.position.z;
                            const d = Math.hypot(dx, dz);
                            if (d < 0.35) break;
                            p.physics.update(s.game.collisionWorld, 0.05, {
                                wishX: dx / d, wishZ: dz / d, speed: 5.5, half: 0.4,
                            });
                            p.rig.position.y = 1.95;
                            lvl.update(0.05, s.game);
                        }
                    };
                    lvl.enterRoom('corridor', s.game);
                    p.rig.position.set(0, 1.95, -56);
                    p.physics.resetVelocity();
                    seek(8, -60.5, 250);
                    seek(8, -60.5, 60);
                    const small = lvl.keyStore.smallKeys();
                    const smallPickupTaken = !!lvl.pickups.find((pk) => pk.label === 'Small key' && pk.taken);
                    // Enter secret via room API after having the small key; walk onto boss pedestal
                    lvl.enterRoom('secret', s.game);
                    p.rig.position.set(-58, 1.95, -128);
                    p.physics.resetVelocity();
                    seek(-64, -128, 220);
                    seek(-64, -128, 60);
                    walk = {
                        small,
                        boss: lvl.keyStore.hasBossKey(),
                        smallPickupTaken,
                        bossPickupTaken: !!lvl.pickups.find((pk) => pk.label === 'Boss key' && pk.taken),
                    };
                }

                return { id: dungeonId, bad, n: pickups.length, walk };
            }, id);

            checked += res.n;
            for (const b of res.bad) unreachable.push(`${res.id} ${b}`);
            if (res.walk) {
                t.ok('beat-01 small key walk-collectable',
                    res.walk.small >= 1 || res.walk.smallPickupTaken,
                    JSON.stringify(res.walk));
                t.ok('beat-01 boss key walk-collectable',
                    res.walk.boss || res.walk.bossPickupTaken,
                    JSON.stringify(res.walk));
            }
        }

        t.ok('checked every dungeon key', checked >= 40, `checked=${checked}`);
        t.ok('every key is approachable on foot',
            unreachable.length === 0,
            unreachable.length ? unreachable.slice(0, 8).join(' | ') : `all ${checked} ok`);
        t.ok('no fatal pageerrors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
        if (browser) await browser.close();
        await server.close();
    }
}
