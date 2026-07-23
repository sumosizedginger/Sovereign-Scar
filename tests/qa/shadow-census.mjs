// Print-only shadow census — how many meshes in each level cast and receive.
//
// Ticket 2 of docs/VISUAL_PLAN.md exists because the answer used to be "37 cast,
// 7 receive, out of 151". Almost nothing in the world could be shadowed, so
// props did not darken under overhangs and enemies did not sit in a doorway's
// shade — which is most of why objects read as pasted on top of the world
// rather than standing in it.
//
// Run from the repo root:  node tests/qa/shadow-census.mjs
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

const server = await startServer(8795);
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
    await page.waitForFunction(() => !!(window.__sovereignScar && window.__sovereignScar.player), { timeout: 25000 });
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
                s.game.bossIntro = null;
                await new Promise((r) => setTimeout(r, 700));
                const c = s.shadowCensus();
                const solid = s.solidShadowCensus();
                const info = s.renderer?.info?.render || {};
                out.push({
                    id: meta.id,
                    ...c,
                    solid: solid.solid,
                    solidRecv: solid.recv,
                    missing: solid.missing,
                    tris: info.triangles ?? 0,
                    calls: info.calls ?? 0,
                    actors: 1 + (s.game.level?.enemies?.length || 0),
                });
            } catch (e) {
                out.push({ id: meta.id, err: String(e) });
            }
        }
        return out;
    });

    console.log('level                 meshes  cast  recv | solid solidRecv  share | discs actors  calls');
    console.log('-'.repeat(94));
    let worstPct = 100;
    const inertTotals = {};
    for (const r of rows) {
        if (r.err) { console.log(`${r.id.padEnd(21)} ERR ${r.err}`); continue; }
        const pct = r.solid ? (100 * r.solidRecv / r.solid) : 100;
        worstPct = Math.min(worstPct, pct);
        for (const [k, v] of Object.entries(r.inert || {})) {
            inertTotals[k] = Math.max(inertTotals[k] || 0, v);
        }
        console.log(
            `${r.id.padEnd(21)} ${String(r.meshes).padStart(6)} ${String(r.cast).padStart(5)}`
            + ` ${String(r.recv).padStart(5)} | ${String(r.solid).padStart(5)}`
            + ` ${String(r.solidRecv).padStart(9)} ${pct.toFixed(0).padStart(5)}%`
            + ` | ${String(r.discs).padStart(5)} ${String(r.actors).padStart(6)}`
            + ` ${String(r.calls).padStart(6)}`
        );
    }
    console.log('-'.repeat(94));
    console.log(`worst SOLID receive share: ${worstPct.toFixed(0)}%`);
    console.log('\nmeshes in neither role (peak count in any one level):');
    for (const [k, v] of Object.entries(inertTotals).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(v).padStart(4)}  ${k}`);
    }

    const missTotals = {};
    for (const r of rows) {
        for (const m of r.missing || []) missTotals[m] = (missTotals[m] || 0) + 1;
    }
    console.log('\nSOLID, non-emissive meshes still not receiving (these are real misses):');
    const misses = Object.entries(missTotals).sort((a, b) => b[1] - a[1]);
    if (!misses.length) console.log('  (none)');
    for (const [k, v] of misses) console.log(`  ${String(v).padStart(4)}  ${k}`);
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
