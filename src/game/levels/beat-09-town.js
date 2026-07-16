import * as THREE from 'three';
import { createLevelShell, ABYSS_COLORS } from './_common.js';
import { fillBox } from '../../voxel/helpers.js';
import { FrustumWallSystem } from '../world/frustum-walls.js';
import { PhantasmBoss, attachBoss } from '../bosses/index.js';

export function loadBeat09(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-09-town',
        name: '09 Ruined Town',
        half: 12,
        mood: 'abyss',
        floorColor: ABYSS_COLORS.abyssFloor,
        wallColor: ABYSS_COLORS.abyssWall,
        banner: 'Phantasm dematerializes. Strike only when solid.',
        stamp(map) {
            fillBox(map, -8, -6, 1, 3, -4, 4, ABYSS_COLORS.basalt);
            fillBox(map, 6, 8, 1, 3, -4, 4, ABYSS_COLORS.basalt);
            fillBox(map, -3, 3, 1, 2, -8, -6, ABYSS_COLORS.charcoal || 0x1a1a22);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PHANTASM', text: 'I wear your facing. I wear your fear.' },
        { speaker: 'PREDECESSOR', text: 'Wait for opacity. Echo strikes punish hesitation — keep moving.' },
    ];

    // Frustum-gated wall slabs (binary on/off per D2)
    const frustum = new FrustumWallSystem([], ctx.collisionWorld, ctx.camera);
    for (const [x, z] of [[-4, 0], [4, 0], [0, -5]]) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 3, 0.4),
            new THREE.MeshStandardMaterial({
                color: ABYSS_COLORS.violet,
                emissive: ABYSS_COLORS.violetHot,
                emissiveIntensity: 0.6,
                transparent: true,
                opacity: 0.85,
            })
        );
        mesh.position.set(x, 1.5, z);
        ctx.scene.add(mesh);
        frustum.addWall(mesh, {
            minX: x - 0.7, maxX: x + 0.7,
            minZ: z - 0.3, maxZ: z + 0.3,
        }, `frustum-${x}-${z}`);
    }
    level.addSystem({
        update(dt) { frustum.update(dt); },
        dispose: () => frustum.dispose(),
    });

    level.addEnemy({ x: 8, y: 1, z: 8 }, { kind: 'sentinel', hp: 3 });

    const phantasm = new PhantasmBoss(ctx.scene, { x: 0, y: 1.5, z: -4 });
    attachBoss(level, phantasm, {
        nextBeat: 'beat-10-cryo',
        toast: 'Phantasm unwritten — Cryo Vault freezes',
    });

    return level;
}
