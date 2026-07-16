import { combatSweep, applyHit } from '../../src/game/combat/combat-sweeper.js';
import { ANCHOR_LINK } from '../../src/game/combat/weapons.js';
import { makeFacing } from '../../src/combat/facing.js';

function ent(x, z, extras = {}) {
    return {
        root: { position: { x, y: 0, z } },
        hitRadius: 0.4,
        state: { current: 'IDLE' },
        hp: 3,
        ...extras,
    };
}

export function run(t) {
    const atk = {
        root: { position: { x: 0, y: 0, z: 0 } },
        state: makeFacing(1),
    };
    atk.state.setFacing(1, 0);

    const front = ent(1.2, 0);
    const behind = ent(-1.2, 0);
    const far = ent(5, 0);
    const hits = combatSweep(atk, [front, behind, far], ANCHOR_LINK);
    t.ok('hits front', hits.includes(front));
    t.ok('misses behind', !hits.includes(behind));
    t.ok('misses far', !hits.includes(far));

    const r = applyHit(front, ANCHOR_LINK, atk);
    t.ok('damage applied', r.damage === ANCHOR_LINK.damage);
    t.ok('hp reduced', front.hp === 3 - ANCHOR_LINK.damage);

    front.hp = 0.5;
    const kill = applyHit(front, ANCHOR_LINK, atk);
    t.ok('kill flag', kill.killed);
    t.ok('marked dead', front.state.current === 'DEAD');

    const deadHits = combatSweep(atk, [front], ANCHOR_LINK);
    t.ok('dead skipped', deadHits.length === 0);

    const ghost = ent(1.0, 0);
    ghost.canHit = false;
    ghost.hp = 9;
    t.ok('dematerialized skipped', combatSweep(atk, [ghost], ANCHOR_LINK).length === 0);
    const blocked = applyHit(ghost, ANCHOR_LINK, atk);
    t.ok('canHit false blocks damage', blocked.blocked && ghost.hp === 9);

    const shield = ent(1.0, 0);
    shield.shielded = true;
    shield.hp = 5;
    // Shielded targets are still "hit" so onBlocked SFX can fire via applyHit
    t.ok('shielded included in sweep', combatSweep(atk, [shield], ANCHOR_LINK).includes(shield));
    const b2 = applyHit(shield, ANCHOR_LINK, atk);
    t.ok('shielded blocks applyHit', b2.blocked && shield.hp === 5);
}
