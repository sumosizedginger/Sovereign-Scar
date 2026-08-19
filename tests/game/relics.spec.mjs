// tests/game/relics.spec.mjs — the dragon, the well, and the man in the hole.
//
// WHAT IS HELD HERE
//   1. The dragon's shape claims, measured off the BUILT MESHES. The arch is an
//      invitation to walk through the animal, so its clearance is a promise;
//      the tail is supposed to be lying on the ground, so its height is one
//      too. Both were wrong when first written and both were found by measuring
//      rather than by reading, which is the only reason this section exists in
//      this form.
//   2. Placement: every relic sits inside the protected disc, on a screen that
//      is really in its region, and grants a skin that really exists.
//   3. The well's economics, exhaustively — it cannot take what you do not
//      have, it cannot bill you after the punchline, and it pays out exactly
//      once.
//   4. The miner has no interact and no update. He is furniture, and the joke
//      dies the moment he becomes content.
//   5. Nothing in either file touches a number that matters.
//
// WHAT IS DELIBERATELY NOT HELD HERE
//   Terrain clearance and walkability around each prop. Those are questions
//   about the world the grammar built, they need a full bake per screen, and
//   they live in `tests/qa/easter-eggs.mjs` where the numbers can be looked at
//   rather than only passed or failed.

import fs from 'node:fs';
import * as THREE from 'three';
import {
    REGION_RELICS, placedRelics, relicOnScreen, buildDragonSkeleton,
    RELIC_MAX_OFFSET, RELIC_REACH, RIBCAGE_X, DRAGON_RIBS, spineY,
    SPINE_TOP, SPINE_N, SPINE_X0, SPINE_DX,
} from '../../src/game/world/relics.js';
import {
    WELL_COST, WELL_PAYOUT_AT, WELL_SKIN, WELL_LINES, WELL_BROKE,
    WELL_SCREEN, MINER_SCREEN, WELL_AT, MINER_AT, WELL_THROWS_FLAG,
    MINER_PALETTE, buildDryWell, buildMineShaft, addDryWell,
} from '../../src/game/world/easter-eggs.js';
import { addRelic } from '../../src/game/world/relics.js';
import { REGIONS, regionOf, WORLD7 } from '../../src/game/overworld/world7.js';
import { isHeroSkin, heroSkinIds } from '../../src/game/characters/hero-skins.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { patchOverworld } from '../../src/game/world/keys.js';

/** The hero stands 1.95 and cannot duck. */
const HERO_HEIGHT = 1.95;

