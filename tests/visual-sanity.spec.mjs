// Browser E2E (S6): visual sanity — luminance bands, character scale,
// grounding, and boss silhouette hierarchy for every level.
// These asserts would have caught P0-1 (7× characters), P0-2 (near-black
// scenes) and P1-5 (bosses smaller than trash mobs).

import { startServer, findChromeVerbose, sleep, disableGamepads } from './harness.mjs';

// One shared band for both moods. Abyss used to run its own darker band
// ([35,75] against Crust's [45,90]) as a deliberate "oppressive shadow world"
// contrast — but the owner played it and called that a bug: the Abyss should
// read at the same brightness as the Crust, not measurably darker. The
// Abyss's identity now lives entirely in hue (violet/charcoal) and contrast
// shape, never in a lower exposure floor. `assets/palettes.js`'s
// `MOOD_PRESETS.abyss` was raised to land here on its own; this band is what
// makes that the enforced target rather than a one-off tuning pass.
// ── The band is on the CENTRE CROP, not the full frame ─────────────────────
//
// It used to be `[45, 90]` over the whole frame, and that number was mostly a
// post-processing effect rather than a property of the art.
//
// Measured, same scenes, only the vignette changed (1.10/0.95 → 0.72/1.05):
//
//   level         full-frame mean     centre-crop mean
//   crypt            58 →  111            84 →  98
//   sluice           64 →  116           110 → 121
//   pyre             62 →  115           106 → 120
//   overworld        73 →  120            95 → 106
//
// Full-frame mean roughly DOUBLED while the lit part of the picture moved
// about 13%. Nearly all of the number the gate was watching was the vignette
// crushing the corners to black — so the gate would have demanded the lighting
// be halved to compensate for a change that did not touch the lighting, and
// the game would have ended up darker than it has ever been while metering
// "correct".
//
// This file already knew the lesson and had only applied it to contrast: see
// the note below about p10 being zero nearly everywhere because of the
// vignette. The mean had the same disease and nobody had checked.
//
// The band itself is a RATCHET around the measured campaign, which after the
// re-trim runs 89 (Quarry) to 116 (Sink) — a 1.30:1 spread, against the owner's
// decision that brightness should read the same across the board. Wide enough
// to survive sample noise, tight enough that the pre-work outliers would have
// failed it in both directions.
//
// The absolute numbers moved twice during that work and the second move is the
// instructive one. Easing the vignette and wiring the room fixtures BOTH raised
// the measurement, the band was re-derived from the result, and the resulting
// frames were flat, milky and worse than what they replaced — while metering
// perfectly inside their new band. The lights came back down, the band came
// down with them, and the difference was decided by looking at
// `docs/media/certification/beat-01-crypt-entry.png`, not by the statistic.
// A gate is a ratchet against regression; it is not evidence that the art is
// good, and this file has now been wrong about that twice.
// Exported so `tests/qa/lum-probe.mjs` reads the band rather than keeping its
// own copy. It kept one for months, the copy went stale against a re-derived
// band, and the probe reported ten levels out of band on a green campaign.
export const LUM_BANDS = {
    crust: [76, 130],
    abyss: [76, 130],
};

// Minimum centre-crop p90 − p10. The mean band above cannot tell a well-lit
// room from a flat one — a strong key with deep shadows meters LOWER than the
// same room under a flat ambient wash — so for as long as the mean was the only
// gate, the cheapest way to pass it was to flatten the art. This is the
// assertion that makes that no longer free.
//
// TWO floors, because one number cannot serve both kinds of space.
//
// A walled room with a key light and cast shadows measures 70–172. An open
// outdoor screen — one ground plane, no walls to shadow it, no ceiling to
// occlude it — measures 12–16, and no amount of lighting work changes that;
// it is what an open field IS. A single floor set low enough for the overworld
// (13) was doing almost nothing for the fourteen dungeons: one could regress
// from 95 to 14 and still pass. And set at 13 it sat *inside* the overworld's
// own sample noise, which is the randomly-failing gate this suite already
// learned to avoid once (see the median-of-five note below).
//
// So the dungeons get a floor that actually bites, and the open levels get one
// scaled to what open space can do. Both are RATCHETS — set just under the
// measured worst of their kind, tightened whenever that worst improves:
//
//   dungeons  worst 70 (Cryo Vault)  -> floor 60
//   open      worst  9 (Bonetown)    -> floor 8
//
// The open worst moved 12 -> 9 when the vignette was eased: a weaker
// vignette lifts the darkest pixels in the crop, which NARROWS p90-p10
// on a scene that has no walls to cast shadows. Lower ground, same
// ratchet — and a reminder that this statistic is not independent of the
// post stack either.
//
// The full before/after table is in tests/game/luminance.spec.mjs, which also
// proves the statistic discriminates at all (a flat grey frame passes the mean
// band and fails these floors).
const CONTRAST_FLOORS = { dungeon: 60, open: 8 };

