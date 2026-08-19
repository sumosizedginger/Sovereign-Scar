// tests/game/gear-skins.spec.mjs — the held half of the cosmetic axis.
//
// `hero-skins.spec.mjs` holds the body. This holds the weapon and the shield,
// and the two files guard different failures because the two things are built
// in completely different ways: the hero is one merged geometry with baked
// vertex colours, and held gear is a group of boxes with a material each.
//
// WHAT IS HELD HERE
//
//   1. A SKIN CANNOT CHANGE SHAPE. Every weapon and the shield are built under
//      every skin and compared box for box — dimensions, position, rotation.
//      `weaponTipY` measures the built geometry and `actor-anim.spec.mjs` uses
//      that to place the blade tip in world space; a cosmetic that could move
//      it would separate the blade the player watches from the arc that
//      actually connects. That is the failure this project has shipped five
//      times and cannot see by reading.
//
//   2. THE DEFAULT IS NOT A SPECIAL CASE. Built through the skin path with
//      `crustwalker`, the gear is identical to the gear built with no skin at
//      all. Otherwise the shipped look drifts the moment the table is edited.
//
//   3. A TYPO IS NOT A DESIGN. `dress` matches a skin's keys against the box's
//      role; a misspelt role silently matches nothing and the box keeps its old
//      colour, so the skin ships half-painted and looks deliberate.
//
//   4. A SKIN ACTUALLY CHANGES SOMETHING. A row in the table that repaints
//      nothing is an unlock the player cannot see, which is worse than no
//      unlock at all.
//
//   5. NO SKIN WEARS A FACTION'S ACCENT. Ten enemy palettes claim cyan, red,
//      acid green, amber, violet, orange, cold white and cream between them.
//      `hero-skins.js` records why the hero's rim is azure and not cyan at
//      length: in a frost room a cyan-marked hero is lit in the colour of the
//      things trying to kill them. Emissive gear is the same hazard with a
//      smaller surface, and "smaller" is a discount, not an argument.
//
//   6. THE CACHE CANNOT SWALLOW A CHANGE. `HeldWeapon` and `HeldShield` skip
//      work when nothing changed, and until this shipped "nothing changed"
//      meant "the same weapon id" — which is true of every skin swap, since
//      re-dressing a blade does not rename it.
//
//   7. OWNERSHIP AND SLOTS. An unowned outfit cannot be worn even if the save
//      says it is; an outfit with no art for a slot is not offered there; and
//      an unlock dresses every slot it can fill without resetting the ones it
//      cannot.

import * as THREE from 'three';
import {
    buildWeaponModel, buildShieldModel, weaponTipY, MODELLED_WEAPONS, GEAR_ROLES,
} from '../../src/game/assets/weapon-models.js';
import {
    GEAR_SKINS, DEFAULT_GEAR, gearSkin, gearRoleMap, hasGearArt, gearSkinIds,
    unknownRoles, isGearSkin,
} from '../../src/game/assets/gear-skins.js';
import {
    SLOTS, SLOT_FLAG, SLOT_LABEL, slotOptions, wornIn, wearIn, wearOutfit,
    grantOutfit, outfitOf, outfitName, outfitFrom, outfitIdFromName,
    wardrobeView,
} from '../../src/game/kernel/wardrobe.js';
import { HERO_SKINS, DEFAULT_SKIN, heroSkinIds, skinFlag } from '../../src/game/characters/hero-skins.js';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
import { HeldWeapon } from '../../src/game/fx/held-weapon.js';
import { HeldShield } from '../../src/game/fx/held-shield.js';

/** Just enough Inventory to exercise the flag helpers. */
function fakeInventory(flags = {}) {
    return {
        flags: { ...flags },
        getFlag(k) { return !!this.flags[k]; },
        setFlag(k, v = true) { this.flags[k] = v; },
    };
}

/** Build one piece of gear under a skin id. `null` slot means the shield. */
function build(what, skinId) {
    return what === 'shield'
        ? buildShieldModel(skinId === undefined ? undefined : gearRoleMap(skinId, 'shield'))
        : buildWeaponModel(what, skinId === undefined ? undefined : gearRoleMap(skinId, 'weapon'));
}

