// Thin legacy wrappers so older level code still resolves.

import { TriCompiler, PhantasmBoss, LeviathanBoss } from './roster.js';

/** @deprecated prefer TriCompiler */
export function createMultiCoreBoss(scene, centers, opts = {}) {
    return new TriCompiler(scene, centers, opts);
}

/** @deprecated prefer PhantasmBoss */
export function createPhantasm(scene, position) {
    return new PhantasmBoss(scene, {
        x: position.x, y: position.y, z: position.z,
    });
}

/** @deprecated prefer LeviathanBoss */
export function createLeviathanCore(scene, position) {
    return new LeviathanBoss(scene, {
        x: position.x, y: position.y, z: position.z,
    });
}
