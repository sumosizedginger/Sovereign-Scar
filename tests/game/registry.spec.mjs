import fs from 'fs';
import { LEVELS, getLevel, nextLevelId, prevLevelId, levelIndex } from '../../src/game/levels/registry.js';

/**
 * `space` decides which contrast floor a level answers to in the certification
 * gate — 60 for enclosed rooms, 10 for open ground. It replaced an
 * `id.startsWith('beat-')` guess that would have handed the lax floor to any
 * dungeon named differently, silently, forever.
 *
 * Two properties matter and both are checked below: only the two genuinely open
 * levels declare `'open'`, and the DEFAULT is the strict floor, so a level added
 * without the field gets held to the harder standard rather than the easier one.
 * A default that fails safe is the whole reason this is data and not a guess.
 */
function checkSpace(t, LEVELS) {
    const OPEN = new Set(['overworld', 'sandbox-combat']);
    for (const meta of LEVELS) {
        const space = meta.space || 'enclosed';
        t.ok(`${meta.id} declares a valid space`, ['open', 'enclosed'].includes(space), space);
        if (OPEN.has(meta.id)) {
            t.ok(`${meta.id} is declared open ground`, space === 'open',
                'no walls around the play space, so it cannot reach a room\'s contrast');
        } else {
            t.ok(`${meta.id} is enclosed`, space === 'enclosed',
                'a dungeon must not be able to opt into the lax contrast floor');
        }
    }
    const openCount = LEVELS.filter((m) => m.space === 'open').length;
    t.ok('exactly two levels are open ground', openCount === 2, `${openCount}`);

    // ── THE DEFAULT FAILS SAFE ─────────────────────────────────────────────
    //
    // This assertion used to read:
    //
    //     ({}).space === undefined && (undefined || 'enclosed') === 'enclosed'
    //
    // Both halves are constants. `undefined || 'enclosed'` is 'enclosed' in
    // every JavaScript that has ever existed, so the assertion could not fail —
    // not if the fallback were changed to `'open'`, not if the two floors were
    // swapped, not if the whole `space` mechanism were deleted. It was a
    // decorative copy of the rule sitting next to the rule, which is the
    // failure shape `REVIEW.md` §5 names first, and the new linter is what
    // found it (`no-constant-binary-expression`).
    //
    // The rule does not live here. It lives in `visual-sanity.spec.mjs`, which
    // is the gate that reads `space` and picks a contrast floor from it. So
    // read THAT file and hold it to both halves of the claim: the fallback has
    // to be the enclosed one, and enclosed has to be the harder number.
    const gate = fs.readFileSync(
        new URL('../visual-sanity.spec.mjs', import.meta.url), 'utf8');

    t.ok('the certification gate defaults a missing `space` to enclosed',
        /space:\s*meta\.space\s*\|\|\s*'enclosed'/.test(gate),
        'forgetting the field must make a level harder to pass, never easier');

    const floors = gate.match(/CONTRAST_FLOORS\s*=\s*\{\s*dungeon:\s*(\d+),\s*open:\s*(\d+)\s*\}/);
    t.ok('…and the gate still declares two contrast floors', !!floors,
        'if this stops matching the assertion below is scanning nothing');
    t.ok('…and the enclosed floor is the STRICTER of the two',
        !!floors && Number(floors[1]) > Number(floors[2]),
        floors ? `dungeon ${floors[1]} vs open ${floors[2]}` : 'no floors found');
}

export function run(t) {
    t.ok('16 levels (C1: + overworld)', LEVELS.length === 16, `got ${LEVELS.length}`);
    t.ok('all have loaders', LEVELS.every((l) => typeof l.load === 'function'));
    t.ok('ids and names', LEVELS.every((l) => l.id && l.name));
    t.ok('getLevel crypt', getLevel('beat-01-crypt').name.includes('Crypt'));
    t.ok('fallback', getLevel('missing').id === LEVELS[0].id);
    const n = nextLevelId('beat-01-crypt');
    t.ok('next spindle', n === 'beat-02-spindle', `next=${n}`);
    const p = prevLevelId('beat-01-crypt');
    t.ok('prev overworld', p === 'overworld', `prev=${p}`);
    t.ok('last index', levelIndex('beat-14-leviathan') === 15);
    const ids = new Set(LEVELS.map((l) => l.id));
    t.ok('unique ids', ids.size === LEVELS.length);

    checkSpace(t, LEVELS);
}
