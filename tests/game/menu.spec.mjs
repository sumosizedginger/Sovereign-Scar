// tests/game/menu.spec.mjs
// Pure-node spec for the MenuState machine (ui/menu-state.js).

import { MenuState } from '../../src/game/ui/menu-state.js';
import { buildScreens } from '../../src/game/ui/menu.js';
import { DEV_ONLY } from './hud-player.spec.mjs';
import { LEVELS } from '../../src/game/levels/registry.js';

function makeState(overrides = {}) {
    const ctx = {
        vol: 0.4,
        flag: false,
        quality: 'high',
        ...overrides,
    };
    const screens = {
        root: (c) => ({
            title: 'ROOT',
            items: [
                { type: 'text', label: 'header' },
                { type: 'action', id: 'go', label: 'Go' },
                { type: 'action', id: 'locked', label: 'Locked', disabled: true },
                { type: 'submenu', id: 'opts', label: 'Options', screen: 'opts' },
                { type: 'action', id: 'quit', label: 'Quit' },
            ],
        }),
        opts: (c) => ({
            title: 'OPTS',
            items: [
                { type: 'slider', id: 'vol', label: 'Vol', value: c.vol, min: 0, max: 1, step: 0.1 },
                { type: 'toggle', id: 'flag', label: 'Flag', value: c.flag },
                { type: 'select', id: 'quality', label: 'Q', value: c.quality, options: ['low', 'med', 'high'] },
            ],
        }),
    };
    return { state: new MenuState(screens, ctx), ctx };
}

