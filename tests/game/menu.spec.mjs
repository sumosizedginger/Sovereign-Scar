// tests/game/menu.spec.mjs
// Pure-node spec for the MenuState machine (ui/menu-state.js).

import { MenuState } from '../../src/game/ui/menu-state.js';
import { buildScreens } from '../../src/game/ui/menu.js';

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
    t.ok('board heading states the live score version',
        labels.some((l) => l.includes('MEDIUM · SCORE VERSION 1')));
    t.ok('other-version entries are excluded from the board',
        !labels.some((l) => l.includes('99999')));
    t.ok('current-version entries rank',
        labels.some((l) => l.startsWith('1. 9000')));
    t.ok('legacy entries without a version field rank as version 1',
        labels.some((l) => l.includes('8000')));
    t.ok('ineligible entries stay excluded',
        !labels.some((l) => l.includes('7000')));
}
