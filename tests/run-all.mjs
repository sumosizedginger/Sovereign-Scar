// tests/run-all.mjs
// Runs engine unit specs + Sovereign Scar game specs.

import {
    createSink, summarize, writeStepSummary, printErrorAnnotations,
    snapshotEnvironment, environmentDrift,
} from './harness.mjs';
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
import { run as runHitSoundHonesty } from './game/hit-sound-honesty.spec.mjs';
import { run as runDormantBossSilence } from './game/dormant-boss-silence.spec.mjs';
import { run as runGrapplePegChoice } from './game/grapple-peg-choice.spec.mjs';
import { run as runGrappleBacksweep } from './game/grapple-backsweep.spec.mjs';
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
import { run as runLightLineBurns } from './game/light-line-burns.spec.mjs';
import { run as runLicenceAgreement } from './game/licence-agreement.spec.mjs';
import { run as runWallProfile } from './game/wall-profile.spec.mjs';
import { run as runDressing } from './game/dressing.spec.mjs';
import { run as runTitleCamera } from './game/title-camera.spec.mjs';
import { run as runQualityTiers } from './game/quality-tiers.spec.mjs';
import { run as runWallClimb } from './game/wall-climb.spec.mjs';
import { run as runDashCommit } from './game/dash-commit.spec.mjs';
import { run as runWedgeCrackProximity } from './game/wedge-crack-proximity.spec.mjs';
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
import { run as runLineOfSight } from './game/line-of-sight.spec.mjs';
import { run as runCombo } from './game/combo.spec.mjs';
import { run as runPlaytest0817 } from './game/playtest-2026-08-17.spec.mjs';
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
import { run as runTypecheckBoundary } from './game/typecheck-boundary.spec.mjs';
import { run as runDualRuntime } from './game/dual-runtime.spec.mjs';
import { run as runReconstitutionCopy } from './game/reconstitution-copy.spec.mjs';

const unitOnly = process.argv.includes('--unit-only');

async function main() {
    const sinks = [];

    /**
     * Run one spec with a guaranteed teardown check around it.
     *
     * THREE THINGS THIS DOES THAT A BARE `fn(sink)` DID NOT.
     *
     * 1. A spec that THROWS is recorded as a failure and the run continues.
     *    Before, one exception killed `main()` and every spec after it simply
     *    never ran — with an exit code of 2 and no per-assertion evidence. That
     *    matters most during counterfactual testing, which is how this project
     *    proves a fix is real: breaking a fix on purpose sometimes crashes a
     *    spec instead of failing it, and a crash that greps as zero failures
     *    reads exactly like a pass.
     *
     * 2. A spec that DIRTIES THE PROCESS fails, and fails in its own name.
     *    Specs share one Node process; `harness.mjs` explains the historical
     *    bug at length. The point of putting the check here rather than in each
     *    spec is that it applies to specs nobody thought to check, including
     *    ones not written yet.
     *
     * 3. Both happen in a `finally`, so a spec that throws WHILE holding a
     *    global still gets its leak reported. The old failure mode was two bugs
     *    at once and only the first was visible.
     */
    function runNamed(name, fn) {
        const sink = createSink(name);
        const before = snapshotEnvironment();
        try {
            fn(sink);
        } catch (e) {
            sink.ok(name + ': the spec threw', false, String((e && e.stack) || e));
        } finally {
            for (const d of environmentDrift(before)) {
                sink.ok(name + ': left the process dirty', false, d);
            }
        }
        sinks.push(sink);
    }

    /** Same contract for the async specs. */
    async function runNamedAsync(name, fn) {
        const sink = createSink(name);
        const before = snapshotEnvironment();
        try {
            await fn(sink);
        } catch (e) {
            sink.ok(name + ': the spec threw', false, String((e && e.stack) || e));
        } finally {
            for (const d of environmentDrift(before)) {
                sink.ok(name + ': left the process dirty', false, d);
            }
        }
        sinks.push(sink);
    }

    runNamed('collision', runCollision);
    runNamed('hitbox', runHitbox);

    // `settings.spec.mjs` installs `globalThis.window` to test the module's
    // headless degradation and removes it at the end. Run through the same
    // guard as everything else: if a future edit puts a `return` or a throw
    // before that cleanup, the leak is reported here rather than surfacing as
    // an inexplicable failure in whatever spec runs next.
    await runNamedAsync('settings', runSettings);

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
    runNamed('hit-sound-honesty', runHitSoundHonesty);
    runNamed('dormant-boss-silence', runDormantBossSilence);
    runNamed('grapple-peg-choice', runGrapplePegChoice);
    runNamed('grapple-backsweep', runGrappleBacksweep);
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
    runNamed('wall-climb', runWallClimb);
    runNamed('light-line-burns', runLightLineBurns);
    runNamed('licence-agreement', runLicenceAgreement);
    runNamed('wall-profile', runWallProfile);
    runNamed('dressing', runDressing);
    runNamed('title-camera', runTitleCamera);
    runNamed('quality-tiers', runQualityTiers);
    runNamed('dash-commit', runDashCommit);
    runNamed('wedge-crack-proximity', runWedgeCrackProximity);
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
    runNamed('line-of-sight', runLineOfSight);
    runNamed('combo', runCombo);
    runNamed('playtest-2026-08-17', runPlaytest0817);
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
    runNamed('typecheck-boundary', runTypecheckBoundary);
    runNamed('dual-runtime', runDualRuntime);
    runNamed('reconstitution-copy', runReconstitutionCopy);

    if (!unitOnly) {
        // The browser half, in order. Each one is loaded lazily so a machine
        // with no Chrome still gets the whole unit run, and each goes through
        // the same crash/leak guard as the pure-node specs above.
        //
        // `pages-smoke-e2e` is deliberately near the end: it builds
        // `dist-pages/` and serves it under a `/Sovereign-Scar/` prefix on its
        // own port, which is a different world from every spec before it, so a
        // failure there reads as "the deployment shape is wrong" rather than
        // "the game is broken".
        const browserSpecs = [
            ['smoke', './smoke.spec.mjs'],
            ['game-smoke', './game-smoke.spec.mjs'],
            ['boss-e2e', './boss-e2e.spec.mjs'],
            ['boss-combat-e2e', './boss-combat-e2e.spec.mjs'],
            ['visual-sanity', './visual-sanity.spec.mjs'],
            ['shadow-frustum-e2e', './shadow-frustum-e2e.spec.mjs'],
            ['campaign-e2e', './campaign-e2e.spec.mjs'],
            ['door-refusal-e2e', './door-refusal-e2e.spec.mjs'],
            ['boss-reach-e2e', './boss-reach-e2e.spec.mjs'],
            ['seal-stalemate-e2e', './seal-stalemate-e2e.spec.mjs'],
            ['world-e2e', './world-e2e.spec.mjs'],
            ['locked-doors-e2e', './locked-doors-e2e.spec.mjs'],
            ['key-progression-e2e', './key-progression-e2e.spec.mjs'],
            ['boss-quality-e2e', './boss-quality-e2e.spec.mjs'],
            ['combat-feel-e2e', './combat-feel-e2e.spec.mjs'],
            ['narrative-systems-e2e', './narrative-systems-e2e.spec.mjs'],
            ['audio-render-e2e', './audio-render-e2e.spec.mjs'],
            ['pages-smoke-e2e', './pages-smoke-e2e.spec.mjs'],
            ['presentation-determinism-e2e', './presentation-determinism-e2e.spec.mjs'],
        ];
        for (const [name, mod] of browserSpecs) {
            const { run } = await import(mod);
            await runNamedAsync(name, run);
        }
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
