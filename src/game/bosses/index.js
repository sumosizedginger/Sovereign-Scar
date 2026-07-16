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
export { createMultiCoreBoss, createPhantasm, createLeviathanCore } from './legacy-factories.js';
