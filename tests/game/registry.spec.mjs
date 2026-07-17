import { LEVELS, getLevel, nextLevelId, prevLevelId, levelIndex } from '../../src/game/levels/registry.js';

export function run(t) {
    t.ok('16 levels (C1: + overworld)', LEVELS.length === 16, `got ${LEVELS.length}`);
    t.ok('all have loaders', LEVELS.every((l) => typeof l.load === 'function'));
    t.ok('ids and names', LEVELS.every((l) => l.id && l.name));
    t.ok('getLevel crypt', getLevel('beat-01-crypt').name.includes('Crypt'));
    t.ok('fallback', getLevel('missing').id === LEVELS[0].id);
    const n = nextLevelId('beat-01-crypt');
    t.ok('next spindle', n === 'beat-02-spindle', `next=${n}`);
    const p = prevLevelId('beat-01-crypt');
    t.ok('prev overworld', p === 'overworld', `prev=${p}`);
    t.ok('last index', levelIndex('beat-14-leviathan') === 15);
    const ids = new Set(LEVELS.map((l) => l.id));
    t.ok('unique ids', ids.size === LEVELS.length);
}
