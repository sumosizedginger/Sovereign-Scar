// tests/audio-render-e2e.spec.mjs — is there a drone under the music?
//
// Every audio check this project had before could only prove that sound was
// being produced. That is not the claim in dispute. A player heard "a drone
// under the music", and they were right: three separate sustained sources were
// running under a score that had been written specifically to replace a drone
// soundtrack. Two of them were outside the score engine entirely, which is why
// composing better music did nothing about it.
//
// "There is a hum underneath" is a claim about the shape of the signal over
// time, so the only way to settle it is to look at the signal. This renders the
// real scheduler through the real voices into an OfflineAudioContext — no sound
// card, no listening, deterministic — and measures the one thing that separates
// a score from a drone: whether the level ever actually falls to silence.
//
// A drone has a floor that never drops. Music breathes.

import { startServer, findChromeVerbose, disableGamepads } from './harness.mjs';

const RATE = 22050;
const WINDOW = 0.02;   // 20 ms RMS windows — short enough to see between notes

/** Track ids to render. One of each base piece, plus two variations. */
const TRACKS = ['crust', 'abyss', 'boss', 'leviathan', 'beat-02-spindle', 'beat-08-bone'];

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
        t.ok('chrome available (skipped)', true, 'no chrome');
        return;
    }

    const server = await startServer(8793);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: chrome.path,
            headless: 'new',
            args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
        });
        const page = await browser.newPage();
        await disableGamepads(page);
        page.setDefaultTimeout(60000);
        // OfflineAudioContext needs no audio hardware and no user gesture, so
        // this never touches the game's live context or its autoplay gate.
        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // Wait for the game to be up before rendering. Not politeness: an
        // offline render started in a page that has never had a live
        // AudioContext comes back TRUNCATED — the first render stopped at 2.6 s
        // of an 8 s buffer. That truncation made this spec pass, and pass
        // beautifully, because five seconds of digital silence is an
        // outstanding 5th percentile. A gate that can pass for the wrong reason
        // is worse than no gate; `renders to the end` below is the assertion
        // that turns that failure back into a failure.
        await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });

        const results = await page.evaluate(async ({ ids, rate, win }) => {
            const score = await import('/src/game/audio/score.js');
            const out = [];
            for (const id of ids) {
                const buf = await score.renderOffline(OfflineAudioContext, id, 8, 0, rate);
                const d = buf.getChannelData(0);
                const n = Math.floor(rate * win);

                // RMS per window, skipping the first half-second: the convolver and
                // the delay have not filled yet, so it is quiet for reasons that
                // have nothing to do with the composition.
                const skip = Math.floor(rate * 0.5);
                const rms = [];
                for (let i = skip; i + n < d.length; i += n) {
                    let s = 0;
                    for (let j = 0; j < n; j++) s += d[i + j] * d[i + j];
                    rms.push(Math.sqrt(s / n));
                }
                // Loudest window in the last fifth of the buffer, measured
                // before sorting throws the time axis away — this is what
                // proves the render reached the end.
                const tailFrom = Math.floor(rms.length * 0.8);
                const tail = Math.max(...rms.slice(tailFrom));

                rms.sort((a, b) => a - b);
                const at = (q) => rms[Math.min(rms.length - 1, Math.floor(rms.length * q))];
                out.push({
                    id,
                    windows: rms.length,
                    p05: at(0.05),
                    p50: at(0.5),
                    p95: at(0.95),
                    peak: rms[rms.length - 1],
                    tail,
                });
            }
            return out;
        }, { ids: TRACKS, rate: RATE, win: WINDOW });

        for (const r of results) {
            const floorRatio = r.p05 / (r.peak || 1e-9);
            const crest = r.p95 / (r.p05 || 1e-9);

            t.ok(`${r.id} renders audio at all`,
                r.peak > 0.002, `peak RMS ${r.peak.toFixed(5)}`);

            // The music must still be playing in the final fifth. Without this
            // a truncated render scores perfectly on every gate below it.
            t.ok(`${r.id} renders to the end`,
                r.tail > r.peak * 0.25,
                `loudest window in the last fifth is ${(r.tail / r.peak * 100).toFixed(0)}% of peak`);

            // THE DRONE TEST. In the quietest 5% of windows the music must have all
            // but stopped. A sustained source under everything puts a floor beneath
            // this number that no amount of composition can lift off it — the old
            // arrangement sat at roughly a third of peak here and never went lower,
            // which is precisely what "a hum under the melody" sounds like.
            t.ok(`${r.id} falls to near-silence between notes`,
                floorRatio < 0.08,
                `quiet-window RMS is ${(floorRatio * 100).toFixed(1)}% of peak`);

            // And the gap between loud and quiet has to be wide. A track can have a
            // low floor and still be a wash if it spends no time near it, so this
            // measures the dynamic range the arrangement actually uses.
            t.ok(`${r.id} has real dynamics, not a constant level`,
                crest > 6, `p95/p05 = ${crest.toFixed(1)}x`);

            t.ok(`${r.id} is not clipping`, r.peak < 0.45, `peak RMS ${r.peak.toFixed(4)}`);
        }
    } finally {
        if (browser) await browser.close();
        await server.close();
    }
}
