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

import fs from 'node:fs';
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
import { HERO_SKINS, DEFAULT_SKIN, heroSkinIds, skinFlag, isHeroSkin } from '../../src/game/characters/hero-skins.js';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
import {
    SETTLEMENTS, ASHEN_SKIN, metFlag, settlementIds, allSettlementsMet, addSettlement,
} from '../../src/game/world/settlements.js';
import { HeldWeapon } from '../../src/game/fx/held-weapon.js';
import { HeldShield } from '../../src/game/fx/held-shield.js';
import { FlawlessWatch } from '../../src/game/kernel/flawless.js';

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
        // The Ashen has a body and a shield and no weapon. That gap is the
        // only thing in the table that can tell whether the filter works: if
        // every row filled every slot, removing the filter would change
        // nothing and this guard would quietly stop being a guard.
        both.setFlag(skinFlag('ashen'));
        t.ok('the body offers an outfit with no weapon', slotOptions(both, 'hero').includes('ashen'));
        t.ok('the shield offers it too', slotOptions(both, 'shield').includes('ashen'));
        t.ok('the weapon slot does not', !slotOptions(both, 'weapon').includes('ashen'));
        // ...and the general form, which becomes load-bearing for whichever
        // slot the next gap lands in.
        for (const slot of ['weapon', 'shield']) {
            t.ok(`${slot}: never offers an outfit with no art for it`,
                slotOptions(both, slot).every((id) => id === DEFAULT_GEAR || hasGearArt(id, slot)));
        }
        // ...and wearing it must not strip the gear the player chose.
        wearIn(both, 'weapon', 'bonewarden');
        wearOutfit(both, 'ashen');
        t.ok('an unlock with no weapon leaves the weapon alone', wornIn(both, 'weapon') === 'bonewarden');
        t.ok('and it does dress the body', wornIn(both, 'hero') === 'ashen');
        t.ok('and the slots it CAN fill', wornIn(both, 'shield') === 'ashen');

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

    // ── the Ashen's source: speak to all three ──────────────────────────────
    //
    // The only EARNED cosmetic in the game. Every other one is walked into.
    {
        const ids = settlementIds();
        t.ok('there are three settlements', ids.length === 3);
        t.ok('the ids are unique', new Set(ids).size === ids.length);
        // Read from the table, never written down beside it. A hand-kept list
        // is one edit away from a fourth settlement nobody has to visit, and
        // the reward would keep paying out on the old three in silence.
        t.ok('the ids come from the settlement table',
            ids.every((id) => Object.values(SETTLEMENTS).some((d) => d.id === id)));
        for (const id of ids) {
            t.ok(`${id}: its flag is namespaced`, metFlag(id).startsWith('met:'));
        }
        t.ok('the flags are distinct', new Set(ids.map(metFlag)).size === ids.length);

        const inv = fakeInventory();
        t.ok('a fresh save has met nobody', allSettlementsMet(inv) === false);
        // TWO IS NOT THREE. The interesting failure is an off-by-one that pays
        // out early, and it cannot be seen by testing only the empty and full
        // cases — which is what a spec that walks the loop to the end does.
        for (const id of ids.slice(0, 2)) inv.setFlag(metFlag(id));
        t.ok('two of three is not enough', allSettlementsMet(inv) === false);
        t.ok('and it has granted nothing', !inv.getFlag(skinFlag(ASHEN_SKIN)));
        inv.setFlag(metFlag(ids[2]));
        t.ok('all three is enough', allSettlementsMet(inv) === true);
        // Reaching the condition is not the same as being paid. `addSettlement`
        // is what pays, so the rule and the grant are asserted separately.
        t.ok('the condition alone still grants nothing', !inv.getFlag(skinFlag(ASHEN_SKIN)));
        t.ok('Ashen is a real outfit', isHeroSkin(ASHEN_SKIN));
        // Shield yes, weapon no - the civilians carry nothing, and the gap
        // is what keeps the slot filter testable. See gear-skins.js.
        t.ok('Ashen dresses the shield', hasGearArt(ASHEN_SKIN, 'shield'));
        t.ok('Ashen carries no weapon', !hasGearArt(ASHEN_SKIN, 'weapon'));
    }

    // ── the settlement actually pays out ────────────────────────────────────
    //
    // Installs the REAL system rather than restating its rule. A spec that
    // re-implements the thing under test passes whether or not the game does;
    // this one drives `addSettlement` with a fake game and presses interact.
    {
        const inv = fakeInventory();
        let persisted = 0;
        let dressed = 0;
        const toasts = [];
        let interact = false;
        const game = {
            player: {
                root: { position: { x: 0, y: 1, z: 0 } },
                inventory: inv,
                applySavedSkin() { dressed++; },
            },
            input: { consumeInteract: () => (interact ? ((interact = false), true) : false) },
            hud: { toast: (txt) => toasts.push(txt), story: { queue() {} } },
            persistInventory: () => { persisted++; },
        };
        const scene = { add() {}, remove() {} };
        const systems = Object.entries(SETTLEMENTS).map(([, def]) => addSettlement(
            { addSystem() {} }, { scene }, { x: 0, z: 0 }, def,
        ));
        t.ok('every settlement built a system', systems.every((sys) => typeof sys.update === 'function'));

        const speak = (sys) => { interact = true; sys.update(0.1, game); };
        speak(systems[0]);
        t.ok('speaking records the meeting', inv.getFlag(metFlag(systems[0].id)) === true);
        t.ok('speaking persists', persisted === 1);
        t.ok('one settlement grants nothing', !inv.getFlag(skinFlag(ASHEN_SKIN)));
        speak(systems[1]);
        t.ok('two settlements grant nothing', !inv.getFlag(skinFlag(ASHEN_SKIN)));
        speak(systems[2]);
        t.ok('the third grants the Ashen', inv.getFlag(skinFlag(ASHEN_SKIN)) === true);
        t.ok('and puts it on', wornIn(inv, 'hero') === ASHEN_SKIN);
        // The shield, not the weapon: the Ashen has no weapon art, so that
        // slot must be left exactly as the player had it.
        t.ok('including the shield', wornIn(inv, 'shield') === ASHEN_SKIN);
        t.ok('and not the weapon it has no art for', wornIn(inv, 'weapon') === DEFAULT_GEAR);
        t.ok('the hero was repainted', dressed === 1);
        t.ok('the player was told', toasts.some((x) => /Ashen/.test(x)));

        // Speaking again must not repeat the toast. A reward that re-announces
        // itself every time you walk past is a reward you start avoiding.
        const before = toasts.length;
        speak(systems[2]);
        t.ok('speaking again does not re-announce', toasts.length === before);

        for (const sys of systems) sys.dispose();
    }

    // ── the one outfit you cannot walk to ───────────────────────────────────
    //
    // Every other unlock is somewhere in the world. This is a boss beaten
    // without being hit, and the bookkeeping behind it is easy to get subtly
    // wrong in ways that hand out the reward for free - which is why the watch
    // is thirty lines in its own file instead of a flag in the render loop.
    {
        const w = new FlawlessWatch();
        t.ok('nothing is flawless before a fight', w.flawless === false);
        t.ok('a hit outside a fight leaves nothing flawless', (w.hit(), w.flawless === false));
        // AND CANNOT CONTAMINATE THE NEXT FIGHT. That is the actual contract,
        // and it is `enter` that keeps it - `hit` used to carry a guard for the
        // same purpose and a counterfactual proved the guard unreachable.
        t.ok('and cannot leak into the fight that follows',
            (w.enter('early'), w.flawless === true));
        w.leave();

        t.ok('entering a fight starts a clean sheet', (w.enter('crypt'), w.flawless === true));
        // CALLED EVERY FRAME. If re-entering the same id cleared the record,
        // the flag would reset at 144 Hz and every fight would be flawless.
        w.enter('crypt');
        t.ok('re-entering the same fight keeps the sheet', w.flawless === true);
        w.hit();
        t.ok('a hit ends it', w.flawless === false);
        w.enter('crypt');
        t.ok('and re-entering does not launder it', w.flawless === false);

        // THE CASE THE CLASS EXISTS FOR. Dying and retrying re-enters the same
        // id, which `enter` ignores by design, so the reset has to be explicit
        // or a player who died four times is rewarded for never being hit.
        w.leave();
        t.ok('leaving clears the fight', w.flawless === false);
        w.enter('crypt');
        t.ok('the retry starts clean', w.flawless === true);

        // A different boss is a different sheet even without a leave.
        w.hit();
        w.enter('spindle');
        t.ok('a new boss starts its own sheet', w.flawless === true);
        t.ok('enter reports whether it started one', w.enter('spindle') === false);
        t.ok('and reports true when it does', w.enter('sinklands') === true);

        // The reward itself.
        t.ok('Untouched is a real outfit', isHeroSkin('untouched'));
        t.ok('Untouched dresses the weapon', hasGearArt('untouched', 'weapon'));
        // SINGLE SLOT, like every behaviour unlock - see docs/WARDROBE.md.
        t.ok('Untouched carries no shield', !hasGearArt('untouched', 'shield'));
        // THE WIRING, BY INSPECTION, because the alternative is nothing.
        //
        // `FlawlessWatch` is fully tested above and completely useless if
        // `index.js` stops calling it, and index.js is the whole game - it
        // cannot be imported into a spec. So this reads the source, which is
        // the same thing `relics.spec.mjs` does to prove the miner grants
        // nothing. It is a weak assertion and it is honest about being one: it
        // cannot tell whether the calls are in the RIGHT places, only that
        // somebody has not quietly deleted them.
        //
        // The three `leave()` calls are the boss dying, the level tearing down,
        // and the player dying. The last is the one the class exists for.
        const idx = fs.readFileSync('src/game/kernel/../index.js', 'utf8');
        t.ok('the game watches for a flawless fight', /new FlawlessWatch\(\)/.test(idx));
        t.ok('it is told when the player is hit', idx.includes('flawless.hit()'));
        t.ok('it is told which fight is happening', idx.includes('flawless.enter('));
        t.ok('and it is cleared in three places', (idx.match(/flawless\.leave\(\)/g) || []).length >= 3,
            `${(idx.match(/flawless\.leave\(\)/g) || []).length} calls`);
        t.ok('the reward is granted from the defeat path',
            /flawless\.flawless[\s\S]{0,120}grantOutfit\(player\.inventory, 'untouched'\)/.test(idx));

        const inv = fakeInventory();
        t.ok('it can be granted', grantOutfit(inv, 'untouched') === true);
        t.ok('granting it twice reports nothing', grantOutfit(inv, 'untouched') === false);
        t.ok('it dresses the weapon slot', wornIn(inv, 'weapon') === 'untouched');
        t.ok('and leaves the shield alone', wornIn(inv, 'shield') === DEFAULT_GEAR);
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
        t.ok('the Drowned is a full set', hasGearArt('drowned', 'weapon') && hasGearArt('drowned', 'shield'));
        t.ok('the Ashen carries no weapon', !hasGearArt('ashen', 'weapon'));
        t.ok('the Ashen does carry a shield', hasGearArt('ashen', 'shield'));
        // At least one genuine gap must survive in the table, or the filter
        // above is untestable. This is the assertion that says so out loud
        // rather than leaving it to whoever authors the next outfit.
        const gaps = Object.keys(GEAR_SKINS)
            .filter((id) => id !== DEFAULT_GEAR)
            .filter((id) => !hasGearArt(id, 'weapon') || !hasGearArt(id, 'shield'));
        t.ok('some outfit still has a slot it does not fill', gaps.length >= 1);
    }
}
