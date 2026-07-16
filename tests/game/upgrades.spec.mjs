// tests/game/upgrades.spec.mjs
// Pure-node spec for the C3 Scar Shard economy (kernel/upgrades.js).

import { UPGRADES, nextCost, tryPurchase, damageMult, dashIframeBonus, grappleRange } from '../../src/game/kernel/upgrades.js';
import { Inventory } from '../../src/game/kernel/inventory.js';

export function run(t) {
    // Cost table
    t.ok('edge tier-1 cost', nextCost('edge', 0) === 60);
    t.ok('edge tier-2 cost', nextCost('edge', 1) === 140);
    t.ok('edge maxed → null', nextCost('edge', 2) === null);
    t.ok('unknown id → null', nextCost('nope', 0) === null);

    // Purchase path: deducts, levels, caps
    const inv = new Inventory();
    inv.addShards(210);
    const ups = {};
    let r = tryPurchase(inv, ups, 'edge');
    t.ok('purchase succeeds', r.ok && r.level === 1 && r.cost === 60);
    t.ok('shards deducted', inv.scarShards === 150);
    r = tryPurchase(inv, ups, 'edge');
    t.ok('tier 2 succeeds', r.ok && r.level === 2);
    t.ok('shards deducted again', inv.scarShards === 10);
    r = tryPurchase(inv, ups, 'edge');
    t.ok('maxed rejected', !r.ok && r.reason === 'maxed');
    r = tryPurchase(inv, ups, 'ghost');
    t.ok('overdraft rejected', !r.ok && r.reason === 'shards');
    t.ok('overdraft leaves shards intact', inv.scarShards === 10);

    // Derived stats
    t.ok('base damage mult', damageMult({}) === 1);
    t.ok('edge 2 → 1.5x', damageMult({ edge: 2 }) === 1.5);
    t.ok('base dash bonus 0', dashIframeBonus({}) === 0);
    t.ok('ghost 1 → +0.1s', Math.abs(dashIframeBonus({ ghost: 1 }) - 0.1) < 1e-9);
    t.ok('base grapple 8', grappleRange({}) === 8);
    t.ok('longarm 2 → 14', grappleRange({ longarm: 2 }) === 14);
    t.ok('null upgrades safe', damageMult(null) === 1 && grappleRange(null) === 8);

    // Catalogue sanity: every upgrade has 2 tiers and ascending costs
    for (const [id, u] of Object.entries(UPGRADES)) {
        t.ok(`${id} has 2 tiers`, u.costs.length === 2);
        t.ok(`${id} costs ascend`, u.costs[0] < u.costs[1]);
    }
}
