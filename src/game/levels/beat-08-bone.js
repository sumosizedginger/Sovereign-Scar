import { createLevelShell, ABYSS_COLORS } from './_common.js';
import { fillBox } from '../../voxel/helpers.js';
import { buildBoneArch, stampMap, buildBoulder } from '../assets/props.js';
import * as THREE from 'three';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { SkeletalMantis, attachBoss } from '../bosses/index.js';

export function loadBeat08(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-08-bone',
        name: '08 Bone Forest',
        half: 13,
        mood: 'abyss',
        floorColor: 0x1a1810,
        wallColor: ABYSS_COLORS.abyssWall,
        spawn: { x: 0, y: 1.2, z: 10 },
        banner: 'Skeletal Mantis scythes the grove. Stay behind its arcs.',
        stamp(map) {
            stampMap(map, buildBoneArch(0, 0, 5, 6), 0, 1, 0);
            stampMap(map, buildBoneArch(-6, 4, 3, 4), 0, 1, 0);
            stampMap(map, buildBoneArch(6, -4, 3, 5), 0, 1, 0);
            fillBox(map, -4, 4, 4, 4, -8, -4, ABYSS_COLORS.bone);
            fillBox(map, -2, 2, 5, 5, -10, -8, ABYSS_COLORS.bone);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Ribs of a dead god form this canopy. Something still prays with blades.' },
        { speaker: 'SYSTEM', text: 'Sidestep scythe telegraphs. Upper decks are safer for ranged.' },
    ];

    const cage = buildBoulder(0, 0, 0, 2, ABYSS_COLORS.bone);
    const dest = new DestructibleVoxelMesh(
        cage,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
        ctx.particles,
        ctx.collisionWorld,
        'bone-cage',
        { origin: { x: 0, y: 4.5, z: -6 }, scene: ctx.scene, voxelSize: 0.4 }
    );
    level.destructibles.push(dest);
    level.addSystem({ update() {}, dispose: () => dest.dispose() });

    level.addEnemy({ x: -4, y: 1, z: 2 }, { kind: 'sentinel', hp: 4 });
    level.addEnemy({ x: 4, y: 5.2, z: -6 }, { kind: 'scarab', hp: 3, ai: 'charge' });

    const mantis = new SkeletalMantis(ctx.scene, { x: 0, y: 1.3, z: -3 });
    attachBoss(level, mantis, {
        nextBeat: 'beat-09-town',
        toast: 'Mantis broken — Ruined Town stirs',
    });

    return level;
}
