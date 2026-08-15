// scripts/build-pages.mjs — stage the browser game for GitHub Pages.
//
//   node scripts/build-pages.mjs [outDir]      (default: dist-pages)
//
// WHAT THIS IS AND IS NOT
//
// It is not a bundler. Nothing is transpiled, minified, rewritten, inlined or
// concatenated. Every file that comes out the other end is byte-identical to
// the one in `src/`, and the module graph the browser walks on GitHub Pages is
// the same graph it walks on `npm run serve` and inside Electron. There is one
// Sovereign Scar; this only decides which files travel.
//
// WHY IT IS NOT `cp -r .`
//
// The repository root is 700-odd files of tests, audits, changelogs, QA
// captures, development logs and Electron packaging. None of it is needed to
// play the game and all of it would be published at a public URL. So the file
// list is DERIVED, by walking the real static import graph from the real entry
// point in `index.html`, rather than authored — an authored list is a list that
// goes stale the first time somebody adds a module.
//
// THE THREE THINGS THAT ARE EASY TO GET WRONG HERE
//
// 1. `.nojekyll`. GitHub Pages runs Jekyll over the artifact unless this file
//    exists, and Jekyll silently DROPS every path segment beginning with `_`.
//    Exactly one file in the runtime graph starts with one —
//    `src/game/levels/_common.js` — and it is reached from `room-graph.js` via
//    `encounter-director.js`, so it is on the path to loading ANY level, not
//    just the sandbox that imports it directly. Without `.nojekyll` the deploy
//    succeeds, the page loads, and that import 404s.
//
//    (This comment first said "every one of the fifteen levels imports it".
//    Counted: two files do. The consequence is the same and the number was
//    invented, which is the kind of sentence a reader trusts instead of
//    checking.)
//
// 2. The base path. The game is served from `/Sovereign-Scar/`, not `/`. That
//    is safe here only because every path in the runtime is relative — the
//    import map is `./lib/three/…`, the entry is `./src/game/index.js`, and
//    nothing in `src/` writes a leading-slash URL. `validate-pages.mjs` is the
//    thing that keeps that true; this script does not rewrite anything to make
//    it true, because a rewrite is exactly how the browser build and the
//    Electron build start to diverge.
//
// 3. Bare specifiers. `three` and `three/addons/` are resolved by the import
//    map in `index.html`, so the walker below reads that map rather than
//    assuming a layout.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist-pages');

/** Files that are needed but are not reachable by following imports. */
const EXTRA = [
    'index.html',
    // Vendored three.js keeps its MIT licence beside it. Shipping the code
    // without the licence is the one thing the licence asks.
    'lib/three/LICENSE',
    'lib/three/addons/LICENSE',
];

/** Read the import map out of index.html so bare specifiers resolve. */
function readImportMap(html) {
    const m = html.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) throw new Error('index.html has no <script type="importmap">');
    const map = JSON.parse(m[1]).imports || {};
    return map;
}

/** The module `index.html` boots the game with. */
function readEntry(html) {
    const m = html.match(/import\(\s*['"]([^'"]+)['"]\s*\)/);
    if (!m) throw new Error('index.html does not dynamically import an entry module');
    return m[1];
}

/**
 * Every specifier a module file references.
 *
 * Regex rather than a parser on purpose: the vendored three.js build is a
 * single minified line and no dependency may be added to this repo to read it.
 * The forms below are the only ones the codebase and the vendored bundle use,
 * and `validate-pages.mjs` independently proves the resulting artifact
 * resolves — so a specifier this misses shows up as a hard failure rather than
 * as a broken deploy.
 */
function specifiersIn(source) {
    const out = new Set();
    // Drop whole-line comments first. This codebase documents its own module
    // layout inside doc comments — `src/combat/facing.js` opens by showing the
    // import line a consumer should write — and a scanner that reads those is a
    // scanner that resolves `./combat/facing.js` relative to the wrong file and
    // reports a missing module that is right there. Whole-line only, so the
    // single-line minified three.js bundle is untouched.
    source = source
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
    // NOTE THE `\s*` AFTER `import`, NOT `\s+`.
    //
    // The first version of this required whitespace, which is what every line
    // of hand-written source in this repo has. The vendored three.js build does
    // not: it opens `import{Matrix3 as e,…}from"./three.core.min.js"`. So the
    // walker never saw `three.core.min.js`, never staged it, and produced an
    // artifact that passed the static validator (which had a copy of the same
    // regex and the same blind spot) and 404d on the first module the browser
    // asked for. `tests/pages-smoke-e2e.spec.mjs` is what caught it — which is
    // the argument for having a test that boots the artifact rather than one
    // that describes it.
    const patterns = [
        // import x / {x} / * as x  from '…'   and   import '…'
        /(?:^|[\s;}])import\s*(?:[\w${}*,\s]*?\s*from\s*)?['"]([^'"]+)['"]/g,
        // export {x} from '…'   and   export * from '…'
        /(?:^|[\s;}])export\s*[\w${}*,\s]*?\s*from\s*['"]([^'"]+)['"]/g,
        // import('…')
        /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(source))) out.add(m[1]);
    }
    return [...out];
}

