// Overworld screen definitions.
// CRUST_REGION: the real overworld seed (W gate: 4 screens around the Crypt
// Breach entrance; C1 grows it to the full 7×7 dual-state world).
// TEST_SCREENS: the 2×2 grid the world e2e suite drives.

import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';

export const CRUST_REGION = {
    name: 'The Scarred Crust',
    banner: 'The Scarred Crust — the Crypt wound lies north',
    start: 'scarfield',
    screens: {
        // The Crypt Breach entrance stands on a scar-torn field
        scarfield: {
            grid: [10, 10],
            spawn: { x: 0, z: 12 },
            edges: [
                { to: 'ridge', side: 'E', at: 0, width: 12 },
                { to: 'flats', side: 'S', at: -6, width: 10 },
            ],
            entrances: [
                { x: 0, z: -16, to: 'beat-01-crypt', label: 'the Crypt Breach' },
            ],
            build(map, h) {
                // Scar fissure dressing + broken slabs flanking the road north
                h.fillBox(map, -12, -9, 1, 2, -6, -4, CRUST_COLORS.slateDark);
                h.fillBox(map, 8, 11, 1, 1, 2, 5, CRUST_COLORS.slate);
                h.fillBox(map, -4, -3, 1, 3, -10, -9, CRUST_COLORS.iron);
                h.fillBox(map, 3, 4, 1, 3, -10, -9, CRUST_COLORS.iron);
            },
            crust: {
                build(map, h) {
                    h.fillBox(map, -16, -14, 1, 2, 8, 10, CRUST_COLORS.slate);
                },
            },
            abyss: {
                build(map, h) {
                    h.fillBox(map, 14, 16, 1, 2, 8, 10, ABYSS_COLORS.goldVein);
                },
            },
            enemies: [
                { x: 9, z: -8, kind: 'sentinel', hp: 2 },
            ],
        },
        ridge: {
            grid: [11, 10],
            edges: [{ to: 'scarfield', side: 'W', at: 0, width: 12 }],
            monolith: { x: 6, z: -6 },
            build(map, h) {
                h.fillBox(map, -6, 10, 1, 2, 10, 12, CRUST_COLORS.slateDark);
                h.fillBox(map, 12, 16, 1, 3, -14, -10, CRUST_COLORS.slate);
            },
            enemies: [
                { x: -4, z: 4, kind: 'scarab', hp: 2, ai: 'charge' },
            ],
        },
        flats: {
            grid: [10, 11],
            edges: [
                { to: 'scarfield', side: 'N', at: -6, width: 10 },
                { to: 'sink', side: 'E', at: 0, width: 10 },
            ],
            build(map, h) {
                h.fillBox(map, -10, -6, 1, 1, -4, 0, CRUST_COLORS.clay);
                h.fillBox(map, 4, 8, 1, 2, 6, 8, CRUST_COLORS.slate);
            },
            enemies: [
                { x: 0, z: 0, kind: 'sentinel', hp: 2 },
            ],
        },
        sink: {
            grid: [11, 11],
            edges: [{ to: 'flats', side: 'W', at: 0, width: 10 }],
            build(map, h) {
                h.fillBox(map, 10, 14, 1, 2, -12, -8, CRUST_COLORS.rust);
            },
            // THE CENTRE SLAB IS NINE BY NINE AND YOU STAND ON IT, so it fills
            // the middle of the frame — which is exactly what the luminance
            // gate samples. It used to be built in the shared `build` in
            // `CRUST_COLORS.clayDark` (0x9a8b78, ~140/255) in BOTH states, so
            // in the Abyss a crust-clay platform sat under the Abyss light
            // multiplier — the compounding that `OVERWORLD_BASE_TUNE`'s comment
            // warns about — and measured 175 against a ceiling of 130. Ten
            // cells away, on real Abyss ground, the same screen reads 88.
            //
            // It went unseen because the old spawn code shoved the player OFF
            // this slab (its "is cell 1 empty" test read the raised ground as a
            // wall), so the sampler never stood on the bright thing. A green
            // gate is not a good picture; this one was green because the camera
            // was looking somewhere else.
            crust: {
                build(map, h) {
                    h.fillBox(map, -4, 4, 1, 1, -4, 4, CRUST_COLORS.clayDark);
                },
            },
            abyss: {
                build(map, h) {
                    h.fillBox(map, -4, 4, 1, 1, -4, 4, ABYSS_COLORS.basalt);
                },
            },
            blockers: [
                {
                    type: 'grapple_gap', id: 'crust-sink-gap',
                    rect: { x0: -16, x1: -12, z0: 8, z1: 14 },
                    anchor: { x: -19, z: 11 },
                    edge: { x: -10, z: 11 },
                },
            ],
            enemies: [
                { x: 6, z: 6, kind: 'frost', hp: 2, ai: 'ranged' },
            ],
        },
    },
};

