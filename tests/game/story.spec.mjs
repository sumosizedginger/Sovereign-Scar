// Story panel queue/advance without DOM paint issues.

import { StoryPanel } from '../../src/game/ui/story.js';

export function run(t) {
    // jsdom-less: StoryPanel needs document.body
    if (typeof document === 'undefined') {
        // Minimal stub
        globalThis.document = {
            body: {
                appendChild() {},
            },
            createElement() {
                return {
                    style: {},
                    id: '',
                    textContent: '',
                    innerHTML: '',
                    remove() {},
                };
            },
        };
    }

    const panel = new StoryPanel();
    t.ok('starts empty', panel.current == null && panel.queue_.length === 0);
    panel.queue([
        { speaker: 'A', text: 'Hello', hold: 1 },
        { speaker: 'B', text: 'World', hold: 1 },
    ]);
    t.ok('queue shows first', panel.current?.text === 'Hello', JSON.stringify(panel.current));
    t.ok('remaining one', panel.queue_.length === 1);
    panel.advance();
    t.ok('advance to second', panel.current?.text === 'World', JSON.stringify(panel.current));
    panel.advance();
    t.ok('advance clears', panel.current == null);
    panel.queue('plain string');
    t.ok('string line accepted', panel.current?.text === 'plain string');
    panel.update(10);
    t.ok('timer auto-advance', panel.current == null);
    panel.queue([{ speaker: 'X', text: 'old', hold: 5 }]);
    panel.queue([{ speaker: 'Y', text: 'new', hold: 5 }], { replace: true });
    t.ok('replace clears prior', panel.current?.text === 'new' && panel.queue_.length === 0, JSON.stringify(panel.current));
    panel.clear();
    t.ok('clear empties', panel.current == null && panel.queue_.length === 0);
    panel.dispose();
    t.ok('dispose ok', true);
}
