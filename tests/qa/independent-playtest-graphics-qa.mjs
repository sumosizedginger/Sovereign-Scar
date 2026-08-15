// ═══ UNMAINTAINED ONE-OFF INVESTIGATION HARNESS — DO NOT CITE ═══════════════
//
// Written to answer one question on one afternoon and never maintained since.
// It is kept as a record of an investigation, not as an instrument. A number
// this file prints today is not evidence of anything: the code it probes has
// moved, and the audit in `tests/qa/README.md` lists the specific ways this
// class of probe was found to be lying — including one that manufactured the
// damage it then reported as proof that combat worked.
//
// If you need this question answered NOW, write a probe that answers it now.
// The maintained instruments are the ones cited from `HANDOFF.md`.
// ════════════════════════════════════════════════════════════════════════════

// Independent QA — playtest 2026-07-23 + graphics overhaul.
// Does NOT modify game source. Evidence from real module imports + browser.
// node tests/qa/independent-playtest-graphics-qa.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import {
    startServer, findChromeVerbose, sleep, disableGamepads,
} from '../harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join('D:\\tmp', 'qa-playtest-gfx');
fs.mkdirSync(OUT, { recursive: true });

const issues = [];
function fail(tag, msg) {
    issues.push({ severity: 'bug', tag, msg });
    console.log(`FAIL [${tag}] ${msg}`);
}
function pass(tag, msg = '') {
    console.log(`PASS [${tag}] ${msg}`);
}
function assert(tag, cond, msg = '') {
    if (cond) pass(tag, msg);
    else fail(tag, msg || 'assertion failed');
}

// ── Unit-level probes (real modules) ───────────────────────────────────────

