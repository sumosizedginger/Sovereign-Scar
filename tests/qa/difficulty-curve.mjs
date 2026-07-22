// tests/qa/difficulty-curve.mjs — measurement, not assertion.
//
// ZeldaLevel.md listed the difficulty curve as something the Z1-Z7 plan could
// not fix, on the grounds that it had never been measured. This measures it.
//
// "Threat" is a deliberately crude scalar — sum over a dungeon's authored
// enemies of hp x damage, weighted by how demanding the kind is to answer.
// It is not a balance model. It only needs to be good enough to answer one
// question: does the campaign get harder, or does it wobble?

import { BEAT_LIST } from '../game/_beat-defs.mjs';
import { scaleEnemyHp } from '../../src/game/world/threat-curve.js';

// How much work a kind is to deal with, relative to a sentinel.
const KIND_WEIGHT = {
    sentinel: 1, scarab: 1.1, frost: 1.2,
    bulwark: 1.9,   // must be flanked or parried
    mote: 1.7,      // must be answered at range
    lancer: 1.6,    // must be dodged laterally
    brood: 1.8,     // becomes two problems
};

const rows = [];
for (const [i, def] of BEAT_LIST.entries()) {
    let threat = 0; let count = 0; let rooms = 0;
    const kinds = new Set();
    for (const room of Object.values(def.rooms)) {
        rooms++;
        for (const e of room.enemies || []) {
            const k = e.kind || 'sentinel';
            kinds.add(k);
            count++;
            threat += scaleEnemyHp(e.hp, i + 1) * (e.damage != null ? e.damage : 1)
                * (KIND_WEIGHT[k] || 1);
        }
    }
    rows.push({
        beat: i + 1,
        id: def.id.replace(/^beat-\d+-/, ''),
        rooms,
        enemies: count,
        threat: +threat.toFixed(1),
        perRoom: +(threat / rooms).toFixed(1),
        kinds: [...kinds].sort().join('+'),
    });
}

console.table(rows);

// Where does the curve go backwards?
const dips = [];
for (let i = 1; i < rows.length; i++) {
    if (rows[i].threat < rows[i - 1].threat) {
        dips.push(`${rows[i - 1].beat}->${rows[i].beat} (${rows[i - 1].threat} -> ${rows[i].threat})`);
    }
}
console.log('\nthreat total  :', rows.map((r) => r.threat).join(' '));
console.log('per-room      :', rows.map((r) => r.perRoom).join(' '));
console.log('dips          :', dips.length ? dips.join(', ') : 'none');
console.log('first->last   :', rows[0].threat, '->', rows[rows.length - 1].threat,
    `(x${(rows[rows.length - 1].threat / rows[0].threat).toFixed(1)})`);
