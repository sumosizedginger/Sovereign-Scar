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
import { run as runWorldGraph } from './game/world-graph.spec.mjs';
import { run as runKeys } from './game/keys.spec.mjs';
import { run as runBlockers } from './game/blockers.spec.mjs';
import { run as runMigration } from './game/migration.spec.mjs';
import { run as runWorld7 } from './game/world7.spec.mjs';
import { run as runCombatFeel } from './game/combat-feel.spec.mjs';
import { run as runBossGrammar } from './game/boss-grammar.spec.mjs';
import { run as runRunMode } from './game/run-mode.spec.mjs';
import { run as runLives } from './game/lives.spec.mjs';
import { run as runScore } from './game/score.spec.mjs';
import { run as runAnchorThread } from './game/anchor-thread.spec.mjs';
import { run as runItemChains } from './game/item-chains.spec.mjs';
import { run as runActorAnim } from './game/actor-anim.spec.mjs';
import { run as runHudToast } from './game/hud-toast.spec.mjs';
import { run as runOcclusion } from './game/occlusion.spec.mjs';
import { run as runOverworldGrammar } from './game/overworld-grammar.spec.mjs';
import { run as runMaterialHierarchy } from './game/material-hierarchy.spec.mjs';
import { run as runDungeonKits } from './game/dungeon-kits.spec.mjs';
import { run as runOverheadCollision } from './game/overhead-collision.spec.mjs';
import { run as runPickupReach } from './game/pickup-reachability.spec.mjs';
import { run as runRoomEntry } from './game/room-transition-entry.spec.mjs';
import { run as runPlatformReach } from './game/platform-reachability.spec.mjs';
import { run as runGuard } from './game/guard.spec.mjs';
import { run as runLockOn } from './game/lock-on.spec.mjs';
import { run as runBestiary } from './game/bestiary.spec.mjs';
import { run as runPedagogy } from './game/dungeon-pedagogy.spec.mjs';
import { run as runCameraContract } from './game/camera-contract.spec.mjs';
import { run as runTraversal } from './game/traversal-legibility.spec.mjs';
import { run as runSecretTaxonomy } from './game/secret-taxonomy.spec.mjs';
import { run as runCoach } from './game/coach.spec.mjs';
import { run as runThreatCurve } from './game/threat-curve.spec.mjs';
import { run as runMusic } from './game/music.spec.mjs';
import { run as runFeelVisuals } from './game/game-feel-visuals.spec.mjs';

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
    runNamed('world-graph', runWorldGraph);
    runNamed('keys', runKeys);
    runNamed('blockers', runBlockers);
    runNamed('migration', runMigration);
    runNamed('world7', runWorld7);
    runNamed('combat-feel', runCombatFeel);
    runNamed('boss-grammar', runBossGrammar);
    runNamed('run-mode', runRunMode);
    runNamed('lives', runLives);
    runNamed('score', runScore);
    runNamed('anchor-thread', runAnchorThread);
    runNamed('item-chains', runItemChains);
    runNamed('actor-anim', runActorAnim);
    runNamed('hud-toast', runHudToast);
    runNamed('occlusion', runOcclusion);
    runNamed('overworld-grammar', runOverworldGrammar);
    runNamed('material-hierarchy', runMaterialHierarchy);
    runNamed('dungeon-kits', runDungeonKits);
    runNamed('overhead-collision', runOverheadCollision);
    runNamed('pickup-reachability', runPickupReach);
    runNamed('room-transition-entry', runRoomEntry);
    runNamed('platform-reachability', runPlatformReach);
    runNamed('guard', runGuard);
    runNamed('lock-on', runLockOn);
    runNamed('bestiary', runBestiary);
    runNamed('dungeon-pedagogy', runPedagogy);
    runNamed('camera-contract', runCameraContract);
    runNamed('traversal-legibility', runTraversal);
    runNamed('secret-taxonomy', runSecretTaxonomy);
    runNamed('coach', runCoach);
    runNamed('threat-curve', runThreatCurve);
    runNamed('music', runMusic);
    runNamed('game-feel-visuals', runFeelVisuals);

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

        const { run: runBossCombat } = await import('./boss-combat-e2e.spec.mjs');
        const bossCombat = createSink('boss-combat-e2e');
        await runBossCombat(bossCombat);
        sinks.push(bossCombat);

        const { run: runVisualSanity } = await import('./visual-sanity.spec.mjs');
        const visualSanity = createSink('visual-sanity');
        await runVisualSanity(visualSanity);
        sinks.push(visualSanity);

        const { run: runCampaignE2E } = await import('./campaign-e2e.spec.mjs');
        const campaignE2E = createSink('campaign-e2e');
        await runCampaignE2E(campaignE2E);
        sinks.push(campaignE2E);

        const { run: runWorldE2E } = await import('./world-e2e.spec.mjs');
        const worldE2E = createSink('world-e2e');
        await runWorldE2E(worldE2E);
        sinks.push(worldE2E);

        const { run: runLockedDoorsE2E } = await import('./locked-doors-e2e.spec.mjs');
        const lockedDoorsE2E = createSink('locked-doors-e2e');
        await runLockedDoorsE2E(lockedDoorsE2E);
        sinks.push(lockedDoorsE2E);

        const { run: runKeyProgressionE2E } = await import('./key-progression-e2e.spec.mjs');
        const keyProgressionE2E = createSink('key-progression-e2e');
        await runKeyProgressionE2E(keyProgressionE2E);
        sinks.push(keyProgressionE2E);

        const { run: runBossQuality } = await import('./boss-quality-e2e.spec.mjs');
        const bossQuality = createSink('boss-quality-e2e');
        await runBossQuality(bossQuality);
        sinks.push(bossQuality);

        const { run: runCombatFeelE2E } = await import('./combat-feel-e2e.spec.mjs');
        const combatFeelE2E = createSink('combat-feel-e2e');
        await runCombatFeelE2E(combatFeelE2E);
        sinks.push(combatFeelE2E);

        const { run: runNarrativeSystemsE2E } = await import('./narrative-systems-e2e.spec.mjs');
        const narrativeSystemsE2E = createSink('narrative-systems-e2e');
        await runNarrativeSystemsE2E(narrativeSystemsE2E);
        sinks.push(narrativeSystemsE2E);

        const { run: runAudioRender } = await import('./audio-render-e2e.spec.mjs');
        const audioRender = createSink('audio-render-e2e');
        await runAudioRender(audioRender);
        sinks.push(audioRender);

        const { run: runPresentationDeterminism } = await import('./presentation-determinism-e2e.spec.mjs');
        const presentationDeterminism = createSink('presentation-determinism-e2e');
        await runPresentationDeterminism(presentationDeterminism);
        sinks.push(presentationDeterminism);
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
