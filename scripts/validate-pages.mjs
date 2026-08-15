// scripts/validate-pages.mjs — judge the staged Pages artifact, not the repo.
//
//   node scripts/validate-pages.mjs [dir]      (default: dist-pages)
//
// Exit 0 if the directory could be published and played; non-zero with a list
// of reasons otherwise.
//
// WHY IT RE-DERIVES INSTEAD OF TRUSTING THE MANIFEST
//
// `build-pages.mjs` writes a `manifest.json` listing what it staged. This file
// ignores it for everything that matters and walks the artifact's own import
// graph from its own `index.html`, on disk, inside `dist-pages/`. A validator
// that reads the builder's notes is two copies of one belief agreeing with each
// other — the exact failure `REVIEW.md` §5 lists first — and it would pass a
// build that resolved a module the builder forgot to copy.
//
// WHAT IT CANNOT PROVE
//
// That the game plays. This is a static-shape check: files present, graph
// closed, no path that escapes the project subpath, no development material
// published. Whether the thing boots is `tests/pages-smoke-e2e.spec.mjs`, which
// serves this directory under a `/Sovereign-Scar/` prefix and drives a real
// browser at it. Both are needed and neither substitutes for the other.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Development material that must never be published.
 *
 * A public URL is a publication. Tests, audits, changelogs, QA captures and the
 * Electron packaging are not part of the game and some of them are 200 KB of
 * internal notes each.
 */
export const FORBIDDEN_TOP_LEVEL = [
    'tests', 'docs', 'electron', 'scripts', 'node_modules', '.claude',
    '.github', 'examples', 'dist-desktop', 'tmp', 'package-lock.json',
];

/** A specifier that would leave `/Sovereign-Scar/` when the page is hosted. */
export function escapesBase(spec) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return false;   // absolute URL: intentional external
    if (spec.startsWith('//')) return true;                 // protocol-relative
    return spec.startsWith('/');
}

/**
 * Text that only works on a developer's machine.
 *
 * Whole-line comments are dropped first. `src/engine/settings.js` opens a
 * comment with "localStorage may be absent (file://, some headless contexts)",
 * which is a true sentence about a real hazard and not a URL the game fetches.
 * Failing a deploy over prose would teach whoever hit it to delete the check.
 */
export function hasLocalOnlyReference(text) {
    const body = text
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(line))
        .join('\n');
    return /\bhttps?:\/\/(localhost|127\.0\.0\.1)|\bfile:\/\//.test(body);
}

function specifiersIn(source) {
    const body = source
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
    const out = new Set();
    // `\s*`, not `\s+` — the vendored three.js bundle writes
    // `import{Matrix3 as e}from"./three.core.min.js"` with no space anywhere,
    // and an earlier version of this scanner (and of the builder's, which had
    // the same hole) simply did not see it. See the note in build-pages.mjs.
    const patterns = [
        /(?:^|[\s;}])import\s*(?:[\w${}*,\s]*?\s*from\s*)?['"]([^'"]+)['"]/g,
        /(?:^|[\s;}])export\s*[\w${}*,\s]*?\s*from\s*['"]([^'"]+)['"]/g,
        /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(body))) out.add(m[1]);
    }
    return [...out];
}

function walkFiles(dir, base = dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkFiles(p, base, out);
        else out.push(path.relative(base, p).split('\\').join('/'));
    }
    return out;
}

