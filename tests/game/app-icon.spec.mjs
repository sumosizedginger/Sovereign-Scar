// tests/game/app-icon.spec.mjs — the desktop build ships OUR icon, not Electron's.
//
// THE PROBLEM THIS PINS
//
// For the life of the desktop shell, `electron-builder` logged
// "default Electron icon is used" and produced installers wearing the generic
// Electron diamond. Nothing failed. A build that quietly ships the wrong icon
// looks exactly like a build that ships the right one, right up until it is on
// somebody's taskbar.
//
// So there are three separate things to hold, and missing any one of them puts
// the diamond back:
//
//   1. `assets/icon.ico` is a real, well-formed, multi-size ICO with a 256px
//      entry — electron-builder rejects or ignores ICOs without one.
//   2. `package.json` actually POINTS the Windows build at it, and packages
//      `assets/icon.png` for the un-packaged `npm run desktop` window.
//   3. The committed binary still matches `scripts/make-icon.mjs`.
//
// (3) is the one worth the most. A binary checked into a repo with no way to
// prove it came from its generator is a binary that drifts: someone opens it in
// an editor, saves, and the script silently stops being the source of truth.
// This regenerates from the real script and compares the DECODED PIXELS, so the
// art and the artefact cannot disagree — while a comparison of the compressed
// bytes would have failed on any machine whose zlib packs the same image
// differently, which is a thing zlib is entitled to do.
//
// What this CANNOT tell you is whether the icon looks like anything. That was
// judged by rendering it at all five sizes and looking at them, which is the
// right instrument for a still image and is recorded in the script's header.

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIcon, ICON_SIZES } from '../../scripts/make-icon.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ICO = path.join(ROOT, 'assets', 'icon.ico');
const PNG = path.join(ROOT, 'assets', 'icon.png');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads the ICO directory, and the IHDR of each entry, without trusting either. */
function readIco(buf) {
    const reserved = buf.readUInt16LE(0);
    const type = buf.readUInt16LE(2);
    const count = buf.readUInt16LE(4);
    const entries = [];
    for (let i = 0; i < count; i++) {
        const at = 6 + i * 16;
        const declared = buf[at] === 0 ? 256 : buf[at];
        const len = buf.readUInt32LE(at + 8);
        const off = buf.readUInt32LE(at + 12);
        const body = buf.slice(off, off + len);
        const isPng = body.slice(0, 8).equals(PNG_SIG);
        entries.push({
            declared,
            declaredHeight: buf[at + 1] === 0 ? 256 : buf[at + 1],
            bpp: buf.readUInt16LE(at + 6),
            len,
            off,
            end: off + len,
            isPng,
            // Every entry here is a PNG, so IHDR is at a fixed offset.
            realW: isPng ? body.readUInt32BE(16) : -1,
            realH: isPng ? body.readUInt32BE(20) : -1,
        });
    }
    return { reserved, type, count, entries };
}

