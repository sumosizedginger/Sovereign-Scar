import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inventory, MEMORY_VIAL_CAP } from '../../src/game/kernel/inventory.js';
import { BEAT_LIST } from './_beat-defs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `beat-06-quarry` -> `beat-06-quarry.js`. */
const defFile = (id) => `${id}.js`;

export function run(t) {
    const inv = new Inventory();
    t.ok('default weapon', inv.activeWeapon === 'bare_strike');
    t.ok('default weapon list', inv.weapons.length === 1 && inv.weapons[0] === 'bare_strike');
    inv.addWeapon('anchor_link');
    t.ok('anchor link added', inv.weapons.includes('anchor_link'));
    t.ok('anchor link auto-equipped', inv.activeWeapon === 'anchor_link');
    inv.grantItem('heavy_mallet');
    t.ok('grant mallet', inv.hasItem('heavy_mallet'));
    t.ok('weapon list', inv.weapons.includes('heavy_mallet'));
    inv.grantMemoryKey('spindle');
    inv.grantMemoryKey('sink');
    t.ok('two keys', inv.memoryKeyCount === 2);
    t.ok('not all keys', !inv.hasAllMemoryKeys);
    inv.grantMemoryKey('sky');
    t.ok('all three keys', inv.hasAllMemoryKeys);
    inv.cycleWeapon(1);
    t.ok('cycle stays valid', inv.weapons.includes(inv.activeWeapon));
    const json = inv.toJSON();
    const inv2 = Inventory.fromJSON(json);
    t.ok('round-trip keys', inv2.memoryKeyCount === 3);
    t.ok('round-trip item', inv2.hasItem('heavy_mallet'));
    for (let i = 0; i < 3; i++) t.ok(`suture ${i + 1} does not form heart`, !inv.grantScarSuture().heartEarned);
    t.ok('fourth Scar Suture forms a heart', inv.grantScarSuture().heartEarned);
    const inv3 = Inventory.fromJSON(inv.toJSON());
    t.ok('Scar Sutures persist', inv3.scarSutures === 4);
    // Phase G — the cap is FIVE, because the campaign contains five vials:
    // four dungeon caches (beats 06, 11, 12, 13) and the overworld cache at
    // r0c0. It was four, so the fifth one a player found returned false
    // silently, printed nothing, and paid nothing — indistinguishable from the
    // other four right up to the moment you counted your slots.
    for (let i = 0; i < MEMORY_VIAL_CAP; i++) {
        t.ok(`Memory Vial chassis ${i + 1} is found`, inv.grantMemoryVialSlot());
    }
    t.ok('Memory Vial chassis cap is five', !inv.grantMemoryVialSlot(),
        `cap ${MEMORY_VIAL_CAP}`);
    const inv4 = Inventory.fromJSON(inv.toJSON());
    t.ok('Memory Vial chassis and fills persist',
        inv4.memoryVialSlots === MEMORY_VIAL_CAP
        && inv4.consumables.memoryVials === MEMORY_VIAL_CAP);

    // And the cap matches the CONTENT, which is the failure that produced it.
    // Counted from the level defs and the overworld rather than written down
    // twice: a number in one file quietly disagreeing with the amount of
    // content in five others is exactly how the fifth vial became a dead
    // pickup.
    {
        const sites = new Set();
        for (const def of BEAT_LIST) {
            const src = readFileSync(
                path.join(HERE, `../../src/game/levels/${defFile(def.id)}`), 'utf8');
            for (const m of src.matchAll(/collectMemoryVial\?\.\('([^']+)'\)/g)) {
                sites.add(m[1]);
            }
        }
        const world = readFileSync(
            path.join(HERE, '../../src/game/overworld/world7.js'), 'utf8');
        if (/collectMemoryVial/.test(world)) sites.add('overworld');
        t.ok('the cap is the amount of content there is',
            sites.size === MEMORY_VIAL_CAP,
            `${sites.size} grant sites vs a cap of ${MEMORY_VIAL_CAP}: `
            + [...sites].join(', '));
    }
}
