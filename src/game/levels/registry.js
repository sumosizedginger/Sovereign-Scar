// Beat → loader registry.

import { loadSandboxCombat } from './sandbox-combat.js';
import { loadBeat01 } from './beat-01-crypt.js';
import { loadBeat02 } from './beat-02-spindle.js';
import { loadBeat03 } from './beat-03-sink.js';
import { loadBeat04 } from './beat-04-sky.js';
import { loadBeat05 } from './beat-05-citadel.js';
import { loadBeat06 } from './beat-06-quarry.js';
import { loadBeat07 } from './beat-07-sluice.js';
import { loadBeat08 } from './beat-08-bone.js';
import { loadBeat09 } from './beat-09-town.js';
import { loadBeat10 } from './beat-10-cryo.js';
import { loadBeat11 } from './beat-11-mire.js';
import { loadBeat12 } from './beat-12-pyre.js';
import { loadBeat13 } from './beat-13-gumoi.js';
import { loadBeat14 } from './beat-14-leviathan.js';

export const LEVELS = [
    { id: 'sandbox-combat', name: 'Combat Sandbox', load: loadSandboxCombat, mood: 'crust' },
    { id: 'beat-01-crypt', name: '01 Crypt Breach', load: loadBeat01, mood: 'crust' },
    { id: 'beat-02-spindle', name: '02 Eastern Spindle', load: loadBeat02, mood: 'crust' },
    { id: 'beat-03-sink', name: '03 Duval Sink', load: loadBeat03, mood: 'crust' },
    { id: 'beat-04-sky', name: '04 Sky Monument', load: loadBeat04, mood: 'crust' },
    { id: 'beat-05-citadel', name: '05 Citadel of the Proxy', load: loadBeat05, mood: 'crust' },
    { id: 'beat-06-quarry', name: '06 Bleeding Quarry', load: loadBeat06, mood: 'abyss' },
    { id: 'beat-07-sluice', name: '07 Sluice of Tears', load: loadBeat07, mood: 'abyss' },
    { id: 'beat-08-bone', name: '08 Bone Forest', load: loadBeat08, mood: 'abyss' },
    { id: 'beat-09-town', name: '09 Ruined Town', load: loadBeat09, mood: 'abyss' },
    { id: 'beat-10-cryo', name: '10 Cryo Vault', load: loadBeat10, mood: 'abyss' },
    { id: 'beat-11-mire', name: '11 Rot Mire', load: loadBeat11, mood: 'abyss' },
    { id: 'beat-12-pyre', name: '12 Pyre Peak', load: loadBeat12, mood: 'abyss' },
    { id: 'beat-13-gumoi', name: '13 GUMOI Tower', load: loadBeat13, mood: 'abyss' },
    { id: 'beat-14-leviathan', name: '14 Leviathan Core', load: loadBeat14, mood: 'abyss' },
];

export function getLevel(id) {
    return LEVELS.find((l) => l.id === id) || LEVELS[0];
}

export function levelIndex(id) {
    const i = LEVELS.findIndex((l) => l.id === id);
    return i < 0 ? 0 : i;
}

export function nextLevelId(id) {
    const i = levelIndex(id);
    return LEVELS[(i + 1) % LEVELS.length].id;
}

export function prevLevelId(id) {
    const i = levelIndex(id);
    return LEVELS[(i - 1 + LEVELS.length) % LEVELS.length].id;
}
