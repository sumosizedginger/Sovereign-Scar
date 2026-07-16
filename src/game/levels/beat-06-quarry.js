import * as THREE from 'three';
import { createLevelShell, ABYSS_COLORS, CRUST_COLORS } from './_common.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { buildBoulder, stampMap } from '../assets/props.js';
import { fillBox } from '../../voxel/helpers.js';
import { abyssTint } from '../world/level-builder.js';
import { ObsidianArachnid, attachBoss } from '../bosses/index.js';

export function loadBeat06(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-06-quarry',
        name: '06 Bleeding Quarry',
        half: 12,
        mood: 'abyss',
        floorColor: ABYSS_COLORS.abyssFloor,
        wallColor: ABYSS_COLORS.abyssWall,
        banner: 'Obsidian Arachnid armored — strike mid-leap. Shatter ore.',
        stamp(map) {
            abyssTint(map);
            fillBox(map, 4, 8, 1, 3, -2, 2, ABYSS_COLORS.basalt);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'The quarry bleeds gold. Something larger molts in the dark.' },
        { speaker: 'SYSTEM', text: 'Armor fails only during leaps. Time your swings.' },
    ];

    for (const [ox, oz] of [[-4, -3], [0, -5], [3, 3], [-2, 4]]) {
        const m = buildBoulder(0, 0, 0, 2, CRUST_COLORS.slate);
        const dest = new DestructibleVoxelMesh(
            m,
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
            ctx.particles,
            ctx.collisionWorld,
            `quarry-${ox}-${oz}`,
            { origin: { x: ox, y: 0.5, z: oz }, scene: ctx.scene, voxelSize: 0.45 }
        );
        level.destructibles.push(dest);
        level.addSystem({ update() {}, dispose: () => dest.dispose() });
    }

    const wallMap = new Map();
    fillBox(wallMap, 0, 4, 0, 3, 0, 1, ABYSS_COLORS.basalt);
    for (let y = 0; y <= 3; y++) wallMap.set(`2,${y},0`, ABYSS_COLORS.goldVein);
    const wall = new DestructibleVoxelMesh(
        wallMap,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15 }),
        ctx.particles,
        ctx.collisionWorld,
        'quarry-wall',
        { origin: { x: 5, y: 0.5, z: -1 }, scene: ctx.scene, voxelSize: 0.5 }
    );
    level.destructibles.push(wall);
    level.addSystem({ update() {}, dispose: () => wall.dispose() });

    level.addPickup({ x: -6, y: 1, z: 6 }, {
        color: 0xc9a227,
        label: 'Heavy Mallet',
        onPickup(game) {
            game.player.inventory.grantItem('heavy_mallet');
            game.hud.toast('Heavy Mallet — shatter ore veins');
        },
    });

    level.addEnemy({ x: 2, y: 1, z: 5 }, { kind: 'scarab', hp: 4, ai: 'charge' });

    const spider = new ObsidianArachnid(ctx.scene, { x: 0, y: 1, z: -3 });
    attachBoss(level, spider, {
        nextBeat: 'beat-07-sluice',
        toast: 'Arachnid crushed — Sluice of Tears opens',
    });

    return level;
}
