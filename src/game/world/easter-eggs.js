// @ts-check
// Two things on the overworld that are not systems.
//
// A relic (see `relics.js`) is a repeatable shape: eight regions, eight set
// pieces, one skin each. These two are not that. They are one-offs, and each
// exists because a specific joke only works once.
//
// ── THE DRY WELL ───────────────────────────────────────────────────────────
//
// A fairy well that does not heal you. The owner picked this out of four
// variants and the reason it is the right one is that it is native to this
// world rather than pasted onto it: the premise of the whole game is a wound
// that will not close, so a healing spring that declines belongs here.
//
// THE RISK, AND WHY THE BASIN IS VISIBLY DRY.
//
// A trap that takes your currency with no counterplay reads as a bug, not a
// joke. A player who loses ten shards to an unexplained hole does not laugh;
// they file an issue. `docs/EASTER-EGGS.md` states the fix, and it is not to
// soften the joke — it is to make the transaction informed:
//
//   - The basin is EMPTY before you pay. No water, no glow, no shimmer, dust on
//     the bottom and a rope with nothing on the end of it. The player can see
//     exactly what they are buying.
//   - The prompt states the cost and promises nothing. The WELL promises. The
//     UI does not, and the UI is the part the player is entitled to trust.
//   - It cannot take shards you do not have. It declines, with contempt, which
//     is funnier than the alternative anyway.
//   - It pays out on the third throw. Not because the joke needed softening but
//     because a player who commits to a bit that hard has earned something, and
//     because a well that takes forever is a slot machine, which is a different
//     and much worse joke.
//
// Done that way it is not a trap. It is a joke the player agreed to.
//
// ── THE MINER ──────────────────────────────────────────────────────────────
//
// The owner asked for Steve from Minecraft. The reasoning for what shipped
// instead is recorded in `docs/EASTER-EGGS.md` and belongs here too, because
// this file is where somebody would come to change it back:
//
// A direct Steve is the only reference in the set that names another PRODUCT
// rather than a GENRE. A dragon skeleton is folklore; a fairy well is Zelda as
// vocabulary; Steve is somebody's IP with a face. And this game's voice is more
// serious than Steve survives — `settlements.js` argues at length that the dead
// of Beat 09 must never turn around, because the moment one does it is a jump
// scare instead of a place.
//
// So: a blocky figure in a blue shirt and purple trousers, at the bottom of a
// hand-dug shaft, holding a stone pick, facing the wall. He does not turn
// around. He cannot be interacted with. He is clearly not from here. Everyone
// gets it in half a second, nobody has to defend it, and it is funnier deadpan.
//
// He is on `r6c6` — the far south-east corner, the most remote screen on the
// map — because a joke you find is worth more than a joke you are sent to.

import * as THREE from 'three';
import { makeFigure } from './settlements.js';
import { heroSkin } from '../characters/hero-skins.js';
import { grantOutfit } from '../kernel/wardrobe.js';
import { CRUST_COLORS } from '../assets/palettes.js';

/** What one throw costs. */
export const WELL_COST = 10;

/** Throws before it gives in. */
export const WELL_PAYOUT_AT = 3;

/** The skin it eventually coughs up. */
export const WELL_SKIN = 'drowned';

/** How close you must be to read the prompt. */
export const WELL_REACH = 2.4;

/** Inventory flag counting throws. A number, so it round-trips as one. */
export const WELL_THROWS_FLAG = 'egg:well:throws';

/** Screens these two live on. */
export const WELL_SCREEN = 'r2c1';
export const MINER_SCREEN = 'r6c6';

/** Offsets from the screen centre, inside the protected disc. */
export const WELL_AT = { x: -1.5, z: 1.0 };
export const MINER_AT = { x: 2.0, z: -1.0 };

/**
 * What the well says, by how many times you have paid it.
 *
 * Index 0 is the first throw. The last entry repeats forever, which is the
 * point — it has stopped being a transaction and become a fact about the world.
 */