/** Everything about a built group that a skin must NOT be able to move. */
function shapeOf(g) {
    const out = [];
    g.traverse((m) => {
        if (!m.isMesh) return;
        const p = m.geometry.parameters;
        out.push([
            p.width, p.height, p.depth,
            m.position.x, m.position.y, m.position.z,
            m.rotation.x, m.rotation.y, m.rotation.z,
            m.userData.gearRole || '',
        ].join(','));
    });
    return out.join('|');
}

/** Everything about a built group that a skin MAY move. */
function paintOf(g) {
    const out = [];
    g.traverse((m) => {
        if (!m.isMesh) return;
        out.push([
            m.material.color.getHex(), m.material.emissive.getHex(),
            m.material.emissiveIntensity, m.material.metalness, m.material.roughness,
        ].join(','));
    });
    return out.join('|');
}

/** Per-mesh colours, so a change can be counted rather than merely detected. */
function colorsOf(g) {
    const out = [];
    g.traverse((m) => { if (m.isMesh) out.push(m.material.color.getHex()); });
    return out;
}

function dispose(g) {
    g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
}

/** A rig stub carrying the two sockets the holders look for by name. */
function fakeRig() {
    const root = new THREE.Group();
    for (const name of ['hand', 'handL']) {
        const o = new THREE.Object3D();
        o.name = name;
        root.add(o);
    }
    return root;
}

/** Every emissive colour any enemy in the game is lit with. */
function factionAccents() {
    const out = new Set();
    for (const p of Object.values(ENEMY_PALETTES)) {
        if (typeof p?.eyeGlow === 'number') out.add(p.eyeGlow);
    }
    return out;
}

const PIECES = [...MODELLED_WEAPONS, 'shield'];