/** Screen id → [row, col]. */
function rcOf(screen) {
    const m = /^r(\d)c(\d)$/.exec(screen);
    return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Lowest overhead point of a built group across an x span, in its own frame.
 *
 * Reads the real meshes. A rib drawn one size and placed another is the exact
 * failure this project has shipped repeatedly, and arithmetic restated in a
 * spec cannot see it — only the geometry can.
 */
function lowestOverhead(group, from, to) {
    const box = new THREE.Box3();
    let low = Infinity;
    group.updateMatrixWorld(true);
    group.traverse((o) => {
        if (!o.isMesh) return;
        box.setFromObject(o);
        if (box.min.z > 0.5 || box.max.z < -0.5) return;
        const xMid = (box.min.x + box.max.x) / 2;
        if (xMid < from - 0.6 || xMid > to + 0.6) return;
        if (box.min.y < 0.6) return;   // resting on the floor, not overhead
        low = Math.min(low, box.min.y);
    });
    return Number.isFinite(low) ? low : null;
}

/** Whole-group bounds, in its own frame. */
function bounds(group) {
    group.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(group);
}

function fakeInventory(shards = 0, flags = {}) {
    return {
        scarShards: shards,
        flags: { ...flags },
        getFlag(k) { return !!this.flags[k]; },
        setFlag(k, v = true) { this.flags[k] = v; },
        spendShards(n) {
            if (this.scarShards < n) return false;
            this.scarShards -= n;
            return true;
        },
    };
}

/**
 * A bench that runs the REAL interact system.
 *
 * The first version of the well section below simulated the economics — a loop
 * here that restated the rules in `addDryWell` and then checked its own
 * arithmetic. That is the shape of test this project has been bitten by before
 * (a telegraph spec that was two copies of the same sum and could not see the
 * mesh), and it is worth naming: a model of the code cannot fail when the code
 * is wrong, only when the model is.
 *
 * So this installs the shipped system, walks a fake player into range, and
 * presses the button. `pressed` arms exactly one interact, the way a real key
 * press does — `consumeInteract` returning true forever would let one update
 * tick spend a player's whole purse.
 */
function bench(installFn, { shards = 0, flags = {}, at = { x: 0, z: 0 } } = {}) {
    const systems = [];
    const level = { addSystem: (sys) => systems.push(sys) };
    const scene = new THREE.Scene();
    const inventory = fakeInventory(shards, flags);
    const toasts = [];
    const said = [];
    let saves = 0;
    let dressed = 0;
    let pressed = false;
    const game = {
        player: {
            root: { position: { x: at.x, y: 1, z: at.z } },
            inventory,
            applySavedSkin() { dressed++; return true; },
        },
        input: { consumeInteract() { const p = pressed; pressed = false; return p; } },
        hud: {
            toast: (text) => toasts.push(text),
            story: { queue: (lines) => said.push(lines) },
        },
        persistInventory() { saves++; },
    };
    installFn(level, { scene });
    return {
        scene, inventory, toasts, said, game,
        get saves() { return saves; },
        get dressed() { return dressed; },
        moveTo(x, z) { game.player.root.position.x = x; game.player.root.position.z = z; },
        /** One frame. `press` arms a single interact for this frame only. */
        tick(dt = 0.1, press = false) {
            pressed = press;
            for (const sys of systems) sys.update?.(dt, game);
            pressed = false;
        },
        dispose() { for (const sys of systems) sys.dispose?.(); },
    };
}

export function run(t) {
    // ── 1. THE DRAGON, MEASURED ────────────────────────────────────────────
    {
        const g = buildDragonSkeleton();

        // THE ARCH. This is the promise the set piece makes — the player walks
        // through the animal, not past it — and it read 1.69 when first built,
        // which is 26 cm too low. The limiter was not a rib but the spine
        // sagging inside its own ribcage, and nothing but a measurement was
        // ever going to say so.
        const head = lowestOverhead(g, RIBCAGE_X.from, RIBCAGE_X.to);
        t.ok('the ribcage has overhead geometry at all', head != null);
        t.ok('the arch clears a standing hero across the whole ribcage',
            head != null && head >= HERO_HEIGHT,
            `lowest overhead ${head?.toFixed(2)} vs hero ${HERO_HEIGHT}`);

        // THE TAIL RESTS. It ended at 0.9 — hovering 0.81 above the floor,
        // which is a prop authored at one height and drawn at another.
        t.ok('the spine reaches the ground by the tail tip',
            spineY(1) < 0.35, `tail tip at ${spineY(1).toFixed(3)}`);
        t.ok('the spine is level across the ribcage',
            spineY((RIBCAGE_X.to - SPINE_X0) / SPINE_DX / (SPINE_N - 1)) === SPINE_TOP,
            'the back must not sag between the shoulder and the hips');
        t.ok('the spine only ever descends',
            [0, 0.25, 0.5, 0.75, 1].every((v, i, a) => i === 0 || spineY(v) <= spineY(a[i - 1])));

        // Nothing floats. Measured on the whole assembly rather than on the
        // spine alone, because the wing and the skull are placed by hand.
        const b = bounds(g);
        t.ok('the dragon touches the floor it lies on', b.min.y < 0.35,
            `lowest point ${b.min.y.toFixed(2)}`);
        t.ok('the dragon is not taller than the room it stands in', b.max.y < 7,
            `highest point ${b.max.y.toFixed(2)}`);

        // A LOOP WITH A CONSTANT SIZE GIVES A HOSEPIPE. The taper is the thing
        // that makes it read as an animal, and quantisation has eaten a taper
        // in this project before — five authored radii rounded into three
        // sizes, so a gradient existed only in the source.
        const ribRises = DRAGON_RIBS.map((r) => r.rise);
        t.ok('the ribs are not all one size', new Set(ribRises).size >= 5,
            `${new Set(ribRises).size} distinct rises across ${ribRises.length} ribs`);
        t.ok('the ribcage peaks in the middle, not at an end',
            Math.max(...ribRises) === ribRises[3]);

        // The prop must be scenery. Collision is what makes a decoration into a
        // trap, and this world has a long history of exactly that.
        const src = fs.readFileSync('src/game/world/relics.js', 'utf8')
            .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        for (const forbidden of ['addSolid', 'collisionWorld', 'removeSolid']) {
            t.ok(`relics.js never touches ${forbidden} — a relic is walked through`,
                !src.includes(forbidden));
        }

        let meshes = 0;
        g.traverse((o) => { if (o.isMesh) meshes++; });
        t.ok('the dragon is built from boxes, plural', meshes > 60, `${meshes} meshes`);
        let nonBox = 0;
        g.traverse((o) => { if (o.isMesh && o.geometry.type !== 'BoxGeometry') nonBox++; });
        t.ok('and from boxes only — a smooth rib in a voxel world reads as an import',
            nonBox === 0, `${nonBox} non-box meshes`);
    }

    // ── 2. PLACEMENT ───────────────────────────────────────────────────────
    {
        const regions = Object.keys(REGIONS);
        t.ok('the relic table has a row per region',
            Object.keys(REGION_RELICS).length === regions.length,
            `${Object.keys(REGION_RELICS).length} rows, ${regions.length} regions`);
        for (const r of regions) {
            t.ok(`the relic table has a row for '${r}'`, r in REGION_RELICS);
        }

        const placed = placedRelics();
        t.ok('at least one relic is placed', placed.length >= 1);
        // THE PLAN IS ONE, THEN SEVEN. If this ever fails it should be because
        // somebody deliberately authored more, and they should come here and
        // say so rather than discovering it in a diff.
        t.ok('exactly one relic is placed so far', placed.length === 1,
            `${placed.length} placed — see docs/EASTER-EGGS.md before raising this`);

        const seen = new Set();
        for (const r of placed) {
            t.ok(`${r.id}: has a stable id`, typeof r.id === 'string' && r.id.length > 0);
            t.ok(`${r.id}: its id is unique`, !seen.has(r.id));
            seen.add(r.id);
            t.ok(`${r.id}: grants a skin that exists`, isHeroSkin(r.skin));
            t.ok(`${r.id}: does not grant the default skin`, r.skin !== 'crustwalker');
            t.ok(`${r.id}: has a prompt label`, typeof r.label === 'string' && r.label.length > 2);
            t.ok(`${r.id}: says something`, Array.isArray(r.lines) && r.lines.length >= 1);
            for (const line of r.lines) {
                t.ok(`${r.id}: every line has a speaker and text`,
                    !!line.speaker && !!line.text);
            }
            // INSIDE THE PROTECTED DISC. Outside it the grammar was free to
            // build, and the set piece the player travelled for competes with
            // boulders.
            const off = Math.hypot(r.x, r.z);
            t.ok(`${r.id}: sits within ${RELIC_MAX_OFFSET} of the screen centre`,
                off <= RELIC_MAX_OFFSET, `${off.toFixed(2)}`);
            // ON A SCREEN THAT IS REALLY IN ITS REGION. `regionOf` is the
            // authority; the table is a claim about it.
            const rc = rcOf(r.screen);
            t.ok(`${r.id}: '${r.screen}' is a well-formed screen id`, !!rc);
            if (rc) {
                t.ok(`${r.id}: '${r.screen}' really is in ${r.region}`,
                    regionOf(rc[0], rc[1]) === r.region,
                    `regionOf says ${regionOf(rc[0], rc[1])}`);
            }
            t.ok(`${r.id}: relicOnScreen finds it`, relicOnScreen(r.screen)?.id === r.id);
        }
        t.ok('a screen with no relic returns null', relicOnScreen('r2c2') === null);

        // THE MAP MARK. A relic is a completion item — eight of them, one per
        // region — so the Echo Lens has to be able to point at it the same way
        // it points at a shard cache. Held against the built world def, not
        // against the intention.
        for (const r of placed) {
            t.ok(`${r.id}: its screen is flagged as a secret`,
                WORLD7.screens[r.screen]?.secret === true);
            t.ok(`${r.id}: its screen bakes something`,
                typeof WORLD7.screens[r.screen]?.onBake === 'function');
        }
        // …AND THE TWO JOKES ARE NOT MARKED. A joke you stumble on is worth
        // more than a joke the map sent you to, and neither is a completion
        // item a player could be left hunting for.
        for (const sid of [WELL_SCREEN, MINER_SCREEN]) {
            t.ok(`'${sid}' is not marked as a secret — it is a joke, not a checklist item`,
                !WORLD7.screens[sid]?.secret);
            t.ok(`'${sid}' still bakes its prop`,
                typeof WORLD7.screens[sid]?.onBake === 'function');
        }

        // Each skin is granted by at most one thing, or two sources fight over
        // the same unlock and the second one silently does nothing.
        const grantors = [...placed.map((r) => r.skin), WELL_SKIN];
        t.ok('no two sources grant the same skin',
            new Set(grantors).size === grantors.length, grantors.join(', '));
        // Every skin except the default has a source. An unlock nothing grants
        // is content the player can never see.
        for (const id of heroSkinIds()) {
            if (id === 'crustwalker' || id === 'ashen') continue;
            t.ok(`skin '${id}' has something that grants it`, grantors.includes(id));
        }
    }

    // ── 3. THE WELL ────────────────────────────────────────────────────────
    {
        t.ok('the well and the miner are on different screens', WELL_SCREEN !== MINER_SCREEN);
        for (const [name, at] of [['well', WELL_AT], ['miner', MINER_AT]]) {
            const off = Math.hypot(at.x, at.z);
            t.ok(`the ${name} sits inside the protected disc`, off <= RELIC_MAX_OFFSET,
                `${off.toFixed(2)}`);
        }
        t.ok('the well grants a real skin', isHeroSkin(WELL_SKIN));
        t.ok('the well costs something', WELL_COST > 0);
        t.ok('the well pays out on more than one throw', WELL_PAYOUT_AT > 1);
        // A well that takes forever is a slot machine, which is a worse joke.
        t.ok('the well does not take forever', WELL_PAYOUT_AT <= 4);
        t.ok('there is a line for every throw up to the payout',
            WELL_LINES.length >= WELL_PAYOUT_AT);
        t.ok('and one more, for afterwards', WELL_LINES.length > WELL_PAYOUT_AT);
        for (const [i, lines] of WELL_LINES.entries()) {
            t.ok(`well line ${i} is a non-empty list`, Array.isArray(lines) && lines.length > 0);
            for (const l of lines) t.ok(`well line ${i} has a speaker and text`, !!l.speaker && !!l.text);
        }
        t.ok('it has something to say to a broke player', WELL_BROKE.length > 0);

        // THE WELL NEVER HEALS. The whole joke, held against the source rather
        // than against one call — a heal added later would pass any behavioural
        // test that only checks the current path.
        const src = fs.readFileSync('src/game/world/easter-eggs.js', 'utf8')
            .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        for (const forbidden of ['heal', 'fullRestore', 'health.', 'addShards', 'setMax']) {
            t.ok(`the well never calls ${forbidden}`, !src.includes(forbidden));
        }
        // And it must not be able to add solids either — a well you fall into
        // is a different and much worse encounter.
        for (const forbidden of ['addSolid', 'removeSolid']) {
            t.ok(`easter-eggs.js never touches ${forbidden}`, !src.includes(forbidden));
        }

        // ── the economics, DRIVEN ──
        //
        // The shipped system, installed and pressed. Everything below is the
        // real `addDryWell` deciding what to charge.
        const origin = { x: 0, z: 0 };
        {
            const b = bench((lvl, ctx) => addDryWell(lvl, ctx, origin),
                { shards: 500, at: WELL_AT });
            for (let i = 0; i < 10; i++) b.tick(0.1, true);
            t.ok('a rich player is billed exactly the payout count, then never again',
                b.inventory.scarShards === 500 - WELL_COST * WELL_PAYOUT_AT,
                `${500 - b.inventory.scarShards} taken over 10 presses`);
            t.ok('the throw counter stops at the payout',
                Number(b.inventory.flags[WELL_THROWS_FLAG]) === WELL_PAYOUT_AT);
            t.ok('the skin is granted', b.inventory.getFlag(`skin:has:${WELL_SKIN}`));
            t.ok('and the hero is repainted exactly once', b.dressed === 1,
                `${b.dressed} repaints`);
            t.ok('the well never healed anybody', b.toasts.every((x) => !/heal|restor/i.test(x)));
            t.ok('it said something on every throw', b.said.length >= WELL_PAYOUT_AT);
            b.dispose();
        }
        {
            const b = bench((lvl, ctx) => addDryWell(lvl, ctx, origin),
                { shards: WELL_COST - 1, at: WELL_AT });
            for (let i = 0; i < 6; i++) b.tick(0.1, true);
            t.ok('a player who cannot pay is never charged',
                b.inventory.scarShards === WELL_COST - 1);
            t.ok('and the throw counter never moves',
                !b.inventory.flags[WELL_THROWS_FLAG]);
            t.ok('and is told the cost and what they have',
                b.toasts.some((x) => x.includes(String(WELL_COST))));
            b.dispose();
        }
        {
            const b = bench((lvl, ctx) => addDryWell(lvl, ctx, origin),
                { shards: WELL_COST, at: WELL_AT });
            b.tick(0.1, true);
            t.ok('a player with exactly one throw pays once', b.inventory.scarShards === 0);
            b.tick(0.1, true);
            t.ok('and is never taken below zero', b.inventory.scarShards === 0);
            b.dispose();
        }
        {
            // OUT OF RANGE IS SILENT. A prompt that fires across the screen is
            // a prompt the player learns to ignore, and an interact that lands
            // from ten units away is a purse emptied by a keypress meant for
            // something else.
            const b = bench((lvl, ctx) => addDryWell(lvl, ctx, origin),
                { shards: 500, at: { x: WELL_AT.x + 12, z: WELL_AT.z } });
            for (let i = 0; i < 8; i++) b.tick(0.1, true);
            t.ok('the well is silent from across the screen', b.toasts.length === 0);
            t.ok('and takes nothing', b.inventory.scarShards === 500);
            b.dispose();
        }

        // ── THE RELIC, DRIVEN ──
        {
            const relic = placedRelics()[0];
            const b = bench((lvl, ctx) => addRelic(lvl, ctx, relic, origin),
                { at: { x: relic.x, z: relic.z } });
            b.tick(0.1, false);
            t.ok('the relic prompts before it is taken',
                b.toasts.some((x) => x.includes(relic.label)));
            b.tick(0.1, true);
            t.ok('taking it grants the skin', b.inventory.getFlag(`skin:has:${relic.skin}`));
            t.ok('taking it sets its own flag', b.inventory.getFlag(relic.id));
            t.ok('taking it repaints the hero', b.dressed === 1);
            t.ok('taking it persists', b.saves === 1);
            t.ok('taking it says something', b.said.length === 1);
            const savesAfter = b.saves;
            b.tick(0.1, true);
            t.ok('taking it twice grants nothing more', b.dressed === 1);
            t.ok('and does not re-save', b.saves === savesAfter);
            t.ok('and does not repeat the story', b.said.length === 1);
            t.ok('the prop stays on the screen after it is taken',
                !!b.scene.getObjectByName(relic.id));
            b.dispose();
            t.ok('disposing takes the prop out of the scene',
                !b.scene.getObjectByName(relic.id));
        }
        {
            const relic = placedRelics()[0];
            const b = bench((lvl, ctx) => addRelic(lvl, ctx, relic, origin),
                { at: { x: relic.x + 12, z: relic.z } });
            for (let i = 0; i < 8; i++) b.tick(0.1, true);
            t.ok('the relic is silent from across the screen', b.toasts.length === 0);
            t.ok('and cannot be taken from there', !b.inventory.getFlag(relic.id));
            b.dispose();
        }

        // The well reads as empty. No emissive anywhere in it — the basin is
        // supposed to be visibly dry BEFORE the player pays, and a glow is the
        // universal signal for "something is in here".
        const well = buildDryWell();
        // BOTH CONDITIONS, NOT EITHER. `emissiveIntensity` defaults to 1 on
        // every MeshStandardMaterial ever made, so counting it alone reported
        // all fourteen unlit stone parts as glowing — an instrument failing the
        // thing it was pointed at. A part only emits if it has a non-black
        // emissive colour AND an intensity to push it with.
        let glowing = 0;
        well.traverse((o) => {
            if (!o.isMesh) return;
            const e = o.material?.emissive;
            const lit = !!e && (e.r > 0 || e.g > 0 || e.b > 0);
            if (lit && (o.material.emissiveIntensity ?? 1) > 0) glowing++;
        });
        t.ok('nothing in the well glows — the player can see it is dry', glowing === 0,
            `${glowing} emissive parts`);
        const wb = bounds(well);
        // It has to read as a WELL from a camera at 70.7 degrees, and a low ring
        // on the ground is a circle. The posts are the only vertical it has.
        t.ok('the well stands tall enough to read from above', wb.max.y > 1.8,
            `${wb.max.y.toFixed(2)} tall`);
        // COUNT THE UPRIGHTS, do not just measure the tallest point. Deleting
        // both posts and the beam left this section green, because the ROPE
        // still hangs to 1.97 — a bounding box cannot tell a well from a rope
        // lying in a hole. From 70.7 degrees the posts are the only thing that
        // says "well" rather than "fire pit", so they are what gets counted.
        let uprights = 0;
        well.traverse((o) => {
            if (!o.isMesh) return;
            const b = new THREE.Box3().setFromObject(o);
            const h = b.max.y - b.min.y;
            const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
            if (h > 1.5 && w < 0.5) uprights++;
        });
        t.ok('the well has at least two uprights', uprights >= 2, `${uprights}`);
        // Raised from 3.2 to 3.6 DELIBERATELY, when the well was widened to be
        // findable at all. The limit exists so the prop cannot swallow the
        // frame — the camera's window is about 21 units across at character
        // height, so 3.3 is a sixth of it, and the protected disc it stands in
        // is 12 across. It was not a limit that was in the way of anything.
        t.ok('the well is not so wide it blocks the screen centre',
            wb.max.x - wb.min.x < 3.6, `${(wb.max.x - wb.min.x).toFixed(2)} across`);
    }

    // ── 4. THE MINER IS FURNITURE ──────────────────────────────────────────
    {
        const src = fs.readFileSync('src/game/world/easter-eggs.js', 'utf8');
        const miner = src.slice(src.indexOf('export function addMiner'));
        // HE DOES NOT TURN AROUND. `settlements.js` argues this at length for
        // the dead of Beat 09 and the argument is the same one: the instant he
        // reacts he is content, and the joke was that he is not.
        t.ok('addMiner registers no system', !miner.includes('addSystem'));
        t.ok('addMiner has no interact', !miner.includes('consumeInteract'));
        t.ok('addMiner never speaks', !miner.includes('story') && !miner.includes('toast'));
        t.ok('addMiner grants nothing', !miner.includes('grantSkin') && !miner.includes('setFlag'));
        t.ok('the miner is frozen — never ticked, so he never breathes',
            /frozen:\s*true/.test(miner));

        // He is recognisable. Not Steve — the reasoning is in the file header
        // and in docs/EASTER-EGGS.md — but a cyan shirt and violet trousers is
        // the whole reference, so if those drift the joke is gone.
        const chan = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
        const [sr, sg, sb] = chan(MINER_PALETTE.shirt);
        t.ok('the miner wears a cyan shirt', sg > sr + 40 && sb > sr + 40,
            `#${MINER_PALETTE.shirt.toString(16)}`);
        const [pr, pg, pb] = chan(MINER_PALETTE.jeans);
        t.ok('the miner wears violet trousers', pb > pg + 40 && pr > pg + 10,
            `#${MINER_PALETTE.jeans.toString(16)}`);
        // Warm dim eyes, like a civilian's. Every hostile in this game has a hot
        // rim, so "is that a threat" must be answerable before you are in range.
        t.ok('the miner does not read as hostile', MINER_PALETTE.eyeGlow === 0xffd9a0);

        const shaft = buildMineShaft();
        const sb2 = bounds(shaft);
        t.ok('the shaft is deep enough to stand a man in', sb2.max.y > 1.2,
            `${sb2.max.y.toFixed(2)} tall`);
        t.ok('the shaft has spoil beside it — a hole that dug itself is not a hole',
            sb2.max.x > 1.6, `spoil reaches ${sb2.max.x.toFixed(2)}`);
    }

    // ── 5. THE BAKED WORLD, NOT THE TABLE ──────────────────────────────────
    //
    // One real bake. Everything above this point is a statement about data;
    // this is the only assertion in the file that asks what the game actually
    // built, and it is here because the failure it guards against is invisible
    // to all of them.
    //
    // `makeProtector` has always refused to let the terrain GRAMMAR build over
    // a feature anchor. `terraceRoom` runs afterwards, raises ground by up to
    // two, and had never heard of anchors — so measured across the thirteen the
    // overworld already had, twelve had terrain raised inside them and three
    // were sitting on a raised cell: a shard cache, the Fork's dig site and the
    // weather relay. A relic dropped into that world would have had a boulder
    // through its ribcage and nothing would have said so.
    //
    // `tests/qa/easter-eggs.mjs` reports the same numbers for every prop and is
    // the thing to run when one of them moves.
    {
        const relic = placedRelics()[0];
        patchOverworld({
            pos: { world: 'overworld', screen: relic.screen, x: 0, z: 0 },
            visited: [relic.screen],
        });
        const scene = new THREE.Scene();
        const entry = LEVELS.find((l) => l.id === 'overworld');
        const level = entry.load(
            { scene, collisionWorld: new CollisionWorld(), particles: null },
            {
                keyStore: {
                    isOpen: () => false, open() {},
                    mapPickup: () => false, takeMapPickup() {},
                    isPickupTaken: () => false, takePickup() {},
                    visited: () => [], visit() {},
                },
            },
        );
        const origin = level.currentRoomOrigin();
        t.ok('the relic is in the baked scene', !!scene.getObjectByName(relic.id));

        const surfaceAt = (x, z) => {
            for (let y = 1; y <= 10; y++) {
                if (!level.getVoxelAt(x, y - 0.5, z)) continue;
                if (level.getVoxelAt(x, y + 0.5, z)) continue;
                if (level.getVoxelAt(x, y + 1.5, z)) continue;
                return y;
            }
            return null;
        };
        let raised = 0;
        const R = Math.ceil(RELIC_MAX_OFFSET);
        for (let dx = -R; dx <= R; dx++) {
            for (let dz = -R; dz <= R; dz++) {
                if (Math.hypot(dx, dz) > RELIC_MAX_OFFSET) continue;
                const y = surfaceAt(origin.x + relic.x + dx + 0.5, origin.z + relic.z + dz + 0.5);
                if (y != null && y > 1) raised++;
            }
        }
        t.ok('no terrain stands inside the relic', raised === 0,
            `${raised} raised cells within ${RELIC_MAX_OFFSET} of the relic`);
        t.ok('the relic itself stands on the floor, not on a terrace',
            surfaceAt(origin.x + relic.x + 0.5, origin.z + relic.z + 0.5) === 1);
    }

    // ── 5. THE REACH IS USABLE ─────────────────────────────────────────────
    {
        // Not so tight the player has to hunt for the exact cell, not so wide
        // the prompt follows them around the screen.
        t.ok('the relic reach is usable', RELIC_REACH >= 2 && RELIC_REACH <= 4,
            `${RELIC_REACH}`);
    }
}
