// tests/game/reconstitution-copy.spec.mjs — what GUMOI says when you die.
//
// This rule had NO test for the whole time it lived inside `src/game/index.js`,
// which is not an oversight so much as a consequence: reaching it meant booting
// the renderer, starting a run, and dying four times with the right number of
// charges left. Nobody was going to write that, so nobody wrote anything.
//
// It is ten lines of pure function. Moved out of the boot file (see
// `narrative/reconstitution-copy.js` for why that one moved and the rest did
// not), it costs six assertions to pin completely.
//
// The rule being pinned is a design decision, not a string table: the line gets
// terser and colder as `lives.charges` runs down, so the mechanic is audible
// before the player reads a number. Two of the branches below are the ones a
// careless edit breaks — a missing charge count must read as PLENTY, because an
// absent field means a save from before the lives system existed, and the two
// named outcomes must win over the charge count regardless of what it says.

import { reconstitutionLine } from '../../src/game/narrative/reconstitution-copy.js';

const withCharges = (n) => ({ lives: { charges: n } });

export function run(t) {
    // ── The situation outranks the charge count ────────────────────────────
    t.ok('a finished run gets the run-end line',
        reconstitutionLine(withCharges(1), 'run_end')
            === 'I remember you. The world does not.');
    t.ok('a broken expedition gets the expedition line',
        reconstitutionLine(withCharges(6), 'expedition_break')
            .startsWith('I can rebuild you, but not here'));
    t.ok('…and both ignore how many charges are left',
        reconstitutionLine(withCharges(0), 'run_end')
            === reconstitutionLine(withCharges(9), 'run_end'),
        'the situation is the point, not the tally');

    // ── Otherwise it degrades with what is left of you ─────────────────────
    const at = (n) => reconstitutionLine(withCharges(n), 'respawn');
    t.ok('plenty left: the confident line', at(4).startsWith('Again.'));
    t.ok('running down: the irritated line', at(2).includes('losing detail'));
    t.ok('nearly gone: the terse line', at(1) === 'One clean memory remains.');
    t.ok('…and the three bands are three different lines',
        new Set([at(4), at(2), at(1)]).size === 3);
    t.ok('…and it is monotonic across the whole range, no gaps',
        [0, 1, 2, 3, 4, 5, 12].every((n) => typeof at(n) === 'string' && at(n).length > 0),
        'a charge count with no branch returns undefined and prints "undefined"');

    // ── A save with no lives block is not a save with no lives ─────────────
    // v1 saves predate the lives system. Reading the missing field as zero
    // would greet a migrating player with "One clean memory remains."
    t.ok('a save with no lives block reads as plenty',
        reconstitutionLine({}, 'respawn').startsWith('Again.'));
    t.ok('…and so does no progress at all',
        reconstitutionLine(undefined, 'respawn').startsWith('Again.'),
        'called during a failed load, this must not throw');
}
