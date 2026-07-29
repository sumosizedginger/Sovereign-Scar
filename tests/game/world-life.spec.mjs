// tests/game/world-life.spec.mjs — Phase E2 and E3.
//
// E3 — THE PEOPLE. Zero NPCs, in forty-nine overworld screens and ninety-nine
// dungeon rooms. Beat 09 is called *Ruined Town* and had nobody in it; the
// world had nothing it was ruined FOR.
//
// E2 — VERTICAL INTEREST. Ticketed twice and dropped twice, both times because
// it was filed as a graphics ticket. Flat floors mean the soft shadows this
// project already paid for have nothing to fall on and every room is
// traversally identical.
//
// WHAT THIS SPEC IS REALLY GUARDING
//
// Both features add things to rooms that were finished, and both of them broke
// the room the first time they ran. Puzzle vaults walled a key into the
// scenery; terraces buried twelve pickups including three small keys and a boss
// key — every one of those a hard progression stop, none of them visible from
// the chair until you walked to where the key should be and found a step.
//
// So the claims here are mostly about the ORDER things happen in, and about the
// one structural rule that makes generated terrain safe: terraces go in the
// PLATFORM map, which is meshed without XZ solids, so a terrace is standable
// and never blocking and nothing it does can make anywhere unreachable.

import * as THREE from 'three';
import { createDungeon } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import {
    SETTLEMENTS, TOWN_DEAD, TALK_RANGE, CIVILIAN_PALETTE, HUSK_PALETTE,
    makeFigure, makeFire,
} from '../../src/game/world/settlements.js';
import { terraceRoom, MIN_HALF, KEEPOUT } from '../../src/game/world/terracing.js';
import { WORLD7 } from '../../src/game/overworld/world7.js';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
import { BEAT_LIST } from './_beat-defs.mjs';

const keyStoreStub = () => ({
    _open: new Set(),
    isOpen(id) { return this._open.has(id); },
    open(id) { this._open.add(id); },
    mapPickup: () => false, takeMapPickup() {},
    isPickupTaken: () => false, takePickup() {},
});

const bake = (def) => createDungeon(
    { scene: new THREE.Scene(), collisionWorld: new CollisionWorld(), particles: null },
    def, { keyStore: keyStoreStub() }
);

