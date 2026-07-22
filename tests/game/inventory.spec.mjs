import { Inventory } from '../../src/game/kernel/inventory.js';

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
    for (let i = 0; i < 4; i++) t.ok(`Memory Vial chassis ${i + 1} is found`, inv.grantMemoryVialSlot());
    t.ok('Memory Vial chassis cap is four', !inv.grantMemoryVialSlot());
    const inv4 = Inventory.fromJSON(inv.toJSON());
    t.ok('Memory Vial chassis and fills persist', inv4.memoryVialSlots === 4
        && inv4.consumables.memoryVials === 4);
}
