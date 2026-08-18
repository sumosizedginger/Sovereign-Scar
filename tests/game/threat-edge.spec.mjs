// tests/game/threat-edge.spec.mjs — a warning for the attack you cannot see.
//
// `tests/qa/arena-frame.mjs` measured that three of the five enemy kinds commit
// attacks from outside the gameplay frame — lancer at 7, censer at 9, weaver at
// 11, against a frame that reaches 6.18 on its shallow axis. `hero-scale.mjs`
// then showed the camera cannot fix it: frame depth and the hero's on-screen
// size are the same knob, so buying frame costs the character.
//
// The game already promises a telegraph for every committed attack. This keeps
// that promise for the ones the frame cannot hold, by putting a mark on the
// edge of the screen for exactly the duration of the wind-up.
//
// WHAT IS HELD HERE
//   1. The geometry — a threat off the top of the frame marks the top, and the
//      arrow points at it. This is where an off-by-a-sign is invisible in the
//      code and obvious on screen, and it is why the projection is asserted
//      against a real camera rather than trusted.
//   2. A threat that is ON screen gets no mark. The ring is already doing it.
//   3. The mark lives exactly as long as the wind-up.
//   4. It is a WARNING, not a radar — nothing marks an enemy that is not
//      currently attacking.
//   5. `Enemy._beginWindup` is where it is hooked, which is the one choke point
//      every attack in the bestiary passes through.

import * as THREE from 'three';
import fs from 'node:fs';
import { ThreatEdge } from '../../src/game/fx/threat-edge.js';

const CR = String.fromCharCode(13);
const read = (p) => fs.readFileSync(p, 'utf8').split(CR).join('');

