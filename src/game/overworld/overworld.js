// W4: overworld — screens on the same 64-unit world grid, built on the
// room-graph machinery (a screen is a room with partial borders modeled as
// wide edge doors). One registry entry; internal screen management.

import { createDungeon, doorCells } from '../world/room-graph.js';
import { getOverworldState, patchOverworld, markScreenVisited } from '../world/keys.js';
import { loadSovereignProgress } from '../kernel/progress.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';
import { fillBox } from '../../voxel/helpers.js';
import { sfx } from '../../audio/synth.js';

export const SCREEN_HALF = 23; // 47×47 cells ≈ the plan's 48-unit screens

/**
 * Turn a screens definition into a dungeon def the room-graph can run.
 * Screen def shape (screens.js): {
 *   start: 'r0c0',
 *   screens: { 'r0c0': {
 *     grid: [sx, sy],
 *     edges: [{ to, side, at?, width? }],   // open border gaps
 *     build(map, h),                        // shared terrain, LOCAL coords
 *     crust: { build(map, h) },             // W5: crust-only layout
 *     abyss: { build(map, h) },             // W5: abyss-only layout
 *     monolith: { x, z },                   // W5: mirror-travel site
 *     entrances: [{ x, z, to, label }],     // dungeon doors (E to enter)
 *     spawn: { x, z },
 *   } }
 * }
 */
