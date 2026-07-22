// Walk-reachability audit: every Small/Boss key in every beat must be
// pathfindable from a room entry, and collectable via real physics.
import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';
import puppeteer from 'puppeteer-core';

const chrome = findChromeVerbose();
if (!chrome.path) {
    console.error('no chrome');
    process.exit(1);
}

const server = await startServer(8797);
const browser = await puppeteer.launch({
    executablePath: chrome.path,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});

try {
    const page = await browser.newPage();
    await disableGamepads(page);
    await page.setViewport({ width: 800, height: 600 });
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

    let failCount = 0;
    for (const id of dungeons) {
        const r = await page.evaluate(async (dungeonId) => {
            const s = window.__sovereignScar;
            const raw = localStorage.getItem('vsbeu.progress');
            const prog = raw ? JSON.parse(raw) : {};
            if (prog.sovereignProgress?.dungeons) {
                delete prog.sovereignProgress.dungeons[dungeonId];
            }
            localStorage.setItem('vsbeu.progress', JSON.stringify(prog));

            s.loadLevel(dungeonId);
            await new Promise((res) => setTimeout(res, 1000));
            const lvl = s.game.level;
            if (!lvl?.def?.rooms) return { id: dungeonId, err: 'no dungeon' };

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
                    tag: 'spawn',
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
                    const cx = cells.reduce((acc, c) => acc + c.x, 0) / cells.length;
                    const cz = cells.reduce((acc, c) => acc + c.z, 0) / cells.length;
                    const n = { N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, W: { x: -1, z: 0 }, E: { x: 1, z: 0 } }[door.side];
                    pts.push({
                        x: ox + cx + 0.5 - n.x * 2.5,
                        z: oz + cz + 0.5 - n.z * 2.5,
                        tag: `${door.side}:${door.to}:${door.type || 'open'}`,
                    });
                }
                pts.push({ x: ox, z: oz, tag: 'center' });
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

            // Count unique locked edges
            const locked = new Set();
            for (const [rid, room] of Object.entries(lvl.def.rooms)) {
                for (const d of room.doors || []) {
                    if (d.type === 'locked') {
                        locked.add([rid, d.to].sort().join('|'));
                    }
                }
            }

            const pickups = (lvl.pickups || []).filter((pk) => /key/i.test(pk.label || ''));
            const results = [];
            const issues = [];

            for (const pk of pickups) {
                const px = pk.mesh.position.x;
                const pz = pk.mesh.position.z;
                const rid = roomOf(px, pz);
                if (!rid) {
                    issues.push(`${pk.label} not in any room`);
                    results.push({ label: pk.label, rid: null, bfsOk: false });
                    continue;
                }
                const room = lvl.def.rooms[rid];
                const entries = entryPoints(rid);
                let bfsOk = false;
                let from = null;
                for (const e of entries) {
                    if (canReach(e.x, e.z, px, pz, room)) {
                        bfsOk = true;
                        from = e.tag;
                        break;
                    }
                }
                // Free cell near key within pickup radius?
                let approach = Infinity;
                for (let z = pz - 2; z <= pz + 2; z += 0.25) {
                    for (let x = px - 2; x <= px + 2; x += 0.25) {
                        if (blocked(x, z)) continue;
                        const d = Math.hypot(x - px, z - pz);
                        if (d < approach) approach = d;
                    }
                }
                // Pickup radius is 1.1. A free cell within that distance is enough
                // even if the key mesh sits on/inside a prop solid (ice walls,
                // pedestals). Fail only when no free cell is inside pickup range
                // or no path reaches that free cell from a room entry.
                const keyInSolid = blocked(px, pz);
                const approachable = approach < 1.1;
                if (!bfsOk || !approachable) {
                    issues.push(
                        `${pk.label}@${rid} bfs=${bfsOk} approach=${approach.toFixed(2)} solid=${keyInSolid} from=${from}`,
                    );
                }
                results.push({
                    label: pk.label,
                    rid,
                    x: +px.toFixed(2),
                    z: +pz.toFixed(2),
                    bfsOk,
                    from,
                    keyInSolid,
                    approach: +approach.toFixed(3),
                    approachable,
                });
            }

            // Graph key economy: keys must unlock progression (use def.keys)
            const smallKeys = (lvl.def.keys || []).filter((k) => (k.type || 'small') === 'small').length;
            const bossKeys = (lvl.def.keys || []).filter((k) => k.type === 'boss').length;
            if (smallKeys < locked.size) {
                issues.push(`smallKeys ${smallKeys} < locks ${locked.size}`);
            }
            if (bossKeys < 1 && Object.values(lvl.def.rooms).some((r) => (r.doors || []).some((d) => d.type === 'boss'))) {
                issues.push('boss door without boss key in def.keys');
            }
            // Actual pickups should match def.keys counts
            const smallPick = pickups.filter((p) => p.label === 'Small key').length;
            const bossPick = pickups.filter((p) => p.label === 'Boss key').length;
            if (smallPick !== smallKeys) {
                issues.push(`small pickup count ${smallPick} != def.keys ${smallKeys}`);
            }
            if (bossPick !== bossKeys) {
                issues.push(`boss pickup count ${bossPick} != def.keys ${bossKeys}`);
            }

            return {
                id: dungeonId,
                locks: locked.size,
                smallKeys,
                bossKeys,
                smallPick,
                bossPick,
                results,
                issues,
            };
        }, id);

        const status = r.issues?.length ? 'FAIL' : 'OK';
        if (r.issues?.length) failCount += r.issues.length;
        console.log(`\n=== ${r.id} [${status}] locks=${r.locks} small=${r.smallPick}/${r.smallKeys} boss=${r.bossPick}/${r.bossKeys}`);
        for (const k of r.results || []) {
            console.log(
                `  ${k.label} @ ${k.rid} (${k.x},${k.z}) bfs=${k.bfsOk} approach=${k.approach} from=${k.from}`,
            );
        }
        if (r.issues?.length) {
            for (const iss of r.issues) console.log(`  !! ${iss}`);
        }
    }

    console.log(`\nTOTAL ISSUES: ${failCount}`);
    process.exitCode = failCount > 0 ? 1 : 0;
} finally {
    await browser.close();
    await server.close();
}
