// tests/qa/stereo-field.mjs — print where sounds actually land, left to right.
//
//   node tests/qa/stereo-field.mjs
//
// The unit spec proves `spatialize` builds a StereoPannerNode carrying the right
// signed pan. That is a claim about a graph. This is the claim that matters —
// that the resulting SIGNAL is louder in one ear than the other, by an amount
// that tracks where the thing is standing — and the only way to settle it is to
// render two channels and measure them.
//
// It renders through the REAL `spatialize()` with the REAL listener, at the
// half-width measured from the live camera rig, for a source walked across the
// frame. The voice under it is a plain noise burst on purpose: the panner does
// not care what it is panning, and a made-up voice keeps the reading about
// placement rather than about the sound design of any one effect.
//
// TRAP 2. An OfflineAudioContext that stops early has a wonderful, meaningless
// balance figure — the tail it never rendered is silence in both channels, and
// silence is perfectly balanced. So the render length is checked against the
// buffer, and every row prints the frames it actually got, BEFORE any statistic
// is worth reading.

import { startServer, findChromeVerbose } from '../harness.mjs';

const puppeteer = (await import('puppeteer-core')).default;
const chrome = findChromeVerbose();
if (!chrome.path) { console.error('no chrome'); process.exit(2); }
const server = await startServer(8793);
const browser = await puppeteer.launch({
    executablePath: chrome.path, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
try {
    const page = await browser.newPage();
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window.__sovereignScar?.player), { timeout: 30000 });

    const result = await page.evaluate(async () => {
        const sp = await import('/src/audio/spatial.js');
        const rig = window.__sovereignScar.cameraRig;
        // The frame the game is really running, not a number typed here.
        const halfWidth = rig.viewHalfWidth();
        const rate = 22050;
        const seconds = 0.25;
        const frames = Math.ceil(rate * seconds);

        // Walk a source across the frame and a good way past both edges.
        const offsets = [-3, -2, -1.5, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 1.5, 2, 3]
            .map((k) => +(k * halfWidth).toFixed(2));

        const rows = [];
        for (const dx of offsets) {
            const ctx = new OfflineAudioContext(2, frames, rate);
            sp.setListener(0, 0, halfWidth);

            // One noise burst, routed exactly as a real effect is routed.
            const buf = ctx.createBuffer(1, frames, rate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            // Read the placement and build the graph in the SAME synchronous
            // run as setListener. The game's frame loop republishes the
            // listener every frame from the live camera, so anything computed
            // after an `await` is measured against the player's position
            // instead of this probe's — which is exactly what the first draft
            // did, and it reported pan -0.850 / gain 0.350 for all thirteen
            // rows while the rendered audio underneath them was correct.
            const place = sp.at({ x: dx, z: 0 }, () => sp.placement());
            const head = sp.at({ x: dx, z: 0 }, () => sp.spatialize(ctx, ctx.destination));
            src.connect(head);
            src.start(0);

            const out = await ctx.startRendering();
            const L = out.getChannelData(0);
            const R = out.getChannelData(1);
            const rms = (a) => {
                let s = 0;
                for (let i = 0; i < a.length; i++) s += a[i] * a[i];
                return Math.sqrt(s / a.length);
            };
            const l = rms(L), r = rms(R);
            rows.push({
                dx, pan: place.pan, gain: place.gain,
                l, r,
                // -1 fully left, +1 fully right.
                balance: (r - l) / (r + l || 1),
                renderedFrames: out.length,
                // Trap 2: did the render actually produce signal to its end?
                tailRms: rms(L.slice(Math.floor(L.length * 0.9))),
            });
            sp.clearListener();
        }

        // The unplaced control: same voice, no scope. Must be dead centre.
        const ctx = new OfflineAudioContext(2, frames, rate);
        const buf = ctx.createBuffer(1, frames, rate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(sp.spatialize(ctx, ctx.destination));
        src.start(0);
        const out = await ctx.startRendering();
        const rms = (a) => {
            let s = 0;
            for (let i = 0; i < a.length; i++) s += a[i] * a[i];
            return Math.sqrt(s / a.length);
        };
        const cl = rms(out.getChannelData(0)), cr = rms(out.getChannelData(1));

        // And the same walk again with monoAudio on. The owner of this game
        // hears in one ear, so "does the mono path actually stay centred" is
        // not a nicety — it is whether the game is playable for them.
        const settings = await import('/src/engine/settings.js');
        const wasMono = settings.getSetting('monoAudio');
        settings.setSetting('monoAudio', true);
        const monoRows = [];
        for (const dx of offsets) {
            const c = new OfflineAudioContext(2, frames, rate);
            const b = c.createBuffer(1, frames, rate);
            const bd = b.getChannelData(0);
            for (let i = 0; i < frames; i++) bd[i] = Math.random() * 2 - 1;
            const s = c.createBufferSource();
            s.buffer = b;
            sp.setListener(0, 0, halfWidth);
            const place = sp.at({ x: dx, z: 0 }, () => sp.placement());
            s.connect(sp.at({ x: dx, z: 0 }, () => sp.spatialize(c, c.destination)));
            s.start(0);
            const o = await c.startRendering();
            const l = rms(o.getChannelData(0)), r = rms(o.getChannelData(1));
            monoRows.push({ dx, pan: place.pan, gain: place.gain, l, r,
                balance: (r - l) / (r + l || 1), renderedFrames: o.length });
            sp.clearListener();
        }
        settings.setSetting('monoAudio', wasMono);

        return {
            halfWidth, frames, rows, monoRows,
            control: { l: cl, r: cr, balance: (cr - cl) / (cr + cl || 1) },
        };
    });

    const { halfWidth, frames, rows, monoRows, control } = result;
    console.log(`\n=== stereo field — frame half-width ${halfWidth.toFixed(2)} world units `
        + `(so the visible frame is ${(halfWidth * 2).toFixed(1)} across) ===`);
    console.log(`    ${frames} frames expected per render\n`);

    // Trap 2 first. Nothing below means anything if a render stopped early.
    const short = rows.filter((r) => r.renderedFrames !== frames);
    const silentTail = rows.filter((r) => r.tailRms < 1e-4);
    console.log(`  renders that reached their full length: ${rows.length - short.length}/${rows.length}`);
    console.log(`  renders with signal in the last 10%:    ${rows.length - silentTail.length}/${rows.length}`);
    if (short.length || silentTail.length) {
        console.log('  !! a truncated render is perfectly balanced and means nothing — stop here');
    }

    console.log('\n   offset    pan    gain     L rms     R rms   balance   picture');
    for (const r of rows) {
        // 21 columns, the listener in the middle.
        const col = Math.round((r.balance + 1) / 2 * 20);
        const bar = Array.from({ length: 21 }, (_, i) => (i === col ? '#' : (i === 10 ? '|' : '.'))).join('');
        console.log(
            `  ${r.dx.toFixed(1).padStart(7)}  ${r.pan.toFixed(3).padStart(6)}  `
            + `${r.gain.toFixed(3)}  ${r.l.toFixed(5)}  ${r.r.toFixed(5)}  `
            + `${r.balance.toFixed(3).padStart(7)}   ${bar}`
        );
    }
    console.log(`\n  unplaced control: L ${control.l.toFixed(5)}  R ${control.r.toFixed(5)}`
        + `  balance ${control.balance.toFixed(4)}  (must be ~0)`);

    // The two ways this feature dies quietly, stated as numbers.
    const edge = rows.find((r) => Math.abs(r.dx - halfWidth) < 0.01);
    const farOff = rows[rows.length - 1];
    console.log(`\n  at the frame edge: balance ${edge ? edge.balance.toFixed(3) : 'n/a'}`
        + '  — should be strongly to one side, or placement carries no information');
    console.log(`  three frames out:  gain ${farOff.gain.toFixed(3)}`
        + '  — should still be clearly audible, or the rolloff has deleted the cue');

    // ── monoAudio ──────────────────────────────────────────────────────────
    // The number that matters to a one-eared player: how much of a left-side
    // cue reaches the right ear. In stereo it is ~8% of the unplaced level.
    console.log('\n=== monoAudio ON — the same walk, for a player with one ear ===');
    console.log('\n   offset    pan    gain     L rms     R rms   balance');
    for (const r of monoRows) {
        console.log(
            `  ${r.dx.toFixed(1).padStart(7)}  ${r.pan.toFixed(3).padStart(6)}  `
            + `${r.gain.toFixed(3)}  ${r.l.toFixed(5)}  ${r.r.toFixed(5)}  `
            + `${r.balance.toFixed(3).padStart(7)}`
        );
    }
    const worstMono = monoRows.reduce((a, b) => (Math.abs(b.balance) > Math.abs(a.balance) ? b : a));
    console.log(`\n  worst channel imbalance in mono: ${worstMono.balance.toFixed(5)}`
        + ` at offset ${worstMono.dx}  — must be ~0 in EVERY row`);

    // The whole point: what a one-eared player loses, with and without mono.
    const edgeStereo = rows.find((r) => Math.abs(r.dx + halfWidth) < 0.01);
    const edgeMono = monoRows.find((r) => Math.abs(r.dx + halfWidth) < 0.01);
    if (edgeStereo && edgeMono) {
        const unplaced = control.l;
        console.log('\n  A cue at the LEFT frame edge, as heard by a right-ear-only player:');
        console.log(`    stereo: R rms ${edgeStereo.r.toFixed(5)}`
            + `  (${(edgeStereo.r / unplaced * 100).toFixed(1)}% of an unplaced sound`
            + `, ${(20 * Math.log10(edgeStereo.r / unplaced)).toFixed(1)} dB) — effectively gone`);
        console.log(`    mono:   R rms ${edgeMono.r.toFixed(5)}`
            + `  (${(edgeMono.r / unplaced * 100).toFixed(1)}%`
            + `, ${(20 * Math.log10(edgeMono.r / unplaced)).toFixed(1)} dB) — audible, and still `
            + 'carrying distance in its level');
    }
} finally {
    await browser.close();
    await server.close();
}
