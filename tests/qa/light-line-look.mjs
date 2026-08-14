// tests/qa/light-line-look.mjs — photograph the Light Caster's standing line.
//
//   node tests/qa/light-line-look.mjs [outDir]
//
// PRINT-ONLY, and it writes PNGs. This is one of the few questions where a
// still frame is fair evidence: "can I see the line" is a picture question, and
// no number I can compute off a material answers it.
//
// WHY IT EXISTS
//
// The line shipped at `emissiveIntensity: 2.2` — four times the project's
// ceiling for any emissive part, against a bloom threshold of 0.85. The owner
// reported it as "WAY too bright", it was dropped to 0.5, and the next report
// was "now no line is being left by the light caster".
//
// The line is 0.15 x 0.15 units, seen from a camera about 17 units up. That is
// a hairline. It was never really visible AS GEOMETRY — it was visible as
// BLOOM, and dropping it under the bloom threshold did not dim it, it deleted
// it. Brightness and thickness are not interchangeable, and the first fix
// traded one invisible state for another.
//
// So this sweeps both axes and puts them on disk side by side, because the
// choice between them is a judgement about a picture.

import fs from 'fs';
import path from 'path';
import { startServer, findChromeVerbose, disableGamepads, sleep } from '../harness.mjs';

const OUT = process.argv[2] || 'docs/media/light-line';

/**
 * (label, boxThickness, emissiveIntensity, lifeFraction).
 *
 * LIFE FRACTION IS THE AXIS THE FIRST VERSION OF THIS PROBE MISSED. It pinned
 * `life = 999` so the fade factor `a = life / maxLife` was always 1.0, which
 * photographs the best frame of the line's existence and calls it "the line".
 * The report is that no line is LEFT — a question about the other 90% of its
 * lifetime — and the instrument was structurally unable to see it.
 *
 * It matters more than it looks. `transparent` used to be assigned inside
 * `update()` on a material built without it, and three.js will not honour a
 * late `transparent` flip without `needsUpdate`, so the shipped line very
 * likely never faded at all: it was a solid bar that popped out. Setting
 * `transparent: true` at construction made the fade real for the first time,
 * and a real fade on top of a 4.4x brightness cut is a line that is gone almost
 * as soon as it arrives.
 */
const CASES = [
    ['g-fixed-full', null, null, 1.0],
    ['h-fixed-half-life', null, null, 0.5],
    ['i-fixed-quarter', null, null, 0.25],
    ['j-fixed-last-tenth', null, null, 0.1],
];

async function main() {
    const chrome = findChromeVerbose();
    if (!chrome.path) { console.error('No Chrome'); process.exit(2); }
    const puppeteer = await import('puppeteer-core');
    const server = await startServer(8843);
    fs.mkdirSync(OUT, { recursive: true });

    const browser = await puppeteer.default.launch({
        executablePath: chrome.path,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--window-size=1280,720'],
    });
    const rows = [];
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await disableGamepads(page);
        page.setDefaultTimeout(90000);
        page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));

        await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__sovereignScar?.menu), { timeout: 30000 });

        await page.evaluate(async () => {
            const S = window.__sovereignScar;
            S.startNewGame?.();
            await new Promise((r) => setTimeout(r, 400));
            await S.loadLevel('beat-12-pyre');
            await new Promise((r) => setTimeout(r, 1200));
            const p = S.player;
            p.inventory.addWeapon?.('light_caster');
            p.inventory.setWeapon?.('light_caster');
            p.inventory.grantItem?.('vector_staff');
            S.hud?.el && (S.hud.el.style.display = 'none');   // the line, not the chrome
        });
        await sleep(600);

        for (const [label, thickness, ei, frac] of CASES) {
            const stat = await page.evaluate(async (thick, intensity, lifeFrac) => {
                const S = window.__sovereignScar;
                const THREE = await import('/lib/three/three.module.min.js');
                const lvl = S.game.level, sys = lvl.lightLines, p = S.player;
                // Clear whatever is live, fire one fresh line, then restyle it.
                for (const l of [...sys.lines]) sys._disposeLine(l);
                sys.lines.length = 0;
                p.attackCd = 0;
                p.tryAttack(lvl.enemies || [], lvl.destructibles || []);
                const L = sys.lines[0];
                if (!L) return { fired: false };
                // Hold it AT A CHOSEN POINT IN ITS LIFE, then run one update so the
                // real fade arithmetic writes opacity and emissive for that moment.
                L.maxLife = 1.8;
                L.life = 1.8 * lifeFrac;
                const len = L.range;
                if (thick != null) {
                    L.mesh.geometry.dispose();
                    L.mesh.geometry = new THREE.BoxGeometry(thick, thick, len);
                }
                // Drive the SHIPPED update so the shipped fade curve is what is
                // photographed. dt ~ 0 so life does not move off the chosen point.
                sys.update(1e-6, []);
                const a = L.mat.opacity;
                return {
                    fade: +a.toFixed(2),
                    shownEmissive: +L.mat.emissiveIntensity.toFixed(3),
                    fired: true,
                    thickness: thick ?? 'shipped',
                    emissiveIntensity: intensity ?? 'shipped',
                    pos: L.mesh.position.toArray().map((n) => +n.toFixed(2)),
                };
            }, thickness, ei, frac);

            await sleep(500);
            const file = path.join(OUT, `${label}.png`);
            await page.screenshot({ path: file });
            rows.push({ label, ...stat, file });
            console.log(`  ${label.padEnd(22)} thickness ${String(thickness).padEnd(5)} `
                + `emissive ${String(ei).padEnd(4)} fade ${String(stat.fade).padEnd(5)} `
                + `shown ${String(stat.shownEmissive).padEnd(6)} -> ${file}`);
        }
    } finally {
        await browser.close();
        server.close?.();
    }

    console.log('\n=== light line: thickness x brightness ===');
    console.log('  a is what shipped and was reported "WAY too bright".');
    console.log('  b is the current state and was reported as no line at all.');
    console.log('  c-f vary the two axes independently.');
    console.log(`\n  ${rows.length} frames written to ${OUT}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
