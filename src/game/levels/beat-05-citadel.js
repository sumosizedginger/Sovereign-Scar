import { createLevelShell, CRUST_COLORS } from './_common.js';
import { fillBox } from '../../voxel/helpers.js';
import { triggerPhaseShift } from '../fx/phase-shift.js';
import { buildKintsugiPillar, stampMap } from '../assets/props.js';
import { ProxyBoss, attachBoss } from '../bosses/index.js';

export function loadBeat05(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-05-citadel',
        name: '05 Citadel of the Proxy',
        half: 12,
        mood: 'crust',
        banner: 'Face the Proxy. Three keys open the Wedge.',
        stamp(map) {
            fillBox(map, -2, 2, 1, 6, -2, 2, CRUST_COLORS.iron);
            fillBox(map, -1, 1, 7, 8, -1, 1, CRUST_COLORS.goldLeaf);
            stampMap(map, buildKintsugiPillar(-7, -7, 6), 0, 1, 0);
            stampMap(map, buildKintsugiPillar(7, -7, 6), 0, 1, 0);
            stampMap(map, buildKintsugiPillar(-7, 7, 6), 0, 1, 0);
            stampMap(map, buildKintsugiPillar(7, 7, 6), 0, 1, 0);
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PROXY', text: 'You climb with borrowed keys. I am the seal between crust and wound.' },
        { speaker: 'PREDECESSOR', text: 'Strike the true body. Clones only delay the fold.' },
    ];

    level.addEnemy({ x: -5, y: 1, z: 4 }, { kind: 'sentinel', hp: 4 });
    level.addEnemy({ x: 5, y: 1, z: 4 }, { kind: 'sentinel', hp: 4, ai: 'charge' });

    const proxy = new ProxyBoss(ctx.scene, { x: 0, y: 1.5, z: -3 });
    attachBoss(level, proxy, {
        nextBeat: 'beat-06-quarry',
        toast: 'Proxy defeated — the Abyss opens',
        onDefeat(game) {
            if (!game.player.inventory.hasItem('tectonic_wedge')) {
                game.player.inventory.grantItem('tectonic_wedge');
            }
            triggerPhaseShift(game.mood, 'abyss', 1.5);
            game.hud.toast('Phase shift — welcome to the Wound');
        },
    });

    let shifted = false;
    level.addPickup({ x: 0, y: 1.5, z: 6 }, {
        color: 0xffd060,
        label: 'Tectonic Wedge',
        baseY: 1.5,
        onPickup(game) {
            if (!game.player.inventory.hasAllMemoryKeys) {
                game.hud.toast('The monolith rejects you — need 3 memory keys');
                this.taken = false;
                this.mesh.visible = true;
                return;
            }
            game.player.inventory.grantItem('tectonic_wedge');
            game.hud.toast('Tectonic Wedge claimed — phase shift!');
            if (!shifted) {
                shifted = true;
                triggerPhaseShift(game.mood, 'abyss', 1.5);
            }
        },
    });

    return level;
}
