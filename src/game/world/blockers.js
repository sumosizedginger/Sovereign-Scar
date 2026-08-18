// @ts-check
// W7: item-gating blocker primitives. Each blocker has two halves:
//   applyBlockerToMap(map, b)          — build-time map edits (LOCAL coords)
//   createBlockerRuntime(ctx, level,   — per-frame behavior, world coords
//                        b, origin)
// Both are driven by room defs (room.blockers) via room-graph bakeRoom, so
// blockers persist/dispose with their room. Broken/cleared state persists as
// 'blocker:<id>' in the owning level's keyStore opened list.
//
// Types:
//   grapple_gap  — floor chasm + anchor post(s); G pulls to a post in range.
//                  Supports `anchor` and optional `reverseAnchor` so the gap
//                  is crossable both ways (return from a boss is common).
//                  Falling in = 1 damage + respawn at the nearest edge.
//   wedge_crack  — destructible plug only tectonic_wedge damage breaks.
//   boot_ledge   — 2-high barrier; dashing into it with phase_boot hops over.
//   caster_dark  — dark shroud dispelled while light_caster is equipped.

import * as THREE from 'three';
import { fillBox } from '../../voxel/helpers.js';
import { DestructibleVoxelMesh } from './destructible-voxel-mesh.js';
import { meshAndCollide } from './level-builder.js';
import { CRUST_COLORS, ABYSS_COLORS } from '../assets/palettes.js';
import { sfx } from '../../audio/synth.js';
import { gsfx } from '../audio/sfx-bank.js';
import { PushableBlock } from './pushable-block.js';
import { coach } from '../ui/coach.js';
import { plateHeld, socketFilled, traceBeam } from './puzzle-kit.js';

/**
 * Phase E1 — how long a switch holds its signal open, and how far a block
 * travels per shove.
 *
 * `GATE_HOLD` is the only number in the puzzle kit that is really a difficulty
 * dial. Long enough to cross a room at walking speed and not one step further:
 * the whole shape of a timed gate is "you cannot also stop to fight".
 */
export const GATE_HOLD = 6.0;
export const PUSH_STEP = 0.9;
/** Distance past the room edge at which a puzzle resets itself. */
export const PUZZLE_RESET_AT = 6;

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

export function insideRect(p, r) {
    return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
}

/**
 * Does the straight line from `a` to `b` pass through the axis-aligned rect?
 *
 * Standard slab clip, exact — no sampling, so a thin chasm cannot be stepped
 * over by a coarse loop. Used to ask the only question that matters when
 * choosing a grapple peg: WOULD GOING THERE ACTUALLY CROSS THE GAP.
 */
export function segmentCrossesRect(a, b, r) {
    let t0 = 0;
    let t1 = 1;
    const axes = [
        [b.x - a.x, r.x0, r.x1, a.x],
        [b.z - a.z, r.z0, r.z1, a.z],
    ];
    for (const [d, lo, hi, o] of axes) {
        if (Math.abs(d) < 1e-9) {
            // Parallel to this slab: inside it for all t, or never.
            if (o < lo || o > hi) return false;
            continue;
        }
        let ta = (lo - o) / d;
        let tb = (hi - o) / d;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) return false;
    }
    return true;
}

/** Is the player aiming close enough at the anchor to grapple it? */
export function grappleAimOk(playerPos, facingVec, anchor, reach) {
    const dx = anchor.x - playerPos.x;
    const dz = anchor.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5 || d > reach) return false;
    const dot = (dx / d) * facingVec.x + (dz / d) * facingVec.z;
    return dot > 0.7;
}

/**
 * Where a boot-hop lands: mirrored across the ledge rect along the facing's
 * dominant axis. null when the player isn't up against the rect or isn't
 * moving into it.
 */
export function ledgeHopTarget(rect, p, facing) {
    const pad = 1.1;
    const near = p.x >= rect.x0 - pad && p.x <= rect.x1 + pad
        && p.z >= rect.z0 - pad && p.z <= rect.z1 + pad;
    if (!near) return null;
    const ax = Math.abs(facing.x) >= Math.abs(facing.z) ? 'x' : 'z';
    if (ax === 'x') {
        if (facing.x > 0 && p.x <= rect.x0) return { x: rect.x1 + pad, z: p.z };
        if (facing.x < 0 && p.x >= rect.x1) return { x: rect.x0 - pad, z: p.z };
    } else {
        if (facing.z > 0 && p.z <= rect.z0) return { x: p.x, z: rect.z1 + pad };
        if (facing.z < 0 && p.z >= rect.z1) return { x: p.x, z: rect.z0 - pad };
    }
    return null;
}

// ── Build-time half ────────────────────────────────────────────────────────

export function applyBlockerToMap(map, b) {
    if (b.type === 'grapple_gap') {
        // Carve the chasm: no floor voxels inside the rect
        for (let x = b.rect.x0; x <= b.rect.x1; x++) {
            for (let z = b.rect.z0; z <= b.rect.z1; z++) {
                map.delete(`${x},0,${z}`);
            }
        }
    } else if (b.type === 'boot_ledge') {
        fillBox(map, b.rect.x0, b.rect.x1, 1, 2, b.rect.z0, b.rect.z1,
            b.color || CRUST_COLORS.slateDark);
    }
    // wedge_crack builds its own destructible mesh; caster_dark builds its own
    // barrier at runtime too (it has to be droppable when the Caster is out).
    //
    // Every Phase E1 piece is runtime-only too, INCLUDING the vault's three
    // permanent walls, and that is not an implementation convenience. Puzzles
    // are authored from a table (see `puzzles.js`) and rooms place their own
    // pickups inside `onBake`, which runs after the room mesh is built — so a
    // vault baked into the mesh had already chosen its corner before anyone
    // knew what was standing there, and it buried a small key in beat 13 and a
    // suture in beat 14 on the first run. Built at runtime, after `onBake`, the
    // puzzle can look at the room and move.
}

