import { createLevelShell, CRUST_COLORS } from './_common.js';
import { fillBox } from '../../voxel/helpers.js';
import { KineticCore, attachBoss } from '../bosses/index.js';

export function loadBeat04(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-04-sky',
        name: '04 Sky Monument',
        half: 11,
        mood: 'crust',
        banner: 'Kinetic Core ricochets the platform. Dodge, then strike.',
        stamp(map) {
            // Raised arena plate
            fillBox(map, -6, 6, 1, 1, -6, 6, CRUST_COLORS.slate);
            fillBox(map, -7, -7, 1, 3, -7, 7, CRUST_COLORS.iron);
            fillBox(map, 7, 7, 1, 3, -7, 7, CRUST_COLORS.iron);
        },
        spawn: { x: 0, y: 2.2, z: 5 },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'The Monument still spins a war-sphere from the old siege.' },
        { speaker: 'SYSTEM', text: 'Phase 3 splits the core. Clear the shards.' },
    ];

    level.addEnemy({ x: -4, y: 2, z: 3 }, { kind: 'frost', hp: 3, ai: 'ranged' });

    const core = new KineticCore(ctx.scene, ctx.collisionWorld, { x: 0, z: -2 }, {
        arenaRadius: 5.5,
        hp: 12,
    });
    core.root.position.y = 2.2;

    attachBoss(level, core, {
        nextBeat: 'beat-05-citadel',
        toast: 'Kinetic Core shattered — Citadel awaits',
        onDefeat(game) {
            game.player.inventory.grantMemoryKey('sky');
        },
    });

    level.addPickup({ x: 0, y: 2, z: 6 }, {
        color: 0x7fe0ff,
        label: 'Memory Key: Sky',
        onPickup(game) {
            game.player.inventory.grantMemoryKey('sky');
            game.hud.toast('Memory Key — Sky');
        },
    });

    return level;
}
