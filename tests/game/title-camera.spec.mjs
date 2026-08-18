// tests/game/title-camera.spec.mjs — the first frame anybody sees.
//
// WHAT THIS PINS, and all of it was measured before it was written.
//
// The title screen used the GAMEPLAY camera doing a slow lap: a 70.7° pitch,
// 18.5 metres back, framed on the player. `ui/menu.js` records what that
// produced — "the only subject in the frame (the hero, ~30px) sat dead centre
// directly behind the 44px wordmark". Two faults, neither about art:
// a top-down lens foreshortens a standing figure into their own hat, and a
// centred subject sits behind a centred menu.
//
// `ui/title-camera.js` is a second camera with the opposite job. Measured after
// (`tests/qa/title-shot.mjs`): the hero is 205 px, 28% of the frame's height,
// at NDC (−0.44, +0.10) — the left third, above the rows — and never occluded.
//
// THE ASSERTIONS THAT MATTER ARE THE FRAMING ONES, and they run the real code
// against a real `THREE.PerspectiveCamera` and project the subject through it.
// Checking that `TITLE_NDC_X` is −0.44 would be checking a constant against
// itself; two closed-form attempts at the aim offset were wrong — one used
// world up at a pitched camera, the other built the camera's own basis and was
// then undone by `lookAt` re-deriving it — and both would have passed a test
// written that way.

import * as THREE from 'three';
import fs from 'node:fs';
import {
    TitleCamera, pickAzimuth,
    TITLE_PITCH, TITLE_DIST, TITLE_NDC_X, TITLE_NDC_Y, SUBJECT_Y,
    DRIFT_YAW, DRIFT_PERIOD, DRIFT_DIST, DRIFT_DIST_PERIOD,
} from '../../src/game/ui/title-camera.js';

/** The gameplay rig, from index.js — what this camera is deliberately not. */
const PLAY_PITCH = Math.atan2(17.5, 17.5 * 0.35);

const HERO = { x: 0, y: 1.95, z: 0 };

function freshCamera(aspect = 16 / 9) {
    const c = new THREE.PerspectiveCamera(40, aspect, 0.1, 500);
    c.updateProjectionMatrix();
    return c;
}

/** Where the subject lands on screen, in NDC, after one framed update. */
function frameOnce(cam, opts = {}) {
    const tc = new TitleCamera();
    tc.update(opts.dt ?? 0, cam, HERO, opts.solidAt, opts.rig, opts.scene);
    cam.updateMatrixWorld();
    const p = new THREE.Vector3(HERO.x, HERO.y + SUBJECT_Y, HERO.z).project(cam);
    return { tc, ndc: p };
}

