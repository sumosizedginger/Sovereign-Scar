// Independent QA: verify every dungeon key is physically collectable
// BEFORE the first locked/boss door that requires it (graph order + walk).
// Does not modify project source. Writes JSON report under tests/qa/out/.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

const chrome = findChromeVerbose();
if (!chrome.path) {
    console.error('FAIL: no chrome');
    process.exit(1);
}

const server = await startServer(8793);
const browser = await puppeteer.launch({
    executablePath: chrome.path,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});

const report = {
    startedAt: new Date().toISOString(),
    dungeons: [],
    issues: [],
    beat01Walk: null,
};

try {
    const page = await browser.newPage();
    await disableGamepads(page);
    await page.setViewport({ width: 900, height: 600 });
    page.setDefaultTimeout(120000);

    await page.goto(`${server.url}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
        () => !!(window.__sovereignScar && window.__sovereignScar.player),
        { timeout: 45000 },
    );
    await page.mouse.click(450, 300);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sleep(1200);

    const dungeons = await page.evaluate(
        () => window.__sovereignScar.LEVELS.map((l) => l.id).filter((id) => id.startsWith('beat-')),
    );
    console.log('dungeons', dungeons.length, dungeons.join(', '));

    for (const id of dungeons) {
        const r = await page.evaluate(async (dungeonId) => {
            const s = window.__sovereignScar;
            // Reset dungeon progress so keys/doors are fresh
            const raw = localStorage.getItem('vsbeu.progress');
            const prog = raw ? JSON.parse(raw) : {};
            if (prog.sovereignProgress?.dungeons) {
                delete prog.sovereignProgress.dungeons[dungeonId];
            }
            localStorage.setItem('vsbeu.progress', JSON.stringify(prog));

            s.loadLevel(dungeonId);
            await new Promise((res) => setTimeout(res, 1000));
            const lvl = s.game.level;
            if (!lvl?.def?.rooms) {
                return { id: dungeonId, err: 'no dungeon def' };
            }

            const def = lvl.def;
            const solids = s.game.collisionWorld.solids;
            const half = 0.4;
            const ROOM_STRIDE = 64;
            const issues = [];

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
                for (const [rid, room] of Object.entries(def.rooms)) {
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
                const room = def.rooms[rid];
                const ox = room.grid[0] * ROOM_STRIDE;
                const oz = room.grid[1] * ROOM_STRIDE;
                const pts = [];
                pts.push({
                    x: ox + (room.spawn?.x || 0),
                    z: oz + (room.spawn?.z || 0),
                    tag: 'spawn',
                });
                for (const door of room.doors || []) {
                    if (door.to === '_world') continue;
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

            // --- Graph progression from start with key economy ---
            // Edges that are open/exit are free; locked costs 1 small; boss costs boss key.
            // Keys placed in a room become available once that room is reachable.
            const start = def.start || Object.keys(def.rooms)[0];
            const pickups = (lvl.pickups || []).filter((pk) => /key/i.test(pk.label || ''));
            const keysByRoom = {};
            for (const pk of pickups) {
                const rid = roomOf(pk.mesh.position.x, pk.mesh.position.z);
                if (!rid) {
                    issues.push(`pickup ${pk.label} not in any room`);
                    continue;
                }
                (keysByRoom[rid] ||= []).push({
                    label: pk.label,
                    type: pk.label === 'Boss key' ? 'boss' : 'small',
                    x: pk.mesh.position.x,
                    z: pk.mesh.position.z,
                    y: pk.mesh.position.y,
                });
            }

            // Physical approachability of every key from room entries
            const keyPhys = [];
            for (const [rid, list] of Object.entries(keysByRoom)) {
                const room = def.rooms[rid];
                for (const k of list) {
                    let approach = Infinity;
                    for (let z = k.z - 2; z <= k.z + 2; z += 0.25) {
                        for (let x = k.x - 2; x <= k.x + 2; x += 0.25) {
                            if (blocked(x, z)) continue;
                            const d = Math.hypot(x - k.x, z - k.z);
                            if (d < approach) approach = d;
                        }
                    }
                    let bfsOk = false;
                    let from = null;
                    for (const e of entryPoints(rid)) {
                        if (canReach(e.x, e.z, k.x, k.z, room)) {
                            bfsOk = true;
                            from = e.tag;
                            break;
                        }
                    }
                    const ok = bfsOk && approach < 1.1;
                    if (!ok) {
                        issues.push(
                            `PHYS ${k.label}@${rid} bfs=${bfsOk} approach=${approach.toFixed(2)} from=${from}`,
                        );
                    }
                    keyPhys.push({
                        rid, label: k.label, type: k.type,
                        x: +k.x.toFixed(2), z: +k.z.toFixed(2), y: +k.y.toFixed(2),
                        bfsOk, approach: +approach.toFixed(3), from, ok,
                    });
                }
            }

            // Ordered unlock simulation: only traverse free doors until keys found
            const undirected = {};
            for (const [rid, room] of Object.entries(def.rooms)) {
                undirected[rid] = [];
                for (const d of room.doors || []) {
                    if (!d.to || d.to === '_world' || !def.rooms[d.to]) continue;
                    undirected[rid].push({
                        to: d.to,
                        type: d.type || 'open',
                        side: d.side,
                    });
                }
            }

            // Canonical unique locks (bidirectional locked counts as one edge)
            const lockEdges = new Set();
            let bossEdges = 0;
            for (const [rid, room] of Object.entries(def.rooms)) {
                for (const d of room.doors || []) {
                    if (!d.to || d.to === '_world') continue;
                    if (d.type === 'locked') {
                        lockEdges.add([rid, d.to].sort().join('|'));
                    }
                    if (d.type === 'boss') bossEdges += 1;
                }
            }
            // bossEdges is double-counted both ways usually — keep unique undirected
            const bossSet = new Set();
            for (const [rid, room] of Object.entries(def.rooms)) {
                for (const d of room.doors || []) {
                    if (d.type === 'boss' && d.to && d.to !== '_world') {
                        bossSet.add([rid, d.to].sort().join('|'));
                    }
                }
            }

            // Soft BFS: expand through open doors; collect keys when room reached;
            // spend keys on locked/boss when available.
            let small = 0;
            let boss = false;
            const reached = new Set();
            const opened = new Set();
            const collectedKeys = [];
            const events = [];
            let progress = true;
            let safety = 0;
            while (progress && safety++ < 200) {
                progress = false;
                // Flood open connectivity from currently reached (or start)
                const q = [];
                if (reached.size === 0) {
                    reached.add(start);
                    q.push(start);
                    events.push({ kind: 'start', room: start });
                    // collect keys in start
                    for (const k of (keysByRoom[start] || [])) {
                        if (k.type === 'boss') boss = true;
                        else small += 1;
                        collectedKeys.push({ ...k, when: 'enter:' + start });
                        events.push({ kind: 'key', room: start, label: k.label, type: k.type, small, boss });
                    }
                } else {
                    for (const r of reached) q.push(r);
                }
                const seenFlood = new Set(q);
                while (q.length) {
                    const cur = q.shift();
                    for (const e of undirected[cur] || []) {
                        const edgeKey = [cur, e.to].sort().join('|');
                        if (e.type === 'open' || e.type === 'exit' || opened.has(edgeKey)) {
                            if (!reached.has(e.to)) {
                                reached.add(e.to);
                                progress = true;
                                events.push({ kind: 'enter', room: e.to, via: cur, free: true });
                                for (const k of (keysByRoom[e.to] || [])) {
                                    // avoid double-collect
                                    if (collectedKeys.some((c) => c.label === k.label && c.rid === e.to
                                        && Math.abs(c.x - k.x) < 0.01 && Math.abs(c.z - k.z) < 0.01)) continue;
                                    if (k.type === 'boss') boss = true;
                                    else small += 1;
                                    collectedKeys.push({ ...k, when: 'enter:' + e.to });
                                    events.push({
                                        kind: 'key', room: e.to, label: k.label, type: k.type, small, boss,
                                    });
                                }
                            }
                            if (!seenFlood.has(e.to)) {
                                seenFlood.add(e.to);
                                q.push(e.to);
                            }
                        }
                    }
                }
                // Try to open one locked/boss door from any reached room if we have a key
                let openedOne = false;
                outer: for (const cur of [...reached]) {
                    for (const e of undirected[cur] || []) {
                        const edgeKey = [cur, e.to].sort().join('|');
                        if (opened.has(edgeKey) || reached.has(e.to)) continue;
                        if (e.type === 'locked') {
                            if (small > 0) {
                                small -= 1;
                                opened.add(edgeKey);
                                progress = true;
                                openedOne = true;
                                events.push({
                                    kind: 'unlock', from: cur, to: e.to, cost: 'small',
                                    smallLeft: small,
                                });
                                break outer;
                            } else {
                                // record soft-block if never openable later
                                events.push({
                                    kind: 'blocked-locked', from: cur, to: e.to, small, boss,
                                });
                            }
                        } else if (e.type === 'boss') {
                            if (boss) {
                                opened.add(edgeKey);
                                progress = true;
                                openedOne = true;
                                events.push({
                                    kind: 'unlock', from: cur, to: e.to, cost: 'boss',
                                });
                                break outer;
                            } else {
                                events.push({
                                    kind: 'blocked-boss', from: cur, to: e.to, small, boss,
                                });
                            }
                        }
                    }
                }
                if (openedOne) progress = true;
            }

            // Fail if any lock edge never opened while dungeon has more rooms beyond
            for (const edge of lockEdges) {
                if (!opened.has(edge)) {
                    // Is either side of the lock unreached?
                    const [a, b] = edge.split('|');
                    if (!reached.has(a) || !reached.has(b)) {
                        issues.push(`LOCK never openable in order: ${edge} (reached=${[...reached].join(',')}, smallLeft=${small})`);
                    }
                }
            }
            for (const edge of bossSet) {
                if (!opened.has(edge)) {
                    const [a, b] = edge.split('|');
                    if (!reached.has(a) || !reached.has(b)) {
                        issues.push(`BOSS door never openable in order: ${edge} (bossKey=${boss})`);
                    }
                }
            }

            // Economy: unique small locks vs small keys
            const smallKeysDecl = (def.keys || []).filter((k) => (k.type || 'small') === 'small').length;
            const bossKeysDecl = (def.keys || []).filter((k) => k.type === 'boss').length;
            if (smallKeysDecl < lockEdges.size) {
                issues.push(`economy: smallKeys ${smallKeysDecl} < unique locks ${lockEdges.size}`);
            }
            if (bossSet.size > 0 && bossKeysDecl < 1) {
                issues.push('economy: boss door without boss key in def.keys');
            }
            const smallPick = pickups.filter((p) => p.label === 'Small key').length;
            const bossPick = pickups.filter((p) => p.label === 'Boss key').length;
            if (smallPick !== smallKeysDecl) {
                issues.push(`small pickup ${smallPick} != def.keys ${smallKeysDecl}`);
            }
            if (bossPick !== bossKeysDecl) {
                issues.push(`boss pickup ${bossPick} != def.keys ${bossKeysDecl}`);
            }

            // Critical: first locked door must not be required before first small key
            // From start, expand only free doors; if a locked door is the only path
            // forward and no small key is in the free component → FAIL
            const freeComp = new Set([start]);
            const fq = [start];
            while (fq.length) {
                const cur = fq.shift();
                for (const e of undirected[cur] || []) {
                    if (e.type === 'open' || e.type === 'exit') {
                        if (!freeComp.has(e.to)) {
                            freeComp.add(e.to);
                            fq.push(e.to);
                        }
                    }
                }
            }
            let freeSmallKeys = 0;
            let freeBossKeys = 0;
            for (const rid of freeComp) {
                for (const k of (keysByRoom[rid] || [])) {
                    if (k.type === 'boss') freeBossKeys += 1;
                    else freeSmallKeys += 1;
                }
            }
            // Locked exits from free component
            const lockedExits = [];
            for (const rid of freeComp) {
                for (const e of undirected[rid] || []) {
                    if (e.type === 'locked' && !freeComp.has(e.to)) {
                        lockedExits.push({ from: rid, to: e.to });
                    }
                }
            }
            if (lockedExits.length > 0 && freeSmallKeys < 1) {
                issues.push(
                    `SOFTLOCK free-component: start free rooms [${[...freeComp].join(',')}] `
                    + `have ${freeSmallKeys} small keys but locked exits `
                    + lockedExits.map((x) => `${x.from}->${x.to}`).join(', '),
                );
            }

            // Boss door from free+unlocked progression without boss key handled above

            return {
                id: dungeonId,
                start,
                freeComp: [...freeComp],
                freeSmallKeys,
                freeBossKeys,
                lockedExits,
                lockEdges: [...lockEdges],
                bossEdges: [...bossSet],
                reached: [...reached],
                opened: [...opened],
                keyPhys,
                keysByRoom: Object.fromEntries(
                    Object.entries(keysByRoom).map(([k, v]) => [k, v.map((x) => ({
                        label: x.label, type: x.type,
                        x: +x.x.toFixed(2), z: +x.z.toFixed(2),
                    }))]),
                ),
                events: events.filter((e) => e.kind !== 'blocked-locked' && e.kind !== 'blocked-boss'
                    || true).slice(0, 80),
                issues,
            };
        }, id);

        report.dungeons.push(r);
        if (r.err) {
            report.issues.push(`[bug] ${id}: ${r.err}`);
            console.log(`\n=== ${id} ERR ${r.err}`);
            continue;
        }
        const status = r.issues.length ? 'FAIL' : 'OK';
        console.log(`\n=== ${r.id} [${status}] free=${r.freeComp.join(',')} freeSmall=${r.freeSmallKeys} locks=${r.lockEdges.length}`);
        for (const k of r.keyPhys || []) {
            console.log(`  ${k.label}@${k.rid} ok=${k.ok} bfs=${k.bfsOk} approach=${k.approach} from=${k.from}`);
        }
        for (const iss of r.issues) {
            console.log(`  !! ${iss}`);
            report.issues.push(`[bug] ${id}: ${iss}`);
        }
    }

    // Hard walk-collect for beat-01: physically walk to small key then boss key
    console.log('\n=== BEAT-01 WALK COLLECT ===');
    const walk = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        const raw = localStorage.getItem('vsbeu.progress');
        const prog = raw ? JSON.parse(raw) : {};
        if (prog.sovereignProgress?.dungeons) {
            delete prog.sovereignProgress.dungeons['beat-01-crypt'];
        }
        localStorage.setItem('vsbeu.progress', JSON.stringify(prog));
        s.loadLevel('beat-01-crypt');
        await new Promise((r) => setTimeout(r, 1100));
        const lvl = s.game.level;
        const p = s.player;
        const log = [];

        function seek(tx, tz, frames = 220) {
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
            return {
                x: +p.rig.position.x.toFixed(2),
                z: +p.rig.position.z.toFixed(2),
                dist: +Math.hypot(tx - p.rig.position.x, tz - p.rig.position.z).toFixed(2),
            };
        }

        // Start from tomb spawn → walk north into corridor toward key
        lvl.enterRoom('tomb', s.game);
        p.rig.position.set(0, 1.95, 3);
        p.physics.resetVelocity();
        log.push({ step: 'tomb-spawn', ...seek(0, -8, 180) });

        // Enter corridor via API then walk from south entry to key at (8, -60.5)
        // corridor origin (0,-64); key at +8, +3.5 → (8, -60.5)
        lvl.enterRoom('corridor', s.game);
        p.rig.position.set(0, 1.95, -56); // south of corridor
        p.physics.resetVelocity();
        // First walk into east gap where key sits
        const path = [
            [0, -56],
            [6, -56],
            [8, -58],
            [8, -60.5],
        ];
        for (const [x, z] of path) {
            log.push({ step: `seek-${x},${z}`, ...seek(x, z, 200) });
        }
        // Extra linger for pickup radius
        seek(8, -60.5, 80);
        const smallKeys = lvl.keyStore.smallKeys();
        const smallTaken = !!(lvl.pickups || []).find((pk) => pk.label === 'Small key' && pk.taken);
        log.push({ step: 'after-small', smallKeys, smallTaken, pos: {
            x: +p.rig.position.x.toFixed(2), z: +p.rig.position.z.toFixed(2),
        }});

        // Try to walk to locked north door and open with key
        // corridor N door ~ (0, -64-10) = (0, -74) interior
        seek(0, -72, 240);
        // Attempt door interaction via room graph if exposed
        let doorOpen = false;
        try {
            // force approach to door solid and call tryEnter if available
            if (typeof lvl.tryCrossDoor === 'function') {
                doorOpen = !!lvl.tryCrossDoor(s.game);
            }
        } catch (_) { /* ignore */ }
        // Spend key via enterRoom predecessor only if key held (simulate unlock)
        if (smallKeys >= 1 || smallTaken) {
            // Mark door open the same way the game would
            const dkCandidates = ['corridor|predecessor', 'predecessor|corridor'];
            for (const dk of dkCandidates) {
                try { lvl.keyStore.open?.(dk); } catch (_) { /* */ }
            }
            // Also try spend if not spent
            if (lvl.keyStore.smallKeys() > 0) lvl.keyStore.trySpendSmallKey();
        }
        lvl.enterRoom('predecessor', s.game);
        p.rig.position.set(0, 1.95, -128);
        p.physics.resetVelocity();
        log.push({ step: 'predecessor', smallLeft: lvl.keyStore.smallKeys() });

        // Walk west into secret for boss key
        lvl.enterRoom('secret', s.game);
        p.rig.position.set(-58, 1.95, -128);
        p.physics.resetVelocity();
        log.push({ step: 'secret-entry', ...seek(-64, -128, 260) });
        seek(-64, -128, 80);
        const hasBoss = lvl.keyStore.hasBossKey();
        const bossTaken = !!(lvl.pickups || []).find((pk) => pk.label === 'Boss key' && pk.taken);
        log.push({
            step: 'after-boss',
            hasBoss,
            bossTaken,
            pos: { x: +p.rig.position.x.toFixed(2), z: +p.rig.position.z.toFixed(2) },
        });

        // List all key pickups positions for evidence
        const keyPicks = (lvl.pickups || [])
            .filter((pk) => /key/i.test(pk.label || ''))
            .map((pk) => ({
                label: pk.label,
                taken: !!pk.taken,
                x: +pk.mesh.position.x.toFixed(2),
                y: +pk.mesh.position.y.toFixed(2),
                z: +pk.mesh.position.z.toFixed(2),
            }));

        return {
            smallKeysAfter: lvl.keyStore.smallKeys(),
            smallTaken,
            hasBoss,
            bossTaken,
            doorOpen,
            keyPicks,
            log,
            ok: (smallKeys >= 1 || smallTaken) && (hasBoss || bossTaken),
        };
    });

    report.beat01Walk = walk;
    console.log(JSON.stringify(walk, null, 2));
    if (!walk.ok) {
        report.issues.push(
            `[bug] beat-01-crypt: walk-collect failed smallTaken=${walk.smallTaken} `
            + `bossTaken=${walk.bossTaken} hasBoss=${walk.hasBoss}`,
        );
    }

    // Also walk the small key starting from tomb without enterRoom cheat for corridor key room path
    console.log('\n=== BEAT-01 NATURAL PATH FROM TOMB ===');
    // The preceding walk collected both keys into makeKeyStore's in-memory
    // cache. Reset before boot, not after loadLevel(), so this really is a
    // fresh expedition and the pickups are baked again.
    await page.evaluate(() => {
        const raw = localStorage.getItem('vsbeu.progress');
        const prog = raw ? JSON.parse(raw) : {};
        if (prog.sovereignProgress?.dungeons) {
            delete prog.sovereignProgress.dungeons['beat-01-crypt'];
        }
        localStorage.setItem('vsbeu.progress', JSON.stringify(prog));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
        () => !!(window.__sovereignScar && window.__sovereignScar.player),
        { timeout: 45000 },
    );
    await page.mouse.click(450, 300);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sleep(1200);
    const natural = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.loadLevel('beat-01-crypt');
        await new Promise((r) => setTimeout(r, 1100));
        const lvl = s.game.level;
        const p = s.player;
        const solids = s.game.collisionWorld.solids;
        const half = 0.4;

        function blocked(px, pz) {
            for (const sol of solids) {
                if (px + half > sol.minX && px - half < sol.maxX
                    && pz + half > sol.minZ && pz - half < sol.maxZ) {
                    return true;
                }
            }
            return false;
        }

        // Find small key world pos
        const sk = (lvl.pickups || []).find((pk) => pk.label === 'Small key');
        if (!sk) return { err: 'no small key pickup' };
        const tx = sk.mesh.position.x;
        const tz = sk.mesh.position.z;

        // Player starts in tomb
        const startX = p.rig.position.x;
        const startZ = p.rig.position.z;

        // Diagnostic only. The collision world contains the currently baked
        // room, not the whole 64-unit room graph, so a global BFS cannot prove
        // or disprove a cross-room path. The physics walk below is authoritative.
        const step = 0.5;
        const q = [[startX, startZ]];
        const seen = new Set([`${startX.toFixed(1)},${startZ.toFixed(1)}`]);
        let reached = false;
        let expanded = 0;
        const maxN = 80000;
        while (q.length && expanded < maxN) {
            const [x, z] = q.shift();
            expanded++;
            if (Math.hypot(x - tx, z - tz) < 1.0) {
                reached = true;
                break;
            }
            for (const [dx, dz] of [
                [step, 0], [-step, 0], [0, step], [0, -step],
            ]) {
                const nx = Math.round((x + dx) / step) * step;
                const nz = Math.round((z + dz) / step) * step;
                // bound search around crypt roughly
                if (Math.abs(nx) > 20 || nz > 20 || nz < -90) continue;
                const skk = `${nx.toFixed(1)},${nz.toFixed(1)}`;
                if (seen.has(skk)) continue;
                if (blocked(nx, nz)) continue;
                seen.add(skk);
                q.push([nx, nz]);
            }
        }

        // Also try walking with physics from start toward key
        function seek(goalX, goalZ, frames = 400) {
            for (let i = 0; i < frames; i++) {
                const dx = goalX - p.rig.position.x;
                const dz = goalZ - p.rig.position.z;
                const d = Math.hypot(dx, dz);
                if (d < 0.4) break;
                p.physics.update(s.game.collisionWorld, 0.05, {
                    wishX: dx / d, wishZ: dz / d, speed: 5.5, half: 0.4,
                });
                p.rig.position.y = 1.95;
                lvl.update(0.05, s.game);
            }
        }
        // waypoint through open tomb→corridor door (center x=0)
        seek(0, -6, 200);
        seek(0, -50, 300);
        seek(6, -56, 200);
        seek(tx, tz, 300);
        seek(tx, tz, 80);
        const smallTaken = !!sk.taken || lvl.keyStore.smallKeys() >= 1;
        const distToKey = Math.hypot(p.rig.position.x - tx, p.rig.position.z - tz);

        // Can we reach the locked door without a key? We should be able to walk to it.
        // Can we pass through it without key? Should fail.
        const beforeSpend = lvl.keyStore.smallKeys();
        // Inspect door solids near north corridor
        return {
            start: { x: +startX.toFixed(2), z: +startZ.toFixed(2) },
            key: { x: +tx.toFixed(2), z: +tz.toFixed(2) },
            bfsReachedKey: reached,
            bfsExpanded: expanded,
            walkPos: { x: +p.rig.position.x.toFixed(2), z: +p.rig.position.z.toFixed(2) },
            distToKey: +distToKey.toFixed(2),
            smallTaken,
            smallKeys: beforeSpend,
            naturalOk: smallTaken && distToKey < 1.1,
        };
    });
    report.beat01Natural = natural;
    console.log(JSON.stringify(natural, null, 2));
    if (!natural.naturalOk) {
        report.issues.push(
            `[bug] beat-01-crypt: natural physics walk to small key failed `
            + `walkTaken=${natural.smallTaken} dist=${natural.distToKey}`,
        );
    }

    report.finishedAt = new Date().toISOString();
    report.pass = report.issues.length === 0;
    const outPath = path.join(OUT_DIR, 'independent-key-order.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nWROTE ${outPath}`);
    console.log(`TOTAL ISSUES: ${report.issues.length}`);
    for (const i of report.issues) console.log(' -', i);
    process.exitCode = report.pass ? 0 : 1;
} finally {
    await browser.close();
    await server.close();
}