export const TEST_SCREENS = {
    name: 'The Scarred Crust (test 2×2)',
    banner: 'Dev: overworld test grid',
    start: 'r0c0',
    screens: {
        r0c0: {
            grid: [2, 2], // clear of the test dungeon's grid cells
            spawn: { x: 0, z: 10 },
            edges: [
                { to: 'r0c1', side: 'E', at: 0, width: 12 },
                { to: 'r1c0', side: 'S', at: 0, width: 12 },
            ],
            entrances: [
                { x: -8, z: -14, to: 'w-test-dungeon', label: 'Test Crypt' },
            ],
            monolith: { x: 12, z: 12 },
            build(map, h) {
                h.fillBox(map, 5, 8, 1, 2, -5, -3, CRUST_COLORS.slateDark);
            },
            // W5: divergent layouts — a rock blocks (−14..−12, 0..2) only in
            // crust; the abyss grows a gold reef elsewhere instead.
            crust: {
                build(map, h) {
                    h.fillBox(map, -14, -12, 1, 2, 0, 2, CRUST_COLORS.iron);
                },
            },
            abyss: {
                build(map, h) {
                    h.fillBox(map, 14, 16, 1, 2, -10, -8, h.ABYSS_COLORS.goldVein);
                },
            },
            enemies: [{ x: 6, z: 8, kind: 'sentinel', hp: 2 }],
        },
        r0c1: {
            grid: [3, 2],
            edges: [
                { to: 'r0c0', side: 'W', at: 0, width: 12 },
                { to: 'r1c1', side: 'S', at: 4, width: 8 },
            ],
            build(map, h) {
                h.fillBox(map, -4, 4, 1, 3, -4, -2, CRUST_COLORS.iron);
            },
        },
        r1c0: {
            grid: [2, 3],
            edges: [
                { to: 'r0c0', side: 'N', at: 0, width: 12 },
                { to: 'r1c1', side: 'E', at: -4, width: 8 },
            ],
            enemies: [{ x: -5, z: 5, kind: 'scarab', hp: 2, ai: 'charge' }],
        },
        r1c1: {
            grid: [3, 3],
            edges: [
                { to: 'r0c1', side: 'N', at: 4, width: 8 },
                { to: 'r1c0', side: 'W', at: -4, width: 8 },
            ],
            build(map, h) {
                h.fillBox(map, -2, 2, 1, 1, -2, 2, CRUST_COLORS.goldLeaf);
            },
            // W7: overworld placements of the gated blockers
            blockers: [
                {
                    type: 'grapple_gap', id: 'ow-gap',
                    rect: { x0: 8, x1: 12, z0: -6, z1: -2 },
                    anchor: { x: 15, z: -4 },
                    edge: { x: 6, z: -4 },
                },
                { type: 'boot_ledge', id: 'ow-ledge', rect: { x0: -12, x1: -8, z0: 8, z1: 9 } },
                { type: 'wedge_crack', id: 'ow-crack', at: { x: -14, z: -10 }, w: 2, h: 2 },
                { type: 'caster_dark', id: 'ow-dark', rect: { x0: 12, x1: 18, z0: 10, z1: 16 } },
            ],
        },
    },
};
