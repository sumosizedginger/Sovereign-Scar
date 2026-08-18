// tests/game/licence-agreement.spec.mjs — the three files say one thing.
//
// THE STATE THIS EXISTS TO PIN
//
// `LICENSE` and `package.json` said MIT with no carve-out. `README.md` said
// "MIT (inherits kit license). Game content © project authors." That sentence
// reserves nothing — MIT already leaves copyright with the author — but it
// READS like a reservation, so a stranger deciding whether they could fork the
// fourteen dungeons had to guess, and the machine-readable answer and the
// human-readable one pointed different ways.
//
// The owner settled it on 2026-08-17: MIT throughout, game content included.
//
// WHY A SPEC AND NOT JUST AN EDIT. A licence lives in three files that nothing
// links together. `package.json` is edited by tooling, `README.md` by whoever
// is documenting a feature, and `LICENSE` by nobody for years. They drifted
// apart once already without anyone noticing, and the next drift would be
// found by a stranger rather than by us. Nothing here judges WHICH licence is
// right — that is not a test's business. It judges that the three agree, and
// that the one sentence which caused the ambiguity has not come back.
//
// READ FROM DISK, NOT FROM A CONSTANT. The point is the files, so the files
// are the subject. A copy of the expected text in this spec would pass while
// `LICENSE` said anything at all.

import fs from 'node:fs';

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');

export function run(t) {
    const license = read('LICENSE');
    const readme = read('README.md');
    let pkg = {};
    try { pkg = JSON.parse(read('package.json')); } catch (e) { pkg = { _err: e.message }; }

    // ── 1. All three files exist and name a licence ────────────────────────
    t.ok('LICENSE exists', license.length > 0);
    t.ok('LICENSE is MIT', /^MIT License/m.test(license) &&
        /Permission is hereby granted, free of charge/.test(license),
        license.slice(0, 40));
    t.ok('package.json declares MIT', pkg.license === 'MIT', String(pkg.license));
    t.ok('LICENSE carries a copyright line', /Copyright \(c\) \d{4}/.test(license));

    // ── 2. The grant covers the content, and says so ───────────────────────
    //
    // This is the substance of the decision. MIT's own body says "the
    // Software" and never defines it; in a repository whose levels, story and
    // score ARE source code, an undefined "Software" is exactly the ambiguity
    // that started this. The preamble has to name them.
    const preamble = license.split('Permission is hereby granted')[0];
    for (const [what, re] of [
        ['levels', /level/i],
        ['narrative', /narrativ|story|text/i],
        ['designs', /design|character|boss/i],
        ['music', /music|score|audio/i],
    ]) {
        t.ok(`LICENSE names the ${what} as covered`, re.test(preamble),
            'not mentioned above the MIT grant');
    }
    t.ok('LICENSE states nothing is reserved', /nothing[^.]*reserved|no part[^.]*reserved/i.test(preamble),
        preamble.trim().slice(-80));

    // ── 3. The carve-out sentence has not come back ────────────────────────
    //
    // Named literally, because this is the exact string that was ambiguous.
    // Anywhere in the README, not just its licence section — a sentence that
    // reserves rights is no less confusing for sitting under a different
    // heading.
    t.ok('README does not reserve game content', !/Game content ©/i.test(readme),
        'the carve-out sentence is back in README.md');
    t.ok('README states the content is covered',
        /MIT,?\s*(and\s+)?includ\w+\s+the\s+game\s+content/i.test(readme),
        'README no longer says the content is MIT');

    // ── 4. Third-party terms still travel ──────────────────────────────────
    //
    // MIT for our work says nothing about three.js, and the Pages artifact
    // ships its licence file for a reason. Dropping this line while relaxing
    // ours is the plausible mistake.
    t.ok('LICENSE still points at vendored third-party terms',
        /Third-party components retain their own licenses/i.test(license) &&
        /lib\/three/.test(license));
    t.ok('the vendored three.js licence is on disk',
        fs.existsSync('lib/three/LICENSE'));

    // ── 5. The decision is recorded where a reader will look ───────────────
    const doc = read('docs/LICENSING.md');
    t.ok('docs/LICENSING.md records a settled decision',
        /Status:\s*settled/i.test(doc), doc.slice(0, 60));
    t.ok('README points at it', /docs\/LICENSING\.md/.test(readme));
}