/**
 * Which floor a level answers to, from the level's own `space` declaration.
 *
 * This was `id.startsWith('beat-')` for exactly one commit, which is a guess
 * about a naming convention rather than a fact about the level — a dungeon
 * added under any other name would have silently received the lax open-ground
 * floor and been free to go flat. `space` is declared in `levels/registry.js`
 * and defaults to the STRICTER floor, so forgetting it makes a level harder to
 * pass rather than easier.
 */
const contrastFloorFor = (space) => (space === 'open'
    ? CONTRAST_FLOORS.open : CONTRAST_FLOORS.dungeon);

/**
 * Levels exempt from the contrast floor, by name, with the reason — the same
 * shape boss-reach-e2e uses, because an exemption you cannot read is just a
 * hole.
 *
 * `sandbox-combat` is the developer combat testbed: a bare flat plate with a
 * handful of enemies on it and no set dressing, deliberately, so that what you
 * are looking at while tuning a weapon is the weapon. The contrast floor exists
 * to catch SHIPPED art going flat; a fixture that is flat on purpose is a false
 * positive, and the honest choice is to say so here rather than to soften the
 * floor for every open level in the game.
 *
 * It measures 7 against a floor of 8, and that number is now stable. It was not
 * before: this file used to leave the title screen with `click, ArrowDown,
 * Enter`, which meant every reading depended on the title menu's row order, and
 * identical code produced 7, 11, 13, 14, 20, 23, 38, 59 and 62 across runs. The
 * gate was green because the dice were. With the fixture asking for a run by
 * name, clean HEAD and this branch both read 7 every time — so this exemption
 * records a real, pre-existing property of the level, not a regression.
 *
 * The fourteen campaign dungeons and all sixteen overworld screens are still
 * gated, at 60 and 8 respectively.
 */
const CONTRAST_EXEMPT = {
    'sandbox-combat': 'developer combat testbed — deliberately undressed flat plate; '
        + 'stable at 7 vs floor 8 on clean HEAD too. Campaign levels remain gated.',
};
/**
 * One representative screen per overworld region, computed from `regionOf`
 * across the 7×7 grid and pinned so a run always measures the same places.
 * These are the same screens `tests/qa/certification-captures.mjs` shoots, so a
 * failure here has a picture next to it.
 */
const OVERWORLD_REGIONS = {
    tombfields: 'r1c1',
    spindle: 'r1c3',
    pyre: 'r2c5',
    sinklands: 'r3c1',
    citadel: 'sink',
    quarry: 'r5c1',
    cryomire: 'r5c6',
    bonetown: 'r6c2',
};

const PLAYER_TARGET_H = 1.9;

// ── Mobs are a RANGE, not a target ─────────────────────────────────────────
//
// This used to be `MOB_TARGET_H = 1.6` with every enemy asserted to within
// ±20% of it. That assertion passed for the life of the project for a reason
// that was not a good one: every enemy in the game was built from the same two
// numbers, so all seven kinds measured 1.63 exactly. The spec was pinning the
// bug — "which of these is the armoured one" could not be answered from a
// silhouette, and the gate would have failed anyone who tried to fix it.
//
// What actually matters at this camera height is that a mob is neither lost
// against the floor nor mistakable for a boss. So: a floor and a ceiling, wide
// enough to hold a 0.97 brood and a 2.15 lancer, and the boss-dominance check
// below still measures against the TALLEST mob present, which keeps the
// hierarchy honest without flattening the bestiary.
const MOB_MIN_H = 0.85;
const MOB_MAX_H = 2.4;

