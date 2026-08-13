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
import { run as runFallAnchor } from './game/fall-anchor.spec.mjs';
import { run as runGrappleLanding } from './game/grapple-landing.spec.mjs';
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
import { run as runMenuInputCapture } from './game/menu-input-capture.spec.mjs';
import { run as runGamepad } from './game/gamepad.spec.mjs';
import { run as runUpgrades } from './game/upgrades.spec.mjs';
import { run as runWorldGraph } from './game/world-graph.spec.mjs';
import { run as runKeys } from './game/keys.spec.mjs';
import { run as runBlockers } from './game/blockers.spec.mjs';
import { run as runMigration } from './game/migration.spec.mjs';
import { run as runWorld7 } from './game/world7.spec.mjs';
import { run as runCombatFeel } from './game/combat-feel.spec.mjs';
import { run as runInputBuffer } from './game/input-buffer.spec.mjs';
import { run as runPlayerMoves } from './game/player-moves.spec.mjs';
import { run as runEncounterDirector } from './game/encounter-director.spec.mjs';
import { run as runElites } from './game/elites.spec.mjs';
import { run as runPuzzleKit } from './game/puzzle-kit.spec.mjs';
import { run as runEntrySafety } from './game/entry-safety.spec.mjs';
import { run as runWorldLife } from './game/world-life.spec.mjs';
import { run as runKitChannels } from './game/kit-channels.spec.mjs';
import { run as runPhaseG } from './game/phase-g.spec.mjs';
import { run as runSpatialAudio } from './game/spatial-audio.spec.mjs';
import { run as runBossFacing } from './game/boss-facing.spec.mjs';
import { run as runWeakPoints } from './game/weak-points.spec.mjs';
import { run as runChooseAction } from './game/choose-action.spec.mjs';
import { run as runTelegraphTruth } from './game/telegraph-truth.spec.mjs';
import { run as runTriCompiler } from './game/tri-compiler.spec.mjs';
import { run as runBossLethality } from './game/boss-lethality.spec.mjs';
import { run as runBossMovesets } from './game/boss-movesets.spec.mjs';
import { run as runBossActionCensus } from './game/boss-action-census.spec.mjs';
import { run as runBossGrammar } from './game/boss-grammar.spec.mjs';
import { run as runRunMode } from './game/run-mode.spec.mjs';
import { run as runLives } from './game/lives.spec.mjs';
import { run as runScore } from './game/score.spec.mjs';
import { run as runAnchorThread } from './game/anchor-thread.spec.mjs';
import { run as runItemChains } from './game/item-chains.spec.mjs';
import { run as runActorAnim } from './game/actor-anim.spec.mjs';
import { run as runHudToast } from './game/hud-toast.spec.mjs';
import { run as runHudPlayer } from './game/hud-player.spec.mjs';
import { run as runHeroReadability } from './game/hero-readability.spec.mjs';
import { run as runAppIcon } from './game/app-icon.spec.mjs';
import { run as runAmbientLife } from './game/ambient-life.spec.mjs';
import { run as runLightLines } from './game/light-lines.spec.mjs';
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
import { run as runShieldGate } from './game/shield-gate.spec.mjs';
import { run as runControls } from './game/controls.spec.mjs';
import { run as runCoach } from './game/coach.spec.mjs';
import { run as runThreatCurve } from './game/threat-curve.spec.mjs';
import { run as runMusic } from './game/music.spec.mjs';
import { run as runFeelVisuals } from './game/game-feel-visuals.spec.mjs';
import { run as runLuminance } from './game/luminance.spec.mjs';
import { run as runShadowRoles } from './game/shadow-roles.spec.mjs';
import { run as runRoomTrim } from './game/room-trim.spec.mjs';
import { run as runRoomDecals } from './game/room-decals.spec.mjs';
import { run as runAlbedoTrim } from './game/albedo-trim.spec.mjs';
import { run as runBodies } from './game/bodies.spec.mjs';
import { run as runRoomLights } from './game/room-lights.spec.mjs';
import { run as runBossBodies } from './game/boss-bodies.spec.mjs';
import { run as runRoomSeal } from './game/room-seal.spec.mjs';
import { run as runSealHolds } from './game/seal-holds.spec.mjs';
import { run as runReflectArmor } from './game/reflect-armor.spec.mjs';
import { run as runGodModeCombat } from './game/god-mode-combat.spec.mjs';
import { run as runCredits } from './game/credits.spec.mjs';
import { run as runPlaytest0723 } from './game/playtest-2026-07-23.spec.mjs';
import { run as runCasterDark } from './game/caster-dark.spec.mjs';
import { run as runCutsceneWiring } from './game/cutscene-wiring.spec.mjs';

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
    runNamed('fall-anchor', runFallAnchor);
    runNamed('grapple-landing', runGrappleLanding);
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
    runNamed('menu-input-capture', runMenuInputCapture);
    runNamed('gamepad', runGamepad);
    runNamed('upgrades', runUpgrades);
    runNamed('world-graph', runWorldGraph);
    runNamed('keys', runKeys);
    runNamed('blockers', runBlockers);
    runNamed('migration', runMigration);
    runNamed('world7', runWorld7);
    runNamed('combat-feel', runCombatFeel);
    runNamed('input-buffer', runInputBuffer);
    runNamed('player-moves', runPlayerMoves);
    runNamed('encounter-director', runEncounterDirector);
    runNamed('elites', runElites);
    runNamed('puzzle-kit', runPuzzleKit);
    runNamed('entry-safety', runEntrySafety);
    runNamed('world-life', runWorldLife);
    runNamed('kit-channels', runKitChannels);
    runNamed('phase-g', runPhaseG);
    runNamed('spatial-audio', runSpatialAudio);
    runNamed('boss-facing', runBossFacing);
    runNamed('weak-points', runWeakPoints);
    runNamed('choose-action', runChooseAction);
    runNamed('telegraph-truth', runTelegraphTruth);
    runNamed('tri-compiler', runTriCompiler);
    runNamed('boss-lethality', runBossLethality);
    runNamed('boss-movesets', runBossMovesets);
    runNamed('boss-action-census', runBossActionCensus);
    runNamed('boss-grammar', runBossGrammar);
    runNamed('run-mode', runRunMode);
    runNamed('lives', runLives);
    runNamed('score', runScore);
    runNamed('anchor-thread', runAnchorThread);
    runNamed('item-chains', runItemChains);
    runNamed('actor-anim', runActorAnim);
    runNamed('hud-toast', runHudToast);
    runNamed('hud-player', runHudPlayer);
    runNamed('hero-readability', runHeroReadability);
    runNamed('app-icon', runAppIcon);
    runNamed('ambient-life', runAmbientLife);
    runNamed('light-lines', runLightLines);
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
    runNamed('shield-gate', runShieldGate);
    runNamed('controls', runControls);
    runNamed('coach', runCoach);
    runNamed('threat-curve', runThreatCurve);
    runNamed('music', runMusic);
    runNamed('game-feel-visuals', runFeelVisuals);
    runNamed('luminance', runLuminance);
    runNamed('shadow-roles', runShadowRoles);
    runNamed('room-trim', runRoomTrim);
    runNamed('room-decals', runRoomDecals);
    runNamed('albedo-trim', runAlbedoTrim);
    runNamed('bodies', runBodies);
    runNamed('room-lights', runRoomLights);
    runNamed('boss-bodies', runBossBodies);
    runNamed('room-seal', runRoomSeal);
    runNamed('seal-holds', runSealHolds);
    runNamed('reflect-armor', runReflectArmor);
    runNamed('god-mode-combat', runGodModeCombat);
    runNamed('credits', runCredits);
    // The regression gate for docs/PLAYTEST-2026-07-23.md. It was written, its
    // 29 assertions were each proven to fail on the pre-fix code, and then it
    // was never imported here — so all seven of those bugs were free to come
    // back silently. It has been passing standalone the whole time.
    runNamed('playtest-2026-07-23', runPlaytest0723);
    runNamed('caster-dark', runCasterDark);
    runNamed('cutscene-wiring', runCutsceneWiring);

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

        const { run: runShadowFrustum } = await import('./shadow-frustum-e2e.spec.mjs');
        const shadowFrustum = createSink('shadow-frustum-e2e');
        await runShadowFrustum(shadowFrustum);
        sinks.push(shadowFrustum);

        const { run: runCampaignE2E } = await import('./campaign-e2e.spec.mjs');
        const campaignE2E = createSink('campaign-e2e');
        await runCampaignE2E(campaignE2E);
        sinks.push(campaignE2E);

        const { run: runDoorRefusal } = await import('./door-refusal-e2e.spec.mjs');
        const doorRefusal = createSink('door-refusal-e2e');
        await runDoorRefusal(doorRefusal);
        sinks.push(doorRefusal);

        const { run: runBossReach } = await import('./boss-reach-e2e.spec.mjs');
        const bossReach = createSink('boss-reach-e2e');
        await runBossReach(bossReach);
        sinks.push(bossReach);

        const { run: runSealStalemate } = await import('./seal-stalemate-e2e.spec.mjs');
        const sealStalemate = createSink('seal-stalemate-e2e');
        await runSealStalemate(sealStalemate);
        sinks.push(sealStalemate);

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
