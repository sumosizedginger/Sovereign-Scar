// Independent QA: verify player/enemy limbs ANIMATE via the Ticket F actor
// rigs (this script originally documented the opposite — the "sliding
// statues" diagnosis). Samples the live program via puppeteer.
// Usage: node tests/qa/anim-statue-verify.mjs
//
// Pass condition now: named pivot groups (armL/armR/legL/legR/torso/body)
// change local rotation during locomotion and attack, while the root still
// translates/yaws (hitbox transform stays physics-owned).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out', 'anim-statue-verify.json');

const chrome = findChromeVerbose();
if (!chrome.path) {
    console.error('FAIL: no Chrome/Edge found');
    process.exit(2);
}

const puppeteer = await import('puppeteer-core');
const server = await startServer(8781);
let browser;
const report = {
    timestamp: new Date().toISOString(),
    diagnosis: null,
    player: {},
    enemy: {},
    passChecks: [],
    failChecks: [],
};

// Serialized into the page for both player and enemy sampling.
const SNAP_FN = `(rig) => {
    const pivots = {};
    rig.traverse((c) => {
        if (c.isGroup && ['body','torso','head','armL','armR','legL','legR'].includes(c.name)) {
            pivots[c.name] = {
                rx: +c.rotation.x.toFixed(5),
                ry: +c.rotation.y.toFixed(5),
                rz: +c.rotation.z.toFixed(5),
                py: +c.position.y.toFixed(5),
            };
        }
    });
    return {
        rootYaw: +rig.rotation.y.toFixed(5),
        rootX: +rig.position.x.toFixed(4),
        rootZ: +rig.position.z.toFixed(4),
        pivotCount: Object.keys(pivots).length,
        pivots,
    };
}`;

function pivotDelta(a, b, names) {
    let d = 0;
    for (const n of names) {
        const p = a.pivots[n], q = b.pivots[n];
        if (!p || !q) continue;
        d = Math.max(d, Math.abs(p.rx - q.rx), Math.abs(p.ry - q.ry), Math.abs(p.rz - q.rz));
    }
    return d;
}

try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    const page = await browser.newPage();
    await disableGamepads(page);
    page.setDefaultTimeout(25000);

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
        () => !!(window.__sovereignScar && window.__sovereignScar.player),
        { timeout: 25000 }
    );
    await sleep(500);
    await page.mouse.click(400, 300);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sleep(800);

    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.game.atTitle = false;
        s.game.paused = false;
        s.menu.close();
        s.loadLevel('sandbox-combat');
        s.game.bossIntro = null;
    });
    await sleep(1200);

    const playerBefore = await page.evaluate(
        `(() => { const snap = ${SNAP_FN}; const p = window.__sovereignScar.player;
           const r = snap(p.rig); r.hasAnimator = !!p.animator; return r; })()`);

    // Hold move ~1s, sampling mid-stride maxima.
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    const moveSamples = [];
    for (let i = 0; i < 6; i++) {
        await sleep(160);
        moveSamples.push(await page.evaluate(
            `(() => (${SNAP_FN})(window.__sovereignScar.player.rig))()`));
    }
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');

    let legSwing = 0, armSwing = 0;
    for (const s of moveSamples) {
        legSwing = Math.max(legSwing, pivotDelta(playerBefore, s, ['legL', 'legR']));
        armSwing = Math.max(armSwing, pivotDelta(playerBefore, s, ['armL', 'armR']));
    }
    const last = moveSamples[moveSamples.length - 1];
    const rootMoved = playerBefore.rootX !== last.rootX
        || playerBefore.rootZ !== last.rootZ
        || playerBefore.rootYaw !== last.rootYaw;

    // Attack: armR must commit to a swing within the strike window.
    const attackSwing = await page.evaluate(
        `(async () => {
            const snap = ${SNAP_FN};
            const s = window.__sovereignScar;
            const p = s.player;
            const before = snap(p.rig);
            p.attackCd = 0;
            p.tryAttack(s.game.level?.enemies || [], s.game.level?.destructibles || []);
            let max = 0;
            for (let i = 0; i < 8; i++) {
                await new Promise((r) => setTimeout(r, 50));
                const now = snap(p.rig);
                const d = Math.abs(now.pivots.armR.rx - before.pivots.armR.rx);
                if (d > max) max = d;
            }
            return max;
        })()`);

    report.player = {
        before: playerBefore, legSwing, armSwing, attackSwing, rootMoved,
    };

    // Enemy: windup must raise the striking arm while feet freeze.
    const enemy = await page.evaluate(
        `(() => {
            const snap = ${SNAP_FN};
            const s = window.__sovereignScar;
            const enemies = s.game.level?.enemies || [];
            const e = enemies.find((x) => x && x.kind && x.state?.current !== 'DEAD');
            if (!e) return { error: 'no rig enemies in sandbox' };
            const before = snap(e.rig);
            e._beginWindup(() => {}, { windup: 0.6, radius: 1.5 });
            let raise = 0;
            for (let i = 0; i < 12; i++) {
                e.update(0.05, s.player);
                const now = snap(e.rig);
                raise = Math.max(raise, Math.abs(now.pivots.armR.rx - before.pivots.armR.rx));
            }
            for (let i = 0; i < 20; i++) e.update(0.05, s.player);
            const settled = snap(e.rig);
            return { kind: e.kind, windupRaise: raise, before, settled };
        })()`);
    report.enemy = enemy;

    const checks = [
        ['player has an animator', playerBefore.hasAnimator === true],
        ['player rig exposes all seven named pivots', playerBefore.pivotCount === 7],
        ['legs swing while moving (> 0.15 rad peak)', legSwing > 0.15],
        ['arms swing while moving (> 0.08 rad peak)', armSwing > 0.08],
        ['root still translates/yaws (hitbox transform physics-owned)', rootMoved],
        ['attack drives a readable arm swing (> 0.5 rad)', attackSwing > 0.5],
    ];
    if (!enemy.error) {
        checks.push(['enemy windup raises the striking arm (> 0.5 rad)', enemy.windupRaise > 0.5]);
    } else {
        checks.push([`enemy sample: ${enemy.error}`, false]);
    }

    for (const [name, ok] of checks) {
        (ok ? report.passChecks : report.failChecks).push(name);
    }
    report.diagnosis = report.failChecks.length === 0
        ? 'ANIMATED: limbs pose from gameplay clocks; statues resolved'
        : 'STATUE RISK: one or more animation checks failed';

    console.log(JSON.stringify({ ...report, player: { ...report.player, before: undefined } }, null, 2));
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log('\nWrote', OUT);
    console.log('PASS checks:', report.passChecks.length, 'FAIL checks:', report.failChecks.length);
    console.log('DIAGNOSIS:', report.diagnosis);
    process.exitCode = report.failChecks.length ? 1 : 0;
} catch (e) {
    console.error('ERROR', e);
    report.error = String(e);
    try {
        fs.mkdirSync(path.dirname(OUT), { recursive: true });
        fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    } catch (_) {}
    process.exitCode = 2;
} finally {
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
}
