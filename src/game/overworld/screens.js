// Overworld screen definitions. W4 ships a 2×2 test grid; C1 replaces it
// with the real 7×7 dual-state world.

import { CRUST_COLORS } from '../assets/palettes.js';

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
        },
    },
};
