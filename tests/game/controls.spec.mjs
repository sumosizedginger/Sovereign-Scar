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
import { CONTROLS, controlSheet, padSheet } from '../../src/game/input.js';

const SRC = new URL('../../src/game/input.js', import.meta.url);
const DOC = new URL('../../docs/CONTROLS.md', import.meta.url);
const HUD = new URL('../../src/game/ui/hud.js', import.meta.url);

/**
 * Gamepad buttons the handler genuinely reacts to.
 *
 * Same idea as `boundCodes`, applied to `pollGamepad`: read the indices the
 * handler tests (`pressed(N)` for edges, `b[N]` for held state) rather than
 * trusting the table to describe itself.
 */
function boundPadButtons(source) {
    const body = source.slice(source.indexOf('pollGamepad('));
    const found = new Set();
    for (const m of body.matchAll(/pressed\((\d+)\)/g)) found.add(+m[1]);
    for (const m of body.matchAll(/b\[(\d+)\]/g)) found.add(+m[1]);
    return found;
}

/** Stick axes the handler genuinely reads: `gp.axes?.[N]`. */
function boundPadAxes(source) {
    const body = source.slice(source.indexOf('pollGamepad('));
    const found = new Set();
    for (const m of body.matchAll(/gp\.axes\?\.\[(\d+)\]/g)) found.add(+m[1]);
    return found;
}

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
    // `|| []` because a pad-only binding (the right stick) has no key codes.
    const tabled = new Set(CONTROLS.flatMap((c) => c.codes || []));

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
    for (const c of CONTROLS.filter((x) => !x.dev && !x.padOnly)) {
        t.ok(`the HUD cheat sheet shows ${c.label}`, sheet.includes(c.label), sheet);
    }
    t.ok('the cheat sheet keeps no dev keys on it',
        !/God mode|Dev panel/i.test(sheet));
    t.ok('the cheat sheet stays short enough to sit in a corner',
        sheet.split('\n').length <= 4, `${sheet.split('\n').length} lines`);

    // --- the GAMEPAD legend, held to the same standard --------------------
    //
    // The keyboard sheet was unified into CONTROLS an earlier session and the
    // pad legend was left hand-written in `ui/hud.js`. It drifted, exactly as
    // the keyboard one had: it said **"D-up mood"**, while that button sets
    // `_moodToggle` — the same flag `KeyM` sets, which the table and the docs
    // both call mirror travel. One list left un-generated is one list free to
    // be wrong.
    const padBound = boundPadButtons(source);
    const padTabled = new Set(CONTROLS.flatMap((c) => c.padButtons || []));

    t.ok('the pad handler binds something', padBound.size > 8, `${padBound.size} buttons`);

    // D-pad down/left/right only synthesize menu navigation — they are not
    // gameplay verbs and have nothing to put on a legend.
    const MENU_ONLY = new Set([13, 14, 15]);
    const padUndocumented = [...padBound]
        .filter((i) => !padTabled.has(i) && !MENU_ONLY.has(i));
    t.ok('every gamepad button the game responds to is in the CONTROLS table',
        padUndocumented.length === 0, `missing buttons: ${padUndocumented.join(', ')}`);

    const padPhantom = [...padTabled].filter((i) => !padBound.has(i));
    t.ok('the CONTROLS table does not list buttons the handler ignores',
        padPhantom.length === 0, `phantom buttons: ${padPhantom.join(', ')}`);

    // Sticks, held to the same standard as buttons. `padAxes` exists to be
    // checked here — a field the table carries and nothing verifies is exactly
    // the decorative data this project has been bitten by before.
    const axesBound = boundPadAxes(source);
    const axesTabled = new Set(CONTROLS.flatMap((c) => c.padAxes || []));
    t.ok('the handler reads both sticks', axesBound.size === 4,
        `axes read: ${[...axesBound].sort().join(',')}`);
    t.ok('every stick axis the game reads is in the CONTROLS table',
        [...axesBound].every((i) => axesTabled.has(i)),
        `table has ${[...axesTabled].sort().join(',')}`);
    t.ok('the table does not list axes the handler ignores',
        [...axesTabled].every((i) => axesBound.has(i)),
        `phantom axes: ${[...axesTabled].filter((i) => !axesBound.has(i)).join(',')}`);

    const pad = padSheet();
    for (const c of CONTROLS.filter((x) => !x.dev && x.pad)) {
        t.ok(`the pad legend shows ${c.pad} (${c.action})`,
            pad.includes(c.pad), pad);
    }
    t.ok('the pad legend fits the same corner', pad.split('\n').length <= 4,
        `${pad.split('\n').length} lines`);
    // Match the hardcoded legend's own text, not a phrase that could appear in
    // a comment explaining why it was removed.
    const hudSrc = readFileSync(HUD, 'utf8');
    t.ok('the pad legend is generated, not hand-written',
        !/'Left stick move/.test(hudSrc),
        'ui/hud.js still assigns the hardcoded legend string');
    t.ok('the HUD imports the generator', /padSheet\(\)/.test(hudSrc));

    // The pad legend must not invent a button for a keyboard-only verb.
    for (const verb of ['Memory Vial', 'Entropy Dust', 'Mute']) {
        const entry = CONTROLS.find((c) => c.action === verb);
        t.ok(`${verb} stays keyboard-only`, entry && !entry.pad,
            'no button is mapped to it, so the legend must not claim one');
        t.ok(`the pad legend does not mention ${verb}`,
            !pad.toLowerCase().includes(verb.toLowerCase()), pad);
    }
    // Mute specifically: it gave up its trigger slot to the defensive verbs.
    t.ok('the triggers carry the defensive verbs, not mute',
        CONTROLS.find((c) => c.action === 'Lock on')?.padButtons?.[0] === 6
        && CONTROLS.find((c) => c.action.startsWith('Guard'))?.padButtons?.[0] === 7,
        'LT lock-on, RT guard — the Ocarina layout');

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
