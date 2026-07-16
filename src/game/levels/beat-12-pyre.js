import { createLevelShell, ABYSS_COLORS } from './_common.js';
import { LightLineSystem } from '../world/light-line-system.js';
import { buildMagmaVent, stampMap } from '../assets/props.js';
import { fillBox } from '../../voxel/helpers.js';
import { MagmaWyrm, attachBoss } from '../bosses/index.js';

export function loadBeat12(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-12-pyre',
        name: '12 Pyre Peak',
        half: 12,
        mood: 'abyss',
        floorColor: 0x2a1810,
        wallColor: 0x3a2018,
        banner: 'Magma Wyrm trails fire. Vector Staff light lines carve the peak.',
        stamp(map) {
            stampMap(map, buildMagmaVent(-5, -4), 0, 1, 0);
            stampMap(map, buildMagmaVent(5, 3), 0, 1, 0);
            stampMap(map, buildMagmaVent(0, -7), 0, 1, 0);
            fillBox(map, -2, 2, 1, 2, 6, 8, ABYSS_COLORS.basalt);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'A dragon of ore and spite. Its body is a river of heat.' },
        { speaker: 'SYSTEM', text: 'Do not stand in fire trails. Aim for the head of the chain.' },
    ];

    const lines = new LightLineSystem(ctx.scene, ctx.collisionWorld);
    let patched = false;
    let originalTryAttack = null;

    function restoreAttack(game) {
        if (patched && game?.player && originalTryAttack) {
            game.player.tryAttack = originalTryAttack;
            patched = false;
            originalTryAttack = null;
        }
    }

    level.addSystem({
        update(dt) { lines.update(dt); },
        dispose() {
            restoreAttack(ctx._gameRef);
            lines.dispose();
        },
    });
    level.lightLines = lines;

    level.onEnter = (game) => {
        ctx._gameRef = game;
        game.player.inventory.grantItem('light_caster');
        restoreAttack(game);
        originalTryAttack = game.player.tryAttack.bind(game.player);
        game.player.tryAttack = (enemies, destructibles) => {
            const hits = originalTryAttack(enemies, destructibles);
            if (game.player.inventory.activeWeapon === 'light_caster' && lines) {
                try {
                    lines.fire(game.player.root.position, game.player.state.facingVec, {
                        range: 10, life: 1.8, color: 0xffa040,
                    });
                } catch (_) {}
            }
            return hits;
        };
        patched = true;
        const prevDispose = level.dispose.bind(level);
        level.dispose = () => {
            restoreAttack(game);
            prevDispose();
        };
    };

    level.addPickup({ x: 0, y: 1, z: 7 }, {
        color: 0xffa040,
        label: 'Vector Staff',
        onPickup(game) {
            game.player.inventory.grantItem('vector_staff');
            game.player.inventory.grantItem('light_caster');
            game.hud.toast('Vector Staff — light lines on cast');
        },
    });

    level.addEnemy({ x: -4, y: 1, z: 0 }, { kind: 'sentinel', hp: 4 });
    level.addEnemy({ x: 4, y: 1, z: -3 }, { kind: 'frost', hp: 4, ai: 'ranged' });

    const wyrm = new MagmaWyrm(ctx.scene, { x: 0, y: 1.3, z: -4 });
    attachBoss(level, wyrm, {
        nextBeat: 'beat-13-gumoi',
        toast: 'Wyrm ash settles — GUMOI Tower beckons',
    });

    return level;
}
