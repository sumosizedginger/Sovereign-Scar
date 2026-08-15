// tests/harness.mjs
// Shared test harness: in-process static server, Chrome discovery, result sink.
// Browser specs receive a `page` and a `t` (assertion sink) and return nothing;
// they record pass/fail via t.ok(...). Pure-node specs just take a `t`.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from '../scripts/serve.mjs';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Start the static server on an ephemeral-ish port; resolve to { url, close }. */
export function startServer(port = 8765) {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => {
            resolve({
                url: 'http://127.0.0.1:' + port + '/',
                close: () => new Promise((res) => server.close(res))
            });
        });
    });
}

/** Locate a Chrome/Edge executable across env var + common Windows/Linux paths. */
export function findChrome() {
    return findChromeVerbose().path;
}

/**
 * Neutralise the Gamepad API for a test page. Call right after newPage().
 *
 * Headless Chrome enumerates the HOST machine's real controllers, and every
 * browser spec runs the game's real main loop — which polls the gamepad each
 * frame and feeds `Input.moveVector()`, which falls back to the stick whenever
 * no key is held. So whatever is plugged into the developer's desk was driving
 * the player during tests. A stick resting off-centre (held or drifting)
 * injected constant movement and made scripted-position specs flaky: it
 * diverted world-e2e's dash assertions sideways and failed
 * "phase boot hops the ledge" intermittently.
 *
 * Tests must not depend on what hardware is attached to the machine running
 * them. Gameplay pad handling is covered by tests/game/gamepad.spec.mjs.
 */
export async function disableGamepads(page) {
    await page.evaluateOnNewDocument(() => {
        navigator.getGamepads = () => [];
    });
}

/** Same search as findChrome(), but also returns the candidate list tried —
 * used to make CI failures self-diagnosing without needing log access. */
export function findChromeVerbose() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe')
            : null,
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
    ].filter(Boolean);
    for (const c of candidates) {
        try { if (fs.existsSync(c)) return { path: c, candidates }; } catch (e) { /* ignore */ }
    }
    return { path: null, candidates };
}

/** Append a markdown pass/fail summary to $GITHUB_STEP_SUMMARY when running in
 * Actions, so a failure is diagnosable from the (publicly visible) run summary
 * page without needing to sign in to view raw step logs. No-op elsewhere. */
export function writeStepSummary(sinks, extraNotes = []) {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (!file) return;
    const all = sinks.flatMap((s) => s.results.map((r) => ({ ...r, suite: s.label })));
    const failed = all.filter((r) => !r.pass);
    const skipped = all.filter((r) => r.skip);
    const ran = all.length - skipped.length;
    let md = '## Test results: ' + (ran - failed.length) + '/' + ran + ' passed';
    if (skipped.length) md += ' — :warning: **' + skipped.length + ' suite(s) skipped**';
    md += '\n\n';
    if (skipped.length) {
        md += '### Skipped (did not run)\n\n'
            + skipped.map((s) => '- `' + s.suite + '` — ' + s.detail).join('\n') + '\n\n';
    }
    if (failed.length) {
        md += '### Failures\n\n| Suite | Assertion | Detail |\n|---|---|---|\n';
        for (const f of failed) {
            md += '| ' + f.suite + ' | ' + f.name + ' | ' + String(f.detail).replace(/\|/g, '\\|') + ' |\n';
        }
        md += '\n';
    }
    if (extraNotes.length) {
        md += '### Notes\n\n' + extraNotes.map((n) => '- ' + n).join('\n') + '\n';
    }
    try { fs.appendFileSync(file, md); } catch (e) { /* best-effort only */ }
}

