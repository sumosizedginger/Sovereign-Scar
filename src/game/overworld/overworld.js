// W4: overworld — screens on the same 64-unit world grid, built on the
// room-graph machinery (a screen is a room with partial borders modeled as
// wide edge doors). One registry entry; internal screen management.

import { createDungeon } from '../world/room-graph.js';
import { getOverworldState, patchOverworld, markScreenVisited } from '../world/keys.js';
import { loadSovereignProgress } from '../kernel/progress.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';
import { fillBox } from '../../voxel/helpers.js';
import { sfx } from '../../audio/synth.js';
import * as THREE from 'three';
import { tuneForFloor } from '../render/albedo-trim.js';

/**
 * Base light trim for the overworld, before the per-region albedo compensation.
 *
 * The overworld is the one place with no ceiling and no walls, so it takes the
 * key light across its whole floor plane and reads much brighter than any
 * dungeon under the same preset — when the key rose from 1.9 to 2.55 in the
 * ambient rebalance the start screen went to 97 against a ceiling of 90 while
 * every dungeon sat at 55–79. So the Crust is trimmed DOWN.
 *
 * The Abyss is the opposite problem and a worse one. Every Abyss screen shares
 * one dark floor, and all eight measured **18–27 against a floor of 35** — dark
 * enough that an enemy standing next to the player was hard to pick out. Never
 * caught, because the gate samples the overworld in its default Crust state.
 */
const OVERWORLD_BASE_TUNE = {
    crust: { key: 0.70, ambient: 0.90 },
    // This multiplier is tuned against MOOD_PRESETS.abyss, not an absolute —
    // every time that shared preset moves, this needs re-checking against the
    // brightest Abyss region (Cryomire, its ice pushes hardest). It was 1.60/
    // 1.78 for a dimmer preset; when that preset was raised 2026-07-23 to
    // match the Crust's brightness, the same multiplier compounded on top of
    // an already-brighter base and pushed Cryomire and Tombfields both over
    // the ceiling (95–99 against 90). Re-measured down from here, not by feel:
    // node tests/qa/certification-captures.mjs prints every region's figure.
    // Kept near the post-2026-07-23 remeasure. Dark-region (quarry) shortfall
    // is handled by ABYSS_REGION_MULT so ice-bright screens are not overdriven.
    abyss: { key: 1.36, ambient: 1.44 },
};

/**
 * Abyss screens share one floor colour, so albedoTrim cannot separate them.
 * Regions whose grammar still reads dark under that floor get a small extra
 * multiplier. Keep these modest — a 1.12 lift takes quarry ~42.7 → ~48
 * without pushing Cryomire-class screens through the ceiling.
 */
const ABYSS_REGION_MULT = {
    quarry: 1.12,
    spindle: 1.06,
    // Added with the ground-relief pass. Pyre's Abyss screens metered 71.5
    // against a band floor of 76 once the region carried scorch weathering and
    // shaded terraces — it was the only one of the eight that fell out, because
    // its grammar was already the darkest and the new ground darkens rather
    // than lifts. The decal and the terrace shade were both pulled back first
    // (0x3a2018 -> 0x5a4038, and the Abyss shade from 0.78 to 0.88), which got
    // it to 75.5; this is the last five percent, and it belongs here rather
    // than in the art because the art is now the same as the other seven
    // regions' and it is the LIGHT that this region has always been short of.
    pyre: 1.08,
    // A TRIM, not a lift — the first sub-1.0 entry here. Tombfields' Abyss
    // screens measured 129.8 / 129.9 / 130.1 across three runs against a band
    // ceiling of exactly 130, so whether the certification gate passed was
    // decided by run-to-run noise of ±0.2. A gate that is a coin flip is not a
    // gate, and widening the band to swallow it would be moving the goalposts
    // to wherever the ball landed. The room needed margin instead.
    tombfields: 0.94,
};

