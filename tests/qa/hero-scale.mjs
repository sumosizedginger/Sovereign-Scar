// tests/qa/hero-scale.mjs — is the hero too small, and what would fixing it cost?
//
//   node tests/qa/hero-scale.mjs
//
// Print-only, no browser. The hero measures 34 x 93 px at 1280x720, and every
// readability finding in this project turns out to be downstream of that: a
// 2 px outline that made a 30 px character look worse, a 3 px colour split that
// turned a red tunic magenta, telegraphs drawn one size and resolved at another.
// "Pull the camera in" is the obvious answer and it has never been costed.
//
// This costs it. Three levers change how big the hero is, and they are not
// equivalent:
//
//   FOV      cheap to change, changes nothing about where the lens is.
//   DISTANCE moves the lens, so it changes what the walls hide.
//   PITCH    the only one that is not a straight trade, and the most dangerous
//            thing in this codebase to touch.
//
// The headline result is in section 2 and it is not a matter of taste: at a
// fixed pitch, hero size and frame coverage are THE SAME KNOB. Their product is
// constant to within a rounding error, whichever of the first two levers you
// pull. There is no setting that gives both.

import * as THREE from 'three';

const CAM_HEIGHT = 17.5;              // index.js CAM_HEIGHT
const CAM_BACK = CAM_HEIGHT * 0.35;   // index.js
const FOV = 40;                       // renderer.js
const ASPECT = 1280 / 720;
const LOOK_Y = 0.5;
const SUBJECT_Y = 2.0;

/** Measured at the shipped rig, 1280 wide (`tests/qa/aberration-cost.mjs`). */
const HERO_W_PX = 34;
const HERO_H_PX = 93;
const REF_W = 1280;
const REF_H = 720;

/** Frame reach along (dx,dz), in world units from the look point. */
function reach(height, back, fov, dx, dz) {
    const cam = new THREE.PerspectiveCamera(fov, ASPECT, 0.1, 500);
    cam.position.set(0, height, back);
    cam.lookAt(0, LOOK_Y, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    let lo = 0, hi = 600;
    for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        const v = new THREE.Vector3(dx * m, SUBJECT_Y, dz * m).project(cam);
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) lo = m; else hi = m;
    }
    return lo;
}

/**
 * Hero height in px.
 *
 * On-screen size is inversely proportional to distance and to tan(fov/2) — the
 * two together are exactly what sets how much world fits in the frame, which is
 * the point section 2 makes.
 */
function heroPx(height, back, fov, px = HERO_H_PX) {
    const d0 = Math.hypot(CAM_HEIGHT, CAM_BACK);
    const t0 = Math.tan((FOV * Math.PI / 180) / 2);
    const d = Math.hypot(height, back);
    const t = Math.tan((fov * Math.PI / 180) / 2);
    return px * (d0 * t0) / (d * t);
}

console.log('1. WHAT THE HERO ACTUALLY MEASURES\n');
console.log(`  ${HERO_W_PX} x ${HERO_H_PX} px at ${REF_W}x${REF_H}.`);
console.log(`  As a fraction of the frame — the number that does NOT depend on`);
console.log(`  the player's monitor — that is `
    + `${(100 * HERO_W_PX / REF_W).toFixed(2)}% of its width and `
    + `${(100 * HERO_H_PX / REF_H).toFixed(1)}% of its height.\n`);
console.log('  The same hero, at the resolutions people actually run:\n');
console.log('    output          hero px (w x h)');
for (const [w, h, label] of [[1280, 720, '720p'], [1600, 900, '900p'],
    [1920, 1080, '1080p'], [2560, 1440, '1440p'], [3840, 2160, '4K']]) {
    const s = h / REF_H;
    console.log(`    ${label.padEnd(6)} ${String(w).padStart(5)}x${String(h).padEnd(5)}  `
        + `${(HERO_W_PX * s).toFixed(0).padStart(3)} x ${(HERO_H_PX * s).toFixed(0)}`);
}
console.log('\n  "34 px" is a 720p number. The FRACTION is the durable one, and it is');
console.log('  what every art decision has to survive.');

// ── 2 ──────────────────────────────────────────────────────────────────────
console.log('\n\n2. HERO SIZE AND FRAME COVERAGE ARE THE SAME KNOB\n');
console.log('Two ways to make the hero bigger. Both pay for it out of the frame,');
console.log('and — this is the result — they pay EXACTLY the same price.\n');
console.log('lever            setting   hero h px   frame depth   product');
const baseDepth = reach(CAM_HEIGHT, CAM_BACK, FOV, 0, -1)
    + reach(CAM_HEIGHT, CAM_BACK, FOV, 0, 1);
