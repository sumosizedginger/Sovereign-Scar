import { createLevelShell, ABYSS_COLORS, CRUST_COLORS } from './_common.js';
import { fillBox } from '../../voxel/helpers.js';
import { GumoiWitness, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export function loadBeat13(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-13-gumoi',
        name: '13 GUMOI Tower',
        half: 10,
        mood: 'abyss',
        floorColor: ABYSS_COLORS.charcoal,
        wallColor: ABYSS_COLORS.violet,
        spawn: { x: 0, y: 1.2, z: 7 },
        flicker: 0.7,
        banner: 'GUMOI Witness crowns the tower. Reality stutters with its phase.',
        stamp(map) {
            fillBox(map, -3, 3, 1, 1, 3, 6, CRUST_COLORS.slate);
            fillBox(map, -6, -2, 3, 3, -2, 2, CRUST_COLORS.slate);
            fillBox(map, 2, 6, 5, 5, -4, 0, CRUST_COLORS.slate);
            fillBox(map, -2, 2, 7, 7, -7, -3, ABYSS_COLORS.violet);
            fillBox(map, -1, 1, 9, 9, -2, 2, ABYSS_COLORS.goldVein);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'GUMOI', text: 'I am the index of every wrong turn you took.' },
        { speaker: 'PREDECESSOR', text: 'Climb. When flicker spikes, dash. The Witness falls to persistence.' },
    ];

    // C3: Act III Reconstitution Altar — last stop before the Leviathan
    addAltar(level, ctx, { x: -5, z: 7 });

    level.addEnemy({ x: 0, y: 1.5, z: 4 }, { kind: 'sentinel', hp: 3 });
    level.addEnemy({ x: -4, y: 3.5, z: 0 }, { kind: 'scarab', hp: 4, ai: 'charge' });
    level.addEnemy({ x: 4, y: 5.5, z: -2 }, { kind: 'frost', hp: 4, ai: 'ranged' });

    const witness = new GumoiWitness(ctx.scene, { x: 0, y: 9.5, z: 0 });
    attachBoss(level, witness, {
        nextBeat: 'beat-14-leviathan',
        toast: 'Witness erased — Leviathan Core stirs',
        onDefeat(game) {
            game.player.inventory.setFlag('gumoi_sigil', true);
            game.hud.toast('GUMOI Sigil — the Core awakens');
        },
    });

    level.addPickup({ x: 0, y: 10, z: 0 }, {
        color: 0xc084fc,
        label: 'GUMOI Sigil',
        baseY: 10,
        onPickup(game) {
            game.player.inventory.setFlag('gumoi_sigil', true);
            game.hud.toast('GUMOI Sigil — the Core stirs');
        },
    });

    return level;
}
