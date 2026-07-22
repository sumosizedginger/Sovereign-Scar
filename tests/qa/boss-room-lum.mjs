// Boss-room luminance probe. visual-sanity only samples ENTRY rooms, which is
// how Beat 09's boss arena shipped with a near-white bone plaza (0xefe6d0 ≈
// 230/255) that blew out the whole frame. Run from the repo root:
//   node tests/qa/boss-room-lum.mjs
import { startServer, findChromeVerbose, sleep, disableGamepads } from '../harness.mjs';

const BANDS = { crust: [45, 90], abyss: [35, 75] };

const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const puppeteer = await import('puppeteer-core');

const server = await startServer(8796);
let browser;
try {
    browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
    });
    const page = await browser.newPage();
    await disableGamepads(page);
    page.setDefaultTimeout(120000);
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
        () => !!(window.__sovereignScar && window.__sovereignScar.player), { timeout: 25000 });
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
            if (!/^beat-/.test(meta.id)) continue;
            try {
                s.loadLevel(meta.id);
                s.game.bossIntro = null;
                await new Promise((r) => setTimeout(r, 500));
                const level = s.game.level;
                // Find the boss room: the room whose def carries a boss builder.
                // mapData marks the true boss room (`boss: !!room.boss`).
                const md = level.mapData ? level.mapData() : null;
                const rooms = (md && md.rooms) ? md.rooms : [];
                const bossRoom = (rooms.find((r) => r.boss) || {}).id;
                if (bossRoom && level.enterRoom) level.enterRoom(bossRoom, s.game);
                await new Promise((r) => setTimeout(r, 700));
                const a = await s.sampleLuminance();
                const b = await s.sampleLuminance();
                out.push({ id: meta.id, room: bossRoom || '?', mood: s.mood.mood, lum: Math.max(a, b) });
            } catch (e) {
                out.push({ id: meta.id, error: String(e && e.message || e) });
            }
        }
        return out;
    });

    let bad = 0;
    for (const r of rows) {
        if (r.error) { console.log(r.id.padEnd(20), 'ERR', r.error); bad++; continue; }
        const band = BANDS[r.mood] || BANDS.crust;
        const ok = r.lum >= band[0] && r.lum <= band[1];
        if (!ok) bad++;
        console.log(
            r.id.padEnd(20), String(r.room).padEnd(14), r.mood.padEnd(6),
            'lum=' + r.lum.toFixed(1), 'band=[' + band + ']', ok ? 'OK' : '<<< OUT OF BAND');
    }
    console.log(bad ? `\n${bad} boss room(s) out of band` : '\nAll boss rooms in band');
    process.exitCode = bad ? 1 : 0;
} catch (e) {
    console.error('ERROR', e);
    process.exitCode = 2;
} finally {
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
}
