// tests/qa/time-to-kill.mjs — the measurement that matters.
//
// The kind-weight curve says the campaign gets harder. It says that because it
// only looks at the enemies. The player is not a constant: weapon damage triples
// across fourteen dungeons while authored enemy HP goes from 4 to 5.
//
// So the question is not "is the threat number rising" but "how many landed
// hits does an enemy survive, using the best weapon the player actually has at
// that point in the campaign". That number is what decides whether an enemy's
// behaviour ever gets to happen: a bulwark that dies in two swings cannot
// teach flanking, because deleting it is faster than walking around it.

import { BEAT_LIST } from '../game/_beat-defs.mjs';
import { scaleEnemyHp } from '../../src/game/world/threat-curve.js';

// Best melee damage available while playing beat N (1-indexed). Grants:
//   b01 anchor_link (1.0) · b05 tectonic_wedge (2.0) · b06 heavy_mallet (1.5)
// The wedge stays the damage king after beat 5; the mallet is a utility swap.
// Edge upgrade is +25% per tier, two tiers, ~60 and ~140 shards — assume a
// player who buys them buys tier 1 around beat 5 and tier 2 around beat 9.
function playerDamageAt(beat) {
    const base = beat <= 4 ? 1.0 : 2.0;
    const edge = beat >= 9 ? 1.5 : (beat >= 5 ? 1.25 : 1.0);
    return base * edge;
}

const rows = [];
for (const [i, def] of BEAT_LIST.entries()) {
    const beat = i + 1;
    const dmg = playerDamageAt(beat);
    const hps = [];
    for (const room of Object.values(def.rooms)) {
        for (const e of room.enemies || []) hps.push(scaleEnemyHp(e.hp, beat));
    }
    if (!hps.length) continue;
    const avg = hps.reduce((a, b) => a + b, 0) / hps.length;
    rows.push({
        beat,
        id: def.id.replace(/^beat-\d+-/, ''),
        avgHp: +avg.toFixed(1),
        playerDmg: dmg,
        hitsToKill: +(avg / dmg).toFixed(1),
        secondsToKill: +((avg / dmg) * 0.4).toFixed(2), // wedge cooldown
    });
}

console.table(rows);
console.log('\nhits-to-kill:', rows.map((r) => r.hitsToKill).join(' '));
const early = rows.slice(1, 5).reduce((a, r) => a + r.hitsToKill, 0) / 4;
const late = rows.slice(-6).reduce((a, r) => a + r.hitsToKill, 0) / 6;
console.log(`early (b2-5) avg ${early.toFixed(1)} hits  ->  late (b9-14) avg ${late.toFixed(1)} hits`);
console.log(late < early
    ? `INVERTED: late enemies are ${(early / late).toFixed(1)}x softer than early ones.`
    : 'curve holds.');
