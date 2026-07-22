// Campaign-owned run modes. These values are gameplay rules, not preferences.

export const RUN_MODES = Object.freeze({
    easy: Object.freeze({
        id: 'easy', name: 'Easy',
        enemyHp: 0.70, bossHp: 0.75, enemyDamage: 0.60,
        actionFrequency: 0.75, projectileSpeed: 0.85,
        telegraphDuration: 1.35, bossRecovery: 1.40,
        heartDropChance: 1.80, environmentDamage: 0.50,
        charges: null, shardLoss: 0, scoreMultiplier: 0.75,
        hintTier1: 30, hintTier2: 60,
    }),
    medium: Object.freeze({
        id: 'medium', name: 'Medium',
        enemyHp: 1, bossHp: 1, enemyDamage: 1,
        actionFrequency: 1, projectileSpeed: 1,
        telegraphDuration: 1, bossRecovery: 1,
        heartDropChance: 1, environmentDamage: 1,
        charges: 5, shardLoss: 0.10, scoreMultiplier: 1,
        hintTier1: 60, hintTier2: 120,
    }),
    hard: Object.freeze({
        id: 'hard', name: 'Hard',
        enemyHp: 1.20, bossHp: 1.15, enemyDamage: 1.35,
        actionFrequency: 1.20, projectileSpeed: 1.15,
        telegraphDuration: 0.85, bossRecovery: 0.80,
        heartDropChance: 0.65, environmentDamage: 1.25,
        charges: 3, shardLoss: 0.20, scoreMultiplier: 1.50,
        hintTier1: null, hintTier2: null,
    }),
    survival: Object.freeze({
        id: 'survival', name: 'Survival',
        enemyHp: 1.10, bossHp: 1.10, enemyDamage: 1.50,
        actionFrequency: 1.25, projectileSpeed: 1.20,
        telegraphDuration: 0.80, bossRecovery: 0.75,
        heartDropChance: 0.50, environmentDamage: 1.50,
        charges: 1, shardLoss: 0, scoreMultiplier: 2.50,
        hintTier1: null, hintTier2: null,
    }),
});

let activeMode = 'medium';

export function normalizeRunMode(mode) {
    if (mode === 'normal') return 'medium';
    return RUN_MODES[mode] ? mode : 'medium';
}

export function getRunMode(mode = activeMode) {
    return RUN_MODES[normalizeRunMode(mode)];
}

export function setActiveRunMode(mode) {
    activeMode = normalizeRunMode(mode);
    return getRunMode();
}

export function getActiveRunMode() {
    return getRunMode(activeMode);
}

export function runModeSummary(mode) {
    const m = getRunMode(mode);
    if (m.id === 'easy') return 'Infinite lives. Enemy HP 70%. Damage 60%. No shard loss. Full guidance.';
    if (m.id === 'medium') return '5 reconstructions per expedition. Baseline combat. 10% carried shard risk.';
    if (m.id === 'hard') return '3 reconstructions. Enemy HP 120%. Damage 135%. Faster threats. 20% carried shard risk.';
    return 'One life. Enemy HP 110%. Damage 150%. Death seals this campaign.';
}
