// C7: motif tables stay in lockstep with the level/region rosters.

import { BEAT_MOTIFS, REGION_MOTIFS } from '../../src/game/fx/motifs.js';

const BEATS = [
    'beat-01-crypt', 'beat-02-spindle', 'beat-03-sink', 'beat-04-sky',
    'beat-05-citadel', 'beat-06-quarry', 'beat-07-sluice', 'beat-08-bone',
    'beat-09-town', 'beat-10-cryo', 'beat-11-mire', 'beat-12-pyre',
    'beat-13-gumoi', 'beat-14-leviathan',
];
const REGIONS = [
    'tombfields', 'spindle', 'sinklands', 'citadel',
    'quarry', 'bonetown', 'cryomire', 'pyre',
];

function validMotif(m) {
    return m
        && typeof m.transpose === 'number'
        && m.transpose >= 0.5 && m.transpose <= 2
        && Array.isArray(m.pattern) && m.pattern.length >= 1
        && m.pattern.every((r) => typeof r === 'number' && r >= 0.25 && r <= 4);
}

export function run(t) {
    for (const id of BEATS) {
        t.ok(`beat motif: ${id}`, validMotif(BEAT_MOTIFS[id]),
            JSON.stringify(BEAT_MOTIFS[id] || null));
    }
    t.ok('no orphan beat motifs', Object.keys(BEAT_MOTIFS).every((k) => BEATS.includes(k)),
        Object.keys(BEAT_MOTIFS).filter((k) => !BEATS.includes(k)).join(','));

    for (const r of REGIONS) {
        t.ok(`region motif: ${r}`, validMotif(REGION_MOTIFS[r]),
            JSON.stringify(REGION_MOTIFS[r] || null));
    }
    t.ok('no orphan region motifs', Object.keys(REGION_MOTIFS).every((k) => REGIONS.includes(k)),
        Object.keys(REGION_MOTIFS).filter((k) => !REGIONS.includes(k)).join(','));

    // Distinctness: no two beats share both transpose and pattern
    const sig = (m) => `${m.transpose}|${m.pattern.join(',')}`;
    const sigs = BEATS.map((id) => sig(BEAT_MOTIFS[id]));
    t.ok('beat motifs distinct', new Set(sigs).size === sigs.length);
}
