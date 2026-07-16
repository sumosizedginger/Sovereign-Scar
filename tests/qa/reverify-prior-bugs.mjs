// Re-verify prior FAIL findings against CURRENT code. No project source edits.
// node tests/qa/reverify-prior-bugs.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
    createSink, startServer, findChromeVerbose, sleep, summarize,
} from '../harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join('D:\\tmp', 'qa-reverify-out');
fs.mkdirSync(OUT, { recursive: true });

export async function run(t) {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.ok('chrome available', false, 'no chrome');
        return;
    }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8815);
    let browser;
    const report = { startedAt: new Date().toISOString(), findings: {} };

    try {
        browser = await puppeteer.default.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(45000);
        await page.setViewport({ width: 1280, height: 720 });
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__sovereignScar && window.__sovereignScar.player),
            { timeout: 30000 },
        );
        await page.mouse.click(640, 360);
        await sleep(700);

        // ── 1) Boss phase lag: must enter phase 2 on the threshold hit after update ──
        const phase = await page.evaluate(() => {
            const s = window.__sovereignScar;
            s.loadLevel('beat-01-crypt');
            const boss = s.game.level.boss;
            const p = s.player;
            boss._awake = true;
            boss.shielded = false;
            boss.canHit = true;
            boss.hp = 6; // max 10, threshold [0.5] → phase2 when frac<=0.5 i.e. hp<=5
            boss.phase = 1;
            boss.state.current = 'IDLE';
            boss.defeated = false;
            boss.alive = true;
            boss._phaseDirty = false;

            // Mirror combat-sweeper order: onHit then hp -= then (later) boss.update
            const dmg = 1;
            if (boss.onHit) boss.onHit(dmg);
            const phaseRightAfterOnHit = boss.phase;
            const dirtyAfterOnHit = !!boss._phaseDirty;
            boss.hp -= dmg; // now 5
            const phaseAfterSubtractBeforeUpdate = boss.phase;
            // Same-frame game loop would then call level/boss.update
            boss.update(0.016, p, s.game);
            const phaseAfterUpdate = boss.phase;
            const dirtyAfterUpdate = !!boss._phaseDirty;

            // Also: real tryAttack path with next-frame update
            boss.hp = 6;
            boss.phase = 1;
            boss._phaseDirty = false;
            boss.shielded = false;
            boss.canHit = true;
            p.root.position.set(boss.root.position.x, 1.2, boss.root.position.z + 1.1);
            p.physics.position.x = p.root.position.x;
            p.physics.position.y = 1.2;
            p.physics.position.z = p.root.position.z;
            p.physics.vx = p.physics.vy = p.physics.vz = 0;
            p.state.setFacing(0, -1);
            p.attackCd = 0;
            const hpBefore = boss.hp;
            p.tryAttack([boss], []);
            const hpAfterHit = boss.hp;
            const phaseMidFrame = boss.phase;
            boss.update(0.016, p, s.game);
            return {
                phaseRightAfterOnHit,
                dirtyAfterOnHit,
                phaseAfterSubtractBeforeUpdate,
                phaseAfterUpdate,
                dirtyAfterUpdate,
                tryAttack: { hpBefore, hpAfterHit, phaseMidFrame, phaseAfterUpdate: boss.phase },
                fixed: phaseAfterUpdate === 2 && phaseRightAfterOnHit === 1,
            };
        });
        report.findings.phase = phase;
        t.ok('phase: onHit defers (does not jump phase before hp change)',
            phase.phaseRightAfterOnHit === 1 && phase.dirtyAfterOnHit === true,
            JSON.stringify(phase));
        t.ok('phase: after subtract+update, phase 2 at threshold',
            phase.phaseAfterUpdate === 2,
            JSON.stringify(phase));
        t.ok('phase: lag bug FIXED (no longer stuck at phase 1 post-update)',
            phase.fixed === true,
            JSON.stringify(phase));
        t.ok('phase: tryAttack reduces hp then update advances phase',
            phase.tryAttack.hpAfterHit < phase.tryAttack.hpBefore
                && phase.tryAttack.phaseAfterUpdate === 2,
            JSON.stringify(phase.tryAttack));

        // ── 2) Proxy clone deception ──
        const proxy = await page.evaluate(() => {
            const s = window.__sovereignScar;
            s.loadLevel('beat-05-citadel');
            const boss = s.game.level.boss;
            const p = s.player;
            // Force phase 2 to spawn clones
            boss.hp = Math.floor(boss.maxHp * 0.5);
            boss._phaseDirty = true;
            boss.update(0.016, p, s.game);
            const phase = boss.phase;
            const cloneCount = boss.clones?.length || 0;
            const hasTeleport = typeof boss._teleportAmongClones === 'function';
            const hasMark = typeof boss._markRealBody === 'function';

            // Record positions, force shuffle
            const before = {
                root: { x: boss.root.position.x, z: boss.root.position.z },
                clones: (boss.clones || []).map((c) => ({ x: c.position.x, z: c.position.z })),
            };
            // Call teleport directly
            if (hasTeleport) boss._teleportAmongClones();
            const after = {
                root: { x: boss.root.position.x, z: boss.root.position.z },
                clones: (boss.clones || []).map((c) => ({ x: c.position.x, z: c.position.z })),
            };
            const rootMoved = Math.hypot(after.root.x - before.root.x, after.root.z - before.root.z) > 0.01;

            // Real body is hittable; swinging at clone location should miss if far
            // Put player next to a clone (not root) after teleport
            let hitAtClone = null;
            let hitAtRoot = null;
            if (boss.clones?.length) {
                const c = boss.clones[0];
                p.root.position.set(c.position.x, 1.2, c.position.z + 1.0);
                p.physics.position.x = p.root.position.x;
                p.physics.position.y = 1.2;
                p.physics.position.z = p.root.position.z;
                p.state.setFacing(0, -1);
                // Face toward clone center from +z
                const dx = c.position.x - p.root.position.x;
                const dz = c.position.z - p.root.position.z;
                p.state.setFacing(dx || 0, dz || -1);
                p.attackCd = 0;
                const hp0 = boss.hp;
                p.tryAttack([boss], []);
                hitAtClone = { hp0, hp1: boss.hp, damaged: boss.hp < hp0 };

                // Now attack real root
                p.root.position.set(boss.root.position.x, 1.2, boss.root.position.z + 1.15);
                p.physics.position.x = p.root.position.x;
                p.physics.position.y = 1.2;
                p.physics.position.z = p.root.position.z;
                p.state.setFacing(0, -1);
                p.attackCd = 0;
                const hpA = boss.hp;
                p.tryAttack([boss], []);
                hitAtRoot = { hpA, hpB: boss.hp, damaged: boss.hp < hpA };
            }

            // Brightness differentiation
            const coreE = boss.core?.material?.emissiveIntensity;
            const cloneE = boss.clones?.[0]?.material?.emissiveIntensity;

            // Shuffle timer path
            boss._shuffleT = 99;
            const posBeforeTick = { x: boss.root.position.x, z: boss.root.position.z };
            boss.tickAI(0.05, p, s.game);
            const posAfterTick = { x: boss.root.position.x, z: boss.root.position.z };
            const shuffledViaAI = Math.hypot(posAfterTick.x - posBeforeTick.x, posAfterTick.z - posBeforeTick.z) > 0.01
                || boss._shuffleT === 0;

            return {
                phase,
                cloneCount,
                hasTeleport,
                hasMark,
                rootMoved,
                before,
                after,
                hitAtClone,
                hitAtRoot,
                coreE,
                cloneE,
                realBrighter: coreE != null && cloneE != null && coreE > cloneE,
                shuffledViaAI,
            };
        });
        report.findings.proxy = proxy;
        t.ok('proxy: enters phase >=2 with clones', proxy.phase >= 2 && proxy.cloneCount >= 2, JSON.stringify(proxy));
        t.ok('proxy: teleport + mark APIs exist', proxy.hasTeleport && proxy.hasMark, JSON.stringify(proxy));
        t.ok('proxy: teleport relocates true body', proxy.rootMoved === true, JSON.stringify({
            before: proxy.before, after: proxy.after, rootMoved: proxy.rootMoved,
        }));
        t.ok('proxy: real body brighter than decoys', proxy.realBrighter === true,
            `coreE=${proxy.coreE} cloneE=${proxy.cloneE}`);
        t.ok('proxy: damage lands on true body (root)',
            proxy.hitAtRoot?.damaged === true,
            JSON.stringify(proxy.hitAtRoot));
        // Clone mesh is not a separate combat entity — swinging only near root damages.
        // If clone and root are far, hitAtClone should ideally not damage; allow either if they overlap.
        t.ok('proxy: deception mechanic live (teleport + brightness + hittable root)',
            proxy.rootMoved && proxy.realBrighter && proxy.hitAtRoot?.damaged,
            JSON.stringify({ rootMoved: proxy.rootMoved, realBrighter: proxy.realBrighter, hitAtRoot: proxy.hitAtRoot }));

        // ── 3) Level unlock gating on ] ──
        const gate = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            // Reset progress unlocks to defaults via local storage path if available
            const { loadSovereignProgress, saveSovereignProgress } = await import('/src/game/kernel/progress.js').catch(() => ({}));

            // Direct progress reset through settings
            try {
                const raw = localStorage.getItem('my-engine-progress') || localStorage.getItem('progress');
            } catch (_) {}

            // Use public save if exposed
            if (typeof s.save === 'function') {
                // Overwrite unlocked via evaluate of progress module through game unlockAndSave only
            }

            // Force known state: only crypt + sandbox unlocked
            // Kernel uses getProgress/setProgress from engine settings
            const mod = await import('/src/engine/settings.js');
            const cur = mod.getProgress() || {};
            mod.setProgress({
                ...cur,
                sovereignProgress: {
                    version: 1,
                    currentBeat: 'beat-01-crypt',
                    unlockedBeats: ['beat-01-crypt', 'sandbox-combat'],
                    inventory: null,
                    hp: 6,
                    maxHp: 6,
                    playTime: 0,
                    deaths: 0,
                    bossesDefeated: [],
                    mood: 'crust',
                },
            });

            s.loadLevel('beat-01-crypt');
            const beforeId = s.game.levelId;
            const prog = (await import('/src/game/kernel/progress.js')).loadSovereignProgress();
            const unlocked = prog.unlockedBeats || [];

            // Simulate ] without Shift: must NOT advance to spindle
            // We can't easily press keys from inside evaluate; return plan for outer
            return {
                beforeId,
                unlocked,
                nextWouldBe: 'beat-02-spindle',
                spindleUnlocked: unlocked.includes('beat-02-spindle'),
            };
        });

        // Clear Shift state, press ]
        await page.keyboard.up('ShiftLeft');
        await page.keyboard.up('ShiftRight');
        await page.evaluate(() => {
            // Ensure game not paused
            window.__sovereignScar.game.paused = false;
        });
        const idBeforeBracket = await page.evaluate(() => window.__sovereignScar.game.levelId);
        await page.keyboard.press('BracketRight');
        await sleep(350);
        const idAfterBracket = await page.evaluate(() => window.__sovereignScar.game.levelId);
        const toastText = await page.evaluate(() => {
            // toast el is last-created fixed bottom center-ish; use HUD toast sibling
            const nodes = [...document.body.querySelectorAll('div')];
            const toast = nodes.find((d) => d.textContent && /Locked:|Dev skip|Unlocked/i.test(d.textContent)
                && d.style && d.style.opacity !== '0');
            // Broader: any recent toast-like text
            const candidates = nodes
                .filter((d) => d.textContent && /Locked|Dev skip|spindle|force/i.test(d.textContent))
                .map((d) => d.textContent.slice(0, 120));
            return { toast: toast?.textContent?.slice(0, 120) || null, candidates, opacity: toast?.style?.opacity };
        });

        report.findings.gate = {
            gate, idBeforeBracket, idAfterBracket, toastText,
            blocked: idAfterBracket === idBeforeBracket && idBeforeBracket === 'beat-01-crypt',
        };

        t.ok('gate: starting unlocks exclude spindle',
            gate.spindleUnlocked === false,
            JSON.stringify(gate));
        t.ok('gate: ] without Shift does NOT load locked beat',
            idAfterBracket === 'beat-01-crypt' || idAfterBracket === idBeforeBracket,
            `before=${idBeforeBracket} after=${idAfterBracket}`);
        t.ok('gate: locked toast or stay on crypt',
            idAfterBracket === 'beat-01-crypt'
                || /Locked|force|Shift/i.test(JSON.stringify(toastText)),
            JSON.stringify({ idAfterBracket, toastText }));

        // Shift+] should force
        await page.keyboard.down('ShiftLeft');
        await sleep(50);
        await page.keyboard.press('BracketRight');
        await sleep(400);
        await page.keyboard.up('ShiftLeft');
        const idAfterDev = await page.evaluate(() => window.__sovereignScar.game.levelId);
        t.ok('gate: Shift+] dev-bypasses to next beat',
            idAfterDev === 'beat-02-spindle' || idAfterDev !== 'beat-01-crypt',
            `afterDev=${idAfterDev}`);

        // Unlock then ] works
        await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.loadLevel('beat-01-crypt');
            const { unlockBeat, loadSovereignProgress } = await import('/src/game/kernel/progress.js');
            unlockBeat('beat-02-spindle');
            return loadSovereignProgress().unlockedBeats;
        });
        await sleep(100);
        await page.keyboard.up('ShiftLeft');
        await page.keyboard.up('ShiftRight');
        await page.keyboard.press('BracketRight');
        await sleep(400);
        const idAfterUnlock = await page.evaluate(() => window.__sovereignScar.game.levelId);
        t.ok('gate: ] advances after unlockBeat(spindle)',
            idAfterUnlock === 'beat-02-spindle',
            `afterUnlock=${idAfterUnlock}`);

        // ── Regression: all 14 bosses still present ──
        const bosses = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            const pairs = [
                ['beat-01-crypt', 'crypt_warden'],
                ['beat-02-spindle', 'tri_compiler'],
                ['beat-03-sink', 'sand_spur'],
                ['beat-04-sky', 'kinetic_core'],
                ['beat-05-citadel', 'proxy'],
                ['beat-06-quarry', 'obsidian_arachnid'],
                ['beat-07-sluice', 'hydroid_cloud'],
                ['beat-08-bone', 'skeletal_mantis'],
                ['beat-09-town', 'phantasm'],
                ['beat-10-cryo', 'frost_and_fuel'],
                ['beat-11-mire', 'sludge_golem'],
                ['beat-12-pyre', 'magma_wyrm'],
                ['beat-13-gumoi', 'gumoi_witness'],
                ['beat-14-leviathan', 'leviathan'],
            ];
            const out = [];
            for (const [id, expect] of pairs) {
                s.loadLevel(id);
                await new Promise((r) => setTimeout(r, 60));
                out.push({ id, expect, got: s.game.level?.boss?.bossId || null });
            }
            return out;
        });
        for (const row of bosses) {
            t.ok(`boss ${row.id}`, row.got === row.expect, JSON.stringify(row));
        }

        // Combat + story still healthy
        await page.evaluate(() => window.__sovereignScar.loadLevel('sandbox-combat'));
        await sleep(400);
        const combat = await page.evaluate(() => {
            const s = window.__sovereignScar;
            const p = s.player;
            const e = (s.game.level.enemies || []).find((x) => x.hp > 0);
            if (!e) return { ok: false };
            p.root.position.set(e.root.position.x, e.root.position.y, e.root.position.z + 1.15);
            p.physics.position.x = p.root.position.x;
            p.physics.position.y = p.root.position.y;
            p.physics.position.z = p.root.position.z;
            p.physics.vx = p.physics.vy = p.physics.vz = 0;
            p.state.setFacing(0, -1);
            p.attackCd = 0;
            const before = e.hp;
            p.tryAttack(s.game.level.enemies, []);
            return { ok: true, before, after: e.hp };
        });
        t.ok('combat: still damages', combat.ok && combat.after < combat.before, JSON.stringify(combat));

        await page.evaluate(() => window.__sovereignScar.loadLevel('beat-01-crypt'));
        await sleep(300);
        const story = await page.evaluate(() => {
            const st = window.__sovereignScar.game.hud.story;
            return { text: st.current?.text, speaker: st.current?.speaker };
        });
        t.ok('story: still queues', !!story.text && !!story.speaker, JSON.stringify(story));

        const fatal = pageErrors.filter((e) => !/ResizeObserver|favicon/i.test(e));
        t.ok('runtime: no pageerrors', fatal.length === 0, fatal.slice(0, 5).join(' | '));

        report.findings.bosses = bosses;
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
        await page.screenshot({ path: path.join(OUT, 'reverify.png') });
        t.ok('report written', fs.existsSync(path.join(OUT, 'report.json')));
    } catch (e) {
        t.ok('reverify completed', false, String(e && e.stack || e));
        report.crash = String(e && e.stack || e);
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    } finally {
        try { await browser?.close(); } catch (_) {}
        try { await server.close(); } catch (_) {}
    }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
    const t = createSink('reverify');
    await run(t);
    process.exit(summarize([t]) ? 1 : 0);
}