// ── Runtime half ───────────────────────────────────────────────────────────

export function createBlockerRuntime(ctx, level, b, origin = { x: 0, z: 0 }) {
    const W = (local) => ({ x: origin.x + local.x, z: origin.z + local.z });
    const rectW = b.rect ? {
        x0: origin.x + b.rect.x0, x1: origin.x + b.rect.x1 + 1,
        z0: origin.z + b.rect.z0, z1: origin.z + b.rect.z1 + 1,
    } : null;
    const persistId = `blocker:${b.id}`;
    const isCleared = () => level.keyStore?.isOpen?.(persistId) === true;

    if (b.type === 'grapple_gap') {
        // Anchor posts: primary + optional reverse so the gap works both ways.
        // If reverseAnchor is omitted, mirror across the chasm rect on the
        // dominant axis so return trips (e.g. post-boss exit) still work.
        // Cleared gaps (keyStore `blocker:<id>`) get a permanent floor bridge
        // so boss-routed exits never softlock when grapple reach is tight.
        const posts = [];
        const anchorsLocal = [];
        if (b.anchor) anchorsLocal.push(b.anchor);
        if (b.reverseAnchor) {
            anchorsLocal.push(b.reverseAnchor);
        } else if (b.anchor && b.rect) {
            const rx = (b.rect.x0 + b.rect.x1) / 2;
            const rz = (b.rect.z0 + b.rect.z1) / 2;
            const dx = b.anchor.x - rx;
            const dz = b.anchor.z - rz;
            anchorsLocal.push({ x: rx - dx, z: rz - dz });
        }
        const seen = new Set();
        for (const a of anchorsLocal) {
            const key = `${Math.round(a.x)},${Math.round(a.z)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const aw = W(a);
            const postMap = new Map();
            fillBox(postMap, 0, 0, 1, 3, 0, 0, ABYSS_COLORS.goldVein);
            // Visual + grapple target only — no XZ solid so posts don't wall off
            // the rim (blocked return walks after placing reverse pegs).
            posts.push({
                local: a,
                world: aw,
                built: meshAndCollide(postMap, ctx.scene, null, {
                    origin: { x: aw.x, y: 0, z: aw.z },
                    solidPrefix: `blk:${b.id}:post:${key}`,
                }),
            });
        }
        const edgesLocal = [];
        if (b.edge) edgesLocal.push(b.edge);
        for (const a of anchorsLocal) edgesLocal.push(a);
        const edgesW = edgesLocal.map((e) => W(e));
        let bridge = null;
        let unsubVoxel = null;
        const ensureBridge = () => {
            if (bridge || !b.rect) return;
            const floorMap = new Map();
            fillBox(
                floorMap,
                b.rect.x0, b.rect.x1, 0, 0, b.rect.z0, b.rect.z1,
                b.bridgeColor || ABYSS_COLORS.basalt,
            );
            bridge = meshAndCollide(floorMap, ctx.scene, null, {
                origin: { x: origin.x, y: 0, z: origin.z },
                solidPrefix: `blk:${b.id}:bridge`,
            });
            // Physics feet query the dungeon composite getVoxelAt
            unsubVoxel = level.addVoxelQuery?.(bridge.getVoxelAt) || null;
        };
        if (isCleared()) ensureBridge();
        return {
            // Exposed so the FX layer can highlight anchors that are actually
            // in reach. A gold post looks like every other gold decoration in
            // the game, so the traversal layer stayed invisible until a
            // walkthrough told you where to stand.
            anchorPoints: posts.map((p) => ({ x: p.world.x, y: 1, z: p.world.z })),
            update(dt, game) {
                const player = game.player;
                const p = player.root.position;
                // Bridged after clear (e.g. Hydroid defeated) — walkable floor
                if (isCleared()) {
                    ensureBridge();
                    return;
                }
                // Fall catch → nearest rim
                if (insideRect(p, rectW) && p.y < 1.2 && !player.grapple.active) {
                    let best = edgesW[0] || { x: p.x, z: p.z };
                    let bestD = Infinity;
                    for (const e of edgesW) {
                        const d = Math.hypot(p.x - e.x, p.z - e.z);
                        if (d < bestD) { bestD = d; best = e; }
                    }
                    // The rim is not always at floor height — several of these
                    // gaps are cut through terraced ground, and fishing the
                    // player out at a flat 1.95 dropped them from the chasm
                    // straight into the ledge beside it.
                    player.rig.position.set(
                        best.x, level.groundY?.(best.x, best.z) ?? 1.95, best.z);
                    player.physics.resetVelocity();
                    player.physics.grounded = true;
                    player.health.damage(1, 0.6, 'environment');
                    game.hud?.toast?.('The gap bites — grapple the copper pegs (G)', 1400);
                    return;
                }
                if (player.grapple.active) return;
                const reach = (player.grappleRange || 8) + 2;
                const hasGrapple = player.inventory.hasItem('magnetic_grapple');
                let bestTarget = null;
                let bestDot = 0.7;
                let bestDist = Infinity;
                for (const post of posts) {
                    // Land short of the post solid so the pull is not cancelled.
                    const raw = {
                        x: post.world.x + 0.5,
                        y: p.y,
                        z: post.world.z + 0.5,
                    };
                    const dx0 = raw.x - p.x;
                    const dz0 = raw.z - p.z;
                    const d0 = Math.hypot(dx0, dz0) || 1;
                    if (d0 < 1.6 || d0 > reach + 1.5) continue;
                    // A PEG ON YOUR OWN SIDE IS NOT A DESTINATION.
                    //
                    // Owner report: "standing next to the gold pillar in the
                    // wall and hitting G locks onto the gold pillar in the
                    // wall, not the one across the gap." Measured in windworks
                    // — chasm at world z −70..−66, authored peg at z −65 and a
                    // mirrored one at z −72 — standing at z −74 facing south
                    // and pressing G moved the player 1.60 units, to z −72.4.
                    // Onto the peg they were already stood beside.
                    //
                    // The selection only asked WHICH PEG AM I AIMED MOST
                    // SQUARELY AT. Both pegs sit on the same axis, so both
                    // scored a dot of 1.0, and `dot >= bestDot` handed the tie
                    // to whichever was last in the array — the mirrored one,
                    // which on the return trip is the near one. Tuning the
                    // 1.6 minimum would only move the distance at which the
                    // wrong answer starts being given.
                    //
                    // The right question is geometric and needs no constant: a
                    // grapple across a chasm exists to put you on the OTHER
                    // SIDE, so the line to the peg must pass through the
                    // chasm. That is symmetric, so the return trip works by
                    // the same rule, and it cannot be fooled by facing.
                    //
                    // Falls through when the blocker declares no rect: there is
                    // then no gap to be on the wrong side of, and refusing
                    // every peg would make such a blocker uncrossable.
                    if (rectW && !segmentCrossesRect(p, raw, rectW)) continue;
                    const target = {
                        x: p.x + dx0 * ((d0 - 1.2) / d0),
                        y: p.y,
                        z: p.z + dz0 * ((d0 - 1.2) / d0),
                    };
                    if (!grappleAimOk(p, player.state.facingVec, raw, reach + 1.5)) continue;
                    const dx = target.x - p.x;
                    const dz = target.z - p.z;
                    const d = Math.hypot(dx, dz) || 1;
                    const dot = (dx / d) * player.state.facingVec.x
                        + (dz / d) * player.state.facingVec.z;
                    // Ties are decided by DISTANCE, not by array order.
                    //
                    // `dot >= bestDot` let the last post in the list win any
                    // tie, and on a straight two-peg gap every candidate scores
                    // 1.0 — so the choice was made by the order `anchorsLocal`
                    // happened to be built in. With the crossing test above,
                    // every survivor is genuinely across; the nearest of them is
                    // the near edge of the far side, which is where a player
                    // aiming across a gap means to land.
                    if (dot > bestDot + 1e-6
                        || (Math.abs(dot - bestDot) <= 1e-6 && d0 < bestDist)) {
                        bestDot = Math.max(bestDot, dot);
                        bestDist = d0;
                        bestTarget = target;
                    }
                }
                if (bestTarget && game.input?.consumeGrapple?.()) {
                    if (!hasGrapple) {
                        game.hud?.toast?.('Needs the Magnetic Grapple', 1200);
                        return;
                    }
                    // `stopShort: 0` — `bestTarget` above is ALREADY the landing
                    // spot, trimmed 1.2 back from the post so the pull is not
                    // cancelled against it. Letting the controller apply its own
                    // 0.8 on top was the same correction twice, and it put the
                    // player down inside the chasm they were crossing.
                    player.grapple.start(p, bestTarget, Math.max(14, reach + 2), {
                        stopShort: 0,
                        canStand: level.canStand
                            ? (x, z) => level.canStand(x, z)
                            : undefined,
                    });
                    sfx.whoosh?.();
                }
            },
            dispose() {
                for (const post of posts) post.built.dispose();
                try { unsubVoxel?.(); } catch (_) {}
                try { bridge?.dispose(); } catch (_) {}
            },
        };
    }

    if (b.type === 'wedge_crack') {
        if (isCleared()) return null;
        const crackMap = new Map();
        fillBox(crackMap, 0, b.w || 2, 1, b.h || 2, 0, 0, b.color || CRUST_COLORS.rust);
        const pos = W(b.at);
        const dest = new DestructibleVoxelMesh(
            crackMap,
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
            ctx.particles,
            ctx.collisionWorld,
            `blk:${b.id}:crack`,
            { origin: { x: pos.x, y: 0.5, z: pos.z }, scene: ctx.scene, voxelSize: 0.5 }
        );
        // Weapon filter: only Tectonic Wedge damage breaks the crack
        const wrapper = {
            shatterAtWorld(x, y, z, r) {
                // WHERE BEFORE WHAT.
                //
                // The weapon check used to run first, and toast on failure,
                // without ever asking whether the blow had landed anywhere near
                // this crack. `player.js` walks EVERY destructible in the level
                // on every swing that shatters, and rooms are prebaked — so one
                // mallet swing anywhere in a dungeon containing a crack
                // announced "Too dense" from across the map. The owner first
                // noticed it in 08 and it had been happening since 06, which is
                // simply the first beat where they held the mallet and a crack
                // existed at the same time.
                //
                // `nearestVoxelToWorld` is the same search `shatterAtWorld`
                // uses to decide where to break, so the message now fires under
                // exactly the condition that makes it true: the wedge, swung
                // from here, WOULD have worked. Anywhere else the crack is not
                // being addressed and has nothing to say.
                if (!dest.nearestVoxelToWorld(x, y, z)) return 0;
                const active = ctx.player?.inventory?.activeWeapon;
                if (active !== 'tectonic_wedge') {
                    level._game?.hud?.toast?.('Too dense — needs the Tectonic Wedge', 1200);
                    return 0;
                }
                const n = dest.shatterAtWorld(x, y, z, Math.max(r, 3));
                if (n > 0) {
                    level.keyStore?.open?.(persistId);
                    sfx.shatter?.();
                }
                return n;
            },
        };
        level.destructibles.push(wrapper);
        return {
            update() {},
            dispose() {
                const i = level.destructibles.indexOf(wrapper);
                if (i >= 0) level.destructibles.splice(i, 1);
                dest.dispose();
            },
        };
    }

    if (b.type === 'boot_ledge') {
        let promptCooldown = 0;
        return {
            update(dt, game) {
                const player = game.player;
                promptCooldown = Math.max(0, promptCooldown - dt);
                if (player.dashTimer <= 0) return;
                if (!player.inventory.hasItem('phase_boot')) {
                    if (promptCooldown <= 0) {
                        promptCooldown = 1.5;
                        game.hud?.toast?.('Needs the Phase Boot', 1200);
                        game.anchorThread?.failed?.(`ledge:${b.id || 'phase'}`,
                            'SYSTEM: Acquire the Phase Boot before crossing this dash seam.');
                    }
                    return;
                }
                const p = player.root.position;
                const local = { x: p.x - origin.x, z: p.z - origin.z };
                const hop = ledgeHopTarget(
                    { x0: b.rect.x0, x1: b.rect.x1 + 1, z0: b.rect.z0, z1: b.rect.z1 + 1 },
                    local, player.state.facingVec
                );
                if (hop) {
                    // Clear of the far side's ground, not of a floor at y=1.
                    // 2.6 was "one cell of air above the only floor there was";
                    // over a terrace it is a cell of rock.
                    const hx = origin.x + hop.x, hz = origin.z + hop.z;
                    const gy = level.groundY?.(hx, hz);
                    player.rig.position.set(hx, Math.max(2.6, (gy ?? 1.95) + 0.65), hz);
                    player.physics.resetVelocity();
                    player.physics.grounded = false; // land on the far side
                    player.dashTimer = 0;
                    sfx.dash?.();
                }
            },
            dispose() {},
        };
    }

    if (b.type === 'caster_dark') {
        const shroud = new THREE.Mesh(
            new THREE.PlaneGeometry(rectW.x1 - rectW.x0, rectW.z1 - rectW.z0),
            new THREE.MeshBasicMaterial({
                color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false,
            })
        );
        shroud.rotation.x = -Math.PI / 2;
        shroud.position.set((rectW.x0 + rectW.x1) / 2, 2.4, (rectW.z0 + rectW.z1) / 2);
        ctx.scene.add(shroud);

        // THE SHROUD HAS TO STOP YOU, or the Light Caster gates nothing.
        //
        // This was a plane and an opacity lerp: no solid, no signal, and
        // `applyBlockerToMap` skips the type, so all eight authored instances
        // were decoration. Beat 04's `aerie` shroud is the clearest cost — the
        // Scar Suture behind it is collected by the room-graph proximity check
        // whether or not you own the Caster, so a permanent health upgrade was
        // free, and the item text promises the opposite: "burns back the dark
        // patches that block the way."
        //
        // So the dark is a real 2-high barrier, raised and dropped exactly like
        // `timed_gate`'s, and the Caster is what drops it.
        // A SHELL, NOT A PLUG. Filling the rect solid is the obvious reading of
        // "the dark blocks the way" and it is wrong: every authored shroud has
        // the reward sitting INSIDE its rect, so a solid fill buries the thing
        // the shroud exists to guard. pickup-reachability and world-life both
        // called it immediately — four rewards entombed across beats 04, 06,
        // 09 and 12. Wall the perimeter and leave the middle hollow: you cannot
        // reach in while it stands, and the prize is untouched when it drops.
        const darkMap = new Map();
        const { x0, x1, z0, z1 } = b.rect;
        const darkColor = b.color || 0x0a0a12;
        fillBox(darkMap, x0, x1, 1, 2, z0, z0, darkColor); // north face
        fillBox(darkMap, x0, x1, 1, 2, z1, z1, darkColor); // south face
        fillBox(darkMap, x0, x0, 1, 2, z0, z1, darkColor); // west face
        fillBox(darkMap, x1, x1, 1, 2, z0, z1, darkColor); // east face
        let built = null;
        let unsub = null;
        const raise = () => {
            if (built) return;
            built = meshAndCollide(darkMap, ctx.scene, ctx.collisionWorld, {
                origin: { x: origin.x, y: 0, z: origin.z },
                solidPrefix: `blk:${b.id}:dark`,
            });
            unsub = level.addVoxelQuery?.(built.getVoxelAt) || null;
        };
        const drop = () => {
            if (!built) return;
            try { unsub?.(); } catch (_) {}
            unsub = null;
            built.dispose();
            built = null;
        };
        raise();

        // And the same net the timed gate carries: never re-raise into someone.
        // Walking in lit and then cycling off the Caster must not close a
        // 2-high wall on top of the player — that is the softlock this file
        // has already paid for once. The signal decides when the dark MAY
        // return; the player's position decides whether it does.
        const PAD = 0.55;
        const inTheWay = (game) => {
            const p = game?.player?.root?.position;
            if (!p) return false;
            const lx = p.x - origin.x, lz = p.z - origin.z;
            return lx >= b.rect.x0 - PAD && lx <= b.rect.x1 + 1 + PAD
                && lz >= b.rect.z0 - PAD && lz <= b.rect.z1 + 1 + PAD;
        };

        return {
            update(dt, game) {
                const p = game.player.root.position;
                const cx = shroud.position.x, cz = shroud.position.z;
                const near = Math.hypot(p.x - cx, p.z - cz) < 6;
                const lit = near && game.player.inventory.activeWeapon === 'light_caster';
                // SAY SO WHEN IT REFUSES.
                //
                // Reported from play as "black square prevents collection of
                // bottle in dungeon 6". It does, and that is the design — the
                // shroud is a real barrier and the Caster is what drops it —
                // but nothing in the game ever said which. A player standing in
                // front of it holding a mallet gets a black square, no reaction,
                // and a reward they can see and cannot take. `ui/coach.js` opens
                // by saying that a mechanic which can silently refuse input has
                // to be able to say so; this was the loudest violation left.
                //
                // Gated on OWNING the Caster: told before you have it, the line
                // is a spoiler for an item two dungeons away, and every shroud
                // in the game sits after beat 02 where it is granted.
                if (near && !lit && game.player.inventory.hasItem?.('light_caster')) {
                    coach('caster-dark',
                        'The dark will not burn back on its own. '
                        + 'Equip the Light Caster and stand in it.');
                }
                const target = lit ? 0 : 0.85;
                shroud.material.opacity += (target - shroud.material.opacity)
                    * Math.min(1, dt * 5);
                if (lit) {
                    if (built) {
                        drop();
                        gsfx.secretFound?.();
                    }
                } else if (!built && !inTheWay(game)) {
                    raise();
                }
            },
            dispose() {
                drop();
                if (shroud.parent) shroud.parent.remove(shroud);
                shroud.geometry.dispose();
                shroud.material.dispose();
            },
        };
    }

    // ── Phase E1: the puzzle kit ───────────────────────────────────────────
    //
    // Five primitives, and NONE of them is interesting alone. That is the
    // point: a plate on its own is a light switch, a gate on its own is a door,
    // and a block on its own is furniture. Plate + timed gate + block is a
    // complete Zelda puzzle, and the player is the one who assembles it.
    //
    // They talk through `level.signals`, never to each other. A plate does not
    // know what it opens and a gate does not know what holds it, which is why
    // any of them can be recombined without touching a line of this file.

    if (b.type === 'pushable') {
        const at = W(b.at);
        const spawn = { x: at.x, y: b.y != null ? b.y : 1.0, z: at.z };
        const block = new PushableBlock(
            spawn, b.size || 1.4, ctx.collisionWorld, ctx.scene,
            { id: `blk:${b.id}`, color: b.color || CRUST_COLORS.clay, mass: b.mass || 1 }
        );
        block.spawn = { ...spawn };
        block.canReset = true;
        block.spin = b.spin || 0;
        block.mirror = !!b.mirror;
        // Terraces and boss-arena shaping live in the platform map, which is
        // standable-but-not-solid on purpose. The collision world cannot see
        // them, so the block is told to ask the level directly. Sampled at the
        // height the block's own body occupies, not at the floor.
        block.blocked = (x, z) => !!level.getVoxelAt?.(x, spawn.y, z);
        if (b.mirror) block.mesh.material.color.setHex(0xbfe8ff);
        // Registered on the LEVEL, not held privately, because plates, sockets
        // and beams all need to see every block in the room and none of them
        // should have to be told about each one.
        (level.puzzleBlocks || (level.puzzleBlocks = [])).push(block);

        let cool = 0;
        return {
            block,
            update(dt, game) {
                cool = Math.max(0, cool - dt);
                const player = game.player;
                const p = player.root.position;

                // THE RESET. Walk out of the room and everything goes back
                // where it started. This is the entire softlock answer, and it
                // is a rule rather than a special case: there is no arrangement
                // of blocks, walls and corners that survives leaving the room.
                const d = Math.hypot(p.x - origin.x, p.z - origin.z);
                if (d > (b.roomHalf || 12) + PUZZLE_RESET_AT) {
                    if (block.position.x !== block.spawn.x
                        || block.position.z !== block.spawn.z) {
                        block.position.x = block.spawn.x;
                        block.position.z = block.spawn.z;
                        block.mesh.position.set(block.spawn.x, block.spawn.y, block.spawn.z);
                        block._registerSolid();
                    }
                    return;
                }

                if (cool > 0 || player.dashTimer > 0) return;
                const mv = game.input?.moveVector?.() || { x: 0, z: 0 };
                if (!mv.x && !mv.z) return;
                const len = Math.hypot(mv.x, mv.z) || 1;
                const dir = { x: mv.x / len, z: mv.z / len };
                if (block.tryPush(p, dir, PUSH_STEP)) {
                    cool = 0.18;
                    sfx.heave?.();
                }
            },
            dispose() {
                const list = level.puzzleBlocks || [];
                const i = list.indexOf(block);
                if (i >= 0) list.splice(i, 1);
                block.dispose();
            },
        };
    }

    if (b.type === 'pressure_plate') {
        const at = W(b.at);
        const r = b.r != null ? b.r : 1.1;
        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r, 0.12, 20),
            new THREE.MeshStandardMaterial({
                color: 0x8a6830, emissive: 0x2a1c08, roughness: 0.8,
            })
        );
        disc.position.set(at.x, 1.06, at.z);
        ctx.scene.add(disc);
        const plate = { at, r, accepts: b.accepts };
        let was = false;
        return {
            update(dt, game) {
                const held = plateHeld(plate, {
                    player: game.player.root.position,
                    blocks: level.puzzleBlocks || [],
                    enemies: level.enemies || [],
                });
                // Named source: a plate and a switch may hold the same signal,
                // and before this the one that updated last simply overwrote
                // the other.
                level.signals?.set(b.signal, held, b.id);
                if (held !== was) {
                    was = held;
                    disc.position.y = held ? 1.0 : 1.06;
                    disc.material.emissive.setHex(held ? 0xffd060 : 0x2a1c08);
                    gsfx.doorOpen?.();
                }
            },
            dispose() {
                if (disc.parent) disc.parent.remove(disc);
                disc.geometry.dispose();
                disc.material.dispose();
            },
        };
    }

    if (b.type === 'block_socket') {
        const at = W(b.at);
        const r = b.r != null ? b.r : 1.0;
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(r * 0.62, r, 24),
            new THREE.MeshBasicMaterial({
                color: 0xffd060, transparent: true, opacity: 0.55,
                side: THREE.DoubleSide, depthWrite: false,
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(at.x, 1.03, at.z);
        ctx.scene.add(ring);
        const socket = { at, r, blockId: b.blockId ? `blk:${b.blockId}` : null };
        // A filled socket LATCHES. The block can be shoved out afterwards and
        // the door it opened stays open — a reward you have already earned must
        // not be taken back by the furniture.
        if (isCleared()) level.signals?.latch(b.signal);
        let done = isCleared();
        return {
            update() {
                if (done) return;
                if (!socketFilled(socket, level.puzzleBlocks || [])) return;
                done = true;
                level.signals?.latch(b.signal);
                level.keyStore?.open?.(persistId);
                ring.material.opacity = 0.9;
                ring.material.color.setHex(0x9affc0);
                gsfx.secretFound?.();
            },
            dispose() {
                if (ring.parent) ring.parent.remove(ring);
                ring.geometry.dispose();
                ring.material.dispose();
            },
        };
    }

    if (b.type === 'switch') {
        const at = W(b.at);
        const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 1.3, 0.5),
            new THREE.MeshStandardMaterial({
                color: 0x8a8478, emissive: 0x201810, roughness: 0.7,
            })
        );
        post.position.set(at.x, 1.65, at.z);
        ctx.scene.add(post);
        let hold = 0;
        // A switch is STRUCK, not interacted with — it rides the destructible
        // list, which is the one channel every weapon already routes a swing
        // through. Charged strikes, dash-attacks and the ray all reach it for
        // free, and none of them had to be told a switch exists.
        const target = {
            // The opt-in. `weapon.shatter` gates the ordinary destructible loop
            // and is true of exactly two weapons, so without this a player
            // holding the Anchor Link or the Light Caster could not work a
            // switch at all — and switches are the whole puzzle vocabulary of
            // the seven even-numbered dungeons. Ore does not opt in, and keeps
            // needing the Wedge or the Mallet, which is what those are for.
            struckByAnything: true,
            shatterAtWorld(x, y, z) {
                if (Math.hypot(x - at.x, z - at.z) > 2.0) return 0;
                hold = b.hold != null ? b.hold : GATE_HOLD;
                post.material.emissive.setHex(0xffd060);
                gsfx.keyGet?.();
                return 1;
            },
        };
        level.destructibles.push(target);
        return {
            update(dt) {
                if (hold > 0) {
                    hold -= dt;
                    if (hold <= 0) {
                        hold = 0;
                        post.material.emissive.setHex(0x201810);
                    }
                }
                level.signals?.set(b.signal, hold > 0, b.id);
            },
            dispose() {
                const i = level.destructibles.indexOf(target);
                if (i >= 0) level.destructibles.splice(i, 1);
                if (post.parent) post.parent.remove(post);
                post.geometry.dispose();
                post.material.dispose();
            },
        };
    }

    if (b.type === 'timed_gate') {
        // Built and torn down at runtime rather than baked, because a gate that
        // lived in the room mesh could never open.
        const gateMap = new Map();
        fillBox(gateMap, b.rect.x0, b.rect.x1, 1, 2, b.rect.z0, b.rect.z1,
            b.color || 0x6a5426);
        let built = null;
        let unsub = null;
        const raise = () => {
            if (built) return;
            built = meshAndCollide(gateMap, ctx.scene, ctx.collisionWorld, {
                origin: { x: origin.x, y: 0, z: origin.z },
                solidPrefix: `blk:${b.id}:gate`,
            });
            unsub = level.addVoxelQuery?.(built.getVoxelAt) || null;
        };
        const drop = () => {
            if (!built) return;
            try { unsub?.(); } catch (_) {}
            unsub = null;
            built.dispose();
            built = null;
        };
        raise();
        // THE GATE MUST NOT CLOSE ON THE PLAYER, and this is a softlock rather
        // than an annoyance. The vault behind it is a one-cell alcove with three
        // permanent walls; a gate that re-raises while the player is inside
        // seals them into a box with no exit, no reset (the block reset only
        // fires when you LEAVE the room, which you now cannot) and nothing to
        // hit. On the switch-led beats — every even-numbered dungeon — the
        // sequence is simply "hit the switch, walk in, take the cache, wait six
        // seconds", which is what taking a cache looks like.
        //
        // So the signal decides when the gate MAY close and the player's
        // position decides whether it does. Nothing here can hold it shut: a
        // gate that stays open one beat longer than it should is a slightly
        // easier puzzle, and this file has already taken that trade twice.
        const clear = b.clear || b.rect;
        // A CELL RECT'S WORLD SPAN IS [x0, x1 + 1], AND THE PLAYER IS NOT A POINT.
        //
        // The first version tested `lx >= clear.x0 - 1 && lx <= clear.x1 + 1`,
        // which reads as "a cell of slack either side" and is not: `x1 + 1` is the
        // footprint's exact world edge, so the low side got 1.0 of margin and the
        // high side got **zero**. Add a 0.4 body to that and the gate raised into
        // people. A hero at local z −2.9 is outside `lz <= z1 + 1` (−3) while
        // their body spans −3.3 to −2.5 and overlaps the gate's own cell
        // [−4, −3] by 0.3.
        //
        // What that cost: the gate came up underneath them and lifted them two
        // cells onto its roof, they slid off the inner side into the alcove, and
        // the alcove's walls are two high against a one-cell step. The plate that
        // opens it was outside, with them sealed in. Reproduced live —
        // `tearwell`, feet at y 2.99 on a gate whose top is y 3, grounded false.
        // This is the "stuck in a locked spot" of three play reports.
        const PAD = 0.55;
        const box = (p, pad) => {
            const lx = p.x - origin.x;
            const lz = p.z - origin.z;
            return lx >= clear.x0 - pad && lx <= clear.x1 + 1 + pad
                && lz >= clear.z0 - pad && lz <= clear.z1 + 1 + pad;
        };
        const playerAt = (game) =>
            game?.player?.root?.position || game?.player?.rig?.position || null;
        const inTheWay = (game) => {
            const p = playerAt(game);
            return !!p && box(p, PAD);
        };
        // AND THE NET UNDER ALL OF IT: never hold someone in.
        //
        // `inTheWay` only stops the gate CLOSING. It has nothing to say about a
        // player who is already behind a closed one — and there the old code did
        // nothing at all, which is precisely the state that does not recover:
        // signal off, player inside, so neither branch ran and the gate stayed up
        // for good. A player inside the footprint opens it, full stop. A gate that
        // is open one beat longer than it should be is a slightly easier puzzle,
        // which is a trade this file has already taken twice.
        const behindIt = (game) => {
            const p = playerAt(game);
            return !!p && box(p, 0);
        };
        return {
            get raised() { return !!built; },
            update(dt, game) {
                const open = !!level.signals?.get(b.signal);
                if (open || behindIt(game)) drop();
                else if (!inTheWay(game)) raise();
            },
            dispose() { drop(); },
        };
    }

    if (b.type === 'beam_source') {
        const at = W(b.at);
        const dir = b.dir || { x: 1, z: 0 };
        const emitter = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.9, 0.6),
            new THREE.MeshStandardMaterial({
                color: 0xbfe8ff, emissive: 0x60b0ff, emissiveIntensity: 1.6,
            })
        );
        emitter.position.set(at.x, 1.5, at.z);
        ctx.scene.add(emitter);
        // Segments are rebuilt only when the path actually changes shape. A
        // beam re-meshed every frame is sixty allocations a second for a
        // picture that is usually identical to the last one.
        const segs = [];
        let sig = '';
        const clearSegs = () => {
            for (const s of segs) {
                if (s.parent) s.parent.remove(s);
                s.geometry.dispose();
                s.material.dispose();
            }
            segs.length = 0;
        };
        return {
            update() {
                const targets = level.beamTargets || [];
                const res = traceBeam({ at, dir }, {
                    mirrors: (level.puzzleBlocks || []).filter((k) => k.mirror),
                    targets,
                    isSolid: (x, z) => !!level.getVoxelAt?.(x, 1.4, z),
                    maxDist: b.range || 30,
                });
                const key = res.path.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join('|');
                if (key !== sig) {
                    sig = key;
                    clearSegs();
                    for (let i = 0; i < res.path.length - 1; i++) {
                        const a = res.path[i], c = res.path[i + 1];
                        const len = Math.hypot(c.x - a.x, c.z - a.z);
                        if (len < 0.05) continue;
                        const m = new THREE.Mesh(
                            new THREE.BoxGeometry(len, 0.1, 0.1),
                            new THREE.MeshBasicMaterial({
                                color: 0xbfe8ff, transparent: true, opacity: 0.75,
                                depthWrite: false,
                            })
                        );
                        m.position.set((a.x + c.x) / 2, 1.5, (a.z + c.z) / 2);
                        m.rotation.y = Math.atan2(-(c.z - a.z), c.x - a.x);
                        ctx.scene.add(m);
                        segs.push(m);
                    }
                }
                for (const tg of targets) {
                    tg.lit = res.hit === tg;
                    level.signals?.set(tg.signal, tg.lit, b.id);
                }
            },
            dispose() {
                clearSegs();
                if (emitter.parent) emitter.parent.remove(emitter);
                emitter.geometry.dispose();
                emitter.material.dispose();
            },
        };
    }

    if (b.type === 'beam_target') {
        const at = W(b.at);
        const lens = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.55, 0.9, 16),
            new THREE.MeshStandardMaterial({
                color: 0x506070, emissive: 0x101820, emissiveIntensity: 1,
            })
        );
        lens.position.set(at.x, 1.5, at.z);
        ctx.scene.add(lens);
        const tg = { at, r: b.r != null ? b.r : 0.9, signal: b.signal, lit: false };
        (level.beamTargets || (level.beamTargets = [])).push(tg);
        // A lit lens LATCHES, exactly as a filled socket does. Beat 12's exam is
        // the beam and every other dungeon's is the socket, and the socket has
        // always latched — "the exam is the one puzzle whose answer stays
        // answered" is this file's own stated rule and the lens was the one
        // piece that did not follow it. Without this, shoving the mirror back
        // off the beam takes the reward away again.
        if (isCleared()) {
            tg.lit = true;
            level.signals?.latch(b.signal);
        }
        let was = false;
        return {
            update() {
                if (tg.lit && !isCleared()) {
                    level.signals?.latch(b.signal);
                    level.keyStore?.open?.(persistId);
                }
                if (tg.lit !== was) {
                    was = tg.lit;
                    lens.material.emissive.setHex(tg.lit ? 0xbfe8ff : 0x101820);
                    if (tg.lit) gsfx.secretFound?.();
                }
            },
            dispose() {
                const list = level.beamTargets || [];
                const i = list.indexOf(tg);
                if (i >= 0) list.splice(i, 1);
                if (lens.parent) lens.parent.remove(lens);
                lens.geometry.dispose();
                lens.material.dispose();
            },
        };
    }

    if (b.type === 'vault') {
        // Three permanent walls of a reward alcove; the fourth side is a
        // `timed_gate` and is what the puzzle opens.
        //
        // Alcoves rather than gates across corridors, and that is a deliberate,
        // load-bearing decision. A gate across a route has to know the route is
        // not the only way to a door. Get an alcove wrong and the player misses
        // a pickup. Get a corridor gate wrong and the run is over.
        const { x0, x1, z0, z1 } = b.rect;
        const c = b.color || CRUST_COLORS.slateDark;
        const open = b.open || 'S';
        const vmap = new Map();
        // THE MOUTH IS THREE CELLS WIDE, NOT ONE.
        //
        // The side walls used to run the alcove's full depth, so they met the
        // open side and pinched the doorway down to the single middle cell. The
        // hero's collision half-extent is 0.4, so getting in meant threading a
        // 1.0 gap with 0.10 of clearance either side — the tightest doorway in
        // the game, by a factor of about five, guarding every reward alcove in
        // the campaign. The owner's report was "the side rooms ... too close to
        // what we are unlocking to be able to get in", and every cell-level
        // check in the puzzle probes passed the whole time: each of those cells
        // WAS empty and reachable. None of them asked how much room a body has.
        //
        // Stopping the side walls one cell short opens the full three-cell face.
        // The gate already spans that whole row, so a closed vault is exactly as
        // closed as it ever was.
        const wz0 = open === 'N' ? z0 + 1 : z0;
        const wz1 = open === 'S' ? z1 - 1 : z1;
        const wx0 = open === 'W' ? x0 + 1 : x0;
        const wx1 = open === 'E' ? x1 - 1 : x1;
        // AND ONE SIDE WALL IS NOT BUILT AT ALL.
        //
        // `flush` names the side the alcove is already backed against — the room's
        // own perimeter wall, one cell outside the footprint. A wall built there
        // seals nothing, and it costs the entire interior: the side walls stand on
        // the outermost columns, so with both up a three-wide alcove encloses a
        // ONE-CELL space. Widening the mouth above only fixed the door; the room
        // behind it was still a 1.0 slot around a 0.8 body.
        //
        // Omitting it makes the interior two cells wide. Nothing opens up that was
        // not already closed, because the perimeter is still there.
        const flush = b.flush || null;
        if (open !== 'N') fillBox(vmap, wx0, wx1, 1, 2, z0, z0, c);
        if (open !== 'S') fillBox(vmap, wx0, wx1, 1, 2, z1, z1, c);
        if (open !== 'W' && flush !== 'W') fillBox(vmap, x0, x0, 1, 2, wz0, wz1, c);
        if (open !== 'E' && flush !== 'E') fillBox(vmap, x1, x1, 1, 2, wz0, wz1, c);
        const walls = meshAndCollide(vmap, ctx.scene, ctx.collisionWorld, {
            origin: { x: origin.x, y: 0, z: origin.z },
            solidPrefix: `blk:${b.id}:vault`,
        });
        const unsub = level.addVoxelQuery?.(walls.getVoxelAt) || null;
        return {
            update() {},
            dispose() {
                try { unsub?.(); } catch (_) {}
                walls.dispose();
            },
        };
    }

    return null;
}
