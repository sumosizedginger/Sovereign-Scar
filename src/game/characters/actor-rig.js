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
function makeActorMaterial(rimHex, strength = 0.28) {
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        emissive: 0x000000,
        emissiveIntensity: 0,
    });
    const rimColor = new THREE.Color(rimHex != null ? rimHex : 0xc8d0e0);
    mat.userData.rimColor = rimColor;
    mat.userData.rimStrength = strength;
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uActorRim = { value: rimColor };
        shader.uniforms.uActorRimK = { value: strength };
        shader.fragmentShader = shader.fragmentShader
            .replace(
                'void main() {',
                /* glsl */`uniform vec3 uActorRim;
uniform float uActorRimK;
void main() {`
            )
            .replace(
                '#include <emissivemap_fragment>',
                /* glsl */`#include <emissivemap_fragment>
{
    // ── Separation light, and why it is shaped like this ──────────────────
    //
    // The old term was a pure view fresnel: pow(1 - n·v, 3.2) * 0.28. That is
    // the textbook rim, and this game's camera defeats it. At a 56 degree pitch
    // the camera looks almost straight down the normals of the head, shoulders
    // and upper arms — which is most of the character's visible AREA — so
    // 1 - n·v is near zero across nearly all of it, and the exponent of 3.2
    // crushes what little is left into a hairline one pixel wide. Measured:
    // body-vs-floor separation of ΔL* 1.9 in the Pyre and 0.3 in the Leviathan
    // core. The rim was doing nothing in exactly the rooms that needed it.
    //
    // Two changes, both about making the lit band WIDE rather than bright:
    //
    //   exponent 3.2 → 1.5   the falloff now reaches the sloped shoulder and
    //                        upper-arm faces, not just the true silhouette. At
    //                        thirty pixels tall a one-pixel band is invisible
    //                        no matter how bright; a six-pixel one is a shape.
    //
    //   + a fixed key        a constant VIEW-space direction, upper-left and
    //                        toward the viewer. It is deliberately not the
    //                        room's light: the room is what the character has
    //                        to separate FROM, so a term that tracks it cannot
    //                        separate anything. This one is the same in every
    //                        dungeon, which is what makes the character read
    //                        the same in every dungeon.
    //
    // The floor term (the 0.45 below) keeps a base edge everywhere so the side
    // facing away from the key does not vanish; the key adds the shaping that
    // makes it look lit rather than glowing.
    const vec3 SEP_KEY = normalize(vec3(-0.42, 0.72, 0.55));
    vec3  _n    = normalize(normal);
    float _ndv  = clamp(dot(_n, normalize(vViewPosition)), 0.0, 1.0);
    float _edge = pow(1.0 - _ndv, 1.5);
    float _key  = max(dot(_n, SEP_KEY), 0.0);
    totalEmissiveRadiance += uActorRim * (_edge * (0.45 + 0.75 * _key) * uActorRimK);
}`
            );
    };
    // The cache key has to carry the strength, or three.js reuses one compiled
    // program for every actor and the hero's stronger rim silently becomes
    // whatever the first actor compiled asked for.
    mat.customProgramCacheKey = () => `ss-actor-rim-v3-${strength.toFixed(2)}`;
    return mat;
}

/**
 * The outline shell material. ONE instance, shared by every actor in the scene.
 *
 * `toneMapped: false` so it stays the value it was authored at instead of being
 * lifted by ACES along with the rest of the frame — an outline that brightens
 * with the room is an outline that disappears in exactly the rooms that needed
 * it (measured: the Pyre and the Leviathan core, ΔL* 1.9 and 0.3).
 *
 * Not pure black. A dead-black edge on a voxel figure reads as a rendering
 * artefact; this is the darkest tone in the game's own palette range, so it
 * looks drawn rather than punched out.
 */
const OUTLINE_MATERIAL = new THREE.MeshBasicMaterial({
    color: 0x05070d,
    side: THREE.BackSide,
    toneMapped: false,
    fog: true,
});

