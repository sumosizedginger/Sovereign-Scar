import { FRICTION, getProfile } from '../../src/game/physics/friction-profiles.js';

export function run(t) {
    t.ok('sand slower', FRICTION.sand.groundDrag < FRICTION.default.groundDrag);
    t.ok('ice slipperier', FRICTION.ice.groundDrag > FRICTION.default.groundDrag);
    t.ok('fallback profile', getProfile('nope').label === 'default');
    t.ok('wind bias', FRICTION.wind.windVector.x > 0);
}
