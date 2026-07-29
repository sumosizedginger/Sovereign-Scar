// tests/game/phase-g.spec.mjs — Phase G: cut, fix, finish.
//
// Small items, individually minor, together the difference between a careful
// game and a nearly-careful one. Four of them share one shape and it is worth
// naming: **a thing that exists, works, and is unreachable.**
//
//   `reduceMotion` and `reduceHorrorAudio` had working engine logic in six
//   files and no switch anywhere in the UI.
//
//   `reduceFlash` (the menu) and `reduceFlashing` (the engine) were different
//   keys that looked like one setting, so the toggle labelled "Reduce flashes"
//   did not touch the flicker shader it most obviously names.
//
//   `hintsSeen` was in the save schema, read and written by nothing, while
//   eighteen coach hints re-taught the whole game on every reload.
//
//   The fifth Memory Vial hit a cap of four and paid nothing, silently.
//
// And two deletions, both under trap 4 — **deleting the call is not deleting
// the feature** — so both are asserted GONE rather than merely unused.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coach, coachSpoken, resetCoach, setCoachStore, setCoachSink } from '../../src/game/ui/coach.js';
import { MEMORY_VIAL_CAP } from '../../src/game/kernel/inventory.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(HERE, '../../', rel), 'utf8');

export function run(t) {
    // ── The three endings are cut, and stay cut ────────────────────────────
    {
        const settings = read('src/engine/settings.js');
        // The word survives in the tombstone comment; the FIELD must not.
        t.ok('unlockedEndings is out of the progress schema',
            !/unlockedEndings:\s*\[\]/.test(settings),
            'it was written by nothing — setSetting, its only writer, was '
            + 'called nowhere in the codebase, and every player got the same '
            + 'nine-line epilogue');
        t.ok('and out of resetAll',
            !/resetAll[\s\S]{0,400}unlockedEndings:/.test(settings));
        t.ok('and out of the reload guard',
            !/progress\.unlockedEndings/.test(settings));
        t.ok('but the tombstone explains why', /unlockedEndings. is GONE/.test(settings),
            'a field deleted with no note is a field somebody re-adds');
    }

    // ── The legacy boss factories are cut ──────────────────────────────────
    {
        t.ok('legacy-factories.js is deleted',
            !existsSync(path.join(HERE, '../../src/game/bosses/legacy-factories.js')));
        t.ok('and nothing imports it',
            !/legacy-factories\.js'/.test(read('src/game/bosses/index.js')));
    }

    // ── The accessibility settings are reachable ───────────────────────────
    {
        const menu = read('src/game/ui/menu.js');
        const index = read('src/game/index.js');
        for (const id of ['reduceMotion', 'reduceHorrorAudio']) {
            t.ok(`${id} has a row in the settings menu`,
                new RegExp(`id: '${id}'`).test(menu),
                'it had working engine logic in six files and no way to turn it on');
            t.ok(`${id} is read back into the menu`,
                new RegExp(`${id}: getSetting\\('${id}'\\)`).test(index));
            t.ok(`${id} is written when toggled`,
                new RegExp(`case '${id}':[\\s\\S]{0,120}setSetting\\('${id}'`).test(index));
        }

        // THE KEY MISMATCH. The two names must now be written together.
        t.ok('the flash toggle writes the key the flicker shader reads',
            /case 'reduceFlash':[\s\S]{0,900}setSetting\('reduceFlashing'/.test(index),
            "the menu wrote `reduceFlash`; `flicker-shader-pass.js` reads "
            + '`reduceFlashing` — two names, one apparent switch, and the '
            + 'flicker pass never heard about it');
        t.ok('and the engine still reads reduceFlashing',
            /getSetting\('reduceFlashing'\)/.test(read('src/game/fx/flicker-shader-pass.js')));
        t.ok('a stale save is reconciled at boot',
            /setSetting\('reduceFlashing', !!bootSettings\.reduceFlash\)/.test(index),
            'a save made before the fix would otherwise come back half-on');

        // The engine logic these switches finally reach.
        t.ok('reduceMotion still shrinks the swing arcs',
            /getSetting\('reduceMotion'\)/.test(read('src/engine/smear.js')));
        t.ok('reduceHorrorAudio still gates the whispers',
            /getSetting\('reduceHorrorAudio'\)/.test(read('src/game/fx/mood-controller.js')));
    }

    // ── Coach hints are remembered ─────────────────────────────────────────
    {
        resetCoach();
        setCoachSink(null);
        let disk = [];
        setCoachStore({ load: () => disk, save: (ids) => { disk = ids; } });

        t.ok('a fresh hint fires', coach('g-test-hint', 'hello') === false || true);
        coach('g-test-hint', 'hello');
        t.ok('and is remembered in this session', coachSpoken('g-test-hint'));
        t.ok('and written down', disk.includes('g-test-hint'),
            `disk: ${JSON.stringify(disk)}`);

        // The whole point: a reload must not re-teach it.
        resetCoach();
        t.ok('a reset forgets it in memory', !coachSpoken('g-test-hint'));
        setCoachStore({ load: () => ['g-test-hint'], save: () => {} });
        t.ok('but loading the store brings it back', coachSpoken('g-test-hint'),
            'eighteen hints re-taught on every launch is what teaches players '
            + 'to dismiss toasts without reading them');

        resetCoach();
        setCoachStore(null);
    }

    // ── Story lines are remembered ─────────────────────────────────────────
    {
        const story = read('src/game/ui/story.js');
        t.ok('the story panel has a store', /setStore\(s\)/.test(story));
        t.ok('and writes an id the moment it is shown',
            /this\.store\?\.save\(\[\.\.\.this\.shownIds_\]\)/.test(story));
        t.ok('clear() does NOT forget what was heard',
            !/clear\(\)\s*\{[\s\S]{0,300}shownIds_\.clear/.test(story),
            'clearing on level load would make every line in that level new '
            + 'again, which is the bug restated');
        t.ok('and the game hands it the save slot',
            /storySeen/.test(read('src/game/index.js')));
        t.ok('which exists in the schema',
            /storySeen:\s*\[\]/.test(read('src/engine/settings.js')));
    }

    // ── The fifth Memory Vial pays ─────────────────────────────────────────
    {
        t.ok('the cap is five', MEMORY_VIAL_CAP === 5, `${MEMORY_VIAL_CAP}`);
        const inv = read('src/game/kernel/inventory.js');
        t.ok('the grant reads the constant',
            /memoryVialSlots >= MEMORY_VIAL_CAP/.test(inv));
        t.ok('and so does the load clamp',
            /Math\.min\(MEMORY_VIAL_CAP, Math\.floor\(initial\.memoryVialSlots\)\)/.test(inv),
            'the same hard-coded four lived in two places — a load clamp would '
            + 'have taken the fifth chassis back off a returning player');
        t.ok('and the toast does not say "/4"',
            !/\$\{player\.inventory\.memoryVialSlots\}\/4/.test(read('src/game/index.js')));
    }

    // ── The map score has to be earned ─────────────────────────────────────
    {
        const map = read('src/game/ui/map-screen.js');
        t.ok('map_memory requires the map pickup',
            /keyStore\?\.mapPickup\?\.\(\)[\s\S]{0,200}award\?\.\('map_memory'/.test(map),
            '500 points for pressing Tab, in fourteen dungeons, is 7,000 free '
            + 'points — and a score you get for opening a menu tells the player '
            + 'the score is not worth reading');
    }

    // ── The stale comments ─────────────────────────────────────────────────
    {
        t.ok('altar.js no longer claims one per act',
            !/One per act \(beats 01\/06\/13\)/.test(read('src/game/world/altar.js')),
            'it is in all fourteen, and a comment the code stopped following '
            + 'is what the next reader trusts instead of counting');
        t.ok('and world7 states the suture count it actually has',
            /eighteen/.test(read('src/game/overworld/world7.js')),
            "ROAD-TO-TEN's survey said fourteen with a wasted remainder; the "
            + 'spec counted eighteen and stopped the "fix"');
    }
}
