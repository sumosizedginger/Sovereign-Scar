import * as THREE from 'three';
import { createLevelShell, ABYSS_COLORS } from './_common.js';
import { DestructibleVoxelMesh } from '../world/destructible-voxel-mesh.js';
import { buildIceCrystal, stampMap } from '../assets/props.js';
import { fillBox } from '../../voxel/helpers.js';
import { FrostAndFuel, attachBoss } from '../bosses/index.js';

export function loadBeat10(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-10-cryo',
        name: '10 Cryo Vault',
        half: 12,
        mood: 'abyss',
        friction: 'ice',
        floorColor: ABYSS_COLORS.iceDark,
        wallColor: 0x2a4058,
        banner: 'Frost & Fuel twins. Ice slows, fuel burns. Mallet melts walls.',
        stamp(map) {
            stampMap(map, buildIceCrystal(-5, -3), 0, 1, 0);
            stampMap(map, buildIceCrystal(5, 2), 0, 1, 0);
            stampMap(map, buildIceCrystal(0, -6), 0, 1, 0);
            fillBox(map, -2, 2, 1, 2, 5, 7, ABYSS_COLORS.ice);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Two hearts share one cage: freeze and feed.' },
        { speaker: 'SYSTEM', text: 'Watch the bright head — that mode dictates the next blast.' },
    ];

    const ice = new Map();
    fillBox(ice, 0, 5, 0, 3, 0, 2, ABYSS_COLORS.ice);
    const melt = new DestructibleVoxelMesh(
        ice,
        new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.3, metalness: 0.2,
            transparent: true, opacity: 0.85,
        }),
        ctx.particles,
        ctx.collisionWorld,
        'cryo-ice',
        { origin: { x: -2, y: 0.5, z: -2 }, scene: ctx.scene, voxelSize: 0.5 }
    );
    level.destructibles.push(melt);
    level.addSystem({ update() {}, dispose: () => melt.dispose() });

    level.addPickup({ x: 0, y: 1, z: 8 }, {
        color: 0xc9a227,
        label: 'Heavy Mallet',
        onPickup(game) {
            game.player.inventory.grantItem('heavy_mallet');
            game.hud.toast('Mallet melts ice clusters');
        },
    });

    level.addEnemy({ x: -6, y: 1, z: 0 }, { kind: 'frost', hp: 4, speed: 3.0, ai: 'ranged' });

    const twin = new FrostAndFuel(ctx.scene, { x: 0, y: 1.6, z: -3 });
    attachBoss(level, twin, {
        nextBeat: 'beat-11-mire',
        toast: 'Twins extinguished — Rot Mire breathes',
    });

    return level;
}
