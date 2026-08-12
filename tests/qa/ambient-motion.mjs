// tests/qa/ambient-motion.mjs — what moves in a room when the player does not?
//
// `docs/HOW-TO-CLOSE-THE-GAP.md` item 3 opens with the claim "nothing moves
// that you did not move". That is an assertion about the running game, and it
// had never been measured — it was written from watching the game, which is the
// right way to NOTICE it and the wrong way to size it. Before turning four
// systems up, this says which of them are already producing motion and how
// much, so the work goes where the stillness actually is.
//
// METHOD
//
// Start a real run, load a level, let it settle, then hold perfectly still and
// sample the scene twice about a second apart. Anything whose world transform
// or light intensity differs between the two samples is, by definition, moving
// on its own. The player is sampled too, as a control: it must NOT move, or the
// probe is measuring drift rather than ambience.
//
// Objects are bucketed by what they are, because "37 things moved" is useless
// and "37 things moved and all of them are the enemy you are fighting" is the
// actual answer.
//
// Print-only, like every probe in this folder. It reports; it does not gate.
// The gate is `tests/game/ambient-life.spec.mjs`.
//
//   node tests/qa/ambient-motion.mjs [levelId ...]

import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

/** Levels sampled when none are named on the command line. */
const DEFAULT_LEVELS = ['beat-01-tomb', 'beat-08-bone', 'beat-12-pyre', 'overworld'];

/** How long to hold still between the two samples, in ms. */
const HOLD_MS = 1000;

/** Movement below this is floating-point noise, not animation. */
const EPS = 1e-4;

