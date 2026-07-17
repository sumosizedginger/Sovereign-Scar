// C1: the full 7×7 overworld — 49 screens × two mirror states, generated
// from a compact region table with hand-authored overrides for the screens
// that matter (entrances, monoliths, blockers). Grid rows r0..r6 map to
// world-grid coords [8+col, 8+row]; the Phase-W-gate screens keep their ids
// and positions (scarfield = r2c2 = grid [10,10]).

import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';
import { CRUST_REGION } from './screens.js';
import { REGION_MOTIFS } from '../fx/motifs.js';

// ── Seeded rand (mulberry32 over a string hash) ────────────────────────────
function hash(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
}
function rng(seed) {
    let a = hash(seed);
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Region table (bible §1.1/1.2 + §7): flavor per world zone ──────────────
// Keyed by "band" — which zone a (row, col) falls into.
const REGIONS = {
    tombfields: { // NW: beats 01–02 country — slate + bone
        crustFloor: CRUST_COLORS.clayField, crustAccent: CRUST_COLORS.limestone,
        abyssAccent: ABYSS_COLORS.goldVein, density: 0.5, enemies: ['sentinel'],
    },
    spindle: { // N/NE: computing-vault heights — grey slate, iron
        crustFloor: CRUST_COLORS.iron, crustAccent: CRUST_COLORS.slate,
        abyssAccent: ABYSS_COLORS.violet, density: 0.7, enemies: ['sentinel', 'scarab'],
    },
    sinklands: { // mid-west: dust flats — clay, rust
        crustFloor: CRUST_COLORS.clayField, crustAccent: CRUST_COLORS.rust,
        abyssAccent: ABYSS_COLORS.goldVein, density: 0.35, enemies: ['scarab'],
    },
    citadel: { // center: the Proxy's approach — gold-veined slate
        crustFloor: CRUST_COLORS.floor, crustAccent: CRUST_COLORS.goldLeaf,
        abyssAccent: ABYSS_COLORS.violetHot, density: 0.8, enemies: ['sentinel', 'scarab'],
    },
    quarry: { // SW: bleeding quarry country — dark slate, basalt
        crustFloor: CRUST_COLORS.slate, crustAccent: CRUST_COLORS.slateDark,
        abyssAccent: ABYSS_COLORS.basalt, density: 0.75, enemies: ['scarab', 'sentinel'],
    },
    bonetown: { // S: bone forest + ruined town — limestone, moss
        crustFloor: CRUST_COLORS.ashField, crustAccent: CRUST_COLORS.tombMoss,
        abyssAccent: ABYSS_COLORS.bone, density: 0.9, enemies: ['sentinel', 'frost'],
    },
    cryomire: { // SE: cryo vault + rot mire — ice + sludge
        crustFloor: CRUST_COLORS.slate, crustAccent: ABYSS_COLORS.iceDark,
        abyssAccent: ABYSS_COLORS.sludge, density: 0.6, enemies: ['frost'],
    },
    pyre: { // E: pyre peak ascent — rust + magma veins
        crustFloor: CRUST_COLORS.clayDark, crustAccent: CRUST_COLORS.rust,
        abyssAccent: ABYSS_COLORS.magma, density: 0.7, enemies: ['scarab', 'frost'],
    },
};

function regionOf(r, c) {
    if (r <= 1 && c <= 2) return 'tombfields';
    if (r <= 1 && c <= 4) return 'spindle';
    if (r <= 1) return 'pyre';
    if (r === 2 && c <= 1) return 'tombfields';
    if (r === 2 && c >= 5) return 'pyre';
    if (r === 3 && c >= 2 && c <= 4) return 'citadel';
    if (r <= 3 && c <= 1) return 'sinklands';
    if (r <= 3) return r === 2 ? 'sinklands' : 'pyre';
    if (r >= 4 && c <= 1) return 'quarry';
    if (r >= 5 && c >= 2 && c <= 4) return 'bonetown';
    if (r >= 4 && c >= 5) return 'cryomire';
    return 'sinklands';
}

// 14 dungeon entrances spread across the map (beat-01 stays on scarfield)
const ENTRANCES = {
    'r2c2': null, // scarfield — hand-authored (beat-01)
    'r1c1': { to: 'beat-02-spindle', label: 'the Eastern Spindle' },
    'r3c1': { to: 'beat-03-sink', label: 'the Duval Sink' },
    'r0c3': { to: 'beat-04-sky', label: 'the Sky Monument' },
    'r4c3': { to: 'beat-05-citadel', label: 'the Citadel of the Proxy' },
    'r4c0': { to: 'beat-06-quarry', label: 'the Bleeding Quarry' },
    'r5c0': { to: 'beat-07-sluice', label: 'the Sluice of Tears' },
    'r6c2': { to: 'beat-08-bone', label: 'the Bone Forest' },
    'r6c4': { to: 'beat-09-town', label: 'the Ruined Town' },
    'r4c5': { to: 'beat-10-cryo', label: 'the Cryo Vault' },
    'r5c6': { to: 'beat-11-mire', label: 'the Rot Mire' },
    'r2c6': { to: 'beat-12-pyre', label: 'Pyre Peak' },
    'r0c5': { to: 'beat-13-gumoi', label: 'the GUMOI Tower' },
    'r0c6': { to: 'beat-14-leviathan', label: 'the Leviathan Core' },
};

const MONOLITHS = new Set(['r3c4', 'r1c2', 'r5c3', 'r4c6']);

// Item-gating budget (C4): ≥2 overworld blockers per item
const BLOCKERS = {
    'r3c0': [{
        type: 'grapple_gap', id: 'ow7-gap-sink',
        rect: { x0: -18, x1: -12, z0: -2, z1: 4 },
        anchor: { x: -21, z: 1 }, edge: { x: -10, z: 1 },
    }],
    'r1c4': [{
        type: 'grapple_gap', id: 'ow7-gap-spindle',
        rect: { x0: 10, x1: 16, z0: 8, z1: 12 },
        anchor: { x: 19, z: 10 }, edge: { x: 8, z: 10 },
    }],
    'r6c3': [{ type: 'boot_ledge', id: 'ow7-ledge-bone', rect: { x0: -14, x1: -8, z0: -12, z1: -11 } }],
    'r2c5': [{ type: 'boot_ledge', id: 'ow7-ledge-pyre', rect: { x0: 6, x1: 12, z0: 14, z1: 15 } }],
    'r4c1': [{ type: 'wedge_crack', id: 'ow7-crack-quarry', at: { x: -16, z: 6 }, w: 2, h: 2 }],
    'r0c4': [{ type: 'wedge_crack', id: 'ow7-crack-sky', at: { x: 12, z: -14 }, w: 2, h: 2 }],
    'r5c5': [{ type: 'caster_dark', id: 'ow7-dark-mire', rect: { x0: -4, x1: 4, z0: -4, z1: 4 } }],
    'r6c0': [{ type: 'caster_dark', id: 'ow7-dark-sluice', rect: { x0: 8, x1: 16, z0: 6, z1: 12 } }],
};

// ≥1 secret shard cache per region (screen → cache spot)
const SECRETS = {
    'r0c0': { x: -18, z: -18, shards: 20 }, // tombfields
    'r0c2': { x: 16, z: -16, shards: 20 },  // spindle
    'r2c0': { x: -16, z: 14, shards: 20 },  // sinklands
    'r3c4': { x: 14, z: 16, shards: 25 },   // citadel approach
    'r5c1': { x: -14, z: -16, shards: 20 }, // quarry
    'r6c5': { x: 18, z: 14, shards: 20 },   // cryomire
    'r5c4': { x: 0, z: 18, shards: 20 },    // bonetown
    'r1c6': { x: 16, z: 4, shards: 25 },    // pyre
};

function buildTerrain(sid, region, variant) {
    return (map, h) => {
        const rand = rng(sid + ':' + variant);
        const R = REGIONS[region];
        const n = Math.floor(4 + R.density * 8);
        for (let i = 0; i < n; i++) {
            const x = Math.floor(rand() * 38) - 19;
            const z = Math.floor(rand() * 38) - 19;
            const kind = rand();
            if (Math.hypot(x, z) < 5) continue; // keep spawn/center clear
            if (kind < 0.45) {
                // slab
                const w = 1 + Math.floor(rand() * 3);
                h.fillBox(map, x, x + w, 1, 1 + Math.floor(rand() * 2), z, z + Math.floor(rand() * 2) + 1,
                    variant === 'abyss' ? R.abyssAccent : R.crustAccent);
            } else if (kind < 0.65) {
                // pillar
                h.fillBox(map, x, x, 1, 3 + Math.floor(rand() * 2), z, z,
                    variant === 'abyss' ? ABYSS_COLORS.violet : CRUST_COLORS.slate);
            } else {
                // floor stain / vein
                h.fillBox(map, x, x + 2 + Math.floor(rand() * 3), 0, 0, z, z + 1,
                    variant === 'abyss' ? ABYSS_COLORS.goldVein
                        : (region === 'bonetown' ? CRUST_COLORS.tombMoss : CRUST_COLORS.bloodStain));
            }
        }
    };
}

function edgeParams(a, b) {
    // Deterministic per adjacent pair (sorted) so both sides agree
    const rand = rng([a, b].sort().join('|'));
    return { at: Math.floor(rand() * 17) - 8, width: 8 + Math.floor(rand() * 7) };
}

export function buildWorld7() {
    const screens = {};
    const hand = CRUST_REGION.screens; // scarfield/ridge/flats/sink overrides
    const handAt = { 'r2c2': 'scarfield', 'r2c3': 'ridge', 'r3c2': 'flats', 'r3c3': 'sink' };

    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            const sid = `r${r}c${c}`;
            const region = regionOf(r, c);
            const R = REGIONS[region];
            const rand = rng(sid + ':meta');

            if (handAt[sid]) {
                // Hand-authored gate screens keep their content under their
                // own ids; generated edges are appended below.
                const src = hand[handAt[sid]];
                screens[handAt[sid]] = {
                    ...src, edges: [...src.edges], grid: [8 + c, 8 + r],
                    motif: REGION_MOTIFS[region] || null, // C7
                };
                continue;
            }

            const s = {
                grid: [8 + c, 8 + r],
                floorColor: R.crustFloor,
                edges: [],
                build: buildTerrain(sid, region, 'shared'),
                crust: { build: buildTerrain(sid, region, 'crust') },
                abyss: { build: buildTerrain(sid, region, 'abyss') },
                motif: REGION_MOTIFS[region] || null, // C7
                enemies: [],
            };
            const mobCount = 1 + Math.floor(rand() * 2 + R.density);
            for (let i = 0; i < mobCount; i++) {
                const kind = R.enemies[Math.floor(rand() * R.enemies.length)];
                s.enemies.push({
                    x: Math.floor(rand() * 30) - 15,
                    z: Math.floor(rand() * 30) - 15,
                    kind,
                    hp: 2 + (r >= 4 || c >= 4 ? 1 : 0),
                    ...(kind === 'scarab' ? { ai: 'charge' } : kind === 'frost' ? { ai: 'ranged' } : {}),
                });
            }
            const en = ENTRANCES[sid];
            if (en) s.entrances = [{ x: 0, z: -16, ...en }];
            if (MONOLITHS.has(sid)) s.monolith = { x: 12, z: 12 };
            if (BLOCKERS[sid]) s.blockers = BLOCKERS[sid];
            const secret = SECRETS[sid];
            if (secret) {
                s.onBake = (level, origin) => {
                    level.addPickup({ x: origin.x + secret.x, y: 1.2, z: origin.z + secret.z }, {
                        color: 0x7fe0ff,
                        label: 'Hidden cache',
                        onPickup(game) {
                            game.player.inventory.addShards(secret.shards);
                            game.hud?.toast?.(`Hidden cache — ${secret.shards} shards`);
                        },
                    });
                };
            }
            screens[sid] = s;
        }
    }

    // Connect every adjacent pair (E-W and N-S), deduping the hand edges
    const idAt = (r, c) => handAt[`r${r}c${c}`] || `r${r}c${c}`;
    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            const a = idAt(r, c);
            if (c < 6) {
                const b = idAt(r, c + 1);
                if (!screens[a].edges.some((e) => e.to === b)) {
                    const p = edgeParams(a, b);
                    screens[a].edges.push({ to: b, side: 'E', at: p.at, width: p.width });
                    screens[b].edges.push({ to: a, side: 'W', at: p.at, width: p.width });
                }
            }
            if (r < 6) {
                const b = idAt(r + 1, c);
                if (!screens[a].edges.some((e) => e.to === b)) {
                    const p = edgeParams(a, b);
                    screens[a].edges.push({ to: b, side: 'S', at: p.at, width: p.width });
                    screens[b].edges.push({ to: a, side: 'N', at: p.at, width: p.width });
                }
            }
        }
    }

    return {
        name: 'The Scarred Crust',
        banner: 'The Scarred Crust — fourteen wounds await',
        start: 'scarfield',
        screens,
    };
}

export const WORLD7 = buildWorld7();
