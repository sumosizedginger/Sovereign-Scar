// tests/game/arena-camera.spec.mjs — the frame breathes with the fight.
//
// THE TICKET said: "a sealed arena pushes IN when it seals and eases out when
// it clears." Measuring the frame before building it (`tests/qa/arena-frame.mjs`)
// said the plan was backwards, and this spec holds the version the measurement
// produced rather than the version that was asked for.
//
// The camera is pitched 70.7°, which maps the screen's VERTICAL axis onto a
// short run of world Z. At the shipped rig the frame reaches 6.80 up-screen and
// 6.18 down-screen on the plane the characters stand on — a 13-unit window, in
// arenas that are 17 to 23 units across. So the frame is already too shallow
// for the rooms it is asked to show a fight in, and tightening it would have
// bought drama by hiding more of the fight.
//
// WHAT IS HELD HERE
//   1. The widen curve: free at knife range, rising with the fight, capped.
//   2. The cap is set by what it costs the hero, and the hero has a floor.
//   3. The free distance is derived from the REAL projection, not asserted to
//      be a nice number — the frame is measured here the same way the probe
//      measures it, so a change to fov, pitch or aspect fails this spec.
//   4. The channels compose with `max` and never with `+`.
//   5. The seal flinch has its own slot, and the arena never moves the look
//      target.
//
// WHY (3) IS DONE WITH A PROJECTION AND NOT A CONSTANT. This project has twice
// shipped a spec that was two copies of the same arithmetic agreeing with
// itself. `three` loads headless; the real `PerspectiveCamera` cannot, so it is
// the thing asked.

import * as THREE from 'three';
import fs from 'node:fs';
import {
    ARENA_WIDEN_MAX, ARENA_WIDEN_FREE, ARENA_WIDEN_RATE, ARENA_WIDEN_LERP,
    SECOND_WIDEN_MAX, SEAL_PUNCH_DURATION, SEAL_PUNCH_DEPTH, arenaWiden,
} from '../../src/game/camera-framing.js';

/** The shipped rig. Named with its source: a spec that invents a camera tests nothing. */
const CAM_HEIGHT = 17.5;              // src/game/index.js CAM_HEIGHT
const CAM_BACK = CAM_HEIGHT * 0.35;   // src/game/index.js
const FOV = 40;                       // src/engine/renderer.js
const ASPECT = 1280 / 720;
const LOOK_Y = 0.5;                   // CameraRig default lookY
const SUBJECT_Y = 2.0;                // character centre, not the floor
/** Measured at the shipped rig, 1280 wide, by `tests/qa/aberration-cost.mjs`. */
const HERO_PX_AT_BASE = 34;
/**
 * The hero may not be shrunk below this by any automatic framing.
 *
 * 30 px rather than a fraction, because the failures this game has had are
 * absolute: a 2 px outline that killed a 30 px character, a 3 px colour split
 * on a 34 px one. The number that matters is how many pixels are left.
 */
const HERO_PX_FLOOR = 30;

/** How far from the look point a body stays inside the frame, along (dx,dz). */
function frameReach(height, back, dx, dz) {
    const cam = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 500);
    cam.position.set(0, height, back);
    cam.lookAt(0, LOOK_Y, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    let lo = 0, hi = 400;
    for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        const v = new THREE.Vector3(dx * m, SUBJECT_Y, dz * m).project(cam);
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) lo = m; else hi = m;
    }
    return lo;
}

/** Hero width in px at a widened rig — on-screen size goes as 1/distance. */
function heroPx(widen) {
    const b = Math.hypot(CAM_HEIGHT, CAM_BACK);
    const n = Math.hypot(CAM_HEIGHT + widen, CAM_BACK + widen * 0.35);
    return HERO_PX_AT_BASE * b / n;
}

/**
 * Source, with CRLF folded away.
 *
 * This working copy is CRLF, and an assertion that anchors on line shape (`^`,
 * `$`, an exact indent) is one stray carriage return away from passing or
 * failing for a reason that has nothing to do with the game.
 */
