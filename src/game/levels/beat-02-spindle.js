import { createLevelShell, CRUST_COLORS } from './_common.js';
import { GearSystem } from '../world/gear-system.js';
import { TriCompiler, attachBoss } from '../bosses/index.js';
import { fillBox } from '../../voxel/helpers.js';

export function loadBeat02(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-02-spindle',
        name: '02 Eastern Spindle',
        half: 12,
        mood: 'crust',
        banner: 'Light Caster + gears. Destroy all Tri-Compiler cores.',
        stamp(map) {
            fillBox(map, -8, -6, 1, 3, -2, 2, CRUST_COLORS.iron);
            fillBox(map, 6, 8, 1, 3, -2, 2, CRUST_COLORS.iron);
            fillBox(map, -2, 2, 1, 2, -10, -8, CRUST_COLORS.slate);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Three compilers seal the spindle. Sever every core.' },
        { speaker: 'SYSTEM', text: 'Caution: linked beams activate when the construct is wounded.' },
    ];

    const gears = level.addSystem(new GearSystem(ctx.collisionWorld, ctx.scene));
    gears.addGear({ x: -4, z: 0, radius: 2.2, speed: 0.7, id: 'gear-a' });
    gears.addGear({ x: 4, z: 0, radius: 2.6, speed: -0.5, id: 'gear-b' });

    level.addPickup({ x: 0, y: 1, z: 4 }, {
        color: 0xfff0a0,
        label: 'Light Caster',
        onPickup(game) {
            game.player.inventory.grantItem('light_caster');
            game.hud.toast('Acquired: Light Caster (ray weapon)');
        },
    });

    level.addEnemy({ x: 6, y: 1, z: 4 }, { kind: 'sentinel', hp: 3 });

    const boss = new TriCompiler(ctx.scene, [
        { x: -5, z: -6 },
        { x: 0, z: -7 },
        { x: 5, z: -6 },
    ], { hpPerCore: 4, color: CRUST_COLORS.slate, emissive: 0x40c0ff });

    attachBoss(level, boss, {
        nextBeat: 'beat-03-sink',
        toast: 'Tri-Compiler offline — Memory Key ready',
        onDefeat(game) {
            game.player.inventory.grantMemoryKey('spindle');
            game.hud.toast('Memory Key — Spindle');
        },
    });

    level.addPickup({ x: 0, y: 1, z: -4 }, {
        color: 0x7fe0ff,
        label: 'Memory Key: Spindle',
        onPickup(game) {
            game.player.inventory.grantMemoryKey('spindle');
            game.hud.toast('Memory Key — Spindle');
        },
    });

    return level;
}
