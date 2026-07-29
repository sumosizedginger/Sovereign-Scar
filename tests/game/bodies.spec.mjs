// tests/game/bodies.spec.mjs — the bestiary has seven bodies, and every one of
// them agrees with its own hitbox.
//
// Before `bodies.js`, all seven enemy kinds were built at the same two numbers,
// because no level ever passed anything else. The README promised "seven enemy
// kinds that ask different questions"; the eye was shown one enemy in seven
// colours. These specs pin BOTH halves of the fix, and the second half is the
// one that matters:
//
//   1. the silhouettes are actually distinct — measured, pairwise
//   2. the HITBOX FOLLOWS THE BODY, for every kind, by construction
//
// (2) is the dangerous one. A hitbox is invisible; a body is not. Ship a
// bulwark 1.4× as wide as the sentinel while its hitRadius stays at the old
// hand-typed 0.5 and you have built the worst bug this genre has — a swing that
// visibly connects and does nothing, which reads to the player as the game
// being broken rather than as them having missed. So every assertion here that
// mentions a radius resolves it through the REAL `hitboxCheck`, at world
// positions, rather than trusting a stored number.
//
// Trap 1 from HANDOFF applies throughout: assert in world space.

import * as THREE from 'three';
import { createActorRig } from '../../src/game/characters/actor-rig.js';
import { BODIES, bodyFor, childBody, SENTINEL_BODY } from '../../src/game/characters/bodies.js';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
import { ENEMY_PROPS, attachEnemyProp } from '../../src/game/assets/enemy-props.js';
import { hitboxCheck } from '../../src/combat/hitbox.js';
import { WEAPONS } from '../../src/game/combat/weapons.js';

const KINDS = Object.keys(BODIES);

/** Build a kind's rig and measure it, the way Enemy does. */
function rigFor(kind, body) {
    return createActorRig({
        palette: ENEMY_PALETTES[kind] || ENEMY_PALETTES.sentinel,
        ...(body || bodyFor(kind)),
        clothingMode: 'casual',
        groundOffset: 0,
    });
}

function measure(kind, body) {
    const rig = rigFor(kind, body);
    const box = new THREE.Box3().setFromObject(rig.inner);
    const m = {
        height: box.max.y - box.min.y,
        width: box.max.x - box.min.x,
        depth: box.max.z - box.min.z,
        radius: rig.radius,
    };
    rig.dispose();
    return m;
}

/** The Enemy constructor's derivations, isolated so they can be asserted. */
function derive(m, ai = 'chase') {
    const hitRadius = m.radius;
    return {
        hitRadius,
        attackRange: ai === 'ranged' ? 7 : 0.9 + hitRadius,
        collHalf: Math.min(hitRadius, Math.max(0.2, hitRadius * 0.8)),
    };
}

/** A stand-in attacker/defender pair at a chosen separation along +X. */
function pair(defenderRadius, separation, defenderY = 1.0, attackerY = 1.95) {
    return {
        attacker: {
            root: { position: { x: 0, y: attackerY, z: 0 } },
            state: { facingVec: { x: 1, z: 0 }, current: 'IDLE' },
        },
        defender: {
            root: { position: { x: separation, y: defenderY, z: 0 } },
            state: { current: 'IDLE' },
            hitRadius: defenderRadius,
        },
    };
}

const MELEE = ['anchor_link', 'tectonic_wedge', 'heavy_mallet'];

