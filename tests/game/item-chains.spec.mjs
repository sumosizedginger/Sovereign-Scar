// §7 acquisition chains: pure stage machines for the Resonance Fork and
// Entropy Dust side stories (narrative/item-chains.js). The overworld props
// are e2e-covered; these prove the stage logic and grant idempotence.

import { Inventory } from '../../src/game/kernel/inventory.js';
import {
    forkStage, dustStage, grantBuriedFrequency, collectUnstableSpore,
    FORK_FLAG_DORMANT, DUST_FLAG_DELIVERED, DUST_FLAG_DELIVERED_AT,
} from '../../src/game/narrative/item-chains.js';

function stubGame(inventory) {
    return {
        player: { inventory },
        hud: { toast() {}, story: { queue() {} } },
        persistInventory() {},
    };
}

export function run(t) {
    // ── Resonance Fork: none → frequency → dormant → active ──
    const inv = new Inventory();
    t.ok('fork chain starts at none', forkStage(inv) === 'none');

    const game = stubGame(inv);
    t.ok('engineer core grants the Buried Frequency', grantBuriedFrequency(game) === true);
    t.ok('fork stage advances to frequency', forkStage(inv) === 'frequency');
    t.ok('the frequency is granted once', grantBuriedFrequency(game) === false);

    inv.setFlag(FORK_FLAG_DORMANT); // the dig site does this on interact
    t.ok('dug-up Fork is dormant', forkStage(inv) === 'dormant');

    inv.grantItem('resonance_fork'); // the weather relay does this
    t.ok('relay activation completes the chain', forkStage(inv) === 'active');
    t.ok('a re-fired engineer grant cannot regress an active Fork',
        grantBuriedFrequency(stubGame(inv)) === false && forkStage(inv) === 'active');

    // ── Entropy Dust: none → spore → refining → refined → ready ──
    const inv2 = new Inventory();
    t.ok('dust chain starts at none', dustStage(inv2, 0) === 'none');

    const game2 = stubGame(inv2);
    t.ok('the Bone Forest spore starts the chain', collectUnstableSpore(game2) === true);
    t.ok('spore stage reached', dustStage(inv2, 3) === 'spore');
    t.ok('the spore is collected once', collectUnstableSpore(game2) === false);

    inv2.setFlag(DUST_FLAG_DELIVERED); // the engineer camp does this
    inv2.setFlag(DUST_FLAG_DELIVERED_AT, 3);
    t.ok('delivered dust refines until another wound seals',
        dustStage(inv2, 3) === 'refining');
    t.ok('one more boss readies the refined Dust', dustStage(inv2, 4) === 'refined');
    t.ok('delivery marker survives a save round-trip',
        dustStage(Inventory.fromJSON(inv2.toJSON()), 4) === 'refined');

    inv2.grantItem('entropy_dust'); // camp hands it over via collectOptionalItem
    t.ok('granted Dust ends the chain', dustStage(inv2, 4) === 'ready');
}
