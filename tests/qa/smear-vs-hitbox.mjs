// Print-only probe: is every player move DRAWN where it HITS?
//
// This project spent a whole session establishing that a boss telegraph must be
// the shape that resolves. The player was never held to it. `ArcSmear` draws a
// sector — and `hitboxCheck`'s non-radial path resolves a RECTANGLE, so for a
// long thin move the picture and the hit have almost nothing in common. The
// Light Caster's charged lance resolved over a lane 1.8 wide starting at the
// player's feet and was drawn as a wedge starting 5.6 units in front of them.
//
// The measurement: park a real Player at the origin facing +X, intercept the
// smear it spawns, then sample a grid of ground positions and ask two questions
// of each — is it inside the drawing, and would `hitboxCheck` hit something
// standing there? Reported as:
//
//   OVER   drawn, not hit   — the lie that matters. Promised damage that misses.
//   UNDER  hit, not drawn   — damage with no picture. Also a lie, less cruel.
//
// Run: node tests/qa/smear-vs-hitbox.mjs

import * as THREE from 'three';
import { Player, RAY_LATERAL } from '../../src/game/player.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { WEAPONS, getWeapon } from '../../src/game/combat/weapons.js';
import { hitboxCheck } from '../../src/combat/hitbox.js';

const STEP = 0.1;
const SPAN = 18;

function makePlayer(weaponId) {
    const player = new Player(new THREE.Scene(), new CollisionWorld(), (x, y) => y < 1);
    player.rig.position.set(0, 1.95, 0);
    player.inventory.activeWeapon = weaponId;
    player.state.facingVec = { x: 1, z: 0 };
    player.state.facing = 1;
    const drawn = [];
    player.arcSmear.spawn = (p) => drawn.push(p);
    return { player, drawn };
}

/** Is (x,z) inside the shape one spawn call drew? Player is at the origin. */
function insideDrawn(d, x, z) {
    const fx = d.facingVec?.x ?? 1;
    const fz = d.facingVec?.z ?? 0;
    const len = Math.hypot(fx, fz) || 1;
    const forward = (x * fx + z * fz) / len;
    const lateral = (-x * fz + z * fx) / len;
    if (d.lane) {
        return forward >= 0 && forward <= d.lane.length
            && Math.abs(lateral) <= d.lane.width / 2;
    }
    const r = Math.hypot(x, z);
    const radius = d.radius ?? 2;
    // The fan runs from 35% of its radius to its radius, over `arc` radians.
    if (r < radius * 0.35 || r > radius) return false;
    const arc = d.arc ?? Math.PI * 0.61;
    if (arc >= Math.PI * 2) return true;
    return Math.abs(Math.atan2(lateral, forward)) <= arc / 2;
}

function report(label, drawnList, move) {
    let over = 0, under = 0, both = 0, hitCells = 0, drawCells = 0;
    let maxOverReach = 0, nearestDrawn = Infinity;
    for (let x = -SPAN; x <= SPAN; x += STEP) {
        for (let z = -SPAN; z <= SPAN; z += STEP) {
            const drawn = drawnList.some((d) => insideDrawn(d, x, z));
            const hit = hitboxCheck(
                { root: { position: { x: 0, y: 1.95, z: 0 } }, state: { facingVec: { x: 1, z: 0 } } },
                { root: { position: { x, y: 1.95, z } }, hitRadius: 0, state: { current: 'IDLE' } },
                move
            );
            if (drawn) { drawCells++; nearestDrawn = Math.min(nearestDrawn, Math.hypot(x, z)); }
            if (hit) hitCells++;
            if (drawn && hit) both++;
            else if (drawn) { over++; maxOverReach = Math.max(maxOverReach, Math.hypot(x, z)); }
            else if (hit) under++;
        }
    }
    const pct = (n, d) => (d ? ((n / d) * 100).toFixed(0) : '  0').padStart(3);
    console.log(
        `  ${label.padEnd(22)} drawn ${String(drawCells).padStart(5)}  hit ${String(hitCells).padStart(5)}`
        + `  AGREE ${pct(both, drawCells)}%`
        + `  OVER ${pct(over, drawCells)}%  UNDER ${pct(under, hitCells)}%`
        + `  nearest drawn ${(nearestDrawn === Infinity ? 0 : nearestDrawn).toFixed(2)}`
        + `  furthest over-draw ${maxOverReach.toFixed(2)}`
    );
}

console.log('=== drawn vs resolved, player moves (facing +X, at the origin) ===');
console.log('');
console.log('ordinary swings');
for (const id of Object.keys(WEAPONS)) {
    const w = getWeapon(id);
    if (!w.damage) continue;
    const { player, drawn } = makePlayer(id);
    player.attackCd = 0;
    player.tryAttack([], null);
    if (!drawn.length) { console.log(`  ${id.padEnd(22)} NOTHING DRAWN`); continue; }
    const move = w.ray
        ? { range: w.range, depthTolerance: RAY_LATERAL, vertical: 99 }
        : w;
    report(id, drawn, move);
}

console.log('');
console.log('charged moves');
for (const id of Object.keys(WEAPONS)) {
    const w = getWeapon(id);
    if (!w.charge) continue;
    const { player, drawn } = makePlayer(id);
    player._resolveCharge({ weapon: w, charge: w.charge }, [], null);
    if (!drawn.length) { console.log(`  ${id.padEnd(22)} NOTHING DRAWN`); continue; }
    report(w.charge.id, drawn, w.charge);
}