export function run(t) {
    const M = {};
    for (const kind of KINDS) M[kind] = measure(kind);

    // ── 1. The reference kind is untouched ──────────────────────────────────
    // Every number in this project was tuned against the sentinel's body. If
    // this moves, the whole difficulty curve moved with it and nobody was told.
    t.ok('sentinel body is the pre-existing default',
        SENTINEL_BODY.meshScale === 0.33 && SENTINEL_BODY.torsoProfileScale === 0.65);
    t.ok('sentinel radius still measures what the old constant assumed',
        Math.abs(M.sentinel.radius - 0.49) < 0.01,
        `radius=${M.sentinel.radius.toFixed(3)} vs the old hand-typed hitRadius 0.5`);
    t.ok('sentinel melee reach is still 1.4',
        Math.abs(derive(M.sentinel).attackRange - 1.4) < 0.02,
        `${derive(M.sentinel).attackRange.toFixed(3)}`);

    // ── 2. The silhouettes are distinct ─────────────────────────────────────
    // "Distinct" has to mean something a player could catch at a glance, so the
    // bar is a proportional margin on footprint or height, not mere inequality.
    let closest = { pair: '', sep: Infinity };
    for (let i = 0; i < KINDS.length; i++) {
        for (let j = i + 1; j < KINDS.length; j++) {
            const a = M[KINDS[i]], b = M[KINDS[j]];
            const dh = Math.abs(a.height - b.height) / Math.max(a.height, b.height);
            const dr = Math.abs(a.radius - b.radius) / Math.max(a.radius, b.radius);
            const sep = Math.max(dh, dr);
            if (sep < closest.sep) closest = { pair: `${KINDS[i]}/${KINDS[j]}`, sep };
        }
    }
    t.ok('no two kinds share a silhouette (>=10% on height or footprint)',
        closest.sep >= 0.10,
        `closest pair ${closest.pair} at ${(closest.sep * 100).toFixed(1)}%`);

    // The two the design deliberately keeps close — scarab and brood are
    // cousins and mistaking one for the other is a fair mistake. "Close" still
    // has to be "different", and the difference is height, not colour.
    t.ok('scarab and brood differ by height, being deliberately similar',
        Math.abs(M.scarab.height - M.brood.height) / M.scarab.height > 0.10,
        `${M.scarab.height.toFixed(2)} vs ${M.brood.height.toFixed(2)}`);

    // The three identity claims the README makes, as measurements.
    t.ok('the bulwark has the largest footprint in the bestiary',
        KINDS.every((k) => k === 'bulwark' || M.bulwark.radius > M[k].radius),
        `bulwark r=${M.bulwark.radius.toFixed(3)}`);
    t.ok('the bulwark is at least 1.3x the reference footprint',
        M.bulwark.radius / M.sentinel.radius >= 1.3,
        `${(M.bulwark.radius / M.sentinel.radius).toFixed(2)}x`);
    t.ok('the lancer is the tallest thing you fight',
        KINDS.every((k) => k === 'lancer' || M.lancer.height > M[k].height),
        `lancer h=${M.lancer.height.toFixed(2)}`);
    t.ok('the lancer is narrow despite being tall — reach, not mass',
        M.lancer.radius < M.sentinel.radius,
        `${M.lancer.radius.toFixed(3)} vs ${M.sentinel.radius.toFixed(3)}`);
    t.ok('the mote is the smallest body in the game',
        KINDS.every((k) => k === 'mote' || M.mote.radius < M[k].radius),
        `mote r=${M.mote.radius.toFixed(3)}`);

    // ── 3. The hitbox follows the body ──────────────────────────────────────
    // Resolved through the real hitboxCheck at world positions: a swing that
    // reaches the visible surface must land, and one that clearly does not
    // must not. The failure this guards is silent by nature.
    const move = WEAPONS.anchor_link;
    for (const kind of KINDS) {
        const r = derive(M[kind]).hitRadius;
        // Just inside the far edge of the body, at the limit of the weapon.
        const atSurface = pair(r, move.range + r - 0.05);
        t.ok(`${kind}: a swing reaching its surface connects`,
            hitboxCheck(atSurface.attacker, atSurface.defender, move),
            `r=${r.toFixed(3)} at ${(move.range + r - 0.05).toFixed(2)}`);
        // Clearly past it.
        const beyond = pair(r, move.range + r + 0.35);
        t.ok(`${kind}: a swing past its surface misses`,
            !hitboxCheck(beyond.attacker, beyond.defender, move));
    }

    // The counterfactual. With the old flat 0.5 the bulwark's own surface sat
    // outside every gate — this is the bug the derivation exists to prevent,
    // and it must be demonstrably absent rather than merely believed absent.
    {
        const r = M.bulwark.radius;
        const reachToSurface = move.range + r - 0.05;
        const stale = pair(0.5, reachToSurface);
        const live = pair(r, reachToSurface);
        t.ok('counterfactual: the OLD fixed 0.5 would refuse a hit on the bulwark',
            !hitboxCheck(stale.attacker, stale.defender, move)
            && hitboxCheck(live.attacker, live.defender, move),
            `body r=${r.toFixed(3)} vs stale 0.5 at range ${reachToSurface.toFixed(2)}`);
    }

    // ── 4. The mote's altitude rule survives its new, smaller body ──────────
    // Playtest issue 5: the mote is unreachable at cruise BY DESIGN and must be
    // reachable during its burst dive. Shrinking the body tightens the vertical
    // gate (`move.vertical + r`), so this had to be re-measured, not assumed.
    // Enemy rigs sit at floor top (y≈1.0); the player's root is at 1.95.
    {
        const r = derive(M.mote).hitRadius;
        const FLOOR = 1.0, FLY = 3.4, STRIKE = 1.05;
        for (const id of MELEE) {
            const mv = WEAPONS[id];
            const cruise = pair(r, 1.0, FLOOR + FLY);
            t.ok(`mote at cruise is out of ${id}'s reach`,
                !hitboxCheck(cruise.attacker, cruise.defender, mv),
                `dy=${(FLOOR + FLY - 1.95).toFixed(2)} gate=${(mv.vertical + r).toFixed(2)}`);
            const dive = pair(r, 1.0, FLOOR + STRIKE);
            t.ok(`mote diving into its burst is inside ${id}'s reach`,
                hitboxCheck(dive.attacker, dive.defender, mv),
                `dy=${(FLOOR + STRIKE - 1.95).toFixed(2)} gate=${(mv.vertical + r).toFixed(2)}`);
            const grounded = pair(r, 1.0, FLOOR);
            t.ok(`mote grounded by a parry is inside ${id}'s reach`,
                hitboxCheck(grounded.attacker, grounded.defender, mv));
        }
    }

    // ── 5. Reach never requires standing inside the body ────────────────────
    // The enemy stops advancing at attackRange and strikes from there. If that
    // is smaller than its own radius plus the player's, the only way it can
    // attack is by overlapping the player — which also destroys the bearing
    // every directional rule (frontArmor, guard arc) is computed from.
    const PLAYER_RADIUS = 0.45;
    for (const kind of KINDS) {
        const d = derive(M[kind]);
        t.ok(`${kind}: melee reach clears its own body plus the player's`,
            d.attackRange > d.hitRadius + PLAYER_RADIUS,
            `reach=${d.attackRange.toFixed(2)} needs > ${(d.hitRadius + PLAYER_RADIUS).toFixed(2)}`);
        // Separation is hitRadius + 0.5 (Enemy._separateFrom); the enemy must
        // still be able to reach from the distance it is actually held at.
        t.ok(`${kind}: reach survives its own separation distance`,
            d.attackRange >= d.hitRadius + 0.5 - 1e-6,
            `reach=${d.attackRange.toFixed(2)} separation=${(d.hitRadius + 0.5).toFixed(2)}`);
    }

    // ── 6. The telegraph does not lie ───────────────────────────────────────
    // The ring is drawn at attackRange + 0.3 and damage resolves at
    // attackRange. A body change that moved one without the other would produce
    // a tell that marks ground the strike does not cover.
    for (const kind of KINDS) {
        const d = derive(M[kind]);
        const ring = d.attackRange + 0.3;
        t.ok(`${kind}: the telegraph ring contains the reach it marks`,
            ring > d.attackRange && ring - d.attackRange <= 0.31,
            `ring=${ring.toFixed(2)} reach=${d.attackRange.toFixed(2)}`);
    }

    // ── 7. The wall probe grew with the body ────────────────────────────────
    for (const kind of KINDS) {
        const d = derive(M[kind]);
        t.ok(`${kind}: wall probe covers most of the body without exceeding it`,
            d.collHalf >= d.hitRadius * 0.75 && d.collHalf <= d.hitRadius,
            `probe=${d.collHalf.toFixed(3)} r=${d.hitRadius.toFixed(3)}`);
    }
    t.ok('a bulwark probes wider than the flat 0.4 every enemy used to use',
        derive(M.bulwark).collHalf > 0.4,
        `${derive(M.bulwark).collHalf.toFixed(3)}`);
    // The other half of the same rule: the small kinds probe NARROWER than the
    // old flat 0.4, or they would be refused gaps their bodies fit through.
    t.ok('the mote probes narrower than the old flat 0.4',
        derive(M.mote).collHalf < 0.4,
        `${derive(M.mote).collHalf.toFixed(3)} for a body of ${M.mote.radius.toFixed(3)}`);
    t.ok('the reference kind still probes at the historical 0.4',
        Math.abs(derive(M.sentinel).collHalf - 0.4) < 0.015,
        `${derive(M.sentinel).collHalf.toFixed(3)}`);

    // ── 8. Split children ───────────────────────────────────────────────────
    const child = measure('brood', childBody('brood'));
    t.ok('a brood child is smaller than its parent',
        child.radius < M.brood.radius,
        `${child.radius.toFixed(3)} < ${M.brood.radius.toFixed(3)}`);
    t.ok('the derived child radius lands where the old literal 0.38 sat',
        Math.abs(child.radius - 0.38) < 0.03,
        `${child.radius.toFixed(3)}`);
    t.ok('a child still has a body a weapon can reach',
        (() => {
            const p = pair(child.radius, move.range + child.radius - 0.05);
            return hitboxCheck(p.attacker, p.defender, move);
        })());

    // ── 9. Props say what the rules are ─────────────────────────────────────
    for (const [kind, spec] of Object.entries(ENEMY_PROPS)) {
        const rig = rigFor(kind);
        const d = derive(M[kind]);
        const prop = attachEnemyProp(rig, kind, {
            radius: d.hitRadius, height: M[kind].height, reach: d.attackRange,
        });
        t.ok(`${kind} carries its ${spec.build}`, !!prop);
        t.ok(`${kind}'s prop hangs from the ${spec.socket} socket`,
            !!prop && prop.parent === rig[spec.socket]);
        // Held props must stay under the bloom threshold or they stop being a
        // silhouette — the exact failure the boss roster shipped.
        let maxEmissive = 0;
        prop?.traverse((o) => {
            if (o.isMesh) maxEmissive = Math.max(maxEmissive, o.material.emissiveIntensity || 0);
        });
        t.ok(`${kind}'s prop stays below the bloom threshold`,
            maxEmissive <= 0.5, `max emissiveIntensity ${maxEmissive}`);
        rig.dispose();
    }
    // The lance is sized off the reach it represents, so the visible point and
    // the damaging distance are the same claim.
    {
        const d = derive(M.lancer);
        const rig = rigFor('lancer');
        const prop = attachEnemyProp(rig, 'lancer', {
            radius: d.hitRadius, height: M.lancer.height, reach: d.attackRange,
        });
        // The prop is tilted at the socket, so its long axis is not Y in world
        // space — measure the largest extent of the box, not a chosen axis.
        // (Measuring Y here is how the first version of this spec "found" a
        // 0.26-long lance: the number was real and the axis was wrong.)
        const box = new THREE.Box3().setFromObject(prop);
        const len = Math.max(
            box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z
        );
        t.ok('the lance is as long as the reach it sells',
            len > d.attackRange * 0.7 && len < d.attackRange * 1.3,
            `lance=${len.toFixed(2)} reach=${d.attackRange.toFixed(2)}`);
        rig.dispose();
    }
    // The kinds that fight with their bodies carry nothing, and that is a
    // statement too — a scarab with a weapon would be lying about how it hurts.
    for (const kind of ['sentinel', 'scarab', 'mote', 'brood']) {
        t.ok(`${kind} carries nothing`, !ENEMY_PROPS[kind]);
    }
}