/** Resolve one specifier, seen from `fromRel`, to a repo-relative path. */
function resolve(spec, fromRel, importMap) {
    if (spec.startsWith('./') || spec.startsWith('../')) {
        return path.posix.normalize(
            path.posix.join(path.posix.dirname(fromRel), spec)
        );
    }
    if (spec.startsWith('/')) {
        throw new Error(
            `${fromRel} imports "${spec}" — a root-relative specifier. That `
            + 'resolves to https://user.github.io/src/… on Pages, outside the '
            + 'project subpath. Use a relative specifier.'
        );
    }
    // Bare: longest matching import-map key wins, trailing-slash keys are
    // prefixes (that is what the import-map spec says they are).
    let best = null;
    for (const key of Object.keys(importMap)) {
        if (key.endsWith('/') ? spec.startsWith(key) : spec === key) {
            if (!best || key.length > best.length) best = key;
        }
    }
    if (!best) throw new Error(`${fromRel} imports "${spec}" — no import-map entry`);
    const target = importMap[best] + spec.slice(best.length);
    return path.posix.normalize(target.replace(/^\.\//, ''));
}

function walkGraph(entryRel, importMap) {
    const seen = new Set();
    const queue = [entryRel];
    while (queue.length) {
        const rel = queue.shift();
        if (seen.has(rel)) continue;
        seen.add(rel);
        const abs = path.join(ROOT, rel);
        if (!fs.existsSync(abs)) {
            throw new Error(`module graph references a missing file: ${rel}`);
        }
        const src = fs.readFileSync(abs, 'utf8');
        for (const spec of specifiersIn(src)) {
            queue.push(resolve(spec, rel, importMap));
        }
    }
    return [...seen].sort();
}

function copy(rel) {
    const from = path.join(ROOT, rel);
    const to = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

/**
 * The repo-relative file list the browser game actually needs, derived.
 *
 * Exported and side-effect-free so that
 * `tests/game/dual-runtime.spec.mjs` can ask the same question the builder
 * asks — "what does the game consist of" — and check that the Electron
 * packaging ships all of it. One derivation, two consumers; a second authored
 * list is how the two containers start being two games.
 */
export function runtimeFiles() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const importMap = readImportMap(html);
    const entry = path.posix.normalize(readEntry(html).replace(/^\.\//, ''));

    const modules = walkGraph(entry, importMap);
    // Everything the import map points at is reachable in principle even if the
    // current graph does not touch it; ship the mapped roots so a lazily added
    // import cannot 404 a deploy that tested clean.
    const mapped = Object.values(importMap)
        .filter((v) => !v.endsWith('/'))
        .map((v) => path.posix.normalize(v.replace(/^\.\//, '')));

    const files = [...new Set([...EXTRA, ...mapped, ...modules])]
        .filter((f) => fs.existsSync(path.join(ROOT, f)))
        .sort();
    return { entry, modules, files };
}

function main() {
    const { entry, modules, files } = runtimeFiles();

    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    for (const f of files) copy(f);

    // See note 1 at the top of this file. This empty file is load-bearing.
    fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

    const bytes = files.reduce(
        (n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0
    );
    const byTree = {};
    for (const f of files) {
        const k = f.split('/').slice(0, 2).join('/');
        byTree[k] = (byTree[k] || 0) + 1;
    }

    console.log(`entry           ${entry}`);
    console.log(`modules walked  ${modules.length}`);
    console.log(`files staged    ${files.length}  (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
    for (const [k, v] of Object.entries(byTree).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(v).padStart(4)}  ${k}`);
    }
    console.log(`out             ${path.relative(ROOT, OUT)}`);

    fs.writeFileSync(
        path.join(OUT, 'manifest.json'),
        JSON.stringify({ entry, files, generated: new Date().toISOString() }, null, 2)
    );
}

// Run standalone when invoked directly; stay silent when imported.
if (process.argv[1]
    && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();
}
