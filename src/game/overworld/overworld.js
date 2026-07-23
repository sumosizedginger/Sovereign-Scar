// W4: overworld — screens on the same 64-unit world grid, built on the
// room-graph machinery (a screen is a room with partial borders modeled as
// wide edge doors). One registry entry; internal screen management.

import { createDungeon, doorCells } from '../world/room-graph.js';
import { getOverworldState, patchOverworld, markScreenVisited } from '../world/keys.js';
import { loadSovereignProgress } from '../kernel/progress.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';
import { fillBox } from '../../voxel/helpers.js';
import { sfx } from '../../audio/synth.js';
import * as THREE from 'three';

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
    const levelId = opts.levelId || 'overworld';
    const saved = getOverworldState();
    const mood = saved.state === 'abyss' ? 'abyss' : 'crust';
    // Saved positions are scoped to their overworld id — the dev test grid
    // and the real world share screen names but not geography.
    const savedPos = (saved.pos && saved.pos.world === levelId
        && screensDef.screens[saved.pos.screen]) ? saved.pos : null;
    const startScreen = savedPos ? savedPos.screen : screensDef.start;
    let threadPulse = null;

    function updateThreadPulse(game, sid, s, room) {
        const destination = game.anchorThread?.destination?.()?.screen;
        const tier = game.anchorThread?.state?.hintTier || 0;
        if (!destination || destination === sid || tier < 1) {
            if (threadPulse) threadPulse.visible = false;
            return;
        }
        const next = nextScreenToward(screensDef.screens, sid, destination);
        const edge = (s.edges || []).find((candidate) => candidate.to === next);
        if (!edge) return;
        if (!threadPulse) {
            threadPulse = new THREE.Mesh(
                new THREE.TorusGeometry(0.7, 0.10, 8, 24),
                new THREE.MeshBasicMaterial({
                    color: 0xd4a84b, transparent: true, opacity: 0.8,
                    depthWrite: false,
                })
            );
            threadPulse.rotation.x = Math.PI / 2;
            ctx.scene.add(threadPulse);
        }
        const ox = room.grid[0] * 64, oz = room.grid[1] * 64;
        const at = edge.at || 0;
        const pos = edge.side === 'n' ? [ox + at, oz - SCREEN_HALF + 1]
            : edge.side === 's' ? [ox + at, oz + SCREEN_HALF - 1]
                : edge.side === 'e' ? [ox + SCREEN_HALF - 1, oz + at]
                    : [ox - SCREEN_HALF + 1, oz + at];
        threadPulse.position.set(pos[0], 1.18, pos[1]);
        threadPulse.visible = true;
        const pulse = 0.9 + Math.sin(performance.now() * 0.006) * 0.22;
        threadPulse.scale.setScalar(pulse);
        threadPulse.material.opacity = 0.62 + Math.sin(performance.now() * 0.006) * 0.22;
        const playerPos = game.player?.root?.position;
        if (tier >= 2 && playerPos
            && Math.hypot(playerPos.x - pos[0], playerPos.z - pos[1]) < 8) {
            const beat = game.anchorThread?.destination?.()?.beat;
            game.mood?.setMusicTrack?.(beat);
        }
    }

    const rooms = {};
    for (const [sid, s] of Object.entries(screensDef.screens)) {
        rooms[sid] = {
            grid: s.grid,
            half: SCREEN_HALF,
            wallH: 2, // low border cliffs
            spawn: s.spawn || { x: 0, z: 0 },
            floorColor: (mood === 'abyss' ? s.abyssFloorColor : s.floorColor)
                || (mood === 'abyss' ? ABYSS_COLORS.abyssFloor : CRUST_COLORS.clayField),
            wallColor: mood === 'abyss' ? ABYSS_COLORS.abyssWall : CRUST_COLORS.slate,
            onBake: s.onBake,
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
            blockers: s.blockers || [], // W7
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
            pos: { world: levelId, screen: sid, x: p.x - room.grid[0] * 64, z: p.z - room.grid[1] * 64 },
        });
        game.mood?.startRamp?.(other, 1.5);
        game.hud?.toast?.(other === 'abyss'
            ? 'The world folds into the Abyss…'
            : 'The Crust reasserts itself…', 1800);
        sfx.phase?.();
        level._swapTimer = 1.5;
    }

    const def = {
        id: levelId,
        name: screensDef.name || 'The Scarred Crust',
        mood,
        // The overworld is the one place with no ceiling and no walls, so it
        // takes the key light across its whole floor plane and reads much
        // brighter than any dungeon under the same preset. When the key rose
        // from 1.9 to 2.55 in the ambient rebalance it went to 97 against a
        // ceiling of 90 while every dungeon sat at 55–79. This trims the key
        // back for the open screens only, rather than dragging the preset down
        // and re-darkening fourteen interiors to fix one exterior.
        lightTune: { key: 0.7, ambient: 0.9 },
        start: startScreen,
        banner: screensDef.banner || 'The Scarred Crust — find the wounds',
        rooms,
        onUpdate(dt, game, level) {
            // W5: pending mirror swap — reload after the mood ramp lands
            if (level._swapTimer != null) {
                level._swapTimer -= dt;
                if (level._swapTimer <= 0) {
                    level._swapTimer = null;
                    game.loadLevel?.(levelId);
                }
                return;
            }
            const sid = level.currentRoomId();
            const s = screensDef.screens[sid];
            if (!s || level.isTransitioning()) return;
            const room = rooms[sid];
            const ox = room.grid[0] * 64, oz = room.grid[1] * 64;
            const p = game.player.root.position;
            updateThreadPulse(game, sid, s, room);

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
                    const unlocked = game.isLevelUnlocked?.(en.to) !== false;
                    if (!en._hinted) {
                        en._hinted = true;
                        game.hud?.toast?.(unlocked
                            ? `E — enter ${en.label || en.to}`
                            : `${en.label || en.to} is sealed`, 1600);
                    }
                    if (game.input?.consumeInteract?.()) {
                        if (!unlocked) {
                            if (game.anchorThread?.destination?.()?.beat === en.to) {
                                game.anchorThread.failed?.(`entrance:${en.to}`);
                            }
                            game.hud?.toast?.(`${en.label || en.to} is still sealed`, 2200);
                            return;
                        }
                        // Remember where we are so the dungeon exit returns here
                        patchOverworld({
                            pos: { world: levelId, screen: sid, x: en.x, z: en.z + 2 },
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
    level.addSystem({
        update() {},
        dispose() {
            if (!threadPulse) return;
            if (threadPulse.parent) threadPulse.parent.remove(threadPulse);
            threadPulse.geometry.dispose();
            threadPulse.material.dispose();
            threadPulse = null;
        },
    });

    // Restore exact position when returning mid-screen
    if (savedPos && savedPos.screen === startScreen) {
        const room = rooms[startScreen];
        level.spawn = {
            x: room.grid[0] * 64 + savedPos.x,
            y: 1.95,
            z: room.grid[1] * 64 + savedPos.z,
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

    // W6: overworld view for the Tab map (screens instead of rooms)
    level.mapData = () => {
        const visited = getOverworldState().visited;
        return {
            kind: 'overworld',
            name: def.name,
            state: mood,
            screens: Object.entries(screensDef.screens).map(([sid, s]) => ({
                id: sid,
                sx: s.grid[0],
                sy: s.grid[1],
                visited: visited.includes(sid),
                current: sid === level.currentRoomId(),
                entrance: !!(s.entrances && s.entrances.length),
                monolith: !!s.monolith,
                secret: !!s.secret,
            })),
        };
    };

    // Save position on every screen transition (natural checkpoint) and
    // track visited screens for the map (W6).
    level.onRoomEnter = (sid, game) => {
        markScreenVisited(sid);
        if (game) {
            if (game.anchorThread?.destination?.()?.screen === sid) {
                game.anchorThread.markProgress?.('destination_region', sid);
            }
            // The region's composition follows the player across screens, so
            // walking from the Tombfields into the Pyre changes key and tempo.
            game.mood?.setMusicTrack?.(screensDef.screens[sid]?.track || null);
            const room = rooms[sid];
            const p = game.player.root.position;
            patchOverworld({
                pos: {
                    world: levelId,
                    screen: sid,
                    x: p.x - room.grid[0] * 64,
                    z: p.z - room.grid[1] * 64,
                },
            });
        }
    };

    // The starting screen's region track applies at load (index.js reads this).
    level.initialTrack = screensDef.screens[startScreen]?.track || null;

    return level;
}

export function nextScreenToward(screens, start, destination) {
    if (!screens?.[start] || !screens?.[destination] || start === destination) return start;
    const queue = [start];
    const previous = new Map([[start, null]]);
    while (queue.length) {
        const id = queue.shift();
        if (id === destination) break;
        for (const edge of screens[id]?.edges || []) {
            if (!screens[edge.to] || previous.has(edge.to)) continue;
            previous.set(edge.to, id);
            queue.push(edge.to);
        }
    }
    if (!previous.has(destination)) return null;
    let step = destination;
    while (previous.get(step) && previous.get(step) !== start) step = previous.get(step);
    return previous.get(step) === start ? step : null;
}
