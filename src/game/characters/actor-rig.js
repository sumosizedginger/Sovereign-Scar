// ActorRig (Ticket F): assemble the existing frozen voxel part builders into
// a NAMED-PIVOT hierarchy so limbs can move. Pivots are plain THREE.Groups —
// no bone libraries, no GLTF, no new dependencies.
//
//   root                      — world transform; physics/hitboxes own this.
//     inner                   — grounding shift (feet on the floor), as before
//       body                  — bob (position.y) + stride/rest lean (rotation)
//         legL, legR          — hip pivots (top of each leg mesh)
//         torso               — waist pivot (top of the legs)
//           torsoMesh
//           head              — neck pivot (bottom of the head mesh)
//           armL, armR        — shoulder pivots (top of each arm mesh)
//
// Pivot positions are derived from each part's measured bounding box, so the
// assembled rig is byte-identical in appearance to the old single-group
// build while every joint gains a meaningful rotation origin. The animator
// (actor-animator.js) writes ONLY local rotations/positions on these pivots;
// it never touches root, so hitboxes and physics stay aligned by design.

import * as THREE from 'three';
import {
    buildTorso, buildHead, buildArm, buildLeg, buildGlowEyes,
    scaleProfile, TORSO_PROFILE, HEAD_PROFILE,
} from '../../characters/builders.js';
import { buildVoxelGeo } from '../../voxel/core.js';
import { S } from '../../voxel/palette.js';

function partMesh(map, scale, offset) {
    const mesh = new THREE.Mesh(
        buildVoxelGeo(map),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
    );
    mesh.scale.setScalar(scale);
    mesh.position.set(offset[0] * scale, offset[1] * scale, offset[2] * scale);
    mesh.castShadow = true;
    // Receiving matters as much as casting and costs almost nothing on top of
    // it — the shadow map is already being rendered for the casters, so this is
    // a fragment-shader tap. Without it a character is lit identically standing
    // in a doorway's shadow and standing in open light, which is most of why
    // actors read as pasted on top of the world rather than standing in it.
    mesh.receiveShadow = true;
    mesh.geometry.computeBoundingBox();
    return mesh;
}

/** Local-space top/bottom of a part mesh (scale + offset applied). */
function meshTopY(mesh) {
    return mesh.geometry.boundingBox.max.y * mesh.scale.y + mesh.position.y;
}
function meshBottomY(mesh) {
    return mesh.geometry.boundingBox.min.y * mesh.scale.y + mesh.position.y;
}

/** Wrap a mesh in a pivot group placed at `pivot`, preserving world pose. */
function pivotize(mesh, pivotX, pivotY, pivotZ) {
    const g = new THREE.Group();
    g.position.set(pivotX, pivotY, pivotZ);
    mesh.position.x -= pivotX;
    mesh.position.y -= pivotY;
    mesh.position.z -= pivotZ;
    g.add(mesh);
    return g;
}

/**
 * @param {object} opts
 * @param {object} opts.palette      builder palette (HERO_PALETTE / ENEMY_PALETTES[kind])
 * @param {number} [opts.torsoProfileScale=0.65]
 * @param {number} [opts.headProfileScale=0.85]
 * @param {number} [opts.meshScale=0.33]  multiplied by voxel S
 * @param {string} [opts.clothingMode='casual']
 * @param {number} [opts.groundOffset=0]  extra downward shift (player uses -0.95)
 */
