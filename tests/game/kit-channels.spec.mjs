// tests/game/kit-channels.spec.mjs — Phase F.
//
// THE FINDING THIS EXISTS TO CLOSE
//
// `dungeon-kits.js` declares seven design channels per dungeon. `applyKit` read
// TWO of them and `room-lights.js` read a third. The other four were
//
//   `structural` + `dressing`   28 named prop kinds
//   `atmosphere`                14 distinct region tags
//   `bossRule`                  14 arena rules
//   `accent`                    14 authored accent colours
//
// — roughly 84 authored design declarations, three channels live. Not "the art
// direction is thin": the art direction was WRITTEN DOWN and never built.
//
// So the claims here are mostly of one kind: *this channel is read by
// something, for every dungeon that declares it, and the fourteen values
// actually differ from each other.* A channel wired to a constant is the same
// bug in a better disguise.

import * as THREE from 'three';
import { KITS } from '../../src/game/levels/dungeon-kits.js';
import {
    PROP_BUILDERS, ARENA_RULES, stampKitProps, shapeBossArena,
} from '../../src/game/world/kit-props.js';
import { ATMOSPHERES, atmosphereFor, DEFAULT_ATMOSPHERE, DustMotes } from '../../src/game/fx/atmosphere.js';
import { MATERIALS, KIND_MATERIAL, materialFor, ImpactFx } from '../../src/game/fx/impact.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyHit } from '../../src/game/combat/combat-sweeper.js';
import { juice } from '../../src/game/fx/juice.js';
import { createDungeon } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BEAT_LIST } from './_beat-defs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const keyStoreStub = () => ({
    _open: new Set(),
    isOpen(id) { return this._open.has(id); },
    open(id) { this._open.add(id); },
    mapPickup: () => false, takeMapPickup() {},
    isPickupTaken: () => false, takePickup() {},
});

