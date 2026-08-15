// ESLint — a correctness gate, not a style opinion.
//
// WHAT THIS IS FOR
//
// 36k lines of hand-written plain JavaScript with, until now, no static
// analysis at all: no linter, no type checker, no formatter (`REVIEW.md` §4.3
// said so out loud). Every error class those tools catch was caught here by a
// runtime test or not at all — and this project's own record says the runtime
// tests miss a lot (`REVIEW.md` §4.1, §4.2).
//
// So this config is aimed at exactly one thing: mistakes that are mistakes in
// any style, in any decade, under any taste. A misspelled identifier. A branch
// after a `return`. Two object keys with the same name where the second silently
// wins. A `switch` case that falls into the next one. A comparison that can
// never be true.
//
// WHAT THIS IS DELIBERATELY NOT FOR
//
// Nothing here reformats a file, renames anything, argues about semicolons,
// quote style, arrow bodies, `let` vs `const`, import order, or line length.
// A repository-wide whitespace diff would bury the actual findings and make
// every future `git blame` useless, which is a real cost paid for no signal.
// `.editorconfig` already owns the mechanical parts.
//
// Every rule that is OFF below is off on purpose and says why. Nothing is
// silenced merely to reach green.

import js from '@eslint/js';
import globals from 'globals';

/**
 * Globals the game legitimately reads that are neither browser nor Node
 * standard-library names.
 *
 * `__sovereignScar` is the debug hook the browser E2E suite drives the real
 * game through, so it is written by product code and read by tests.
 */
const projectGlobals = {
    __sovereignScar: 'writable',
};

