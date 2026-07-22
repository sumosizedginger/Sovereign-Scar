// Beat 01 — The Crypt Breach (Hyrule Castle Escape).
// Phase W gate: the first real multi-room dungeon, built on the room graph.
// Bible §Beat 01: awaken in a dark stone tomb → debris-corridor collision
// tutorial → predecessor chamber (the salvage objective) → Crypt Warden,
// who holds the Anchor Link (S-extra: you start bare-handed).
//
// Layout (6 rooms):            [warden]        boss door (boss key)
//                              [antechamber]
//              [secret] —open— [predecessor]   ← altar, story; secret has boss key
//                              [corridor]      small key in first east gap; locked N
//                              [tomb]          start; S exit → overworld

import { createDungeon } from '../world/room-graph.js';
import { addKeyPickup } from '../world/keys.js';
import { CRUST_COLORS } from '../assets/palettes.js';
import { buildScatteredPredecessor, buildDeadConsole, stampMap } from '../assets/props.js';
import { sfx } from '../../audio/synth.js';
import { CryptWarden, attachBoss } from '../bosses/index.js';
import { addAltar } from '../world/altar.js';

export const BEAT01_DEF = {
    id: 'beat-01-crypt',
    name: '01 Crypt Breach',
    mood: 'crust',
    start: 'tomb',
    prebake: true, // 6 small rooms bake in milliseconds; boss exists at load
    banner: 'Escape the Crypt. Salvage the Anchor Link from the Warden.',
    // Z6 — this dungeon's one idea, and the four rooms that carry it:
    // introduce it safely, complicate it, fuse it with combat, then examine it.
    theme: {
        id: 'telegraph',
        name: 'Read the Wind-Up',
        hint: "Everything here tells you before it hits. Watch the ring — hold RMB to guard, tap it to parry.",
        teach: 'corridor',
        develop: 'predecessor',
        combine: 'antechamber',
        test: 'warden',
    },
    keys: [
        { room: 'corridor', type: 'small' },
        { room: 'secret', type: 'boss' },
    ],
    onExit(game) {
        game.loadLevel?.('overworld');
    },
    rooms: {
        tomb: {
            grid: [0, 0],
            half: 7,
            wallH: 4,
            spawn: { x: 0, z: 3 },
            build(map, h) {
                // The awakening slab + a flared console (bible: the event)
                h.fillBox(map, -1, 1, 1, 1, 2, 4, CRUST_COLORS.slateDark);
                stampMap(map, buildDeadConsole(4, -3), 0, 1, 0);
                // Gold-leaf seams on the north wall, matching the predecessor
                // chamber and the Warden's arena. Fiction aside, this room sat
                // ~0.2 above the crust luminance floor, which made the
                // certification gate flake under software GL — pale accent
                // geometry is the documented remedy, because lighting changes
                // would fight the mood preset instead.
                h.fillBox(map, -5, -5, 1, 3, -7, -7, CRUST_COLORS.goldLeaf);
                h.fillBox(map, 5, 5, 1, 3, -7, -7, CRUST_COLORS.goldLeaf);
                h.fillBox(map, -2, 2, 1, 1, -6, -6, CRUST_COLORS.goldLeaf);
            },
            doors: [
                { to: 'corridor', side: 'N', at: 0, type: 'open' },
                { to: '_world', side: 'S', at: 0, type: 'exit' },
            ],
        },
        corridor: {
            grid: [0, -1],
            half: 10,
            wallH: 4,
            spawn: { x: 0, z: 8 },
            build(map, h) {
                // Debris corridor: a snaking passage — the swept-AABB tutorial.
                // Walls force S→N slaloming; the small key sits in the first
                // east gap so it is found before the locked north door.
                h.fillBox(map, -10, 4, 1, 3, 5, 6, CRUST_COLORS.slate);      // wall, gap E
                h.fillBox(map, -4, 10, 1, 3, 0, 1, CRUST_COLORS.slate);      // wall, gap W
                h.fillBox(map, -10, 4, 1, 3, -5, -4, CRUST_COLORS.slate);    // wall, gap E
                h.fillBox(map, -2, -1, 1, 2, 3, 3, CRUST_COLORS.rust);       // debris
                h.fillBox(map, 2, 3, 1, 1, -2, -2, CRUST_COLORS.rust);
            },
            enemies: [
                { x: 6, z: 3, kind: 'sentinel', hp: 2 },
            ],
            doors: [
                { to: 'tomb', side: 'S', at: 0, type: 'open' },
                { to: 'predecessor', side: 'N', at: 0, type: 'locked' },
            ],
            onBake(level, origin) {
                // Clear floor in the first east gap (south of the locked door).
                addKeyPickup(level, 'beat-01-crypt', 'corridor-key',
                    { x: origin.x + 8, y: 1.2, z: origin.z + 3.5 }, 'small');
            },
        },
        predecessor: {
            grid: [0, -2],
            half: 9,
            wallH: 4,
            spawn: { x: 0, z: 0 },
            build(map, h) {
                stampMap(map, buildScatteredPredecessor(1, 2), 0, 1, 0);
                stampMap(map, buildDeadConsole(-4, -5), 0, 1, 0);
                h.fillBox(map, -2, -2, 1, 4, -8, -8, CRUST_COLORS.goldLeaf);
                h.fillBox(map, 2, 2, 1, 4, -8, -8, CRUST_COLORS.goldLeaf);
                // Rubble half-conceals the western secret door
                h.fillBox(map, -8, -8, 1, 2, -3, -2, CRUST_COLORS.iron);
                h.fillBox(map, -8, -8, 1, 2, 2, 3, CRUST_COLORS.iron);
            },
            enemies: [
                { x: 4, z: -3, kind: 'scarab', hp: 2, ai: 'charge' },
            ],
            doors: [
                { to: 'corridor', side: 'S', at: 0, type: 'locked' },
                { to: 'antechamber', side: 'N', at: 0, type: 'open' },
                { to: 'secret', side: 'W', at: 0, type: 'open' },
            ],
            onBake(level, origin, ctx) {
                addAltar(level, ctx, { x: origin.x + 6, z: origin.z + 6 });
                // Z7: the campaign's first Scar Suture, tucked behind the dead
                // console in the very first dungeon. A player who never learns
                // in Beat 01 that looking around pays will not start looking in
                // Beat 09 — the exploration loop has to be baited early.
                level.addPickup({ x: origin.x - 7, y: 1.2, z: origin.z - 7 }, {
                    color: 0xff7a90,
                    label: 'Scar Suture',
                    reward: { type: 'suture' },
                    onPickup(game) {
                        if (game.collectSuture?.('b01-console')) {
                            game.hud?.toast?.('Scar Suture recovered. Four will bind a heart.', 2800);
                        }
                    },
                });
            },
            onEnter(game) {
                if (!this._storyShown) {
                    this._storyShown = true;
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'My limbs are scattered. The Warden took the Link.' },
                        { speaker: 'SYSTEM', text: 'Objective updated: recover the Anchor Link.' },
                    ]);
                }
            },
        },
        secret: {
            grid: [-1, -2],
            half: 5,
            wallH: 4,
            spawn: { x: 0, z: 0 },
            // Pedestal is climbable platform geometry (no XZ solids). Putting it
            // in build() made an infinite wall and the boss key was uncollectable.
            platforms(map, h) {
                h.fillBox(map, -1, 1, 1, 1, -1, 1, CRUST_COLORS.goldLeaf);
            },
            doors: [{ to: 'predecessor', side: 'E', at: 0, type: 'open' }],
            onBake(level, origin) {
                // Sit ON the pedestal (its top is y=2), not inside it — at y=1.4
                // the key was embedded in the gold block and invisible.
                addKeyPickup(level, 'beat-01-crypt', 'secret-boss-key',
                    { x: origin.x, y: 2.4, z: origin.z }, 'boss');
                level.addPickup({ x: origin.x - 2, y: 1.2, z: origin.z - 2 }, {
                    color: 0xd4a84b,
                    label: 'Predecessor\u2019s record',
                    reward: { type: 'lore' },
                    onPickup(game) {
                        if (!game.player.inventory.getFlag('lore:crypt-record')) {
                            game.player.inventory.setFlag('lore:crypt-record', true);
                            game.hud?.story?.queue?.([
                                { speaker: 'PREDECESSOR', text: "I left this where I fell, not where I meant to. Everything after here is the same mistake at a larger scale." },
                            ]);
                        }
                    },
                });
            },
            onEnter(game) {
                game?.hud?.toast?.('A hidden vault — the Warden\'s seal glimmers here', 2200);
            },
        },
        antechamber: {
            grid: [0, -3],
            half: 8,
            wallH: 4,
            spawn: { x: 0, z: 6 },
            build(map, h) {
                h.fillBox(map, -5, -4, 1, 2, -2, 0, CRUST_COLORS.slateDark);
                h.fillBox(map, 4, 5, 1, 2, -2, 0, CRUST_COLORS.slateDark);
            },
            enemies: [
                { x: -3, z: -4, kind: 'sentinel', hp: 2 },
                { x: 3, z: -4, kind: 'scarab', hp: 2, ai: 'charge' },
            ],
            doors: [
                { to: 'predecessor', side: 'S', at: 0, type: 'open' },
                { to: 'warden', side: 'N', at: 0, type: 'boss' },
            ],
        },
        warden: {
            grid: [0, -4],
            half: 10,
            wallH: 5,
            spawn: { x: 0, z: 8 },
            build(map, h) {
                h.fillBox(map, -2, -2, 1, 4, -9, -9, CRUST_COLORS.goldLeaf);
                h.fillBox(map, 2, 2, 1, 4, -9, -9, CRUST_COLORS.goldLeaf);
            },
            doors: [{ to: 'antechamber', side: 'S', at: 0, type: 'boss' }],
            boss(ctx, level, origin) {
                const warden = new CryptWarden(ctx.scene, {
                    x: origin.x, y: 1.2, z: origin.z - 4,
                });
                attachBoss(level, warden, {
                    nextBeat: 'beat-02-spindle',
                    toast: 'Crypt Warden fallen — Eastern Spindle unlocked',
                    defeatStory: [
                        { speaker: 'PREDECESSOR', text: 'The Link hums in your grip. It remembers being held.' },
                        { speaker: 'PREDECESSOR', text: 'Three memory keys open the monolith. The Spindle holds the first.' },
                    ],
                    onDefeat(game) {
                        // grantItem alone only sets a flag for this id (S-extra)
                        game.player.inventory.grantItem?.('anchor_link');
                        game.player.inventory.addWeapon?.('anchor_link');
                        game.hud?.toast?.('Anchor Link salvaged — equipped');
                        sfx.pickup();
                    },
                });
            },
            onEnter(game) {
                // Boss intro fires on entering the arena, not at dungeon load
                const boss = game?.level?.boss;
                if (boss && !boss.defeated && !this._introFired) {
                    this._introFired = true;
                    game.bossIntro = { t: 0.6, boss, fired: false };
                    game.mood?.setMusicProfile?.('boss');
                }
            },
        },
    },
};

export function loadBeat01(ctx) {
    const level = createDungeon(ctx, BEAT01_DEF);
    level.suppressBossIntro = true; // fired by the warden room instead
    level.musicBed = 'crust';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Construct online. The Crypt remembers your name.' },
        { speaker: 'SYSTEM', text: 'Escape route: north. The Warden holds your weapon.' },
    ];
    level.onEnter = (game) => {
        game.hud.toast('Construct online. Objective: the Anchor Link.');
    };
    return level;
}
