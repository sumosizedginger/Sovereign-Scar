// tests/game/secret-taxonomy.spec.mjs — Z7.
//
// Two problems, one ticket.
//
// 1. UNIFORM REWARDS. Nearly every secret in the game paid the same currency:
//    stand here, receive 20-35 shards. Uniform rewards train the player to
//    stop looking, which quietly kills the exploration loop that is the entire
//    point of the genre. Zelda's curiosity engine runs on the possibility that
//    the thing behind the wall is a HEART PIECE.
//
// 2. REWARDS DISPATCHED BY DISPLAY NAME. Worse, and only visible once you try
//    to fix (1): the reward a pickup granted was inferred from its label —
//    /cache/i meant "Scar Suture", and a hard-coded list of three label strings
//    meant "Memory Vial". Renaming a pickup silently changed what the player
//    received. Reward type is data now (`reward: { type }`), and this spec
//    counts the ledger off that data.
//
// The ledger is load-bearing: sixteen Scar Sutures is exactly four optional
// hearts, and four Memory Vial chassis is exactly the slot cap. Shipping
// fifteen or seventeen is a silent balance bug no player could diagnose.

import { BEAT_LIST } from './_beat-defs.mjs';
import { OVERWORLD_SUTURES } from '../../src/game/overworld/world7.js';

const SUTURES_PER_HEART = 4;
const VIAL_SLOT_CAP = 4;

/** Bake a beat's authored pickups through a stub and classify each reward. */
function harvest(def) {
    const picked = [];
    const taken = new Set();
    const level = {
        addPickup: (pos, data) => { picked.push(data || {}); return data; },
        addEnemy() {}, addDummy() {}, addDestructible() {}, addSystem: (s) => s,
        addVoxelQuery: () => () => {},
        getVoxelAt: () => false,
        destructibles: [], enemies: [], pickups: [],
        keyStore: {
            mapPickup: () => false, markMapPickup() {},
            isPickupTaken: (id) => taken.has(id), markPickupTaken: (id) => taken.add(id),
            smallKeys: () => 0, hasBossKey: () => false,
            isOpen: () => false, open() {}, trySpendSmallKey: () => false,
            grantSmallKey() {}, grantBossKey() {}, grantKey() {}, markVisited() {},
        },
    };
    const ctx = {
        scene: { add() {}, remove() {} },
        particles: { spawn() {}, burst() {}, update() {} },
        collisionWorld: { addSolid() {}, removeSolid() {} },
    };
    const failures = [];
    for (const [rid, room] of Object.entries(def.rooms)) {
        if (!room.onBake) continue;
        try {
            room.onBake(level, { x: 0, y: 0, z: 0 }, ctx);
        } catch (err) {
            failures.push(`${def.id}:${rid} ${err.message}`);
        }
    }
    return { picked, failures };
}

const beatNoOf = (id) => Number(String(id).match(/beat-(\d+)/)?.[1] || 0);

/** Mirror of room-graph's reward resolution, including its legacy fallback. */
function rewardOf(p, beatNo) {
    if (p.reward?.type) return p.reward.type;
    const scoreType = p.scoreType
        || (p.reward ? 'secret' : null)
        || (/cache/i.test(p.label || '') ? 'secret' : null);
    if (scoreType === 'secret' && beatNo >= 7 && beatNo <= 14) return 'suture';
    return null;
}

export function run(t) {
    const totals = { suture: 0, vial: 0, lore: 0, currency: 0, other: 0 };
    const perBeat = new Map();
    const bakeFailures = [];

    for (const def of BEAT_LIST) {
        const beatNo = beatNoOf(def.id);
        const { picked, failures } = harvest(def);
        bakeFailures.push(...failures);

        const row = { suture: 0, vial: 0, lore: 0, currency: 0, other: 0 };
        for (const p of picked) {
            const r = rewardOf(p, beatNo);
            if (r === 'suture' || r === 'vial' || r === 'lore') row[r]++;
            else if (/cache|seam|shards/i.test(p.label || '')) row.currency++;
            else row.other++;
        }
        for (const k of Object.keys(row)) totals[k] += row[k];
        perBeat.set(def.id, row);
    }

    t.ok('every beat baked its pickups cleanly',
        bakeFailures.length === 0, bakeFailures.slice(0, 3).join(' | '));

    // --- the ledger --------------------------------------------------------
    const overworldSutures = Object.keys(OVERWORLD_SUTURES).length;
    const allSutures = totals.suture + overworldSutures;
    t.ok('the campaign grants a whole number of optional hearts',
        allSutures % SUTURES_PER_HEART === 0,
        `${totals.suture} dungeon + ${overworldSutures} overworld = ${allSutures}`);
    t.ok('four full optional hearts are obtainable',
        allSutures / SUTURES_PER_HEART === 4, `${allSutures} sutures`);
    t.ok('Memory Vial chassis exactly fill the slot cap',
        totals.vial === VIAL_SLOT_CAP, `vials=${totals.vial}`);

    // --- diversity ---------------------------------------------------------
    //
    // The rule the ticket exists to enforce: a secret must be able to be
    // something other than money.
    const nonCurrency = totals.suture + totals.vial + totals.lore;
    t.ok('most optional rewards are not currency',
        nonCurrency > totals.currency,
        `non-currency=${nonCurrency} currency=${totals.currency}`);
    t.ok('at least three kinds of reward are in play',
        [totals.suture, totals.vial, totals.lore].filter((n) => n > 0).length >= 3,
        JSON.stringify(totals));

    let beatsWithMemorableSecret = 0;
    for (const [id, row] of perBeat) {
        const memorable = row.suture + row.vial + row.lore;
        if (memorable > 0) beatsWithMemorableSecret++;
        else t.ok(`${id} offers a secret worth crossing the room for`, false,
            JSON.stringify(row));
    }
    t.ok('every dungeon hides at least one reward the player will remember',
        beatsWithMemorableSecret === BEAT_LIST.length,
        `${beatsWithMemorableSecret}/${BEAT_LIST.length}`);

    // Heart pieces must start early. A player who has not learned by the first
    // dungeon that looking around pays will not start looking in the ninth.
    const firstSuture = [...perBeat.values()].findIndex((r) => r.suture > 0);
    t.ok('the first heart piece is hidden in the first dungeon',
        firstSuture === 0, `first at beat index ${firstSuture}`);

    // Exactly one per dungeon. A promise the player can rely on is worth more
    // than a slightly larger total handed out unevenly — and it makes "have I
    // missed something here?" a question with a knowable answer.
    const offenders = [...perBeat].filter(([, r]) => r.suture !== 1);
    t.ok('every dungeon hides exactly one Scar Suture',
        offenders.length === 0,
        offenders.map(([id, r]) => `${id}=${r.suture}`).join(' '));

    // --- the data contract -------------------------------------------------
    for (const def of BEAT_LIST) {
        const { picked } = harvest(def);
        for (const p of picked) {
            if (!p.reward) continue;
            t.ok(`${def.id} "${p.label}" declares a known reward type`,
                ['suture', 'vial', 'lore', 'currency'].includes(p.reward.type),
                p.reward.type);
        }
    }
}