export function validate(dir) {
    const bad = [];
    const say = (msg) => bad.push(msg);
    const abs = (rel) => path.join(dir, rel);
    const exists = (rel) => fs.existsSync(abs(rel));

    if (!fs.existsSync(dir)) {
        return [`artifact directory does not exist: ${dir}`];
    }

    // ── 1. THE FILES A BROWSER ASKS FOR FIRST ──────────────────────────────
    if (!exists('index.html')) say('index.html is missing — Pages serves nothing');
    if (!exists('.nojekyll')) {
        say('.nojekyll is missing — Jekyll will drop every `_`-prefixed path, '
            + 'and src/game/levels/_common.js is the one such file in the '
            + 'runtime graph (reached from room-graph via encounter-director, '
            + 'so it is on the path to loading any level at all)');
    }
    if (bad.length) return bad;

    const html = fs.readFileSync(abs('index.html'), 'utf8');

    // ── 2. THE IMPORT MAP AND THE ENTRY ────────────────────────────────────
    const mapMatch = html.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!mapMatch) { say('index.html has no import map'); return bad; }
    let importMap = {};
    try {
        importMap = JSON.parse(mapMatch[1]).imports || {};
    } catch (e) { say(`import map is not valid JSON: ${e.message}`); return bad; }

    for (const [key, target] of Object.entries(importMap)) {
        if (escapesBase(target)) {
            say(`import map "${key}" -> "${target}" escapes the project subpath`);
        }
        if (!target.endsWith('/') && !exists(target.replace(/^\.\//, ''))) {
            say(`import map "${key}" -> "${target}" is not in the artifact`);
        }
    }

    const entryMatch = html.match(/import\(\s*['"]([^'"]+)['"]\s*\)/);
    if (!entryMatch) { say('index.html imports no entry module'); return bad; }
    const entry = path.posix.normalize(entryMatch[1].replace(/^\.\//, ''));
    if (!exists(entry)) say(`entry module is missing from the artifact: ${entry}`);
    if (bad.length) return bad;

    // ── 3. THE GRAPH CLOSES, WALKED INSIDE THE ARTIFACT ────────────────────
    const seen = new Set();
    const queue = [entry];
    while (queue.length) {
        const rel = queue.shift();
        if (seen.has(rel)) continue;
        seen.add(rel);
        if (!exists(rel)) { say(`module graph is broken: ${rel} is missing`); continue; }
        for (const spec of specifiersIn(fs.readFileSync(abs(rel), 'utf8'))) {
            if (escapesBase(spec)) {
                say(`${rel} imports "${spec}", which leaves the project subpath`);
                continue;
            }
            if (spec.startsWith('./') || spec.startsWith('../')) {
                queue.push(path.posix.normalize(
                    path.posix.join(path.posix.dirname(rel), spec)));
                continue;
            }
            if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) {
                say(`${rel} imports an absolute URL "${spec}" — the game must run offline`);
                continue;
            }
            let best = null;
            for (const key of Object.keys(importMap)) {
                if (key.endsWith('/') ? spec.startsWith(key) : spec === key) {
                    if (!best || key.length > best.length) best = key;
                }
            }
            if (!best) { say(`${rel} imports "${spec}" with no import-map entry`); continue; }
            queue.push(path.posix.normalize(
                (importMap[best] + spec.slice(best.length)).replace(/^\.\//, '')));
        }
    }

    const staged = walkFiles(dir);

    // ── 3b. AND EVERY STAGED MODULE'S IMPORTS RESOLVE TOO ──────────────────
    //
    // Section 3 walks outward from the entry, so it only ever visits what the
    // entry can reach — and a scanner with a blind spot cannot reach past the
    // import it failed to parse. This pass starts from the FILE LIST instead
    // and asks each staged module whether its own imports landed. Different
    // starting point, same question, and it catches the case where the walk
    // stopped early rather than the case where a file was forgotten.
    for (const f of staged) {
        if (!/\.(js|mjs)$/.test(f)) continue;
        for (const spec of specifiersIn(fs.readFileSync(abs(f), 'utf8'))) {
            if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
            const target = path.posix.normalize(
                path.posix.join(path.posix.dirname(f), spec));
            if (!exists(target)) say(`${f} imports "${spec}" — ${target} is not staged`);
        }
    }

    // ── 4. NOTHING DEVELOPMENT-ONLY GOT PUBLISHED ──────────────────────────
    for (const f of staged) {
        const top = f.split('/')[0];
        if (FORBIDDEN_TOP_LEVEL.includes(top)) say(`development material staged: ${f}`);
    }

    // ── 5. NOTHING ONLY WORKS ON THIS MACHINE ──────────────────────────────
    for (const f of staged) {
        if (!/\.(js|mjs|html|css|json)$/.test(f)) continue;
        if (f === 'manifest.json') continue;   // build provenance, not runtime
        const text = fs.readFileSync(abs(f), 'utf8');
        if (hasLocalOnlyReference(text)) {
            say(`${f} contains a localhost or file:// reference`);
        }
    }

    // ── 6. THE ONE FILE JEKYLL WOULD HAVE EATEN ────────────────────────────
    // Named explicitly rather than left to the graph walk, because this is the
    // failure `.nojekyll` exists to prevent and it should be impossible to
    // remove the guard and the evidence in one edit.
    if (!exists('src/game/levels/_common.js')) {
        say('src/game/levels/_common.js is missing — it is the only `_`-prefixed '
            + 'file in the runtime graph, and room-graph reaches it');
    }

    return bad;
}

// Run standalone when invoked directly.
if (process.argv[1]
    && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const dir = path.resolve(ROOT, process.argv[2] || 'dist-pages');
    const problems = validate(dir);
    if (problems.length) {
        console.error(`\nPAGES ARTIFACT INVALID — ${problems.length} problem(s):\n`);
        for (const p of problems) console.error('  - ' + p);
        process.exit(1);
    }
    const n = walkFiles(dir).length;
    console.log(`Pages artifact OK — ${n} files in ${path.relative(ROOT, dir)}`);
}