export function run(t) {
    // ── 1. The files exist at all ──────────────────────────────────────────
    t.ok('assets/icon.ico is committed', fs.existsSync(ICO));
    t.ok('assets/icon.png is committed', fs.existsSync(PNG));
    if (!fs.existsSync(ICO) || !fs.existsSync(PNG)) return;

    const icoBuf = fs.readFileSync(ICO);
    const pngBuf = fs.readFileSync(PNG);

    // ── 2. The ICO is well-formed, not just present ────────────────────────
    const ico = readIco(icoBuf);
    t.ok('ICO header reserved field is 0', ico.reserved === 0, String(ico.reserved));
    t.ok('ICO type is 1 (icon, not cursor)', ico.type === 1, String(ico.type));
    t.ok(`ICO declares ${ICON_SIZES.length} entries`,
        ico.count === ICON_SIZES.length, `${ico.count}`);

    const sizes = ico.entries.map((e) => e.declared);
    t.ok('ICO carries exactly the intended sizes',
        JSON.stringify(sizes) === JSON.stringify(ICON_SIZES), sizes.join('/'));
    t.ok('ICO includes a 256px entry — electron-builder requires one',
        sizes.includes(256), sizes.join('/'));

    for (const e of ico.entries) {
        t.ok(`the ${e.declared}px entry is a PNG`, e.isPng);
        // The trap this catches: a directory that says 32 in front of a 64px
        // image. Windows believes the directory and renders a mess.
        t.ok(`the ${e.declared}px entry's IHDR agrees with the directory`,
            e.realW === e.declared && e.realH === e.declaredHeight,
            `dir ${e.declared}x${e.declaredHeight}, png ${e.realW}x${e.realH}`);
        t.ok(`the ${e.declared}px entry is square`, e.declared === e.declaredHeight);
        t.ok(`the ${e.declared}px entry declares 32bpp`, e.bpp === 32, String(e.bpp));
        t.ok(`the ${e.declared}px entry lies inside the file`,
            e.off >= 6 + ico.count * 16 && e.end <= icoBuf.length,
            `${e.off}..${e.end} of ${icoBuf.length}`);
    }

    // No gaps and no overlaps — offsets that merely happen to be in range can
    // still point at each other's data.
    const ordered = [...ico.entries].sort((a, b) => a.off - b.off);
    let contiguous = ordered[0].off === 6 + ico.count * 16;
    for (let i = 1; i < ordered.length; i++) {
        if (ordered[i].off !== ordered[i - 1].end) contiguous = false;
    }
    t.ok('ICO entry data is contiguous and covers the file',
        contiguous && ordered[ordered.length - 1].end === icoBuf.length);

    t.ok('assets/icon.png is a PNG', pngBuf.slice(0, 8).equals(PNG_SIG));
    t.ok('assets/icon.png is 256x256',
        pngBuf.readUInt32BE(16) === 256 && pngBuf.readUInt32BE(20) === 256,
        `${pngBuf.readUInt32BE(16)}x${pngBuf.readUInt32BE(20)}`);

    // ── 3. The committed art still comes from the script ───────────────────
    // Both directions matter: edit the art and forget to run `npm run icon`,
    // or hand-edit the binary and orphan the script. Either one fails here.
    //
    // This compares DECODED PIXELS, not the compressed bytes, and the
    // difference is the whole point. `zlib.deflateSync` is not contractually
    // identical across zlib versions — Node has changed the bundled zlib, and
    // some builds ship zlib-ng — so a byte comparison would fail on a
    // reviewer's machine for a reason that has nothing to do with the icon. The
    // invariant worth holding is "the picture is the same picture".
    const fresh = buildIcon();

    /**
     * Decodes one of OUR PNGs, returning null rather than throwing.
     *
     * The null matters. A corrupt or truncated container makes `inflateSync`
     * raise, and an exception here does not fail this spec — it kills the whole
     * run, so one bad byte in a committed binary would take every other
     * assertion in the suite down with it and report nothing about the cause.
     * The counterfactual sweep found exactly that, twice.
     */
    function pixels(png, label) {
        try {
            const w = png.readUInt32BE(16);
            const h = png.readUInt32BE(20);
            const idat = [];
            let p = 8;
            while (p + 12 <= png.length) {
                const len = png.readUInt32BE(p);
                if (p + 12 + len > png.length) break;      // truncated
                if (png.slice(p + 4, p + 8).toString('ascii') === 'IDAT') {
                    idat.push(png.slice(p + 8, p + 8 + len));
                }
                p += 12 + len;
            }
            const raw = zlib.inflateSync(Buffer.concat(idat));
            const stride = w * 4;
            if (raw.length !== (stride + 1) * h) return null;
            const out = Buffer.alloc(stride * h);
            let allZeroFilter = true;
            for (let y = 0; y < h; y++) {
                if (raw[y * (stride + 1)] !== 0) allZeroFilter = false;
                raw.copy(out, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
            }
            // If this ever trips, the decoder above is wrong rather than the
            // art, and a green comparison below would mean nothing.
            t.ok(`${label} uses filter 0 on every scanline, as this decoder assumes`,
                allZeroFilter);
            return { w, h, out };
        } catch (e) {
            t.ok(`${label} decodes at all`, false, String(e && e.message));
            return null;
        }
    }

    const freshIco = readIco(fresh.ico);   // `ico` above is the committed one
    t.ok('the committed ICO has the same entry count as a fresh build',
        ico.count === freshIco.count, `${ico.count} vs ${freshIco.count}`);

    for (let i = 0; i < Math.min(ico.count, freshIco.count); i++) {
        const a = ico.entries[i];
        const b = freshIco.entries[i];
        const pa = pixels(icoBuf.slice(a.off, a.end), `committed ${a.declared}px`);
        const pb = pixels(fresh.ico.slice(b.off, b.end), `rebuilt ${b.declared}px`);
        t.ok(`the ${a.declared}px art matches scripts/make-icon.mjs`,
            !!pa && !!pb && pa.w === pb.w && pa.h === pb.h && pa.out.equals(pb.out),
            pa && pb ? `${pa.w}x${pa.h} vs ${pb.w}x${pb.h}` : 'undecodable');
    }

    const pngA = pixels(pngBuf, 'committed icon.png');
    const pngB = pixels(fresh.png, 'rebuilt icon.png');
    t.ok('assets/icon.png art matches scripts/make-icon.mjs',
        !!pngA && !!pngB && pngA.out.equals(pngB.out));

    // The generator is deterministic, or the checks above are a coin flip.
    // Byte equality is fair to demand here: same process, same zlib.
    const again = buildIcon();
    t.ok('the generator is deterministic across runs in one process',
        again.ico.equals(fresh.ico) && again.png.equals(fresh.png));

    // Importing the script must not write anything — the spec runs it twice.
    t.ok('importing the generator did not rewrite the committed files',
        fs.readFileSync(ICO).equals(icoBuf) && fs.readFileSync(PNG).equals(pngBuf));

    // ── 4. The build is actually pointed at it ─────────────────────────────
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    t.ok('package.json build.win.icon points at the committed .ico',
        pkg.build?.win?.icon === 'assets/icon.ico', String(pkg.build?.win?.icon));
    t.ok('the packaged file list includes assets/icon.png for the window icon',
        (pkg.build?.files || []).includes('assets/icon.png'),
        JSON.stringify(pkg.build?.files));
    t.ok('there is a script to regenerate it',
        pkg.scripts?.icon === 'node scripts/make-icon.mjs', String(pkg.scripts?.icon));

    // And the shell asks for it, which is what `npm run desktop` needs —
    // unpackaged, the window otherwise wears electron.exe's own icon.
    const mainCjs = fs.readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
    t.ok('electron/main.cjs sets a window icon',
        /icon:\s*path\.join\([^)]*'assets',\s*'icon\.png'\)/.test(mainCjs));

    // ── 5. Git will not rewrite the bytes section 3 just compared ──────────
    // `.gitattributes` opens with `* text=auto`, so without an explicit rule
    // the .ico is left to git's binary sniffing. It sniffs right today. If it
    // ever did not, section 3 would fail on someone else's clone and the cause
    // would be invisible from inside the checkout.
    const attrs = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
    t.ok('.gitattributes marks *.ico binary', /^\*\.ico\s+binary\s*$/m.test(attrs));
    t.ok('.gitattributes marks *.png binary', /^\*\.png\s+binary\s*$/m.test(attrs));
}
