// One authored source for the main campaign's destination guidance.

export const THREAD_OBJECTIVES = Object.freeze([
    objective('reach_crypt', 'beat-01-crypt', 'crypt_warden', 'r2c2',
        'The Crypt is north. Something inside is still using my name.',
        'North. Cross the scarfield and enter the wound in the earth.',
        'SYSTEM: Enter the Crypt Breach on the north edge of the scarfield.'),
    objective('reach_spindle', 'beat-02-spindle', 'tri_compiler', 'r1c1',
        'The Link pulls northwest. Find the tower whose gears never stopped.',
        'Northwest. Follow the sound of stone gears beyond the tombfields.',
        'SYSTEM: Travel to screen r1c1 and enter the Eastern Spindle.'),
    objective('reach_sink', 'beat-03-sink', 'sand_spur', 'r3c1',
        'The second key drowned southwest of here. The Sink still listens.',
        'Southwest. Follow the dust flats to the basin cut below the ridge.',
        'SYSTEM: Travel to screen r3c1 and enter the Duval Sink.'),
    objective('reach_sky', 'beat-04-sky', 'kinetic_core', 'r0c3',
        'White stone cuts the northeastern sky. The final key waits above it.',
        'Northeast. Climb toward the white monument above the spindle country.',
        'SYSTEM: Travel to screen r0c3 and enter the Sky Monument.'),
    objective('reach_citadel', 'beat-05-citadel', 'proxy', 'r4c3',
        'Three keys answer far to the south. The Citadel has begun to notice us.',
        'South. Carry all three Memory Keys into the gold-veined approach.',
        'SYSTEM: Travel to screen r4c3 and enter the Citadel of the Proxy.'),
    objective('reach_quarry', 'beat-06-quarry', 'obsidian_arachnid', 'r4c0',
        'The Crust is above us now. Seven minds remain buried in the Abyss.',
        'West. Follow the bleeding slate until the ground becomes a quarry.',
        'SYSTEM: Travel to screen r4c0 and enter the Bleeding Quarry.'),
    objective('reach_sluice', 'beat-07-sluice', 'hydroid_cloud', 'r5c0',
        'The freed core hears water to the south. It calls the sound weeping.',
        'South. Keep to the western edge and follow the sound of floodgates.',
        'SYSTEM: Travel to screen r5c0 and enter the Sluice of Tears.'),
    objective('reach_bone', 'beat-08-bone', 'skeletal_mantis', 'r6c2',
        'Roots scrape east through the floor. The Bone Forest is growing downward.',
        'Southeast. Follow pale roots through the lowest country.',
        'SYSTEM: Travel to screen r6c2 and enter the Bone Forest.'),
    objective('reach_town', 'beat-09-town', 'phantasm', 'r6c4',
        'The next voice is east. A town is pretending its people never left.',
        'East. Follow the abandoned road beyond the Bone Forest.',
        'SYSTEM: Travel to screen r6c4 and enter the Ruined Town.'),
    objective('reach_cryo', 'beat-10-cryo', 'frost_and_fuel', 'r4c5',
        'Cold storage hums north. Something preserved there has learned to burn.',
        'North. Follow the frost line into the sealed vault country.',
        'SYSTEM: Travel to screen r4c5 and enter the Cryo Vault.'),
    objective('reach_mire', 'beat-11-mire', 'sludge_golem', 'r5c6',
        'The fifth voice points southeast. The Mire is counting rainfall like pages.',
        'Southeast. Follow the runoff until the ground starts breathing.',
        'SYSTEM: Travel to screen r5c6 and enter the Rot Mire.'),
    objective('reach_pyre', 'beat-12-pyre', 'magma_wyrm', 'r2c6',
        'The last engineer burns north of us. Pyre Peak is writing in magma.',
        'North. Follow the eastern wall until frost gives way to rust.',
        'SYSTEM: Travel to screen r2c6 and enter Pyre Peak.'),
    objective('reach_gumoi', 'beat-13-gumoi', 'gumoi_witness', 'r0c5',
        'Seven voices aggregate. GUMOI has opened its Tower in the northwest.',
        'Northwest. Follow the indexed sky to the tower watching the world.',
        'SYSTEM: Travel to screen r0c5 and enter the GUMOI Tower.'),
    objective('reach_leviathan', 'beat-14-leviathan', 'leviathan', 'r0c6',
        'The Core is east. The Leviathan has nowhere left to fold.',
        'East. Cross the final scar from the Tower into the Core.',
        'SYSTEM: Travel to screen r0c6 and enter the Leviathan Core.'),
]);

function objective(id, destinationBeat, bossId, destinationScreen, poetic, contextual, explicit) {
    return Object.freeze({
        id, stage: 0, destinationBeat, bossId, destinationScreen,
        lines: Object.freeze([poetic, contextual, explicit]),
    });
}

export function objectiveForProgress(progress) {
    const defeated = new Set(progress?.bossesDefeated || []);
    return THREAD_OBJECTIVES.find((o) => !defeated.has(o.bossId)) || null;
}

export function threadStateFor(objective, previous = {}) {
    if (!objective) return {
        objectiveId: 'campaign_complete', stage: 0, destinationBeat: null,
        destinationScreen: null, hintTier: 0, idleSeconds: 0,
        failedActions: {}, heard: previous.heard || [],
    };
    return {
        objectiveId: objective.id,
        stage: objective.stage,
        destinationBeat: objective.destinationBeat,
        destinationScreen: objective.destinationScreen,
        hintTier: previous.objectiveId === objective.id ? (previous.hintTier || 0) : 0,
        idleSeconds: previous.objectiveId === objective.id ? (previous.idleSeconds || 0) : 0,
        failedActions: previous.objectiveId === objective.id ? { ...(previous.failedActions || {}) } : {},
        heard: [...(previous.heard || [])],
    };
}
