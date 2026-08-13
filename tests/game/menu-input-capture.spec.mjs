// tests/game/menu-input-capture.spec.mjs — a menu owns the keyboard.
//
// THE BUG THIS EXISTS TO PIN
//
// `MenuOverlay` binds its own `window` keydown listener. `Input` binds another.
// Neither knew about the other, so a key pressed against an open menu reached
// both. Measured in the running game — pause menu open on `Resume`, a
// three-line conversation on screen, ONE Enter press:
//
//     BEFORE  story: "LINE ONE — the player has read this."   menu: open
//     AFTER   story: "LINE TWO — this one they have not."     menu: closed
//
// The press resumed the game AND advanced the dialogue, so line two was spent
// without ever being on screen alone. Enter was only the verb I happened to
// look at: `[` / `]` reach `loadLevel` outright and `M` reaches `onMoodToggle`,
// which in the overworld is Mirror travel. All four sit ABOVE the
// `if (!game.paused …)` guard in the frame loop, so pausing never stopped them.
//
// WHY THE GATE IS IN `input.js` AND NOT AT THE READ SITES
//
// The first fix put `&& !menu.isOpen` on each of the four consumers in the
// frame loop. It did nothing, and the probe said so. The menu closes
// SYNCHRONOUSLY inside its own listener, so by the time the next frame reads
// `menu.isOpen` it is already false — a guard written a frame downstream of the
// event it guards is testing a world that has already moved on.
//
// TWO CLAIMS, AND THE SECOND IS THE ONE THAT MATTERS
//
//   1. with a menu open, gameplay verbs do not latch
//   2. with no menu open, every one of them still does
//
// Without (2) this spec is passed by an input layer that ignores the player
// entirely, which is a worse bug than the one being fixed.

import { Input } from '../../src/game/input.js';
import { MenuState } from '../../src/game/ui/menu-state.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', '..', 'src', 'game');

const fakeDom = { addEventListener() {}, removeEventListener() {} };
const key = (code) => ({ code, preventDefault() {}, ctrlKey: false, shiftKey: false });

/**
 * Every keyboard verb that must not survive an open menu, as
 * [name, KeyboardEvent.code, how to read it back].
 *
 * Built from the latch table in `_onKeyDown` rather than from the four that
 * caused the bug — a verb missing from here fires from behind a menu and
 * nothing says so.
 */
const VERBS = [
    ['story advance', 'Enter', (i) => i.consumeStoryAdvance()],
    ['next beat', 'BracketRight', (i) => i.consumeLevelNext()],
    ['previous beat', 'BracketLeft', (i) => i.consumeLevelPrev()],
    ['mirror travel', 'KeyM', (i) => i.consumeMoodToggle()],
    ['interact', 'KeyE', (i) => i.consumeInteract()],
    ['grapple', 'KeyG', (i) => i.consumeGrapple()],
    ['memory vial', 'KeyV', (i) => i.consumeVial()],
    ['entropy dust', 'KeyC', (i) => i.consumeDust()],
    ['lock on', 'KeyT', (i) => i.consumeLockToggle()],
    ['switch target', 'KeyY', (i) => i.consumeLockCycle()],
    ['map', 'Tab', (i) => i.consumeMapToggle()],
    ['mute', 'KeyN', (i) => i.consumeMuteToggle()],
    ['cycle weapon', 'KeyR', (i) => i.consumeWeaponCycle() !== 0],
];