const chrome = findChromeVerbose();
if (!chrome.path) {
    console.error('No Chrome found. Set CHROME_PATH.');
    process.exit(1);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const levels = wanted.length ? wanted : DEFAULT_LEVELS;

const puppeteer = await import('puppeteer-core');
const server = await startServer(8841);
let browser;

try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    const page = await browser.newPage();
    await disableGamepads(page);
    page.setDefaultTimeout(90000);
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player),
        { timeout: 60000 });

    // Start the run explicitly. The hook says why in its own comment: driving
    // the title with blind ArrowDown/Enter couples every reading to the menu's
    // current row order, and it has already invalidated a whole sweep once.
    await page.evaluate(() => window.__sovereignScar.startNewGame());
    await sleep(600);

    for (const id of levels) {
        const rows = await page.evaluate(async (levelId, holdMs, eps) => {
            const s = window.__sovereignScar;
            s.game.atTitle = false;
            s.game.paused = false;
            if (s.menu && s.menu.close) s.menu.close();
            s.loadLevel(levelId);
            s.game.bossIntro = null;
            // Let one-shot entry animations (doors, fades, spawn settles)
            // finish, or they read as ambient motion and inflate every number.
            await new Promise((r) => setTimeout(r, 1400));

            // Bucket by SUBTREE MEMBERSHIP, not by name. The first version of
            // this probe guessed from names and userData flags (`ssEnemy`,
            // `ssPlayer`) that do not exist — so the player bucket never
            // appeared at all, the control was silently absent, and an enemy's
            // held plate landed in "props" because it is called `prop:bulwark`.
            // The scene is asked who the player and the enemies are instead.
            const owner = new Map();
            const claim = (root, tag) => root && root.traverse((o) => {
                if (!owner.has(o.uuid)) owner.set(o.uuid, tag);
            });
            claim(s.player?.root, 'player');
            // Enemies live on the LEVEL, not on game — `game.enemies` is
            // undefined, which is why the first run reported 0 enemies in
            // rooms that plainly had them.
            for (const e of (s.game.level?.enemies || [])) claim(e.root || e.mesh || e.actor?.root, 'enemies');

            const bucketOf = (o) => {
                if (o.isLight) return 'lights';
                if (o.isPoints) return 'particles';
                const own = owner.get(o.uuid);
                if (own) return own;
                const n = (o.name || '').toLowerCase();
                if (n.startsWith('prop') || n.includes('banner') || n.includes('chain')
                    || n.includes('vent') || n.includes('torch')) return 'props';
                return 'other';
            };

            /**
             * Points objects animate their VERTICES; their transform never
             * moves. Sampling matrixWorld reported the 520-particle dust field
             * as perfectly still, which was a fact about the probe and not
             * about the game. A cheap checksum over the position buffer is
             * what actually detects drifting motes.
             */
            const pointsDigest = (o) => {
                const a = o.geometry?.attributes?.position?.array;
                if (!a) return 0;
                let sum = 0;
                const step = Math.max(1, Math.floor(a.length / 300));
                for (let i = 0; i < a.length; i += step) sum += a[i];
                return sum;
            };

            /** A digest of every transform + light intensity in the scene. */
            const snapshot = () => {
                const map = new Map();
                s.scene.updateMatrixWorld(true);
                s.scene.traverse((o) => {
                    const m = o.matrixWorld.elements;
                    map.set(o.uuid, {
                        b: bucketOf(o),
                        // translation column of the world matrix
                        x: m[12], y: m[13], z: m[14],
                        // one rotation/scale element is enough to catch a sway
                        r: m[0] + m[5] + m[10] + m[1] + m[6] + m[8],
                        i: o.isLight ? (o.intensity || 0) : 0,
                        v: o.isPoints ? pointsDigest(o) : 0,
                        n: o.name || o.type,
                    });
                });
                return map;
            };

            const before = snapshot();
            // Hold still. No input is sent; the game keeps running frames.
            await new Promise((r) => setTimeout(r, holdMs));
            const after = snapshot();

            const buckets = {};
            const examples = {};
            let total = 0;
            for (const [uuid, a] of before) {
                const b = after.get(uuid);
                if (!b) continue;
                const dPos = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
                const dRot = Math.abs(a.r - b.r);
                const dInt = Math.abs(a.i - b.i);
                const dVtx = Math.abs(a.v - b.v);
                const moved = dPos > eps || dRot > eps || dInt > eps || dVtx > eps;
                total++;
                const k = a.b;
                buckets[k] = buckets[k] || { n: 0, moved: 0, maxPos: 0, maxRot: 0, maxInt: 0, maxVtx: 0 };
                buckets[k].n++;
                if (moved) {
                    buckets[k].moved++;
                    buckets[k].maxPos = Math.max(buckets[k].maxPos, dPos);
                    buckets[k].maxRot = Math.max(buckets[k].maxRot, dRot);
                    buckets[k].maxInt = Math.max(buckets[k].maxInt, dInt);
                    buckets[k].maxVtx = Math.max(buckets[k].maxVtx, dVtx);
                    if (!examples[k]) examples[k] = a.n;
                }
            }
            // ── Actors, asked precisely ────────────────────────────────────
            // "87% of enemy parts moved" cannot tell breathing from turning,
            // and the doc's claim is specifically that enemies "stand
            // perfectly still until you enter their radius". So ask the two
            // separate questions of each actor's ROOT: did it TRAVEL, and did
            // it TURN? Those are behaviour. Every other moving part is the
            // animator idling, which is a different feature and already on.
            const actors = [];
            for (const [uuid, tag] of [[s.player?.root?.uuid, 'player']]) if (uuid) actors.push({ uuid, tag });
            for (const e of (s.game.level?.enemies || [])) {
                const rt = e.root || e.mesh || e.actor?.root;
                if (rt) actors.push({ uuid: rt.uuid, tag: 'enemy' });
            }
            const actorRows = actors.map(({ uuid, tag }) => {
                const a = before.get(uuid); const b = after.get(uuid);
                if (!a || !b) return null;
                return {
                    tag,
                    travel: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
                    turn: Math.abs(a.r - b.r),
                };
            }).filter(Boolean);

            const summarise = (tag) => {
                const rs = actorRows.filter((r) => r.tag === tag);
                if (!rs.length) return null;
                return {
                    n: rs.length,
                    travelled: rs.filter((r) => r.travel > eps).length,
                    turned: rs.filter((r) => r.turn > eps).length,
                    maxTravel: Math.max(...rs.map((r) => r.travel)),
                    maxTurn: Math.max(...rs.map((r) => r.turn)),
                };
            };

            // What named scenery exists at all, so item 3.3 can be sized
            // rather than assumed. Enemy-owned objects are excluded — a
            // bulwark's plate is called `prop:bulwark` and is not scenery.
            const propNames = {};
            s.scene.traverse((o) => {
                const n = o.name || '';
                if (n && !owner.has(o.uuid)) {
                    const key = n.split(':')[0];
                    propNames[key] = (propNames[key] || 0) + 1;
                }
            });

            return {
                buckets, total, examples, propNames,
                enemyCount: (s.game.level?.enemies || []).length,
                player: summarise('player'),
                enemy: summarise('enemy'),
            };
        }, id, HOLD_MS, EPS);

        console.log(`\n=== ${id} ===   ${rows.total} objects, ${rows.enemyCount} enemies, room ${rows.room}`);
        console.log('bucket      objects    moving   max Δpos   max Δrot   max Δint   max Δvtx   e.g.');
        const order = ['lights', 'particles', 'enemies', 'props', 'player', 'other'];
        for (const k of order) {
            const b = rows.buckets[k];
            if (!b) continue;
            const pct = b.n ? Math.round((b.moved / b.n) * 100) : 0;
            console.log(
                k.padEnd(11)
                + String(b.n).padStart(7)
                + `${String(b.moved)} (${pct}%)`.padStart(11)
                + b.maxPos.toFixed(4).padStart(11)
                + b.maxRot.toFixed(4).padStart(11)
                + b.maxInt.toFixed(4).padStart(11)
                + b.maxVtx.toFixed(3).padStart(11)
                + '   ' + (rows.examples[k] || '')
            );
        }
        const still = order.filter((k) => rows.buckets[k] && rows.buckets[k].moved === 0);
        if (still.length) console.log(`completely still: ${still.join(', ')}`);

        // The claim under test, stated as a number.
        for (const [tag, r] of [['player', rows.player], ['enemy', rows.enemy]]) {
            if (!r) continue;
            console.log(`  ${tag} ROOTS: ${r.n} tracked, ${r.travelled} travelled, ${r.turned} turned`
                + `  (max travel ${r.maxTravel.toFixed(4)}, max turn ${r.maxTurn.toFixed(4)})`);
        }
        const scenery = Object.entries(rows.propNames)
            .filter(([k]) => !/^(body|pickup|dust|Mesh|Group|Object3D|Points|Line)/.test(k))
            .sort((a, b) => b[1] - a[1]).slice(0, 8);
        console.log('  named scenery: ' + (scenery.length ? scenery.map(([k, v]) => `${k}x${v}`).join(' ') : 'NONE'));
    }

    console.log('\nThe player root travelling is the control: it should be 0, because');
    console.log('no input is sent. Parts moving is the idle animator and is expected.');
} finally {
    if (browser) await browser.close();
    server.close();
}
