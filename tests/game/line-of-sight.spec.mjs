// tests/game/line-of-sight.spec.mjs — attacks stop at walls.
//
// What this covers: until now nothing in combat held a reference to the world.
// `hitboxCheck` took two positions and a move, so no attack in the game — the
// player's or a boss's — could consider a wall. `HANDOFF.md` recorded the
// symptom from the telegraph captures: `player-caster-lance.png` shows the beam
// leaving the player, crossing the room's east wall and continuing out of
// frame. The drawing and the hit agreed with each other, about something that
// went through walls.
//
// The two assertions with teeth are the ones about the DEFAULT. Sight fails
// open — with no world query the answer is "clear" — because several thousand
// assertions in this suite build a boss with no level attached, and a module
// that answered "blocked" would switch combat off in all of them while every
// one still passed. That makes "the wire is actually connected" the thing worth
// testing, so it is tested twice: every dungeon supplies the query, and
// `attachBoss` hands it to the boss.

import * as THREE from 'three';
import fs from 'node:fs';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { hitboxCheck } from '../../src/combat/hitbox.js';
import {
    hasLineOfSight, sightHit, sightBetweenBodies, levelHasSight,
    LOS_STEP, LOS_MARGIN,
} from '../../src/combat/line-of-sight.js';

/** A world with one wall: the slab 4 <= x < 5, at every y and z. */
const oneWall = (x) => x >= 4 && x < 5;

const body = (x, y, z, hitRadius = 0.4) => ({
    root: { position: { x, y, z } },
    state: { facingVec: { x: 1, z: 0 }, current: 'IDLE' },
    hitRadius,
});

function buildLevel(meta) {
    return meta.load({
        scene: new THREE.Scene(),
        collisionWorld: new CollisionWorld(),
        particles: { spawn() {}, burst() {}, update() {} },
        player: { root: { position: { x: 0, y: 0, z: 0 } } },
        camera: new THREE.PerspectiveCamera(),
        renderer: null,
    });
}

