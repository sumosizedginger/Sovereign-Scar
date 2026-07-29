// Deep runtime probes: boss collision live, onShatter, luminance, dust, grade.
// node tests/qa/independent-runtime-deep.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    startServer, findChromeVerbose, sleep, disableGamepads,
} from '../harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join('D:\\tmp', 'qa-playtest-gfx');
fs.mkdirSync(OUT, { recursive: true });

const issues = [];
function assert(tag, cond, msg = '') {
    if (cond) console.log(`PASS [${tag}] ${msg}`);
    else {
        issues.push({ tag, msg });
        console.log(`FAIL [${tag}] ${msg}`);
    }
}

const chrome = findChromeVerbose();
if (!chrome.path) {
    console.error('no chrome');
    process.exit(2);
}
const puppeteer = await import('puppeteer-core');
const server = await startServer(8822);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage();
    await disableGamepads(page);
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 1280, height: 720 });

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
        () => !!(window.__sovereignScar && window.__sovereignScar.player),
        { timeout: 45000 },
    );
    await page.mouse.click(640, 360);
    await sleep(1200);

    // ── Shadow radius at runtime ──────────────────────────────────────────
    const lights = await page.evaluate(() => {
        const s = window.__sovereignScar;
        let radius = null;
        let mapSize = null;
        s.scene?.traverse?.(() => {});
        const mood = s.mood;
        const sun = mood?._lights?.keySun || mood?.lights?.keySun;
        // Also search scene for DirectionalLight
        const found = [];
        s.scene?.traverse?.((o) => {
            if (o.isDirectionalLight && o.shadow) {
                found.push({
                    radius: o.shadow.radius,
                    mapSize: o.shadow.mapSize?.width,
                    cast: o.castShadow,
                });
            }
        });
        return {
            sun: sun ? { radius: sun.shadow?.radius, mapW: sun.shadow?.mapSize?.width } : null,
            found,
            shadowType: s.renderer?.shadowMap?.type,
            quality: s.applyQualitySetting ? 'has-api' : null,
        };
    });
    console.log('lights', JSON.stringify(lights));
    const anyRadius = (lights.found || []).some((f) => f.radius >= 2)
        || (lights.sun && lights.sun.radius >= 2);
    assert('rt-shadow-radius', anyRadius, JSON.stringify(lights));

    // ── Color grade pass present in composer ──────────────────────────────
    const grade = await page.evaluate(() => {
        const s = window.__sovereignScar;
        const passes = s.composer?.passes?.map((p) => p.constructor?.name || p.name || '?') || [];
        return { passes, n: passes.length };
    });
    console.log('composer passes', grade.passes.join(' > '));
    assert('rt-grade-pass',
        grade.passes.some((p) => /ShaderPass|ColorGrade|grade/i.test(p)) || grade.n >= 4,
        `passes=${grade.passes.join(',')}`);

    // ── Dust motes in scene ───────────────────────────────────────────────
    const dust = await page.evaluate(() => {
        const s = window.__sovereignScar;
        let points = 0;
        let named = 0;
        s.scene?.traverse?.((o) => {
            if (o.isPoints) points++;
            if (/dust|mote|atmos/i.test(o.name || '')) named++;
            if (o.userData?.kind === 'dust') named++;
        });
        return { points, named };
    });
    assert('rt-dust', dust.points > 0 || dust.named > 0, JSON.stringify(dust));

    // ── Load quarry, shatter path, boss room via level internals ──────────
    const quarry = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.loadLevel('beat-06-quarry');
        await new Promise((r) => setTimeout(r, 800));
        const g = s.game;
        const level = g?.level || g?.currentLevel || null;
        const out = {
            levelId: g?.levelId,
            keys: level ? Object.keys(level).slice(0, 40) : [],
            gameKeys: Object.keys(g || {}).filter((k) => /level|boss|enemy|destruct|room|pickup|heart/i.test(k)),
            destructibles: null,
            enemies: null,
            hasOnShatter: typeof s.player?.onShatter === 'function',
            heartDrops: s.heartDrops ? Object.getOwnPropertyNames(Object.getPrototypeOf(s.heartDrops)) : [],
        };
        // Discover enemies / bosses on game
        out.enemyCount = g?.enemies?.length ?? g?._enemies?.length ?? null;
        out.destructibleCount = g?.destructibles?.length ?? level?.destructibles?.length ?? null;
        if (typeof s.heartDrops?.dropAt === 'function') {
            const before = s.heartDrops.drops?.length ?? 0;
            s.heartDrops.dropAt(0, 2, 0, { heart: 1 });
            out.dropAtWorks = (s.heartDrops.drops?.length ?? 0) > before;
        }
        return out;
    });
    console.log('quarry', JSON.stringify(quarry, null, 2));
    assert('rt-quarry-load', quarry.levelId === 'beat-06-quarry', `id=${quarry.levelId}`);
    assert('rt-onShatter-fn', quarry.hasOnShatter === true);
    assert('rt-dropAt-live', quarry.dropAtWorks === true, JSON.stringify(quarry.heartDrops));

    // ── Force boss attach via loadLevel + room navigation ─────────────────
    const bossLive = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.loadLevel('beat-01-crypt');
        await new Promise((r) => setTimeout(r, 600));
        const g = s.game;
        // Try every plausible way to reach the boss
        const attempts = [];
        if (g?.level?.rooms) {
            attempts.push({ rooms: Object.keys(g.level.rooms) });
        }
        if (typeof g?.enterRoom === 'function') {
            try { g.enterRoom('boss'); attempts.push({ enterRoom: 'boss' }); } catch (e) {
                attempts.push({ enterRoomErr: String(e.message || e) });
            }
        }
        if (typeof g?.level?.goTo === 'function') {
            try { g.level.goTo('boss'); attempts.push({ goTo: 'boss' }); } catch (e) {
                attempts.push({ goToErr: String(e.message || e) });
            }
        }
        // Scan for boss-like objects on game
        const bossCandidates = [];
        for (const k of Object.keys(g || {})) {
            const v = g[k];
            if (v && typeof v === 'object' && (v.arenaRadius != null || v.confineToArena || v.resolveMove)) {
                bossCandidates.push({
                    key: k,
                    hasCW: !!v.collisionWorld,
                    arena: v.arenaRadius,
                    hasResolve: typeof v.resolveMove === 'function',
                    hasConfine: typeof v.confineToArena === 'function',
                });
            }
        }
        if (Array.isArray(g?.enemies)) {
            for (let i = 0; i < g.enemies.length; i++) {
                const e = g.enemies[i];
                if (e?.arenaRadius != null || e?.maxHp > 20) {
                    bossCandidates.push({
                        key: `enemies[${i}]`,
                        hasCW: !!e.collisionWorld,
                        arena: e.arenaRadius,
                        kind: e.kind || e.id,
                        hasResolve: typeof e.resolveMove === 'function',
                    });
                }
            }
        }
        // Attach path: call attachBoss is not public; inspect after teleporting player
        // near a boss door and simulating clear. Instead read compiled level meta.
        return {
            levelId: g?.levelId,
            attempts,
            bossCandidates,
            gameKeys: Object.keys(g || {}).slice(0, 50),
        };
    });
    console.log('bossLive', JSON.stringify(bossLive, null, 2));

    // ── Import attachBoss path offline still valid; spawn boss via API if any
    // Probe: use dev tools if present
    const devBoss = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        const dev = s.dev;
        if (!dev) return { hasDev: false };
        const keys = Object.keys(dev);
        // Common pattern: spawnBoss / setRoom / teleport
        let spawned = null;
        if (typeof dev.spawnBoss === 'function') {
            try {
                spawned = dev.spawnBoss('crypt_warden') || true;
            } catch (e) {
                spawned = String(e.message || e);
            }
        }
        if (typeof dev.gotoRoom === 'function') {
            try { dev.gotoRoom('boss'); } catch (_) { /* */ }
        }
        await new Promise((r) => setTimeout(r, 400));
        // Re-scan
        const g = s.game;
        const found = [];
        const scan = (obj, path) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.arenaRadius != null && obj.resolveMove) {
                found.push({
                    path,
                    hasCW: !!obj.collisionWorld,
                    arena: obj.arenaRadius,
                    pos: obj.root?.position
                        ? { x: obj.root.position.x, z: obj.root.position.z }
                        : null,
                });
            }
        };
        scan(g?.boss, 'game.boss');
        scan(g?.activeBoss, 'game.activeBoss');
        if (Array.isArray(g?.enemies)) g.enemies.forEach((e, i) => scan(e, `enemies[${i}]`));
        return { hasDev: true, devKeys: keys, spawned, found };
    });
    console.log('devBoss', JSON.stringify(devBoss, null, 2));

    // If we found a boss, assert collision
    const allBosses = [
        ...(bossLive.bossCandidates || []),
        ...(devBoss.found || []).map((f) => ({
            key: f.path,
            hasCW: f.hasCW,
            arena: f.arena,
            hasResolve: true,
        })),
    ];
    if (allBosses.length) {
        for (const b of allBosses) {
            assert(`rt-boss-cw-${b.key}`, !!b.hasCW, JSON.stringify(b));
            assert(`rt-boss-arena-${b.key}`, b.arena > 0, JSON.stringify(b));
        }
    } else {
        // Fall back: prove attachBoss source wires CW by evaluating in page
        // with the real modules already loaded via the game.
        const attachProbe = await page.evaluate(async () => {
            // Dynamic import from same origin
            const base = window.location.origin;
            try {
                const { BossBase, attachBoss } = await import(base + '/src/game/bosses/base.js');
                const { CollisionWorld } = await import(base + '/src/engine/collision.js');
                const THREE = await import(base + '/lib/three/three.module.min.js').catch(() => null)
                    || await import(base + '/node_modules/three/build/three.module.js');
                const cw = new CollisionWorld();
                cw.addSolid({ id: 'w', minX: 2, maxX: 4, minZ: -2, maxZ: 2 });
                const mesh = new THREE.Group();
                mesh.position.set(0, 1, 0);
                class B extends BossBase {
                    update() {}
                }
                const scene = new THREE.Scene();
                const boss = new B(scene, {
                    mesh,
                    position: { x: 0, y: 1, z: 0 },
                    // NO collisionWorld in ctor — attachBoss must supply it
                });
                const fakeLevel = {
                    collisionWorld: cw,
                    halfSize: 10,
                    scene,
                };
                attachBoss(boss, fakeLevel, {});
                const r = boss.resolveMove(0, 0, 3.5, 0);
                boss.root.position.set(40, 1, 0);
                boss.confineToArena();
                return {
                    ok: true,
                    hasCW: !!boss.collisionWorld,
                    arena: boss.arenaRadius,
                    resolvedX: r.x,
                    confinedX: boss.root.position.x,
                };
            } catch (e) {
                return { ok: false, err: String(e.stack || e) };
            }
        });
        console.log('attachProbe', JSON.stringify(attachProbe, null, 2));
        assert('rt-attachBoss-cw', attachProbe.ok && attachProbe.hasCW,
            JSON.stringify(attachProbe));
        assert('rt-attachBoss-arena', attachProbe.ok && attachProbe.arena >= 3,
            `arena=${attachProbe.arena}`);
        assert('rt-attachBoss-resolve', attachProbe.ok && attachProbe.resolvedX < 2.5,
            `x=${attachProbe.resolvedX}`);
        assert('rt-attachBoss-confine', attachProbe.ok && Math.abs(attachProbe.confinedX) <= attachProbe.arena + 0.01,
            `x=${attachProbe.confinedX}`);
    }

    // ── Luminance sample for sluice / town / pyre ─────────────────────────
    async function lumFor(levelId) {
        return page.evaluate(async (id) => {
            const s = window.__sovereignScar;
            s.loadLevel(id);
            await new Promise((r) => setTimeout(r, 900));
            // sampleLuminanceStats if available
            if (typeof s.sampleLuminanceStats === 'function') {
                return { id, ...(await s.sampleLuminanceStats()) };
            }
            if (typeof s.measure === 'function') {
                return { id, measure: await s.measure() };
            }
            // Manual canvas sample
            const canvas = document.querySelector('canvas');
            if (!canvas) return { id, err: 'no canvas' };
            // Can't read WebGL easily — use __ssLumRequest path
            if (typeof s.sampleLuminance === 'function') {
                return { id, ...(await s.sampleLuminance()) };
            }
            return { id, err: 'no lum API', keys: Object.keys(s).filter((k) => /lum|meas/i.test(k)) };
        }, levelId);
    }

    for (const id of ['beat-07-sluice', 'beat-09-town', 'beat-12-pyre', 'beat-01-crypt']) {
        const lum = await lumFor(id);
        console.log('lum', JSON.stringify(lum));
        // Frame mean should not be near-white blowout (>120 would be extreme)
        if (lum.mean != null) {
            assert(`rt-lum-mean-${id}`, lum.mean >= 20 && lum.mean <= 120,
                `mean=${lum.mean}`);
            // Shoulder fraction if present
            if (lum.shoulder != null || lum.clipFrac != null || lum.p99 != null) {
                const clip = lum.shoulder ?? lum.clipFrac ?? null;
                if (clip != null) {
                    assert(`rt-lum-clip-${id}`, clip < 0.25, `clip=${clip}`);
                }
            }
        } else if (lum.err) {
            assert(`rt-lum-api-${id}`, false, JSON.stringify(lum));
        }
        await page.screenshot({ path: path.join(OUT, `deep-${id}.png`), type: 'png' });
    }

    // ── Mote dive live in sandbox if possible ─────────────────────────────
    const moteLive = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        // import Enemy and run in-page
        try {
            const base = window.location.origin;
            const { Enemy } = await import(base + '/src/game/enemy.js');
            const { hitboxCheck } = await import(base + '/src/combat/hitbox.js');
            const { WEAPONS } = await import(base + '/src/game/combat/weapons.js');
            const THREE = (await import(base + '/node_modules/three/build/three.module.js'));
            const scene = new THREE.Scene();
            const m = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'mote' });
            const cruiseY = m.rig.position.y;
            const player = {
                root: { position: { x: 0, y: 1.95, z: -2 } },
                health: { dead: false, damage: () => ({ accepted: true }) },
                state: { facingVec: { x: 0, z: 1 } },
            };
            m.attackCd = 0;
            m.rig.position.set(0, m.rig.position.y, -2);
            for (let i = 0; i < 40 && m._windupT <= 0; i++) m.update(0.05, player);
            for (let i = 0; i < 30; i++) {
                if (m._windupT < 0.05) m._windupT = 0.2;
                m.update(0.05, player);
            }
            m.rig.position.x = 0;
            m.rig.position.z = 0;
            const hero = {
                root: { position: { x: 0, y: 1.95, z: -1.2 } },
                state: { facingVec: { x: 0, z: 1 } },
            };
            return {
                ok: true,
                cruiseY,
                diveY: m.rig.position.y,
                airborne: m.airborne,
                hit: hitboxCheck(hero, m, WEAPONS.heavy_mallet),
            };
        } catch (e) {
            return { ok: false, err: String(e.stack || e) };
        }
    });
    console.log('moteLive', JSON.stringify(moteLive));
    assert('rt-mote-dive', moteLive.ok && moteLive.hit === true,
        JSON.stringify(moteLive));
    assert('rt-mote-lower', moteLive.ok && moteLive.diveY < moteLive.cruiseY - 0.5,
        `cruise=${moteLive.cruiseY} dive=${moteLive.diveY}`);

    // ── Reflect kill live ─────────────────────────────────────────────────
    const reflectLive = await page.evaluate(async () => {
        try {
            const base = window.location.origin;
            const { Enemy } = await import(base + '/src/game/enemy.js');
            const { HealthPool } = await import(base + '/src/game/kernel/health.js');
            const { scaleEnemyHp } = await import(base + '/src/game/world/threat-curve.js');
            const THREE = await import(base + '/node_modules/three/build/three.module.js');
            const liveHp = scaleEnemyHp(3, 7);
            const shooter = new Enemy(new THREE.Scene(), null, { x: 0, y: 1, z: 0 }, {
                kind: 'frost', ai: 'ranged',
            });
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
            return { ok: true, hp: shooter.hp, max: shooter.maxHp, playerHp: health.hp };
        } catch (e) {
            return { ok: false, err: String(e.stack || e) };
        }
    });
    console.log('reflectLive', JSON.stringify(reflectLive));
    assert('rt-reflect-kill', reflectLive.ok && reflectLive.hp <= 0, JSON.stringify(reflectLive));
    assert('rt-reflect-safe', reflectLive.ok && reflectLive.playerHp === 10, JSON.stringify(reflectLive));

    // ── AO on live geometry after level load ──────────────────────────────
    const aoLive = await page.evaluate(() => {
        const s = window.__sovereignScar;
        let meshes = 0, withAo = 0, minAo = 1, maxAo = 0, colorMatches = true;
        s.scene?.traverse?.((o) => {
            if (!o.isMesh || !o.geometry) return;
            meshes++;
            const ao = o.geometry.getAttribute('aoLevel');
            if (!ao) return;
            withAo++;
            for (let i = 0; i < Math.min(ao.count, 200); i++) {
                const v = ao.getX(i);
                minAo = Math.min(minAo, v);
                maxAo = Math.max(maxAo, v);
            }
        });
        return { meshes, withAo, minAo, maxAo };
    });
    console.log('aoLive', JSON.stringify(aoLive));
    assert('rt-ao-meshes', aoLive.withAo > 0, JSON.stringify(aoLive));
    assert('rt-ao-variation', aoLive.minAo < 0.95, `minAo=${aoLive.minAo}`);

} finally {
    try { if (browser) await browser.close(); } catch (_) { /* */ }
    try { await server.close(); } catch (_) { /* */ }
}

const report = {
    finishedAt: new Date().toISOString(),
    issues,
    pass: issues.length === 0,
};
fs.writeFileSync(path.join(OUT, 'deep-report.json'), JSON.stringify(report, null, 2));
console.log(`\n=== DEEP RESULT: ${report.pass ? 'PASS' : 'FAIL'} (${issues.length} issues) ===`);
process.exit(report.pass ? 0 : 1);
