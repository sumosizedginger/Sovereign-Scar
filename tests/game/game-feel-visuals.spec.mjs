// tests/game/game-feel-visuals.spec.mjs
//
// Three things the player could not see, and now can.
//
// 1. THE EQUIPPED WEAPON. The hero swung an empty fist whether they carried the
//    Anchor Link, the Tectonic Wedge or the Light Caster. That is a combat
//    legibility fault, not a cosmetic one: the Wedge reaches 2.2 and the Mallet
//    sweeps 90°, so a player who cannot see what is in their hand cannot
//    predict what their own attack is about to do.
// 2. THE GRAPPLE. No rope, no hook, no anchor markers — press G and you were
//    simply somewhere else, with nothing on screen to explain a failed pull.
// 3. WHAT A PICKUP IS WORTH. Every pickup in the game was the same 0.35
//    octahedron in a different colour. Z7 made rewards mean different things;
//    colour alone does not survive the Abyss grade, bloom on a bright floor, or
//    a colour-blind player, so the difference was invisible in practice.

import * as THREE from 'three';
import { buildWeaponModel, MODELLED_WEAPONS } from '../../src/game/assets/weapon-models.js';
import { buildPickupMesh, pickupKind, disposePickupMesh } from '../../src/game/assets/pickup-shapes.js';
import { HeldWeapon } from '../../src/game/fx/held-weapon.js';
import { GrappleRope } from '../../src/game/fx/grapple-rope.js';
import { WEAPONS } from '../../src/game/combat/weapons.js';

/** A stand-in for the actor rig: what matters is a pivot named `armR`. */
function fakeRig() {
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.name = 'armR';
    const torso = new THREE.Group();
    torso.name = 'torso';
    torso.add(arm);
    root.add(torso);
    return root;
}