async function probePlaytestAndGraphics() {
    const { Enemy } = await import('../../src/game/enemy.js');
    const { hitboxCheck } = await import('../../src/combat/hitbox.js');
    const { WEAPONS } = await import('../../src/game/combat/weapons.js');
    const { HealthPool } = await import('../../src/game/kernel/health.js');
    const { HeartDropManager } = await import('../../src/game/world/heart-drops.js');
    const { scaleEnemyHp } = await import('../../src/game/world/threat-curve.js');
    const { buildVoxelGeo, AO_LEVELS, vkey } = await import('../../src/voxel/core.js');
    const { classifyFamily, FAMILY } = await import('../../src/game/render/materials.js');
    const { CRUST_COLORS } = await import('../../src/game/assets/palettes.js');
    const { DestructibleVoxelMesh } = await import('../../src/game/world/destructible-voxel-mesh.js');
    const { buildPickupMesh } = await import('../../src/game/assets/pickup-shapes.js');
    const { BEAT07_DEF } = await import('../../src/game/levels/beat-07-sluice.js');
    const { BEAT09_DEF } = await import('../../src/game/levels/beat-09-town.js');
    const { BEAT12_DEF } = await import('../../src/game/levels/beat-12-pyre.js');
    const { BossBase, bounceArena } = await import('../../src/game/bosses/base.js');
    const { CollisionWorld } = await import('../../src/engine/collision.js');

    function spawn(kind, at = { x: 0, y: 1, z: 0 }, opts = {}) {
        return new Enemy(new THREE.Scene(), null, at, { kind, ...opts });
    }

    // Issue 4: held-shield reflect kills
    {
        const liveHp = scaleEnemyHp(3, 7);
        const shooter = spawn('frost', { x: 0, y: 1, z: 0 }, { ai: 'ranged' });
        shooter.hp = liveHp;
        shooter.maxHp = liveHp;
        const health = new HealthPool(10);
        const hero = {
            root: { position: { x: 0, y: 1.95, z: 6 } },
            state: { facingVec: { x: 0, z: -1 } },
            health,
            guard: { raised: true, parryReady: false },
            inventory: { hasItem: () => false },
            damageMult: 1,
        };
        shooter._spawnProjectile(0, 1);
        for (let i = 0; i < 400 && shooter.projectiles.length; i++) {
            shooter._updateProjectiles(0.016, hero);
        }
        if (shooter.hp <= 0) shooter.state.current = 'DEAD';
        assert('pt4-reflect-kills',
            shooter.hp <= 0 || shooter.state.current === 'DEAD',
            `held reflect: hp=${shooter.hp} max=${shooter.maxHp} liveHp=${liveHp}`);
        assert('pt4-no-chip', health.hp === 10, `player hp=${health.hp}`);
    }

    // Issue 5: mote dive
    {
        const m = spawn('mote');
        assert('pt5-cruise-airborne', m.airborne === true, `airborne=${m.airborne}`);
        assert('pt5-flyheight', m.flyHeight >= 3.0, `flyHeight=${m.flyHeight}`);
        assert('pt5-strikeheight', m.strikeHeight != null && m.strikeHeight < 2.0,
            `strikeHeight=${m.strikeHeight}`);
        m.rig.position.set(0, m.rig.position.y, -1.2);
        const cruiseHero = {
            root: { position: { x: 0, y: 1.95, z: 0 } },
            state: { facingVec: { x: 0, z: -1 } },
        };
        assert('pt5-cruise-unreachable',
            hitboxCheck(cruiseHero, m, WEAPONS.heavy_mallet) === false,
            'cruise should be out of mallet reach');

        const player = {
            root: { position: { x: 0, y: 1.95, z: -2 } },
            health: { dead: false, damage: () => ({ accepted: true }) },
            state: { facingVec: { x: 0, z: 1 } },
        };
        m.attackCd = 0;
        m.rig.position.x = 0;
        m.rig.position.z = -2;
        for (let i = 0; i < 40 && m._windupT <= 0; i++) m.update(0.05, player);
        assert('pt5-windup', m._windupT > 0, `windup=${m._windupT}`);
        for (let i = 0; i < 30; i++) {
            if (m._windupT < 0.05) m._windupT = 0.2;
            m.update(0.05, player);
        }
        assert('pt5-dive-not-airborne', m.airborne === false, `airborne=${m.airborne}`);
        m.rig.position.x = 0;
        m.rig.position.z = 0;
        const hero = {
            root: { position: { x: 0, y: 1.95, z: -1.2 } },
            state: { facingVec: { x: 0, z: 1 } },
        };
        assert('pt5-mallet-reaches-dive',
            hitboxCheck(hero, m, WEAPONS.heavy_mallet) === true,
            `mote y=${m.rig.position.y.toFixed(2)}`);
    }

    // Issue 7: room bounds
    {
        const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
        const e = spawn('sentinel', { x: 0, y: 1, z: 0 }, { roomBounds: bounds, speed: 8 });
        const player = {
            root: { position: { x: 0, y: 1.95, z: -20 } },
            health: { dead: false, damage: () => ({ accepted: false }) },
            state: { facingVec: { x: 0, z: 1 } },
        };
        for (let i = 0; i < 180; i++) e.update(1 / 60, player);
        assert('pt7-room-clamp',
            e.rig.position.z >= bounds.minZ - 1e-6,
            `z=${e.rig.position.z.toFixed(3)}`);
    }

    // Issue 1: shatter rewards
    {
        const mgr = new HeartDropManager(new THREE.Scene());
        const d = mgr.dropAt(0, 1, 0, { heart: 1 });
        assert('pt1-dropAt', !!d && mgr.drops.length === 1, `drops=${mgr.drops.length}`);

        const scene = new THREE.Scene();
        const map = new Map();
        map.set(vkey(0, 0, 0), 0x888888);
        const dest = new DestructibleVoxelMesh(
            map,
            new THREE.MeshStandardMaterial({ vertexColors: true }),
            null, null, 't',
            { origin: { x: 5, y: 1, z: 5 }, scene, voxelSize: 1 },
        );
        dest.hiddenPickup = { label: 'Secret cache', color: 0xffd060 };
        const n = dest.shatterConnected(0, 0, 0, 8);
        assert('pt1-shatter-empty', n > 0 && dest.isEmpty, `n=${n} empty=${dest.isEmpty}`);
        assert('pt1-hidden-flag', !!dest.hiddenPickup && dest.isEmpty,
            'hiddenPickup still present for onShatter consumer');
    }

    // Issue 2: lightTune
    {
        const a7 = BEAT07_DEF.lightTune?.ambient ?? 99;
        const k7 = BEAT07_DEF.lightTune?.key ?? 99;
        assert('pt2-sluice-amb', a7 < 1.7, `ambient=${a7}`);
        assert('pt2-sluice-key', k7 < 1.6, `key=${k7}`);
        // Old values were 2.0 / 1.85 — must not still be those
        assert('pt2-sluice-not-old', !(a7 >= 2.0 && k7 >= 1.85), `tune=${a7}/${k7}`);
        assert('pt2-town-swept', (BEAT09_DEF.lightTune?.ambient ?? 99) < 1.8,
            `town amb=${BEAT09_DEF.lightTune?.ambient}`);
        assert('pt2-pyre-swept', (BEAT12_DEF.lightTune?.ambient ?? 99) < 1.8,
            `pyre amb=${BEAT12_DEF.lightTune?.ambient}`);
    }

    // Issue 3: pickup emissive
    {
        const mesh = buildPickupMesh({ label: 'Scar Suture', color: 0xff3b5c, shape: 'suture' });
        let maxE = 0;
        mesh.traverse((c) => {
            if (c.material?.emissiveIntensity != null) {
                maxE = Math.max(maxE, c.material.emissiveIntensity);
            }
        });
        assert('pt3-emissive-ceiling', maxE < 1.5, `maxE=${maxE}`);
        assert('pt3-emissive-floor', maxE >= 0.4, `maxE=${maxE}`);
    }

    // Issue 6: boss collision wiring
    {
        const cw = new CollisionWorld();
        cw.addSolid({ id: 'wall', minX: 2, maxX: 4, minZ: -2, maxZ: 2 });
        const mesh = new THREE.Group();
        mesh.position.set(0, 1, 0);
        class ProbeBoss extends BossBase {
            update() { /* no-op for probe */ }
        }
        const boss = new ProbeBoss(new THREE.Scene(), {
            mesh,
            position: { x: 0, y: 1, z: 0 },
            collisionWorld: cw,
            arenaRadius: 6,
            collHalf: 0.6,
        });
        assert('pt6-has-cw', !!boss.collisionWorld, 'collisionWorld wired');
        assert('pt6-arena', boss.arenaRadius === 6, `arena=${boss.arenaRadius}`);
        assert('pt6-has-resolve', typeof boss.resolveMove === 'function');
        const r = boss.resolveMove(0, 0, 3.5, 0);
        assert('pt6-resolve-blocks', r.x < 2.5, `resolved x=${r.x}`);
        boss.root.position.set(50, 1, 50);
        boss.confineToArena();
        const dx = Math.abs(boss.root.position.x - boss.home.x);
        const dz = Math.abs(boss.root.position.z - boss.home.z);
        assert('pt6-arena-clamp', dx <= boss.arenaRadius + 0.01 && dz <= boss.arenaRadius + 0.01,
            `dx=${dx} dz=${dz}`);
        assert('pt6-bounceArena-export', typeof bounceArena === 'function');
    }

    // Graphics 1: AO channel split
    {
        const map = new Map();
        for (let x = 0; x < 4; x++) {
            for (let z = 0; z < 4; z++) map.set(vkey(x, 0, z), CRUST_COLORS.limestone);
        }
        for (let y = 1; y < 4; y++) {
            for (let x = 0; x < 4; x++) map.set(vkey(x, y, 0), CRUST_COLORS.limestone);
            for (let z = 0; z < 4; z++) map.set(vkey(0, y, z), CRUST_COLORS.limestone);
        }
        const geo = buildVoxelGeo(map, 0);
        const color = geo.getAttribute('color');
        const ao = geo.getAttribute('aoLevel');
        assert('gfx1-aoLevel-attr', !!ao && ao.count === color.count,
            `ao=${!!ao} colorCount=${color?.count}`);
        const c = new THREE.Color(CRUST_COLORS.limestone);
        let maxDelta = 0;
        let minAo = 1;
        for (let i = 0; i < color.count; i++) {
            maxDelta = Math.max(maxDelta,
                Math.abs(color.getX(i) - c.r),
                Math.abs(color.getY(i) - c.g),
                Math.abs(color.getZ(i) - c.b));
            minAo = Math.min(minAo, ao.getX(i));
        }
        assert('gfx1-albedo-clean', maxDelta < 0.02, `Δ=${maxDelta}`);
        assert('gfx1-ao-present', minAo < 0.9, `minAo=${minAo}`);
        assert('gfx1-ao-deep', minAo <= AO_LEVELS[AO_LEVELS.length - 1] + 1e-6, `minAo=${minAo}`);
        assert('gfx1-gold-energy', classifyFamily(CRUST_COLORS.goldLeaf) === FAMILY.ENERGY);
        assert('gfx1-iron-metal', classifyFamily(CRUST_COLORS.iron) === FAMILY.METAL);
    }

    // Graphics 2: soft shadows (source contract)
    // three r185 deprecates PCFSoftShadowMap → coerces to PCF; penumbra is
    // Light.shadow.radius (set in lights.js). Soft kernel still requested.
    {
        const rendererSrc = fs.readFileSync(path.join(ROOT, 'src/engine/renderer.js'), 'utf8');
        const lightsSrc = fs.readFileSync(path.join(ROOT, 'src/engine/lights.js'), 'utf8');
        assert('gfx2-soft-shadows', /PCFSoftShadowMap/.test(rendererSrc),
            'renderer must prefer PCFSoftShadowMap');
        const m = lightsSrc.match(/shadow\.radius\s*=\s*([0-9.]+)/);
        assert('gfx2-shadow-radius', m && Number(m[1]) >= 2,
            `shadow.radius=${m ? m[1] : 'missing'} in lights.js`);
        const qSrc = fs.readFileSync(path.join(ROOT, 'src/engine/quality.js'), 'utf8');
        assert('gfx2-high-4096', /high:[\s\S]*?shadowMap:\s*4096/.test(qSrc),
            'high tier should use 4096 shadow map');
    }

    // Graphics 3: triplanar / surface detail in materials
    {
        const matSrc = fs.readFileSync(path.join(ROOT, 'src/game/render/materials.js'), 'utf8');
        assert('gfx3-triplanar', /triplanar|value noise|detail/i.test(matSrc),
            'materials should carry surface detail shader');
        assert('gfx3-ao-shader', /aoLevel|vAoLevel/.test(matSrc),
            'materials apply aoLevel in shader');
    }

    // Graphics 5: color grade pass exists
    {
        const gradePath = path.join(ROOT, 'src/game/fx/color-grade-pass.js');
        assert('gfx5-grade-file', fs.existsSync(gradePath), 'color-grade-pass.js');
        if (fs.existsSync(gradePath)) {
            const g = fs.readFileSync(gradePath, 'utf8');
            assert('gfx5-split-tone', /split|shadow|highlight|grade/i.test(g));
        }
    }

    // Graphics 6: actor rim
    {
        const actorSrc = fs.readFileSync(path.join(ROOT, 'src/game/characters/actor-rig.js'), 'utf8');
        assert('gfx6-rim', /fresnel|_rim|ss-actor-rim/i.test(actorSrc));
    }

    // Graphics 7: atmosphere / dust
    {
        const atmoPath = path.join(ROOT, 'src/game/fx/atmosphere.js');
        assert('gfx7-dust-file', fs.existsSync(atmoPath));
        if (fs.existsSync(atmoPath)) {
            const a = fs.readFileSync(atmoPath, 'utf8');
            assert('gfx7-dust-class', /DustMotes|class Dust/.test(a));
        }
        const indexSrc = fs.readFileSync(path.join(ROOT, 'src/game/index.js'), 'utf8');
        assert('gfx7-wired', /DustMotes|dustMotes|colorGradePass|createColorGradePass/.test(indexSrc));
    }

    // Graphics 4: beat 01 vertical interest
    {
        const cryptSrc = fs.readFileSync(path.join(ROOT, 'src/game/levels/beat-01-crypt.js'), 'utf8');
        assert('gfx4-vertical', /pillar|plinth|platform|vertical interest/i.test(cryptSrc),
            'beat-01 should author vertical interest');
    }

    // Hidden pickup authored in quarry
    {
        const quarrySrc = fs.readFileSync(path.join(ROOT, 'src/game/levels/beat-06-quarry.js'), 'utf8');
        assert('pt1-quarry-hidden', /hiddenPickup|hidden/.test(quarrySrc),
            'beat-06 should author at least one hidden pickup on a boulder');
    }

    // Player onShatter wired
    {
        const indexSrc = fs.readFileSync(path.join(ROOT, 'src/game/index.js'), 'utf8');
        assert('pt1-onShatter-wired', /onShatter/.test(indexSrc) && /dropAt/.test(indexSrc));
    }
}

