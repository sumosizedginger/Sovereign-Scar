import { createLevelShell, CRUST_COLORS } from './_common.js';
import { fillBox } from '../../voxel/helpers.js';
import { buildScatteredPredecessor, buildDeadConsole, stampMap } from '../assets/props.js';
import { sfx } from '../../audio/synth.js';
import { CryptWarden, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export function loadBeat01(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-01-crypt',
        name: '01 Crypt Breach',
        half: 10,
        wallH: 4,
        mood: 'crust',
        spawn: { x: 0, y: 1.2, z: 7 },
        banner: 'Defeat the Crypt Warden. Salvage the Anchor Link.',
        stamp(map) {
            fillBox(map, -2, -1, 1, 2, -2, 4, CRUST_COLORS.slateDark);
            fillBox(map, 2, 3, 1, 2, -4, 2, CRUST_COLORS.slate);
            fillBox(map, -4, -3, 1, 3, 0, 1, CRUST_COLORS.iron);
            stampMap(map, buildScatteredPredecessor(1, 3), 0, 1, 0);
            stampMap(map, buildDeadConsole(-3, -5), 0, 1, 0);
            fillBox(map, -2, -2, 1, 4, -9, -9, CRUST_COLORS.goldLeaf);
            fillBox(map, 2, 2, 1, 4, -9, -9, CRUST_COLORS.goldLeaf);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Construct online. The Crypt remembers your name.' },
        { speaker: 'SYSTEM', text: 'Primary threat: Crypt Warden. Approach the gate north.' },
    ];

    level.addEnemy({ x: -3, y: 1, z: -1 }, { kind: 'sentinel', hp: 2 });
    level.addEnemy({ x: 3, y: 1, z: 2 }, { kind: 'scarab', hp: 2, ai: 'charge' });

    // C3: Act I Reconstitution Altar, beside the spawn
    addAltar(level, ctx, { x: 5, z: 7 });

    const warden = new CryptWarden(ctx.scene, { x: 0, y: 1.2, z: -5 });
    attachBoss(level, warden, {
        nextBeat: 'beat-02-spindle',
        toast: 'Crypt Warden fallen — Eastern Spindle unlocked',
        onDefeat(game) {
            // grantItem alone only sets a flag for this id — add the weapon
            game.player.inventory.grantItem?.('anchor_link');
            game.player.inventory.addWeapon?.('anchor_link');
            game.hud?.toast?.('Anchor Link salvaged — equipped');
            sfx.pickup();
        },
    });

    level.onEnter = (game) => {
        game.hud.toast('Construct online. Objective: the Anchor Link.');
    };

    // Exit still works after boss
    level._exit = { x: 0, z: -8.5, r: 1.8 };
    const baseUpdate = level.update;
    level.update = (dt, game) => {
        baseUpdate(dt, game);
        const p = game.player.root.position;
        if (level._bossCleared && Math.hypot(p.x - level._exit.x, p.z - level._exit.z) < level._exit.r) {
            if (!level._cleared) {
                level._cleared = true;
                game.hud.toast('Crypt Breach cleared — ] for next beat');
                game.unlockAndSave?.('beat-02-spindle');
            }
        }
    };

    return level;
}
