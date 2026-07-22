// Browser E2E (Phase W): room-graph dungeon — door transitions, camera
// room-lock bounds, locked doors + keys. Drives the dev test dungeon by
// ticking level.update deterministically (headless swiftshader is too slow
// for realtime input), same pattern as boss-e2e.

import { startServer, findChromeVerbose, sleep, disableGamepads } from './harness.mjs';

export async function run(t) {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }
    let puppeteer;
    try {
        puppeteer = await import('puppeteer-core');
    } catch (e) {
        t.ok('puppeteer-core', false, String(e));
        return;
    }

    const server = await startServer(8792);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(60000);
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(200);

        const res = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const out = {};
            s.game.atTitle = false;
            s.game.paused = true; // freeze the live loop; we tick manually
            s.menu.close();
            s.game.paused = true;
            s.loadLevel('w-test-dungeon');
            await new Promise((r) => setTimeout(r, 150));
            const level = s.game.level;
            const player = s.player;
            const tick = (n) => { for (let i = 0; i < n; i++) level.update(0.05, s.game); };

            out.boot = {
                room: level.currentRoomId(),
                baked: level.bakedRooms(),
                boundsOk: !!level.cameraBounds && level.cameraBounds.maxX > level.cameraBounds.minX,
                enemies: level.enemies.length,
                spawn: { x: +player.root.position.x.toFixed(1), z: +player.root.position.z.toFixed(1) },
            };

            // 1) Open door N: stand at the threshold, tick → SLIDING → hall
            s.cameraRig.focus({ height: 6, back: 3.5, duration: 5 });
            player.rig.position.set(0, 1.95, -7.4);
            tick(1);
            out.sliding = level.isTransitioning();
            out.focusCleared = s.cameraRig._focus === null;
            tick(10); // 0.5 s > 0.35 s transition
            out.afterN = {
                room: level.currentRoomId(),
                enemies: level.enemies.length,
                boundsMinZ: level.cameraBounds.minZ,
                pz: +player.root.position.z.toFixed(1),
            };

            // 2) Locked door W without key: bounce, stay in hall
            player.rig.position.set(-9.4, 1.95, -64);
            tick(1);
            out.lockBounce = {
                room: level.currentRoomId(),
                px: +player.root.position.x.toFixed(1),
            };

            // 3) Key pickup in hall
            player.rig.position.set(4, 1.95, -64);
            tick(1);
            out.keysAfterPickup = level.keyStore.smallKeys();

            // 4) Key opens the door; walking through lands in the vault
            player.rig.position.set(-9.4, 1.95, -64);
            tick(1); // consumes key, removes plug
            out.keysAfterOpen = level.keyStore.smallKeys();
            tick(1); // still in the trigger zone → transition starts
            tick(10);
            out.afterW = { room: level.currentRoomId(), baked: level.bakedRooms() };

            // 5) Round-trip: opened door stays open from the vault side
            player.rig.position.set(-57.6, 1.95, -64);
            tick(1);
            tick(10);
            out.roundTrip = { room: level.currentRoomId() };

            s.game.paused = false;
            return out;
        });

        t.ok('dungeon starts in entry', res.boot.room === 'entry', JSON.stringify(res.boot));
        t.ok('only entry baked at start', res.boot.baked.length === 1, res.boot.baked.join(','));
        t.ok('camera bounds set', res.boot.boundsOk);
        t.ok('entry enemy spawned', res.boot.enemies === 1, `e=${res.boot.enemies}`);
        t.ok('spawn in entry room', Math.abs(res.boot.spawn.z - 5) < 1, JSON.stringify(res.boot.spawn));

        t.ok('door trigger starts SLIDING', res.sliding === true);
        t.ok('room transition clears active camera focus', res.focusCleared === true);
        t.ok('transition lands in hall', res.afterN.room === 'hall', res.afterN.room);
        t.ok('hall enemy joined combat list', res.afterN.enemies >= 2, `e=${res.afterN.enemies}`);
        t.ok('camera bounds moved to hall', res.afterN.boundsMinZ < -40, `minZ=${res.afterN.boundsMinZ}`);
        t.ok('player crossed the stride', res.afterN.pz < -40, `z=${res.afterN.pz}`);

        t.ok('locked door bounces without key', res.lockBounce.room === 'hall', res.lockBounce.room);
        t.ok('bounce pushed player off the door', res.lockBounce.px > -9.0, `x=${res.lockBounce.px}`);

        t.ok('small key picked up', res.keysAfterPickup === 1, `keys=${res.keysAfterPickup}`);
        t.ok('key consumed on open', res.keysAfterOpen === 0, `keys=${res.keysAfterOpen}`);
        t.ok('unlocked door leads to vault', res.afterW.room === 'vault', res.afterW.room);
        t.ok('far room disposed (≤2 baked)', res.afterW.baked.length <= 2, res.afterW.baked.join(','));
        t.ok('opened door stays open (round-trip)', res.roundTrip.room === 'hall', res.roundTrip.room);

        // W3: persistence — hard reload; the opened door and spent key survive
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        const persist = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = true;
            s.menu.close();
            s.game.paused = true;
            s.loadLevel('w-test-dungeon');
            await new Promise((r) => setTimeout(r, 150));
            const level = s.game.level;
            const tick = (n) => { for (let i = 0; i < n; i++) level.update(0.05, s.game); };
            const out = { keys: level.keyStore.smallKeys() };
            // Key pickup must NOT respawn: stand on its old spot, tick
            s.player.rig.position.set(4, 1.95, -64);
            level.enterRoom('hall', s.game);
            tick(2);
            out.keysAfterRevisit = level.keyStore.smallKeys();
            // The vault door is still open: walk straight through
            s.player.rig.position.set(-9.4, 1.95, -64);
            tick(1);
            tick(10);
            out.room = level.currentRoomId();
            s.game.paused = false;
            return out;
        });
        t.ok('reload: spent key stays spent', persist.keys === 0, `keys=${persist.keys}`);
        t.ok('reload: taken pickup does not respawn', persist.keysAfterRevisit === 0,
            `keys=${persist.keysAfterRevisit}`);
        t.ok('reload: opened door stays open', persist.room === 'vault', persist.room);

        // ── W4: overworld — screens, edge transitions, dungeon round-trip ──
        const ow = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const out = {};
            s.game.paused = true;
            s.loadLevel('w-test-overworld');
            await new Promise((r) => setTimeout(r, 150));
            let level = s.game.level;
            const tick = (n) => { for (let i = 0; i < n; i++) s.game.level.update(0.05, s.game); };

            out.boot = { screen: level.currentRoomId(), id: level.id };

            // Edge transition E: r0c0 (grid 2,2 → origin 128,128) → r0c1
            s.player.rig.position.set(151.3, 1.95, 128);
            tick(1); tick(10);
            out.east = s.game.level.currentRoomId();

            // South from r0c1 (grid 3,2 → origin 192,128): edge at=4 → r1c1
            s.player.rig.position.set(196, 1.95, 151.3);
            tick(1); tick(10);
            out.south = s.game.level.currentRoomId();

            // West from r1c1 (grid 3,3 → origin 192,192): edge at=-4 → r1c0
            s.player.rig.position.set(168.7, 1.95, 188);
            tick(1); tick(10);
            out.west = s.game.level.currentRoomId();

            // Back N to r0c0, then enter the dungeon arch (E interact)
            s.player.rig.position.set(128, 1.95, 168.7);
            tick(1); tick(10);
            out.backHome = s.game.level.currentRoomId();

            s.player.rig.position.set(120, 1.95, 114); // entrance (-8,-14) local
            s.game.input._interactPressed = true;
            tick(2);
            await new Promise((r) => setTimeout(r, 150));
            out.inDungeon = { id: s.game.level.id, room: s.game.level.currentRoomId?.() };

            // Exit S through the entry's exit door → back to the overworld
            s.player.rig.position.set(0, 1.95, 8.3);
            s.game.level.update(0.05, s.game);
            await new Promise((r) => setTimeout(r, 150));
            const p = s.player.root.position;
            out.backOutside = {
                id: s.game.level.id,
                screen: s.game.level.currentRoomId?.(),
                nearEntrance: Math.hypot(p.x - 120, p.z - 116) < 3,
                pos: [+p.x.toFixed(1), +p.z.toFixed(1)],
            };
            s.game.paused = false;
            return out;
        });

        t.ok('overworld loads at start screen', ow.boot.id === 'w-test-overworld' && ow.boot.screen === 'r0c0',
            JSON.stringify(ow.boot));
        t.ok('edge E → r0c1', ow.east === 'r0c1', ow.east);
        t.ok('edge S → r1c1', ow.south === 'r1c1', ow.south);
        t.ok('edge W → r1c0', ow.west === 'r1c0', ow.west);
        t.ok('edge N → back to r0c0', ow.backHome === 'r0c0', ow.backHome);
        t.ok('E enters the dungeon from the arch', ow.inDungeon.id === 'w-test-dungeon',
            JSON.stringify(ow.inDungeon));
        t.ok('exit door returns to the overworld', ow.backOutside.id === 'w-test-overworld',
            JSON.stringify(ow.backOutside));
        t.ok('exit restores the entrance screen + position',
            ow.backOutside.screen === 'r0c0' && ow.backOutside.nearEntrance,
            JSON.stringify(ow.backOutside));

        // Save/reload mid-overworld restores the screen and position
        await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.paused = true;
            // Walk one screen east so pos ≠ default, then let onRoomEnter save
            s.player.rig.position.set(151.3, 1.95, 128);
            for (let i = 0; i < 12; i++) s.game.level.update(0.05, s.game);
        });
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        const restored = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = true;
            s.menu.close();
            s.game.paused = true;
            s.loadLevel('w-test-overworld');
            await new Promise((r) => setTimeout(r, 150));
            const p = s.player.root.position;
            return {
                screen: s.game.level.currentRoomId(),
                onEastScreen: p.x > 160, // r0c1 spans x ∈ [169, 216]
            };
        });
        t.ok('reload restores overworld screen', restored.screen === 'r0c1', restored.screen);
        t.ok('reload restores position on that screen', restored.onEastScreen);

        // ── W5: mirror travel — monolith swap, divergent layouts, no traps ──
        const mirror = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const out = {};
            const tick = (n) => { for (let i = 0; i < n; i++) s.game.level.update(0.05, s.game); };
            s.game.paused = true;
            // Walk back to r0c0 (monolith screen) via the W edge
            s.player.rig.position.set(168.7, 1.95, 128);
            tick(1); tick(10);
            out.screen = s.game.level.currentRoomId();
            out.moodBefore = s.game.level.mood;
            // Crust-only rock present at local (-13, 1) → world (115, 129)
            out.rockInCrust = s.game.level.getVoxelAt(115, 1.5, 129);
            out.reefInCrust = s.game.level.getVoxelAt(143, 1.5, 119);

            // Swap at the monolith (local 12,12 → world 140,140)
            s.player.rig.position.set(140.8, 1.95, 141.2);
            s.game.input._interactPressed = true;
            tick(1);
            out.swapStarted = s.game.level._swapTimer != null;
            tick(35); // > 1.5 s of def.onUpdate → reload fires
            await new Promise((r) => setTimeout(r, 200));
            out.moodAfter = s.game.level.mood;
            out.rockInAbyss = s.game.level.getVoxelAt(115, 1.5, 129);
            out.reefInAbyss = s.game.level.getVoxelAt(143, 1.5, 119);
            return out;
        });
        t.ok('monolith screen reached', mirror.screen === 'r0c0', mirror.screen);
        t.ok('starts in crust', mirror.moodBefore === 'crust', mirror.moodBefore);
        t.ok('crust rock present in crust', mirror.rockInCrust === true);
        t.ok('abyss reef absent in crust', mirror.reefInCrust === false);
        t.ok('monolith interact starts swap', mirror.swapStarted === true);
        t.ok('swap lands in abyss', mirror.moodAfter === 'abyss', mirror.moodAfter);
        t.ok('crust rock absent in abyss', mirror.rockInAbyss === false);
        t.ok('abyss reef present in abyss', mirror.reefInAbyss === true);

        // Swapping while standing where a wall will appear must not trap
        const trap = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const tick = (n) => { for (let i = 0; i < n; i++) s.game.level.update(0.05, s.game); };
            // Start the swap back to crust from the monolith…
            s.player.rig.position.set(140.8, 1.95, 141.2);
            s.game.input._interactPressed = true;
            tick(1);
            // …then force the saved return-position INTO the crust rock spot
            const raw = JSON.parse(window.localStorage.getItem('vsbeu.progress') || '{}');
            raw.sovereignProgress.overworld.pos = { screen: 'r0c0', x: -13, z: 1 };
            window.localStorage.setItem('vsbeu.progress', JSON.stringify(raw));
            tick(35);
            await new Promise((r) => setTimeout(r, 200));
            const p = s.player.root.position;
            return {
                mood: s.game.level.mood,
                standingInsideWall: s.game.level.getVoxelAt(p.x, 1.5, p.z),
                onFloor: s.game.level.getVoxelAt(p.x, 0.5, p.z),
            };
        });
        t.ok('swap-back lands in crust', trap.mood === 'crust', trap.mood);
        t.ok('trapped spawn nudged to a free cell', trap.standingInsideWall === false);
        t.ok('nudged spot still has floor', trap.onFloor === true);

        // ── W6: Tab map — overworld grid + dungeon room graph ──
        const mapRes = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const out = {};
            const owData = s.game.level.mapData();
            out.ow = {
                kind: owData.kind,
                total: owData.screens.length,
                visited: owData.screens.filter((x) => x.visited).length,
                current: owData.screens.find((x) => x.current)?.id,
                hasEntranceIcon: owData.screens.some((x) => x.entrance),
                hasMonolith: owData.screens.some((x) => x.monolith),
            };
            s.mapScreen.toggle(s.game);
            out.opened = s.mapScreen.isOpen
                && document.getElementById('ss-map').style.display !== 'none';
            s.mapScreen.toggle(s.game);
            out.closed = !s.mapScreen.isOpen;

            s.loadLevel('w-test-dungeon');
            await new Promise((r) => setTimeout(r, 150));
            const dData = s.game.level.mapData();
            out.dungeon = {
                kind: dData.kind,
                rooms: dData.rooms.length,
                visitedRooms: dData.rooms.filter((x) => x.visited).length,
                openedDoor: dData.rooms
                    .find((x) => x.id === 'hall')?.doors
                    .find((d) => d.to === 'vault')?.opened === true,
            };
            // Only the sandbox remains a plain arena (all 14 beats are dungeons)
            s.loadLevel('sandbox-combat');
            await new Promise((r) => setTimeout(r, 100));
            out.arenaHasMap = !!s.game.level.mapData;
            return out;
        });
        t.ok('overworld map data', mapRes.ow.kind === 'overworld' && mapRes.ow.total === 4,
            JSON.stringify(mapRes.ow));
        t.ok('map shows visited screens', mapRes.ow.visited >= 3, `v=${mapRes.ow.visited}`);
        t.ok('map marks current screen', mapRes.ow.current === 'r0c0', mapRes.ow.current);
        t.ok('map has entrance + monolith icons', mapRes.ow.hasEntranceIcon && mapRes.ow.hasMonolith);
        t.ok('map overlay opens', mapRes.opened);
        t.ok('map overlay closes', mapRes.closed);
        t.ok('dungeon map data', mapRes.dungeon.kind === 'dungeon' && mapRes.dungeon.rooms === 4,
            JSON.stringify(mapRes.dungeon));
        t.ok('dungeon map remembers visited rooms', mapRes.dungeon.visitedRooms >= 2,
            `v=${mapRes.dungeon.visitedRooms}`);
        t.ok('dungeon map shows opened door', mapRes.dungeon.openedDoor === true);
        t.ok('arena levels have no map', mapRes.arenaHasMap === false);

        // ── W7: item-gating blockers in the dungeon gauntlet room ──
        const blk = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const out = {};
            s.game.paused = true;
            s.loadLevel('w-test-dungeon');
            await new Promise((r) => setTimeout(r, 150));
            let level = s.game.level;
            const player = s.player;
            const tick = (n) => { for (let i = 0; i < n; i++) s.game.level.update(0.05, s.game); };
            // Full tick including player physics/grapple
            // No camera/renderer: mouse-aim would overwrite the scripted facing
            const tickAll = (n) => {
                for (let i = 0; i < n; i++) {
                    player.update(0.05, s.game.input, s.game.level.enemies,
                        s.game.level.destructibles, null, null);
                    s.game.level.update(0.05, s.game);
                }
            };
            level.enterRoom('gauntlet', s.game);
            const O = { x: -64, z: 0 }; // gauntlet world origin

            // chasm carved: no floor voxel inside, rim intact
            out.chasmCarved = !level.getVoxelAt(O.x, 0.5, O.z - 3)
                && level.getVoxelAt(O.x, 0.5, O.z - 6);

            // 1) no grapple item: falling in = respawn at edge + 1 damage
            player.health.fullRestore();
            player.rig.position.set(O.x, 1.0, O.z - 3); // inside the chasm, sinking
            tick(2);
            const p1 = player.root.position;
            out.fallCaught = Math.hypot(p1.x - O.x, p1.z - (O.z - 6)) < 1 && player.health.hp === 5;

            // aiming at the anchor without the item: toast, no grapple
            player.rig.position.set(O.x, 1.95, O.z - 5.5);
            player.state.setFacing(0, 1); // south, toward the anchor at (0,0)
            s.game.input._grapple = true;
            tick(1);
            out.noItemNoGrapple = !player.grapple.active;

            // 2) with the grapple: pull across
            player.inventory.grantItem('magnetic_grapple');
            s.game.input._grapple = true;
            tick(1);
            out.grappleStarts = player.grapple.active === true;
            tickAll(30);
            out.crossed = player.root.position.z > O.z - 2;

            // 3) boot_ledge: dash into it bootless → blocked by the solid
            player.rig.position.set(O.x, 1.95, O.z + 2.9);
            player.state.setFacing(0, 1);
            player.dashCd = 0;
            player.tryDash();
            tickAll(8);
            out.bootlessBlocked = player.root.position.z < O.z + 4;

            // with the boot: hop over
            player.inventory.grantItem('phase_boot');
            player.rig.position.set(O.x, 1.95, O.z + 2.9);
            player.state.setFacing(0, 1);
            player.dashCd = 0;
            player.tryDash();
            tickAll(10);
            out.bootHopped = player.root.position.z > O.z + 5;

            // 4) wedge_crack (vault): wrong weapon refuses, wedge shatters
            level.enterRoom('vault', s.game);
            const V = { x: -64, z: -64 };
            player.rig.position.set(V.x - 3, 1.95, V.z - 4);
            player.state.setFacing(-1, 0);
            player.inventory.addWeapon('heavy_mallet'); // has shatter, wrong id
            player.inventory.setWeapon('heavy_mallet');
            player.attackCd = 0;
            player.tryAttack([], s.game.level.destructibles);
            out.crackSurvivesMallet = !level.keyStore.isOpen('blocker:td-crack');
            player.inventory.addWeapon('tectonic_wedge');
            player.inventory.setWeapon('tectonic_wedge');
            player.attackCd = 0;
            player.tryAttack([], s.game.level.destructibles);
            out.crackBrokenByWedge = level.keyStore.isOpen('blocker:td-crack');

            // 5) caster_dark: shroud lifts only with the Light Caster equipped
            const shroud = s.scene.children.find((c) => c.isMesh
                && c.geometry?.type === 'PlaneGeometry' && Math.abs(c.position.y - 2.4) < 0.01);
            out.shroudExists = !!shroud;
            player.rig.position.set(V.x + 3, 1.95, V.z + 3);
            tick(10);
            out.shroudDarkWithoutCaster = shroud ? shroud.material.opacity > 0.5 : false;
            player.inventory.addWeapon('light_caster');
            player.inventory.setWeapon('light_caster');
            tick(30);
            out.shroudLiftsWithCaster = shroud ? shroud.material.opacity < 0.25 : false;

            return out;
        });
        t.ok('chasm carved in gauntlet', blk.chasmCarved);
        t.ok('chasm fall → edge respawn + 1 damage', blk.fallCaught);
        t.ok('grapple gated on item', blk.noItemNoGrapple);
        t.ok('grapple starts with item', blk.grappleStarts);
        t.ok('grapple crosses the gap', blk.crossed);
        t.ok('bootless dash blocked by ledge', blk.bootlessBlocked);
        t.ok('phase boot hops the ledge', blk.bootHopped);
        t.ok('mallet cannot break wedge crack', blk.crackSurvivesMallet);
        t.ok('tectonic wedge breaks the crack (persisted)', blk.crackBrokenByWedge);
        t.ok('caster shroud exists', blk.shroudExists);
        t.ok('shroud dark without caster', blk.shroudDarkWithoutCaster);
        t.ok('shroud lifts with light caster', blk.shroudLiftsWithCaster);

        // Overworld placements present (same runtime code; presence check)
        const owBlk = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.loadLevel('w-test-overworld');
            await new Promise((r) => setTimeout(r, 150));
            const level = s.game.level;
            level.enterRoom('r1c1', s.game);
            const O = { x: 192, z: 192 };
            // Anchor posts are visual + grapple targets ONLY (no XZ solid) —
            // making them solids walled off the rim and softlocked return
            // walks after reverse-peg placement (see grapple_gap in
            // blockers.js). Assert both halves of that contract: the post
            // mesh exists, and walking through its cell is NOT blocked.
            const post = s.scene.children.find((c) => c.isMesh
                && Math.abs(c.position.x - (O.x + 15)) < 0.6
                && Math.abs(c.position.z - (O.z - 4)) < 0.6);
            const probe = s.collisionWorld.resolveMove(O.x + 14, O.z - 3.5, O.x + 15.5, O.z - 3.5, 0.4);
            return {
                chasm: !level.getVoxelAt(O.x + 10, 0.5, O.z - 4)
                    && level.getVoxelAt(O.x + 6, 0.5, O.z - 4),
                anchorPostVisible: !!post,
                anchorPostPassable: probe.x >= O.x + 15.2,
                ledge: level.getVoxelAt(O.x - 10, 1.5, O.z + 8),
            };
        });
        t.ok('overworld chasm carved + anchor post visible + passable',
            owBlk.chasm && owBlk.anchorPostVisible && owBlk.anchorPostPassable,
            JSON.stringify(owBlk));
        t.ok('overworld ledge stamped', owBlk.ledge);

        // ── W gate: the Beat 01 vertical slice, full loop ──
        const gate = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const out = {};
            const player = s.player;
            const tick = (n) => { for (let i = 0; i < n; i++) s.game.level.update(0.05, s.game); };
            s.game.paused = true;

            // Real overworld: falls back to scarfield (test-grid pos unknown here)
            s.loadLevel('overworld');
            await new Promise((r) => setTimeout(r, 150));
            out.owScreen = s.game.level.currentRoomId();

            // Enter the Crypt Breach arch (scarfield origin 640,640; entrance 0,-16)
            player.rig.position.set(640, 1.95, 624);
            s.game.input._interactPressed = true;
            tick(2);
            await new Promise((r) => setTimeout(r, 150));
            out.inCrypt = {
                id: s.game.level.id,
                room: s.game.level.currentRoomId?.(),
                baked: s.game.level.bakedRooms?.().length,
                bossAtLoad: !!s.game.level.boss,
                mapRooms: s.game.level.mapData?.().rooms.length,
            };

            // tomb → corridor (open N door)
            player.rig.position.set(0, 1.95, -6.4);
            tick(1); tick(10);
            out.roomA = s.game.level.currentRoomId();

            // locked N door bounces without the key
            player.rig.position.set(0, 1.95, -73.4);
            tick(1);
            out.lockedHeld = s.game.level.currentRoomId() === 'corridor';

            // grab the corridor key (first east gap, south of the locked door), open, pass
            player.rig.position.set(8, 1.95, -60.5);
            tick(1);
            out.gotSmallKey = s.game.level.keyStore.smallKeys() === 1;
            player.rig.position.set(0, 1.95, -73.4);
            tick(2); tick(10);
            out.roomB = s.game.level.currentRoomId();

            // west secret room → boss key
            player.rig.position.set(-8.3, 1.95, -128);
            tick(1); tick(10);
            out.roomSecret = s.game.level.currentRoomId();
            player.rig.position.set(-64, 1.95, -128);
            tick(1);
            out.gotBossKey = s.game.level.keyStore.hasBossKey();

            // back east, north to the antechamber, boss door with the key
            player.rig.position.set(-58.7, 1.95, -128);
            tick(1); tick(10);
            player.rig.position.set(0, 1.95, -136.4);
            tick(1); tick(10);
            out.roomC = s.game.level.currentRoomId();
            player.rig.position.set(0, 1.95, -199.4);
            tick(2); tick(10);
            out.roomBoss = s.game.level.currentRoomId();

            // Kill the Warden through the legitimate path
            const boss = s.game.level.boss;
            boss.hp = 0;
            boss.onDeath?.();
            tick(3);
            out.bossCleared = !!s.game.level._bossCleared;
            out.anchorGranted = player.inventory.weapons.includes('anchor_link')
                && player.inventory.activeWeapon === 'anchor_link';

            // Exit the crypt from the tomb → back on the scarfield at the arch
            s.game.level.enterRoom('tomb', s.game);
            player.rig.position.set(0, 1.95, 7.4);
            tick(1);
            await new Promise((r) => setTimeout(r, 150));
            const p = player.root.position;
            out.backOut = {
                id: s.game.level.id,
                screen: s.game.level.currentRoomId?.(),
                nearArch: Math.hypot(p.x - 640, p.z - 626) < 3,
            };
            s.game.paused = false;
            return out;
        });
        t.ok('gate: real overworld at scarfield', gate.owScreen === 'scarfield', gate.owScreen);
        t.ok('gate: arch enters Beat 01', gate.inCrypt.id === 'beat-01-crypt'
            && gate.inCrypt.room === 'tomb', JSON.stringify(gate.inCrypt));
        t.ok('gate: dungeon prebaked with boss + 6-room map',
            gate.inCrypt.baked === 6 && gate.inCrypt.bossAtLoad && gate.inCrypt.mapRooms === 6,
            JSON.stringify(gate.inCrypt));
        t.ok('gate: tomb → corridor', gate.roomA === 'corridor', gate.roomA);
        t.ok('gate: locked door held without key', gate.lockedHeld);
        t.ok('gate: corridor key found', gate.gotSmallKey);
        t.ok('gate: key opens the way to the predecessor', gate.roomB === 'predecessor', gate.roomB);
        t.ok('gate: secret room reached', gate.roomSecret === 'secret', gate.roomSecret);
        t.ok('gate: boss key found in the secret room', gate.gotBossKey);
        t.ok('gate: antechamber reached', gate.roomC === 'antechamber', gate.roomC);
        t.ok('gate: boss key opens the Warden arena', gate.roomBoss === 'warden', gate.roomBoss);
        t.ok('gate: Warden defeat fires the full path', gate.bossCleared);
        t.ok('gate: Anchor Link salvaged + equipped', gate.anchorGranted);
        t.ok('gate: exit returns to the scarfield arch',
            gate.backOut.id === 'overworld' && gate.backOut.screen === 'scarfield'
            && gate.backOut.nearArch, JSON.stringify(gate.backOut));

        // ── Death respawns in the room you died in, on solid ground ──
        // Regression: respawn used the level's LOAD-TIME spawn, which on the
        // overworld is a different screen. That teleport landed in unbaked
        // void, the player fell past y=-12, was re-killed, and respawned into
        // the void again — an unbreakable fall-forever loop. Reported from a
        // real playthrough ("when I died I kept falling through the map").
        const death = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const p = s.player;
            const out = {};
            const settle = (ms) => new Promise((r) => setTimeout(r, ms));
            s.game.atTitle = false; s.game.paused = false; s.menu.close();

            // Overworld, on a screen far from the load-time spawn
            s.loadLevel('overworld');
            await settle(400);
            const lvl = s.game.level;
            const far = Object.keys(lvl.def.rooms).find((k) => k !== lvl.currentRoomId());
            lvl.enterRoom(far, s.game);
            const r = lvl.cameraBounds;
            p.rig.position.set((r.minX + r.maxX) / 2, 1.95, (r.minZ + r.maxZ) / 2);
            p.physics.resetVelocity(); p.physics.grounded = true;
            await settle(300);
            out.owScreen = lvl.currentRoomId();
            p.health.damage(p.health.max, 0);
            await settle(3000);
            out.owRespawn = {
                screen: lvl.currentRoomId(),
                y: p.root.position.y, dead: p.health.dead,
                onSolid: lvl.getVoxelAt(p.root.position.x, p.root.position.y - 1.0, p.root.position.z),
            };
            await settle(1500);
            out.owStable = { y: p.root.position.y, vy: p.physics.vy, dead: p.health.dead };

            // Dungeon, in a room that is not the start room
            s.loadLevel('beat-01-crypt');
            await settle(400);
            const d = s.game.level;
            d.enterRoom('warden', s.game);
            const wr = d.cameraBounds;
            p.rig.position.set((wr.minX + wr.maxX) / 2, 1.95, (wr.minZ + wr.maxZ) / 2);
            p.physics.resetVelocity(); p.physics.grounded = true;
            await settle(300);
            p.health.damage(p.health.max, 0);
            await settle(3000);
            out.dgRespawn = {
                room: d.currentRoomId(),
                y: p.root.position.y, dead: p.health.dead,
                onSolid: d.getVoxelAt(p.root.position.x, p.root.position.y - 1.0, p.root.position.z),
            };
            return out;
        });
        t.ok('death: overworld respawn stays on the same screen',
            death.owRespawn.screen === death.owScreen,
            `${death.owScreen} → ${death.owRespawn.screen}`);
        t.ok('death: overworld respawn lands on solid ground',
            death.owRespawn.onSolid && !death.owRespawn.dead && death.owRespawn.y > -1,
            JSON.stringify(death.owRespawn));
        t.ok('death: overworld respawn does not fall forever',
            death.owStable.y > -1 && death.owStable.vy > -5,
            JSON.stringify(death.owStable));
        t.ok('death: dungeon respawn stays in the room you died in',
            death.dgRespawn.room === 'warden', JSON.stringify(death.dgRespawn));
        t.ok('death: dungeon respawn lands on solid ground',
            death.dgRespawn.onSolid && !death.dgRespawn.dead && death.dgRespawn.y > -1,
            JSON.stringify(death.dgRespawn));

        t.ok('no fatal pageerrors', errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 5).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