export function run(t) {
    // ── 1. The sampler, against geometry whose answer is known exactly ──────
    const solidAt = (x) => oneWall(x);
    t.ok('a line that crosses a wall is blocked',
        hasLineOfSight(solidAt, { x: 0, y: 2, z: 0 }, { x: 8, y: 2, z: 0 }) === false);
    t.ok('…and one that stops short of it is not',
        hasLineOfSight(solidAt, { x: 0, y: 2, z: 0 }, { x: 3, y: 2, z: 0 }) === true);
    t.ok('…and one running parallel to it is not',
        hasLineOfSight(solidAt, { x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 9 }) === true);

    // The step has to be finer than the thinnest wall or it walks over one.
    // `VS` is 1, so a step of 1.0 can straddle a 1-unit slab and miss it.
    t.ok('the sampling step is finer than a one-voxel wall', LOS_STEP < 1,
        `${LOS_STEP}`);
    let missed = 0;
    for (let z = 0; z < 40; z++) {
        // Skewed lines, so samples land at varying offsets inside the slab.
        const to = { x: 8, y: 2, z: z * 0.37 };
        if (hasLineOfSight(solidAt, { x: 0, y: 2, z: 0 }, to)) missed++;
    }
    t.ok('…and it does not step over that wall at any angle', missed === 0,
        `${missed} of 40 skewed lines passed through a solid slab`);

    // ── 2. The margins, which are what stop a body occluding itself ─────────
    // Everything inside `margin` of either end is unsampled on purpose: bodies
    // routinely touch geometry at their own edges, and a blow that stops
    // working because the attacker is hugging a pillar reads as a broken weapon.
    t.ok('a body standing against a wall can still be seen',
        hasLineOfSight(solidAt, { x: 3.7, y: 2, z: 0 }, { x: 3.9, y: 2, z: 0 }) === true);
    t.ok('the margin is half a voxel, not a free pass through walls',
        LOS_MARGIN <= 0.5 && LOS_MARGIN > 0, `${LOS_MARGIN}`);
    // Two units apart across a wall is well past both margins and must block.
    t.ok('…but a wall between two separated bodies still blocks',
        hasLineOfSight(solidAt, { x: 3.0, y: 2, z: 0 }, { x: 6.0, y: 2, z: 0 }) === false);

    // ── 3. Fail-open is the documented default, and is deliberate ───────────
    t.ok('no world query means clear',
        hasLineOfSight(null, { x: 0, y: 2, z: 0 }, { x: 8, y: 2, z: 0 }) === true);
    t.ok('…and hitboxCheck without a world is exactly what it always was',
        hitboxCheck(body(0, 2, 0), body(2, 2, 0), { range: 4, depthTolerance: 1, vertical: 2 })
        === true);

    // ── 4. sightHit stops a projectile in the air, not inside the wall ──────
    const hit = sightHit(solidAt, { x: 0, y: 2, z: 0 }, { x: 8, y: 2, z: 0 }, { margin: 0 });
    t.ok('sightHit reports where the line met the wall', !!hit && hit.x < 4.001,
        hit ? `x=${hit.x.toFixed(2)}` : 'null');
    t.ok('…on the near side of it, so a burst is not buried',
        !!hit && !solidAt(hit.x), hit ? `solid at x=${hit.x.toFixed(2)}: ${solidAt(hit.x)}` : '');
    t.ok('…and returns null on a clear line',
        sightHit(solidAt, { x: 0, y: 2, z: 0 }, { x: 3, y: 2, z: 0 }) === null);

    // ── 5. A body-to-body line is LEVELLED, and the floor is not a wall ─────
    //
    // The regression this pins is the one that took all thirteen bosses in
    // `boss-reach-e2e` to a negative band on the first build: a root position is
    // a mesh origin, not an eye. The Sand Spur's is at y 0.6 and the floor's
    // surface is y 1.0, so a line from the player's chest to that root arrives
    // THROUGH THE GROUND. Levelled to the higher body, it does not.
    const floor = (x, y) => y < 1;              // solid everywhere below y=1
    t.ok('a raw line to a low root dives into the floor',
        hasLineOfSight(floor, { x: 0, y: 1.95, z: 0 }, { x: 3, y: 0.6, z: 0 }) === false);
    t.ok('…and the body-to-body line does not',
        sightBetweenBodies(floor, { x: 0, y: 1.95, z: 0 }, { x: 3, y: 0.6, z: 0 }) === true);
    t.ok('…while still blocking on a real wall',
        sightBetweenBodies((x, y) => oneWall(x) || y < 1,
            { x: 0, y: 1.95, z: 0 }, { x: 8, y: 0.6, z: 0 }) === false);

    // ── 6. hitboxCheck consults it, on both of its shapes ───────────────────
    const lane = { range: 9, depthTolerance: 1, vertical: 2 };
    const disc = { radial: true, range: 9, depthTolerance: 9, vertical: 2 };
    for (const [name, move] of [['a lane move', lane], ['a radial move', disc]]) {
        t.ok(`${name} lands through open air`,
            hitboxCheck(body(0, 2, 0), body(3, 2, 0), move, solidAt) === true);
        t.ok(`…and ${name} does not land through a wall`,
            hitboxCheck(body(0, 2, 0), body(7, 2, 0), move, solidAt) === false);
        // The same pair with no world: the wall is the only difference.
        t.ok(`…and it is the WALL doing it, not the reach`,
            hitboxCheck(body(0, 2, 0), body(7, 2, 0), move) === true);
    }

    // ── 7. The wire is connected: every dungeon answers ─────────────────────
    const beats = LEVELS.filter((l) => /^beat-/.test(l.id));
    const noSight = [];
    const noBossSight = [];
    let checkedBosses = 0;
    for (const meta of beats) {
        let level;
        try { level = buildLevel(meta); } catch (e) {
            t.ok(`${meta.id} bakes`, false, e.message);
            continue;
        }
        if (!levelHasSight(level)) noSight.push(meta.id);
        const boss = level.boss;
        if (boss) {
            checkedBosses++;
            const parts = boss.cores || [boss];
            for (const b of parts) if (typeof b.solidAt !== 'function') noBossSight.push(meta.id);
        }
    }
    t.ok('every dungeon supplies an occupancy query', noSight.length === 0,
        noSight.length ? noSight.join(', ') : `${beats.length} dungeons`);
    t.ok('…and attachBoss hands it to the boss', noBossSight.length === 0,
        noBossSight.length ? [...new Set(noBossSight)].join(', ') : `${checkedBosses} bosses`);

    // ── 7b. The other two wires, which nothing else can see ────────────────
    //
    // Read from SOURCE, and that is the point rather than a shortcut. Both of
    // these are a single optional argument, and the module they call fails open
    // — so dropping either one restores the old through-the-wall behaviour
    // while every behavioural assertion in this file still passes, because
    // those exercise the module directly. A counterfactual proved exactly that:
    // deleting the player's argument and disabling the bolt check both left the
    // suite green. An untested fix is a fix that will be undone.
    const playerSrc = fs.readFileSync('src/game/player.js', 'utf8');
    const sweeps = [...playerSrc.matchAll(/combatSweep\(([^)]*)\)/g)].map((m) => m[1]);
    const bare = sweeps.filter((args) => args.split(',').length < 4);
    t.ok('every player attack passes the world to its sweep',
        sweeps.length > 0 && bare.length === 0,
        `${sweeps.length} sweeps, ${bare.length} without a world` +
        (bare.length ? `: ${bare.join(' | ')}` : ''));

    const enemySrc = fs.readFileSync('src/game/enemy.js', 'utf8');
    t.ok('a bolt in flight consults the world',
        /if \(this\.getVoxelAt\)[\s\S]{0,400}?sightHit\(this\.getVoxelAt/.test(enemySrc),
        'no guarded sightHit against this.getVoxelAt in enemy.js');

    // ── 8. And it changes the answer in a real dungeon ──────────────────────
    //
    // The reported defect, measured: a caster lance is 16 units long and the
    // rooms are about 14 across, so from the spawn it leaves the room in almost
    // every direction. A 2-unit swing never meets a wall anywhere in the
    // campaign — which is why melee could go on ignoring the world for as long
    // as it did, and why turning sight on uniformly costs nothing at that reach.
    const level = buildLevel(LEVELS.find((l) => l.id === 'beat-12-pyre'));
    let shortClear = 0, longBlocked = 0;
    const s = level.spawn;
    for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const at = (r) => ({ x: s.x + Math.cos(a) * r, y: s.y, z: s.z + Math.sin(a) * r });
        if (hasLineOfSight(level.getVoxelAt, s, at(2))) shortClear++;
        if (!hasLineOfSight(level.getVoxelAt, s, at(16))) longBlocked++;
    }
    t.ok('a 2-unit swing is never blocked by the room', shortClear === 24,
        `${shortClear}/24 clear`);
    t.ok('…and a 16-unit lance no longer leaves it', longBlocked >= 18,
        `${longBlocked}/24 stopped by geometry`);
}
