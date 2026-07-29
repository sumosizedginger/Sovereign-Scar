// Boss public API — framework + full narrative roster (beats 01–14).

export { BossBase, attachBoss, moveToward, bounceArena } from './base.js';
export { KineticCore } from './kinetic-core.js';
export { SandSpur } from './sand-spur.js';

export {
    CryptWarden,
    TriCompiler,
    ProxyBoss,
    ObsidianArachnid,
    HydroidCloud,
    SkeletalMantis,
    PhantasmBoss,
    FrostAndFuel,
    SludgeGolem,
    MagmaWyrm,
    GumoiWitness,
    LeviathanBoss,
} from './roster.js';

// Legacy factories kept for compatibility
// Phase G — `legacy-factories.js` is deleted. Three exported factories
// (createMultiCoreBoss / createPhantasm / createLeviathanCore) that no beat
// file has ever called: every boss in the shipped campaign is constructed from
// its class in `roster.js`. Trap 4 — deleting the call is not deleting the
// feature, so the file, the re-export and the three "is it a function" spec
// lines are all gone together, and `bosses.spec.mjs` now asserts the module
// stays gone.