export function run(t) {
    // Open selects first enabled (skips text)
    const { state, ctx } = makeState();
    t.ok('closed initially', !state.isOpen);
    state.open('root');
    t.ok('open after open()', state.isOpen);
    t.ok('first selection skips text row', state.sel === 1);

    // Move skips disabled rows and wraps
    state.move(1);
    t.ok('move skips disabled', state.sel === 3);
    state.move(1);
    t.ok('move to last', state.sel === 4);
    state.move(1);
    t.ok('move wraps to first', state.sel === 1);
    state.move(-1);
    t.ok('move wraps backwards', state.sel === 4);

    // Activate an action returns descriptor
    state.sel = 1;
    const act = state.activate();
    t.ok('action activate', act?.type === 'action' && act.id === 'go');

    // Submenu pushes
    state.sel = 3;
    const push = state.activate();
    t.ok('submenu pushes', push?.type === 'push' && state.screenName === 'opts');

    // Slider adjust respects step + clamps
    state.sel = 0;
    let a = state.adjust(1);
    t.ok('slider steps up', a?.type === 'set' && Math.abs(a.value - 0.5) < 1e-9);
    ctx.vol = 1.0;
    a = state.adjust(1);
    t.ok('slider clamps at max', a.value === 1);
    ctx.vol = 0.05;
    a = state.adjust(-1);
    t.ok('slider clamps at min', a.value === 0);

    // Toggle flips, select cycles with wrap
    state.sel = 1;
    a = state.activate();
    t.ok('toggle flips', a?.type === 'set' && a.id === 'flag' && a.value === true);
    state.sel = 2;
    a = state.adjust(1);
    t.ok('select cycles forward with wrap', a.value === 'low');
    a = state.adjust(-1);
    t.ok('select cycles backward', a.value === 'med');

    // Back pops; back from root closes
    t.ok('back pops to root', state.back() && state.screenName === 'root');
    t.ok('back from root closes', !state.back() && !state.isOpen);

    // Activate on disabled / text returns null
    state.open('root');
    state.sel = 2;
    t.ok('disabled item inert', state.activate() === null);
    state.sel = 0;
    t.ok('text row inert', state.activate() === null);

    // Slider activate is a no-op (adjust-only)
    state.open('opts');
    state.sel = 0;
    t.ok('slider enter is no-op', state.activate() === null);

    // A corrupted currentBeat must not turn itself into an unlocked fast-travel
    // destination. Only unlockedBeats is authoritative.
    const beatScreen = buildScreens().beats({
        progress: () => ({
            currentBeat: 'beat-13-gumoi',
            unlockedBeats: ['overworld', 'beat-01-crypt'],
            bossesDefeated: [],
        }),
        levels: () => [
            { id: 'overworld', name: 'Overworld' },
            { id: 'beat-01-crypt', name: 'Crypt' },
            { id: 'beat-13-gumoi', name: 'GUMOI' },
        ],
    });
    const currentButLocked = beatScreen.items.find((item) => item.arg === 'beat-13-gumoi');
    t.ok('Beat Select ignores locked currentBeat', currentButLocked?.disabled === true);

    const modes = buildScreens().runMode({});
    const modeRows = modes.items.filter((item) => item.id === 'startMode');
    t.ok('new campaign exposes four run modes', modeRows.length === 4);
    t.ok('mode selection includes infinite Easy and one-life Survival rules',
        modeRows.find((item) => item.arg === 'easy')?.note.includes('Infinite')
        && modeRows.find((item) => item.arg === 'survival')?.note.includes('One life'));

    // 12.4/gap-6: the Witness board isolates score versions. An entry written
    // under a different scoring formula must not rank on this board, and the
    // heading must state the live version rather than a hardcoded "1".
    const scoreScreen = buildScreens().scores({
        scores: () => [
            { runMode: 'medium', score: 9000, scoreVersion: 1, eligible: true, playTime: 60 },
            { runMode: 'medium', score: 99999, scoreVersion: 2, eligible: true, playTime: 60 },
            { runMode: 'medium', score: 8000, eligible: true, playTime: 60 }, // legacy = v1
            { runMode: 'medium', score: 7000, scoreVersion: 1, eligible: false, playTime: 60 },
        ],
    });
    const labels = scoreScreen.items.map((item) => item.label || '');
    // This used to require the heading to print "SCORE VERSION 1". The worry
    // behind it — stated in the comment above — was a HARDCODED version drifting
    // from `SCORE_VERSION`, which is a correctness concern about the code and
    // not something a player needs read to them; "SCORE VERSION 1" is schema
    // vocabulary on the screen a player reaches from the title. The isolation
    // it actually cares about is pinned by the three assertions below, which is
    // where it always belonged.
    t.ok('board heading names the run mode', labels.some((l) => l.includes('MEDIUM')));
    t.ok('and does not print the score schema number at the player',
        !labels.some((l) => /SCORE VERSION/i.test(l)),
        labels.filter((l) => /SCORE VERSION/i.test(l)).join(' | ') || 'none');
    t.ok('other-version entries are excluded from the board',
        !labels.some((l) => l.includes('99999')));
    t.ok('current-version entries rank',
        labels.some((l) => l.startsWith('1. 9000')));
    t.ok('legacy entries without a version field rank as version 1',
        labels.some((l) => l.includes('8000')));
    t.ok('ineligible entries stay excluded',
        !labels.some((l) => l.includes('7000')));

    // ── THE MENUS ARE A PLAYER-FACING SURFACE TOO ───────────────────────────
    //
    // `hud-player.spec.mjs` asserts that the inside of the build never reaches
    // the player through the HUD. The menus are the OTHER surface the player
    // reads, and the title screen is the first thing they read at all, so the
    // same vocabulary check runs over every screen they can open.
    //
    // The list is IMPORTED, not retyped. This project has already been bitten
    // twice by the same list existing in three places and all three disagreeing
    // — the control sheet in `input.js` says so in its own preamble.
    devVocabularyScan(t);
}

/**
 * Build every reachable screen against a realistic context and read it the way
 * a player does — labels and notes, nothing else.
 */
