// Shader prewarming (Ticket G / Change 6.4).
//
// The material-family hook adds shader variants. Compiling them lazily on the
// first frame a level renders causes a visible hitch right as combat starts.
// Once a level has installed its final lights, meshes, and environment, call
// prewarmLevel() from the transition path to compile those programs up front.
//
// Best-effort by contract: any failure is swallowed, because this is hitch
// control, never correctness.
//
// We use the SYNCHRONOUS renderer.compile — it builds every program up front
// during the load transition (so the first combat frame never hitches) without
// the async completion polling of compileAsync, whose KHR_parallel_shader_
// compile path is unsupported on some drivers (e.g. software GL) and can raise
// an unhandled readiness error. That is exactly the "falls back cleanly when
// KHR_parallel_shader_compile is unsupported" requirement.

export function prewarmLevel(renderer, scene, camera) {
    if (!renderer || !scene || !camera) return;
    try {
        if (typeof renderer.compile === 'function') renderer.compile(scene, camera);
    } catch (_) { /* never fatal */ }
}