export const WELL_LINES = [
    [
        { speaker: 'THE WELL', text: 'Generous. Truly.' },
        { speaker: 'THE WELL', text: '...' },
    ],
    [
        { speaker: 'THE WELL', text: 'Again. You are very hopeful, for someone this far from anything.' },
    ],
    [
        { speaker: 'THE WELL', text: 'Fine. FINE. Take it and stop looking at me.' },
    ],
    [
        { speaker: 'THE WELL', text: 'There is nothing else down here. There never was.' },
    ],
];

/** What it says to someone who cannot pay. It takes nothing. */
export const WELL_BROKE = [
    { speaker: 'THE WELL', text: 'You have nothing to give. I had noticed.' },
];

/** Steve-adjacent. Cyan shirt, violet trousers, and no explanation. */
export const MINER_PALETTE = {
    skin: 0xb98c62, skinDark: 0x8a6544, skinD2: 0x5c4229,
    hair: 0x36241a, hairDark: 0x1c120c, hairLight: 0x4e3626,
    beard: 0x36241a, beardDark: 0x1c120c,
    freck: 0xa07a54,
    shirt: 0x35a3a0, shirtDark: 0x24726f,
    jeans: 0x4a3fa0, jeansDark: 0x2f2870,
    belt: 0x3a3a44, beltDark: 0x22222a,
    eyeWhite: 0xf0ebe4, pupil: 0x101018, brow: 0x36241a,
    mouth: 0x5c2030, teeth: 0xe8e0d0,
    // Warm and dim, like a civilian's — this is not a threat and the player
    // must be able to answer that question before they are in range.
    eyeGlow: 0xffd9a0,
};

function stoneMat(color, rough = 0.95) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
}

function slab(group, w, h, d, x, y, z, color, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat(color, opts.rough));
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = opts.cast !== false;
    m.receiveShadow = opts.receive !== false;
    group.add(m);
    return m;
}

/**
 * The well, built to look empty.
 *
 * Every decision here is in service of the player being able to SEE that it is
 * dry before they pay: the bottom is dust-coloured rather than dark (a dark
 * hole reads as depth, and depth reads as water you cannot see), there is no
 * emissive anywhere in it, and the rope ends in nothing.
 *
 * From a camera at 70.7 degrees a low ring on the ground is just a circle, so
 * the posts and the crossbeam are what make it read as a WELL rather than as a
 * fire pit — they are the only vertical it has. There is no roof, deliberately:
 * a roof at this pitch would hide the one thing worth showing.
 */
/**
 * The well, built to look empty AND to be findable.
 *
 * THE FIRST VERSION COULD NOT BE SEEN. Shot from 2.4 units away — inside its own
 * interact radius — it was not visible in the frame at all, and from directly
 * overhead it read as a small bench. Three causes, all of them mine:
 *
 *   IT WAS THE COLOUR OF THE GROUND. Slate rim on clay floor at the same value,
 *   so the ring had no edge. The rim is now the DARK slate with a pale coping
 *   on top of it, which puts a value break on the one shape that says "well".
 *
 *   IT HAD NO HOLE. I made the basin floor dust-coloured and shallow so that
 *   nobody could mistake it for water — and overshot, because a basin with no
 *   depth is a paving slab. Depth is not the thing that reads as water; blue
 *   is, and shimmer is, and a glow is. So the rim is taller, the floor sits
 *   lower, and what you look down into is a dry hole with rubble in it.
 *
 *   ITS ONLY VERTICAL WAS GREY. The posts were the same dark stone as the rim.
 *   They are timber now, so the frame reads against both the rim and the
 *   ground, and there is a winding barrel on the beam. The rope still ends in
 *   nothing.
 *
 * What has NOT changed is the promise: no emissive anywhere, no blue, nothing
 * in the basin but dust and fallen stones. The player must be able to see it is
 * dry before they pay, and `relics.spec.mjs` holds that.
 */
