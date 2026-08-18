// tests/qa/arena-frame.mjs — how much of a fight is actually on screen?
//
//   node tests/qa/arena-frame.mjs
//
// Print-only, no browser. Projects the real gameplay camera and asks, for each
// widen setting, how far from the look point a body at character height is
// still inside the frame — then holds that against the 28 sealed arenas and
// against how far away each enemy kind can hurt you.
//
// WHY THIS EXISTS. The arena camera was planned as a push-IN: seal the room,
// tighten the frame, feel the walls close. This probe was written to pick the
// tighten and instead said the plan was backwards. The frame at the shipped rig
// is 13.6 world units deep. The arenas are 17 to 23 across. A lancer throws
// from 7 and a Weaver acts at 11, and the frame's shallow axis reaches 6.2 —
// so both of them are already attacking from off-screen, and tightening would
// have bought drama by hiding more of the fight.
//
// THE SHALLOW AXIS IS THE ONE THAT BINDS, and it is not the obvious one. The
// camera is pitched 70.7°, so the screen's vertical axis maps to a SHORT run of
// world Z (6.8 up, 6.2 down) while the horizontal maps to a long one (10.8). A
// number quoted as "the frame is 21 units wide" is true and useless: nothing is
// ever lost off the sides.
//
// THE COST OF WIDENING IS THE HERO. On-screen size goes as 1/distance, and the
// hero is 34 px wide at 1280 (`tests/qa/aberration-cost.mjs`). That is the
// scarcest resource in this game — every readability finding in the project is
// downstream of it — so the widen is capped by what it does to that number, and
// this probe prints the two side by side rather than letting one be tuned
// without the other.

import * as THREE from 'three';
import {
    ARENA_WIDEN_MAX, SECOND_WIDEN_MAX, arenaWiden,
} from '../../src/game/camera-framing.js';
import { BEAT_LIST } from '../game/_beat-defs.mjs';

// The rig, from index.js. Restated with its source named, because a probe that
// invents its own camera measures a game nobody plays.
const CAM_HEIGHT = 17.5;              // index.js CAM_HEIGHT
const CAM_BACK = CAM_HEIGHT * 0.35;   // index.js
const FOV = 40;                       // renderer.js
const ASPECT = 1280 / 720;            // the frame every capture in docs/media uses
const LOOK_Y = 0.5;                   // CameraRig default lookY
/**
 * The plane the question is asked on: character CENTRE, not the floor.
 *
 * The player root sits at chest height (y=1.95) and enemy bodies straddle the
 * same band. Measuring the floor plane instead flatters the frame by about half
 * a unit on the near edge, because the floor at the bottom of the screen is
 * further from the lens than the body standing on it.
 */
const SUBJECT_Y = 2.0;
/** Measured at this rig, 1280 wide, by `tests/qa/aberration-cost.mjs`. */
const HERO_PX_AT_BASE = 34;

/** Furthest point from the look target, along (dx,dz), still inside the frame. */
function frameReach(height, back) {
    const cam = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 500);
    cam.position.set(0, height, back);
    cam.lookAt(0, LOOK_Y, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const inFrame = (x, z) => {
        const v = new THREE.Vector3(x, SUBJECT_Y, z).project(cam);
        return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    };
    // Bisection rather than a closed form on purpose: the closed form for a
    // pitched perspective frustum against a horizontal plane is exactly the
    // kind of arithmetic this project has got wrong twice, and the real
    // projection cannot disagree with itself.
    const edge = (dx, dz) => {
        let lo = 0, hi = 400;
        for (let i = 0; i < 60; i++) {
            const m = (lo + hi) / 2;
            if (inFrame(dx * m, dz * m)) lo = m; else hi = m;
        }
        return lo;
    };
    const r = Math.SQRT1_2;
    return {
        up: edge(0, -1), down: edge(0, 1), side: edge(1, 0),
        diagFar: edge(r, -r), diagNear: edge(r, r),
    };
}

/** Hero width in px at a widened rig — size goes as 1/distance. */
function heroPx(widen) {
    const base = Math.hypot(CAM_HEIGHT, CAM_BACK);
    const now = Math.hypot(CAM_HEIGHT + widen, CAM_BACK + widen * 0.35);
    return HERO_PX_AT_BASE * base / now;
}

/** How far each kind can act on the player, from enemy.js. */
const ENGAGE = [
    ['melee (sentinel/scarab)', 1.4, 'attackRange = 0.9 + hitRadius'],
    ['bulwark charge', 3.5, 'aiCharge: dist > 3.5'],
    ['lancer (ranged)', 7, 'attackRange default for a ranged ai'],
    ['censer burst', 9, 'aiCense: dist <= 9'],
    ['weaver strand', 11, 'aiWeave: dist < 11'],
];

