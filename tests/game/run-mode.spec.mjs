import { getRunMode, normalizeRunMode, setActiveRunMode } from '../../src/game/kernel/run-mode.js';
import { HealthPool } from '../../src/game/kernel/health.js';
import { Enemy } from '../../src/game/enemy.js';
import * as THREE from 'three';

export function run(t) {
    t.ok('legacy normal migrates to medium', normalizeRunMode('normal') === 'medium');
    t.ok('all four modes exist', ['easy', 'medium', 'hard', 'survival'].every((id) => getRunMode(id).id === id));
    t.ok('enemy HP differs on all four modes', new Set(['easy', 'medium', 'hard', 'survival'].map((id) => getRunMode(id).enemyHp)).size === 4);
    t.ok('enemy damage differs on all four modes', new Set(['easy', 'medium', 'hard', 'survival'].map((id) => getRunMode(id).enemyDamage)).size === 4);
    t.ok('hard pressure is timing-led, not sponge-led', getRunMode('hard').enemyHp === 1.2
        && getRunMode('hard').actionFrequency > 1 && getRunMode('hard').telegraphDuration < 1);
    t.ok('easy has infinite charges', getRunMode('easy').charges == null);
    t.ok('survival has exactly one life', getRunMode('survival').charges === 1);

    const scene = new THREE.Scene();
    const measured = [];
    for (const id of ['easy', 'medium', 'hard', 'survival']) {
        setActiveRunMode(id);
        const enemy = new Enemy(scene, null, { x: 0, z: 0 }, { hp: 10 });
        measured.push({ hp: enemy.maxHp, windup: enemy.windup, projectile: enemy.projectileSpeed });
        enemy.dispose();
    }
    t.ok('identical enemies measure different HP in all modes', new Set(measured.map((v) => v.hp)).size === 4, JSON.stringify(measured));
    t.ok('identical enemies measure different telegraphs in all modes', new Set(measured.map((v) => v.windup)).size === 4, JSON.stringify(measured));
    t.ok('identical enemies measure different projectile speed in all modes', new Set(measured.map((v) => v.projectile)).size === 4, JSON.stringify(measured));

    const health = new HealthPool(10);
    setActiveRunMode('hard');
    health.incomingDamageMult = getRunMode('hard').enemyDamage;
    health.damage(2, 0);
    t.ok('mode damage scalar changes actual health', Math.abs(health.hp - 7.3) < 1e-9, String(health.hp));
    setActiveRunMode('medium');
}