export async function run(t) {
    const chrome = findChromeVerbose();
    if (!chrome.path) {
        t.skip('Chrome not found');
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
        // The click is a real requirement (browsers gate WebAudio on a user
        // gesture). The ArrowDown/Enter that used to follow it were not: they
        // were miming "start a run" through whatever the title menu's second
        // enabled row happened to be, which made every reading in this file
        // depend on menu layout. Adding a Credits row was enough to land on
        // Settings instead, leave the run unstarted, and drop sandbox-combat's
        // contrast from 14-62 to a flat 7 — a gate failure with no rendering
        // change behind it. Ask for the run by name.
        await page.mouse.click(400, 300);
        await sleep(120);

        const rows = await page.evaluate(async () => {
            const s = window.__sovereignScar;
            s.startNewGame('medium');
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
                    // centreMean, not mean — see the LUM_BANDS note. The
                    // full-frame mean is dominated by the vignette.
                    const lum = median('centerMean');
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
                        space: meta.space || 'enclosed',
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
            const floor = contrastFloorFor(r.space);
            if (CONTRAST_EXEMPT[r.id]) {
                // Still measured and still printed — an exemption that stops
                // looking is an exemption that hides a change.
                t.ok(`${r.id} contrast recorded (exempt from the floor)`, true,
                    `contrast=${r.contrast} floor=${floor} — ${CONTRAST_EXEMPT[r.id]}`);
            } else {
                t.ok(`${r.id} clears the contrast floor`, r.contrast >= floor,
                    `contrast=${r.contrast} floor=${floor} (centre-crop p90−p10)`);
            }

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
            let widestMob = 0;
            for (let i = 0; i < r.mobs.length; i++) {
                const mob = r.mobs[i];
                widestMob = Math.max(widestMob, mob.w || 0, mob.d || 0);
                t.ok(`${r.id} mob[${i}] scale`,
                    mob.h >= MOB_MIN_H && mob.h <= MOB_MAX_H,
                    `h=${mob.h.toFixed(2)} band=[${MOB_MIN_H}, ${MOB_MAX_H}]`);
                t.ok(`${r.id} mob[${i}] grounded`, mob.minY >= 0.85, `minY=${mob.minY.toFixed(2)}`);
                tallestMob = Math.max(tallestMob, mob.h);
            }

            if (r.boss) {
                // Dominance on the LARGER axis, not on height alone.
                //
                // Height was the only measure, and it encoded an assumption the
                // roster never agreed to: that a boss towers. The Skeletal
                // Mantis is a low, sprawling thing — 2.19 tall against a 2.15
                // lancer, and 5.1 units across against that lancer's 0.85. It
                // dominates its room emphatically and failed a height check by
                // four centimetres.
                //
                // What the assertion is actually for (P1-5: "bosses smaller
                // than trash mobs") is answered by whichever axis the boss
                // spends its mass on.
                const mobSpan = Math.max(tallestMob, widestMob);
                const bossSpan = Math.max(r.boss.h, r.boss.w || 0, r.boss.d || 0);
                const bar = Math.max(mobSpan * 1.3, r.player.h);
                t.ok(`${r.id} boss silhouette dominates`, bossSpan >= bar,
                    `boss=${bossSpan.toFixed(2)} bar=${bar.toFixed(2)} `
                    + `(tallest mob=${tallestMob.toFixed(2)}, widest=${widestMob.toFixed(2)})`);
            }
        }

        // ── The overworld, region by region and state by state ────────────
        //
        // The loop above samples the overworld ONCE — on the screen it loads
        // into, in whichever mirror state the save happens to hold. That is a
        // single sample of a level whose eight regions are deliberately made of
        // different rock, and it turned out to be the pale one:
        //
        //     Bonetown  ashField  87      Quarry    slate   52
        //     Tombfields clayField 76     Spindle   iron    32   <- floor is 45
        //
        // and every Abyss screen sat at 18-27 against a floor of 35. Both were
        // invisible for the life of the project because the start screen is
        // fine. This sweep is the fix for the *measurement*; render/albedo-trim.js
        // is the fix for the game.
        const owRows = await page.evaluate(async (regions) => {
            const s = window.__sovereignScar;
            const out = [];
            for (const [region, screen] of regions) {
                for (const state of ['crust', 'abyss']) {
                    try {
                        // The overworld cannot be teleported across — an unbaked
                        // screen is void and the player falls through it. Write
                        // the save and reload so the screen bakes around them.
                        // `world` is required or createOverworld silently falls
                        // back to the start screen and every sample is the same
                        // place wearing different labels.
                        s.patchOverworld({
                            pos: { world: 'overworld', screen, x: 0, z: 0 },
                            state,
                        });
                        s.loadLevel('overworld');
                        await new Promise((r) => setTimeout(r, 900));
                        const got = [];
                        for (let i = 0; i < 5; i++) {
                            got.push(await s.sampleLuminanceStats());
                            await new Promise((r) => setTimeout(r, 150));
                        }
                        const med = (k) => got.map((g) => g[k]).sort((a, b) => a - b)[2];
                        out.push({
                            region, screen, state,
                            lum: med('centerMean'),
                            contrast: med('contrast'),
                            mood: s.game.level?.mood || state,
                        });
                    } catch (e) {
                        out.push({ region, screen, state, err: String(e) });
                    }
                }
            }
            return out;
        }, Object.entries(OVERWORLD_REGIONS));

        for (const r of owRows) {
            const name = `overworld ${r.region} (${r.state})`;
            if (r.err) {
                t.ok(`${name} sampled`, false, r.err);
                continue;
            }
            const [lo, hi] = LUM_BANDS[r.mood] || LUM_BANDS.crust;
            t.ok(`${name} luminance in band`, r.lum >= lo && r.lum <= hi,
                `lum=${r.lum.toFixed(1)} band=[${lo},${hi}] screen=${r.screen}`);
            t.ok(`${name} clears the contrast floor`, r.contrast >= CONTRAST_FLOORS.open,
                `contrast=${r.contrast} floor=${CONTRAST_FLOORS.open}`);
        }
        t.ok('every overworld region was swept',
            owRows.length === Object.keys(OVERWORLD_REGIONS).length * 2,
            `${owRows.length} samples`);
    } finally {
        try { await browser?.close(); } catch (_) {}
        await server.close();
    }
}
