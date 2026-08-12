#!/usr/bin/env node
/**
 * Builds the desktop app icon: `assets/icon.png` (256) and `assets/icon.ico`
 * (16/32/64/128/256), with no dependencies beyond Node's own zlib.
 *
 * The art is authored ONCE on a 32x32 voxel grid and every exported size is a
 * whole-number rescale of it, so the icon is genuinely blocky at 256 and still
 * legible at 16 instead of turning to mush. That is the point of the grid: a
 * detailed icon downsampled to 16px is a grey smudge, and the taskbar is where
 * this thing actually gets looked at.
 *
 * The subject is the game's own title. Not a glowing squiggle on a dark field —
 * the first attempt was that, and it read as a river. A scar is the WORLD split:
 * two masses of rock pulled apart, light in the gap between them. The two edges
 * are jittered independently, because parallel edges read as a cut and the thing
 * being drawn is a tear.
 *
 * Colours are lifted from `src/game/ui/menu.js` rather than invented, so the
 * icon and the title screen are the same object.
 *
 * Run: `npm run icon`. Deterministic — same bytes every time.
 */

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets');

/** The authoring resolution. Every export is this scaled by a whole number. */
const G = 32;

// ---------------------------------------------------------------------------
// Palette — taken from the running game, not chosen here.
// ---------------------------------------------------------------------------

/** Menu backdrop, `rgba(4,6,12)` in `menu.js`. The void behind the rock. */
const VOID = [4, 6, 12];
/**
 * The rock, lit. Deliberately well above the backdrop: the icon is TWO MASSES
 * with a crack, and when the masses sit near the void all anyone sees is the
 * crack — which is how the first two drafts came out looking like a squiggle.
 */
const ROCK_LIT = [58, 68, 90];
/** The rock, in shadow at the outer corners. */
const ROCK_DARK = [24, 30, 43];
/** Title colour `#7fe0ff`. */
const CYAN = [127, 224, 255];
/** Sigil / HUD accent `#d4a84b`. */
const GOLD = [212, 168, 75];
/** Title glow `rgba(90,180,255)`. */
const GLOW = [90, 180, 255];
/** The seam itself. */
const HOT = [247, 253, 255];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
];

// ---------------------------------------------------------------------------
// The tear
// ---------------------------------------------------------------------------

/**
 * A fixed integer hash. Everything random in this file goes through it, so a
 * rebuild produces identical bytes — an icon that changes on every build shows
 * up as a diff nobody can review.
 */
