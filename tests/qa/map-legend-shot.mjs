// tests/qa/map-legend-shot.mjs — a picture of the map key.
//
//   node tests/qa/map-legend-shot.mjs [label]
//
// Writes docs/media/map/<label>/overworld.png and dungeon.png: the Tab map with
// a representative amount of the world revealed, so the key can be read.
//
// WHY. Reported from play: *"Need to include some kind of key for the world
// map."* The map draws six marks and four link colours and explained none of
// them — and two of them (a solid gold outline and a DASHED gold outline) mean
// entirely different things and differ by a line style. A legend is a thing
// that has to be looked at to be judged, so it gets a capture like everything
// else in this project that does.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const LABEL = process.argv[2] || 'after';
const OUT = path.join('docs', 'media', 'map', LABEL);
fs.mkdirSync(OUT, { recursive: true });

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
const server = await startServer(8797);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path, headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    const page = await browser.newPage();
    await disableGamepads(page);
    page.setDefaultTimeout(120000);
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });
    await page.evaluate(() => {
        const s = window.__sovereignScar;
        s.startNewGame(); s.game.atTitle = false; s.game.paused = false; s.menu.close();
    });
    await sleep(600);

    for (const name of ['overworld', 'overworld-full', 'dungeon']) {
        const url = await page.evaluate(async (which) => {
            const s = window.__sovereignScar;
            if (which === 'dungeon') { s.loadLevel('beat-06-quarry'); s.game.bossIntro = null; }
            // The two marks that only exist under a condition: the DASHED gold
            // box (an active Anchor Thread destination) and the cyan secret dot
            // (the Echo Lens). They are the pair that most needed a key — a
            // dashed gold outline and a solid gold outline differ by a line
            // style and mean entirely different things — so one capture has to
            // actually contain them.
            if (which === 'overworld-full') {
                s.game.hasUpgrade = () => true;
                s.game.anchorThread = {
                    ...(s.game.anchorThread || {}),
                    destination: () => ({ screen: 'r4c4' }),
                    recall: () => 'The Link remembers: the quarry, and what was filed below.',
                };
            }
            await new Promise((r) => setTimeout(r, 900));
            const map = s.map || s.mapScreen;
            const d = s.game.level?.mapData?.();
            // REVEAL THROUGH THE REAL STORE, not through the level.
            //
            // The overworld's visited list lives in `sovereignProgress.overworld`
            // (`getOverworldState().visited`), NOT in the per-dungeon key store —
            // so calling `keyStore.visit()` here revealed nothing and the first
            // capture came back with a one-screen map and a two-entry key. The
            // legend was right; the fixture was lying about what was on screen.
            if (which.startsWith('overworld') && s.patchOverworld) {
                s.patchOverworld({ visited: (d?.screens || []).map((n) => n.id) });
                s.loadLevel('overworld');
                await new Promise((r) => setTimeout(r, 900));
            } else {
                for (const n of (d?.rooms || [])) s.game.level.keyStore?.visit?.(n.id);
            }
            s.game.level.keyStore?.markMapPickup?.();
            map.open(s.game);
            await new Promise((r) => setTimeout(r, 350));
            const png = map.canvas.toDataURL('image/png');
            map.close(s.game);
            return png;
        }, name);
        const b64 = url.split(',')[1];
        const file = path.join(OUT, `${name}.png`);
        fs.writeFileSync(file, Buffer.from(b64, 'base64'));
        console.log(`wrote ${file}  ${(Buffer.from(b64, 'base64').length / 1024).toFixed(1)} KB`);
    }
    console.log(`\nCompare against the other label:  node tests/qa/map-legend-shot.mjs before`);
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
