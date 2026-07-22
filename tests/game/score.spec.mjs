import { WitnessScore } from '../../src/game/kernel/score.js';

export function run(t) {
    const medium = new WitnessScore(null, 'medium');
    medium.extendChain();
    t.ok('valid hits extend the chain', medium.state.chain === 1.25);
    medium.resetChain();
    t.ok('enemy score pays', medium.award('enemy', 'room-a:0') === 100);
    t.ok('same encounter cannot repay', medium.award('enemy', 'room-a:0') === 0);
    t.ok('chain increases after a valid kill', medium.state.chain > 1);
    medium.resetChain();
    t.ok('damage reset clears chain', medium.state.chain === 1);
    t.ok('boss score pays separately', medium.award('boss', 'crypt_warden') === 5000);

    const survival = new WitnessScore(null, 'survival');
    t.ok('Survival score multiplier applies', survival.award('boss', 'crypt_warden') === 12500);
    survival.markUnranked();
    t.ok('developer use marks run unranked', survival.state.eligible === false);
}