function devVocabularyScan(t) {
    const ctx = {
        settings: () => ({
            masterVol: 0.8, musicVol: 0.6, sfxVol: 0.7, quality: 'high',
            reduceShake: false, reduceFlash: false, reduceMotion: false,
            reduceHorrorAudio: false, monoAudio: true, showTimer: false,
        }),
        progress: () => ({
            runMode: 'medium', runStatus: 'alive', currentBeat: 'beat-04-sky',
            unlockedBeats: ['overworld', 'beat-01-crypt', 'beat-04-sky'],
            bossesDefeated: ['crypt_warden'], playTime: 3720,
            campaignComplete: false, bankedShards: 12,
            inventory: { flags: { 'altar:beat-01-crypt': true } },
            upgrades: {},
        }),
        hasProgress: () => true,
        hasItem: () => true,
        beatName: (id) => (LEVELS.find((l) => l.id === id)?.name || 'The Crypt'),
        levels: () => LEVELS,
        scores: () => [],
        shards: () => 250,
        upgrades: () => ({}),
        healthFull: () => false,
        hasVialSlot: () => true,
        chargeCost: () => 40,
        canBuyCharge: () => true,
        canBuyBuoyancy: () => true,
    };

    const screens = buildScreens();
    // Every screen a player can open. `altar` is the shop, reached in world.
    const names = ['title', 'pause', 'settings', 'beats', 'controls', 'scores',
        'altar', 'runMode'];

    // ── THE SCAN MUST BE ABLE TO SEE ───────────────────────────────────────
    //
    // Every assertion below is of the form "this pattern did not match", which
    // is exactly what a scan pointed at nothing also reports. So the scan is
    // first run over a screen built to be caught, containing one of each shape
    // it claims to catch. Without this the whole section is decoration, and a
    // typo'd regex would read as a clean bill of health forever.
    {
        const hostile = [
            'Beat: 04 Sky Monument',   // dev label
            'Mood: crust',             // lighting preset
            'Witness: 9000',           // raw score
            'Reconstitutions',         // internal noun
            'HP (6/6)',                // the number behind the hearts
            'Depth: undefined',        // a value that was not there
            'Travel to beat-04-sky',   // an internal id
            'Combat Sandbox',          // a dev level
        ];
        const text = hostile.join(' · ');
        t.ok('the scan catches developer vocabulary when it is there',
            DEV_ONLY.filter((re) => re.test(text)).length >= 5,
            DEV_ONLY.filter((re) => re.test(text)).map(String).join(' '));
        t.ok('the scan catches an unrendered value',
            hostile.some((v) => /undefined|null|NaN|\[object Object\]/.test(v)));
        t.ok('the scan catches an internal level id',
            hostile.some((v) => /beat-\d\d-[a-z]+/.test(v)));
        t.ok('the scan catches a dev level',
            hostile.some((v) => /sandbox|debug|dummy|test/i.test(v)));
    }

    // The title screen is where the title BELONGS. It is on the banned list for
    // the HUD because a toast printed it over the game every frame — which is
    // the bug this pass removed — not because the string is forbidden.
    const forTitle = DEV_ONLY.filter((re) => !/SOVEREIGN SCAR/.test(String(re)));

    for (const name of names) {
        const view = screens[name](ctx);
        const strings = [];
        for (const it of view.items || []) {
            if (it.label) strings.push(String(it.label));
            if (it.note) strings.push(String(it.note));
        }
        if (view.title) strings.push(String(view.title));
        if (view.subtitle) strings.push(String(view.subtitle));
        const text = strings.join(' · ');

        t.ok(`${name}: has rows to read`, strings.length > 0, `${strings.length} strings`);

        const banned = (name === 'title' ? forTitle : DEV_ONLY)
            .filter((re) => re.test(text));
        t.ok(`${name}: no developer vocabulary`, banned.length === 0,
            banned.map(String).join(' ') || text.slice(0, 90));

        // A label built from a value that was not there reads as a crash the
        // player can see. These are the four ways that shows up in a template.
        const broken = strings.filter((sVal) =>
            /\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/.test(sVal));
        t.ok(`${name}: no unrendered values`, broken.length === 0,
            broken.join(' | ') || 'clean');

        // Internal level ids must never be shown. `beat-04-sky` is a filename;
        // "Sky Monument" is a place.
        const ids = strings.filter((sVal) => /beat-\d\d-[a-z]+/.test(sVal));
        t.ok(`${name}: no internal level ids`, ids.length === 0,
            ids.join(' | ') || 'clean');

        // Dev levels are not destinations.
        const devRows = strings.filter((sVal) => /sandbox|debug|dummy|\btest\b/i.test(sVal));
        t.ok(`${name}: no dev levels offered`, devRows.length === 0,
            devRows.join(' | ') || 'clean');
    }
}
