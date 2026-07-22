// tests/game/coach.spec.mjs
//
// The coach exists because of a real failure: a bulwark's front plate refused
// every melee swing and said nothing but a clang. The player's only feedback
// was "my attacks do nothing", which reads as a broken game, not as a rule.
//
// Two properties matter and both are easy to lose in a refactor:
//   1. it speaks exactly once per id — a hint that repeats on every blocked
//      swing is spam, and spam is ignored, which is the same as silence;
//   2. it never throws when nothing is listening — combat code calls it from
//      inside hit resolution, and a headless spec or an early frame with no
//      HUD attached must not take the fight down with it.

import { coach, coachSpoken, setCoachSink, resetCoach } from '../../src/game/ui/coach.js';

export function run(t) {
    resetCoach();

    // --- silence is safe ----------------------------------------------------
    setCoachSink(null);
    let threw = false;
    try { coach('no-sink', 'nobody is listening'); } catch { threw = true; }
    t.ok('speaking with no HUD attached does not throw', threw === false);
    t.ok('...and it still burns the id, so the hint is not banked up',
        coachSpoken('no-sink') === true);

    // --- one shot -----------------------------------------------------------
    resetCoach();
    const said = [];
    setCoachSink((text, ms) => said.push({ text, ms }));

    t.ok('the first call is emitted', coach('armor-front', 'plate', 1000) === true);
    t.ok('the second is not', coach('armor-front', 'plate', 1000) === false);
    t.ok('a third is not either', coach('armor-front', 'plate again') === false);
    t.ok('exactly one line reached the HUD', said.length === 1, `${said.length}`);
    t.ok('the text and duration are passed through',
        said[0].text === 'plate' && said[0].ms === 1000, JSON.stringify(said[0]));

    // Distinct ids are distinct lessons.
    coach('other-hint', 'something else');
    t.ok('a different id is still allowed to speak', said.length === 2);

    // --- a new save gets its hints back --------------------------------------
    resetCoach();
    t.ok('nothing is remembered after a reset', coachSpoken('armor-front') === false);
    t.ok('and the hint speaks again on a fresh run',
        coach('armor-front', 'plate') === true);

    // --- bad input is inert ---------------------------------------------------
    t.ok('an empty id is refused rather than swallowing the next real hint',
        coach('', 'nothing') === false);
    t.ok('a missing id is refused too', coach(undefined, 'nothing') === false);

    setCoachSink(null);
    resetCoach();
}
