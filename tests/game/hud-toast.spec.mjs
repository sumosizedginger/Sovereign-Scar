// tests/game/hud-toast.spec.mjs
// Ticket D — "UI never repeats the same message." The HUD toast dedupes: a
// message identical to the one currently on screen refreshes its dwell timer
// instead of re-emitting, while a different message (or the same message after
// the toast has faded) produces a fresh emit. Runs in pure node over a minimal
// DOM shim — the HUD only touches `document` inside its constructor.

// Elements are plain bags: style is an object (Object.assign target),
// textContent/innerHTML are settable, and the tree methods are no-ops. That is
// everything HUD + StoryPanel construction reaches for.
function fakeEl() {
    return {
        style: {},
        textContent: '',
        innerHTML: '',
        id: '',
        children: [],
        appendChild(c) { this.children.push(c); return c; },
        querySelector() { return fakeEl(); },
        addEventListener() {},
        removeEventListener() {},
    };
}

function installDomShim() {
    globalThis.document = {
        createElement: () => fakeEl(),
        body: fakeEl(),
        getElementById: () => null,
    };
}

import { HUD } from '../../src/game/ui/hud.js';

export function run(t) {
    installDomShim();
    const hud = new HUD();

    // First message: emits, sets text, turns the toast on.
    hud.toast('Shard collected');
    t.ok('first toast emits', hud._toastEmits === 1, `emits=${hud._toastEmits}`);
    t.ok('toast text set', hud.toastEl.textContent === 'Shard collected');
    t.ok('toast visible', hud.toastEl.style.opacity === '1');

    // The same message twice more while it is still on screen: dwell refresh,
    // never a second/third emit — this is the "never repeats" guarantee.
    hud.toast('Shard collected');
    hud.toast('Shard collected');
    t.ok('identical message does not re-emit', hud._toastEmits === 1,
        `emits=${hud._toastEmits}`);

    // A genuinely different message always emits and swaps the text.
    hud.toast('Not enough Scar Shards');
    t.ok('different message emits', hud._toastEmits === 2, `emits=${hud._toastEmits}`);
    t.ok('toast text swapped', hud.toastEl.textContent === 'Not enough Scar Shards');

    // Same text again, still showing: still deduped.
    hud.toast('Not enough Scar Shards');
    t.ok('repeat of new message deduped', hud._toastEmits === 2,
        `emits=${hud._toastEmits}`);

    // Once the toast has faded, the same text is a legitimate fresh emit.
    hud._toastShownAt = performance.now() - (hud._toastMs + 100);
    hud.toast('Not enough Scar Shards');
    t.ok('same message after fade re-emits', hud._toastEmits === 3,
        `emits=${hud._toastEmits}`);

    // A shorter dwell must not be extended by the dedupe path — refreshing with
    // the same message keeps rescheduling the fade, but the message identity and
    // emit count are what the gate cares about; assert timer bookkeeping stays
    // coherent (ms tracks the latest call).
    hud.toast('Muted', 900);
    t.ok('emits on new short message', hud._toastEmits === 4);
    hud.toast('Muted', 900);
    t.ok('short message repeat deduped', hud._toastEmits === 4);
    t.ok('dwell length tracked', hud._toastMs === 900, `ms=${hud._toastMs}`);
}