/**
 * Give one part mesh an inverted-hull outline.
 *
 * WHY AN OUTLINE AND NOT MORE RIM LIGHT
 *
 * The fresnel rim above is not written wrong — it is geometrically defeated by
 * this game's camera. At a 56 degree pitch the camera looks straight down the
 * normals of the head and shoulders, which is most of the character's visible
 * AREA, so `1 - n·v` is near zero across nearly all of it. The rim survives only
 * as a hairline at the true silhouette boundary, and a hairline at 0.28
 * intensity does not register against a floor of similar lightness.
 *
 * An inverted hull attacks the same boundary from the other side: a copy of the
 * geometry, grown by a fixed WORLD distance, drawn back-faces-only. Everywhere
 * the real mesh faces the camera it covers its own shell; at the boundary the
 * shell survives as a band of constant thickness. It does not care about the
 * camera angle, the floor colour, or the light.
 *
 * THICKNESS IS PER-AXIS, AND THAT IS THE WHOLE TRICK
 *
 * The obvious implementation multiplies the mesh scale by a single factor. On a
 * leg — long in Y, thin in X and Z — a factor chosen to give a sane band on the
 * long axis gives almost nothing on the thin ones, so arms and legs come out
 * with no outline while the torso has a fat one. Each axis therefore gets its
 * own factor derived from that axis's real size, which is what makes the band
 * the same width everywhere.
 *
 * @param {THREE.Mesh} mesh   a part mesh, already positioned inside its pivot
 * @param {number} thickness  half-width of the band, in world units
 */
