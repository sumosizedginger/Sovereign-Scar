import { breakExpedition, createLivesState, consumeDeath, deathShardLoss, enterExpedition, refillCharges } from '../../src/game/kernel/lives.js';
import { DeathEcho } from '../../src/game/world/death-echo.js';
import * as THREE from 'three';

export function run(t) {
    let easy = createLivesState('easy');
    for (let i = 0; i < 50; i++) easy = consumeDeath(easy, 'easy').state;
    t.ok('Easy deaths never exhaust lives', easy.charges == null && easy.status === 'living');
    t.ok('Easy loses no shards', deathShardLoss(999, 'easy') === 0);

    let medium = enterExpedition(createLivesState('medium'), 'medium', 'beat-02-spindle');
    t.ok('Medium expedition starts at five', medium.charges === 5);
    for (let i = 0; i < 4; i++) medium = consumeDeath(medium, 'medium').state;
    const mediumBreak = consumeDeath(medium, 'medium');
    t.ok('Medium fifth death breaks expedition', mediumBreak.outcome === 'expedition_break' && mediumBreak.state.charges === 0);
    t.ok('altar refills Medium charges', refillCharges(mediumBreak.state, 'medium').charges === 5);
    t.ok('Medium loses ten percent carried', deathShardLoss(137, 'medium') === 13);

    // Spec 4.4/12.3: an expedition break ENDS that expedition. Re-entering
    // the same dungeon afterwards must start a fresh one at full charges —
    // the historical bug was enterExpedition seeing the old expeditionId and
    // resuming the stored zero-charge state.
    const stale = enterExpedition(mediumBreak.state, 'medium', 'beat-02-spindle');
    t.ok('same-dungeon re-entry WITHOUT break resolution keeps zero charges (guard exists)',
        stale.charges === 0);
    const resolved = breakExpedition(mediumBreak.state, 'medium');
    t.ok('breakExpedition clears the expedition id', resolved.expeditionId === null);
    const fresh = enterExpedition(resolved, 'medium', 'beat-02-spindle');
    t.ok('re-entering the SAME dungeon after a resolved break starts a fresh expedition',
        fresh.charges === 5 && fresh.expeditionId === 'beat-02-spindle');
    const freshDeath = consumeDeath(fresh, 'medium');
    t.ok('fresh expedition after break survives its first death',
        freshDeath.outcome === 'respawn' && freshDeath.state.charges === 4);
    t.ok('breakExpedition never revives sealed runs',
        breakExpedition({ charges: 0, status: 'dead' }, 'survival').status === 'dead');

    let hard = enterExpedition(createLivesState('hard'), 'hard', 'beat-02-spindle');
    hard = consumeDeath(hard, 'hard').state;
    hard = consumeDeath(hard, 'hard').state;
    const hardBreak = consumeDeath(hard, 'hard');
    t.ok('Hard third death breaks expedition', hardBreak.outcome === 'expedition_break');
    t.ok('Hard loses twenty percent carried', deathShardLoss(137, 'hard') === 27);

    const survival = consumeDeath(createLivesState('survival'), 'survival');
    t.ok('Survival first death seals run', survival.outcome === 'run_end'
        && survival.state.status === 'dead' && survival.state.charges === 0);

    let recovered = 0;
    const echo = new DeathEcho(new THREE.Scene(), { x: 0, y: 1, z: 0, amount: 27 },
        (amount) => { recovered += amount; });
    const collector = { root: { position: { x: 0, y: 1, z: 0 } }, health: { dead: false } };
    echo.update(0.016, collector);
    echo.update(0.016, collector);
    t.ok('Death Echo restores its exact amount once', recovered === 27, String(recovered));
    echo.dispose();
}
