// tests/qa/audio-envelope.mjs — print the loudness of the music over time.
//
// The spec asserts the score falls to silence between notes. This draws the
// envelope it is asserting about, because a percentile can pass for the wrong
// reason: a render that is silent for its second half has a wonderful 5th
// percentile and is completely broken. Eyes on the shape, then trust the gate.
//
//   node tests/qa/audio-envelope.mjs [trackId ...]

import { startServer, findChromeVerbose } from '../harness.mjs';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['crust', 'boss'];

const puppeteer = (await import('puppeteer-core')).default;
const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const server = await startServer(8792);
const browser = await puppeteer.launch({
    executablePath: chrome.path, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
try {
    const page = await browser.newPage();
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    // An offline render in a page that has never had a live AudioContext comes
    // back truncated in headless Chrome. Wait for the game to be up first.
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });
    const rows = await page.evaluate(async (trackIds) => {
        const score = await import('/src/game/audio/score.js');
        const rate = 22050;
        const out = [];
        for (const id of trackIds) {
            const buf = await score.renderOffline(OfflineAudioContext, id, 8, 0, rate);
            const d = buf.getChannelData(0);
            const n = Math.floor(rate * 0.05);   // 50 ms columns
            const env = [];
            for (let i = 0; i + n < d.length; i += n) {
                let s = 0;
                for (let j = 0; j < n; j++) s += d[i + j] * d[i + j];
                env.push(Math.sqrt(s / n));
            }
            out.push({ id, env, bpm: (await import('/src/game/audio/tracks.js')).resolveTrack(id).bpm });
        }
        return out;
    }, ids);

    const BLOCKS = ' ▁▂▃▄▅▆▇█';
    for (const { id, env, bpm } of rows) {
        const peak = Math.max(...env);
        console.log(`\n=== ${id} — ${bpm}bpm, 8s at 50ms columns, peak RMS ${peak.toFixed(4)} ===`);
        console.log('  ' + env.map((v) => BLOCKS[Math.min(8, Math.round((v / peak) * 8))]).join(''));
        const silent = env.filter((v) => v < peak * 0.02).length;
        console.log(`  ${silent}/${env.length} columns below 2% of peak`
            + `  ·  min ${Math.min(...env).toExponential(2)}`);
    }
} finally {
    await browser.close();
    await server.close();
}
