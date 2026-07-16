import { ANCHOR_LINK, HEAVY_MALLET, arcMove, getWeapon } from '../../src/game/combat/weapons.js';

export function run(t) {
    t.ok('anchor range', ANCHOR_LINK.range === 1.8);
    t.ok('anchor depth', ANCHOR_LINK.depthTolerance > 0.5 && ANCHOR_LINK.depthTolerance < 1.2);
    t.ok('mallet shatters', HEAVY_MALLET.shatter === true);
    const m = arcMove(2, 90, 1);
    t.ok('arcMove math', Math.abs(m.depthTolerance - 2 * Math.sin(Math.PI / 4)) < 1e-9);
    t.ok('fallback weapon', getWeapon('nope').id === 'anchor_link');
    t.ok('wedge stronger kb', getWeapon('tectonic_wedge').knockback > ANCHOR_LINK.knockback);
}
