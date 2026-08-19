// tests/game/hero-skins.spec.mjs — the cosmetic axis, and its one hard rule.
//
// WHAT IS HELD HERE
//   1. A skin changes COLOUR AND NOTHING ELSE. Built under every skin, every
//      part of the hero produces identical cell keys and identical vertex
//      counts. This is the assumption the live repaint rests on, and if it ever
//      stops being true the repaint writes a mismatched buffer onto a body it
//      does not fit.
//   2. `INHERITED_CLOTHING` matches what the FROZEN builder actually falls back
//      to. The hero's shirt and trousers were never authored — they came out of
//      defaults inside `src/characters/builders.js` — and naming them here only
//      helps if the names stay true.
//   3. No skin may touch the rim. `hero-readability.spec.mjs` pins the hero's
//      separation light to azure for a recorded reason: the first pick was a
//      cold cyan, near enough the frost faction's accent that in a frost room
//      the hero would have been marked out in the colour of the things trying
//      to kill them. A cosmetic must not be able to reach that.
//   4. No skin grants anything. Not a hit point, not a shard, not a flag that
//      is not a skin flag. The whole reason eight relics are free is that they
//      cannot enter the balance conversation.
//   5. Ownership: the default is always owned, an unowned skin cannot be worn
//      even if the save says it is, and a grant is idempotent.

import fs from 'node:fs';
import {
    buildTorso, buildHead, buildArm, buildLeg,
    scaleProfile, TORSO_PROFILE, HEAD_PROFILE,
} from '../../src/characters/builders.js';
import { buildVoxelGeo } from '../../src/voxel/core.js';
import { HERO_PALETTE } from '../../src/game/assets/palettes.js';
import { hasGearArt } from '../../src/game/assets/gear-skins.js';
import {
    HERO_SKINS, DEFAULT_SKIN, INHERITED_CLOTHING, heroSkinIds, heroSkin,
    heroSkinPalette, isHeroSkin, unlockedSkins, wornSkin, grantSkin, wearSkin,
    nextSkin, skinFlag, SKIN_WORN_FLAG,
} from '../../src/game/characters/hero-skins.js';
import { HERO_RIG } from '../../src/game/player.js';
import { createActorRig, recolorActor } from '../../src/game/characters/actor-rig.js';

/** Just enough Inventory to exercise the flag helpers. */
function fakeInventory(flags = {}) {
    return {
        flags: { ...flags },
        getFlag(k) { return !!this.flags[k]; },
        setFlag(k, v = true) { this.flags[k] = v; },
    };
}

/** The six part maps, built under one palette, at the hero's own proportions. */
function heroParts(palette) {
    const slim = scaleProfile(TORSO_PROFILE, HERO_RIG.torsoProfileScale);
    const slimHead = scaleProfile(HEAD_PROFILE, HERO_RIG.headProfileScale);
    const clothing = { clothingMode: HERO_RIG.clothingMode };
    return {
        torso: buildTorso(palette, slim, clothing),
        head: buildHead(palette, slimHead, {}),
        armR: buildArm(palette, 1),
        armL: buildArm(palette, -1),
        legR: buildLeg(palette, 1),
        legL: buildLeg(palette, -1),
    };
}