console.log('THE FRAME, at character height, in world units from the look point\n');
console.log('widen  height   up(-Z)  down(+Z)  side(X)  diagFar diagNear   area    hero px');
const rows = [];
for (const w of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7]) {
    const f = frameReach(CAM_HEIGHT + w, CAM_BACK + w * 0.35);
    // Elliptical approximation of the trapezoid, only ever compared to itself.
    const area = Math.PI * f.side * (f.up + f.down) / 2;
    rows.push({ w, ...f, area, px: heroPx(w) });
    const mark = w === 0 ? '  <- shipped rig'
        : (Math.abs(w - ARENA_WIDEN_MAX) < 1e-9 ? '  <- ARENA_WIDEN_MAX'
            : (Math.abs(w - SECOND_WIDEN_MAX) < 1e-9 ? '  <- SECOND_WIDEN_MAX (boss)' : ''));
    console.log(`${w.toFixed(1).padStart(5)} ${(CAM_HEIGHT + w).toFixed(2).padStart(7)}  `
        + [f.up, f.down, f.side, f.diagFar, f.diagNear].map((v) => v.toFixed(2).padStart(7)).join(' ')
        + `  ${area.toFixed(0).padStart(5)}   ${heroPx(w).toFixed(1).padStart(5)}${mark}`);
}

const base = rows[0];
const capped = rows.find((r) => Math.abs(r.w - ARENA_WIDEN_MAX) < 1e-9);
if (capped) {
    console.log(`\nAT THE CAP: area ${(100 * (capped.area / base.area - 1)).toFixed(0)}% larger, `
        + `hero ${(100 * (1 - capped.px / base.px)).toFixed(0)}% smaller `
        + `(${base.px.toFixed(0)}px -> ${capped.px.toFixed(0)}px).`);
}

console.log('\nWHO IS ON SCREEN WHEN THEY ATTACK — the shallow axis is the test\n');
console.log('kind                      range   at base   at cap    source');
for (const [name, range, src] of ENGAGE) {
    const okBase = range <= base.down ? 'yes' : 'NO ';
    const okCap = capped ? (range <= capped.down ? 'yes' : 'NO ') : '?  ';
    console.log(`${name.padEnd(24)} ${range.toFixed(1).padStart(5)}   `
        + `${okBase.padEnd(7)}   ${okCap.padEnd(7)}   ${src}`);
}
console.log('\nThe ones that read NO in both columns are not made worse by the widen —');
console.log('they were already off-screen, and this probe is how that was found.');

// ── The arenas themselves ──────────────────────────────────────────────────
console.log('\nTHE SEALED ARENAS — playable half-extent vs what the frame reaches\n');
const bySize = new Map();
let sealed = 0;
for (const def of BEAT_LIST) {
    for (const [rid, room] of Object.entries(def.rooms)) {
        if (!room.seal) continue;
        sealed++;
        const H = room.half - 1;    // playable extent: the wall course is not floor
        const list = bySize.get(H) || [];
        list.push(`${def.id.replace('beat-', '')}/${rid}`);
        bySize.set(H, list);
    }
}
console.log('halfExtent  rooms  covered at base   at cap    example');
for (const H of [...bySize.keys()].sort((a, b) => a - b)) {
    const list = bySize.get(H);
    const cB = Math.min(1, base.down / H), cC = capped ? Math.min(1, capped.down / H) : 0;
    console.log(`${String(H).padStart(10)}  ${String(list.length).padStart(5)}  `
        + `${(100 * cB).toFixed(0).padStart(13)}%  ${(100 * cC).toFixed(0).padStart(6)}%    ${list[0]}`);
}
console.log(`\n${sealed} sealed rooms. "covered" is the shallow axis only — the frame`);
console.log('reaches the full width of every one of them and never the full depth.');

console.log('\nTHE WIDEN CURVE — what the fight has to look like to buy each step\n');
console.log('furthest live threat   widen   height   hero px');
for (const d of [4, 6, 7, 8, 9, 10, 12, 16]) {
    const w = arenaWiden(d);
    console.log(`${d.toFixed(0).padStart(20)}   ${w.toFixed(2).padStart(5)}   `
        + `${(CAM_HEIGHT + w).toFixed(2).padStart(6)}   ${heroPx(w).toFixed(1).padStart(6)}`);
}
console.log('\nA fight at knife range costs nothing: the hero is full size for the');
console.log('moment that matters most, and the frame only opens once it has to.');