export function run(t) {
    // --- weapons -------------------------------------------------------------
    for (const id of MODELLED_WEAPONS) {
        const m = buildWeaponModel(id);
        t.ok(`${id} builds a model`, !!m);
        t.ok(`${id} is assembled from parts, not one box`, m.children.length >= 3,
            `${m.children.length} parts`);
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        // Sized against a 1.95-tall hero seen from 17.5 units up: big enough to
        // read as a weapon, small enough not to swallow the character.
        t.ok(`${id} is a sane size for the hero`,
            size.y > 0.3 && size.y < 1.6 && size.x < 1.0,
            `${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);
    }
    t.ok('bare hands deliberately draw nothing',
        buildWeaponModel('bare_strike') === null);
    t.ok('an unknown weapon id does not throw',
        buildWeaponModel('not_a_weapon') === null);

    // Every weapon the player can actually EQUIP is either modelled or is the
    // one whose whole point is empty hands.
    //
    // The WEAPONS table is wider than the equippable set: `phase_boot` and
    // `magnetic_grapple` live in it because they carry move data (dash speed,
    // pull range), but neither is ever pushed into `inventory.weapons`, so
    // neither is ever in a hand. They are verbs, not armaments, and each has
    // its own visual — the dash smear and the grapple rope respectively.
    const EQUIPPABLE = ['bare_strike', 'anchor_link', 'tectonic_wedge', 'heavy_mallet', 'light_caster'];
    for (const id of EQUIPPABLE) {
        t.ok(`${id} is either modelled or deliberately bare`,
            MODELLED_WEAPONS.includes(id) || id === 'bare_strike', id);
    }
    for (const id of EQUIPPABLE) {
        t.ok(`${id} is a real entry in the weapon table`, !!WEAPONS[id], id);
    }
    t.ok('the tool verbs are deliberately not held items',
        !MODELLED_WEAPONS.includes('phase_boot') && !MODELLED_WEAPONS.includes('magnetic_grapple'));

    // Silhouettes must differ — five weapons that all look like a stick would
    // fail the purpose while passing every check above.
    {
        const dims = MODELLED_WEAPONS.map((id) => {
            const s = new THREE.Box3().setFromObject(buildWeaponModel(id))
                .getSize(new THREE.Vector3());
            return `${s.x.toFixed(1)}x${s.y.toFixed(1)}`;
        });
        t.ok('no two weapons share a silhouette', new Set(dims).size === dims.length,
            dims.join(' '));
    }

    // --- held weapon ---------------------------------------------------------
    {
        const rig = fakeRig();
        const held = new HeldWeapon(rig);
        held.set('anchor_link');
        let found = null;
        rig.traverse((o) => { if (o.name === 'weapon:anchor_link') found = o; });
        t.ok('the weapon parents to the arm pivot, so it inherits the swing',
            !!found && found.parent.name === 'armR', found?.parent?.name);

        // Swapping must not leave the old one behind.
        held.set('heavy_mallet');
        let stale = 0; let live = 0;
        rig.traverse((o) => {
            if (o.name === 'weapon:anchor_link') stale++;
            if (o.name === 'weapon:heavy_mallet') live++;
        });
        t.ok('swapping weapons removes the previous model', stale === 0);
        t.ok('...and attaches the new one', live === 1);

        held.set('heavy_mallet');
        let count = 0;
        rig.traverse((o) => { if (/^weapon:/.test(o.name)) count++; });
        t.ok('re-setting the same weapon is a no-op, not a duplicate', count === 1);

        held.set('bare_strike');
        let any = 0;
        rig.traverse((o) => { if (/^weapon:/.test(o.name)) any++; });
        t.ok('going bare-handed clears the hand', any === 0);

        held.dispose();
    }
    {
        // A rig with no arm pivot must degrade quietly rather than crash the
        // whole player constructor.
        const bare = new THREE.Group();
        let threw = false;
        try { const h = new HeldWeapon(bare); h.set('anchor_link'); h.dispose(); } catch { threw = true; }
        t.ok('a rig without an arm pivot does not throw', threw === false);
    }

    // --- pickup shapes -------------------------------------------------------
    //
    // Reward type is authoritative (Z7 made it explicit data); label sniffing
    // is only the fallback for pickups that predate it.
    t.ok('an explicit reward type wins',
        pickupKind({ reward: { type: 'suture' }, label: 'Cache shards' }) === 'suture');
    t.ok('a boss key is told apart from a small key',
        pickupKind({ label: 'Boss key' }) === 'bosskey'
        && pickupKind({ label: 'Small key' }) === 'key');
    t.ok('label fallback still classifies legacy pickups',
        pickupKind({ label: 'Capacitor cache' }) === 'currency');
    t.ok('an unclassifiable pickup still gets a shape',
        pickupKind({ label: 'Something New' }) === 'item');
    t.ok('an explicit shape overrides everything',
        pickupKind({ shape: 'vial', reward: { type: 'suture' } }) === 'vial');

    {
        const kinds = ['suture', 'vial', 'lore', 'currency', 'key', 'bosskey', 'item'];
        const sigs = new Set();
        for (const k of kinds) {
            const m = buildPickupMesh({ shape: k, color: 0x7fe0ff });
            t.ok(`${k} builds a mesh`, !!m && m.userData.pickupKind === k);
            const box = new THREE.Box3().setFromObject(m);
            const s = box.getSize(new THREE.Vector3());
            t.ok(`${k} is a pickup-sized object`,
                s.y > 0.15 && s.y < 1.2 && s.x < 1.2,
                `${s.x.toFixed(2)}x${s.y.toFixed(2)}`);
            // Signature = part count plus rounded proportions. Two rewards that
            // produce the same signature are the bug this file exists to stop.
            sigs.add(`${m.children.length}:${(s.x / s.y).toFixed(1)}`);
            disposePickupMesh(m);
        }
        t.ok('every reward type has its own silhouette',
            sigs.size === kinds.length, `${sigs.size}/${kinds.length} distinct`);
    }
    t.ok('a pickup with no data at all still renders',
        !!buildPickupMesh());

    // --- grapple rope --------------------------------------------------------
    {
        const scene = new THREE.Scene();
        const rope = new GrappleRope(scene);
        t.ok('the rope starts hidden', rope.rope.visible === false && rope.hook.visible === false);

        const from = { x: 0, y: 1, z: 0 };
        const to = { x: 6, y: 1, z: 0 };
        rope.update(1 / 60, { from, to, u: 0.05 });
        t.ok('a pull shows the rope and hook',
            rope.rope.visible === true && rope.hook.visible === true);

        // The hook must lead the player, or the pull reads as a slide.
        const hookAt = (u) => {
            rope.update(1 / 60, { from, to, u });
            return rope.hook.position.x;
        };
        const early = hookAt(0.1);
        const bodyEarly = (() => {
            const p = rope.rope.geometry.attributes.position;
            return p.getX(0);
        })();
        t.ok('the hook reaches ahead of the body', early > bodyEarly,
            `hook=${early.toFixed(2)} body=${bodyEarly.toFixed(2)}`);
        t.ok('the hook has arrived by the first third of the move',
            Math.abs(hookAt(0.4) - to.x) < 0.01, `${hookAt(0.4).toFixed(2)}`);

        // Slack is taken up as the player closes.
        rope.update(1 / 60, { from, to, u: 0.1 });
        const slack = rope.rope.material.opacity;
        rope.update(1 / 60, { from, to, u: 0.95 });
        t.ok('the rope thins as the slack is taken up',
            rope.rope.material.opacity < slack);

        rope.update(1 / 60, null);
        t.ok('it hides again when the pull ends',
            rope.rope.visible === false && rope.hook.visible === false);

        rope.dispose();
        t.ok('disposal removes it from the scene', scene.children.length === 0,
            `${scene.children.length} left`);
    }
}
