// Browser E2E: you must be able to hit a boss from OUTSIDE its own body.
//
// The owner, on the Obsidian Arachnid: "I was literally standing inside the
// model... You have to stand inside of the body to hit it." That sentence had
// been reported once before and 'fixed' once before — the boss used to be
// flatly `shielded` in phase 1, so the only frames that damaged it were its own
// leap, and the leap lands it on top of you. Directional armour replaced the
// shield and the sentence came back anyway, for a completely different reason:
//
//   `presenceScale` grows the mesh and `hitRadius` together, which looks safe.
//   It is not, when the base radius was chosen against the boss's CORE and the
//   silhouette is mostly limbs. Measured from the root, the Arachnid's visible
//   edge reached 3.79 at the front quarter while damage stopped registering at
//   4.10 — a 0.31-unit band in which the player is outside the model and can
//   still land a blow. The natural melee standoff, the one that works on every
//   0.49-radius mob in the game, is about two units. Two units is deep inside
//   the legs.
//
// Both bosses that failed were the two scaled hardest last session (1.70 and
// 1.85), which is the tell: this is a property of the RELATIONSHIP between art
// and hitbox, and nothing that looks at either one alone can see it. So this
// spec measures the relationship, for every boss, in the running game.
//
// It is deliberately not an assertion about `hitRadius`. A future artist may
// make a boss wider, thinner, or spikier; what has to stay true is that there
// is somewhere to stand.

import { startServer, findChromeVerbose, disableGamepads, sleep } from './harness.mjs';

const BEATS = [
    'beat-01-crypt', 'beat-02-spindle', 'beat-03-sink', 'beat-04-sky',
    'beat-05-citadel', 'beat-06-quarry', 'beat-07-sluice', 'beat-08-bone',
    'beat-09-town', 'beat-10-cryo', 'beat-11-mire', 'beat-12-pyre',
    'beat-13-gumoi', 'beat-14-leviathan',
];

/**
 * Bosses this floor-level geometric probe cannot measure, with the reason and
 * the spec that covers them instead. Exemptions are named, never silent.
 */
const EXEMPT = {
    // The Witness fights from ~7 units up; a probe standing on the floor is
    // rejected by the vertical gate in hitboxCheck no matter how close it gets,
    // which is the boss's whole identity rather than a defect. That it can
    // still be finished with a sword is asserted by boss-quality-e2e's
    // "falls to melee from floor level", which fights it live and lets it
    // descend.
    'beat-13-gumoi': 'hovers out of the vertical gate — see boss-quality-e2e',
};

/** Below this, the player has nowhere to stand that is not inside the boss. */
const MIN_BAND = 0.6;
/** The campaign should be comfortably clear of the floor, not sitting on it. */
const MIN_MEDIAN_BAND = 1.0;