export function buildDryWell() {
    const g = new THREE.Group();
    const STONE = CRUST_COLORS.slate;
    const STONE_DARK = CRUST_COLORS.slateDark;
    const DUST = CRUST_COLORS.clayDark;
    const TIMBER = 0x6b5334;
    const TIMBER_DARK = 0x483a22;

    const R = 1.5, H = 0.95, T = 0.32;
    slab(g, R * 2, H, T, 0, H / 2, -R + T / 2, STONE_DARK);
    slab(g, R * 2, H, T, 0, H / 2, R - T / 2, STONE_DARK);
    slab(g, T, H, R * 2 - T * 2, -R + T / 2, H / 2, 0, STONE_DARK);
    slab(g, T, H, R * 2 - T * 2, R - T / 2, H / 2, 0, STONE_DARK);
    slab(g, R * 2 + 0.16, 0.13, T + 0.16, 0, H + 0.06, -R + T / 2, STONE);
    slab(g, R * 2 + 0.16, 0.13, T + 0.16, 0, H + 0.06, R - T / 2, STONE);
    slab(g, T + 0.16, 0.13, R * 2 - T * 2, -R + T / 2, H + 0.06, 0, STONE);
    slab(g, T + 0.16, 0.13, R * 2 - T * 2, R - T / 2, H + 0.06, 0, STONE);

    slab(g, R * 2 - T * 2, 0.12, R * 2 - T * 2, 0, 0.16, 0, DUST, { cast: false });
    for (const [sx, sz, ss] of [[-0.45, 0.3, 0.24], [0.4, -0.3, 0.18], [0.12, 0.5, 0.15]]) {
        slab(g, ss, ss * 0.55, ss, sx, 0.26, sz, STONE_DARK, { receive: false });
    }

    slab(g, 0.16, 2.3, 0.16, -R + 0.08, 1.15, 0, TIMBER);
    slab(g, 0.16, 2.3, 0.16, R - 0.08, 1.15, 0, TIMBER);
    slab(g, R * 2 + 0.3, 0.18, 0.18, 0, 2.35, 0, TIMBER);
    const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.26, 0.26),
        stoneMat(TIMBER_DARK, 0.9)
    );
    barrel.position.set(0, 2.06, 0);
    barrel.castShadow = true;
    g.add(barrel);
    const rope = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.15, 0.06),
        stoneMat(0x6b5c44, 0.98)
    );
    rope.position.set(0, 1.42, 0);
    rope.castShadow = true;
    g.add(rope);

    return g;
}

/** The shaft the miner is standing in: a stone collar, open at the top. */
export function buildMineShaft() {
    const g = new THREE.Group();
    const ROCK = CRUST_COLORS.slateDark;
    const ROCK_LIT = CRUST_COLORS.slate;
    const W = 1.05, H = 1.55, T = 0.26;
    slab(g, W * 2, H, T, 0, H / 2, -W + T / 2, ROCK_LIT);
    slab(g, W * 2, H, T, 0, H / 2, W - T / 2, ROCK);
    slab(g, T, H, W * 2 - T * 2, -W + T / 2, H / 2, 0, ROCK);
    slab(g, T, H, W * 2 - T * 2, W - T / 2, H / 2, 0, ROCK);
    // Spoil heap — the rock he has already taken out, piled beside the hole.
    // A shaft with no spoil is a hole that dug itself.
    for (const [sx, sz, ss, sy] of [
        [1.5, 0.6, 0.5, 0.2], [1.75, 0.15, 0.36, 0.16],
        [1.35, -0.5, 0.42, 0.18], [1.9, 0.85, 0.3, 0.13],
    ]) slab(g, ss, sy, ss, sx, sy / 2, sz, ROCK_LIT);
    return g;
}

/** The pick. One box for the haft, one crossed for the head. */
function buildPick() {
    const g = new THREE.Group();
    const haft = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.85, 0.07),
        stoneMat(0x6b5334, 0.9)
    );
    haft.castShadow = true;
    g.add(haft);
    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.11, 0.11),
        stoneMat(0x8f8a80, 0.85)
    );
    head.position.y = 0.42;
    head.castShadow = true;
    g.add(head);
    return g;
}

/**
 * Place the dry well and wire its interact.
 *
 * @param {object} level  needs `addSystem`
 * @param {object} ctx    needs `scene`
 * @param {{x:number,z:number}} origin  the screen's world origin
 */
