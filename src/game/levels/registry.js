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
import { loadTestDungeon } from './dev-test-dungeon.js';
import { createOverworld } from '../overworld/overworld.js';
import { TEST_SCREENS } from '../overworld/screens.js';
import { WORLD7 } from '../overworld/world7.js';

export const LEVELS = [
    { id: 'sandbox-combat', name: 'Combat Sandbox', load: loadSandboxCombat, mood: 'crust', bossId: null },
    // C1: the connected overworld — 7×7 screens, both mirror states
    { id: 'overworld', name: 'The Scarred Crust', load: (ctx) => createOverworld(ctx, WORLD7, { levelId: 'overworld' }), mood: 'crust', bossId: null },
    { id: 'beat-01-crypt', name: '01 Crypt Breach', load: loadBeat01, mood: 'crust', bossId: 'crypt_warden' },
    { id: 'beat-02-spindle', name: '02 Eastern Spindle', load: loadBeat02, mood: 'crust', bossId: 'tri_compiler' },
    { id: 'beat-03-sink', name: '03 Duval Sink', load: loadBeat03, mood: 'crust', bossId: 'sand_spur' },
    { id: 'beat-04-sky', name: '04 Sky Monument', load: loadBeat04, mood: 'crust', bossId: 'kinetic_core' },
    { id: 'beat-05-citadel', name: '05 Citadel of the Proxy', load: loadBeat05, mood: 'crust', bossId: 'proxy' },
    { id: 'beat-06-quarry', name: '06 Bleeding Quarry', load: loadBeat06, mood: 'abyss', bossId: 'obsidian_arachnid' },
    { id: 'beat-07-sluice', name: '07 Sluice of Tears', load: loadBeat07, mood: 'abyss', bossId: 'hydroid_cloud' },
    { id: 'beat-08-bone', name: '08 Bone Forest', load: loadBeat08, mood: 'abyss', bossId: 'skeletal_mantis' },
    { id: 'beat-09-town', name: '09 Ruined Town', load: loadBeat09, mood: 'abyss', bossId: 'phantasm' },
    { id: 'beat-10-cryo', name: '10 Cryo Vault', load: loadBeat10, mood: 'abyss', bossId: 'frost_and_fuel' },
    { id: 'beat-11-mire', name: '11 Rot Mire', load: loadBeat11, mood: 'abyss', bossId: 'sludge_golem' },
    { id: 'beat-12-pyre', name: '12 Pyre Peak', load: loadBeat12, mood: 'abyss', bossId: 'magma_wyrm' },
    { id: 'beat-13-gumoi', name: '13 GUMOI Tower', load: loadBeat13, mood: 'abyss', bossId: 'gumoi_witness' },
    { id: 'beat-14-leviathan', name: '14 Leviathan Core', load: loadBeat14, mood: 'abyss', bossId: 'leviathan' },
];

// Dev-only levels: reachable via loadLevel/dev-panel teleport, but never in
// the player-facing LEVELS list (menus, beat cycling, e2e level sweeps).
export const DEV_LEVELS = [
    { id: 'w-test-dungeon', name: 'W Test Dungeon (dev)', load: loadTestDungeon, mood: 'crust', bossId: null },
    { id: 'w-test-overworld', name: 'W Test Overworld (dev)', load: (ctx) => createOverworld(ctx, TEST_SCREENS, { levelId: 'w-test-overworld' }), mood: 'crust', bossId: null },
];

export function getLevel(id) {
    return LEVELS.find((l) => l.id === id)
        || DEV_LEVELS.find((l) => l.id === id)
        || LEVELS[0];
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