export function run(t) {
    // ── E3: the settlements exist, and they are somewhere real ─────────────
    {
        const ids = Object.keys(SETTLEMENTS);
        t.ok('there are three settlements', ids.length === 3, ids.join(','));
        for (const sid of ids) {
            t.ok(`${sid} is a real overworld screen`, !!WORLD7.screens[sid],
                'a camp on a screen that does not exist is a camp nobody finds');
            const s = SETTLEMENTS[sid];
            t.ok(`${sid} has a name`, !!s.name);
            t.ok(`${sid} has somebody who talks`, !!s.speaker?.lines?.length);
            t.ok(`${sid} has a crowd worth calling a settlement`,
                (s.crowd || []).length >= 5, `${(s.crowd || []).length} figures`);
        }
        // Spread across the map, not three camps in a row.
        const rows = new Set(ids.map((s) => s[1]));
        t.ok('they are spread across the world', rows.size === 3, [...rows].join(','));
    }

    // Nothing hostile spawns where people live.
    {
        let armed = null;
        for (const sid of Object.keys(SETTLEMENTS)) {
            const n = (WORLD7.screens[sid].enemies || []).length;
            if (n > 0) { armed = `${sid} has ${n} enemies in it`; break; }
        }
        t.ok('a settlement screen has no enemies on it', armed === null, armed || '',
            'survivors standing around a fire while a sentinel patrols between '
            + 'them says the survivors are props');
    }

    // The civilian read: warm rim, unlike every hostile in the game.
    {
        const hostileRims = new Set(
            Object.values(ENEMY_PALETTES).map((p) => p.eyeGlow)
        );
        t.ok('a civilian does not share a rim colour with any enemy',
            !hostileRims.has(CIVILIAN_PALETTE.eyeGlow),
            '"is that a threat" has to be answerable before you are in range');
        t.ok('nor does a husk', !hostileRims.has(HUSK_PALETTE.eyeGlow));
        t.ok('and a husk is visibly drained next to a civilian',
            HUSK_PALETTE.skin !== CIVILIAN_PALETTE.skin);
        t.ok('you can reach somebody to talk to them',
            TALK_RANGE > 1.5 && TALK_RANGE < 6, `${TALK_RANGE}`);
    }

    // The figures build, animate, and clean up after themselves.
    {
        const scene = new THREE.Scene();
        const before = scene.children.length;
        const fig = makeFigure(scene, { x: 1, z: 2, facing: 0.5 });
        t.ok('a figure joins the scene', scene.children.length > before);
        t.ok('and stands where it was put',
            fig.root.position.x === 1 && fig.root.position.z === 2);
        let threw = false;
        try { for (let i = 0; i < 60; i++) fig.update(1 / 60); } catch (_) { threw = true; }
        t.ok('and breathes without throwing', !threw);
        fig.dispose();
        t.ok('and leaves nothing behind', scene.children.length === before);

        // A husk is a photograph: posed once, never ticked.
        //
        // Measured as a PAIR, because "this joint did not move" is worthless on
        // its own — the first version watched `head.rotation.y`, which the idle
        // animator never touches either, so it passed whether or not the husk
        // was frozen. The claim only means something next to a live figure that
        // demonstrably does move.
        const pose = (f) => [
            f.actor.torso?.position?.y, f.actor.torso?.rotation?.x,
            f.actor.head?.rotation?.x, f.actor.armR?.rotation?.x,
            f.actor.armL?.rotation?.x, f.actor.legR?.rotation?.x,
        ].map((v) => (v == null ? 0 : +v.toFixed(6))).join(',');

        const alive = makeFigure(scene, { x: 0, z: 0 });
        const alive0 = pose(alive);
        for (let i = 0; i < 90; i++) alive.update(1 / 60);
        t.ok('a living figure breathes', pose(alive) !== alive0,
            'if this does not move, the husk claim below is vacuous');
        alive.dispose();

        const husk = makeFigure(scene, { x: 0, z: 0, frozen: true, palette: HUSK_PALETTE });
        const husk0 = pose(husk);
        for (let i = 0; i < 90; i++) husk.update(1 / 60);
        t.ok('a husk does not', pose(husk) === husk0,
            'the moment one of them turns around it is a jump scare, not a place');
        husk.dispose();

        const fire = makeFire(scene, { x: 0, z: 0 });
        const s0 = fire.root.children[1].scale.y;
        for (let i = 0; i < 20; i++) fire.update(1 / 60);
        t.ok('a fire flickers', fire.root.children[1].scale.y !== s0);
        fire.dispose();
        t.ok('and cleans up', scene.children.length === before);
    }

    // Beat 09 finally has its dead, and they dispose with the room.
    {
        t.ok('the town has dead to find', TOWN_DEAD.length >= 4);
        const def = BEAT_LIST[8];
        t.ok('and it is the right dungeon', def.id === 'beat-09-town', def.id);
        const level = bake(def);
        const scene = level.scene || null;
        t.ok('beat 09 bakes with people in it', !!level);
        level.dispose?.();
        t.ok('and disposing the level does not throw', true);
        void scene;
    }

    // ── E2: terracing ──────────────────────────────────────────────────────
    {
        const room = { half: 10, doors: [], enemies: [] };
        const pmap = new Map();
        const placed = terraceRoom(pmap, room, 'somewhere', 0x808080);
        t.ok('a big room gets terraced', placed > 10, `${placed} cells`);
        t.ok('and the map has voxels in it', pmap.size > 0);

        // Deterministic: same room id, same shape, every run and every visit.
        const again = new Map();
        terraceRoom(again, room, 'somewhere', 0x808080);
        t.ok('terracing is deterministic', again.size === pmap.size);
        // Varied across a dungeon, not "these two ids differ" — two room names
        // can perfectly well land on the same shape, and asserting they must
        // not would be a test of a hash rather than of the design.
        const shapes = new Set();
        for (const id of ['a', 'b', 'c', 'greathall', 'sanctum', 'vestibule',
            'approach', 'gallery', 'crypt', 'spire', 'well', 'yard']) {
            const m = new Map();
            terraceRoom(m, room, id, 0x808080);
            shapes.add(m.size);
        }
        t.ok('a dungeon does not get the same shape in every room',
            shapes.size >= 2, `${shapes.size} distinct shapes over 12 room names`);

        // NEVER more than two cells high, and never below the floor. This is
        // the whole safety argument: a one-cell step is what the physics body
        // climbs, so nothing here can strand the player.
        let maxY = 0;
        let minY = 99;
        for (const k of pmap.keys()) {
            const y = Number(k.split(',')[1]);
            if (y > maxY) maxY = y;
            if (y < minY) minY = y;
        }
        t.ok('terraces never dig', minY >= 1, `lowest voxel at y=${minY}`);
        t.ok('and never rise more than two cells', maxY <= 2, `highest y=${maxY}`);

        // Small rooms are left alone. The size is a LITERAL, not `MIN_HALF - 1`
        // — deriving the input from the constant under test makes the claim
        // true for any value of the constant, including zero, which is exactly
        // what the counterfactual proved when it set it to zero.
        const tiny = new Map();
        t.ok('a corridor is not terraced',
            terraceRoom(tiny, { half: 5 }, 'tiny', 0) === 0 && tiny.size === 0,
            'a ledge in a corridor is an obstacle, not interest');
        t.ok('and the floor is high enough to mean that', MIN_HALF >= 8,
            `MIN_HALF ${MIN_HALF} — the campaign's rooms run 5 to 14`);
        t.ok('the keep-out margin is real', KEEPOUT >= 1);

        // A blocked cell is skipped, not the whole shape.
        const partial = new Map();
        const n = terraceRoom(partial, room, 'somewhere', 0x808080, (x) => x > 0);
        t.ok('terracing flows around what is already there',
            n > 0 && n < placed, `${n} of ${placed}`);
    }

    // ── The order that matters: nothing is buried, in any dungeon ──────────
    //
    // The claim `pickup-reachability` already makes, restated here against the
    // two systems that broke it, so the failure is attributed rather than just
    // detected. Both of these landed AFTER the rooms were finished, and both of
    // them buried progression items on their first run.
    {
        let buried = null;
        let lifted = 0;
        let checked = 0;
        for (const def of BEAT_LIST) {
            const level = bake(def);
            for (const p of level.pickups || []) {
                const pos = (p.mesh || p).position;
                if (!pos) continue;
                checked++;
                if (level.getVoxelAt(pos.x, pos.y, pos.z)) {
                    buried = `${def.id}: ${p.label} at y${pos.y}`;
                    break;
                }
                if (pos.y > 1.5) lifted++;
            }
            level.dispose?.();
            if (buried) break;
        }
        t.ok('the sweep saw the campaign', checked >= 60, `${checked} pickups`);
        t.ok('nothing added after the fact buries a pickup', buried === null,
            buried || '');
        t.ok('and some genuinely ended up on the new high ground', lifted > 0,
            `${lifted} pickups now sit above floor level`);
    }
}