function addOutlineShell(mesh, thickness) {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    bb.getSize(size);
    bb.getCenter(centre);

    const shell = new THREE.Mesh(geo, OUTLINE_MATERIAL);
    const axes = ['x', 'y', 'z'];
    for (const a of axes) {
        const world = Math.abs(size[a] * mesh.scale[a]);
        // A degenerate axis (a flat quad) cannot be grown proportionally; leave
        // it alone rather than scaling by infinity.
        const k = world > 1e-5 ? 1 + (thickness * 2) / world : 1;
        shell.scale[a] = mesh.scale[a] * k;
        shell.position[a] = mesh.position[a] + centre[a] * mesh.scale[a] * (1 - k);
    }
    // The real mesh already casts and receives; a shell that did either would
    // fatten every shadow in the game by the outline width.
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.userData.ssOutline = true;
    return shell;
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
function partMesh(map, scale, offset, rimHex, rimK) {
    const mesh = new THREE.Mesh(
        buildVoxelGeo(map),
        makeActorMaterial(rimHex, rimK)
    );
    // Marks the meshes that make up the BODY, so the outline pass can find them
    // and the glow eyes — which are meshes too — are left alone.
    mesh.userData.ssPart = true;
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
    const rim = opts.rimColor ?? (pal?.eyeGlow || pal?.emissive || 0xc8d0e0);
    // How hard the separation light reads. The hero is turned up because the
    // hero is the one figure the player must never lose, and because a value
    // every actor shares cannot tell you which of four identical silhouettes
    // is you.
    const rimK = opts.rimStrength ?? 0.28;
    const torsoMesh = partMesh(buildTorso(pal, slim, clothing), scale, [0, 0, 0], rim, rimK);
    const headMesh = partMesh(buildHead(pal, slimHead, {}), scale, [0, 24, 0], rim, rimK);
    const armRMesh = partMesh(buildArm(pal, 1), scale, [12, 15, 0], rim, rimK);
    const armLMesh = partMesh(buildArm(pal, -1), scale, [-12, 15, 0], rim, rimK);
    const legRMesh = partMesh(buildLeg(pal, 1), scale, [5, 0, 0], rim, rimK);
    const legLMesh = partMesh(buildLeg(pal, -1), scale, [-5, 0, 0], rim, rimK);

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
    //
    // MEASURED BEFORE THE CLOAK AND THE OUTLINE SHELLS EXIST, deliberately.
    // `radius` below is read by combat to derive enemy hit radii, `height` by
    // the animator, and `bbox.min.y` is what puts the feet on the floor. Both of
    // those additions are RENDERING, and neither may move a hitbox or a
    // standing height: a cloak hanging past the heels would have lifted the hero
    // off the ground by the amount it overhangs, and an outline would have
    // fattened every enemy's hurtbox by its own width — two changes nobody would
    // ever have traced back to a decoration.
    const bbox = new THREE.Box3().setFromObject(inner);
    inner.position.y = (opts.groundOffset ?? 0) - bbox.min.y;

    // ── The hero's cloak ───────────────────────────────────────────────────
    //
    // Priority one in top-down readability is SILHOUETTE, ahead of value and
    // far ahead of colour — and it is the one this game never had. Player and
    // enemies are assembled from the same six part builders, so from directly
    // above every figure in the room is the same rounded blob: pale head,
    // reddish torso, two stubs. Rim light cannot fix that, because it makes the
    // blob easier to SEE without making it a different SHAPE.
    //
    // A cloak is the smallest change that alters the outline itself. From a 56
    // degree camera it reads as a wedge trailing behind the shoulders — a
    // direction indicator and an identity in one, which is exactly why every
    // top-down action game since 1991 has put one on the hero. It swings on the
    // waist pivot, so it leans with the run and settles when you stop.
    //
    // Deliberately opt-in and unused by every enemy palette: an outline that
    // everyone shares identifies nobody.
    if (opts.cloak) {
        const cl = opts.cloak;
        const w = cl.width ?? 0.66;
        const len = cl.length ?? 0.85;
        const th = cl.thickness ?? 0.09;
        const cloakMesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, len, th),
            new THREE.MeshStandardMaterial({
                color: cl.color ?? 0x1d5f7a,
                roughness: 0.72,
                metalness: 0,
            })
        );
        cloakMesh.castShadow = true;
        cloakMesh.receiveShadow = true;
        // Behind the torso's own back face, measured rather than guessed — the
        // torso profile is scaled per actor, so a literal offset would bury the
        // cloak inside a wide body and float it off a narrow one.
        // The torso geometry is NOT centred on its own origin — it runs from
        // z -0.23 to +0.37 — so "behind" has to be read off the box rather than
        // assumed to be a negative offset.
        torsoMesh.geometry.computeBoundingBox();
        const backZ = torsoMesh.geometry.boundingBox.min.z * scale.z + torsoMesh.position.z;
        // Hung FROM the shoulder, not centred near it. At `len * 0.42` the top
        // edge cleared the shoulder by four centimetres, and because the camera
        // looks down at 56 degrees that overhang projected up-screen over the
        // character's own head — so walking toward the camera showed a blue slab
        // across the hero's chest. A cape must never appear from the front.
        cloakMesh.position.set(0, (shoulderY - hipY) - len * 0.5, backZ - th * 0.6);
        // Top pinned to the shoulders, hem swinging away behind. The sign was
        // inverted first time, which tipped the whole panel backwards and made
        // the overhang above worse.
        cloakMesh.rotation.x = 0.2;
        cloakMesh.name = 'cloak';
        torso.add(cloakMesh);
    }

    // ── Inverted-hull outline — BUILT, MEASURED, AND OFF ───────────────────
    //
    // It works, by the numbers. Body-vs-floor separation across five places went
    // from a mean ΔL* of 7.2 to 14.3, the Crypt reached 34.9, and every actor
    // sat cleanly off the floor in a screenshot.
    //
    // It was rejected on sight, and correctly. The player is about thirty pixels
    // tall at this camera. An outline wide enough to register is roughly two of
    // those pixels PER SIDE, which is a quarter of the character's width — so
    // the figure stops being a character with an outline and becomes a black
    // blob with some colour trapped inside it. The owner's words: "it was better
    // before." Numbers up, game worse. That is the whole lesson.
    //
    // Kept, not deleted, because the finding is worth more than the code: a hard
    // outline is the wrong instrument at THIS character size, and would become
    // the right one if the camera ever came closer. `outline: true` turns it on.
    if (opts.outline === true) {
        const width = opts.outlineWidth ?? 0.07;
        const parts = [];
        inner.traverse((o) => { if (o.isMesh && o.userData.ssPart) parts.push(o); });
        for (const m of parts) m.parent.add(addOutlineShell(m, width));
    }

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
