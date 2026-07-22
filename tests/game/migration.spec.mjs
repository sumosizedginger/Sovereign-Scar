// Save migration: old campaigns gain world, mode, lives, Thread, and score state.

import { getProgress, setProgress } from '../../src/engine/settings.js';
import {
    loadSovereignProgress,
    saveSovereignProgress,
    resetSovereignProgress,
    isBeatUnlocked,
} from '../../src/game/kernel/progress.js';

export function run(t) {
    // Plant a raw v1 save (pre-Phase-W shape, mid-campaign)
    setProgress({
        sovereignProgress: {
            version: 1,
            currentBeat: 'beat-07-sluice',
            unlockedBeats: ['beat-01-crypt', 'beat-02-spindle', 'sandbox-combat'],
            hp: 4.5,
            maxHp: 8,
            playTime: 1234,
            deaths: 3,
            bossesDefeated: ['crypt_warden', 'tri_compiler'],
            mood: 'abyss',
            inventory: { weapons: ['anchor_link', 'heavy_mallet'], activeWeapon: 'heavy_mallet' },
        },
    });

    const s = loadSovereignProgress();
    t.ok('migrated to v3', s.version === 3);
    t.ok('dungeons filled empty', s.dungeons && Object.keys(s.dungeons).length === 0);
    t.ok('overworld defaults filled',
        s.overworld && s.overworld.state === 'crust' && Array.isArray(s.overworld.visited));
    t.ok('progress kept: beat', s.currentBeat === 'beat-07-sluice');
    t.ok('progress kept: bosses', s.bossesDefeated.length === 2);
    t.ok('progress kept: hp/max', s.hp === 4.5 && s.maxHp === 8);
    t.ok('progress kept: inventory', s.inventory.activeWeapon === 'heavy_mallet');
    t.ok('progress kept: timers', s.playTime === 1234 && s.deaths === 3);
    t.ok('explicitly unlocked beat is open', isBeatUnlocked('beat-02-spindle', s));
    t.ok('currentBeat does not forge an unlock', !isBeatUnlocked('beat-07-sluice', s));

    t.ok('old saves default to Medium', s.runMode === 'medium');
    t.ok('old saves gain lives and score', s.lives?.maxCharges === 5 && s.score?.mode === 'medium');

    // Migration persisted (one-shot): the stored blob is v3 now
    const raw = (getProgress() || {}).sovereignProgress || {};
    t.ok('migration persisted', raw.version === 3 && !!raw.dungeons);

    // Migrated saves keep nested world state through unrelated saves
    saveSovereignProgress({ playTime: 2000 });
    const s2 = loadSovereignProgress();
    t.ok('nested fields survive top-level patch',
        s2.version === 3 && s2.overworld.state === 'crust' && s2.playTime === 2000);

    // Fresh saves are v3 from the start
    resetSovereignProgress();
    const fresh = loadSovereignProgress();
    t.ok('fresh save is v3', fresh.version === 3 && !!fresh.dungeons && !!fresh.overworld);
    t.ok('fresh progression opens overworld and beat 01',
        isBeatUnlocked('overworld', fresh) && isBeatUnlocked('beat-01-crypt', fresh));

    resetSovereignProgress('survival');
    const survival = loadSovereignProgress();
    saveSovereignProgress({ runMode: 'easy' });
    t.ok('run mode is immutable after campaign creation',
        survival.runMode === 'survival' && loadSovereignProgress().runMode === 'survival');
}