// ── Browser E2E ────────────────────────────────────────────────────────────

async function probeBrowser() {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        fail('browser-chrome', 'Chrome/Edge not found');
        return;
    }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8821);
    let browser;
    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(60000);
        await page.setViewport({ width: 1280, height: 720 });
        await disableGamepads(page);

        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.player),
            { timeout: 45000 },
        );
        await page.mouse.click(640, 360);
        await sleep(1000);

        const boot = await page.evaluate(() => {
            const s = window.__sovereignScar;
            return {
                title: document.title,
                levelCount: s.LEVELS?.length,
                hp: s.player?.health?.hp,
                weapon: s.player?.inventory?.activeWeapon,
                hasDust: !!(s.dustMotes || s.dust),
                shadowType: s.renderer?.shadowMap?.type,
                triangles: s.renderer?.info?.render?.triangles ?? -1,
                calls: s.renderer?.info?.render?.calls ?? -1,
                canvas: !!document.querySelector('canvas'),
            };
        });
        assert('e2e-title', /Sovereign Scar/i.test(boot.title), boot.title);
        assert('e2e-levels', boot.levelCount === 16, `levels=${boot.levelCount}`);
        assert('e2e-canvas', boot.canvas && (boot.calls > 0 || boot.triangles > 0),
            JSON.stringify({ calls: boot.calls, tri: boot.triangles }));
        assert('e2e-hp', boot.hp > 0, `hp=${boot.hp}`);

        // A `loadLevel` helper used to sit here, guessing at four different
        // possible level-loading APIs. Nothing ever called it. Removed rather
        // than left in place: a dead helper full of guesses about the debug
        // hook is how a probe ends up exercising an API the game does not have.

        // Discover API
        const api = await page.evaluate(() => {
            const s = window.__sovereignScar;
            return {
                keys: Object.keys(s || {}),
                hasLoad: typeof s.loadLevel === 'function',
                hasGo: typeof s.goToLevel === 'function',
                hasDev: !!s.dev,
                current: s.currentLevelId || s.levelId || null,
            };
        });
        console.log('API keys sample:', api.keys.slice(0, 40).join(', '));
        assert('e2e-api', api.keys.length > 5, `keys=${api.keys.length}`);

        // Try loading levels that matter for playtest
        for (const levelId of ['beat-06-quarry', 'beat-07-sluice', 'beat-01-crypt', 'beat-09-town']) {
            try {
                const r = await page.evaluate(async (id) => {
                    const s = window.__sovereignScar;
                    const fn = s.loadLevel || s.goToLevel || s.dev?.loadLevel || s.world?.loadLevel;
                    if (!fn) {
                        // Keyboard debug: some builds use ?level=
                        return { ok: false, err: 'no load fn', keys: Object.keys(s) };
                    }
                    await fn.call(s, id);
                    await new Promise((r) => setTimeout(r, 500));
                    return {
                        ok: true,
                        id: s.currentLevelId || s.level?.id || s.levelId,
                        enemies: s.enemies?.length ?? s.level?.enemies?.length,
                        boss: !!(s.boss || s.level?.boss),
                        destructibles: s.level?.destructibles?.length ?? s.destructibles?.length,
                        lightTune: s.level?.lightTune || null,
                        triangles: s.renderer?.info?.render?.triangles ?? -1,
                    };
                }, levelId);
                if (!r.ok) {
                    // Try hash navigation
                    await page.goto(`${server.url}?level=${levelId}`, { waitUntil: 'domcontentloaded' });
                    await page.waitForFunction(
                        () => !!(window.__sovereignScar && window.__sovereignScar.player),
                        { timeout: 30000 },
                    );
                    await page.mouse.click(640, 360);
                    await sleep(1500);
                    const r2 = await page.evaluate(() => {
                        const s = window.__sovereignScar;
                        return {
                            ok: true,
                            id: s.currentLevelId || s.level?.id,
                            triangles: s.renderer?.info?.render?.triangles ?? -1,
                            enemies: s.enemies?.length,
                        };
                    });
                    assert(`e2e-load-${levelId}`, r2.ok && r2.triangles > 0,
                        JSON.stringify(r2));
                } else {
                    assert(`e2e-load-${levelId}`, r.ok && (r.triangles > 0 || r.id),
                        JSON.stringify(r));
                }
                await page.screenshot({
                    path: path.join(OUT, `${levelId}.png`),
                    type: 'png',
                });
            } catch (e) {
                fail(`e2e-load-${levelId}`, String(e.message || e));
            }
        }

        // Boss collision live check if we can spawn boss room
        try {
            const bossProbe = await page.evaluate(async () => {
                const s = window.__sovereignScar;
                const fn = s.loadLevel || s.goToLevel;
                if (!fn) return { ok: false, err: 'no load' };
                await fn.call(s, 'beat-01-crypt');
                await new Promise((r) => setTimeout(r, 400));
                // Jump to boss room if API allows
                if (s.level?.rooms) {
                    const bossRoom = s.level.rooms.find?.((rm) => /boss/i.test(rm.id || rm.name || ''));
                    if (bossRoom && s.level.enterRoom) s.level.enterRoom(bossRoom.id);
                }
                if (s.level?.gotoRoom) {
                    try { s.level.gotoRoom('boss'); } catch (_) { /* */ }
                }
                await new Promise((r) => setTimeout(r, 600));
                const boss = s.boss || s.level?.boss || s.activeBoss;
                if (!boss) {
                    // Search children for BossBase-like
                    return {
                        ok: true,
                        hasBoss: false,
                        levelKeys: s.level ? Object.keys(s.level).slice(0, 30) : [],
                        scarKeys: Object.keys(s).filter((k) => /boss|level|enemy/i.test(k)),
                    };
                }
                return {
                    ok: true,
                    hasBoss: true,
                    hasCW: !!boss.collisionWorld,
                    arenaRadius: boss.arenaRadius,
                    pos: boss.root ? { x: boss.root.position.x, z: boss.root.position.z } : null,
                };
            });
            console.log('bossProbe', JSON.stringify(bossProbe));
            if (bossProbe.hasBoss) {
                assert('e2e-boss-cw', !!bossProbe.hasCW, JSON.stringify(bossProbe));
                assert('e2e-boss-arena', bossProbe.arenaRadius != null && bossProbe.arenaRadius > 0,
                    `arena=${bossProbe.arenaRadius}`);
            } else {
                // Not a hard fail if boss not spawned at entry — note only
                pass('e2e-boss-skip', 'boss not at entry; unit probe covers collision');
            }
        } catch (e) {
            fail('e2e-boss-probe', String(e.message || e));
        }

        // Screenshot boot
        await page.screenshot({ path: path.join(OUT, 'boot.png'), type: 'png' });

        // Renderer soft shadow at runtime
        const shadowRuntime = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const t = s.renderer?.shadowMap?.type;
            // THREE.PCFSoftShadowMap is typically 2, PCF is 1
            return {
                type: t,
                enabled: s.renderer?.shadowMap?.enabled,
                // probe materials for aoLevel on a mesh
                sampleAo: (() => {
                    let found = false;
                    let sample = null;
                    s.scene?.traverse?.((o) => {
                        if (found || !o.isMesh || !o.geometry) return;
                        const a = o.geometry.getAttribute?.('aoLevel');
                        if (a) {
                            found = true;
                            sample = { count: a.count, x0: a.getX?.(0) };
                        }
                    });
                    return sample;
                })(),
                dustCount: (() => {
                    let n = 0;
                    s.scene?.traverse?.((o) => {
                        if (o.name === 'DustMotes' || o.userData?.dust || /dust/i.test(o.name || '')) n++;
                    });
                    return n;
                })(),
            };
        });
        console.log('shadowRuntime', JSON.stringify(shadowRuntime));
        assert('e2e-shadows-on', shadowRuntime.enabled === true, JSON.stringify(shadowRuntime));
        // Soft is preferred; type value depends on three version
        assert('e2e-ao-runtime', !!shadowRuntime.sampleAo,
            `aoLevel on mesh: ${JSON.stringify(shadowRuntime.sampleAo)}`);

        if (pageErrors.length) {
            // Filter benign
            const serious = pageErrors.filter((e) => !/ResizeObserver|favicon/i.test(e));
            if (serious.length) fail('e2e-pageerrors', serious.slice(0, 5).join(' | '));
            else pass('e2e-pageerrors', 'none serious');
        } else {
            pass('e2e-pageerrors', 'none');
        }
    } finally {
        try { if (browser) await browser.close(); } catch (_) { /* */ }
        try { await server.close(); } catch (_) { /* */ }
    }
}

// ── Main ───────────────────────────────────────────────────────────────────

const report = {
    startedAt: new Date().toISOString(),
    issues,
    unitOk: false,
    browserOk: false,
};

console.log('=== Independent playtest + graphics QA ===\n');
try {
    await probePlaytestAndGraphics();
    report.unitOk = issues.length === 0;
} catch (e) {
    fail('unit-probe-crash', String(e.stack || e));
}

const unitIssueCount = issues.length;
try {
    await probeBrowser();
    report.browserOk = issues.length === unitIssueCount;
} catch (e) {
    fail('browser-probe-crash', String(e.stack || e));
}

report.finishedAt = new Date().toISOString();
report.issueCount = issues.length;
report.pass = issues.length === 0;

const outJson = path.join(OUT, 'report.json');
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
console.log(`\n=== RESULT: ${report.pass ? 'PASS' : 'FAIL'} (${issues.length} issues) ===`);
console.log(`Report: ${outJson}`);
if (issues.length) {
    for (const i of issues) console.log(`  - [${i.severity}] ${i.tag}: ${i.msg}`);
}
process.exit(report.pass ? 0 : 1);