function hash(x, y, salt) {
    let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** First and last row the tear reaches. It is closed rock outside these. */
const Y0 = 2;
const Y1 = 29;

/** Where the tear's centre wanders, in columns. Gentle — the JAG is the edges. */
function centreAt(y) {
    const t = (y - Y0) / (Y1 - Y0);
    return 16.0 + Math.sin(t * 5.0) * 1.5 + Math.sin(t * 11.0) * 0.7;
}

/** How far the two faces have separated on row `y`. Zero at the tips. */
function openingAt(y) {
    if (y < Y0 || y > Y1) return 0;
    const t = (y - Y0) / (Y1 - Y0);
    return 3.6 * Math.pow(Math.sin(Math.PI * t), 0.62);
}

/**
 * The two faces of the tear on row `y`, as whole columns.
 *
 * `l` is the last column of the left mass, `r` the first column of the right.
 * Each face gets its OWN jitter: a tear's two edges do not match, and making
 * them match is what turned the first draft into a ribbon.
 */
function facesAt(y) {
    const c = centreAt(y);
    const o = openingAt(y);
    if (o <= 0) return null;
    const jl = Math.round(hash(y, 0, 17) * 1.9) - 1;   // -1..1
    const jr = Math.round(hash(y, 0, 91) * 1.9) - 1;
    const l = Math.floor(c - o / 2) + jl;
    const r = Math.ceil(c + o / 2) + jr;
    return r - l < 2 ? { l, r: l + 2 } : { l, r };      // never fully closed
}

/**
 * Chips of rock thrown clear, floating in the light. Dark, because they are
 * rock seen against the glow — bright specks read as sparkles and this is a
 * wound, not a firework.
 */
const CHIPS = [[15, 7], [18, 12], [14, 18], [17, 23], [16, 10]];

/** Renders the 32x32 grid to opaque RGBA bytes. */
function renderGrid() {
    const px = Buffer.alloc(G * G * 4);

    for (let y = 0; y < G; y++) {
        const faces = facesAt(y);

        for (let x = 0; x < G; x++) {
            const inGap = faces && x > faces.l && x < faces.r;
            /** Columns from the nearest rock face; 0 while inside the gap. */
            const dist = !faces ? 99 : inGap ? 0 : Math.min(Math.abs(x - faces.l), Math.abs(x - faces.r));

            let col;

            if (inGap) {
                // --- the light in the tear --------------------------------
                // Hottest along the middle of the gap, cooling to cyan at the
                // faces, so the gap has depth instead of being a flat bar.
                const span = (faces.r - faces.l) / 2;
                const t = clamp01(Math.abs(x - (faces.l + faces.r) / 2) / Math.max(span, 0.001));
                col = mix(HOT, CYAN, Math.pow(t, 0.8));
                col = mix(col, mix(CYAN, GOLD, 0.35), Math.pow(t, 2.6) * 0.75);
            } else {
                // --- rock -------------------------------------------------
                const nx = (x + 0.5) / G - 0.5;
                const ny = (y + 0.5) / G - 0.5;
                const vig = clamp01(Math.pow(Math.sqrt(nx * nx + ny * ny) / 0.7071, 1.25));
                col = mix(ROCK_LIT, ROCK_DARK, vig);

                // Voxel grain, so the masses read as built out of blocks.
                const grain = (hash(x, y, 5) - 0.5) * 13;
                col = [col[0] + grain, col[1] + grain, col[2] + grain];

                // ONE column of lip is lit gold by what is in the gap. Two
                // columns per side outweighed the light itself and the whole
                // icon went brass.
                if (dist === 0) {
                    col = mix(col, mix(GOLD, HOT, 0.22), 0.62);
                } else if (dist <= 4) {
                    col = mix(col, GLOW, Math.exp(-((dist - 1) ** 2) / 4.0) * 0.34);
                }

                // Only the extreme corners fall away to the menu backdrop.
                col = mix(col, VOID, clamp01((vig - 0.85) / 0.15) * 0.6);
            }

            // --- chips, dark against the light ----------------------------
            for (const [cx, cy] of CHIPS) {
                if (cx === x && cy === y && inGap) col = mix(col, ROCK_DARK, 0.78);
            }

            const i = (y * G + x) * 4;
            px[i] = Math.round(clamp01(col[0] / 255) * 255);
            px[i + 1] = Math.round(clamp01(col[1] / 255) * 255);
            px[i + 2] = Math.round(clamp01(col[2] / 255) * 255);
            px[i + 3] = 255;
        }
    }
    return px;
}

// ---------------------------------------------------------------------------
// Rescaling
// ---------------------------------------------------------------------------

/** Nearest-neighbour upscale by a whole factor — keeps the voxels square. */
function upscale(src, size, factor) {
    const w = size * factor;
    const out = Buffer.alloc(w * w * 4);
    for (let y = 0; y < w; y++) {
        const sy = (y / factor) | 0;
        for (let x = 0; x < w; x++) {
            const sx = (x / factor) | 0;
            src.copy(out, (y * w + x) * 4, (sy * size + sx) * 4, (sy * size + sx) * 4 + 4);
        }
    }
    return out;
}

/** Box-average downscale by a whole factor — for the 16px entry only. */
function downscale(src, size, factor) {
    const w = size / factor;
    const out = Buffer.alloc(w * w * 4);
    const n = factor * factor;
    for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0;
            for (let dy = 0; dy < factor; dy++) {
                for (let dx = 0; dx < factor; dx++) {
                    const i = ((y * factor + dy) * size + (x * factor + dx)) * 4;
                    r += src[i]; g += src[i + 1]; b += src[i + 2];
                }
            }
            const o = (y * w + x) * 4;
            out[o] = Math.round(r / n);
            out[o + 1] = Math.round(g / n);
            out[o + 2] = Math.round(b / n);
            out[o + 3] = 255;
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

/** 8-bit RGBA PNG. Filter 0 on every scanline — the art is flat colour blocks. */
function encodePNG(rgba, w, h) {
    const stride = w * 4;
    const raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // colour type: RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

// ---------------------------------------------------------------------------
// ICO
// ---------------------------------------------------------------------------

/**
 * Vista-era ICO: each entry is a whole PNG rather than a BMP + AND mask.
 * Every consumer that matters has read this since 2007, and it avoids
 * hand-rolling the bottom-up BMP layout and its 1-bit mask.
 */
function encodeICO(entries) {
    const dir = Buffer.alloc(6 + entries.length * 16);
    dir.writeUInt16LE(0, 0);
    dir.writeUInt16LE(1, 2);              // 1 = icon
    dir.writeUInt16LE(entries.length, 4);

    let offset = dir.length;
    entries.forEach((e, i) => {
        const at = 6 + i * 16;
        dir[at] = e.size >= 256 ? 0 : e.size;      // 0 means 256
        dir[at + 1] = e.size >= 256 ? 0 : e.size;
        dir[at + 2] = 0;                            // palette size
        dir[at + 3] = 0;                            // reserved
        dir.writeUInt16LE(1, at + 4);               // colour planes
        dir.writeUInt16LE(32, at + 6);              // bits per pixel
        dir.writeUInt32LE(e.png.length, at + 8);
        dir.writeUInt32LE(offset, at + 12);
        offset += e.png.length;
    });

    return Buffer.concat([dir, ...entries.map((e) => e.png)]);
}

// ---------------------------------------------------------------------------

/** Sizes that go in the .ico. 256 is the one electron-builder insists on. */
export const ICON_SIZES = [16, 32, 64, 128, 256];

/**
 * Builds both files in memory. Exported so `tests/game/app-icon.spec.mjs` can
 * regenerate and compare against what is committed — a binary checked into a
 * repo with no way to prove it still matches its source is a binary that
 * quietly drifts from it.
 */
export function buildIcon() {
    const grid = renderGrid();
    const rgbaFor = {
        16: () => downscale(grid, G, 2),
        32: () => grid,
        64: () => upscale(grid, G, 2),
        128: () => upscale(grid, G, 4),
        256: () => upscale(grid, G, 8),
    };
    const entries = ICON_SIZES.map((size) => ({
        size,
        png: encodePNG(rgbaFor[size](), size, size),
    }));
    return { ico: encodeICO(entries), png: entries[entries.length - 1].png };
}

function main() {
    const { ico, png } = buildIcon();
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const icoPath = path.join(OUT_DIR, 'icon.ico');
    const pngPath = path.join(OUT_DIR, 'icon.png');
    fs.writeFileSync(icoPath, ico);
    fs.writeFileSync(pngPath, png);

    const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
    console.log(`${rel(icoPath)}  ${ICON_SIZES.join('/')}  ${ico.length} bytes`);
    console.log(`${rel(pngPath)}  256  ${png.length} bytes`);
}

// Only write files when run as a command; importing it must have no effect.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
