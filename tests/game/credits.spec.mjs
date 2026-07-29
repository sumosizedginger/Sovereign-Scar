// tests/game/credits.spec.mjs — the credit roll names the person who made it.
//
// This file exists because the roll got it wrong, and nothing noticed. It read:
//
//     ['ENGINE', 'My-Engine 0.2.0 — sumosizedginger'],
//     ['GAME',   'Sovereign Scar team'],
//     ...
//     ['MADE WITH', 'Claude'],
//
// A "team" that does not exist and never did, credited with the GAME, while the
// author's only appearance was on the ENGINE line — and the last name a player
// read on their way out of fourteen dungeons was the tool's. Anyone finishing
// this would have concluded a studio built it with some help. One person built
// it, and every design call in it is theirs.
//
// Attribution is not a cosmetic detail and it does not get to drift, so it is
// pinned the same way the combat rules are.

import { AUTHOR, CREDITS, CREDITS_SECONDS } from '../../src/game/ui/credits.js';

/** Flattened "LABEL: value" lines, blanks dropped. */
function lines() {
    return CREDITS
        .filter(([k, v]) => k || v)
        .map(([k, v]) => `${k}: ${v}`);
}

export function run(t) {
    const all = lines();
    const authored = CREDITS.filter(([, v]) => String(v).includes(AUTHOR));

    // ── The author is the subject of the roll ──────────────────────────────
    t.ok('the author is named', !!AUTHOR && AUTHOR.length > 2, AUTHOR);
    t.ok('the author is credited as the creator',
        CREDITS.some(([k, v]) => /CREATED BY/i.test(k) && v === AUTHOR),
        'CREATED BY');
    t.ok('the author is credited across the disciplines, not once',
        authored.length >= 8, `${authored.length} credits name ${AUTHOR}`);
    t.ok('the author is the most-credited name in the roll',
        authored.length > CREDITS.filter(([, v]) => /Claude/i.test(String(v))).length,
        `${authored.length} vs ${CREDITS.filter(([, v]) => /Claude/i.test(String(v))).length} for the tool`);

    // ── The specific things that were wrong ────────────────────────────────
    t.ok('no phantom team is credited with the game',
        !all.some((l) => /team/i.test(l)),
        all.filter((l) => /team/i.test(l)).join(' | ') || 'no "team" anywhere');
    {
        // The author's first credit must come before the tool's, and the ENGINE
        // line must not be the only place their name appears — that pairing is
        // exactly what the old roll did.
        const firstAuthor = CREDITS.findIndex(([, v]) => String(v).includes(AUTHOR));
        const firstTool = CREDITS.findIndex(([, v]) => /Claude/i.test(String(v)));
        t.ok('the author is credited before the tool',
            firstAuthor >= 0 && (firstTool < 0 || firstAuthor < firstTool),
            `author at ${firstAuthor}, tool at ${firstTool}`);
        const engineOnly = authored.length === 1
            && /ENGINE/i.test(String(authored[0][0]));
        t.ok('the author is credited for more than the engine', !engineOnly);
    }
    {
        // Design credit specifically: the roll has to say who decided the game,
        // not only who assembled it.
        const design = CREDITS.filter(([k, v]) =>
            /DESIGN|DIRECTION/i.test(k) && String(v).includes(AUTHOR));
        t.ok('the author holds the design and direction credits',
            design.length >= 4, design.map(([k]) => k).join(', '));
    }

    // ── The tool is still acknowledged, and kept in its place ──────────────
    t.ok('the tool is still credited',
        CREDITS.some(([k, v]) => /MADE WITH/i.test(k) && /Claude/i.test(String(v))),
        'MADE WITH Claude');
    t.ok('the tool is not credited with the game itself',
        !CREDITS.some(([k, v]) => /^(GAME|CREATED BY|DESIGN|DIRECTION)$/i.test(k)
            && /Claude/i.test(String(v))));

    // ── The roll is readable ───────────────────────────────────────────────
    // The scroll is a CSS keyframe whose SPEED depends on content height, so a
    // fixed duration meant every added line sped the roll up. Pinning the
    // relationship keeps a future addition from making it unreadable.
    t.ok('the roll paces itself against its own length',
        CREDITS_SECONDS >= CREDITS.length * 1.2,
        `${CREDITS_SECONDS}s for ${CREDITS.length} rows`);
    t.ok('the roll is not so long that nobody sees the end',
        CREDITS_SECONDS <= 90, `${CREDITS_SECONDS}s`);
}