/** The floor each base trim was tuned against; compensation is relative to it. */
const REFERENCE_FLOOR = {
    crust: CRUST_COLORS.clayField,
    abyss: ABYSS_COLORS.abyssFloor,
};

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
/** A darker shade of a colour — see `terraceColor` below for why 0.78. */
function shadeOf(hex, k) {
    // CLAMPED, because `k` is used above 1 for the lit step edge and an
    // unclamped 255 * 1.16 wraps into the next channel — a pale clay tread
    // would come out green.
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return (c((hex >> 16) & 255) << 16) | (c((hex >> 8) & 255) << 8) | c(hex & 255);
}

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
        // No route (or no edge for it) must hide the ring, not leave the last
        // frame's marker sitting on a border it no longer points along.
        if (!edge) {
            if (threadPulse) threadPulse.visible = false;
            return;
        }
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
        // Edge sides are authored uppercase ('E'/'W'/'S'/'N') by world7.js and
        // screens.js. Comparing them raw against lowercase failed every test
        // and fell through to the west arm, so the hint that exists to point a
        // lost player at their objective pointed west from every screen.
        // Normalize instead of matching one casing: the door path in
        // room-graph.js compares uppercase, so both spellings are in the wild.
        const side = String(edge.side || '').toLowerCase();
        const pos = side === 'n' ? [ox + at, oz - SCREEN_HALF + 1]
            : side === 's' ? [ox + at, oz + SCREEN_HALF - 1]
                : side === 'e' ? [ox + SCREEN_HALF - 1, oz + at]
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
        const screenFloor = (mood === 'abyss' ? s.abyssFloorColor : s.floorColor)
            || (mood === 'abyss' ? ABYSS_COLORS.abyssFloor : CRUST_COLORS.clayField);

        rooms[sid] = {
            grid: s.grid,
            half: SCREEN_HALF,
            wallH: 2, // low border cliffs
            spawn: s.spawn || { x: 0, z: 0 },
            floorColor: screenFloor,
            // Per-SCREEN light trim, derived from how dark this region's rock
            // is. The eight regions are deliberately different stone sitting
            // under one set of lights, so one level-wide trim gave Tombfields'
            // pale clay 76 and the Spindle's iron 32 — in the same level, from
            // the same lighting, with a floor of 45. See render/albedo-trim.js.
            lightTune: (() => {
                const base = { ...(OVERWORLD_BASE_TUNE[mood] || OVERWORLD_BASE_TUNE.crust) };
                if (mood === 'abyss' && s.track && ABYSS_REGION_MULT[s.track]) {
                    const m = ABYSS_REGION_MULT[s.track];
                    for (const k of Object.keys(base)) base[k] = +(base[k] * m).toFixed(4);
                }
                return tuneForFloor(
                    base,
                    screenFloor,
                    REFERENCE_FLOOR[mood] || REFERENCE_FLOOR.crust
                );
            })(),
            wallColor: mood === 'abyss' ? ABYSS_COLORS.abyssWall : CRUST_COLORS.slate,
            // Ground weathering, per region (`room-decals.js`). Carried across
            // explicitly because this object is rebuilt field by field rather
            // than spread from the screen — anything not named here is silently
            // dropped, which is exactly how the first attempt at this landed
            // with no effect and no error.
            weathering: s.weathering,
            // RISEN GROUND IS THE SAME GROUND, A SHADE DARKER.
            //
            // Derived HERE, from `screenFloor`, and not from the region table,
            // because the four hand-authored gate screens keep their own floor
            // colour and would otherwise be given the shade of a floor they do
            // not have — scarfield, the first screen a new player sees, came
            // out with grey slabs on clay for exactly that reason.
            //
            // Third answer, and the pictures chose it. The default is the wall
            // colour (masonry — concrete slabs dropped on a clay field) and the
            // second attempt was the region's authored accent (rust, which read
            // as painted panels). `tests/qa/contrast-probe.mjs` scored all three
            // IDENTICALLY at 47: the metric cannot tell a material that belongs
            // from one that does not, because both are a large value break
            // against the floor. `docs/media/overworld/` is where the difference
            // lives. Keeping the material and letting the step's own shadow do
            // the separating is what makes it read as terrain.
            // MOOD-AWARE, because a fixed fraction is not a fixed cost. The
            // Abyss floors are already dark, so the 0.78 that reads as a step
            // in daylight reads as underexposure at night — with the pyre
            // weathering it took that region's abyss state to 71.5 against a
            // certification floor of 76. The step still has to be visible, so
            // it is a smaller bite rather than none.
            terraceColor: shadeOf(screenFloor, mood === 'abyss' ? 0.88 : 0.78),
            // …and the step-edge mark is a LIGHTER shade of the same ground
            // rather than the kit tread. Same reasoning: the affordance is
            // worth keeping — a lit rim still reads as an edge you can step up
            // — but it must be this ground catching the light, not a different
            // material laid over it.
            treadColor: shadeOf(screenFloor, mood === 'abyss' ? 1.24 : 1.16),
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
        // Level-wide fallback. Every screen carries its own albedo-compensated
        // trim (see above); this is what a screen without one would get.
        lightTune: OVERWORLD_BASE_TUNE[mood] || OVERWORLD_BASE_TUNE.crust,
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

    // Restore exact position when returning mid-screen.
    //
    // THE OWNER'S REPORT: "I spawned under the ground due to the raised land
    // right next to the entrance." This is the line. Your x and z came back
    // exactly, and y was forced to 1.95 — the height of flat ground — no matter
    // what you had been standing on when you walked into the dungeon. Measured
    // across the 49 screens, ELEVEN THOUSAND standable cells buried you on
    // return, and the ones beside a dungeon arch are the cells you leave from.
    if (savedPos && savedPos.screen === startScreen) {
        const room = rooms[startScreen];
        const x = room.grid[0] * 64 + savedPos.x;
        const z = room.grid[1] * 64 + savedPos.z;
        level.spawn = { x, z, y: level.groundY?.(x, z) ?? 1.95 };
    }

    // W5: never trap the player — if the (possibly state-swapped) layout put
    // a solid where they stand, nudge to the nearest free cell (ring search).
    {
        // "Is cell 1 empty and cell 0 solid" was the flat-floor question, and on
        // raised ground the answer is no for both — so this used to walk the
        // player OFF a perfectly good terrace, and it could not tell "inside the
        // monolith" from "on top of the monolith" either way.
        //
        // `safeSpot` is the room graph's own search, the same one a door arrival
        // uses: cell-centred, body-checked against the collision world, ground
        // height measured rather than assumed, and preferring floor to any perch
        // it would have to climb.
        const safe = level.safeSpot?.(level.spawn.x, level.spawn.z, 8);
        if (safe) level.spawn = safe;
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
