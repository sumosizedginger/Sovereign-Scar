import { createLevelShell, CRUST_COLORS } from './_common.js';
import { buildScatteredPredecessor, buildDeadConsole } from '../assets/props.js';
import { stampMap } from '../assets/props.js';

export function loadSandboxCombat(ctx) {
    const level = createLevelShell(ctx, {
        id: 'sandbox-combat',
        name: 'Combat Sandbox',
        half: 14,
        mood: 'crust',
        banner: 'Sandbox — practice melee, dash, mood toggle (M).',
        stamp(map) {
            stampMap(map, buildScatteredPredecessor(4, -2), 0, 1, 0);
            stampMap(map, buildDeadConsole(-5, 3), 0, 1, 0);
        },
    });

    level.addEnemy({ x: -5, y: 1, z: -4 }, { kind: 'sentinel', hp: 4 });
    level.addEnemy({ x: 0, y: 1, z: -6 }, { kind: 'scarab', hp: 3 });
    level.addEnemy({ x: 5, y: 1, z: -4 }, { kind: 'frost', hp: 5 });
    level.addDummy({ x: 3, y: 1.2, z: 2 }, { hp: 2, color: 0x6688aa });
    level.addDummy({ x: -3, y: 1.2, z: 2 }, { hp: 2, color: 0xaa6688 });

    level.addPickup({ x: 6, y: 1, z: 6 }, {
        color: 0xffd060,
        label: 'Phase Boot',
        onPickup(game) {
            game.player.inventory.grantItem('phase_boot');
            game.hud.toast('Acquired: Phase Boot (Shift dash)');
        },
    });
    level.addPickup({ x: -6, y: 1, z: 6 }, {
        color: 0xc9a227,
        label: 'Heavy Mallet',
        onPickup(game) {
            game.player.inventory.grantItem('heavy_mallet');
            game.hud.toast('Acquired: Heavy Mallet');
        },
    });

    return level;
}
