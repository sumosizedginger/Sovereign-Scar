// Shared campaign fixture: the 14 beat definitions, in play order.
//
// Specs run synchronously (run-all's runNamed calls run(sink) directly), so
// dynamic import() is not available inside a spec — every consumer would
// otherwise repeat the same fourteen static imports. Keyed by beat id and
// insertion-ordered, so `Object.entries` walks the campaign in sequence and
// index comparisons ("is this introduced before that?") are meaningful.

import { BEAT01_DEF } from '../../src/game/levels/beat-01-crypt.js';
import { BEAT02_DEF } from '../../src/game/levels/beat-02-spindle.js';
import { BEAT03_DEF } from '../../src/game/levels/beat-03-sink.js';
import { BEAT04_DEF } from '../../src/game/levels/beat-04-sky.js';
import { BEAT05_DEF } from '../../src/game/levels/beat-05-citadel.js';
import { BEAT06_DEF } from '../../src/game/levels/beat-06-quarry.js';
import { BEAT07_DEF } from '../../src/game/levels/beat-07-sluice.js';
import { BEAT08_DEF } from '../../src/game/levels/beat-08-bone.js';
import { BEAT09_DEF } from '../../src/game/levels/beat-09-town.js';
import { BEAT10_DEF } from '../../src/game/levels/beat-10-cryo.js';
import { BEAT11_DEF } from '../../src/game/levels/beat-11-mire.js';
import { BEAT12_DEF } from '../../src/game/levels/beat-12-pyre.js';
import { BEAT13_DEF } from '../../src/game/levels/beat-13-gumoi.js';
import { BEAT14_DEF } from '../../src/game/levels/beat-14-leviathan.js';

export const BEAT_LIST = [
    BEAT01_DEF, BEAT02_DEF, BEAT03_DEF, BEAT04_DEF, BEAT05_DEF, BEAT06_DEF, BEAT07_DEF,
    BEAT08_DEF, BEAT09_DEF, BEAT10_DEF, BEAT11_DEF, BEAT12_DEF, BEAT13_DEF, BEAT14_DEF,
];

export const BEAT_DEFS = Object.fromEntries(BEAT_LIST.map((d) => [d.id, d]));
