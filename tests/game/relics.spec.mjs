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
    SPINE_TOP, SPINE_N, SPINE_X0, SPINE_DX, RELIC_BUILDERS, buildColdSignalFire,
} from '../../src/game/world/relics.js';
import {
    WELL_COST, WELL_PAYOUT_AT, WELL_SKIN, WELL_LINES, WELL_BROKE,
    WELL_SCREEN, MINER_SCREEN, WELL_AT, MINER_AT, WELL_THROWS_FLAG,
    MINER_PALETTE, buildDryWell, buildMineShaft, addDryWell,
} from '../../src/game/world/easter-eggs.js';
import { addRelic } from '../../src/game/world/relics.js';
import { REGIONS, regionOf, WORLD7 } from '../../src/game/overworld/world7.js';
import { isHeroSkin, heroSkinIds } from '../../src/game/characters/hero-skins.js';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
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

        // ── 1c. THE ANCHOR ASKS FOR TWO MORE THAN IT NEEDS ──────────────────
        //
        // `world7.js` publishes a feature anchor per relic and both the grammar
        // and the terracing pass refuse to build inside one. They honour it —
        // and terracing raises ground by up to two, and its SKIRT steps down
        // OUTSIDE the cell it was refused at. So an anchor of r delivers a
        // clearing of about r - 2, and the relic's radius-7 clearing was a five.
        //
        // Swept with `tests/qa/easter-eggs.mjs` counting raised cells inside the
        // anchor across all eight relics:
        //
        //     r=7   6 relics affected, 19 cells      r=10  0, 0
        //     r=8   1 relic affected,   3 cells      r=11  0, 0
        //     r=9   0 relics affected,  0 cells      r=12  0, 0
        //
        // Nine is pinned here because the number was measured, not chosen, and
        // a measured number with no test is a number that drifts back.
        {
            const MIN_ANCHOR = 9;
            // Its own call rather than the outer `placed`: this block sits
            // above where that is defined, and reaching forward to a const is a
            // temporal-dead-zone error that only shows up when the file runs.
            for (const r of placedRelics()) {
                const screen = WORLD7.screens[r.screen];
                const mine = (screen?.features || []).filter(
                    (f) => Math.hypot((f.x ?? 0) - r.x, (f.z ?? 0) - r.z) < 0.001,
                );
                t.ok(`${r.id}: publishes a feature anchor`, mine.length === 1);
                t.ok(`${r.id}: its anchor is at least ${MIN_ANCHOR}`,
                    (mine[0]?.r ?? 0) >= MIN_ANCHOR, `r=${mine[0]?.r}`);
            }
        }

        // ── 1d. THE ICE HAS NO LID ─────────────────────────────────────────
        //
        // The cryomire relic is a figure caught in ice, and the first build put
        // a slab across the top of it. The camera is 17.5 units up at 70.7
        // degrees, so the TOP is the face the player sees: the prop came back
        // from the photographer as a white box with nothing in it. "Open toward
        // the camera" had been reasoned about as if this game had a side view.
        //
        // The rule, stated so it cannot come back: nothing may sit above the
        // figure's shoulders directly over the middle of the prop.
        {
            const g = RELIC_BUILDERS.frozen_stride();
            g.updateMatrixWorld(true);
            const b = new THREE.Box3();
            let covering = 0;
            // ICE ONLY, AND FROM CHEST HEIGHT UP. The first version of this
            // asked for anything over the centre above 1.6 and a counterfactual
            // walked straight past it: a lid whose underside sits at 1.5 still
            // hides the head, which reaches 1.97. Lowering the bar to chest
            // height would have caught the figure's own torso instead, so the
            // question has to name the material — nothing frozen may be over
            // the thing that froze.
            const ICE_HEX = new Set([0xa8c4cc, 0x6e8890]);
            g.traverse((o) => {
                if (!o.isMesh) return;
                b.setFromObject(o);
                if (!ICE_HEX.has(o.material.color.getHex())) return;
                if (b.min.x <= 0.2 && b.max.x >= -0.2 && b.min.z <= 0.2 && b.max.z >= -0.2
                    && b.min.y > 1.2) covering++;
            });
            t.ok('nothing roofs the figure in the ice', covering === 0, `${covering} pieces overhead`);
            // And the figure has to reach above the ice, or it is a well with
            // something at the bottom of it.
            let iceTop = 0;
            let figureTop = 0;
            g.traverse((o) => {
                if (!o.isMesh) return;
                b.setFromObject(o);
                const hex = o.material.color.getHex();
                if (hex === 0xa8c4cc || hex === 0x6e8890) iceTop = Math.max(iceTop, b.max.y);
                if (hex === 0x2a2e2c) figureTop = Math.max(figureTop, b.max.y);
            });
            t.ok('the figure stands proud of the ice around it',
                figureTop > iceTop, `figure ${figureTop.toFixed(2)} vs ice ${iceTop.toFixed(2)}`);
            g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        }

        // ── 1a. EVERY PROP, STRUCTURALLY ───────────────────────────────────
        //
        // These ran as bespoke assertions for the cold signal fire and caught
        // three real bugs in it. Written per-prop they would have to be written
        // eight times and would be written well maybe twice, so they run over
        // whatever `RELIC_BUILDERS` holds — a new prop inherits the whole set
        // the moment it is registered, which is the only version of this that
        // survives the seventh one.
        {
            const b = new THREE.Box3();
            const accents = new Set();
            for (const pal of Object.values(ENEMY_PALETTES)) {
                if (typeof pal?.eyeGlow === 'number') accents.add(pal.eyeGlow);
            }
            // THE DRAGON'S FLOOR IS PINNED, NOT EXEMPTED. It was built before
            // `grounded()` existed and its skull end sits 0.253 under — twenty
            // meshes are below the floor. That is pre-existing, a quarter of a
            // metre on a prop 4.7 tall, and it looks right, so it has not been
            // re-tuned: `docs/media` records what happens when art is changed
            // to move a number. Pinning the value means it cannot get WORSE
            // without this saying so, which is the part that matters.
            const FLOOR = { dragon: -0.26 };
            for (const [kind, build] of Object.entries(RELIC_BUILDERS)) {
                const g = build();
                g.updateMatrixWorld(true);
                const bb = new THREE.Box3().setFromObject(g);

                let meshes = 0, inside = 0, lit = 0, longest = 0;
                g.traverse((o) => {
                    if (!o.isMesh) return;
                    meshes++;
                    b.setFromObject(o);
                    const cx = (b.min.x + b.max.x) / 2;
                    const cz = (b.min.z + b.max.z) / 2;
                    if (Math.hypot(cx, cz) <= 6) inside++;
                    longest = Math.max(longest, Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z));
                    const e = o.material?.emissive;
                    if (e && e.getHex() !== 0x000000 && (o.material.emissiveIntensity ?? 0) > 0
                        && accents.has(e.getHex())) lit++;
                });

                // RESTS ON THE FLOOR. Both directions: a prop that floats reads
                // as pasted on, and one that sinks loses whatever went under.
                const floor = FLOOR[kind] ?? -0.03;
                t.ok(`${kind}: nothing is buried`, bb.min.y >= floor,
                    `lowest ${bb.min.y.toFixed(3)} against ${floor}`);
                t.ok(`${kind}: something touches the ground`, bb.min.y <= 0.06,
                    `lowest ${bb.min.y.toFixed(3)}`);

                // MASS INSIDE THE PROTECTED DISC. `makeProtector` keeps radius
                // 6 clear at the screen centre; past it the grammar was free to
                // build, and the set piece the player travelled for starts
                // competing with boulders. The dragon deliberately trails a
                // tail and a wing past the line, so the rule is about where the
                // BULK is rather than where the last vertex is.
                const pct = Math.round((inside / meshes) * 100);
                t.ok(`${kind}: most of it is inside the protected disc`, pct >= 85, `${pct}%`);
                const reach = Math.max(
                    Math.abs(bb.min.x), Math.abs(bb.max.x),
                    Math.abs(bb.min.z), Math.abs(bb.max.z),
                );
                t.ok(`${kind}: does not run off the screen`, reach <= 11, `reaches ${reach.toFixed(2)}`);

                // IT IS A SET PIECE. A relic is the reason somebody walked
                // across a region; four boxes in a heap is a placeholder that
                // shipped.
                t.ok(`${kind}: is actually built`, meshes >= 12, `${meshes} meshes`);
                t.ok(`${kind}: reads at a distance`, longest >= 1.2 || bb.max.y >= 1.2,
                    `longest span ${longest.toFixed(2)}, height ${bb.max.y.toFixed(2)}`);
                t.ok(`${kind}: is not taller than the world`, bb.max.y <= 6,
                    `${bb.max.y.toFixed(2)}`);

                // NO PROP WEARS AN ENEMY'S ACCENT. Same rule the outfits are
                // held to in `gear-skins.spec.mjs`, and it matters more here:
                // a set piece glowing in the local faction's colour is a
                // permanent false telegraph on a screen the player came to.
                t.ok(`${kind}: does not glow in an enemy's colour`, lit === 0, `${lit} parts`);

                g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
            }
        }

        // ── 1b. THE COLD SIGNAL FIRE ───────────────────────────────────────
        //
        // Three of these assertions exist because the thing they check was
        // WRONG in the first build and only the pictures said so. That is the
        // whole reason they are here in this shape.
        {
            const fire = buildColdSignalFire();
            const bb = bounds(fire);

            // NOTHING IS BURIED. The iron basket was authored at y 0.34 with a
            // 1.32 tip, and its staves swing half a metre below their own
            // origin: the lower half of it was under the floor and it read from
            // above as a half-disc. A prop that sinks is the dragon skull's
            // float in the other direction, and neither is visible in a number
            // unless somebody asks for one.
            // THE THRESHOLD IS -0.03 AND THAT IS DELIBERATE. At -0.06 the beam
            // tilt correction was not load-bearing: removing it left the lowest
            // point at -0.059 and this stayed green, which means the fix was
            // shipped untested. The prop now rests at -0.013 with every
            // correction in, so the bar sits where it can actually feel one
            // going missing.
            t.ok('nothing on the cold fire is buried',
                bb.min.y >= -0.03, `lowest point ${bb.min.y.toFixed(3)}`);

            // AND NOTHING FLOATS. Something has to be touching the ground or
            // the whole prop is hovering.
            t.ok('the cold fire rests on the ground',
                bb.min.y <= 0.06, `lowest point ${bb.min.y.toFixed(3)}`);

            // IT IS OUT. This is the entire idea: the pyre is the one region in
            // the world whose ground is lit from underneath, and the relic
            // found there is the thing that stopped burning. A single emissive
            // anywhere in this prop makes it a campfire and deletes the point.
            let lit = 0;
            fire.traverse((o) => {
                if (!o.isMesh) return;
                const e = o.material?.emissive;
                if (e && e.getHex() !== 0x000000 && (o.material.emissiveIntensity ?? 0) > 0) lit++;
            });
            t.ok('the cold fire does not glow', lit === 0, `${lit} emissive parts`);

            // IT READS AS A RING FROM DIRECTLY ABOVE. The camera is fixed at
            // 70.7 degrees, so plan view is the only view. A ring is one of the
            // few shapes unmistakable from up there, and it is what makes this
            // a fire pit rather than a pile.
            let ringStones = 0;
            const b = new THREE.Box3();
            fire.updateMatrixWorld(true);
            fire.traverse((o) => {
                if (!o.isMesh) return;
                b.setFromObject(o);
                const cx = (b.min.x + b.max.x) / 2;
                const cz = (b.min.z + b.max.z) / 2;
                const r = Math.hypot(cx, cz);
                if (r > 1.75 && r < 2.6 && b.max.y < 0.75) ringStones++;
            });
            t.ok('the pit is ringed by stones', ringStones >= 8, `${ringStones} on the ring`);

            // THE MAST IS A DIAGONAL, NOT A POST. The first version was a pole
            // 25 degrees off vertical: three metres of geometry that projected
            // to almost nothing from overhead and was simply absent from the
            // photograph. Its footprint has to be LONG on the ground.
            //
            // THE FIRST VERSION OF THIS ASSERTION DID NOT TEST THAT. It took
            // the longest ground span of any mesh, and the charred beams are
            // 3.4 long — so standing the mast back up left it green. A test
            // whose subject can be removed without it noticing is measuring
            // something else. It now demands that the LONGEST piece is also a
            // FLAT one, which a pole cannot be.
            let longest = 0;
            let longestHeight = 0;
            fire.traverse((o) => {
                if (!o.isMesh) return;
                b.setFromObject(o);
                const span = Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z);
                if (span > longest) {
                    longest = span;
                    longestHeight = b.max.y - b.min.y;
                }
            });
            t.ok('something long lies across the ground',
                longest >= 4.0, `longest ground span ${longest.toFixed(2)}`);
            t.ok('and the longest thing is lying down, not standing up',
                longestHeight <= 0.7, `its height is ${longestHeight.toFixed(2)}`);

            // And the whole prop stays inside the protected disc, which is
            // radius 6 — outside it the grammar was free to build.
            const reach = Math.max(
                Math.abs(bb.min.x), Math.abs(bb.max.x),
                Math.abs(bb.min.z), Math.abs(bb.max.z),
            );
            t.ok('the cold fire fits inside the protected disc',
                reach <= 5.6, `reaches ${reach.toFixed(2)}`);

            fire.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        }

        const placed = placedRelics();
        t.ok('at least one relic is placed', placed.length >= 1);
        // THE COUNT WAS A TRIPWIRE AND IT HAS FIRED TWICE. It read `=== 1`
        // while only the dragon existed, `=== 2` after the pyre's cold signal
        // fire, and each time whoever raised it came here and said why rather
        // than letting a diff discover it.
        //
        // EIGHT now, which is all of them, so it stops being a tripwire and
        // becomes a completeness check: every region in the world has something
        // in it, and a ninth region added later arrives with an empty row that
        // this refuses. That is a better question than the count ever was.
        t.ok('every region has a relic', placed.length === regions.length,
            `${placed.length} placed, ${regions.length} regions`);
        for (const r of regions) {
            t.ok(`region '${r}' has a relic authored`, !!REGION_RELICS[r]);
        }
        // Every relic is somewhere different. Two on one screen would put two
        // set pieces inside the same protected disc.
        t.ok('no two relics share a screen',
            new Set(placed.map((r) => r.screen)).size === placed.length);
        t.ok('every relic grants a different outfit',
            new Set(placed.map((r) => r.skin)).size === placed.length);

        // Each placed relic must name a builder that exists. `addRelic` returns
        // null for a `kind` with no builder and swallows it silently, so a typo
        // in the table ships a screen the player was sent to with nothing on it.
        for (const r of placed) {
            t.ok(`${r.id}: names a real builder ('${r.kind}')`,
                typeof RELIC_BUILDERS[r.kind] === 'function');
        }
        // And every builder must be reachable from the table, or it is art
        // nobody can see.
        for (const kind of Object.keys(RELIC_BUILDERS)) {
            t.ok(`builder '${kind}' is used by a placed relic`,
                placed.some((r) => r.kind === kind));
        }

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

        // SOURCES ARE NOT ALL RELICS, and the list of the ones that are not is
        // written here rather than left as a growing pile of `continue`s.
        //
        // Three outfits are earned instead of found: the Drowned out of the dry
        // well, the Ashen for speaking to all three settlements, and Untouched
        // for a boss beaten without being hit. The first version of this loop
        // skipped the Ashen with a bare id in a condition; the third one
        // arriving is what made that unmaintainable, because a skip list that
        // grows silently is how a skin with NO source eventually slips through
        // wearing somebody else's exemption.
        const EARNED = { ashen: 'the three settlements', untouched: 'a flawless boss' };
        const grantors = [...placed.map((r) => r.skin), WELL_SKIN, ...Object.keys(EARNED)];
        // Each skin is granted by at most one thing, or two sources fight over
        // the same unlock and the second one silently does nothing.
        t.ok('no two sources grant the same skin',
            new Set(grantors).size === grantors.length, grantors.join(', '));
        // Every skin except the default has a source. An unlock nothing grants
        // is content the player can never see.
        for (const id of heroSkinIds()) {
            if (id === 'crustwalker') continue;
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
        t.ok('addMiner grants nothing', !miner.includes('grant') && !miner.includes('setFlag'));
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