export function addDryWell(level, ctx, origin) {
    const group = buildDryWell();
    group.name = 'egg:well';
    const x = origin.x + WELL_AT.x;
    const z = origin.z + WELL_AT.z;
    group.position.set(x, 1, z);
    ctx.scene?.add(group);

    let promptCooldown = 0;
    level.addSystem({
        update(dt, game) {
            promptCooldown -= dt;
            const p = game.player?.root?.position;
            if (!p) return;
            if (Math.hypot(p.x - x, p.z - z) > WELL_REACH) return;

            const inv = game.player.inventory;
            const thrown = Number(inv?.flags?.[WELL_THROWS_FLAG] || 0);
            const broke = (inv?.scarShards || 0) < WELL_COST;

            if (promptCooldown <= 0) {
                promptCooldown = 2.6;
                // The prompt states the cost and nothing else. Every promise in
                // this encounter is made by the well, in its own voice, in the
                // story panel — never by the interface.
                game.hud?.toast?.(
                    broke ? `A dry well. ${WELL_COST} shards to throw — you have ${inv?.scarShards || 0}.`
                        : `E — throw ${WELL_COST} shards into the dry well`,
                    1900,
                );
            }
            if (!game.input?.consumeInteract?.()) return;

            if (broke) {
                game.hud?.story?.queue?.(WELL_BROKE);
                return;
            }
            // Past the payout it stops charging. A joke that keeps billing you
            // after the punchline is a slot machine.
            if (thrown >= WELL_PAYOUT_AT) {
                game.hud?.story?.queue?.(WELL_LINES[WELL_LINES.length - 1]);
                return;
            }

            inv.spendShards(WELL_COST);
            const n = thrown + 1;
            inv.setFlag(WELL_THROWS_FLAG, n);
            let dressed = false;
            if (n >= WELL_PAYOUT_AT) {
                dressed = grantOutfit(inv, WELL_SKIN);
                if (dressed) game.player.applySavedSkin?.();
            }
            game.persistInventory?.();
            game.hud?.story?.queue?.(WELL_LINES[Math.min(n - 1, WELL_LINES.length - 1)]);
            if (dressed) game.hud?.toast?.(`New look — ${heroSkin(WELL_SKIN).name}`, 3200);
            else game.hud?.toast?.('Nothing happens.', 1700);
        },
        dispose() {
            if (group.parent) group.parent.remove(group);
            group.traverse((o) => {
                if (o.isMesh) {
                    o.geometry?.dispose?.();
                    o.material?.dispose?.();
                }
            });
        },
    });
    return group;
}

/**
 * Place the miner. No system, no interact, no update — he is furniture.
 *
 * `frozen: true` means the animator poses him once and is never ticked again,
 * which is the same treatment the dead of Beat 09 get and for the same reason:
 * the breath cycle is exactly what would make him look like he is about to turn
 * around.
 */
export function addMiner(ctx, origin) {
    const x = origin.x + MINER_AT.x;
    const z = origin.z + MINER_AT.z;
    const shaft = buildMineShaft();
    shaft.name = 'egg:miner';
    shaft.position.set(x, 1, z);
    ctx.scene?.add(shaft);

    // Sunk 0.75 into his own hole, so the collar cuts him at the waist and the
    // camera — which looks almost straight down — sees a man in a hole rather
    // than a man behind a wall.
    const fig = makeFigure(ctx.scene, {
        x, z, y: 0.25,
        // Facing north: away from the lens, into the far wall of his shaft.
        facing: Math.PI,
        palette: MINER_PALETTE,
        frozen: true,
    });

    const pick = buildPick();
    pick.position.set(0.34, -0.15, 0.22);
    pick.rotation.set(-0.5, 0, 0.35);
    // Hung off the hand socket the rig already exposes, so it sits in his fist
    // rather than near it.
    const hand = fig.actor?.hand;
    if (hand) hand.add(pick);
    else fig.root.add(pick);

    return { shaft, figure: fig };
}