export async function run(t) {
    let puppeteer;
    try {
        puppeteer = (await import('puppeteer-core')).default;
    } catch (e) {
        t.ok('puppeteer-core', false, String(e));
        return;
    }
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.skip('Chrome not found');
        return;
    }

    const server = await startServer(8808);
    let browser;
    const errors = [];
    try {
        browser = await puppeteer.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(300000);
        page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(500);

        const rows = await page.evaluate(async (BEATS) => {
            const THREE = await import('three');
            const s = window.__sovereignScar;
            s.game.atTitle = false; s.game.paused = false; s.menu.close();

            /** World-space silhouette edge along `dir`, for geometry in that lane. */
            function edgeAlong(root, dir, laneHalf = 0.7) {
                root.updateMatrixWorld(true);
                const c = root.position;
                let edge = 0;
                const v = new THREE.Vector3();
                root.traverse((o) => {
                    const g = o.geometry;
                    if (!g?.attributes?.position) return;
                    const pos = g.attributes.position;
                    for (let i = 0; i < pos.count; i++) {
                        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                        const ox = v.x - c.x, oz = v.z - c.z;
                        const lat = Math.abs(-ox * dir.z + oz * dir.x);
                        if (lat <= laneHalf) edge = Math.max(edge, ox * dir.x + oz * dir.z);
                    }
                });
                return edge;
            }

            const out = [];
            for (const beat of BEATS) {
                try {
                    s.loadLevel(beat);
                    s.game.bossIntro = null;
                    const lvl = s.game.level;
                    const rid = Object.keys(lvl.def.rooms).find((k) => lvl.def.rooms[k].boss);
                    lvl.enterRoom(rid, s.game);
                    for (const e of lvl.enemies || []) {
                        if (e.managedBySystem || e.bossId || e === lvl.boss) continue;
                        if (e.state) e.state.current = 'DEAD';
                        e.defeated = true;
                    }
                    const boss = lvl.boss;
                    const tgt = boss.cores ? boss.cores[0] : boss;
                    const p = s.player;
                    p.inventory.addWeapon('anchor_link');
                    p.inventory.setWeapon('anchor_link');
                    const bp = tgt.root.position;

                    // Hold the boss wide open: this measures REACH, not the
                    // armour window. A boss that is armoured or mid-action
                    // would report a band of zero for reasons that are the
                    // fight working correctly.
                    //
                    // WHICH MEANS A GREEN RUN HERE SAYS NOTHING ABOUT WHETHER
                    // THE FIGHT IS WINNABLE. The Obsidian Arachnid passed every
                    // assertion in this file while being, in play, unkillable
                    // from anywhere outside its own legs: its plate tracked the
                    // player faster than the player could circle, so the only
                    // radius that ever landed a blow was the one this spec
                    // disables the armour to reach. Three separate "I have to
                    // stand inside it to hit it" reports came through that gap.
                    //
                    // The armour question has its own home now, and it derives
                    // its radii from the boss's real geometry rather than from
                    // invented ones: `tests/game/boss-facing.spec.mjs`, the
                    // block headed THE RADII COME FROM THE BOSS. Do not read
                    // this file as covering it.
                    const open = () => {
                        tgt.hp = 99999;
                        if (tgt.state) tgt.state.current = 'IDLE';
                        boss.phase = 9; boss.action = null; boss._openT = 999;
                        tgt.shielded = false; tgt.canHit = true;
                        if (tgt !== boss) { boss.shielded = false; boss.canHit = true; }
                    };
                    const lands = (dir, d) => {
                        open();
                        p.rig.position.set(bp.x + dir.x * d, 1.95, bp.z + dir.z * d);
                        p.state.setFacing(-dir.x, -dir.z);
                        p.attackCd = 0;
                        const before = tgt.hp;
                        p.tryAttack(lvl.enemies, lvl.destructibles);
                        return tgt.hp < before;
                    };

                    let worst = Infinity, worstAt = null, edgeAtWorst = 0, hitAtWorst = 0;
                    for (let k = 0; k < 8; k++) {
                        const a = k * Math.PI / 4;
                        const dir = { x: Math.sin(a), z: Math.cos(a) };
                        const edge = edgeAlong(tgt.root, dir);
                        // Binary search the outer edge of the hittable interval.
                        let lo = 0.15, hi = 9.0;
                        if (!lands(dir, lo)) { lo = 0; hi = 0; }
                        for (let it = 0; it < 14 && hi > lo; it++) {
                            const mid = (lo + hi) / 2;
                            if (lands(dir, mid)) lo = mid; else hi = mid;
                        }
                        const band = lo - edge;
                        if (band < worst) {
                            worst = band; worstAt = Math.round(a * 180 / Math.PI);
                            edgeAtWorst = edge; hitAtWorst = lo;
                        }
                    }
                    out.push({
                        beat, boss: boss.constructor.name,
                        band: +worst.toFixed(2), at: worstAt,
                        edge: +edgeAtWorst.toFixed(2), maxHit: +hitAtWorst.toFixed(2),
                    });
                } catch (e) {
                    out.push({ beat, err: String(e).slice(0, 160) });
                }
            }
            return out;
        }, BEATS);

        const measured = [];
        for (const r of rows) {
            if (r.err) { t.ok(`${r.beat} boss reach`, false, r.err); continue; }
            if (EXEMPT[r.beat]) {
                t.ok(`${r.beat} exempt from the floor-level reach probe`, true, EXEMPT[r.beat]);
                continue;
            }
            measured.push(r.band);
            t.ok(`${r.beat} can be hit from outside its own body`,
                r.band >= MIN_BAND,
                `${r.boss}: band ${r.band} at ${r.at}° — visible edge ${r.edge}, `
                + `damage stops at ${r.maxHit} (floor ${MIN_BAND})`);
        }

        measured.sort((a, b) => a - b);
        const median = measured.length
            ? measured[Math.floor(measured.length / 2)] : 0;
        t.ok('the campaign leaves comfortable room to stand, not just legal room',
            median >= MIN_MEDIAN_BAND,
            `median band ${median.toFixed(2)} across ${measured.length} bosses`);

        t.ok('no fatal pageerrors',
            errors.filter((e) => !/AudioContext|favicon/i.test(e)).length === 0,
            errors.slice(0, 4).join(' | '));
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