export function createActorRig(opts = {}) {
    const pal = opts.palette;
    const scale = S * (opts.meshScale ?? 0.33);
    const slim = scaleProfile(TORSO_PROFILE, opts.torsoProfileScale ?? 0.65);
    const slimHead = scaleProfile(HEAD_PROFILE, opts.headProfileScale ?? 0.85);
    const clothing = { clothingMode: opts.clothingMode || 'casual' };

    const torsoMesh = partMesh(buildTorso(pal, slim, clothing), scale, [0, 0, 0]);
    const headMesh = partMesh(buildHead(pal, slimHead, {}), scale, [0, 24, 0]);
    const armRMesh = partMesh(buildArm(pal, 1), scale, [12, 15, 0]);
    const armLMesh = partMesh(buildArm(pal, -1), scale, [-12, 15, 0]);
    const legRMesh = partMesh(buildLeg(pal, 1), scale, [5, 0, 0]);
    const legLMesh = partMesh(buildLeg(pal, -1), scale, [-5, 0, 0]);

    // Joint sockets measured off the actual part geometry.
    const hipY = Math.max(meshTopY(legRMesh), meshTopY(legLMesh));
    const neckY = meshBottomY(headMesh);
    const shoulderY = Math.max(meshTopY(armRMesh), meshTopY(armLMesh));

    // Hands sit at the FAR end of each arm. Measured, like every other socket
    // here — a weapon hung off the shoulder pivot instead swings on a radius
    // twice as long as the arm and reads as growing out of the collarbone.
    const handY = Math.min(meshBottomY(armRMesh), meshBottomY(armLMesh)) - shoulderY;

    const legR = pivotize(legRMesh, legRMesh.position.x, hipY, legRMesh.position.z);
    const legL = pivotize(legLMesh, legLMesh.position.x, hipY, legLMesh.position.z);
    const armR = pivotize(armRMesh, armRMesh.position.x, shoulderY, armRMesh.position.z);
    const armL = pivotize(armLMesh, armLMesh.position.x, shoulderY, armLMesh.position.z);
    const head = pivotize(headMesh, 0, neckY, 0);

    // Empty groups, so they cost nothing on rigs that never hold anything.
    const hand = new THREE.Group();
    hand.position.set(0, handY, 0);
    armR.add(hand);
    const handL = new THREE.Group();
    handL.position.set(0, handY, 0);
    armL.add(handL);

    // Glow eyes ride the head pivot so look poses carry them.
    let eyes = null;
    try {
        eyes = buildGlowEyes(pal);
        for (const [eye, sideX] of [[eyes.left, -1], [eyes.right, 1]]) {
            eye.scale.setScalar(scale);
            eye.position.set(sideX * 2.5 * scale, (6 + 24) * scale - neckY, 5.5 * scale);
            head.add(eye);
        }
    } catch (_) { /* optional */ }

    // Waist pivot: torso mesh + head + arms bend together above the hips.
    const torso = new THREE.Group();
    torso.position.set(0, hipY, 0);
    torsoMesh.position.y -= hipY;
    head.position.y -= hipY;
    armR.position.y -= hipY;
    armL.position.y -= hipY;
    torso.add(torsoMesh, head, armR, armL);

    const body = new THREE.Group();
    body.add(torso, legR, legL);

    // Named pivots: QA scripts and tests identify joints by name.
    body.name = 'body';
    torso.name = 'torso';
    head.name = 'head';
    armL.name = 'armL';
    armR.name = 'armR';
    legL.name = 'legL';
    legR.name = 'legR';
    hand.name = 'hand';
    handL.name = 'handL';

    const inner = new THREE.Group();
    inner.add(body);

    // Ground exactly like the old builds: local minY sits at groundOffset.
    const bbox = new THREE.Box3().setFromObject(inner);
    inner.position.y = (opts.groundOffset ?? 0) - bbox.min.y;

    const root = new THREE.Group();
    root.add(inner);

    return {
        root,
        inner,
        body,
        torso,
        torsoMesh,
        head,
        armL,
        armR,
        hand,
        handL,
        legL,
        legR,
        eyes,
        height: bbox.max.y - bbox.min.y,
        setFacingYaw(y) { root.rotation.y = y; },
        dispose() {
            if (root.parent) root.parent.remove(root);
            root.traverse((o) => {
                if (o.isMesh) {
                    o.geometry?.dispose?.();
                    o.material?.dispose?.();
                }
            });
        },
    };
}
