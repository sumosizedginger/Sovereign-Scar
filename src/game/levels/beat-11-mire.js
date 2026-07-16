import { createLevelShell, ABYSS_COLORS } from './_common.js';
import { FluidPlane } from '../world/fluid-plane.js';
import { fillBox } from '../../voxel/helpers.js';
import { SludgeGolem, attachBoss } from '../bosses/index.js';

export function loadBeat11(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-11-mire',
        name: '11 Rot Mire',
        half: 13,
        mood: 'abyss',
        friction: 'sludge',
        floorColor: ABYSS_COLORS.rot,
        wallColor: 0x2a3820,
        banner: 'Sludge Golem drops poison pools. Stay on dry islets.',
        stamp(map) {
            fillBox(map, -3, 3, 1, 1, -3, 3, 0x4a4030);
            fillBox(map, -9, -6, 1, 1, 4, 8, 0x4a4030);
            fillBox(map, 6, 9, 1, 1, -8, -5, 0x4a4030);
            fillBox(map, -1, 1, 1, 1, 6, 9, 0x4a4030);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'The mire was a library once. The golem is what remains of the shelves.' },
        { speaker: 'SYSTEM', text: 'Pools steal footing. Lunge telegraphs mark impact sites.' },
    ];

    const fluid = new FluidPlane(ctx.scene, {
        width: 28, depth: 28, y: 0.35, amp: 0.18,
        wind: { x: 1.5, z: 0.4 },
        color: ABYSS_COLORS.sludge,
    });
    level.addSystem({
        update(dt, game) {
            fluid.update(dt);
            const p = game.player.root.position;
            if (fluid.contains(p.x, p.z) && p.y < 1.5) {
                game.player.setFriction('sludge');
                game.player.physics.setFrictionProfile({
                    groundDrag: 0.35, airDrag: 0.97, windVector: fluid.wind,
                });
            } else {
                game.player.setFriction('default');
            }
        },
        dispose: () => fluid.dispose(),
    });

    level.addEnemy({ x: -7, y: 1.5, z: 6 }, { kind: 'scarab', hp: 4, ai: 'charge' });
    level.addEnemy({ x: 7, y: 1.5, z: -6 }, { kind: 'scarab', hp: 4 });

    const golem = new SludgeGolem(ctx.scene, { x: 0, y: 1.4, z: 0 });
    attachBoss(level, golem, {
        nextBeat: 'beat-12-pyre',
        toast: 'Golem sinks — Pyre Peak ignites',
    });

    return level;
}
