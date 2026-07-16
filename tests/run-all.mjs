// tests/run-all.mjs
// Runs engine unit specs + Sovereign Scar game specs.

import { createSink, summarize, writeStepSummary, printErrorAnnotations } from './harness.mjs';
import { run as runCollision } from './collision.spec.mjs';
import { run as runHitbox } from './hitbox.spec.mjs';
import { run as runSettings } from './settings.spec.mjs';

import { run as runHealth } from './game/health.spec.mjs';
import { run as runInventory } from './game/inventory.spec.mjs';
import { run as runWeapons } from './game/weapons.spec.mjs';
import { run as runCombatSweeper } from './game/combat-sweeper.spec.mjs';
import { run as runVoxelPhysics } from './game/voxel-physics.spec.mjs';
import { run as runDestructible } from './game/destructible.spec.mjs';
import { run as runGrapple } from './game/grapple.spec.mjs';
import { run as runFriction } from './game/friction.spec.mjs';
import { run as runDrone } from './game/drone.spec.mjs';
import { run as runRegistry } from './game/registry.spec.mjs';
import { run as runProps } from './game/props.spec.mjs';
import { run as runBosses } from './game/bosses.spec.mjs';
import { run as runMusicBed } from './game/music-bed.spec.mjs';
import { run as runStory } from './game/story.spec.mjs';
import { run as runJuice } from './game/juice.spec.mjs';
import { run as runMenu } from './game/menu.spec.mjs';
import { run as runGamepad } from './game/gamepad.spec.mjs';
import { run as runUpgrades } from './game/upgrades.spec.mjs';

const unitOnly = process.argv.includes('--unit-only');

async function main() {
    const sinks = [];

    function runNamed(name, fn) {
        const sink = createSink(name);
        fn(sink);
        sinks.push(sink);
    }

    runNamed('collision', runCollision);
    runNamed('hitbox', runHitbox);

    const settings = createSink('settings');
    await runSettings(settings);
    sinks.push(settings);

    // Game unit specs
    runNamed('health', runHealth);
    runNamed('inventory', runInventory);
    runNamed('weapons', runWeapons);
    runNamed('combat-sweeper', runCombatSweeper);
    runNamed('voxel-physics', runVoxelPhysics);
    runNamed('destructible', runDestructible);
    runNamed('grapple', runGrapple);
    runNamed('friction', runFriction);
    runNamed('drone', runDrone);
    runNamed('registry', runRegistry);
    runNamed('props', runProps);
    runNamed('bosses', runBosses);
    runNamed('music-bed', runMusicBed);
    runNamed('story', runStory);
    runNamed('juice', runJuice);
    runNamed('menu', runMenu);
    runNamed('gamepad', runGamepad);
    runNamed('upgrades', runUpgrades);

    if (!unitOnly) {
        const { run: runSmoke } = await import('./smoke.spec.mjs');
        const smoke = createSink('smoke');
        await runSmoke(smoke);
        sinks.push(smoke);

        const { run: runGameSmoke } = await import('./game-smoke.spec.mjs');
        const gameSmoke = createSink('game-smoke');
        await runGameSmoke(gameSmoke);
        sinks.push(gameSmoke);

        const { run: runBossE2E } = await import('./boss-e2e.spec.mjs');
        const bossE2E = createSink('boss-e2e');
        await runBossE2E(bossE2E);
        sinks.push(bossE2E);
    }

    writeStepSummary(sinks);
    printErrorAnnotations(sinks);
    process.exit(summarize(sinks) ? 1 : 0);
}

main().catch((e) => {
    console.error('Test run crashed:', e);
    if (process.env.GITHUB_ACTIONS) {
        console.log('::error title=Test run crashed::' + String(e && e.stack || e).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A'));
    }
    process.exit(2);
});
