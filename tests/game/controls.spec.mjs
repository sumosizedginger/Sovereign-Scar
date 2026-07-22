// tests/game/controls.spec.mjs — you cannot use a verb nobody told you about.
//
// This game had three lists of its own controls and all three disagreed:
//
//   src/game/input.js   the handler — the only one that was true
//   src/game/ui/hud.js  the on-screen sheet — no guard, no lock-on, no cycle
//                       target, no mirror travel, no beat cycle; AND it kept
//                       two hardcoded copies that had drifted apart
//   docs/CONTROLS.md    no Memory Vial, no Entropy Dust
//
// Guard and parry are the deepest mechanic in the combat system, gated behind
// a real item, with a 0.18s window and a poise economy — and the cheat sheet
// in the corner of the screen did not mention that the button existed.
//
// So this spec does not check that the lists agree with each other. It reads
// the HANDLER SOURCE, extracts every key code the game actually responds to,
// and requires each one to be present in the binding table and in the docs.
// Adding a binding without documenting it is a failing test, not a discovery
// the player makes eighteen months later.

import { readFileSync } from 'node:fs';
import { CONTROLS, controlSheet } from '../../src/game/input.js';

const SRC = new URL('../../src/game/input.js', import.meta.url);
const DOC = new URL('../../docs/CONTROLS.md', import.meta.url);

/** Codes the handler genuinely reacts to: `e.code === 'X'` and `keys.has('X')`. */
function boundCodes(source) {
    // Only scan the class body, so the CONTROLS table above it is not counted
    // as its own evidence — otherwise the table would prove itself.
    const body = source.slice(source.indexOf('export class Input'));
    const found = new Set();
    for (const m of body.matchAll(/e\.code === '([A-Za-z0-9]+)'/g)) found.add(m[1]);
    for (const m of body.matchAll(/keys\.has\('([A-Za-z0-9]+)'\)/g)) found.add(m[1]);
    for (const m of body.matchAll(/includes\(e\.code\)/g)) void m; // handled below
    // The dev-key array is matched as a list rather than one comparison each.
    const arr = body.match(/\[([^\]]*)\]\.includes\(e\.code\)/);
    if (arr) for (const m of arr[1].matchAll(/'([A-Za-z0-9]+)'/g)) found.add(m[1]);
    return found;
}

export function run(t) {
    const source = readFileSync(SRC, 'utf8');
    const docs = readFileSync(DOC, 'utf8');
    const tabled = new Set(CONTROLS.flatMap((c) => c.codes));

    // --- the table covers the handler -------------------------------------
    const bound = boundCodes(source);
    t.ok('the handler actually binds something', bound.size > 12, `${bound.size} codes`);

    // `KeyD` is both a movement key and half of the Ctrl+Shift+D dev toggle;
    // `ShiftF1` is a synthesised code, not a real KeyboardEvent.code.
    const exempt = new Set(['ShiftF1']);
    const undocumented = [...bound].filter((c) => !tabled.has(c) && !exempt.has(c));
    t.ok('every key the game responds to is in the CONTROLS table',
        undocumented.length === 0, `missing: ${undocumented.join(', ')}`);

    // --- and does not invent bindings that do not exist -------------------
    const phantom = [...tabled].filter((c) => !bound.has(c));
    t.ok('the CONTROLS table does not list keys the handler ignores',
        phantom.length === 0, `phantom: ${phantom.join(', ')}`);

    // --- the docs cover the table -----------------------------------------
    for (const c of CONTROLS) {
        // Match on the action wording, which is what a reader searches for.
        const needle = c.action.split(' (')[0].toLowerCase();
        t.ok(`docs/CONTROLS.md documents "${c.action}"`,
            docs.toLowerCase().includes(needle), c.label);
    }

    // --- the on-screen sheet covers the player-facing table ---------------
    const sheet = controlSheet();
    for (const c of CONTROLS.filter((x) => !x.dev)) {
        t.ok(`the HUD cheat sheet shows ${c.label}`, sheet.includes(c.label), sheet);
    }
    t.ok('the cheat sheet keeps no dev keys on it',
        !/God mode|Dev panel/i.test(sheet));
    t.ok('the cheat sheet stays short enough to sit in a corner',
        sheet.split('\n').length <= 4, `${sheet.split('\n').length} lines`);

    // --- the verbs that were missing are specifically present -------------
    // Named individually because these are the ones that were absent, and a
    // count-based assertion would not have caught their absence either.
    for (const verb of ['Guard', 'Lock on', 'Switch target', 'Mirror travel',
        'Memory Vial', 'Entropy Dust']) {
        t.ok(`"${verb}" is a documented verb`,
            CONTROLS.some((c) => c.action.startsWith(verb)));
        t.ok(`"${verb}" reaches the player's screen`,
            sheet.toLowerCase().includes(verb.toLowerCase()));
    }
}