export function run(t) {
    // ── 1. a skin cannot change shape ───────────────────────────────────────
    {
        for (const piece of PIECES) {
            const base = build(piece);
            const baseShape = shapeOf(base);
            const baseTip = piece === 'shield' ? null : weaponTipY(piece);
            dispose(base);
            for (const id of Object.keys(GEAR_SKINS)) {
                const g = build(piece, id);
                t.ok(`${piece} under ${id}: geometry is untouched`, shapeOf(g) === baseShape);
                if (baseTip != null) {
                    // Measured off the built object rather than trusting the
                    // shape string, because the tip is what the swing specs
                    // consume and it deserves its own question.
                    const tip = new THREE.Box3().setFromObject(g).max.y;
                    t.ok(`${piece} under ${id}: the blade tip has not moved`,
                        Math.abs(tip - baseTip) < 1e-9);
                }
                dispose(g);
            }
        }
    }

    // ── 2. the default is not a special case ────────────────────────────────
    {
        for (const piece of PIECES) {
            const bare = build(piece);
            const dressed = build(piece, DEFAULT_GEAR);
            t.ok(`${piece}: the default skin paints exactly what shipped`,
                paintOf(bare) === paintOf(dressed));
            dispose(bare); dispose(dressed);
        }
        t.ok('the default outfit resolves to no weapon overrides',
            gearRoleMap(DEFAULT_GEAR, 'weapon') === null);
        t.ok('the default outfit resolves to no shield overrides',
            gearRoleMap(DEFAULT_GEAR, 'shield') === null);
        // An unknown id must land on the default rather than throwing or
        // producing a half-built weapon — a corrupt save is a real input.
        const junk = build('anchor_link', 'not_an_outfit');
        const ship = build('anchor_link');
        t.ok('an unknown outfit id falls back to what shipped', paintOf(junk) === paintOf(ship));
        dispose(junk); dispose(ship);
        t.ok('isGearSkin rejects an unknown id', isGearSkin('not_an_outfit') === false);
        t.ok('isGearSkin accepts a real one', isGearSkin('bonewarden') === true);
        t.ok('gearSkin falls back to the default row', gearSkin('nope').id === DEFAULT_GEAR);
    }

    // ── 3. a typo is not a design ───────────────────────────────────────────
    {
        for (const [id, row] of Object.entries(GEAR_SKINS)) {
            for (const slot of ['weapon', 'shield']) {
                const map = row[slot];
                if (!map) continue;
                const bad = unknownRoles(map);
                t.ok(`${id}.${slot}: every role it names is a real role`, bad.length === 0);
            }
        }
        t.ok('unknownRoles catches a misspelling', unknownRoles({ balde: {} }).length === 1);
        t.ok('unknownRoles is quiet about a real role', unknownRoles({ blade: {} }).length === 0);
        t.ok('unknownRoles tolerates no map at all', unknownRoles(null).length === 0);
        t.ok('every role name is unique', new Set(GEAR_ROLES).size === GEAR_ROLES.length);
    }

    // ── 4. a skin actually changes something ────────────────────────────────
    {
        for (const id of Object.keys(GEAR_SKINS)) {
            if (id === DEFAULT_GEAR) continue;
            for (const slot of ['weapon', 'shield']) {
                if (!hasGearArt(id, slot)) continue;
                const pieces = slot === 'shield' ? ['shield'] : MODELLED_WEAPONS;
                for (const piece of pieces) {
                    const a = colorsOf(build(piece));
                    const g = build(piece, id);
                    const b = colorsOf(g);
                    const moved = a.filter((c, i) => c !== b[i]).length;
                    // Three is the floor for a look. One repainted box is a
                    // tint nobody notices from 17.5 units up, and this table's
                    // whole justification is that the player can SEE it.
                    t.ok(`${id} repaints at least three boxes of ${piece} (moved ${moved})`, moved >= 3);
                    dispose(g);
                }
            }
        }
        // Roles the shipped gear does not use would be dead keys in the table.
        const used = new Set();
        for (const piece of PIECES) {
            const g = build(piece);
            g.traverse((m) => { if (m.isMesh && m.userData.gearRole) used.add(m.userData.gearRole); });
            dispose(g);
        }
        for (const r of GEAR_ROLES) t.ok(`role ${r} is used by real geometry`, used.has(r));
        // And every box carries one — an unroled box can never be skinned, and
        // would be invisible to this whole file.
        for (const piece of PIECES) {
            const g = build(piece);
            let unroled = 0;
            g.traverse((m) => { if (m.isMesh && !m.userData.gearRole) unroled++; });
            t.ok(`${piece}: every box declares a role`, unroled === 0);
            dispose(g);
        }
    }

    // ── 5. no skin wears a faction's accent ─────────────────────────────────
    {
        const accents = factionAccents();
        t.ok('the enemy accent list is real', accents.size >= 8);
        for (const id of Object.keys(GEAR_SKINS)) {
            for (const piece of PIECES) {
                const g = build(piece, id);
                let clash = 0;
                g.traverse((m) => {
                    if (!m.isMesh) return;
                    const e = m.material.emissive.getHex();
                    // Black is "not emissive", not a colour choice.
                    if (e !== 0x000000 && accents.has(e)) clash++;
                });
                t.ok(`${id} on ${piece}: no emissive matches an enemy accent`, clash === 0);
                dispose(g);
            }
        }
    }

    // ── 6. the cache cannot swallow a change ────────────────────────────────
    {
        const rig = fakeRig();
        const held = new HeldWeapon(rig);
        held.set('anchor_link', DEFAULT_GEAR);
        const shipped = colorsOf(held.model);
        t.ok('the holder built something', shipped.length > 0);
        held.set('anchor_link', 'bonewarden');
        const dressed = colorsOf(held.model);
        t.ok('re-skinning the SAME weapon rebuilds it',
            dressed.join() !== shipped.join());
        // And the id still works on its own — a skin must not have become a
        // required argument for a system that calls `set` with one thing.
        held.set('heavy_mallet', 'bonewarden');
        t.ok('swapping weapon under a skin keeps the skin', held.skin === 'bonewarden');
        held.set('anchor_link', DEFAULT_GEAR);
        t.ok('going back to the default restores the shipped paint',
            colorsOf(held.model).join() === shipped.join());
        // Repeating the same call must still be free.
        const before = held.model;
        held.set('anchor_link', DEFAULT_GEAR);
        t.ok('an unchanged call does not rebuild', held.model === before);
        held.dispose();

        const shield = new HeldShield(rig);
        shield.set(true, DEFAULT_GEAR);
        const sShipped = colorsOf(shield.model);
        shield.set(true, 'bonewarden');
        t.ok('re-skinning a raised shield rebuilds it',
            colorsOf(shield.model).join() !== sShipped.join());
        // The shield's guard is raised and lowered constantly; a skin change
        // while it is DOWN must still be remembered when it comes back up.
        shield.set(false, 'bonewarden');
        t.ok('lowering the shield clears the model', shield.model === null);
        shield.set(true, 'bonewarden');
        t.ok('raising it again keeps the skin',
            colorsOf(shield.model).join() !== sShipped.join());
        // Exactly one model in the hand, ever. The rebuild path clears first.
        let mounted = 0;
        rig.traverse((o) => { if (o.name === 'shield:bulwark_shield') mounted++; });
        t.ok('the off hand holds exactly one shield', mounted === 1);
        shield.dispose();
    }

    // ── 7. ownership and slots ──────────────────────────────────────────────
    {
        t.ok('there are three slots', SLOTS.length === 3);
        for (const s of SLOTS) {
            t.ok(`slot ${s} has a flag`, typeof SLOT_FLAG[s] === 'string' && SLOT_FLAG[s].length > 0);
            t.ok(`slot ${s} has a player-facing label`, typeof SLOT_LABEL[s] === 'string');
        }
        t.ok('the three slots use three different flags',
            new Set(Object.values(SLOT_FLAG)).size === 3);
        // The body slot must keep the flag that already shipped, or a save
        // written before the wardrobe existed loses the skin it had on.
        t.ok('the body slot still uses the original flag', SLOT_FLAG.hero === 'skin:worn');

        const inv = fakeInventory();
        for (const s of SLOTS) {
            t.ok(`fresh save: ${s} is the default`, wornIn(inv, s) === DEFAULT_SKIN);
            t.ok(`fresh save: ${s} offers only the default`, slotOptions(inv, s).length === 1);
        }
        t.ok('an unowned outfit cannot be worn', wearIn(inv, 'shield', 'bonewarden') === false);
        t.ok('an unknown slot cannot be worn in', wearIn(inv, 'hat', 'bonewarden') === false);

        // A save that CLAIMS an unowned outfit is not honoured.
        const forged = fakeInventory({ 'skin:worn:shield': 'bonewarden' });
        t.ok('a forged save does not dress the shield', wornIn(forged, 'shield') === DEFAULT_SKIN);

        t.ok('granting reports the change', grantOutfit(inv, 'bonewarden') === true);
        t.ok('granting again reports none', grantOutfit(inv, 'bonewarden') === false);
        const worn = outfitOf(inv);
        t.ok('the unlock dressed the body', worn.hero === 'bonewarden');
        t.ok('the unlock dressed the weapon', worn.weapon === 'bonewarden');
        t.ok('the unlock dressed the shield', worn.shield === 'bonewarden');
        t.ok('the ownership flag is set', inv.getFlag(skinFlag('bonewarden')) === true);

        // Mixing: put the shipped blade back without undressing the body.
        t.ok('a slot can be set back on its own', wearIn(inv, 'weapon', DEFAULT_GEAR) === true);
        t.ok('the body is unaffected by the weapon slot', wornIn(inv, 'hero') === 'bonewarden');
        t.ok('the weapon went back to what shipped', wornIn(inv, 'weapon') === DEFAULT_GEAR);

        // An outfit with no held art is offered for the body and nowhere else.
        const both = fakeInventory();
        grantOutfit(both, 'bonewarden');
        both.setFlag(skinFlag('drowned'));
        t.ok('the body offers an outfit with no gear', slotOptions(both, 'hero').includes('drowned'));
        t.ok('the weapon slot does not', !slotOptions(both, 'weapon').includes('drowned'));
        t.ok('the shield slot does not', !slotOptions(both, 'shield').includes('drowned'));
        // ...and wearing it must not strip the gear the player chose.
        const kept = wornIn(both, 'shield');
        wearOutfit(both, 'drowned');
        t.ok('an unlock with no gear leaves the gear alone', wornIn(both, 'shield') === kept);
        t.ok('and it does dress the body', wornIn(both, 'hero') === 'drowned');

        // The picker's cycle belongs to `MenuState.adjust`, which walks
        // `options` — so what this file owes it is that `options` is always a
        // list you can walk: never empty, and always containing what is worn,
        // or `indexOf` returns -1 and the first press jumps somewhere random.
        for (const slot of SLOTS) {
            const opts = slotOptions(both, slot);
            t.ok(`${slot}: the option list is never empty`, opts.length >= 1);
            t.ok(`${slot}: the worn outfit is in its own option list`,
                opts.includes(wornIn(both, slot)));
        }
    }

    // ── names, and the picker's round trip ──────────────────────────────────
    {
        const names = heroSkinIds().map(outfitName);
        t.ok('every outfit has a name', names.every((n) => typeof n === 'string' && n.length > 1));
        t.ok('outfit names are unique', new Set(names).size === names.length);
        for (const id of heroSkinIds()) {
            // The menu renders names and hands names back; if this trip is not
            // lossless the player selects a row and gets a different outfit.
            t.ok(`${id}: name round-trips to its id`, outfitIdFromName(outfitName(id)) === id);
            t.ok(`${id}: says where it came from`, typeof outfitFrom(id) === 'string');
            // The two tables must agree, or the same outfit reads as two.
            if (isGearSkin(id)) {
                t.ok(`${id}: both tables call it the same thing`,
                    gearSkin(id).name === HERO_SKINS[id].name);
            }
        }
        t.ok('an unknown name resolves to the default', outfitIdFromName('Nonesuch') === DEFAULT_SKIN);

        const inv = fakeInventory();
        let view = wardrobeView(inv);
        t.ok('the view has one row per slot', view.length === SLOTS.length);
        t.ok('a fresh save marks every row as having no choice', view.every((r) => r.only === true));
        t.ok('the view carries names, not ids', view[0].value === HERO_SKINS[DEFAULT_SKIN].name);
        grantOutfit(inv, 'bonewarden');
        view = wardrobeView(inv);
        t.ok('after the dragon, no row is stuck', view.every((r) => r.only === false));
        t.ok('every row now offers two', view.every((r) => r.options.length === 2));
        t.ok('the rows report the worn id too', view.every((r) => r.id === 'bonewarden'));
        t.ok('the rows carry the source line', view.every((r) => r.from.length > 3));
    }

    // ── the table's own shape ───────────────────────────────────────────────
    {
        for (const id of Object.keys(GEAR_SKINS)) {
            t.ok(`${id} has a matching body palette`, !!HERO_SKINS[id]);
        }
        t.ok('the default is first in the weapon list', gearSkinIds('weapon')[0] === DEFAULT_GEAR);
        t.ok('the default is first in the shield list', gearSkinIds('shield')[0] === DEFAULT_GEAR);
        t.ok('bonewarden is the first authored weapon skin',
            gearSkinIds('weapon').includes('bonewarden'));
        t.ok('bonewarden is the first authored shield skin',
            gearSkinIds('shield').includes('bonewarden'));
        // The unauthored rows are absent on purpose, not by omission — the same
        // discipline the seven null region relics are held to.
        t.ok('drowned has no held art yet', !hasGearArt('drowned', 'weapon') && !hasGearArt('drowned', 'shield'));
        t.ok('ashen has no held art yet', !hasGearArt('ashen', 'weapon') && !hasGearArt('ashen', 'shield'));
    }
}
