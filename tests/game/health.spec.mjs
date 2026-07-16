import { HealthPool } from '../../src/game/kernel/health.js';

export function run(t) {
    const h = new HealthPool(6);
    t.ok('starts full', h.hp === 6);
    const r = h.damage(2);
    t.ok('takes damage', r.accepted && h.hp === 4);
    const blocked = h.damage(1);
    t.ok('i-frames block', !blocked.accepted);
    h.iFrames = 0;
    h.damage(10);
    t.ok('death at 0', h.dead && h.hp === 0);
    const afterDeath = h.damage(1);
    t.ok('dead ignores damage', !afterDeath.accepted);
    h.fullRestore();
    t.ok('full restore', !h.dead && h.hp === 6);
    h.heal(100);
    t.ok('heal caps at max', h.hp === 6);
}