/** The shipped rig, from index.js / renderer.js. */
function gameCamera() {
    const cam = new THREE.PerspectiveCamera(40, 1280 / 720, 0.1, 500);
    cam.position.set(0, 17.5, 6.125);
    cam.lookAt(0, 0.5, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    return cam;
}

export function run(t) {
    const cam = gameCamera();

    // ── 1. THE PROJECTION, AGAINST A REAL CAMERA ───────────────────────────
    //
    // `project` is hand-rolled — the hot loop should not allocate a Vector3 per
    // mark per frame — so it is checked against the three.js one it replaces.
    {
        const te = new ThreatEdge();
        let worst = 0;
        for (const p of [[0, 2, 0], [5, 2, -5], [-8, 2, 6], [0, 2, -11], [12, 2, 3]]) {
            const mine = te.project({ x: p[0], y: p[1], z: p[2] }, cam);
            const theirs = new THREE.Vector3(p[0], p[1], p[2]).project(cam);
            worst = Math.max(worst, Math.abs(mine.x - theirs.x), Math.abs(mine.y - theirs.y));
        }
        t.ok('the hand-rolled projection matches three.js', worst < 1e-6,
            `worst disagreement ${worst.toExponential(2)}`);

        // THE BEHIND-CAMERA BRANCH, MADE TO EXECUTE.
        //
        // It cannot happen at this game's fixed 70.7° rig — nothing is ever
        // behind the lens — so the counterfactual that deleted the sign
        // correction stayed green against every on-screen case. An unreachable
        // fix with a spec written over it is not tested, it is decorated. This
        // asks the function directly, with a point placed behind the camera by
        // walking backwards along its own view direction.
        // Behind AND off the axis, deliberately. A point straight back along
        // the view direction projects to the middle of the frame whichever sign
        // convention you use, so it cannot tell a corrected projection from an
        // uncorrected one — the first version of this used one and read 0.003.
        const back = { x: 8, y: 20, z: 30 };
        const mine = te.project(back, cam);
        const three = new THREE.Vector3(back.x, back.y, back.z).project(cam);
        t.ok('a point behind the lens is recognised as behind', mine.behind === true);
        // `Vector3.project` divides by a negative w and flips both axes, so a
        // caller that trusts it draws the arrow on the opposite edge from the
        // threat — worse than no arrow.
        t.ok('…and its sign is corrected, not inherited from three.js',
            Math.sign(mine.y) === -Math.sign(three.y)
            && Math.abs(mine.y + three.y) < 1e-6,
            `mine ${mine.y.toFixed(3)}, three ${three.y.toFixed(3)}`);
        // Behind the camera is off the BOTTOM: the lens looks down -Z, so
        // anything behind it is further +Z than the player, which is down-screen.
        t.ok('…and it marks the bottom edge', mine.y < -1, `${mine.y.toFixed(3)}`);
        t.ok('…on the side it is actually on', mine.x > 1, `${mine.x.toFixed(3)}`);
    }

    // ── 2. THE GEOMETRY — WHICH EDGE, AND WHICH WAY ────────────────────────
    //
    // The camera is pitched 70.7° looking down -Z, so a threat further along
    // -Z is UP the screen. A sign error here puts the arrow on the opposite
    // edge from the thing about to hit you, which is worse than no arrow, and
    // it is completely invisible in a code review.
    {
        const te = new ThreatEdge();
        const far = te.project({ x: 0, y: 2, z: -11 }, cam);      // weaver range
        const near = te.project({ x: 0, y: 2, z: 11 }, cam);
        const right = te.project({ x: 22, y: 2, z: 0 }, cam);
        const left = te.project({ x: -22, y: 2, z: 0 }, cam);

        t.ok('a threat 11 units up-screen really is off frame',
            Math.abs(far.y) > 1, `ndc.y ${far.y.toFixed(3)}`);
        t.ok('…and it is off the TOP', far.y > 1, `ndc.y ${far.y.toFixed(3)}`);
        t.ok('a threat 11 units toward the lens is off the BOTTOM',
            near.y < -1, `ndc.y ${near.y.toFixed(3)}`);
        t.ok('…and the two are on opposite edges', far.y * near.y < 0);
        t.ok('a threat to the east is off the RIGHT', right.x > 1, `${right.x.toFixed(3)}`);
        t.ok('a threat to the west is off the LEFT', left.x < -1, `${left.x.toFixed(3)}`);

        // The rotation the element is given, from the same arithmetic the
        // update loop uses. The chevron art points up the screen, so the angle
        // is measured from +Y.
        const degFor = (ndc) => {
            const k = 1 / Math.max(Math.abs(ndc.x), Math.abs(ndc.y) || 1e-6);
            return Math.atan2(ndc.x * k, ndc.y * k) * 180 / Math.PI;
        };
        t.ok('the arrow for a threat above points up', Math.abs(degFor(far)) < 1,
            `${degFor(far).toFixed(1)}°`);
        t.ok('…for one below, down', Math.abs(Math.abs(degFor(near)) - 180) < 1,
            `${degFor(near).toFixed(1)}°`);
        // NOT EXACTLY 90°, and that is the camera being right rather than the
        // arrow being wrong. A body due east of the look point still stands at
        // chest height, which is above the look plane, and a pitched camera
        // projects a raised point UP the screen — so "due east" comes out at
        // 87.6°, tilted very slightly toward the top. Asserting 90° to a degree
        // would be asserting that the camera is not pitched.
        t.ok('…for one to the east, right', Math.abs(degFor(right) - 90) < 6,
            `${degFor(right).toFixed(1)}°`);
        t.ok('…for one to the west, left', Math.abs(degFor(left) + 90) < 6,
            `${degFor(left).toFixed(1)}°`);
        // The tolerance is not a licence: east and west still have to be
        // opposite, and neither may drift into the vertical half.
        t.ok('…and east and west stay opposite',
            degFor(right) > 45 && degFor(left) < -45,
            `east ${degFor(right).toFixed(1)}°, west ${degFor(left).toFixed(1)}°`);
    }

    // ── 3. THE RANGED KINDS THIS EXISTS FOR ────────────────────────────────
    //
    // Derived from `enemy.js`, not invented: the whole reason for the feature
    // is that these three act from beyond the frame and melee does not.
    {
        const te = new ThreatEdge();
        const offFrame = (d) => {
            const n = te.project({ x: 0, y: 2, z: d }, cam);
            return Math.abs(n.y) > 1;
        };
        t.ok('a melee attacker is on screen and needs no mark', !offFrame(1.4));
        t.ok('a bulwark charging from 3.5 is on screen', !offFrame(3.5));
        t.ok('a lancer at its attackRange of 7 is NOT', offFrame(7));
        t.ok('a censer at 9 is NOT', offFrame(9));
        t.ok('a weaver at 11 is NOT', offFrame(11));
    }

    // ── 4. IT IS A WARNING, NOT A RADAR ────────────────────────────────────
    {
        const te = new ThreatEdge();
        t.ok('nothing is marked before anything attacks', te._marks.length === 0);
        te.mark({ x: 0, y: 2, z: -11 }, 0.6);
        t.ok('a committed attack is marked', te._marks.length === 1);
        // Re-telegraphing mid-wind-up is one threat, not two.
        const pos = { x: 3, y: 2, z: -11 };
        te.mark(pos, 0.6); te.mark(pos, 0.6); te.mark(pos, 0.6);
        t.ok('the same attacker is refreshed, never stacked', te._marks.length === 2,
            `${te._marks.length}`);
        // A zero or missing wind-up is not an attack.
        te.mark({ x: 9, y: 2, z: 0 }, 0);
        te.mark(null, 0.5);
        t.ok('a zero-length or bodiless attack marks nothing', te._marks.length === 2);

        // And it is bounded — a six-enemy arena all telegraphing at once must
        // not turn the frame into a warning light.
        const many = new ThreatEdge();
        for (let i = 0; i < 12; i++) many.mark({ x: i, y: 2, z: -11 }, 0.6);
        t.ok('the number of marks is capped', many._marks.length <= 4,
            `${many._marks.length}`);
    }

    // ── 5. IT LASTS EXACTLY THE WIND-UP ────────────────────────────────────
    //
    // No camera passed, so nothing tries to touch the DOM: this is the clock,
    // and the clock is the promise. A mark that outlives its attack says a hit
    // is coming that already came.
    {
        const te = new ThreatEdge();
        te.mark({ x: 0, y: 2, z: -11 }, 0.5);
        te.update(0.2, null);
        t.ok('still marked part way through the wind-up', te._marks.length === 1);
        te.update(0.2, null);
        t.ok('…and just before it resolves', te._marks.length === 1);
        te.update(0.2, null);
        t.ok('gone when the attack resolves', te._marks.length === 0);

        const te2 = new ThreatEdge();
        te2.mark({ x: 0, y: 2, z: -11 }, 5);
        te2.clear();
        t.ok('clear() drops everything', te2._marks.length === 0);

        // Disabled means disabled — the settings screen owns this.
        const te3 = new ThreatEdge();
        te3.enabled = false;
        te3.mark({ x: 0, y: 2, z: -11 }, 0.6);
        t.ok('nothing is marked while it is switched off', te3._marks.length === 0);
    }

    // ── 6. THE HOOK ────────────────────────────────────────────────────────
    //
    // Everything above is satisfiable by a module the game never calls.
    {
        const enemy = read('src/game/enemy.js');
        t.ok('enemy.js imports it',
            /import \{ threatEdge \} from '\.\/fx\/threat-edge\.js';/.test(enemy));
        // In `_beginWindup`, which is the one choke point every committed
        // attack routes through — so a new enemy kind gets this by existing.
        const start = enemy.indexOf('_beginWindup(resolve, opts = {}) {');
        const body = enemy.slice(start, enemy.indexOf('\n    }', start));
        t.ok('…and marks from inside _beginWindup', /threatEdge\.mark\(/.test(body));
        t.ok('…with the wind-up duration, not a constant',
            /threatEdge\.mark\(this\.rig\?\.position, dur,/.test(body));
        t.ok('…and it is not behind a dead guard',
            !/(?:false|void 0) *&& *threatEdge\.mark/.test(enemy));

        const idx = read('src/game/index.js');
        t.ok('the frame loop updates it',
            /^ +threatEdge\.update\(sdt, camera\);$/m.test(idx));
        // AFTER the rig: the mark is a projection through THIS frame's camera.
        const camAt = idx.indexOf('camRig.update(sdt, player.root.position);');
        const teAt = idx.indexOf('threatEdge.update(sdt, camera);');
        t.ok('…after the camera has been moved, not before',
            camAt > 0 && teAt > camAt, `rig ${camAt}, marks ${teAt}`);
        t.ok('…and a level change clears it',
            /^ +threatEdge\.clear\(\);/m.test(idx));
    }

    // ── 7. THE COLOUR AGREES WITH THE RING ─────────────────────────────────
    {
        const enemy = read('src/game/enemy.js');
        t.ok('the mark takes the telegraph colour', /telegraphCss\(opts\.color\)/.test(enemy));
        t.ok('…converted from the ring’s own hex', /function telegraphCss\(hex\)/.test(enemy));
    }
}