/** Escape a string for a GitHub Actions workflow-command field (::error::). */
function escapeAnnotation(s) {
    return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Emit one ::error:: workflow command per failed assertion when running in
 * Actions, so failures show up in the (publicly visible, no-login-required)
 * Annotations panel — unlike raw step logs and the job summary, which both
 * require signing in on this repo. No-op outside Actions. */
export function printErrorAnnotations(sinks) {
    if (!process.env.GITHUB_ACTIONS) return;
    for (const s of sinks) {
        for (const r of s.results) {
            if (r.pass) continue;
            console.log('::error title=' + escapeAnnotation('[' + s.label + '] ' + r.name)
                + '::' + escapeAnnotation(r.detail || '(no detail)'));
        }
    }
}

/**
 * ── PROCESS HYGIENE ────────────────────────────────────────────────────────
 *
 * Every spec in this suite runs in ONE Node process, in one order, with no
 * isolation. `REVIEW.md` §4.4 says so plainly and gives the receipt: three
 * specs installed a fake global `document` and never removed it, which defeated
 * `typeof document === 'undefined'` guards in PRODUCTION code for every spec
 * that ran afterwards. Each of those three passed on its own. The suite crashed
 * in order, in a fourth spec, with an error about a canvas.
 *
 * That class of bug is invisible from inside the spec that causes it, and its
 * symptom always appears somewhere else — which makes it the most expensive
 * kind of test failure there is to diagnose.
 *
 * `snapshotEnvironment()` and `environmentDrift()` are the two halves of a
 * cheap, general answer: take a fingerprint of the shared surface before a
 * spec, compare after, and turn any difference into a FAILING assertion
 * attributed to the spec that caused it. Not the spec that tripped over it
 * later. The one that did it.
 *
 * WHAT IS WATCHED, AND WHY IT IS THIS LIST
 *
 *   * the set of global names — catches `globalThis.document = …`, the actual
 *     historical bug, and anything else installed on the global object;
 *   * the identity of the functions a test is most tempted to stub —
 *     `Math.random` above all, because a spec that forces a deterministic roll
 *     and forgets to put it back makes every later spec deterministic too, and
 *     they will all still pass;
 *   * `process.env` keys, because an env var set for one spec changes what
 *     production code does in the next;
 *   * the shape of `Object.prototype` and `Array.prototype`, because a stray
 *     property on either is invisible until something iterates.
 *
 * WHAT IS NOT WATCHED, DELIBERATELY
 *
 * Module-level singleton state — the coach's spoken set, the score engine's
 * current track, saved progress. Those live inside modules, not on any shared
 * object, and no general fingerprint can see them. They are a real remaining
 * gap and `REVIEW.md` says so rather than implying this guard covers them.
 */
const WATCHED_FUNCTIONS = [
    ['Math.random', () => Math.random],
    ['Date.now', () => Date.now],
    ['JSON.parse', () => JSON.parse],
    ['JSON.stringify', () => JSON.stringify],
    ['console.log', () => console.log],
    ['console.warn', () => console.warn],
    ['console.error', () => console.error],
];

/** Fingerprint the shared surface a spec could dirty. */
export function snapshotEnvironment() {
    return {
        globals: new Set(Object.getOwnPropertyNames(globalThis)),
        env: new Set(Object.keys(process.env)),
        fns: WATCHED_FUNCTIONS.map(([name, get]) => [name, get()]),
        objectProto: Object.getOwnPropertyNames(Object.prototype).length,
        arrayProto: Object.getOwnPropertyNames(Array.prototype).length,
    };
}

/** What changed since `before`. Empty array means the spec cleaned up. */
export function environmentDrift(before) {
    const now = snapshotEnvironment();
    const out = [];

    for (const k of now.globals) {
        if (!before.globals.has(k)) out.push(`added global \`${k}\``);
    }
    for (const k of before.globals) {
        if (!now.globals.has(k)) out.push(`removed global \`${k}\``);
    }
    for (const k of now.env) {
        if (!before.env.has(k)) out.push(`set process.env.${k}`);
    }
    for (const k of before.env) {
        if (!now.env.has(k)) out.push(`deleted process.env.${k}`);
    }
    for (let i = 0; i < WATCHED_FUNCTIONS.length; i++) {
        const [name] = WATCHED_FUNCTIONS[i];
        if (before.fns[i][1] !== now.fns[i][1]) out.push(`left \`${name}\` replaced`);
    }
    if (before.objectProto !== now.objectProto) out.push('mutated Object.prototype');
    if (before.arrayProto !== now.arrayProto) out.push('mutated Array.prototype');

    return out;
}

/** A tiny assertion sink shared across specs. */
export function createSink(label) {
    const results = [];
    return {
        label,
        results,
        ok(name, pass, detail = '') {
            results.push({ name, pass: !!pass, detail });
            console.log((pass ? 'PASS' : 'FAIL') + '  [' + label + '] ' + name
                + (detail ? ' — ' + detail : ''));
            return !!pass;
        },
        /**
         * Record that a whole suite did NOT run.
         *
         * Every browser spec used to announce a missing Chrome as
         * `t.ok('chrome available (skipped)', true)` — a PASSING assertion. On a
         * machine with no Chrome the run printed a clean green while seventeen
         * suites and roughly 860 assertions never executed, and nothing in the
         * output could tell you the difference between "the campaign works" and
         * "no browser was installed". A skip is not a pass. It is not a failure
         * either — the exit code stays 0 so a no-browser box can still run the
         * unit half — but it must be impossible to miss in the summary.
         */
        skip(reason = 'skipped') {
            results.push({ name: label + ' did not run', pass: true, skip: true, detail: reason });
            console.log('SKIP  [' + label + '] suite did not run — ' + reason);
        },
    };
}

/** Print a combined summary and return the number of failures. */
export function summarize(sinks) {
    const all = sinks.flatMap((s) => s.results);
    const failed = all.filter((r) => !r.pass);
    const skipped = all.filter((r) => r.skip);
    const ran = all.length - skipped.length;
    const suiteWord = skipped.length === 1 ? 'SUITE' : 'SUITES';
    console.log('\n=== SUMMARY: ' + (ran - failed.length) + '/' + ran + ' passed'
        + (skipped.length ? ', ' + skipped.length + ' ' + suiteWord + ' SKIPPED' : '') + ' ===');
    if (failed.length) {
        console.log('Failed:');
        failed.forEach((f) => console.log(' - ' + f.name + ': ' + f.detail));
    }
    if (skipped.length) {
        // Loud on purpose. This is the line that stops a partial run from being
        // mistaken for a full one.
        console.log('\n!!! ' + skipped.length + ' ' + suiteWord
            + ' DID NOT RUN — THIS IS NOT A FULL PASS !!!');
        skipped.forEach((s) => console.log(' - ' + s.name + ': ' + s.detail));
    }
    return failed.length;
}