const rows = [];
for (const f of [46, 40, 36, 32, 28]) {
    const px = heroPx(CAM_HEIGHT, CAM_BACK, f);
    const d = reach(CAM_HEIGHT, CAM_BACK, f, 0, -1) + reach(CAM_HEIGHT, CAM_BACK, f, 0, 1);
    rows.push(['fov', `${f}°`, px, d]);
}
for (const k of [1.15, 1.0, 0.9, 0.8, 0.7]) {
    const px = heroPx(CAM_HEIGHT * k, CAM_BACK * k, FOV);
    const d = reach(CAM_HEIGHT * k, CAM_BACK * k, FOV, 0, -1)
        + reach(CAM_HEIGHT * k, CAM_BACK * k, FOV, 0, 1);
    rows.push(['distance', `${(CAM_HEIGHT * k).toFixed(1)} high`, px, d]);
}
for (const [lever, setting, px, d] of rows) {
    const mark = (setting === '40°' || setting === '17.5 high') ? '   <- shipped' : '';
    console.log(`${lever.padEnd(15)} ${setting.padStart(9)}   ${px.toFixed(0).padStart(9)}   `
        + `${d.toFixed(2).padStart(11)}   ${(px * d).toFixed(0).padStart(7)}${mark}`);
}
console.log('\nThe product column is flat. Hero size x frame depth is a constant, so');
console.log('there is no setting that buys both — the camera is already spending');
console.log('everything it has. Anyone proposing "pull the camera in" is proposing');
console.log('to make the arenas, which are ALREADY 17 to 23 units across against a');
console.log('13-unit frame, less visible than they are now.');

// ── 3 ──────────────────────────────────────────────────────────────────────
console.log('\n\n3. THE ONE LEVER THAT IS NOT A STRAIGHT TRADE: PITCH\n');
console.log('A shallower camera maps the screen’s vertical axis onto MORE world Z,');
console.log('because it is looking further along the ground. So it buys frame depth');
console.log('at no cost in hero size. It is also the single most dangerous number in');
console.log('this codebase — every wall in the game was authored against 70.7°, and');
console.log('a doc that misread this rig once had fourteen bosses photographed at an');
console.log('angle the game does not use.\n');
console.log('pitch    height  back    hero h px   frame depth   vs shipped');
const dist = Math.hypot(CAM_HEIGHT, CAM_BACK);   // hold distance, so hero size is fixed
for (const p of [78, 74, 70.7, 66, 60, 54]) {
    const r = p * Math.PI / 180;
    const h = dist * Math.sin(r), b = dist * Math.cos(r);
    const px = heroPx(h, b, FOV);
    const d = reach(h, b, FOV, 0, -1) + reach(h, b, FOV, 0, 1);
    const mark = Math.abs(p - 70.7) < 0.5 ? '  <- shipped' : '';
    console.log(`${p.toFixed(1).padStart(5)}°  ${h.toFixed(2).padStart(6)} ${b.toFixed(2).padStart(6)}  `
        + `${px.toFixed(0).padStart(9)}   ${d.toFixed(2).padStart(11)}   `
        + `${(100 * (d / baseDepth - 1)).toFixed(0).padStart(6)}%${mark}`);
}
console.log('\nHero size holds while the frame gets deeper. THE BILL IS OCCLUSION, and');
console.log('it is not a slope — it is a cliff. Measured by re-running');
console.log('`tests/qa/hero-occlusion.mjs` at each pitch over the whole campaign:\n');
console.log('  pitch    occluded standable cells      frame depth');
console.log('   78.0°      129 / 22894   0.56%            -5%');
console.log('   74.0°      200 / 22894   0.87%            -2%');
console.log('   70.7°      237 / 22894   1.04%             0%   <- shipped');
console.log('   66.0°      222 / 22894   0.97%            +4%');
console.log('   60.0°     1898 / 22894   8.29%           +12%   <- the cliff');
console.log('   54.0°     1995 / 22894   8.71%           +23%');
console.log('');
console.log('Between 66° and 60° the sight line to the hero’s head stops clearing the');
console.log('near wall, and occlusion goes up EIGHTFOLD. The 0.56-to-1.04 band at the');
console.log('top is inside the probe’s own quantisation — it marches the sight line in');
console.log('0.18-unit steps, so a few dozen cells sitting exactly on the line flip');
console.log('either way. Do not read a winner out of those four rows. The cliff is 1600');
console.log('cells and is not noise.');
console.log('');
console.log('So the honest reading: the shipped pitch sits on the safe side of a cliff,');
console.log('and the only move that is free (66°) buys 4% more frame depth for nothing');
console.log('measurable. Four percent is not worth re-baselining every luminance gate,');
console.log('telegraph radius and weapon reach in the game, which is what changing the');
console.log('rig means. NEAR_MAX in wall-profile.js is 3 precisely because the sight');
console.log('line at 70.7° passes a hero’s head at the south wall — that number, and');
console.log('every wall height derived from it, is what the cliff is made of.');

// ── 4 ──────────────────────────────────────────────────────────────────────
console.log('\n\n4. WHAT TO DO\n');
console.log('Nothing, to the camera. The measurement above says the camera is not');
console.log('holding back on hero size — it is at the exact trade point, and every');
console.log('step toward a bigger hero is a step toward a fight you cannot see.');
console.log('');
console.log('The hero is 12.9% of the frame’s height. That is not a small character;');
console.log('it is a small character IN PIXELS AT 720p, and those are different');
console.log('problems with different answers. The pixel count is the player’s monitor.');
console.log('The fraction is ours, and it is already generous for a top-down game.');
console.log('');
console.log('So the readability work that pays is the work that does not need more');
console.log('pixels: silhouette, value separation against the floor, and not spending');
console.log('the few pixels there are on effects priced for a bigger character. This');
console.log('project has now been bitten twice by the last one — the actor outline');
console.log('and the chromatic aberration — and both were found by looking at a');
console.log('picture after the numbers said everything was fine.');
