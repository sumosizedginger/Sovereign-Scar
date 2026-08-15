// tests/game/typecheck-boundary.spec.mjs — the type checker checks what it says.
//
// WHAT THIS GUARDS
//
// `tsconfig.json` sets `checkJs: false` and the checked boundary is per-file:
// every `.js` under `src/game/kernel/`, `world/`, `combat/` and `physics/`
// carries `// @ts-check` on line 1. `npm run typecheck` is green.
//
// That arrangement has one obvious hole and this file is it. The pragma is a
// single line. Delete it and the file silently stops being checked, `npm run
// typecheck` stays green, and the boundary quietly shrinks — with nothing
// anywhere saying so. Adding a NEW file to one of those trees does the same
// thing by omission, which is the likelier accident of the two.
//
// So the boundary is data, and this spec is the thing that reads it:
//
//   * the four trees are still the four trees `tsconfig.json` names,
//   * every file in them still carries the pragma,
//   * and `checkJs` is still off, because if someone flips it to `true` the
//     pragma stops being what does the work and this whole spec is measuring
//     something that no longer matters.
//
// The last assertion is the one that keeps this honest rather than decorative:
// it runs the detector against a hostile string and requires it to say no.
// A scanner that cannot fail is the exact defect `REVIEW.md` §5 lists first,
// and this file would be a very easy place to write one.

import fs from 'fs';
import path from 'path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** The trees this spec expects to find declared in `tsconfig.json`. */
const TREES = [
    'src/game/kernel',
    'src/game/world',
    'src/game/combat',
    'src/game/physics',
];

/**
 * The one test that decides whether a file is inside the boundary.
 *
 * Deliberately strict about position: TypeScript only honours `@ts-check` in a
 * comment before the first statement, and a pragma that has drifted below an
 * import does nothing at all while still reading, to a human skimming the file,
 * exactly like one that works.
 */
function isChecked(source) {
    return /^\/\/ @ts-check\r?\n/.test(source);
}

/** Strip `//` line comments so `tsconfig.json` (which has many) parses. */
function readTsconfig(file) {
    const text = fs.readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n');
    return JSON.parse(text);
}

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

export function run(t) {
    const cfgPath = path.join(ROOT, 'tsconfig.json');
    let cfg = null;
    try {
        cfg = readTsconfig(cfgPath);
    } catch (e) {
        t.ok('tsconfig.json parses', false, String(e.message));
        return;
    }
    t.ok('tsconfig.json parses', true);

    // ── 1. THE PRAGMA IS WHAT DOES THE WORK ────────────────────────────────
    t.ok('checkJs is off, so the per-file pragma is the boundary',
        cfg.compilerOptions?.checkJs === false,
        `checkJs=${cfg.compilerOptions?.checkJs} — if this is true, every `
        + 'dependency of the included trees is checked too and this spec is '
        + 'measuring the wrong thing');
    t.ok('…and allowJs is on, or nothing is read at all',
        cfg.compilerOptions?.allowJs === true);
    t.ok('…and it emits nothing: this is a checker, not a build step',
        cfg.compilerOptions?.noEmit === true);

    // ── 2. THE FOUR TREES ARE STILL DECLARED ───────────────────────────────
    const include = cfg.include || [];
    for (const tree of TREES) {
        t.ok(`tsconfig includes ${tree}`,
            include.some((p) => p.startsWith(tree)),
            include.join(' '));
    }
    t.ok('the ambient declarations are included',
        include.some((p) => p.startsWith('types/')),
        'without them `window.__sovereignScar` is an error in room-graph.js');

    // ── 3. EVERY FILE IN THEM CARRIES THE PRAGMA ───────────────────────────
    let files = 0;
    const missing = [];
    for (const tree of TREES) {
        const dir = path.join(ROOT, tree);
        if (!fs.existsSync(dir)) {
            t.ok(`${tree} exists`, false, 'tree named in tsconfig is not on disk');
            continue;
        }
        for (const f of walk(dir)) {
            files++;
            if (!isChecked(fs.readFileSync(f, 'utf8'))) {
                missing.push(path.relative(ROOT, f).split('\\').join('/'));
            }
        }
    }

    // If this ever reads 0 the two assertions below both pass over an empty
    // set, which is the shape of a scan pointed at nothing.
    t.ok('the boundary is not empty', files > 20, `${files} files scanned`);
    t.ok('every file in the checked trees carries `// @ts-check`',
        missing.length === 0,
        missing.length
            ? `${missing.length} without it: ${missing.slice(0, 8).join(', ')}`
            : `${files} files`);

    // ── 4. THE DETECTOR CAN SAY NO ─────────────────────────────────────────
    // Assertion 3 is a scanner, and a scanner that returns true for everything
    // passes forever. Hand it four files it must refuse.
    t.ok('a file with no pragma is refused',
        !isChecked('import x from "y";\n'));
    t.ok('a pragma below the first line is refused',
        !isChecked('// header\n// @ts-check\n'),
        'TypeScript honours it there, but only by accident of comment order — '
        + 'line 1 is the rule so the scan and the compiler cannot disagree');
    t.ok('a pragma inside a block comment is refused',
        !isChecked('/* @ts-check */\n'));
    t.ok('a mere mention of the string is refused',
        !isChecked('// this file is not @ts-check yet\n'));
    t.ok('…and a real one is accepted', isChecked('// @ts-check\nimport x from "y";\n'));
}