const CR = String.fromCharCode(13);
const read = (p) => fs.readFileSync(p, 'utf8').split(CR).join('');

export function run(t) {
    const rig = read('src/game/camera-rig.js');

    // ── 1. The widen curve ─────────────────────────────────────────────────
    {
        t.ok('a fight at knife range costs nothing',
            arenaWiden(0) === 0 && arenaWiden(1) === 0 && arenaWiden(ARENA_WIDEN_FREE) === 0,
            `0/${arenaWiden(1)}/${arenaWiden(ARENA_WIDEN_FREE)}`);
        t.ok('a fight one unit past free opens by exactly the rate',
            Math.abs(arenaWiden(ARENA_WIDEN_FREE + 1) - ARENA_WIDEN_RATE) < 1e-9,
            `${arenaWiden(ARENA_WIDEN_FREE + 1)}`);
        t.ok('and it caps',
            arenaWiden(1000) === ARENA_WIDEN_MAX, `${arenaWiden(1000)}`);
        // A non-monotone widen is a camera that closes as the fight spreads.
        let mono = true, prev = -1;
        for (let d = 0; d <= 40; d += 0.25) {
            const w = arenaWiden(d);
            if (w < prev - 1e-9) mono = false;
            prev = w;
        }
        t.ok('the curve never goes backwards as the fight spreads', mono);
        t.ok('a nonsense separation asks for nothing',
            arenaWiden(-5) === 0 && arenaWiden(NaN) === 0);
    }

    // ── 2. THE CAP IS THE HERO ─────────────────────────────────────────────
    //
    // The whole reason this channel is capped tighter than the boss channel.
    {
        const px = heroPx(ARENA_WIDEN_MAX);
        t.ok('the arena never shrinks the hero past the floor',
            px >= HERO_PX_FLOOR,
            `${px.toFixed(1)}px at widen ${ARENA_WIDEN_MAX}, floor ${HERO_PX_FLOOR}px`);
        t.ok('…and the cap is what is holding it there, not luck',
            heroPx(ARENA_WIDEN_MAX + 1) < HERO_PX_FLOOR,
            `one unit further would be ${heroPx(ARENA_WIDEN_MAX + 1).toFixed(1)}px`);
        t.ok('the arena is the cheaper of the two framing channels',
            ARENA_WIDEN_MAX < SECOND_WIDEN_MAX,
            `arena ${ARENA_WIDEN_MAX} vs boss ${SECOND_WIDEN_MAX}`);
        // The boss channel is allowed to cost more because the alternative is
        // fighting something you cannot see at all. It is still not unbounded.
        t.ok('…and even the boss channel has a cap',
            SECOND_WIDEN_MAX > 0 && Number.isFinite(SECOND_WIDEN_MAX));
    }

    // ── 3. THE FREE DISTANCE, AGAINST THE REAL PROJECTION ──────────────────
    //
    // `ARENA_WIDEN_FREE` is not a taste. It is "how far apart can a fight be
    // before the frame stops containing it", and the frame is asked here.
    {
        const down = frameReach(CAM_HEIGHT, CAM_BACK, 0, 1);
        const up = frameReach(CAM_HEIGHT, CAM_BACK, 0, -1);
        const side = frameReach(CAM_HEIGHT, CAM_BACK, 1, 0);

        t.ok('the shallow axis really is the near one',
            down < up && down < side,
            `down ${down.toFixed(2)} up ${up.toFixed(2)} side ${side.toFixed(2)}`);
        // Free must not exceed what the frame already holds, or the camera
        // would sit still through fights it is already failing to show.
        t.ok('nothing is free that the frame cannot already contain',
            ARENA_WIDEN_FREE <= down,
            `free ${ARENA_WIDEN_FREE} vs down-reach ${down.toFixed(2)}`);
        // And it must not be so small that every fight pays. A melee kind
        // stops at attackRange 1.4; a bulwark closes to 3.5.
        t.ok('…and a melee fight still pays nothing',
            arenaWiden(3.5) === 0);

        // The widen has to actually buy frame, or it is cost with no product.
        const downCap = frameReach(
            CAM_HEIGHT + ARENA_WIDEN_MAX, CAM_BACK + ARENA_WIDEN_MAX * 0.35, 0, 1,
        );
        t.ok('the widen buys real depth on the axis that binds',
            downCap > down + 0.5,
            `${down.toFixed(2)} -> ${downCap.toFixed(2)}`);

        // HONEST LIMIT, ASSERTED SO IT CANNOT BE QUIETLY FORGOTTEN. Three of
        // the five enemy kinds act from beyond the frame even at full widen —
        // lancer 7, censer 9, weaver 11. The camera cannot fix that without
        // costing the hero more than it is worth, and pretending otherwise is
        // how a known gap turns into a surprise.
        t.ok('the ranged kinds are STILL off-screen at the cap (known, tracked)',
            downCap < 7,
            `down-reach at cap ${downCap.toFixed(2)} < lancer attackRange 7`);
    }

    // ── 4. THE CHANNELS COMPOSE WITH max, NEVER WITH + ─────────────────────
    //
    // A boss with adds sets both. Summing them opens the frame to +9 and
    // renders the hero at 24 px.
    {
        t.ok('camera-rig takes the max of the two widens',
            /widen = Math\.max\(widen, this\._arenaW\)/.test(rig));
        t.ok('…and adds the result to the rig exactly once',
            (rig.match(/effH \+= widen/g) || []).length === 1,
            `${(rig.match(/effH \+= widen/g) || []).length} sites`);
        t.ok('the arena widen is never added to the boss widen',
            !/widen \+= this\._arenaW/.test(rig) && !/this\._arenaW \+ widen/.test(rig));
    }

    // ── 5. THE ARENA MOVES NOTHING, IT ONLY OPENS ──────────────────────────
    //
    // Six chasing bodies have a centroid, and it is not a place the player is
    // looking. Sliding a 34-px hero off centre to point at it would cost more
    // than the framing buys.
    {
        const start = rig.indexOf('if (this._threats) {');
        const end = rig.indexOf('this._arenaW +=');
        t.ok('the threats block exists and is where it is expected',
            start > 0 && end > start, `start ${start} end ${end}`);
        if (start > 0 && end > start) {
            const block = rig.slice(start, end);
            t.ok('…and it never moves the look target',
                !/\bx \+=/.test(block) && !/\bz \+=/.test(block),
                block.replace(/\s+/g, ' ').slice(0, 120));
            t.ok('…it only reads the threats to measure separation',
                /Math\.hypot/.test(block));
        }
    }

    // ── 6. THE SEAL FLINCH HAS ITS OWN SLOT ────────────────────────────────
    //
    // A seal and a killing blow land on the same frame constantly — clearing
    // the last add of a wave as the next room seals. Sharing `_kick` would let
    // whichever wrote last silently eat the other, which is the exact bug
    // `kick()` was given its own slot to avoid.
    {
        t.ok('sealPunch writes its own channel', /this\._punch = \{/.test(rig));
        t.ok('…and does not write the kick channel',
            !/sealPunch[\s\S]{0,200}this\._kick =/.test(rig));
        t.ok('…and update consumes it', /if \(this\._punch\) \{/.test(rig));
        t.ok('the flinch is short enough to be a flinch',
            SEAL_PUNCH_DURATION > 0 && SEAL_PUNCH_DURATION <= 0.8,
            `${SEAL_PUNCH_DURATION}s`);
        t.ok('…and shallow enough not to be a cutscene',
            SEAL_PUNCH_DEPTH > 0 && SEAL_PUNCH_DEPTH < ARENA_WIDEN_MAX * 2,
            `${SEAL_PUNCH_DEPTH}`);
    }

    // ── 7. NOTHING BLEEDS INTO THE NEXT LEVEL ──────────────────────────────
    //
    // `clearFocus` is the "camera state resets with the level" function. The
    // smoothed weight has to go too — dropping only the threat list would open
    // the next level mid-exhale.
    {
        const cf = rig.slice(rig.indexOf('clearFocus() {'));
        const body = cf.slice(0, cf.indexOf('\n    }'));
        t.ok('clearFocus drops the threat list', /this\._threats = null/.test(body));
        t.ok('…AND the smoothed widen', /this\._arenaW = 0/.test(body));
        t.ok('…AND the flinch', /this\._punch = null/.test(body));
    }

    // ── 8. THE SEAL IS WHAT GATES IT ───────────────────────────────────────
    //
    // A room with enemies you may walk away from is not an arena. Framing it
    // as one would open the camera in every corridor with a scarab in it.
    {
        const rg = read('src/game/world/room-graph.js');
        const start = rg.indexOf('function arenaThreats()');
        t.ok('room-graph publishes the arena threats', start > 0);
        const block = rg.slice(start, start + 700);
        t.ok('…gated on the same seal the door is',
            /if \(!sealedBy\(currentRoomId\)\) return null;/.test(block));
        t.ok('…and skips the dead',
            /DEAD/.test(block) && /defeated/.test(block));
        t.ok('…and it is exported', /^\s+arenaThreats,$/m.test(rg));
    }

    // ── 9. THE GAME ACTUALLY CALLS IT ──────────────────────────────────────
    //
    // Every assertion above is satisfied by code nothing runs. Two source
    // checks in the title-camera spec were satisfiable by `if (false)`, which
    // is why these name the call site and the reset.
    {
        const idx = read('src/game/index.js');
        // ANCHORED TO THE START OF THE LINE. The first version of this asked
        // only that the text appear, and the counterfactual sweep satisfied it
        // with `void 0 && camRig.setArenaThreats(...)` — the same hole two
        // checks in the title-camera spec had, where `if (false)` passed.
        t.ok('the frame loop feeds the rig the sealed room threats',
            /^ +camRig\.setArenaThreats\(/m.test(idx));
        t.ok('…as a live statement, not behind a dead guard',
            !/(?:void 0|false|0) *&& *camRig\.setArenaThreats/.test(idx));
        t.ok('…gated on sealState, so an unsealed room clears it',
            /const held = game\.level\?\.sealState\?\.\(\) \|\| null;/.test(idx));
        t.ok('the flinch fires on the transition, not every frame',
            /if \(nowRoom && nowRoom !== sealedRoomWas\) camRig\.sealPunch\(\);/.test(idx));
        // THE DECLARATION AND THE RESET ARE TWO DIFFERENT LINES, and the
        // first version of this could not tell them apart: deleting the reset
        // left `let sealedRoomWas = null;` matching, and the counterfactual
        // stayed green. Room ids are unique only within a level, so a dungeon
        // whose first arena shares a name with the last one's would swallow
        // its own flinch.
        t.ok('the memory is declared once, at module scope',
            /^let sealedRoomWas = null;$/m.test(idx));
        t.ok('…and reset separately, inside the level load',
            /^ {4}sealedRoomWas = null;$/m.test(idx));
    }

    // ── 10. The smoothing is a rate, and a sane one ────────────────────────
    {
        t.ok('the widen is smoothed rather than snapped',
            /1 - Math\.exp\(-ARENA_WIDEN_LERP \* dt\)/.test(rig));
        // Slower than the boss framing's 4: an arena's widest threat is a max()
        // over six bodies and JUMPS when the outermost one dies.
        t.ok('…more slowly than the boss framing tracks one body',
            ARENA_WIDEN_LERP < 4, `${ARENA_WIDEN_LERP}`);
        t.ok('…but fast enough to finish inside a fight',
            ARENA_WIDEN_LERP >= 1, `${ARENA_WIDEN_LERP}`);
        // e-folding: how long to cover 95% of a step.
        const t95 = -Math.log(0.05) / ARENA_WIDEN_LERP;
        t.ok('a full open takes between half a second and four',
            t95 > 0.5 && t95 < 4, `${t95.toFixed(2)}s to 95%`);
    }
}
