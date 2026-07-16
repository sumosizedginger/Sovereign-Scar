// C3: Scar Shard upgrade economy — pure logic, node-testable.
// Purchases persist under sovereignProgress.upgrades = { edge: 1, ... }.

export const UPGRADES = {
    edge: {
        name: 'Edge',
        desc: '+25% weapon damage',
        costs: [60, 140],
    },
    ghost: {
        name: 'Ghost-step',
        desc: '+0.10s dash i-frames',
        costs: [50, 120],
    },
    longarm: {
        name: 'Long-arm',
        desc: '+3 grapple range',
        costs: [40, 100],
    },
};

/** Cost of the NEXT tier, or null when maxed. */
export function nextCost(id, level) {
    const u = UPGRADES[id];
    if (!u) return null;
    return level >= u.costs.length ? null : u.costs[level];
}

/**
 * Attempt a purchase. Mutates `inventory` (spendShards) and `upgrades` map.
 * @returns {{ok:boolean, reason?:string, level?:number, cost?:number}}
 */
export function tryPurchase(inventory, upgrades, id) {
    const level = upgrades[id] || 0;
    const cost = nextCost(id, level);
    if (cost == null) return { ok: false, reason: 'maxed' };
    if (!inventory.spendShards(cost)) return { ok: false, reason: 'shards' };
    upgrades[id] = level + 1;
    return { ok: true, level: level + 1, cost };
}

// ── Derived combat stats ────────────────────────────────────────────────────

export function damageMult(upgrades) {
    return 1 + 0.25 * ((upgrades && upgrades.edge) || 0);
}

export function dashIframeBonus(upgrades) {
    return 0.10 * ((upgrades && upgrades.ghost) || 0);
}

export function grappleRange(upgrades) {
    return 8 + 3 * ((upgrades && upgrades.longarm) || 0);
}
