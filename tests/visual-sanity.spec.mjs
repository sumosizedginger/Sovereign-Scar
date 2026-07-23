// Browser E2E (S6): visual sanity — luminance bands, character scale,
// grounding, and boss silhouette hierarchy for every level.
// These asserts would have caught P0-1 (7× characters), P0-2 (near-black
// scenes) and P1-5 (bosses smaller than trash mobs).

import { startServer, findChromeVerbose, sleep, disableGamepads } from './harness.mjs';

const LUM_BANDS = {
    crust: [45, 90],
    abyss: [35, 75],
};

// Minimum centre-crop p90 − p10. The mean band above cannot tell a well-lit
// room from a flat one — a strong key with deep shadows meters LOWER than the
// same room under a flat ambient wash — so for as long as the mean was the only
// gate, the cheapest way to pass it was to flatten the art. This is the
// assertion that makes that no longer free.
//
// Set as a RATCHET, not a cliff, and TIGHTENED once already. When the floor
// first landed the worst level was the overworld at 14, so it was set to 12.
// After the ambient/key rebalance the worst is 15, so it is 13. The full
// before/after table is in tests/game/luminance.spec.mjs, which also proves the
// statistic discriminates at all (a flat grey frame passes the mean band and
// fails this floor).
//
// Tighten it again whenever a change raises the worst level. A ratchet that is
// never tightened is just a number.
const CONTRAST_FLOOR = 13;
const PLAYER_TARGET_H = 1.9;
const MOB_TARGET_H = 1.6;

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

    const server = await startServer(8794);
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
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), {
            timeout: 25000,
        });
        await page.mouse.click(400, 300);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await sleep(300);

        const rows = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = false;
            s.menu.close();
            const out = [];
            for (const meta of s.LEVELS) {
                try {
                    s.loadLevel(meta.id);
                    // The boss-intro camera push-in would skew the sample.
                    s.game.bossIntro = null;
                    await new Promise((r) => setTimeout(r, 600));
                    // Five samples, keep the MEDIAN.
                    //
                    // This was max-of-two, chosen because the first frames after
                    // a load read dark while materials and programs settle. But
                    // max is the wrong statistic for a signal that oscillates:
                    // Beat 13 runs the flicker shader at 0.45 and Beat 14 the
                    // wrap shader, so their frame brightness swings by design,
                    // and taking the peak made the gate fail intermittently at
                    // 96.6 against a ceiling of 75 — a level that sits at ~36
                    // when you actually look at it. A randomly-failing gate is
                    // worse than no gate, because it trains you to re-run.
                    //
                    // The median discards both the dark settling frame the max
                    // was guarding against and the bright flicker peak, without
                    // needing to know which levels flicker.
                    const got = [];
                    for (let i = 0; i < 5; i++) {
                        got.push(await s.sampleLuminanceStats());
                        await new Promise((r) => setTimeout(r, 160));
                    }
                    const median = (key) => {
                        const v = got.map((g) => g[key]).sort((a, b) => a - b);
                        return v[Math.floor(v.length / 2)];
                    };
                    const lum = median('mean');
                    const contrast = median('contrast');
                    const m = s.measure();
                    const census = s.solidShadowCensus();

                    // Contact discs: one per live actor, and each must track
                    // its actor's XZ. Checked by teleporting the player and
                    // stepping a frame — a disc that is merely *created* proves
                    // nothing, since a disc parked at the origin would satisfy
                    // a count.
                    const before = s.contactShadows.count;
                    const rig = s.player.rig;
                    const p0 = { x: rig.position.x, z: rig.position.z };
                    rig.position.x += 3.5;
                    rig.position.z -= 2.25;
                    await new Promise((r) => setTimeout(r, 120));
                    const disc = s.contactShadows.entries.get(rig);
                    const trackErr = disc
                        ? Math.hypot(disc.mesh.position.x - rig.position.x,
                            disc.mesh.position.z - rig.position.z)
                        : Infinity;
                    rig.position.x = p0.x;
                    rig.position.z = p0.z;
                    out.push({
                        id: meta.id,
                        mood: s.game.level.mood || meta.mood || 'crust',
                        lum,
                        contrast,
                        solid: census.solid,
                        solidRecv: census.recv,
                        shadowMisses: census.missing.slice(0, 6),
                        discs: before,
                        actors: 1 + (s.game.level?.enemies?.length || 0),
                        trackErr,
                        player: m.player,
                        mobs: m.mobs,
                        boss: m.boss,
                        err: null,
                    });
                } catch (e) {
                    out.push({ id: meta.id, err: String(e) });
                }
            }
            return out;
        });

        for (const r of rows) {
            if (r.err) {
                t.ok(`${r.id} sampled`, false, r.err);
                continue;
            }
            const [lo, hi] = LUM_BANDS[r.mood] || LUM_BANDS.crust;
            t.ok(`${r.id} luminance in band`, r.lum >= lo && r.lum <= hi,
                `lum=${r.lum.toFixed(1)} band=[${lo},${hi}] mood=${r.mood}`);
            t.ok(`${r.id} clears the contrast floor`, r.contrast >= CONTRAST_FLOOR,
                `contrast=${r.contrast} floor=${CONTRAST_FLOOR} (centre-crop p90−p10)`);

            // Every solid, non-glowing mesh receives, or says why not.
            //
            // Not "most of them" and not a count: a threshold invites the next
            // person to add an unshadowed mesh and stay under it. Opting out is
            // still allowed — it just has to be written down in
            // `userData.shadowExempt`, which is what this counts as legitimate.
            // See src/game/render/shadow-roles.js. Before this landed the
            // answer was 7 receivers out of 151 meshes.
            t.ok(`${r.id} every solid mesh receives shadow`, r.solidRecv === r.solid,
                `${r.solidRecv}/${r.solid}` + (r.shadowMisses.length
                    ? ` missing: ${r.shadowMisses.join(', ')}` : ''));
            t.ok(`${r.id} has a contact disc per actor`, r.discs >= r.actors,
                `discs=${r.discs} actors=${r.actors}`);
            t.ok(`${r.id} contact disc tracks its actor`, r.trackErr < 0.05,
                `xz error=${r.trackErr === Infinity ? 'no disc' : r.trackErr.toFixed(3)}`);

            const pr = r.player.h / PLAYER_TARGET_H;
            t.ok(`${r.id} player scale`, pr >= 0.8 && pr <= 1.2, `h=${r.player.h.toFixed(2)}`);
            t.ok(`${r.id} player grounded`, r.player.minY >= 0.85,
                `minY=${r.player.minY.toFixed(2)} (floor top = 1.0)`);

            let tallestMob = 0;
            for (let i = 0; i < r.mobs.length; i++) {
                const mob = r.mobs[i];
                const mr = mob.h / MOB_TARGET_H;
                t.ok(`${r.id} mob[${i}] scale`, mr >= 0.8 && mr <= 1.2, `h=${mob.h.toFixed(2)}`);
                t.ok(`${r.id} mob[${i}] grounded`, mob.minY >= 0.85, `minY=${mob.minY.toFixed(2)}`);
                tallestMob = Math.max(tallestMob, mob.h);
            }

            if (r.boss) {
                const bar = Math.max(tallestMob * 1.3, r.player.h);
                t.ok(`${r.id} boss silhouette dominates`, r.boss.h >= bar,
                    `boss=${r.boss.h.toFixed(2)} bar=${bar.toFixed(2)} (mob=${tallestMob.toFixed(2)})`);
            }
        }
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
