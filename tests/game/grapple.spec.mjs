import { GrappleController } from '../../src/game/combat/grapple.js';
import { CollisionWorld } from '../../src/engine/collision.js';

export function run(t) {
    const g = new GrappleController();
    const ok = g.start({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, 10);
    t.ok('grapple starts', ok && g.active);
    let lastX = 0;
    for (let i = 0; i < 30; i++) {
        const r = g.update(1 / 30, null, 0.4);
        if (r.x != null) lastX = r.x;
    }
    t.ok('completes', !g.active);
    t.ok('pulled forward', lastX > 2, `x=${lastX}`);

    const g2 = new GrappleController();
    t.ok('range reject', !g2.start({ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, 10));

    const g3 = new GrappleController();
    const cw = new CollisionWorld();
    cw.addSolid({ minX: 1, maxX: 2, minZ: -2, maxZ: 2 });
    g3.start({ x: 0, y: 1, z: 0 }, { x: 6, y: 1, z: 0 }, 10);
    let cancelled = false;
    for (let i = 0; i < 40; i++) {
        const r = g3.update(1 / 30, cw, 0.4);
        if (r.cancelled) cancelled = true;
    }
    t.ok('blocked path ends grapple', cancelled || !g3.active);
}
