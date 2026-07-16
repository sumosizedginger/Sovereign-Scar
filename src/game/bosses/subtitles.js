// Boss intro card subtitles (A6) — grounded in the narrative bible's
// beat descriptions (§2–4). Keyed by boss id.

export const BOSS_SUBTITLES = {
    crypt_warden: 'Keeper of the Breach',
    tri_compiler: 'Three Minds, One Sentence',
    sand_spur: 'Serpent of the Duval Sink',
    kinetic_core: 'Momentum Made Hunger',
    proxy: 'Voice of the Leviathan',
    obsidian_arachnid: 'Queen of the Bleeding Quarry',
    hydroid_cloud: 'The Weeping Swarm',
    skeletal_mantis: 'Reaper of the Bone Forest',
    phantasm: 'What the Town Forgot',
    frost_and_fuel: 'Two Heads, Two Hungers',
    sludge_golem: 'The Mire That Reforms',
    magma_wyrm: 'Coil of the Pyre Peak',
    gumoi_witness: 'The Eye That Renders',
    leviathan: 'The Wound That Remembers',
};

export function bossSubtitle(id) {
    return BOSS_SUBTITLES[id] || '';
}