export function run(t) {
    // ── 1. A SKIN IS COLOUR ONLY ───────────────────────────────────────────
    //
    // The single most important assertion in this file. `recolorActor` writes
    // one part's colour buffer straight into another's, so if a palette key
    // could ever add or remove a voxel the hero would be repainted with a
    // stranger's colours in the wrong places.
    {
        const base = heroParts(heroSkinPalette(DEFAULT_SKIN, HERO_PALETTE));
        for (const id of heroSkinIds()) {
            const parts = heroParts(heroSkinPalette(id, HERO_PALETTE));
            for (const name of Object.keys(base)) {
                const a = [...base[name].keys()].sort().join('|');
                const b = [...parts[name].keys()].sort().join('|');
                t.ok(`skin ${id}: ${name} occupies the same cells as the default`,
                    a === b, `${base[name].size} vs ${parts[name].size} cells`);
                const ga = buildVoxelGeo(base[name]);
                const gb = buildVoxelGeo(parts[name]);
                t.ok(`skin ${id}: ${name} builds the same vertex count`,
                    ga.attributes.position.count === gb.attributes.position.count,
                    `${ga.attributes.position.count} vs ${gb.attributes.position.count}`);
                t.ok(`skin ${id}: ${name} has a colour buffer of the same length`,
                    ga.attributes.color.count === gb.attributes.color.count);
            }
        }
    }

    // A skin that changes nothing visible is a skin nobody can see they earned.
    // Held per-skin rather than in aggregate, because one silent entry is
    // exactly the kind of thing an aggregate count hides.
    {
        const base = heroParts(heroSkinPalette(DEFAULT_SKIN, HERO_PALETTE));
        const baseTorso = buildVoxelGeo(base.torso).attributes.color.array;
        const baseLeg = buildVoxelGeo(base.legR).attributes.color.array;
        for (const id of heroSkinIds()) {
            if (id === DEFAULT_SKIN) continue;
            // A SINGLE-SLOT OUTFIT HAS NO BODY PALETTE, AND THAT IS ALLOWED.
            //
            // This table started as the hero's wardrobe and has become the
            // outfit REGISTRY: it carries the name and the source line for
            // every look in the game, including the ones that dress only a
            // hand. `docs/WARDROBE.md` settles the rule those follow - relics
            // are full sets because they are the payoff for exploring, and
            // behaviour unlocks are single-slot standouts.
            //
            // So the question is no longer "does every skin repaint the body",
            // it is "does every skin that CLAIMS a body palette repaint the
            // body". An outfit with an empty palette is checked below instead:
            // it has to dress something somewhere, or it is a name with no art.
            if (Object.keys(HERO_SKINS[id].palette).length === 0) {
                t.ok(`skin ${id} has no body palette and dresses gear instead`,
                    hasGearArt(id, 'weapon') || hasGearArt(id, 'shield'));
                continue;
            }
            const parts = heroParts(heroSkinPalette(id, HERO_PALETTE));
            const torso = buildVoxelGeo(parts.torso).attributes.color.array;
            const leg = buildVoxelGeo(parts.legR).attributes.color.array;
            let dt = 0, dl = 0;
            for (let i = 0; i < torso.length; i++) if (torso[i] !== baseTorso[i]) dt++;
            for (let i = 0; i < leg.length; i++) if (leg[i] !== baseLeg[i]) dl++;
            // Torso AND leg, because those are the two big colour areas on a
            // 34-pixel figure. A skin that only retints the face is invisible
            // at the distance this game is actually played from.
            t.ok(`skin ${id} visibly changes the torso`, dt > 500, `${dt} colour floats`);
            t.ok(`skin ${id} visibly changes the legs`, dl > 500, `${dl} colour floats`);
        }
    }

    // ── 2. THE INHERITED CLOTHING IS WHAT THE FROZEN BUILDER ACTUALLY USES ──
    //
    // Read out of the builder source rather than compared against a second copy
    // of the same numbers. `HERO_PALETTE` names no clothing at all, so these
    // fallbacks are the hero's real shirt and trousers, and this is the only
    // thing standing between "documented" and "true".
    {
        const src = fs.readFileSync('src/characters/builders.js', 'utf8');
        const grab = (name) => {
            const m = src.match(new RegExp(`const ${name} = palette\\.[^;]*?0x([0-9a-fA-F]{6})`));
            return m ? parseInt(m[1], 16) : null;
        };
        for (const [key, want] of [
            ['shirt', INHERITED_CLOTHING.shirt],
            ['shirtDark', INHERITED_CLOTHING.shirtDark],
            ['jeans', INHERITED_CLOTHING.jeans],
            ['jeansDark', INHERITED_CLOTHING.jeansDark],
        ]) {
            const found = grab(key);
            t.ok(`INHERITED_CLOTHING.${key} matches the frozen builder default`,
                found === want,
                `builders.js has 0x${found?.toString(16)}, table has 0x${want.toString(16)}`);
        }
        // And the hero's own palette still names none of them, which is the
        // fact that makes the table above load-bearing rather than decorative.
        for (const key of ['shirt', 'shirtDark', 'jeans', 'jeansDark', 'pants']) {
            t.ok(`HERO_PALETTE still does not author ${key}`,
                !(key in HERO_PALETTE));
        }
    }

    // ── 3. NO SKIN TOUCHES THE RIM ─────────────────────────────────────────
    {
        for (const id of heroSkinIds()) {
            const pal = heroSkin(id).palette;
            t.ok(`skin ${id} does not set rimColor`, !('rimColor' in pal));
            t.ok(`skin ${id} does not set rimStrength`, !('rimStrength' in pal));
            // eyeGlow drives the rim for every actor that does NOT name one
            // explicitly. The hero names one, so this is belt and braces — but
            // a skin reaching for eyeGlow is a skin one refactor away from
            // reaching the rim.
            t.ok(`skin ${id} does not set eyeGlow`, !('eyeGlow' in pal));
        }
        // The merged palette must still leave HERO_RIG's own rim in charge.
        t.ok('HERO_RIG still pins the rim to azure', HERO_RIG.rimColor === 0x4a86ff,
            `0x${HERO_RIG.rimColor.toString(16)}`);
    }

    // ── 4. A SKIN GRANTS NOTHING ───────────────────────────────────────────
    //
    // Checked against the source, because the promise is about what the code
    // may ever do, not about what one call happened to return.
    {
        const src = fs.readFileSync('src/game/characters/hero-skins.js', 'utf8')
            .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        for (const forbidden of [
            'addShards', 'spendShards', 'health', 'damage', 'setMax',
            'addItem', 'scarSutures', 'memoryVial', 'upgrades',
        ]) {
            t.ok(`hero-skins.js never touches ${forbidden}`, !src.includes(forbidden));
        }
        // Every palette key a skin sets must be a colour the part builders read.
        // A stray key is either a typo that does nothing or a reach into
        // something that is not a colour.
        const COLOUR_KEYS = new Set([
            'skin', 'skinDark', 'skinD2', 'hair', 'hairDark', 'hairLight',
            'beard', 'beardDark', 'freck', 'belt', 'beltDark', 'shirt',
            'shirtDark', 'jeans', 'jeansDark', 'pants', 'pantsDark',
            'overall', 'overallDark', 'boots', 'jacket', 'spikes', 'gold',
            'eyeWhite', 'pupil', 'brow', 'mouth', 'teeth',
        ]);
        for (const id of heroSkinIds()) {
            for (const [k, v] of Object.entries(heroSkin(id).palette)) {
                t.ok(`skin ${id}: '${k}' is a colour the builders read`, COLOUR_KEYS.has(k));
                t.ok(`skin ${id}: '${k}' is a number`, typeof v === 'number');
            }
        }
    }

    // ── 5. OWNERSHIP ───────────────────────────────────────────────────────
    {
        const inv = fakeInventory();
        t.ok('a fresh save owns exactly the default',
            unlockedSkins(inv).length === 1 && unlockedSkins(inv)[0] === DEFAULT_SKIN);
        t.ok('a fresh save wears the default', wornSkin(inv) === DEFAULT_SKIN);

        t.ok('granting bonewarden reports the change', grantSkin(inv, 'bonewarden') === true);
        t.ok('granting it again reports no change', grantSkin(inv, 'bonewarden') === false);
        t.ok('the grant set its flag', inv.getFlag(skinFlag('bonewarden')));
        t.ok('the grant also wore it', wornSkin(inv) === 'bonewarden');
        t.ok('it is now owned', unlockedSkins(inv).includes('bonewarden'));

        t.ok('an unknown id cannot be granted', grantSkin(inv, 'nonesuch') === false);
        t.ok('the default cannot be re-granted', grantSkin(inv, DEFAULT_SKIN) === false);

        // AN EDITED SAVE CANNOT DRESS THE HERO IN SOMETHING IT NEVER FOUND.
        // Not an anti-cheat measure — a consistency one. A worn skin that is
        // not owned is a state no code path creates and no picker can leave.
        const forged = fakeInventory({ [SKIN_WORN_FLAG]: 'drowned' });
        t.ok('a worn-but-unowned skin falls back to the default',
            wornSkin(forged) === DEFAULT_SKIN);
        t.ok('wearing an unowned skin is refused', wearSkin(forged, 'drowned') === false);

        t.ok('wearing an owned skin succeeds', wearSkin(inv, DEFAULT_SKIN) === true);
        t.ok('and takes effect', wornSkin(inv) === DEFAULT_SKIN);

        // The picker wraps rather than running off the end of the owned list.
        const two = fakeInventory({ [skinFlag('bonewarden')]: true });
        t.ok('next from the default is the unlock', nextSkin(two) === 'bonewarden');
        wearSkin(two, 'bonewarden');
        t.ok('next from the last owned wraps to the default',
            nextSkin(two) === DEFAULT_SKIN);
    }

    // ── 6. THE LIVE REPAINT ────────────────────────────────────────────────
    //
    // The piece everything else rests on. `recolorActor` writes one build's
    // colour buffer into a rig that is already holding a weapon, already
    // parented to an animator, and already the thing combat measures its
    // hit radius from. What it must do is change every colour and move nothing.
    {
        const actor = createActorRig({ ...HERO_RIG, palette: heroSkinPalette(DEFAULT_SKIN, HERO_PALETTE) });
        const meshes = [];
        actor.root.traverse((o) => { if (o.isMesh && o.userData?.ssPart) meshes.push(o); });
        t.ok('the rig exposes six body parts', meshes.length === 6, `${meshes.length}`);

        const before = meshes.map((m) => ({
            mesh: m,
            colour: Float32Array.from(m.geometry.attributes.color.array),
            position: Float32Array.from(m.geometry.attributes.position.array),
            geometry: m.geometry,
            radius: actor.radius,
            height: actor.height,
        }));
        // The sockets a weapon and a shield hang from. If a repaint moves one of
        // these, the sword ends up growing out of the character's collarbone and
        // nothing in the game says why.
        const handY = actor.hand.position.y;
        const handLY = actor.handL.position.y;
        const innerY = actor.inner.position.y;

        const ok = recolorActor(actor, HERO_RIG, heroSkinPalette('drowned', HERO_PALETTE));
        t.ok('the repaint reports success', ok === true);

        let changedParts = 0;
        for (const b of before) {
            const now = b.mesh.geometry.attributes.color.array;
            let diff = 0;
            for (let i = 0; i < now.length; i++) if (now[i] !== b.colour[i]) diff++;
            if (diff > 0) changedParts++;
            // POSITIONS UNTOUCHED, byte for byte. This is the assertion that
            // says a skin is a repaint and not a rebuild.
            const pos = b.mesh.geometry.attributes.position.array;
            let moved = 0;
            for (let i = 0; i < pos.length; i++) if (pos[i] !== b.position[i]) moved++;
            t.ok('the repaint moved no vertex', moved === 0, `${moved} floats moved`);
            t.ok('the repaint reused the same geometry object', b.mesh.geometry === b.geometry);
            // `needsUpdate` IS WRITE-ONLY. three.js defines it as a bare
            // setter that bumps `version`, so reading it back gives undefined
            // and an `=== true` assertion fails against perfectly correct code.
            // `version` is the observable the renderer actually consults.
            t.ok('the repaint flagged the colour buffer for upload',
                b.mesh.geometry.attributes.color.version > 0,
                `version ${b.mesh.geometry.attributes.color.version}`);
        }
        t.ok('every part changed colour', changedParts === 6, `${changedParts} of 6`);
        t.ok('the hand socket did not move', actor.hand.position.y === handY);
        t.ok('the off-hand socket did not move', actor.handL.position.y === handLY);
        t.ok('the grounding did not move', actor.inner.position.y === innerY);
        t.ok('the combat radius did not change', actor.radius === before[0].radius);
        t.ok('the standing height did not change', actor.height === before[0].height);

        // A refused repaint must leave the body ALONE, not half-done. Built
        // first, checked, then written — a per-part loop with a bail-out in the
        // middle produces a bone torso on crustwalker legs.
        //
        // THE REFUSAL HAS TO FAIL ON A LATER PART, and that is the whole design
        // of this case. The first version used `clothingMode: 'belt'`, which
        // changes the TORSO — the very first part in the list — so the function
        // returned before writing anything and a mutation that wrote as it went
        // stayed green. `headProfileScale` leaves the torso identical (it is
        // built from the torso profile) and changes the head, so the refusal
        // now happens with a part already behind it.
        const snapshot = meshes.map((m) => Float32Array.from(m.geometry.attributes.color.array));
        const refused = recolorActor(actor, { ...HERO_RIG, headProfileScale: 0.5 },
            heroSkinPalette('bonewarden', HERO_PALETTE));
        if (refused === false) {
            let touched = 0;
            for (const [i, m] of meshes.entries()) {
                const now = m.geometry.attributes.color.array;
                for (let j = 0; j < now.length; j++) if (now[j] !== snapshot[i][j]) touched++;
            }
            t.ok('a refused repaint changes nothing at all', touched === 0,
                `${touched} floats written by a repaint that reported failure`);
        } else {
            // A different head profile produces a different body, so this SHOULD
            // be refused. If it is not, the vertex-count guard is not guarding.
            t.ok('a mismatched body is refused, not silently applied', false,
                'recolorActor accepted a build for a body this rig does not have');
        }

        t.ok('a null palette is refused', recolorActor(actor, HERO_RIG, null) === false);
        t.ok('a null actor is refused', recolorActor(null, HERO_RIG, {}) === false);
        actor.dispose();
    }

    // A PART WITH NO COLOUR BUFFER. Reachability, not paranoia: the guard for
    // this read `if (!live) return false;` and a counterfactual that changed it
    // to `return true` stayed green, because nothing in the suite could ever
    // make the line execute. An unmissed mutation means the fix is unguarded OR
    // the code is unreachable, and those want opposite repairs — this one
    // wanted a case that gets there.
    {
        const actor = createActorRig({ ...HERO_RIG, palette: HERO_PALETTE });
        const parts = [];
        actor.root.traverse((o) => { if (o.isMesh && o.userData?.ssPart) parts.push(o); });
        // The LAST part, so the failure lands after five successful builds and
        // the "nothing is written on refusal" promise is under real load.
        parts[parts.length - 1].geometry.deleteAttribute('color');
        const snapshot = parts.slice(0, -1)
            .map((m) => Float32Array.from(m.geometry.attributes.color.array));
        t.ok('a part with no colour buffer is refused',
            recolorActor(actor, HERO_RIG, heroSkinPalette('drowned', HERO_PALETTE)) === false);
        let touched = 0;
        for (const [i, m] of parts.slice(0, -1).entries()) {
            const now = m.geometry.attributes.color.array;
            for (let j = 0; j < now.length; j++) if (now[j] !== snapshot[i][j]) touched++;
        }
        t.ok('and the parts that could have been painted were left alone', touched === 0,
            `${touched} floats written`);
        actor.dispose();
    }

    // ── 6. THE TABLE ITSELF ────────────────────────────────────────────────
    {
        t.ok('the default skin exists', isHeroSkin(DEFAULT_SKIN));
        t.ok('an unknown id is not a skin', !isHeroSkin('nonesuch'));
        t.ok('an unknown id resolves to the default', heroSkin('nonesuch').id === DEFAULT_SKIN);
        t.ok('heroSkinPalette tolerates a missing base', typeof heroSkinPalette('x', null) === 'object');
        for (const id of heroSkinIds()) {
            const s = HERO_SKINS[id];
            t.ok(`skin ${id}: its key matches its id`, s.id === id);
            t.ok(`skin ${id}: has a name`, typeof s.name === 'string' && s.name.length > 0);
            // `from` is shown to the player in the unlock toast, so an empty one
            // ships a skin that arrives with no explanation of where it came from.
            t.ok(`skin ${id}: says where it came from`,
                typeof s.from === 'string' && s.from.length > 3);
        }
        // The merge must not lose the hero's un-overridden colours.
        const merged = heroSkinPalette('bonewarden', HERO_PALETTE);
        t.ok('an override applies', merged.shirt === HERO_SKINS.bonewarden.palette.shirt);
        t.ok('an un-overridden hero colour survives', merged.eyeGlow === HERO_PALETTE.eyeGlow);
        t.ok('the merge does not mutate HERO_PALETTE', !('shirt' in HERO_PALETTE));
    }
}
