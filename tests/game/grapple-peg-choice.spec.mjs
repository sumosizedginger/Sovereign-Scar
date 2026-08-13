// tests/game/grapple-peg-choice.spec.mjs — a grapple crosses the gap.
//
// THE BUG THIS EXISTS TO PIN
//
// Owner report, 2026-08-13: "still with the grapple, pointed south in dungeon 4
// where you get the grappling hook, standing next to the gold pillar in the
// wall and hitting G locks onto the gold pillar in the wall, not the one across
// the gap."
//
// windworks is grid [1,-1] -> origin (64, -64). Measured in the running game:
//
//     chasm rect   world z -70 .. -66
//     pegs         z -65 (south rim, authored) and z -72 (north wall, mirrored)
//     north ledge  ONE standable strip, z -70.5
//
// The selection asked only WHICH PEG AM I AIMED MOST SQUARELY AT. Both pegs sit
// on the same axis, so on the return trip both scored a dot of 1.0 — and
// `dot >= bestDot` handed the tie to whichever came last in the array, which is
// the mirrored peg, which on the way back is the one you are standing beside.
//
// Tuning the 1.6 "too close" minimum would only move the distance at which the
// wrong answer starts. The right question is geometric and needs no constant: a
// grapple across a chasm exists to put you on the OTHER SIDE, so the line to the
// peg must pass through the chasm. That is symmetric, so the return trip is
// covered by the same rule and no facing can fool it.

import { segmentCrossesRect, grappleAimOk } from '../../src/game/world/blockers.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The real windworks numbers, not invented ones.
const RECT = { x0: 62, x1: 67, z0: -70, z1: -66 };
const PEG_SOUTH = { x: 64.5, z: -64.5 };   // authored peg + the 0.5 the code adds
const PEG_NORTH = { x: 64.5, z: -71.5 };   // mirrored peg + 0.5
const ON_NORTH_LEDGE = { x: 64.5, z: -70.5 };
const ON_SOUTH_SIDE = { x: 64.5, z: -64.0 };

export function run(t) {
    // ── 1. THE RULE, IN BOTH DIRECTIONS ────────────────────────────────────
    t.ok('from the north ledge, the SOUTH peg is across the gap',
        segmentCrossesRect(ON_NORTH_LEDGE, PEG_SOUTH, RECT));
    t.ok('…and the north peg, the one you are stood beside, is NOT',
        !segmentCrossesRect(ON_NORTH_LEDGE, PEG_NORTH, RECT),
        'this is the peg the owner kept getting yanked to');

    t.ok('from the south side, the NORTH peg is across the gap',
        segmentCrossesRect(ON_SOUTH_SIDE, PEG_NORTH, RECT));
    t.ok('…and the south peg is not',
        !segmentCrossesRect(ON_SOUTH_SIDE, PEG_SOUTH, RECT),
        'symmetric — the return trip needs no special case');

    // ── 2. THE PREDICATE ITSELF ────────────────────────────────────────────
    // A slab clip is easy to get subtly wrong, and every assertion above is
    // "true"/"false" on geometry the reader cannot see.
    {
        const r = { x0: 0, x1: 10, z0: 0, z1: 10 };
        t.ok('a segment straight through the middle crosses',
            segmentCrossesRect({ x: 5, z: -5 }, { x: 5, z: 15 }, r));
        t.ok('a segment that stops short does not',
            !segmentCrossesRect({ x: 5, z: -5 }, { x: 5, z: -1 }, r));
        t.ok('a segment that starts past it does not',
            !segmentCrossesRect({ x: 5, z: 11 }, { x: 5, z: 20 }, r));
        t.ok('a segment beside it, parallel, does not',
            !segmentCrossesRect({ x: 20, z: -5 }, { x: 20, z: 15 }, r));
        t.ok('a diagonal through a corner does',
            segmentCrossesRect({ x: -2, z: -2 }, { x: 4, z: 4 }, r));
        t.ok('a diagonal that misses the corner does not',
            !segmentCrossesRect({ x: -6, z: -1 }, { x: -1, z: -6 }, r));
        t.ok('a segment starting INSIDE crosses',
            segmentCrossesRect({ x: 5, z: 5 }, { x: 5, z: 30 }, r));
        // Degenerate: zero-length. Inside counts, outside does not.
        t.ok('a zero-length segment inside counts',
            segmentCrossesRect({ x: 5, z: 5 }, { x: 5, z: 5 }, r));
        t.ok('a zero-length segment outside does not',
            !segmentCrossesRect({ x: 50, z: 50 }, { x: 50, z: 50 }, r));
    }

    // ── 3. AIM ALONE CANNOT SEPARATE THEM — why the fix had to be geometric ─
    // Both pegs pass the aim test from the north ledge, with an IDENTICAL dot
    // of 1.0 for the far one and −1.0 for the near one only because the player
    // happens to be facing across. Turn around and the near peg wins on aim.
    // The crossing rule does not care which way the player is looking.
    {
        const facingSouth = { x: 0, z: 1 };
        const facingNorth = { x: 0, z: -1 };
        t.ok('facing across, the far peg passes the aim test',
            grappleAimOk(ON_NORTH_LEDGE, facingSouth, PEG_SOUTH, 11.5));
        t.ok('facing BACK at the wall, the near peg passes the aim test too',
            grappleAimOk(ON_NORTH_LEDGE, facingNorth, PEG_NORTH, 11.5),
            'aim cannot tell a crossing from a nudge — only geometry can');
        t.ok('…but the near peg is still rejected as same-side',
            !segmentCrossesRect(ON_NORTH_LEDGE, PEG_NORTH, RECT),
            'which is the whole point of the rule');
    }

    // ── 4. THE WIRING ──────────────────────────────────────────────────────
    // Everything above tests a PURE FUNCTION, and a pure function nobody calls
    // passes all of it. Deleting the call site from the selection loop left
    // this spec entirely green on the first counterfactual run, which is the
    // exact failure `wire-the-alarm-to-the-building` describes. So read the
    // loop.
    {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'src', 'game', 'world', 'blockers.js'), 'utf8');
        t.ok('the peg loop rejects pegs that are not across the rect',
            /if \(rectW && !segmentCrossesRect\(p, raw, rectW\)\) continue;/.test(src),
            'the crossing test is applied to each candidate');

        // …and BEFORE the aim/dot scoring, or a same-side peg can still win.
        const iCross = src.indexOf('!segmentCrossesRect(p, raw, rectW)');
        const iDot = src.indexOf('if (dot > bestDot');
        t.ok('…and rejects them before scoring, not after',
            iCross > 0 && iDot > 0 && iCross < iDot,
            `crossing at ${iCross}, scoring at ${iDot}`);

        // The tie-break, because on a straight two-peg gap every survivor
        // scores 1.0 and `>=` silently handed the choice to array order.
        t.ok('ties are broken by distance, not by array order',
            /Math\.abs\(dot - bestDot\) <= 1e-6 && d0 < bestDist/.test(src),
            'nearest crossing peg wins');
        t.ok('…and the old order-dependent `dot >= bestDot` is gone',
            !/if \(dot >= bestDot\)/.test(src), 'no bare >= comparison left');
    }
}
