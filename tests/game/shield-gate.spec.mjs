// tests/game/shield-gate.spec.mjs — the Bulwark Shield is a found item.
//
// Guard and parry used to be innate: the hero could block from the first frame
// of a new save, and the shield did not exist as an object at all. That is a
// pedagogy fault as much as a fiction one. Beat 01's declared theme is
// `telegraph` — "Read the Wind-Up" — and a player handed a shield on frame one
// answers every telegraph by holding a button, never learns to read one, and
// arrives at Beat 02 without the skill the first dungeon exists to teach.
//
// So the shield is placed partway through Beat 01, and these specs pin the
// shape that makes the gating teach instead of merely restrict:
//
//   rooms before it   → one enemy each, so a dodge is always sufficient
//   the pickup itself → exactly one, in Beat 01, before the boss
//   rooms after it    → may combine, because both answers now exist
//
// If someone later moves the shield earlier, or stacks a second enemy into the
// dodge-only stretch, these fail — which is the point. The gate is only
// defensible while the rooms in front of it are honestly clearable without it.

import { Inventory } from '../../src/game/kernel/inventory.js';
import { GuardController } from '../../src/game/combat/guard.js';
import { BEAT_LIST, BEAT_DEFS } from './_beat-defs.mjs';

const SHIELD = 'bulwark_shield';

/** Run every room's onBake and collect what it placed, per room. */
function bakePickups(def) {
    const byRoom = {};
    const ctx = {
        scene: { add() {}, remove() {} },
        particles: { spawn() {}, burst() {}, update() {} },
        collisionWorld: { addSolid() {}, removeSolid() {} },
    };
    for (const [rid, room] of Object.entries(def.rooms)) {
        byRoom[rid] = [];
        if (!room.onBake) continue;
        const taken = new Set();
        const level = {
            addPickup: (pos, data) => { byRoom[rid].push(data || {}); return data; },
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
        try {
            room.onBake(level, { x: 0, y: 0, z: 0 }, ctx);
        } catch (_) { /* geometry failures are another spec's job */ }
    }
    return byRoom;
}

/** Walk the room graph from the entry room, stopping at `stopRoom`. */
function roomsBefore(def, stopRoom) {
    const entry = def.entryRoom || Object.keys(def.rooms)[0];
    const seen = new Set();
    const queue = [entry];
    while (queue.length) {
        const id = queue.shift();
        if (seen.has(id) || id === stopRoom || !def.rooms[id]) continue;
        seen.add(id);
        for (const d of def.rooms[id].doors || []) {
            if (d.to && d.to !== '_world' && d.type !== 'boss') queue.push(d.to);
        }
    }
    return seen;
}

export function run(t) {
    // --- the item exists in the data model --------------------------------
    {
        const inv = new Inventory();
        t.ok('a new save has no shield', inv.hasItem(SHIELD) === false);
        inv.grantItem(SHIELD);
        t.ok('granting it takes', inv.hasItem(SHIELD) === true);
        t.ok('it survives a save round-trip',
            Inventory.fromJSON(JSON.parse(JSON.stringify(inv.toJSON()))).hasItem(SHIELD));
        t.ok('an old save without the field loads unshielded — the Beat 01 pickup regrants it',
            Inventory.fromJSON({ items: { phase_boot: true } }).hasItem(SHIELD) === false);
    }

    // --- the controller honours it ----------------------------------------
    {
        const g = new GuardController();
        g.hasShield = false;
        g.update(0.016, true);
        t.ok('holding guard with no shield does nothing', g.raised === false);
        g.hasShield = true;
        g.update(0.016, true);
        t.ok('holding guard with a shield raises it', g.raised === true);
    }

    // --- exactly one shield, in Beat 01 -----------------------------------
    let shieldRoom = null;
    let total = 0;
    for (const def of BEAT_LIST) {
        const byRoom = bakePickups(def);
        for (const [rid, picks] of Object.entries(byRoom)) {
            for (const p of picks) {
                if (!/shield/i.test(p.label || '')) continue;
                total += 1;
                if (def.id === 'beat-01-crypt') shieldRoom = rid;
            }
        }
    }
    t.ok('the campaign places exactly one shield', total === 1, `found ${total}`);
    t.ok('it is in Beat 01', !!shieldRoom, shieldRoom || 'not found');

    // --- everything before it is clearable by dodging ---------------------
    if (shieldRoom) {
        const def = BEAT_DEFS['beat-01-crypt'];
        const before = roomsBefore(def, shieldRoom);
        t.ok('the shield is not in the first room — the dodge is taught first',
            !before.has(shieldRoom) && before.size >= 1,
            `${before.size} room(s) before it: ${[...before].join(', ')}`);

        for (const rid of before) {
            const n = (def.rooms[rid].enemies || []).length;
            t.ok(`beat-01 ${rid}: at most one enemy before the shield is found`,
                n <= 1, `${n} enemies`);
        }

        // The room the shield is in, and everything after, may combine freely.
        const after = Object.keys(def.rooms).filter((r) => !before.has(r));
        const combined = after.filter((r) => (def.rooms[r].enemies || []).length > 1);
        t.ok('at least one room AFTER the shield combines both answers',
            combined.length >= 1, `combining rooms: ${combined.join(', ') || 'none'}`);
    }
}
