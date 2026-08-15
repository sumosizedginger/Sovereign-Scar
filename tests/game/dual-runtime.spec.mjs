// tests/game/dual-runtime.spec.mjs — one game, two containers.
//
// THE RULE THIS ENFORCES
//
// Sovereign Scar ships two ways. GitHub Pages serves a staged copy of the
// source over HTTPS from `/Sovereign-Scar/`; Electron serves the same source
// over loopback from a window. They are CONTAINERS. There is one game inside
// them and there must go on being one.
//
// The way that stops being true is boring and gradual: someone adds a module,
// the Pages builder picks it up automatically because it walks the import
// graph, and the Electron `files` list in `package.json` — which is authored by
// hand — does not. The desktop build then ships without it. It will not fail to
// build. It will fail to run, on somebody else's machine, after release.
//
// So this spec derives the runtime file list ONCE, from the real entry point in
// `index.html`, and asks whether the Electron packaging globs cover every file
// in it. `scripts/build-pages.mjs` exports that derivation; nothing here
// re-implements it, because two lists that agree with each other prove nothing
// and this repository has the receipts on that (REVIEW.md §5).
//
// It also pins the two things that make "the same source" possible at all: the
// import map is relative, and the Electron shell serves over HTTP rather than
// loading `file://`.

import fs from 'fs';
import { runtimeFiles } from '../../scripts/build-pages.mjs';

const ROOT = new URL('../../', import.meta.url);

const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

/**
 * Does an electron-builder `files` entry cover this path?
 *
 * Only the glob shapes this project actually uses are handled — `dir/**`,
 * exact paths, and `!negation`. A `files` list that grows a shape this does not
 * understand should fail loudly rather than quietly pass everything, so
 * anything unrecognised throws.
 */
function coveredBy(pattern, file) {
    if (pattern.startsWith('!')) return false;
    if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2));
    if (!pattern.includes('*')) return file === pattern;
    throw new Error(`unrecognised electron-builder files glob: ${pattern}`);
}

export function run(t) {
    const pkg = JSON.parse(read('package.json'));
    const patterns = pkg.build?.files || [];
    t.ok('package.json declares an electron-builder file list',
        patterns.length > 0);

    // ── 1. THE DESKTOP BUILD SHIPS EVERY RUNTIME FILE ──────────────────────
    let derived = null;
    try {
        derived = runtimeFiles();
    } catch (e) {
        t.ok('the runtime file list derives', false, e.message);
        return;
    }
    t.ok('the runtime file list derives', true, `${derived.files.length} files`);
    t.ok('…and it is a real graph, not an empty one',
        derived.modules.length > 100, `${derived.modules.length} modules`);
    t.ok('…rooted at the entry index.html actually imports',
        derived.entry === 'src/game/index.js', derived.entry);

    const uncovered = derived.files.filter(
        (f) => !patterns.some((p) => coveredBy(p, f))
    );
    t.ok('every file the browser game needs is in the Electron package',
        uncovered.length === 0,
        uncovered.length
            ? `${uncovered.length} missing from build.files: ${uncovered.slice(0, 6).join(', ')}`
            : `${derived.files.length} files covered`);

    // The coverage test above is a filter, and a filter that matches
    // everything passes forever. Hand it a path that must NOT be covered.
    t.ok('…and the coverage check can say no',
        !patterns.some((p) => coveredBy(p, 'tests/run-all.mjs')),
        'the Electron package must not ship the test suite');
    t.ok('…nor the changelog', !patterns.some((p) => coveredBy(p, 'CHANGELOG.md')));

    // ── 2. THE IMPORT MAP IS RELATIVE, WHICH IS WHAT MAKES BOTH WORK ───────
    // A leading slash here resolves to the ORIGIN root. On Pages that is
    // https://sumosizedginger.github.io/lib/… — outside the project entirely,
    // and someone else's URL space. In Electron it happens to work, which is
    // exactly why it could ship unnoticed.
    const html = read('index.html');
    const map = JSON.parse(
        html.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i)[1]
    ).imports;
    for (const [key, target] of Object.entries(map)) {
        t.ok(`import map "${key}" is relative`,
            target.startsWith('./'),
            `${target} — a leading slash leaves /Sovereign-Scar/ on Pages`);
    }
    t.ok('the entry module is imported relatively too',
        /import\(\s*['"]\.\//.test(html),
        'a root-relative entry breaks the subpath deployment');

    // ── 3. ELECTRON STILL SERVES, RATHER THAN loadFile ─────────────────────
    // `loadFile` over file:// makes Chromium apply CORS to every ES-module
    // import and the game does not load at all. The loopback server is the
    // reason the desktop build can run the identical source; it is a load-
    // bearing decision and it has a comment in `electron/main.cjs` saying so.
    //
    // Read the CODE, not the prose. `main.cjs` opens with a long comment
    // explaining why `win.loadFile('index.html')` does not work here — so a
    // scan of the raw text finds `loadFile(` and fails on the very comment that
    // documents the decision. The first version of this assertion did exactly
    // that. Strip whole-line comments first.
    const main = read('electron/main.cjs')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
    t.ok('the desktop shell serves over loopback', /loadURL\(/.test(main));
    t.ok('…and does not loadFile the index', !/loadFile\(/.test(main),
        'file:// applies CORS to module imports; the window would open black');
    t.ok('…using the project’s own static server',
        /scripts.{1,4}serve\.mjs/.test(main),
        'a second server implementation is a second set of MIME types to keep '
        + 'in step with the one the tests use');

    // ── 4. NOTHING PAGES-SPECIFIC LEAKED INTO THE GAME ─────────────────────
    // The subpath is a property of where the artifact is hosted. If the string
    // appears in `src/`, some module has been taught where it lives, and the
    // desktop build — which lives somewhere else — is now running different
    // code by accident.
    const leaked = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            if (e.isDirectory()) walk(`${dir}${e.name}/`);
            else if (e.name.endsWith('.js')) {
                const text = fs.readFileSync(new URL(`${dir}${e.name}`, ROOT), 'utf8');
                if (/Sovereign-Scar\/|github\.io/.test(text)) leaked.push(dir + e.name);
            }
        }
    };
    walk('src/game/');
    t.ok('no game module knows it is hosted at /Sovereign-Scar/',
        leaked.length === 0, leaked.join(', '));
}
