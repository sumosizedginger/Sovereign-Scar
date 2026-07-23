// Print-only environment probe — is there actually an environment map, and does
// it survive a mood flip?
//
// `scene.environment` was null for the entire life of the project, which is why
// materials.js capped metalness at 0.12: a metal with nothing to reflect reads
// dark. PMREM generation is also allowed to FAIL silently on some headless /
// ANGLE configurations (the game must still render rather than die at a level
// load), so "the code path runs" is not evidence the map exists. This prints
// the actual scene state.
//
// Run from the repo root:  node tests/qa/env-probe.mjs
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

const server = await startServer(8793);
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
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 25000 });
    await page.mouse.click(400, 300);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sleep(400);

    const r = await page.evaluate(async () => {
        const s = window.__sovereignScar;
        s.game.atTitle = false; s.game.paused = false; s.menu.close();
        s.loadLevel('beat-01-crypt');
        await new Promise((r) => setTimeout(r, 700));

        const snap = () => ({
            mood: s.mood.mood,
            env: !!s.scene.environment,
            uuid: s.scene.environment?.uuid?.slice(0, 8) || null,
            intensity: s.scene.environmentIntensity,
        });

        const crust = snap();
        let maxMetal = 0, envMapInt = null, standard = 0;
        s.scene.traverse((o) => {
            if (!o.isMesh || !o.material?.isMeshStandardMaterial) return;
            standard++;
            maxMetal = Math.max(maxMetal, o.material.metalness ?? 0);
            if (envMapInt === null && o.material.envMapIntensity != null) {
                envMapInt = o.material.envMapIntensity;
            }
        });

        s.mood.apply('abyss', { audio: false });
        await new Promise((r) => setTimeout(r, 300));
        const abyss = snap();

        s.mood.apply('crust', { audio: false });
        await new Promise((r) => setTimeout(r, 300));
        const back = snap();

        return { crust, abyss, back, maxMetal, envMapInt, standard };
    });

    console.log(JSON.stringify(r, null, 2));
    console.log('');
    console.log(`environment installed:      ${r.crust.env ? 'YES' : 'NO — PMREM failed or was never called'}`);
    console.log(`mood flip swaps the map:    ${r.crust.uuid !== r.abyss.uuid ? 'YES' : 'NO'}`);
    console.log(`flipping back is cached:    ${r.crust.uuid === r.back.uuid ? 'YES' : 'NO — rebuilt, leaking'}`);
    console.log(`level material envMapInt:   ${r.envMapInt}`);
    console.log(`peak metalness in scene:    ${r.maxMetal}`);
} finally {
    try { await browser?.close(); } catch (_) {}
    await server.close();
}