export function run(t) {
    // ── 1. It is a different camera, not a nudge to the gameplay one ───────
    {
        t.ok('the title pitch is far below the gameplay pitch',
            TITLE_PITCH < PLAY_PITCH * 0.55,
            `${(TITLE_PITCH * 180 / Math.PI).toFixed(0)}° vs ${(PLAY_PITCH * 180 / Math.PI).toFixed(0)}°`);
        t.ok('…and closer than the gameplay rig',
            TITLE_DIST < Math.hypot(17.5, 17.5 * 0.35),
            `${TITLE_DIST} vs ${Math.hypot(17.5, 17.5 * 0.35).toFixed(1)}`);
        t.ok('the subject is off-centre horizontally', Math.abs(TITLE_NDC_X) > 0.25);
        t.ok('…and above the middle, where the menu rows are not', TITLE_NDC_Y > 0);
    }

    // ── 2. THE FRAMING, solved against a real projection ───────────────────
    {
        const cam = freshCamera();
        const { ndc } = frameOnce(cam);
        t.ok('the subject lands where the composition asked, horizontally',
            Math.abs(ndc.x - TITLE_NDC_X) < 0.02,
            `ndcX ${ndc.x.toFixed(3)} wanted ${TITLE_NDC_X}`);
        t.ok('…and vertically',
            Math.abs(ndc.y - TITLE_NDC_Y) < 0.02,
            `ndcY ${ndc.y.toFixed(3)} wanted ${TITLE_NDC_Y}`);
        t.ok('…and the subject is in front of the lens', ndc.z > 0 && ndc.z < 1);

        // AT EVERY ASPECT RATIO. This is the assertion the two closed forms
        // would have failed: a shot composed for 16:9 and played at 21:9 puts
        // the hero somewhere else, on the one screen every player sees first.
        for (const aspect of [4 / 3, 16 / 10, 16 / 9, 21 / 9, 32 / 9]) {
            const c = freshCamera(aspect);
            const p = frameOnce(c).ndc;
            t.ok(`framing holds at ${aspect.toFixed(2)}:1`,
                Math.abs(p.x - TITLE_NDC_X) < 0.02 && Math.abs(p.y - TITLE_NDC_Y) < 0.02,
                `ndc ${p.x.toFixed(3)},${p.y.toFixed(3)}`);
        }
    }

    // ── 3. The lens really is where the pitch and distance say ─────────────
    {
        const cam = freshCamera();
        frameOnce(cam);
        const subj = new THREE.Vector3(HERO.x, HERO.y + SUBJECT_Y, HERO.z);
        const d = cam.position.distanceTo(subj);
        t.ok('the lens sits at the composed distance', Math.abs(d - TITLE_DIST) < 0.05,
            `${d.toFixed(2)} vs ${TITLE_DIST}`);
        const pitch = Math.atan2(cam.position.y - subj.y,
            Math.hypot(cam.position.x - subj.x, cam.position.z - subj.z));
        t.ok('…at the composed pitch', Math.abs(pitch - TITLE_PITCH) < 0.02,
            `${(pitch * 180 / Math.PI).toFixed(1)}°`);
        t.ok('…and above the subject, not below', cam.position.y > subj.y);
    }

    // ── 4. The drift is zero-mean ──────────────────────────────────────────
    //
    // A composition that creeps is somewhere else by the time a player has read
    // the menu — and the certification gate meters mean frame luminance, which
    // a wandering camera would move on its own.
    {
        const cam = freshCamera();
        const tc = new TitleCamera();
        const N = 720;
        const period = Math.max(DRIFT_PERIOD, DRIFT_DIST_PERIOD);
        let sumX = 0, sumZ = 0, sumD = 0, minD = Infinity, maxD = -Infinity;
        const subj = new THREE.Vector3(HERO.x, HERO.y + SUBJECT_Y, HERO.z);
        let worstNdc = 0;
        for (let i = 0; i < N; i++) {
            // A whole number of BOTH periods, so a non-zero mean is the wave's
            // and not the window's.
            tc.update((period * 27) / N, cam, HERO, null, null, null);
            cam.updateMatrixWorld();
            sumX += cam.position.x - HERO.x;
            sumZ += cam.position.z - HERO.z;
            const d = cam.position.distanceTo(subj);
            sumD += d; minD = Math.min(minD, d); maxD = Math.max(maxD, d);
            const p = new THREE.Vector3().copy(subj).project(cam);
            worstNdc = Math.max(worstNdc, Math.abs(p.x - TITLE_NDC_X), Math.abs(p.y - TITLE_NDC_Y));
        }
        t.ok('the drift actually moves the lens', maxD - minD > DRIFT_DIST * 0.6,
            `${(maxD - minD).toFixed(2)}m of push`);
        t.ok('…and stays inside its stated amplitude', maxD - minD <= DRIFT_DIST * 1.2 + 0.01,
            `${(maxD - minD).toFixed(2)}m vs ${DRIFT_DIST}`);
        t.ok('the mean distance is the composed distance',
            Math.abs(sumD / N - TITLE_DIST) < 0.06, `${(sumD / N).toFixed(3)}`);
        t.ok('…and the lens does not walk off in x or z',
            Math.abs(sumX / N) < 0.25 && Math.abs(sumZ / N - TITLE_DIST * Math.cos(TITLE_PITCH)) < 0.25,
            `mean offset ${(sumX / N).toFixed(3)}, ${(sumZ / N).toFixed(3)}`);
        t.ok('and the subject stays framed the whole way round', worstNdc < 0.03,
            `worst ndc error ${worstNdc.toFixed(3)}`);
        t.ok('the yaw drift is small enough to read as breathing',
            DRIFT_YAW < 0.2, `${DRIFT_YAW} rad`);
    }

    // ── 5. The bearing is chosen against the world, not assumed ────────────
    {
        // A wall to the south of the hero: the lens cannot go there.
        const wallSouth = (x, y, z) => z > 4 && Math.abs(x) < 20 && y < 12;
        const a = pickAzimuth(HERO, wallSouth);
        const lensZ = Math.cos(a) * TITLE_DIST * Math.cos(TITLE_PITCH);
        t.ok('a bearing whose lens is inside a wall is refused', lensZ < 4,
            `lens z ${lensZ.toFixed(1)}`);

        // Open everywhere, mass only to the east: the shot should look east,
        // which puts the lens to the WEST.
        const massEast = (x, _y, z) => x > 8 && x < 30 && Math.abs(z) < 30;
        const b = pickAzimuth(HERO, massEast);
        t.ok('a bearing with a backdrop beats one without',
            Math.sin(b) < -0.3, `lens bearing ${(b * 180 / Math.PI).toFixed(0)}°`);

        // Nothing anywhere: fall back to looking north, which is the tall wall
        // in every room in the game (`wall-profile.js`).
        t.ok('with nothing to look at it faces the far wall',
            Math.abs(pickAzimuth(HERO, () => false)) < 0.01);
        t.ok('and with no world query at all it still answers',
            pickAzimuth(HERO, null) === 0);

        // Deterministic — a title screen that reframes itself between two
        // equally good bearings is a title screen that flickers.
        t.ok('the same room always picks the same bearing',
            pickAzimuth(HERO, massEast) === b);
        // AND THE HOLDER ONLY ASKS ONCE. The line above compares the function
        // with itself and cannot see `TitleCamera` re-choosing every frame,
        // which is the way this actually breaks: the counterfactual that made
        // the bearing wander stayed green until this existed.
        {
            const tc = new TitleCamera();
            const cam = freshCamera();
            tc.update(0.016, cam, HERO, massEast, null, null);
            const first = tc.azimuth;
            for (let i = 0; i < 30; i++) tc.update(0.016, cam, HERO, massEast, null, null);
            t.ok('…and the shot holds it instead of re-choosing every frame',
                tc.azimuth === first, `${first} -> ${tc.azimuth}`);
            tc.reset();
            t.ok('…until the title is reopened', tc.azimuth === null);
        }

        // THE LENS CHECK AND THE SIGHT CHECK ARE DIFFERENT CHECKS, and until
        // this case existed, deleting either one left the spec green: every
        // fixture above happened to trip both. This solid is a small pocket
        // AROUND the ideal southern lens position and nowhere else — the sight
        // march stops a step short of the lens, so only the open-air test can
        // see it.
        const lensY = HERO.y + Math.sin(TITLE_PITCH) * TITLE_DIST;
        const lensZ0 = Math.cos(0) * TITLE_DIST * Math.cos(TITLE_PITCH);
        const pocket = (x, y, z) => Math.hypot(x, y - lensY, z - lensZ0) < 0.2;
        t.ok('a bearing whose lens is in a pocket of solid is refused, ' +
            'even with a clear sight line',
            Math.abs(pickAzimuth(HERO, pocket)) > 0.01,
            `bearing ${(pickAzimuth(HERO, pocket) * 180 / Math.PI).toFixed(0)}°`);

        // Occlusion, not just walls — and ISOLATED from the backdrop score,
        // which the first attempt was not. That fixture used a pillar to the
        // south, and a pillar to the south is ALSO backdrop mass when seen
        // from the north, so the correct code and the code with the sight
        // check deleted both looked north for the same reason and the
        // counterfactual stayed green.
        //
        // This slab is derived from the module's own geometry: it sits exactly
        // on the sight line from the subject to the southern lens, at a height
        // that falls BETWEEN the three the backdrop march samples. It can only
        // be seen by the sight check.
        {
            const lensY = HERO.y + Math.sin(TITLE_PITCH) * TITLE_DIST;
            const lensZ = TITLE_DIST * Math.cos(TITLE_PITCH);
            const AT_Z = lensZ * 0.3;
            const lineY = (HERO.y + SUBJECT_Y) + (lensY - (HERO.y + SUBJECT_Y)) * 0.3;
            // The backdrop march samples hero.y + 1.5, 3.5 and 6.5.
            const massHeights = [1.5, 3.5, 6.5].map((h) => HERO.y + h);
            const slab = (x, y, z) => Math.abs(x) < 0.6
                && Math.abs(z - AT_Z) < 0.5 && Math.abs(y - lineY) < 0.18;
            t.ok('…and the slab misses every height the backdrop march samples',
                massHeights.every((h) => Math.abs(h - lineY) > 0.18),
                `line y ${lineY.toFixed(2)} vs ${massHeights.map((h) => h.toFixed(2)).join(', ')}`);
            t.ok('…and it does sit on the southern sight line', slab(0, lineY, AT_Z));
            const c = pickAzimuth(HERO, slab);
            t.ok('a bearing looking through it is refused', Math.abs(c) > 0.01,
                `bearing ${(c * 180 / Math.PI).toFixed(0)}°`);
        }
    }

    // ── 6. The key light, and giving everything back ───────────────────────
    //
    // The title borrows two things from the running game — a light in its scene
    // and the bloom pass's tuning — and a borrowed thing that is not returned
    // is a gameplay frame lit by the menu.
    {
        const scene = new THREE.Scene();
        const cam = freshCamera();
        const rig = { rotation: { y: 1.234 } };
        const tc = new TitleCamera();

        tc.update(0.016, cam, HERO, null, rig, scene);
        const key = scene.getObjectByName('title-key');
        t.ok('the title hangs its own key light', !!key);
        t.ok('…aimed at the subject', !!scene.getObjectByName('title-key-target'));
        t.ok('…and it is a spot, not a lamp on the whole room',
            !!key && key.isSpotLight === true);
        t.ok('…that casts no shadow, because the room already does',
            !!key && key.castShadow === false);
        t.ok('the hero is turned toward the lens', rig.rotation.y !== 1.234);

        // Idempotent: sixty frames of title must not be sixty lights.
        for (let i = 0; i < 60; i++) tc.update(0.016, cam, HERO, null, rig, scene);
        let lights = 0;
        scene.traverse((o) => { if (o.name === 'title-key') lights++; });
        t.ok('…and only ever one of it', lights === 1, `${lights} key lights`);

        // THE BLOOM IS BORROWED TOO. A stand-in, because the real pass lives in
        // `engine/renderer.js`, which touches `window` at module scope — and a
        // stand-in is the better subject anyway: it can be inspected before and
        // after, which a module-level singleton cannot.
        const bloom = { threshold: 0.85, strength: 0.7 };
        const tc2 = new TitleCamera();
        tc2.setBloom(bloom);
        tc2.update(0.016, freshCamera(), HERO, null, null, new THREE.Scene());
        t.ok('the title trims the bloom while it is up',
            bloom.threshold > 0.85 && bloom.strength < 0.7,
            `threshold ${bloom.threshold} strength ${bloom.strength}`);
        tc2.restoreHero(null);
        t.ok('…and gives the game its bloom back exactly',
            bloom.threshold === 0.85 && bloom.strength === 0.7,
            `threshold ${bloom.threshold} strength ${bloom.strength}`);
        // With no pass at all it must simply not care.
        const tc3 = new TitleCamera();
        let threw = false;
        try {
            tc3.update(0.016, freshCamera(), HERO, null, null, new THREE.Scene());
            tc3.restoreHero(null);
        } catch (_) { threw = true; }
        t.ok('a title with no bloom pass framed anyway', !threw);

        tc.restoreHero(rig);
        t.ok('leaving the title takes the key light out',
            !scene.getObjectByName('title-key'));
        t.ok('…and its target with it', !scene.getObjectByName('title-key-target'));
        t.ok('…and gives the hero their pose back', rig.rotation.y === 1.234);
    }

    // ── 7. The frame loop drives it, and both edges are handled ────────────
    //
    // Every assertion above stays green if `index.js` never calls any of this.
    // Read from source, and the EDGE specifically: `atTitle` is set in five
    // places, and a shot that is never reset is framed from wherever the last
    // one was.
    {
        const src = fs.readFileSync('src/game/index.js', 'utf8');
        t.ok('index.js imports the title camera', /import \{ TitleCamera \}/.test(src));
        t.ok('…constructs one', /new TitleCamera\(\)/.test(src));
        // MATCH THE STATEMENT, NOT THE IDENTIFIER, and a source check catches
        // a line being deleted or disabled — not a line being subtly wrong. It
        // is not pretending to.
        // Anchored to the statement's own indentation. A loose `[\s\S]{0,200}?`
        // between the `if` and the call was satisfied by
        // `if (false) titleCam.update(...)` sitting inside the block — which is
        // the counterfactual it was written to catch.
        t.ok('…and frames with it while at the title',
            new RegExp('\\n {8}titleCam\\.update\\(dt, camera, player\\.root\\.position,').test(src)
            && /if \(game\.atTitle\) \{/.test(src));
        t.ok('the entering edge picks a fresh shot',
            /if \(game\.atTitle\) titleCam\.reset\(\);/.test(src));
        t.ok('the leaving edge gives the hero and the bloom back',
            /else titleCam\.restoreHero\(/.test(src));
        t.ok('…and the bloom pass was handed to it at all',
            /titleCam\.setBloom\(/.test(src));
        // Both edges, from ONE comparison — five call sites set `atTitle`, and
        // a sixth would otherwise have to remember to call two methods.
        t.ok('…and both hang off one edge test, not off the call sites',
            /game\.atTitle !== wasAtTitle/.test(src));
        t.ok('the old gameplay-rig lap is gone',
            !/titleDrift/.test(src), 'index.js still orbits the gameplay rig');
    }
}
