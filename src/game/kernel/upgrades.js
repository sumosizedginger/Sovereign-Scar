// C3: Scar Shard upgrade economy — pure logic, node-testable.
// Purchases persist under sovereignProgress.upgrades = { edge: 1, ... }.
//
// Presentation rule: upgrades are STATS ONLY. They must never change bloom,
// film, vignette, fog, materials, or quality. Combat readability stays stable
// for the whole run regardless of altar purchases (see mood-controller +
// MOOD_PRESETS presentation caps).

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
    magnet: {
        name: 'Shard Magnet',
        desc: '+50% soul-mote attraction speed',
        costs: [35, 90],
    },
    reservoir: {
        name: 'Anchor Reservoir',
        desc: '+1 Memory Vial slot',
        costs: [70, 160],
    },
    kintsugi: {
        name: 'Kintsugi Shell',
        desc: '-15% environmental damage',
        costs: [90, 200],
    },
    echo_lens: {
        name: 'Echo Lens',
        desc: 'Marks nearby memory seams',
        costs: [80],
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

export function environmentalDamageMult(upgrades) {
    return Math.max(0.5, 1 - 0.15 * ((upgrades && upgrades.kintsugi) || 0));
}

export function moteHomeSpeed(upgrades) {
    return 1 + 0.5 * ((upgrades && upgrades.magnet) || 0);
}

export function memoryVialSlots(upgrades) {
    return (upgrades && upgrades.reservoir) || 0;
}
