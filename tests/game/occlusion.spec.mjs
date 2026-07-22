// tests/game/occlusion.spec.mjs
// Ticket D / Change 2.2 — foreground occlusion controller. Verifies the
// sightline decision, the timed fade (20–35% band, depth-write cutoff), and
// that the controller only ever touches meshes registered as occluders.

import {
    isOccluding, stepFade, opacityFor, depthWriteFor, OcclusionController,
} from '../../src/game/fx/occlusion.js';

function fakeMesh(pos, mat) {
    return {
        isMesh: true,
        position: { x: pos.x, y: pos.y, z: pos.z },
        material: mat || { opacity: 1, transparent: false, depthWrite: true },
        geometry: null,
    };
}

export function run(t) {
    // Camera south-and-up of the subject, looking down at the origin — the rig's
    // real geometry (height 17.5, back ~6).
    const cam = { x: 0, y: 17.5, z: 6 };
    const subject = { x: 0, y: 1, z: 0 };

    // --- sightline decision ---
    // A tall form ~3 units south of the subject, on the line, occludes.
    t.ok('form on the sightline occludes',
        isOccluding(cam, subject, { x: 0, y: 5, z: 3 }, 1.5));
    // The same distance but 4 units to the side does not.
    t.ok('form off to the side does not occlude',
        !isOccluding(cam, subject, { x: 4, y: 5, z: 3 }, 1.5));
    // A form beyond the subject (north of it) does not occlude the subject.
    t.ok('form past the subject does not occlude',
        !isOccluding(cam, subject, { x: 0, y: 5, z: -4 }, 1.5));
    // A form behind the camera does not occlude.
    t.ok('form behind the camera does not occlude',
        !isOccluding(cam, subject, { x: 0, y: 18, z: 9 }, 1.5));
    // Degenerate: camera coincident with subject is never an occlusion.
    t.ok('coincident cam/subject is safe',
        !isOccluding(subject, subject, { x: 0, y: 1, z: 0 }, 1.5));

    // --- fade curve ---
    t.ok('fade clamps at 0', stepFade(0, false, 1) === 0);
    t.ok('fade clamps at 1', stepFade(1, true, 1) === 1);
    // ~130 ms fades fully down; ~160 ms restores fully.
    t.ok('reaches full fade in ~130ms', stepFade(0, true, 0.13) >= 0.999);
    t.ok('restores fully in ~160ms', stepFade(1, false, 0.16) <= 0.001);
    // Opacity stays inside the audit's 20–35% band at full fade.
    const opFull = opacityFor(1);
    t.ok('faded opacity within 20–35%', opFull >= 0.2 && opFull <= 0.35, `op=${opFull}`);
    t.ok('clear opacity is 1', opacityFor(0) === 1);
    // Depth writing stops once substantially faded, on while mostly opaque.
    t.ok('depth write on when clear', depthWriteFor(0) === true);
    t.ok('depth write off when faded', depthWriteFor(1) === false);

    // --- controller integration ---
    const ctrl = new OcclusionController();
    const mat = { opacity: 1, transparent: false, depthWrite: true };
    const occ = fakeMesh({ x: 0, y: 5, z: 3 }, mat);
    ctrl.register(occ, { radius: 1.5 });
    ctrl.setCamera(cam);

    // Subject behind the occluder: fade in over ~0.2s.
    ctrl.setSubjects([subject]);
    for (let i = 0; i < 20; i++) ctrl.update(1 / 60);
    t.ok('registered occluder fades toward the band',
        mat.opacity >= 0.2 && mat.opacity <= 0.35, `op=${mat.opacity}`);
    t.ok('faded occluder turns transparent', mat.transparent === true);
    t.ok('faded occluder stops writing depth', mat.depthWrite === false);

    // Line of sight clears (subject steps aside): restore over ~0.2s.
    ctrl.setSubjects([{ x: 10, y: 1, z: 0 }]);
    for (let i = 0; i < 20; i++) ctrl.update(1 / 60);
    t.ok('cleared occluder restores opacity', Math.abs(mat.opacity - 1) < 1e-6,
        `op=${mat.opacity}`);
    t.ok('cleared occluder restores depth write', mat.depthWrite === true);
    t.ok('cleared occluder restores transparency flag', mat.transparent === false);

    // clear() restores exactly and forgets everything.
    ctrl.setSubjects([subject]);
    ctrl.update(0.05); // nudge into a partial fade
    ctrl.clear();
    t.ok('clear() restores original opacity', mat.opacity === 1);
    t.ok('clear() restores original depthWrite', mat.depthWrite === true);
    ctrl.update(1); // nothing registered → no-op, must not throw or touch mat
    t.ok('cleared controller no longer touches the material', mat.opacity === 1);

    // --- scan only registers tagged meshes ---
    // Tall-column bounding sphere so the sightline radius path is exercised too.
    const column = () => ({ computeBoundingSphere() {}, boundingSphere: { radius: 3 } });
    const tagged = fakeMesh({ x: 0, y: 5, z: 3 }, { opacity: 1, transparent: false, depthWrite: true });
    tagged.userData = { occluder: true };
    tagged.geometry = column();
    const plain = fakeMesh({ x: 0, y: 5, z: 3 }, { opacity: 1, transparent: false, depthWrite: true });
    plain.userData = {};
    plain.geometry = column();
    const pickup = fakeMesh({ x: 0, y: 5, z: 3 }, { opacity: 1, transparent: false, depthWrite: true });
    // no userData at all
    const root = {
        traverse(cb) { cb(tagged); cb(plain); cb(pickup); },
    };
    const ctrl2 = new OcclusionController();
    ctrl2.scan(root);
    ctrl2.setCamera(cam);
    ctrl2.setSubjects([subject]);
    for (let i = 0; i < 20; i++) ctrl2.update(1 / 60);
    t.ok('scan fades the tagged occluder', tagged.material.opacity < 0.9);
    t.ok('scan ignores an untagged mesh', plain.material.opacity === 1);
    t.ok('scan ignores a mesh with no userData', pickup.material.opacity === 1);
}
