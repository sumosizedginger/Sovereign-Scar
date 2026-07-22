// tests/game/lock-on.spec.mjs — Z4, Z-targeting.
//
// Facing is derived from the movement vector (the A Link to the Past model),
// which in a 3D game means backing away from a boss points your sword at the
// far wall. The lock decouples the two. These specs pin acquisition priority,
// the hysteresis that stops a target flickering at max range, and — most
// importantly — that a dead or despawned target releases the lock, because a
// lock held on a corpse would freeze the player's facing mid-fight.

import {
    LockOnController, pickTarget, LOCK_RANGE, LOCK_BREAK_RANGE,
} from '../../src/game/combat/lock-on.js';

function mob(x, z, extra = {}) {
    return {
        root: { position: { x, y: 1, z } },
        state: { current: 'IDLE' },
        hitRadius: 0.5,
        ...extra,
    };
}

const ORIGIN = { x: 0, y: 1, z: 0 };
const NORTH = { x: 0, z: -1 };

export function run(t) {
    // --- acquisition ------------------------------------------------------
    {
        const near = mob(0, -3), far = mob(0, -12);
        t.ok('nearest valid target wins', pickTarget(ORIGIN, NORTH, [far, near]) === near);
    }
    {
        // The facing bias is a distance doubling at worst, so the rule is
        // exactly "something behind wins if it is less than half as far".
        const ahead = mob(0, -6), behindCloser = mob(0, 2);
        t.ok('a target practically on top of you behind still wins',
            pickTarget(ORIGIN, NORTH, [ahead, behindCloser]) === behindCloser);

        const behindMarginal = mob(0, 5);
        t.ok('a target only slightly closer behind does not steal the lock',
            pickTarget(ORIGIN, NORTH, [ahead, behindMarginal]) === ahead);
    }
    {
        const ahead = mob(0, -7), behindFar = mob(0, 9);
        t.ok('facing breaks the tie at comparable distance',
            pickTarget(ORIGIN, NORTH, [behindFar, ahead]) === ahead);
    }
    {
        t.ok('nothing outside lock range is acquired',
            pickTarget(ORIGIN, NORTH, [mob(0, -(LOCK_RANGE + 1))]) === null);
        t.ok('an empty room acquires nothing',
            pickTarget(ORIGIN, NORTH, []) === null);
        t.ok('a null candidate list is survivable',
            pickTarget(ORIGIN, NORTH, null) === null);
    }

    // --- what counts as a valid target ------------------------------------
    {
        const dead = mob(0, -2, { state: { current: 'DEAD' } });
        const live = mob(0, -8);
        t.ok('corpses are not targets', pickTarget(ORIGIN, NORTH, [dead, live]) === live);
    }
    {
        const zeroHp = mob(0, -2, { hp: 0 });
        const live = mob(0, -8);
        t.ok('a target at 0 hp is not acquired',
            pickTarget(ORIGIN, NORTH, [zeroHp, live]) === live);
    }
    {
        const beaten = mob(0, -2, { defeated: true });
        const live = mob(0, -8);
        t.ok('a defeated boss is not acquired',
            pickTarget(ORIGIN, NORTH, [beaten, live]) === live);
    }

    // --- toggle / cycle ---------------------------------------------------
    {
        const a = mob(0, -3), b = mob(3, -3);
        const lock = new LockOnController();
        lock.getCandidates = () => [a, b];

        t.ok('starts unlocked', lock.active === false);
        lock.toggle(ORIGIN, NORTH);
        t.ok('toggle acquires', lock.target === a);
        lock.toggle(ORIGIN, NORTH);
        t.ok('toggle releases', lock.active === false);

        lock.acquire(ORIGIN, NORTH);
        lock.cycle(ORIGIN, NORTH);
        t.ok('cycle moves to a different target', lock.target === b);
        lock.cycle(ORIGIN, NORTH);
        t.ok('cycle with two targets swaps back', lock.target === a);
    }
    {
        const only = mob(0, -3);
        const lock = new LockOnController();
        lock.getCandidates = () => [only];
        lock.acquire(ORIGIN, NORTH);
        lock.cycle(ORIGIN, NORTH);
        t.ok('cycling with a single target keeps the lock rather than dropping it',
            lock.target === only);
    }

    // --- the facing the lock produces -------------------------------------
    {
        const target = mob(5, 0);
        const lock = new LockOnController();
        lock.getCandidates = () => [target];
        lock.acquire(ORIGIN, NORTH);
        const f = lock.update(ORIGIN);
        t.ok('facing points at the target as a unit vector',
            Math.abs(f.x - 1) < 1e-6 && Math.abs(f.z) < 1e-6, JSON.stringify(f));
        t.ok('facing is normalized',
            Math.abs(Math.hypot(f.x, f.z) - 1) < 1e-6);
    }

    // --- breaking the lock ------------------------------------------------
    {
        const target = mob(0, -3);
        const lock = new LockOnController();
        lock.getCandidates = () => [target];
        lock.acquire(ORIGIN, NORTH);
        target.state.current = 'DEAD';
        const f = lock.update(ORIGIN);
        t.ok('a target that dies releases the lock immediately',
            lock.active === false && f === null);
    }
    {
        const target = mob(0, -3);
        const lock = new LockOnController();
        lock.getCandidates = () => [target];
        lock.acquire(ORIGIN, NORTH);

        // Hysteresis: past LOCK_RANGE but inside LOCK_BREAK_RANGE it holds.
        target.root.position.z = -(LOCK_RANGE + 2);
        t.ok('a target drifting just past acquisition range keeps the lock',
            lock.update(ORIGIN) !== null && lock.active === true);

        target.root.position.z = -(LOCK_BREAK_RANGE + 1);
        t.ok('a target leaving break range drops the lock',
            lock.update(ORIGIN) === null && lock.active === false);
    }
    {
        const lock = new LockOnController();
        t.ok('updating with no target is a no-op', lock.update(ORIGIN) === null);
        lock.release();
        t.ok('releasing nothing is safe', lock.active === false);
        t.ok('acquiring with no candidate source is safe',
            lock.acquire(ORIGIN, NORTH) === null);
    }

    // --- callbacks --------------------------------------------------------
    {
        const a = mob(0, -3);
        const lock = new LockOnController();
        lock.getCandidates = () => [a];
        let acquired = 0, released = 0;
        lock.onAcquire = () => acquired++;
        lock.onRelease = () => released++;
        lock.toggle(ORIGIN, NORTH);
        lock.toggle(ORIGIN, NORTH);
        t.ok('acquire/release callbacks fire once each',
            acquired === 1 && released === 1, `a=${acquired} r=${released}`);
    }
}