export function run(t) {
    // ── 1. With a menu open, nothing latches ────────────────────────────────
    for (const [name, code, read] of VERBS) {
        const input = new Input(fakeDom);
        input.setUiCapture(true);
        input._onKeyDown(key(code));
        t.ok(`menu open: ${name} does not fire`, !read(input), `code ${code}`);
    }

    // ── 2. …and with no menu open, every one of them still does ─────────────
    // The counterfactual for claim 1 is not "revert the fix", it is "leave the
    // gate shut", which is the cheapest way to pass claim 1 and the worst.
    for (const [name, code, read] of VERBS) {
        const input = new Input(fakeDom);
        input._onKeyDown(key(code));
        t.ok(`no menu: ${name} still fires`, !!read(input), `code ${code}`);
    }

    // ── 3. Pause is exempt, in both directions ──────────────────────────────
    // `Escape` is how the pause menu closes. A capture that swallowed it would
    // trap the player inside the menu with no way out — a softlock built by the
    // fix for a smaller bug.
    for (const code of ['Escape', 'KeyP']) {
        const input = new Input(fakeDom);
        input.setUiCapture(true);
        input._onKeyDown(key(code));
        t.ok(`menu open: ${code} still pauses`, input.consumePause(), 'the way out must stay open');
    }

    // ── 4. Releasing capture DRAINS ─────────────────────────────────────────
    // The two window listeners receive the same keydown and the order between
    // them is registration order, which is not a contract. If `Input` runs
    // first, the closing press latches before the menu has had its say. This is
    // that case: latch with no capture, then drop capture, as happens when the
    // frame loop notices the menu closed.
    {
        const input = new Input(fakeDom);
        input.setUiCapture(true);
        input._uiCapture = false;          // simulate the listener that ran first…
        input._onKeyDown(key('Enter'));    // …latching against a menu still open
        input._uiCapture = true;
        input.setUiCapture(false);         // frame loop sees the menu has closed
        t.ok('the closing press is drained, not spent late',
            !input.consumeStoryAdvance(),
            'a verb that fires after the menu closes reads as the game acting on its own');
    }

    // ── 5. Taking capture drains too ────────────────────────────────────────
    {
        const input = new Input(fakeDom);
        input._onKeyDown(key('KeyG'));     // pressed a frame before the menu opened
        input.setUiCapture(true);
        t.ok('a verb pending when the menu opens is dropped',
            !input.consumeGrapple(), 'grapple must not fire behind a menu');
    }

    // ── 6. The pad sends one button down two channels ───────────────────────
    // `A` is attack AND the menu's Enter; `D-up` is mirror travel AND the
    // menu's ArrowUp. Correct while exactly one of the two is listening.
    {
        const pad = (buttons) => ({
            id: 'test-pad', index: 0, connected: true, mapping: 'standard',
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: !!buttons[i], value: buttons[i] ? 1 : 0 })),
        });
        // `pressed(i)` is edge-triggered against the previous poll, so every
        // case needs a poll at rest before the poll that presses.
        const press = (input, buttons) => {
            input.pollGamepad([pad({})]);
            input.pollGamepad([pad(buttons)]);
        };

        // FIXTURE CHECK FIRST. If an un-armed pad simply reads as nothing, the
        // capture assertions below all pass for the wrong reason.
        const loose = new Input(fakeDom);
        press(loose, { 0: true, 12: true });
        const looseCodes = loose.consumeMenuCodes();
        t.ok('fixture: with no menu, pad A DOES attack',
            loose.consumeAttack(1 / 60), 'otherwise the capture assertions prove nothing');
        t.ok('fixture: with no menu, pad D-up DOES mirror-travel',
            loose.consumeMoodToggle(), `codes ${JSON.stringify(looseCodes)}`);

        const held = new Input(fakeDom);
        held.setUiCapture(true);
        press(held, { 0: true, 12: true });
        const codes = held.consumeMenuCodes();
        t.ok('menu open: pad A still reaches the menu', codes.includes('Enter'),
            `codes ${JSON.stringify(codes)}`);
        t.ok('menu open: pad D-up still reaches the menu', codes.includes('ArrowUp'),
            `codes ${JSON.stringify(codes)}`);
        t.ok('menu open: pad A does not also attack',
            !held.consumeAttack(1 / 60), 'one button, one action');
        t.ok('menu open: pad D-up does not also mirror-travel',
            !held.consumeMoodToggle(), 'D-up is ArrowUp while a menu is up');
        t.ok('menu open: pad Start still pauses',
            (() => { const i = new Input(fakeDom); i.setUiCapture(true); press(i, { 9: true }); return i.consumePause(); })(),
            'the way out must stay open on the pad too');
    }

    // ── 7. THE WIRING. Every assertion above stays green if nothing ever ────
    // calls `setUiCapture`, which is exactly the shape of the bug it replaced:
    // a correct mechanism nobody switched on. Read the frame loop.
    {
        const src = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
        t.ok('the frame loop hands capture to the input layer',
            /input\.setUiCapture\(\s*menu\.isOpen\s*\)/.test(src),
            'input.setUiCapture(menu.isOpen)');
        t.ok('…and the HUD is told too, so toasts stop painting over menus',
            /hud\.setMenuOpen\(\s*menu\.isOpen\s*\)/.test(src),
            'hud.setMenuOpen(menu.isOpen)');

        // ORDER, not just presence. Both must be set BEFORE the frame reads any
        // input, or they describe the previous frame's menu.
        const iCapture = src.indexOf('input.setUiCapture(menu.isOpen)');
        const firstConsume = src.search(/input\.consume[A-Z]/);
        t.ok('capture is taken before the frame consumes any input',
            iCapture > 0 && firstConsume > 0 && iCapture < firstConsume,
            `setUiCapture at ${iCapture}, first consume at ${firstConsume}`);
    }

    // ── 8. Toasts do not paint over an open menu ────────────────────────────
    // Same rule, other surface. 35 call sites raise toasts on game events that
    // know nothing about menus; the previous attempt at this MOVED the box from
    // `bottom: 48px` to `bottom: 186px` to dodge the story panel, and landed it
    // on the menu instead. Position cannot solve it — both boxes want the
    // middle of the screen and only one of them is being read.
    {
        const hudSrc = fs.readFileSync(path.join(SRC, 'ui', 'hud.js'), 'utf8');
        t.ok('HUD.toast returns early while a menu is open',
            /toast\s*\([^)]*\)\s*\{\s*\n\s*if \(this\._menuOpen\) return;/.test(hudSrc),
            'the guard is the first thing toast() does');
        t.ok('opening a menu hides whatever toast is already on screen',
            /setMenuOpen\([\s\S]{0,600}?toastEl\.style\.opacity = '0'/.test(hudSrc),
            'a toast raised before the menu opened must not survive it');
    }

    // ── 9. The menu state machine is unchanged by any of this ───────────────
    // A guard that quietly broke menu navigation would pass everything above.
    {
        const screens = {
            demo: () => ({
                title: 'DEMO',
                items: [
                    { type: 'text', label: 'not selectable' },
                    { type: 'action', id: 'a', label: 'A' },
                    { type: 'action', id: 'b', label: 'B' },
                ],
            }),
        };
        const st = new MenuState(screens, {});
        st.open('demo');
        t.ok('menu still opens on the first selectable row', st.sel === 1, `sel ${st.sel}`);
        st.move(1);
        t.ok('menu still moves', st.sel === 2, `sel ${st.sel}`);
        t.ok('menu still activates', st.activate()?.id === 'b', 'row B');
    }
}
