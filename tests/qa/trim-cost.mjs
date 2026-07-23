// Print-only — what the bake-time trim actually costs, measured with it on and
// off in the same session. Run: node tests/qa/trim-cost.mjs
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';
const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');
const server = await startServer(8791);
let browser;
try {
    browser = await puppeteer.default.launch({ executablePath: chrome.path, headless: 'new',
        args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader'] });
    const page = await browser.newPage();
    await disableGamepads(page);
    page.setDefaultTimeout(60000);
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });
    await page.mouse.click(400,300); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await sleep(300);
    const rows = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.game.atTitle=false; s.game.paused=false; s.menu.close();
        const out = [];
        for (const meta of s.LEVELS) {
            const one = { id: meta.id };
            for (const trim of [true, false]) {
                s.__trimOff = !trim;
                // Bounce through the overworld between samples. A non-prebaked
                // dungeon disposes rooms more than one grid step away, so
                // loading the same level twice in a row leaves a DIFFERENT set
                // of rooms baked and the two samples are not comparable —
                // that read as trim removing 20k triangles from Beat 01.
                s.loadLevel('overworld');
                await new Promise(r => setTimeout(r, 400));
                s.loadLevel(meta.id);
                s.game.bossIntro = null;
                await new Promise(r => setTimeout(r, 800));
                const i = s.renderer?.info?.render || {};
                one[trim ? 'on' : 'off'] = { tris: i.triangles ?? 0, calls: i.calls ?? 0 };
            }
            s.__trimOff = false;
            out.push(one);
        }
        return out;
    });
    console.log('level                    tris(off)   tris(on)   delta    calls(off) calls(on)');
    console.log('-'.repeat(82));
    let tOff=0,tOn=0;
    for (const r of rows) {
        tOff += r.off.tris; tOn += r.on.tris;
        const d = r.on.tris - r.off.tris;
        console.log(`${r.id.padEnd(22)} ${String(r.off.tris).padStart(9)} ${String(r.on.tris).padStart(10)}`
          + ` ${(d>=0?'+':'')+d} `.padStart(9)
          + ` ${String(r.off.calls).padStart(9)} ${String(r.on.calls).padStart(9)}`);
    }
    console.log('-'.repeat(82));
    console.log(`total triangles: ${tOff} -> ${tOn}  (+${(100*(tOn-tOff)/Math.max(1,tOff)).toFixed(1)}%)`);
} finally { try{await browser?.close();}catch(_){} await server.close(); }
