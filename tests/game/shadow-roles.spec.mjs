// tests/game/shadow-roles.spec.mjs — who casts, who receives, and who has to
// explain themselves.
//
// The build shipped with 151 meshes in a room, 37 casting and **7 receiving**.
// Almost nothing in the world could be shadowed: props did not darken under an
// overhang, enemies did not sit in a doorway's shade, and nothing cast onto
// anything else. That is most of why objects read as pasted on top of the world
// rather than standing in it — and it happened because the decision was made
// independently at every construction site, so eleven of the fourteen bosses
// simply never had the line.
//
// The fix is not "set the flag in more places", which is the same bug waiting
// to happen again. It is one rule, in one module, plus a census that treats an
// unexplained non-receiver as a failure. Opting out stays legal — a glow, a
// mote, a depth-ignoring FX claw all have real reasons — but the reason has to
// be written on the mesh, where the next reader will find it.

import * as THREE from 'three';
import {
    markShadowRoles, isGlowing, isSeeThrough,
} from '../../src/game/render/shadow-roles.js';
import { buildWeaponModel, buildShieldModel } from '../../src/game/assets/weapon-models.js';
import { buildPickupMesh } from '../../src/game/assets/pickup-shapes.js';

const solidMat = () => new THREE.MeshStandardMaterial({ color: 0x808080 });
const glowMat = () => new THREE.MeshStandardMaterial({
    color: 0xffd060, emissive: 0xffd060, emissiveIntensity: 1.4,
});
const faintGlowMat = () => new THREE.MeshStandardMaterial({
    color: 0xffd060, emissive: 0xffd060, emissiveIntensity: 0.4,
});
const glassMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });

const mesh = (mat) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);

