import { createLevelShell, CRUST_COLORS } from './_common.js';
import { fillBox } from '../../voxel/helpers.js';
import { SandSpur, attachBoss } from '../bosses/index.js';

export function loadBeat03(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-03-sink',
        name: '03 Duval Sink',
        half: 12,
        mood: 'crust',
        friction: 'sand',
        floorColor: CRUST_COLORS.clay || 0xb89a72,
        wallColor: CRUST_COLORS.clayDark || 0x8a7050,
        banner: 'Sand Spur burrows beneath the dunes. Strike the head when it surfaces.',
        stamp(map) {
            fillBox(map, -3, 3, 1, 1, -8, -5, CRUST_COLORS.slate);
            fillBox(map, -8, -5, 1, 2, 2, 5, CRUST_COLORS.iron);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'The Sink remembers every footfall. The Spur hunts vibration.' },
        { speaker: 'SYSTEM', text: 'When it submerges, it cannot be harmed. Wait for the breach.' },
    ];

    level.addPickup({ x: 5, y: 1.2, z: 5 }, {
        color: 0xc9a227,
        label: 'Phase Boot',
        onPickup(game) {
            game.player.inventory.grantItem('phase_boot');
            game.hud.toast('Phase Boot — improved dash');
        },
    });

    level.addEnemy({ x: -6, y: 1, z: 4 }, { kind: 'scarab', hp: 3, ai: 'charge' });

    const spur = new SandSpur(ctx.scene, ctx.collisionWorld, ctx.particles, [
        { x: -5, z: -4 }, { x: 5, z: -4 }, { x: 5, z: 4 }, { x: -5, z: 4 },
    ], { hp: 14, segments: 6 });

    attachBoss(level, spur, {
        nextBeat: 'beat-04-sky',
        toast: 'Sand Spur broken — Sky Monument unlocks',
        onDefeat(game) {
            game.player.inventory.grantMemoryKey('sink');
        },
    });

    level.addPickup({ x: 0, y: 1, z: -3 }, {
        color: 0x7fe0ff,
        label: 'Memory Key: Sink',
        onPickup(game) {
            game.player.inventory.grantMemoryKey('sink');
            game.hud.toast('Memory Key — Sink');
        },
    });

    return level;
}
