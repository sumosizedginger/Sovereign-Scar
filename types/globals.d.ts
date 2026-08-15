// Ambient declarations for globals the game legitimately writes on `window`.
//
// There is exactly one, and it is the debug hook the browser E2E suite drives
// the real game through (`window.__sovereignScar`). It is deliberately typed
// loosely: it is a bag of live references assembled at boot for a test harness,
// not a public API, and pinning its shape here would mean maintaining a second
// copy of it that drifts.
//
// This file exists so that `checkJs` does not have to be told to ignore the one
// place production code reads the hook back (`world/room-graph.js`). It adds no
// suppressions and hides no findings.

interface Window {
    __sovereignScar?: any;
}