export default [
    {
        // Not ours, not under review, and not fixable here.
        //
        // `lib/three/` is vendored three.js r185 — minified, ~1 MB, and linting
        // it produces thousands of findings about someone else's build output.
        // `node_modules` and the desktop build output are obvious.
        // `docs/media/` is PNGs.
        ignores: [
            'lib/**',
            'node_modules/**',
            'dist-desktop/**',
            'dist-pages/**',
            'tmp/**',
            'docs/media/**',
        ],
    },

    js.configs.recommended,

    {
        // ── DELIBERATE DISABLES ────────────────────────────────────────────
        //
        // These are the rules from `recommended` that produce mostly historical
        // noise in THIS codebase rather than engineering signal. Each one was
        // turned off after reading its actual findings here, not pre-emptively.
        rules: {
            // Fires on `/\-/` and friends inside the procedural-geometry and
            // parser code. Harmless in every instance, and "fixing" it means
            // touching regexes that are currently correct.
            'no-useless-escape': 'off',

            // The kit predates `Object.hasOwn` and calls `obj.hasOwnProperty(k)`
            // on objects it constructed itself two lines earlier. Rewriting
            // those is churn on working code; a null-prototype object never
            // enters these paths.
            'no-prototype-builtins': 'off',

            // `catch (e) { /* ignore */ }` is the house idiom for a genuinely
            // optional operation and reads fine. An empty block with a comment
            // already passes; this only re-flags the bare-catch spellings.
            'no-empty': ['error', { allowEmptyCatch: true }],

            // Twelve findings on first run, twelve of them the same shape:
            //
            //     let armRx = 0, armRz = 0, torsoYaw = 0;
            //     if (phase === 'windup') { armRx = …; armRz = …; }
            //     else if (phase === 'strike') { … }
            //
            // Every branch assigns, so the initialiser is technically dead —
            // and it is also the thing that documents the resting value and
            // guarantees a number rather than `undefined` if a branch is ever
            // added. Declaring the variables bare to satisfy the rule would
            // make the code worse and would be a change to working animation,
            // physics and level-bake code for zero defects found.
            //
            // Kept in mind rather than kept on: the one real finding in that
            // batch was a *constant condition*, not a useless assignment, and
            // `no-constant-condition` catches that on its own.
            'no-useless-assignment': 'off',
        },
    },

    {
        // ── EXTRA HIGH-CONFIDENCE RULES ────────────────────────────────────
        //
        // Not in `recommended`, but each one is a defect rather than a taste,
        // and each maps onto a failure this repository has actually shipped.
        rules: {
            // `x = x` and `if (a === a)`. Both have shipped here as typos in
            // arithmetic that places a body in the world.
            'no-self-assign': ['error', { props: true }],
            'no-self-compare': 'error',

            // `if (a) … else if (a) …` — the second branch is dead. This is the
            // literal shape of "the unwritten branch is the softlock".
            'no-dupe-else-if': 'error',

            // A `for` condition on a variable the loop never changes: an
            // infinite loop or a loop that runs once, never what was meant.
            'no-unmodified-loop-condition': 'error',

            // `-0`, `0.1 + 0.2`-class literal precision loss, and template
            // literals in a plain string concat — all silent wrong answers.
            'no-compare-neg-zero': 'error',
            'no-loss-of-precision': 'error',
            'no-template-curly-in-string': 'error',

            // A promise executor that is `async` swallows its own rejections.
            'no-async-promise-executor': 'error',

            // A private field declared and never read is a wire connected at
            // one end — this repo's single most expensive recurring defect.
            'no-unused-private-class-members': 'error',

            // `new Symbol()`, `new BigInt()` — throws at runtime, always.
            'no-new-native-nonconstructor': 'error',

            // `return` inside `finally` discards the real result or exception.
            'no-unsafe-finally': 'error',

            // Assigning to a `const`, a class binding, or an imported name.
            // `no-const-assign` and `no-class-assign` are in recommended;
            // `no-import-assign` covers the module-level case.
            'no-import-assign': 'error',

            // A getter with no `return` reads as `undefined` at every call site.
            'getter-return': 'error',

            // `switch (typeof x) { case 'strnig': }` — a case that can never
            // match, which is exactly how a dead branch hides.
            'valid-typeof': ['error', { requireStringLiterals: true }],

            // Unused values. `args: 'none'` because callback signatures are
            // documentation — a handler that names `(event, index)` and uses
            // only `event` is clearer than one that doesn't. Unused *variables*
            // and unused *imports* are the signal: something was computed, or
            // pulled in, and then nobody consumed it.
            'no-unused-vars': ['error', {
                args: 'none',
                caughtErrors: 'none',
                ignoreRestSiblings: true,
                varsIgnorePattern: '^_',
            }],
        },
    },

    {
        // ── THE GAME, THE KIT, AND THE EXAMPLES: BROWSER ───────────────────
        //
        // Everything under `src/` and `examples/` is loaded by a browser as a
        // native ES module. There is no bundler and no transpiler, so what the
        // browser sees is exactly what is on disk.
        files: ['src/**/*.js', 'examples/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...projectGlobals,
            },
        },
    },

    {
        // ── TESTS AND PROBES: NODE, PLUS BROWSER INSIDE page.evaluate ──────
        //
        // The browser E2E specs are Node programs that ship arrow functions
        // into Chromium via `page.evaluate`. Those bodies are browser code
        // living inside a Node file, so both global sets are legitimately in
        // scope in one file and there is no honest way to separate them.
        files: ['tests/**/*.mjs', 'tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
                ...projectGlobals,
            },
        },
        rules: {
            // `t.ok('the same seed replays the same fight', runOnce() === runOnce())`
            //
            // That is a determinism assertion, and it is the correct way to
            // write one: call the thing twice and demand the same answer. The
            // rule sees two syntactically identical operands and calls it a
            // self-comparison. All three findings in this tree were that idiom,
            // in `music`, `choose-action` and `ambient-life` — every one of them
            // a real test of a real property.
            //
            // It stays ON for `src/`, where `if (a === a)` really is a typo.
            'no-self-compare': 'off',
        },
    },

    {
        // ── BUILD AND DEV SCRIPTS: NODE ESM ────────────────────────────────
        files: ['scripts/**/*.mjs', 'scripts/**/*.js', '*.config.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },

    {
        // ── THE ELECTRON MAIN PROCESS: NODE CommonJS ───────────────────────
        //
        // `.cjs` on purpose — `package.json` sets `"type": "module"`, and
        // Electron's main process is `require`-based.
        files: ['electron/**/*.cjs'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.commonjs },
        },
    },
];