export function run(t) {
    // ---------------------------------------------------------------
    // the predicates
    // ---------------------------------------------------------------
    t.ok('a plain material is not glowing', !isGlowing(solidMat()));
    t.ok('an emissive material is glowing', isGlowing(glowMat()));
    t.ok('a FAINTLY emissive material is still glowing', isGlowing(faintGlowMat()),
        'intensity 0.4 — the old cutoff was >0.5, and two boss parts plus a '
        + 'grapple claw sat just under it and looked like defects');
    t.ok('emissive black is not glowing', !isGlowing(new THREE.MeshStandardMaterial({
        emissive: 0x000000, emissiveIntensity: 3,
    })), 'intensity means nothing without a colour');
    t.ok('a transparent material is see-through', isSeeThrough(glassMat()));
    t.ok('a faded material is see-through', isSeeThrough(
        new THREE.MeshBasicMaterial({ opacity: 0.5 })));
    t.ok('a missing material is treated as see-through', isSeeThrough(null));

    // ---------------------------------------------------------------
    // the rule
    // ---------------------------------------------------------------
    {
        const m = mesh(solidMat());
        markShadowRoles(m);
        t.ok('a solid mesh casts', m.castShadow === true);
        t.ok('a solid mesh receives', m.receiveShadow === true);
        t.ok('a solid mesh carries no exemption', !m.userData.shadowExempt);
    }
    {
        const m = mesh(glowMat());
        markShadowRoles(m);
        t.ok('a glow still casts', m.castShadow === true,
            'it has a silhouette even though it is the light');
        t.ok('a glow does not receive', m.receiveShadow === false);
        t.ok('a glow says why', /emissive/.test(m.userData.shadowExempt || ''),
            m.userData.shadowExempt);
    }
    {
        const m = mesh(glassMat());
        markShadowRoles(m);
        t.ok('a transparent mesh does not cast', m.castShadow === false);
        t.ok('a transparent mesh does not receive', m.receiveShadow === false);
        t.ok('a transparent mesh says why', /transparent/.test(m.userData.shadowExempt || ''),
            m.userData.shadowExempt);
    }

    // ---------------------------------------------------------------
    // deliberate opt-out
    // ---------------------------------------------------------------
    {
        const m = mesh(solidMat());
        markShadowRoles(m, { exempt: 'held blade — too thin to receive legibly', cast: true });
        t.ok('an exempt mesh can still cast', m.castShadow === true);
        t.ok('an exempt mesh does not receive', m.receiveShadow === false);
        t.ok('an exempt mesh records the reason',
            m.userData.shadowExempt === 'held blade — too thin to receive legibly');
    }
    {
        const m = mesh(solidMat());
        markShadowRoles(m, { exempt: 'FX only', cast: false });
        t.ok('cast can be refused outright', m.castShadow === false);
    }

    // ---------------------------------------------------------------
    // it reaches the whole subtree — the actual failure mode
    // ---------------------------------------------------------------
    {
        // A boss is a Group of parts. BossBase calls this once on the root, so
        // a fourteen-boss roster gets the rule without fourteen edits. The Sand
        // Spur is the exception worth remembering: its tail segments are added
        // straight to the scene rather than under `root`, so the traverse never
        // reached them and they had to be marked explicitly.
        const body = new THREE.Group();
        const shell = mesh(solidMat());
        const core = mesh(glowMat());
        const nested = new THREE.Group();
        const plate = mesh(solidMat());
        nested.add(plate);
        body.add(shell, core, nested);

        markShadowRoles(body);
        t.ok('a direct child is marked', shell.receiveShadow === true);
        t.ok('a nested grandchild is marked', plate.receiveShadow === true);
        t.ok('a glowing child is exempted, not marked', core.receiveShadow === false);
        t.ok('the group itself is untouched', body.receiveShadow === false,
            'a Group is not a Mesh');
    }

    // ---------------------------------------------------------------
    // re-marking must be able to CLEAR a stale exemption
    // ---------------------------------------------------------------
    {
        // The shield is built by the same box helper as the weapons, which
        // stamps the blade exemption on every part. Calling the rule afterwards
        // has to be able to take it back off, or the shield inherits an excuse
        // that does not apply to it.
        const m = mesh(solidMat());
        markShadowRoles(m, { exempt: 'blade' });
        t.ok('exemption applied', m.userData.shadowExempt === 'blade');
        markShadowRoles(m);
        t.ok('re-marking clears a stale exemption', !m.userData.shadowExempt);
        t.ok('and restores receiving', m.receiveShadow === true);
    }

    // ---------------------------------------------------------------
    // the real builders, not just synthetic meshes
    // ---------------------------------------------------------------
    {
        // A held weapon casts but does not receive. The cast is the point: the
        // blade sweeping its own shadow across the floor mid-strike is the best
        // grounding cue the swing has, and it was switched off. The receive is
        // declined on purpose — the blade is 0.10 units wide against a camera
        // 17.5 units up, so shading it produces edge flicker, not shading.
        for (const id of ['anchor_link', 'tectonic_wedge', 'heavy_mallet', 'light_caster']) {
            const g = buildWeaponModel(id);
            if (!g) { t.ok(`${id} builds`, false, 'no model'); continue; }
            let parts = 0, casts = 0, explained = 0;
            g.traverse((o) => {
                if (!o.isMesh) return;
                parts++;
                if (o.castShadow) casts++;
                if (!o.receiveShadow && o.userData.shadowExempt) explained++;
            });
            t.ok(`${id} has parts`, parts > 0, `parts=${parts}`);
            t.ok(`${id} casts a shadow`, casts > 0, `${casts}/${parts} cast`);
            t.ok(`${id} explains not receiving`, explained + casts >= parts,
                `${explained} explained of ${parts}`);
        }
    }
    {
        // The shield is the exception and has to survive being built by the
        // same box helper that stamps the blade exemption on everything.
        const g = buildShieldModel();
        let parts = 0, recv = 0, stale = 0;
        g.traverse((o) => {
            if (!o.isMesh) return;
            parts++;
            if (o.receiveShadow) recv++;
            if (o.userData.shadowExempt) stale++;
        });
        t.ok('the shield receives shadow on every part', recv === parts, `${recv}/${parts}`);
        t.ok('the shield carries no leftover blade exemption', stale === 0,
            `${stale} parts still exempt`);
    }
    {
        // Pickups were the largest single population casting nothing: an item
        // on the floor read as a decal painted on the tile.
        const g = buildPickupMesh({ label: 'Scar Suture', type: 'suture' });
        let parts = 0, casts = 0;
        g.traverse((o) => { if (o.isMesh) { parts++; if (o.castShadow) casts++; } });
        t.ok('a pickup casts a shadow', casts > 0, `${casts}/${parts}`);
    }

    // ---------------------------------------------------------------
    // degenerate input
    // ---------------------------------------------------------------
    {
        let threw = false;
        try {
            markShadowRoles(null);
            markShadowRoles(undefined);
            markShadowRoles({});
        } catch (_) { threw = true; }
        t.ok('nothing throws on a missing or non-Object3D root', !threw);
    }
}
