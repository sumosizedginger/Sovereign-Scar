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

/**
 * Fresnel rim on actor materials only (graphics overhaul ticket 6).
 * Scene-wide rim lights lift walls as readily as characters; a per-fragment
 * edge term guarantees silhouette separation regardless of the floor colour.
 *
 * IMPORTANT: do NOT put faction colour on material.emissive. That washes the
 * whole body (bloom wraps every actor in a ghost shell). Rim is edge-only,
 * tinted via a shader uniform so eyes stay the only intentional glow.
 */
function makeActorMaterial(rimHex) {
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        emissive: 0x000000,
        emissiveIntensity: 0,
    });
    const rimColor = new THREE.Color(rimHex != null ? rimHex : 0xc8d0e0);
    mat.userData.rimColor = rimColor;
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uActorRim = { value: rimColor };
        shader.fragmentShader = shader.fragmentShader
            .replace(
                'void main() {',
                /* glsl */`uniform vec3 uActorRim;
void main() {`
            )
            .replace(
                '#include <emissivemap_fragment>',
                /* glsl */`#include <emissivemap_fragment>
{
    // View-space fresnel — thin faction-tinted edge only (not full-body wash).
    // vViewPosition is -mvPosition; normalize() is the view direction.
    float _ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    float _rim = pow(1.0 - _ndv, 3.2) * 0.28;
    totalEmissiveRadiance += uActorRim * _rim;
}`
            );
    };
    mat.customProgramCacheKey = () => 'ss-actor-rim-v2';
    return mat;
}

/**
 * `scale` is a per-axis vector, not a scalar.
 *
 * The proportions are applied to the LEAF meshes and their offsets, never to a
 * parent group. That distinction is the whole reason this works: the animator
 * rotates the pivot groups above these meshes, and a rotation inside a
 * non-uniformly scaled parent shears its children — a swinging arm would come
 * out as a skewed parallelepiped. Scaling the leaf instead leaves every
 * rotation rigid, because the scale is applied before the pivot's rotation.
 */
function partMesh(map, scale, offset, rimHex) {
    const mesh = new THREE.Mesh(
        buildVoxelGeo(map),
        makeActorMaterial(rimHex)
    );
    mesh.scale.set(scale.x, scale.y, scale.z);
    mesh.position.set(offset[0] * scale.x, offset[1] * scale.y, offset[2] * scale.z);
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
 * @param {{x:number,y:number,z:number}} [opts.bodyScale]  per-axis proportion
 *   on top of meshScale. This is how kinds get DIFFERENT SILHOUETTES rather
 *   than different colours: torsoProfileScale was the only proportion knob and
 *   it was measured to move depth only — a rig's WIDTH is its arm span, so
 *   every enemy in the game came out 0.98 wide no matter what was passed.
 * @param {string} [opts.clothingMode='casual']
 * @param {number} [opts.groundOffset=0]  extra downward shift (player uses -0.95)
 */
export function createActorRig(opts = {}) {
    const pal = opts.palette;
    const base = S * (opts.meshScale ?? 0.33);
    const bs = opts.bodyScale || {};
    const scale = {
        x: base * (bs.x ?? 1),
        y: base * (bs.y ?? 1),
        z: base * (bs.z ?? 1),
    };
    const slim = scaleProfile(TORSO_PROFILE, opts.torsoProfileScale ?? 0.65);
    const slimHead = scaleProfile(HEAD_PROFILE, opts.headProfileScale ?? 0.85);
    const clothing = { clothingMode: opts.clothingMode || 'casual' };

    // Faction eyeGlow tints the edge rim only (ticket 6) — never the body fill.
    const rim = pal?.eyeGlow || pal?.emissive || 0xc8d0e0;
    const torsoMesh = partMesh(buildTorso(pal, slim, clothing), scale, [0, 0, 0], rim);
    const headMesh = partMesh(buildHead(pal, slimHead, {}), scale, [0, 24, 0], rim);
    const armRMesh = partMesh(buildArm(pal, 1), scale, [12, 15, 0], rim);
    const armLMesh = partMesh(buildArm(pal, -1), scale, [-12, 15, 0], rim);
    const legRMesh = partMesh(buildLeg(pal, 1), scale, [5, 0, 0], rim);
    const legLMesh = partMesh(buildLeg(pal, -1), scale, [-5, 0, 0], rim);

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
            eye.scale.set(scale.x, scale.y, scale.z);
            eye.position.set(
                sideX * 2.5 * scale.x,
                (6 + 24) * scale.y - neckY,
                5.5 * scale.z
            );
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
        // The XZ half-extent of the assembled body, measured off the same box
        // the grounding uses. Combat reads this: `Enemy` derives hitRadius from
        // it so a hitbox can never disagree with the body you can see. Half of
        // the LARGER axis, because the hitbox is a circle and it has to contain
        // the silhouette from every bearing — under-covering the wide axis is
        // how you get a swing that visibly connects and does nothing.
        radius: Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) / 2,
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