export function createOverworld(ctx, screensDef, opts = {}) {
    const saved = getOverworldState();
    const mood = saved.state === 'abyss' ? 'abyss' : 'crust';
    const startScreen = (saved.pos && screensDef.screens[saved.pos.screen])
        ? saved.pos.screen
        : screensDef.start;

    const rooms = {};
    for (const [sid, s] of Object.entries(screensDef.screens)) {
        rooms[sid] = {
            grid: s.grid,
            half: SCREEN_HALF,
            wallH: 2, // low border cliffs
            spawn: s.spawn || { x: 0, z: 0 },
            floorColor: mood === 'abyss' ? ABYSS_COLORS.abyssFloor : CRUST_COLORS.clayDark,
            wallColor: mood === 'abyss' ? ABYSS_COLORS.abyssWall : CRUST_COLORS.slate,
            doors: (s.edges || []).map((e) => ({
                to: e.to,
                side: e.side,
                at: e.at || 0,
                width: e.width || 12,
                type: 'open',
            })),
            build(map, h) {
                // Entrance arches: two pillars + lintel per dungeon door
                for (const en of s.entrances || []) {
                    fillBox(map, en.x - 2, en.x - 2, 1, 4, en.z, en.z, CRUST_COLORS.goldLeaf);
                    fillBox(map, en.x + 2, en.x + 2, 1, 4, en.z, en.z, CRUST_COLORS.goldLeaf);
                    fillBox(map, en.x - 2, en.x + 2, 4, 4, en.z, en.z, CRUST_COLORS.goldLeaf);
                }
                // W5: monolith — mirror-travel obelisk (violet shaft, gold cap)
                if (s.monolith) {
                    const m = s.monolith;
                    fillBox(map, m.x, m.x, 1, 5, m.z, m.z, ABYSS_COLORS.violet);
                    fillBox(map, m.x, m.x, 6, 6, m.z, m.z, ABYSS_COLORS.goldVein);
                }
                if (s.build) s.build(map, h);
                // W5: state-specific layout on top of the shared terrain
                const variant = mood === 'abyss' ? s.abyss : s.crust;
                if (variant?.build) variant.build(map, h);
            },
            enemies: s.enemies || [],
        };
    }

    // W5: begin a mirror swap — persist the other state + exact position,
    // ramp the mood, and reload the overworld once the ramp lands.
    function startSwap(game, level) {
        const sid = level.currentRoomId();
        const room = rooms[sid];
        const p = game.player.root.position;
        const other = mood === 'crust' ? 'abyss' : 'crust';
        patchOverworld({
            state: other,
            pos: { screen: sid, x: p.x - room.grid[0] * 64, z: p.z - room.grid[1] * 64 },
        });
        game.mood?.startRamp?.(other, 1.5);
        game.hud?.toast?.(other === 'abyss'
            ? 'The world folds into the Abyss…'
            : 'The Crust reasserts itself…', 1800);
        sfx.phase?.();
        level._swapTimer = 1.5;
    }

    const def = {
        id: 'overworld',
        name: screensDef.name || 'The Scarred Crust',
        mood,
        start: startScreen,
        banner: screensDef.banner || 'The Scarred Crust — find the wounds',
        rooms,
        onUpdate(dt, game, level) {
            // W5: pending mirror swap — reload after the mood ramp lands
            if (level._swapTimer != null) {
                level._swapTimer -= dt;
                if (level._swapTimer <= 0) {
                    level._swapTimer = null;
                    game.loadLevel?.('overworld');
                }
                return;
            }
            const sid = level.currentRoomId();
            const s = screensDef.screens[sid];
            if (!s || level.isTransitioning()) return;
            const room = rooms[sid];
            const ox = room.grid[0] * 64, oz = room.grid[1] * 64;
            const p = game.player.root.position;

            // W5: mirror travel — monolith interact (free-swap holders can
            // trigger it anywhere outdoors via level.onMoodToggle, wired in
            // index.js)
            if (s.monolith) {
                const md = Math.hypot(p.x - (ox + s.monolith.x), p.z - (oz + s.monolith.z));
                if (md < 2.2 && game.input?.consumeInteract?.()) {
                    startSwap(game, level);
                    return;
                }
            }

            // Dungeon entrances: stand in the arch + interact
            if (!s.entrances) return;
            for (const en of s.entrances) {
                const d = Math.hypot(p.x - (ox + en.x), p.z - (oz + en.z));
                if (d < 1.6) {
                    if (!en._hinted) {
                        en._hinted = true;
                        game.hud?.toast?.(`E — enter ${en.label || en.to}`, 1600);
                    }
                    if (game.input?.consumeInteract?.()) {
                        // Remember where we are so the dungeon exit returns here
                        patchOverworld({
                            pos: { screen: sid, x: en.x, z: en.z + 2 },
                        });
                        sfx.heave?.();
                        game.loadLevel?.(en.to);
                        return;
                    }
                }
            }
        },
    };

    const level = createDungeon(ctx, def, opts);

    // Restore exact position when returning mid-screen
    if (saved.pos && saved.pos.screen === startScreen) {
        const room = rooms[startScreen];
        level.spawn = {
            x: room.grid[0] * 64 + saved.pos.x,
            y: 1.95,
            z: room.grid[1] * 64 + saved.pos.z,
        };
    }

    // W5: never trap the player — if the (possibly state-swapped) layout put
    // a solid where they stand, nudge to the nearest free cell (ring search).
    {
        const blocked = (x, z) => level.getVoxelAt(x, 1.5, z);
        if (blocked(level.spawn.x, level.spawn.z)) {
            outer:
            for (let r = 1; r <= 8; r++) {
                for (let dx = -r; dx <= r; dx++) {
                    for (let dz = -r; dz <= r; dz++) {
                        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                        const nx = level.spawn.x + dx, nz = level.spawn.z + dz;
                        if (!blocked(nx, nz) && level.getVoxelAt(nx, 0.5, nz)) {
                            level.spawn = { x: nx, y: 1.95, z: nz };
                            break outer;
                        }
                    }
                }
            }
        }
    }

    // W5: mirror-free holders (Proxy defeated) can swap anywhere outdoors —
    // index.js routes the M/mood toggle here first.
    level.onMoodToggle = (game) => {
        if (level._swapTimer != null || level.isTransitioning()) return true;
        const freeSwap = game.player.inventory?.getFlag?.('mirror_free')
            || (loadSovereignProgress().bossesDefeated || []).includes('proxy');
        if (!freeSwap) {
            game.hud?.toast?.('The mirror resists — find a monolith', 1500);
            return true;
        }
        startSwap(game, level);
        return true;
    };

    // Save position on every screen transition (natural checkpoint) and
    // track visited screens for the map (W6).
    level.onRoomEnter = (sid, game) => {
        markScreenVisited(sid);
        if (game) {
            const room = rooms[sid];
            const p = game.player.root.position;
            patchOverworld({
                pos: {
                    screen: sid,
                    x: p.x - room.grid[0] * 64,
                    z: p.z - room.grid[1] * 64,
                },
            });
        }
    };

    return level;
}