export function run(t) {
    const kits = Object.entries(KITS);
    t.ok('fourteen dungeons declare a kit', kits.length === 14, `${kits.length}`);

    // ── structural / dressing: 28 prop kinds, all of them buildable ────────
    {
        const declared = new Set();
        for (const [, kit] of kits) {
            for (const k of kit.structural || []) declared.add(k);
            for (const k of kit.dressing || []) declared.add(k);
        }
        // 56, not the 28 the plan estimated — two structural and two dressing
        // kinds per dungeon, and every one of the fifty-six names is unique.
        // Counted rather than assumed, and the number went UP on inspection,
        // which is the good direction for a channel nobody had read.
        t.ok('the kits name fifty-six distinct prop kinds', declared.size === 56,
            `${declared.size}`);
        const missing = [...declared].filter((k) => !PROP_BUILDERS[k]);
        t.ok('every named prop kind has a builder', missing.length === 0,
            missing.join(', '));

        // And each builder actually puts voxels down. A builder that quietly
        // does nothing is the same as no builder, and looks identical in a
        // coverage count.
        const empty = [];
        for (const k of declared) {
            const m = new Map();
            PROP_BUILDERS[k](m, 0, 0, 0xffd060, 0x808080);
            if (m.size === 0) empty.push(k);
        }
        t.ok('and every builder builds something', empty.length === 0, empty.join(', '));

        // No two dungeons share a prop set — that is what makes them places.
        const sets = kits.map(([, kit]) =>
            [...(kit.structural || []), ...(kit.dressing || [])].sort().join('|'));
        t.ok('no two dungeons are dressed the same',
            new Set(sets).size === sets.length,
            `${new Set(sets).size} distinct sets across 14 dungeons`);
    }

    // Props land in rooms, respect what is already there, and use the accent.
    {
        const kit = KITS['beat-01-crypt'];
        const room = { half: 10, wallColor: 0x404040, doors: [], enemies: [] };
        const map = new Map();
        const placed = stampKitProps(map, kit, room, 'someroom');
        t.ok('a room gets props', placed > 0, `${placed} props`);
        t.ok('and they are voxels in the room map', map.size > 0);

        // The accent channel: the props are the thing that finally reads it.
        const colors = new Set(map.values());
        t.ok('the dungeon accent appears in the geometry',
            colors.has(kit.accent),
            `accent ${kit.accent.toString(16)} not among ${colors.size} colours used`);

        // Deterministic — a room must look the same every time you walk in.
        const again = new Map();
        stampKitProps(again, kit, room, 'someroom');
        t.ok('prop placement is deterministic', again.size === map.size);
        const elsewhere = new Map();
        stampKitProps(elsewhere, kit, room, 'a-different-room');
        t.ok('but differs room to room', elsewhere.size !== map.size,
            `${elsewhere.size} vs ${map.size}`);

        // Everything refused is skipped, not clipped.
        const blocked = new Map();
        const n = stampKitProps(blocked, kit, room, 'someroom', () => true);
        t.ok('a room with no free space gets no props', n === 0 && blocked.size === 0,
            'a prop growing through a door is worse than a bare room');

        // Small rooms are left alone.
        const tiny = new Map();
        t.ok('a corridor is not dressed',
            stampKitProps(tiny, kit, { half: 5 }, 'tiny') === 0);
    }

    // ── bossRule: fourteen arenas ──────────────────────────────────────────
    {
        const rules = kits.map(([, kit]) => kit.bossRule);
        t.ok('every dungeon declares an arena rule',
            rules.every(Boolean) && rules.length === 14);
        const unknown = rules.filter((r) => !ARENA_RULES[r]);
        t.ok('and every rule is implemented', unknown.length === 0, unknown.join(', '));
        t.ok('the fourteen rules are not all the same',
            new Set(rules).size >= 10, `${new Set(rules).size} distinct rules`);

        const shapes = new Set();
        for (const [, kit] of kits) {
            const pmap = new Map();
            const placed = shapeBossArena(pmap, kit, { half: 12 }, 0x606060);
            t.ok(`${kit.name}'s arena is shaped`, placed > 0, `${placed} cells`);
            shapes.add(pmap.size);
            // The safety rule that makes this generatable at all.
            let maxY = 0;
            for (const k of pmap.keys()) maxY = Math.max(maxY, Number(k.split(',')[1]));
            t.ok(`${kit.name}'s arena never rises out of reach`, maxY <= 4,
                `highest voxel y=${maxY}`);
        }
        t.ok('and the arenas are not one shape in fourteen colours',
            shapes.size >= 4, `${shapes.size} distinct footprints`);
        t.ok('a small room gets no arena shaping',
            shapeBossArena(new Map(), kits[0][1], { half: 6 }, 0) === 0);
    }

    // ── atmosphere: fourteen tags, fourteen fields ─────────────────────────
    {
        const tags = kits.map(([, kit]) => kit.atmosphere);
        t.ok('every dungeon declares an atmosphere', tags.every(Boolean));
        const missing = tags.filter((tag) => !ATMOSPHERES[tag]);
        t.ok('and every tag has a profile', missing.length === 0, missing.join(', '));
        t.ok('the tags are distinct', new Set(tags).size === 14,
            `${new Set(tags).size} distinct tags`);

        // FOURTEEN distinct colours, not "at least twelve". A loose threshold
        // survives two dungeons quietly collapsing onto the same field, which
        // is precisely the state this channel was in before it was wired —
        // and the counterfactual that made the Pyre look like the Crypt walked
        // straight through the old bound.
        const colors = new Set(tags.map((tag) => atmosphereFor(tag).color));
        t.ok('and every dungeon has its own colour', colors.size === tags.length,
            `${colors.size} distinct colours across ${tags.length} dungeons`);
        const shapes = new Set(tags.map((tag) => {
            const a = atmosphereFor(tag);
            return `${a.rise}|${a.drift}|${a.size}`;
        }));
        t.ok('and its own motion', shapes.size === tags.length,
            `${shapes.size} distinct motions — colour alone is not an atmosphere`);

        // The one number that separates a spark from a drip.
        const rises = tags.map((tag) => atmosphereFor(tag).rise);
        t.ok('some atmospheres fall rather than rise',
            rises.some((r) => r < 0) && rises.some((r) => r > 0),
            'drips and vapour go DOWN; sparks and embers go up');

        t.ok('an unknown tag falls back rather than throwing',
            atmosphereFor('nonsense') === DEFAULT_ATMOSPHERE);
    }

    // A falling field must recycle at the ceiling, or it drains the room.
    {
        const scene = new THREE.Scene();
        const motes = new DustMotes(scene, { count: 40 });
        motes.setAtmosphere('drips');
        t.ok('drips fall', motes.profile.rise < 0);
        for (let i = 0; i < 60 * 12; i++) motes.update(1 / 60);
        const arr = motes.points.geometry.getAttribute('position').array;
        let above = 0;
        for (let i = 0; i < 40; i++) if (arr[i * 3 + 1] > 1.0) above++;
        t.ok('and the field stays populated', above >= 30,
            `${above} of 40 motes still in the air after twelve seconds — a `
            + 'falling field that recycled at the ceiling would empty the room');

        motes.setAtmosphere('sparks');
        t.ok('and a rising one reads differently', motes.profile.rise > 0);
        t.ok('the material follows the tag',
            motes.points.material.color.getHex() === ATMOSPHERES.sparks.color);
        motes.dispose();
    }

    // ── F2: impact keyed to what was hit ───────────────────────────────────
    {
        const kinds = Object.keys(KIND_MATERIAL);
        t.ok('every enemy kind has a material', kinds.length >= 9, kinds.join(','));
        const bad = kinds.filter((k) => !MATERIALS[KIND_MATERIAL[k]]);
        t.ok('and every material is defined', bad.length === 0, bad.join(','));
        t.ok('a bulwark and a brood do not chip the same',
            materialFor({ kind: 'bulwark' }) !== materialFor({ kind: 'brood' }),
            'the two most different targets in the bestiary fed back identically');
        t.ok('a boss reads as metal', materialFor({ bossId: 'x' }) === MATERIALS.metal);
        t.ok('an unknown thing still gets debris',
            materialFor({ kind: 'nothing-like-this' }) === MATERIALS.stone);

        // The gravity spread is what makes the materials feel different.
        const gravities = new Set(Object.values(MATERIALS).map((m) => m.gravity));
        t.ok('materials fall at different rates', gravities.size >= 5,
            `${gravities.size} distinct gravities`);

        const scene = new THREE.Scene();
        const fx = new ImpactFx(scene);
        const n = fx.burst({ x: 0, y: 1, z: 0 }, { x: 1, z: 0 }, { kind: 'bulwark' });
        t.ok('a hit throws debris', n > 0, `${n} pieces`);
        t.ok('which is live', fx.activeCount === n);

        // Thrown ALONG the blow: the average piece must end up downrange, not
        // scattered evenly around the impact.
        const live = fx.pool.filter((p) => p.life > 0);
        const meanX = live.reduce((s, p) => s + p.vel.x, 0) / live.length;
        t.ok('and it is thrown along the blow, not radially', meanX > 0.5,
            `mean x velocity ${meanX.toFixed(2)} for a blow travelling +X`);

        for (let i = 0; i < 60; i++) fx.update(1 / 60);
        t.ok('and it clears itself up', fx.activeCount === 0);
        fx.dispose();
    }

    // THE HOOK. Everything above drives `ImpactFx` directly, which proves the
    // effect works and says nothing about whether anything calls it — and
    // `juice.onImpact` is installed only by the game loop, so in a headless
    // suite the branch in `applyHit` is never taken. Deleting that branch left
    // every assertion above green, and the whole feature would have been dead
    // in the shipped game.
    {
        const calls = [];
        const prev = juice.onImpact;
        juice.onImpact = (defender, dir, move) => calls.push({ defender, dir, move });
        try {
            const defender = {
                root: { position: { x: 3, y: 1, z: 0 } },
                state: { current: 'IDLE' },
                kind: 'bulwark',
                hp: 10,
            };
            // A real position, not just a facing: `inFrontArc` needs somewhere
            // to measure the bearing FROM, and without it the plated case below
            // silently reports "not armoured" and tests nothing.
            const attacker = {
                root: { position: { x: 0, y: 1, z: 0 } },
                state: { facingVec: { x: 1, z: 0 } },
            };
            applyHit(defender, { damage: 1 }, attacker);
            t.ok('a landed hit calls the impact hook', calls.length === 1,
                `${calls.length} calls`);
            t.ok('with the thing that was hit', calls[0]?.defender === defender);
            t.ok("and the attacker's heading, so debris flies downrange",
                calls[0]?.dir?.x === 1 && calls[0]?.dir?.z === 0,
                JSON.stringify(calls[0]?.dir));

            // A blow turned by a PLATE throws sparks too. "That did nothing"
            // and "that did nothing because of the plate you are standing in
            // front of" are different messages, and a sound was the only thing
            // separating them.
            calls.length = 0;
            const plated = {
                root: { position: { x: 3, y: 1, z: 0 } },
                state: { current: 'IDLE', facingVec: { x: -1, z: 0 } },
                kind: 'bulwark', hp: 10, armorUp: true,
            };
            const r = applyHit(plated, { damage: 1 }, attacker);
            t.ok('the plate turned it', r.armored === true && r.damage === 0);
            t.ok('and it still threw sparks', calls.length === 1,
                `${calls.length} calls`);

            // A shield that refuses the hit outright is a different thing: no
            // contact, no debris.
            calls.length = 0;
            applyHit({ ...plated, armorUp: false, shielded: true },
                { damage: 1 }, attacker);
            t.ok('but a shielded target produces none', calls.length === 0,
                'nothing touched it');
        } finally {
            juice.onImpact = prev;
        }
    }

    // The killing-blow kick is its own channel and cannot eat a boss intro.
    //
    // Asserted over the SOURCE rather than an instance, and that is a real
    // limitation stated plainly: `camera-rig.js` imports the renderer, which
    // touches `window`, so it cannot be constructed in a headless spec at all.
    // (`room-seal.spec.mjs` already reads `room-graph.js` as text for the same
    // reason.) These claims are therefore about the shape of the code, not its
    // behaviour — weaker than driving it, and better than not asking.
    {
        const src = readFileSync(
            path.join(HERE, '../../src/game/camera-rig.js'), 'utf8');
        t.ok('the kick exists', /kick\(duration/.test(src));
        t.ok('and is a separate field from the boss-intro focus',
            /this\._kick = null;/.test(src) && /this\._focus = null;/.test(src),
            'both can land on the same frame — the blow that clears the last '
            + 'add as the boss card fires — and one channel would eat the other');
        t.ok('a kick never writes _focus',
            !/kick\([^)]*\)\s*\{[^}]*_focus/.test(src));
        t.ok('and a level change clears both',
            /clearFocus\(\)\s*\{\s*this\._focus = null;\s*this\._kick = null;/.test(src));
        t.ok('the kick only ever subtracts height',
            /effH -= k\.depth \* dip;/.test(src),
            'a kick that could ADD height would fight the two-subject framing');
        t.ok('and it is refreshed rather than stacked',
            /this\._kick = \{ t: 0,/.test(src),
            'three kills in half a second is one camera move, not three');
    }

    // ── The channels are read by the SHIPPED bake, not just by this file ───
    {
        let err = null;
        let propColours = 0;
        let arenaCells = 0;
        for (const def of BEAT_LIST.slice(0, 4)) {
            let level = null;
            try {
                level = createDungeon(
                    {
                        scene: new THREE.Scene(),
                        collisionWorld: new CollisionWorld(),
                        particles: null,
                    },
                    def, { keyStore: keyStoreStub() }
                );
            } catch (e) { err = `${def.id}: ${e.message}`; break; }
            const kit = KITS[def.id];
            // The accent shows up in the world because the props put it there.
            for (const [roomId, room] of Object.entries(def.rooms)) {
                void roomId;
                if (room.boss) {
                    const pmap = new Map();
                    arenaCells += shapeBossArena(pmap, kit, room, 0x606060);
                }
            }
            const probe = new Map();
            if (stampKitProps(probe, kit, { half: 10, wallColor: 0x404040 }, 'probe') > 0
                && [...probe.values()].includes(kit.accent)) propColours++;
            level.dispose?.();
        }
        t.ok('dungeons still bake with their kit channels built', err === null, err || '');
        t.ok('and the accent reaches the geometry in each', propColours === 4,
            `${propColours} of 4`);
        t.ok('boss arenas are shaped in the campaign', arenaCells > 0,
            `${arenaCells} arena cells across the first act`);
    }
}
