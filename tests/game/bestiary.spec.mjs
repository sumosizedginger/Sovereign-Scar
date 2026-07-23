// tests/game/bestiary.spec.mjs — Z5, a real bestiary.
//
// Three archetypes across fourteen dungeons is why every beat from 02 to 13
// played identically: eight rooms, nine enemies, the same sentinel/scarab/frost
// roster, one gate type. Palette changed; nothing else did.
//
// An enemy earns its place by asking a QUESTION the others do not. These specs
// pin the question, not the stat block:
//
//   bulwark — "are you willing to move?"     answer: flank, or parry
//   mote    — "can you fight at range?"      answer: the ray weapon
//   lancer  — "which way is sideways?"       answer: step out of the lane
//   brood   — "did you make space first?"    answer: crowd control
//
// The bulwark and mote specs are the load-bearing ones: if melee ever quietly
// starts working on them, both kinds silently collapse back into a sentinel.

import * as THREE from 'three';
import { Enemy, attachSplit } from '../../src/game/enemy.js';
import { applyHit, inFrontArc } from '../../src/game/combat/combat-sweeper.js';
import { hitboxCheck } from '../../src/combat/hitbox.js';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
import { ARCHETYPES } from '../../src/game/characters/archetypes.js';
import { WEAPONS, getWeapon } from '../../src/game/combat/weapons.js';
import { HealthPool } from '../../src/game/kernel/health.js';
import { GuardController, PARRY_WINDOW, POISE_MAX } from '../../src/game/combat/guard.js';
import { HeartDropManager, dropSite } from '../../src/game/world/heart-drops.js';
import { BEAT_DEFS } from './_beat-defs.mjs';

const NEW_KINDS = ['bulwark', 'mote', 'lancer', 'brood'];
const ALL_KINDS = ['sentinel', 'scarab', 'frost', ...NEW_KINDS];

function spawn(kind, at = { x: 0, y: 1, z: 0 }, opts = {}) {
    return new Enemy(new THREE.Scene(), null, at, { kind, ...opts });
}

/** A stand-in attacker at a world point, facing the origin. */
function attackerAt(x, z) {
    const len = Math.hypot(x, z) || 1;
    return {
        root: { position: { x, y: 1.95, z } },
        state: { facingVec: { x: -x / len, z: -z / len } },
    };
}

export function run(t) {
    // --- the kinds exist and are visually distinct -------------------------
    for (const k of NEW_KINDS) {
        t.ok(`${k} has its own palette`, !!ENEMY_PALETTES[k]);
        t.ok(`${k} has its own animation archetype`, !!ARCHETYPES[k]);
    }
    {
        const skins = new Set(ALL_KINDS.map((k) => ENEMY_PALETTES[k].skin));
        t.ok('every kind reads as a different colour', skins.size === ALL_KINDS.length,
            `${skins.size}/${ALL_KINDS.length}`);
        const gaits = new Set(ALL_KINDS.map((k) => ARCHETYPES[k].gaitFreqMin));
        t.ok('kinds do not all walk at the same cadence', gaits.size >= 6, `${gaits.size}`);
    }
    {
        // Each new kind picks its own AI without the level having to say so.
        t.ok('bulwark defaults to chase', spawn('bulwark').ai === 'chase');
        t.ok('mote defaults to drift', spawn('mote').ai === 'drift');
        t.ok('lancer defaults to lunge', spawn('lancer').ai === 'lunge');
        t.ok('brood defaults to charge', spawn('brood').ai === 'charge');
    }

    // --- bulwark: directional armour ---------------------------------------
    {
        const b = spawn('bulwark');
        b.state.setFacing(0, -1); // facing north
        t.ok('a bulwark starts with its plate up', b.armorUp === true);

        const front = attackerAt(0, -2);
        const back = attackerAt(0, 2);
        t.ok('the front arc covers a frontal attacker', inFrontArc(b, front) === true);
        t.ok('the front arc does not cover the back', inFrontArc(b, back) === false);
        t.ok('the front arc does not cover the flank',
            inFrontArc(b, attackerAt(2, 0)) === false);

        const hp0 = b.hp;
        const blocked = applyHit(b, WEAPONS.anchor_link, front);
        t.ok('melee into the plate does nothing at all',
            blocked.damage === 0 && blocked.armored === true && b.hp === hp0, `hp=${b.hp}`);

        const flank = applyHit(b, WEAPONS.anchor_link, back);
        t.ok('the same swing from behind lands in full',
            flank.damage === WEAPONS.anchor_link.damage && b.hp < hp0, `hp=${b.hp}`);
    }
    {
        // The heaviest weapon must not be a shortcut around the mechanic —
        // otherwise the kind teaches "swap loadout", not "move your feet".
        const b = spawn('bulwark');
        b.state.setFacing(0, -1);
        const hp0 = b.hp;
        applyHit(b, WEAPONS.tectonic_wedge, attackerAt(0, -2));
        t.ok('even the heavy weapon cannot punch through the front plate',
            b.hp === hp0, `hp=${b.hp}`);
    }
    {
        // ...and the ray weapon is not a shortcut either.
        const b = spawn('bulwark');
        b.state.setFacing(0, -1);
        const hp0 = b.hp;
        applyHit(b, getWeapon('light_caster'), attackerAt(0, -4));
        t.ok('the ray weapon does not bypass the plate either', b.hp === hp0);
    }
    {
        // The parry loop: stagger drops the plate for the length of the window.
        const b = spawn('bulwark');
        b.state.setFacing(0, -1);
        b.stagger(0.7);
        t.ok('a parried bulwark drops its plate', b.armorUp === false);
        const hp0 = b.hp;
        applyHit(b, WEAPONS.anchor_link, attackerAt(0, -2));
        t.ok('the opening a parry buys is a real damage window', b.hp < hp0, `hp=${b.hp}`);

        // And it closes again.
        b._openT = 0;
        t.ok('the plate comes back up when the window expires', b.armorUp === true);
    }
    {
        const s = spawn('sentinel');
        s.state.setFacing(0, -1);
        const hp0 = s.hp;
        applyHit(s, WEAPONS.anchor_link, attackerAt(0, -2));
        t.ok('ordinary enemies are unaffected by the armour rule', s.hp < hp0);
    }

    // --- bodies occupy space ------------------------------------------------
    //
    // The AI stops advancing at attackRange, but nothing stopped the player
    // walking THROUGH an enemy, and the two then stood in the same spot. The
    // reported symptom was a mob standing on the player's head; the mechanical
    // symptom is worse, because at zero separation there is no bearing between
    // them and every directional rule in the game silently defaults.
    {
        const e = spawn('sentinel', { x: 0, y: 1, z: 0 });
        const player = {
            root: { position: { x: 0, y: 1.95, z: 0 } },
            health: { dead: false },
        };
        t.ok('an attacker exactly on top of a defender defaults to armoured',
            inFrontArc(e, { root: player.root, state: e.state }) === true);

        e.update(1 / 60, player);
        const sep = Math.hypot(e.rig.position.x, e.rig.position.z);
        t.ok('one frame of contact pushes the enemy off the player',
            sep >= (e.hitRadius + 0.5) - 1e-6, `separation=${sep.toFixed(2)}`);
        t.ok('the player is never the one moved',
            player.root.position.x === 0 && player.root.position.z === 0);
    }
    {
        // A hovering enemy is separated by altitude; shoving it in XZ would
        // undo the one property the kind exists for.
        const m = spawn('mote', { x: 0, y: 1, z: 0 });
        const player = { root: { position: { x: 0, y: 1.95, z: 0 } }, health: { dead: false } };
        const x0 = m.rig.position.x, z0 = m.rig.position.z;
        m._separateFrom(player);
        t.ok('a hovering enemy is not shoved out of its station',
            m.rig.position.x === x0 && m.rig.position.z === z0);
    }
    {
        // Separation must not shove an enemy through geometry.
        const world = { blocked: () => false, resolveMove: (px, pz) => ({ x: px, z: pz }) };
        const e = new Enemy(new THREE.Scene(), world, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        const player = { root: { position: { x: 0, y: 1.95, z: 0.1 } }, health: { dead: false } };
        e._separateFrom(player);
        t.ok('the push is resolved against the collision world, not teleported',
            e.rig.position.x === 0 && e.rig.position.z === 0);
    }

    // --- bulwark: the flank has to be REACHABLE -----------------------------
    //
    // Every assertion above passes with an enemy that re-aims instantly, which
    // is exactly the bug that shipped: `_updateAI` snapped facing at the player
    // each frame, so the plate tracked whoever was swinging and `inFrontArc`
    // was true from every angle forever. A bulwark was unkillable by melee —
    // the one counterplay the kind exists to teach was geometrically
    // impossible, and the whole suite was green.
    //
    // So the property worth pinning is not "the back is soft". It is "a player
    // moving at player speed can GET to the back".
    {
        t.ok('a plated enemy turns at a finite rate',
            Number.isFinite(spawn('bulwark').turnRate), String(spawn('bulwark').turnRate));
        for (const k of ['sentinel', 'scarab', 'frost', 'mote', 'lancer', 'brood']) {
            t.ok(`${k} still aims instantly (unchanged by the turn cap)`,
                spawn(k).turnRate === Infinity);
        }
    }
    {
        // Orbit the bulwark at melee range and at the player's actual walk
        // speed, driving the production facing code one frame at a time.
        const PLAYER_SPEED = 5.5;
        const RADIUS = 1.6;
        const DT = 1 / 60;

        function orbit(enemy, seconds) {
            const omega = PLAYER_SPEED / RADIUS; // rad/s of bearing the player can win
            let openedAt = -1;
            for (let i = 0; i * DT < seconds; i++) {
                const a = omega * i * DT;
                const px = enemy.rig.position.x + Math.sin(a) * RADIUS;
                const pz = enemy.rig.position.z + Math.cos(a) * RADIUS;
                enemy._faceToward(px - enemy.rig.position.x, pz - enemy.rig.position.z, DT);
                if (openedAt < 0 && !inFrontArc(enemy, attackerAt(px, pz))) openedAt = i * DT;
            }
            const a = omega * Math.floor(seconds / DT) * DT;
            return { openedAt, px: Math.sin(a) * RADIUS, pz: Math.cos(a) * RADIUS };
        }

        const b = spawn('bulwark');
        b.state.setFacing(0, 1); // plate starts pointed at the player
        const { openedAt } = orbit(b, 2.5);
        t.ok('circling a bulwark opens its back within a couple of seconds',
            openedAt > 0 && openedAt < 2.0, `opened at ${openedAt.toFixed(2)}s`);
        t.ok('and the opening is not instant — the plate is still a real ask',
            openedAt > 0.3, `opened at ${openedAt.toFixed(2)}s`);
    }
    {
        // The counter-proof: the shipped behaviour (instant re-aim) never opens.
        // If this ever starts opening, the turn cap has been defeated somewhere
        // and the assertion above has stopped meaning anything.
        const b = spawn('bulwark', { x: 0, y: 1, z: 0 }, { turnRate: Infinity });
        b.state.setFacing(0, 1);
        let everOpen = false;
        for (let i = 0; i < 240; i++) {
            const a = (5.5 / 1.6) * i * (1 / 60);
            const px = Math.sin(a) * 1.6;
            const pz = Math.cos(a) * 1.6;
            b._faceToward(px, pz, 1 / 60);
            if (!inFrontArc(b, attackerAt(px, pz))) everOpen = true;
        }
        t.ok('an instantly-aiming plate can never be flanked (the bug this pins)',
            everOpen === false);
    }
    {
        // End to end: circle, then swing, and take real damage off it — using
        // only the starting weapon, with no parry.
        const b = spawn('bulwark');
        b.state.setFacing(0, 1);
        const omega = 5.5 / 1.6;
        let px = 0; let pz = 1.6;
        for (let i = 0; i < 120; i++) {
            const a = omega * i * (1 / 60);
            px = Math.sin(a) * 1.6; pz = Math.cos(a) * 1.6;
            b._faceToward(px, pz, 1 / 60);
        }
        const hp0 = b.hp;
        applyHit(b, WEAPONS.anchor_link, attackerAt(px, pz));
        t.ok('a bulwark is killable by footwork alone, with the starting weapon',
            b.hp < hp0, `hp ${hp0} -> ${b.hp}`);
    }

    // --- mote: out of melee reach -----------------------------------------
    {
        const m = spawn('mote');
        t.ok('a mote leaves the floor on spawn', m.rig.position.y > 3, `y=${m.rig.position.y}`);

        // Player standing on a floor whose top is y=1 sits at rig y=1.95.
        const hero = {
            root: { position: { x: 0, y: 1.95, z: 0 } },
            state: { facingVec: { x: 0, z: -1 } },
        };
        m.rig.position.set(0, m.rig.position.y, -1.2); // well inside horizontal reach
        for (const id of ['bare_strike', 'anchor_link', 'tectonic_wedge', 'heavy_mallet']) {
            t.ok(`${id} cannot reach a hovering mote`,
                hitboxCheck(hero, m, WEAPONS[id]) === false,
                `dy=${(m.rig.position.y - 1.95).toFixed(2)}`);
        }
        // The ray weapon is the answer, and it ignores height by design.
        const hp0 = m.hp;
        applyHit(m, getWeapon('light_caster'), hero);
        t.ok('the ray weapon does kill motes', m.hp < hp0, `hp=${m.hp}`);
    }
    {
        // Ground enemies must NOT be pushed into the air by the new field.
        const s = spawn('sentinel', { x: 0, y: 1, z: 0 });
        t.ok('non-hovering kinds stay on the floor', s.rig.position.y === 1);
    }
    {
        // The safety valve. Motes are introduced in Beat 04, after the Light
        // Caster is granted in Beat 02 — but nothing FORCES the player to pick
        // it up, and an unkillable enemy is a soft-lock. So the same rule that
        // opens a bulwark also grounds a mote: a parry undoes whatever makes
        // the enemy hard to hit. Melee always has an answer.
        const m = spawn('mote');
        const player = {
            root: { position: { x: 0, y: 1.95, z: -2 } },
            health: { dead: false, damage: () => ({ accepted: true }) },
            state: { facingVec: { x: 0, z: 1 } },
        };
        t.ok('a mote is airborne by default', m.airborne === true);
        m.stagger(0.7);
        t.ok('a parried mote is no longer airborne', m.airborne === false);
        // Let it settle, then confirm a sword actually reaches it.
        for (let i = 0; i < 20; i++) m.update(0.02, player);
        const hero = { root: { position: { x: 0, y: 1.95, z: -1.2 } }, state: { facingVec: { x: 0, z: 1 } } };
        m.rig.position.x = 0; m.rig.position.z = 0;
        t.ok('a grounded mote can be hit with a sword',
            hitboxCheck(hero, m, WEAPONS.anchor_link) === true,
            `y=${m.rig.position.y.toFixed(2)}`);

        // ...and the window closes: it climbs back out of reach.
        m._groundedT = 0;
        for (let i = 0; i < 120; i++) m.update(0.02, player);
        t.ok('the mote returns to altitude when the window expires',
            m.airborne === true && hitboxCheck(hero, m, WEAPONS.anchor_link) === false,
            `y=${m.rig.position.y.toFixed(2)}`);
    }

    // --- mote: the burst has to be answerable -----------------------------
    //
    // Reported from play: "the purple guys who are flying, you don't really
    // have a way to avoid their hit or defend against it." Both halves were
    // true. The tell was drawn at a radius the mote never actually closed to,
    // so the ring said "this whole circle" while the mote parked well inside
    // it; and the only defence — the shield — still leaked 25% chip on a kind
    // that cannot be answered with a sword at all.
    {
        const m = spawn('mote', { x: 0, y: 1, z: 0 });
        const hero = {
            root: { position: { x: 0, y: 1.95, z: -6 } },
            health: { dead: false, damage: () => ({ accepted: true }) },
            state: { facingVec: { x: 0, z: 1 } },
        };
        // Let it close and commit to a burst.
        let guardRail = 0;
        while (!m._pendingStrike && guardRail++ < 2000) m.update(0.016, hero);
        t.ok('a mote commits to a burst on its own', !!m._pendingStrike);

        const parkedAt = Math.hypot(
            m.rig.position.x - hero.root.position.x,
            m.rig.position.z - hero.root.position.z);
        const drawn = m._tell?.geometry?.parameters?.outerRadius;
        t.ok('the burst paints a ring', drawn > 0, `r=${drawn}`);

        // The ring must mean what it says. Probe the pending strike either
        // side of the drawn radius: a telegraph that damages beyond its own
        // circle is not a telegraph, it is an ambush with decoration.
        let hitInside = false, hitOutside = false;
        const probe = { ...hero, health: { dead: false, damage() { probe._hit = true; return { accepted: true }; } } };
        probe._hit = false; m._pendingStrike(probe, drawn - 0.05); hitInside = probe._hit;
        probe._hit = false; m._pendingStrike(probe, drawn + 0.05); hitOutside = probe._hit;
        t.ok('the burst damages inside the ring it drew', hitInside === true);
        t.ok('the burst does NOT damage outside it', hitOutside === false,
            `drawn=${drawn} — the ring used to be a different number from the one that resolved`);

        // And it has to be walkable. The mote commits from INSIDE its own
        // circle, so the escape is a short step, and the wind-up is long
        // enough to take it at walking pace with room to spare.
        const escape = drawn - parkedAt;
        t.ok('the mote commits from inside the circle it paints', escape > 0,
            `parked=${parkedAt.toFixed(2)} ring=${drawn}`);
        const PLAYER_SPEED = 5.5; // src/game/player.js
        const needed = escape / PLAYER_SPEED;
        t.ok('there is time to walk out of the burst before it lands',
            m._tellMax > needed * 2,
            `windup=${m._tellMax.toFixed(2)}s, walking out takes ${needed.toFixed(2)}s`);
    }
    {
        // The second answer: stand and face it. A mote's burst carries a real
        // origin, so it lands in the guarded cone — and with chip damage now
        // zero, holding the shield is a genuine defence rather than a slower
        // way of taking the same hit.
        const m = spawn('mote', { x: 0, y: 1, z: 0 });
        const health = new HealthPool(10);
        const guard = new GuardController();
        const at = { x: 0, z: -2 };
        health.damageFilter = (hit) => guard.resolve(hit, at, { x: 0, z: 1 });
        guard.update(0.016, true);
        guard.update(PARRY_WINDOW + 0.05, true); // past the parry — a plain hold
        const hero = { root: { position: { x: at.x, y: 1.95, z: at.z } }, health,
            state: { facingVec: { x: 0, z: 1 } } };
        m.rig.position.set(0, m.rig.position.y, 0);
        let guardRail = 0;
        while (!m._pendingStrike && guardRail++ < 2000) m.update(0.016, hero);
        m._pendingStrike(hero, 0.5); // resolve it right on top of them
        t.ok('a mote burst is stopped by a raised shield', health.hp === 10, `hp=${health.hp}`);
        t.ok('...and blocking it still costs poise', guard.poise < POISE_MAX,
            `poise=${guard.poise}`);
    }

    // --- what a slain enemy leaves behind ---------------------------------
    //
    // `Enemy.loot` was assigned in the constructor and read by NOTHING, and
    // every drop was spawned at `root.position` — which for a hovering enemy
    // is 3.4 units in the air, above the 2.0-unit vertical pickup range. A
    // mote's reward was not merely floating, it was uncollectable.
    {
        const m = spawn('mote', { x: 3, y: 1, z: -4 });
        t.ok('a mote really is airborne', m.root.position.y > 3, `y=${m.root.position.y}`);
        const [x, y, z] = dropSite(m);
        t.ok('its drops land on the floor, not at flight altitude',
            y === 1, `dropY=${y} rigY=${m.root.position.y}`);
        t.ok('...directly under the body', x === 3 && z === -4, `${x},${z}`);
        // A HeartDrop sits 0.5 above whatever y it is given, and collects
        // within 2.0 vertical of a player rig at 1.95. Prove the drop is
        // actually reachable rather than merely lower than it was.
        t.ok('and is inside the collection window a standing player has',
            Math.abs(1.95 - (y + 0.5)) < 2.0, `dy=${Math.abs(1.95 - (y + 0.5)).toFixed(2)}`);
    }
    {
        const s = spawn('sentinel', { x: 2, y: 1, z: 2 });
        const [, y] = dropSite(s);
        t.ok('a walking enemy drops exactly where it always did',
            y === s.root.position.y, `${y}`);
    }
    {
        // The loot field finally does something.
        const mgr = new HeartDropManager(new THREE.Scene());
        const added = [];
        const level = { addPickup: (pos, data) => { added.push({ pos, data }); return data; } };
        const e = spawn('sentinel', { x: 5, y: 1, z: 5 }, { loot: { label: 'Shard cache' } });
        e.state.current = 'DEAD';
        mgr.update(0.016, [e], null, level);
        t.ok('a slain enemy drops its declared loot', added.length === 1,
            `${added.length} pickups`);
        t.ok('...on the ground where it died',
            added[0]?.pos.x === 5 && added[0]?.pos.z === 5, JSON.stringify(added[0]?.pos));
        t.ok('...carrying the level\'s own pickup data',
            added[0]?.data.label === 'Shard cache');
    }
    {
        // No level (unit harness, sandbox) must not throw.
        const mgr = new HeartDropManager(new THREE.Scene());
        const e = spawn('sentinel', {}, { loot: { label: 'x' } });
        e.state.current = 'DEAD';
        let threw = false;
        try { mgr.update(0.016, [e], null, null); } catch (_) { threw = true; }
        t.ok('a level with no pickup support is skipped, not fatal', threw === false);
    }

    // --- a shooter is answered by FACING it, not by parrying it -----------
    //
    // Reported from play: "a shooter should never have to be parried, if
    // anything you should have to hold your shield and shoot the projectile
    // back." A wind-up is a read you can see; a bolt already in flight gives
    // you its travel time and nothing else. Holding the shield is the answer,
    // and the bolt goes home.
    {
        const shooter = spawn('frost', { x: 0, y: 1, z: 0 }, { ai: 'ranged' });
        const health = new HealthPool(10);
        const hero = {
            root: { position: { x: 0, y: 1.95, z: 6 } },
            state: { facingVec: { x: 0, z: -1 } },   // facing the shooter
            health,
            guard: { raised: true, parryReady: false },
            inventory: { hasItem: () => false },     // no Reflector Plate
        };
        const hp0 = shooter.hp;
        shooter._spawnProjectile(0, 1); // fired straight at them
        for (let i = 0; i < 400 && shooter.projectiles.length; i++) {
            shooter._updateProjectiles(0.016, hero);
        }
        t.ok('a held shield takes no damage from a bolt', health.hp === 10, `hp=${health.hp}`);
        t.ok('the bolt goes back and wounds the shooter', shooter.hp < hp0,
            `${hp0} -> ${shooter.hp}`);
    }
    {
        // Same shot, shield DOWN: it must still hurt, or the fix has quietly
        // deleted the ranged threat instead of answering it.
        const shooter = spawn('frost', { x: 0, y: 1, z: 0 }, { ai: 'ranged' });
        const health = new HealthPool(10);
        const hero = {
            root: { position: { x: 0, y: 1.95, z: 6 } },
            state: { facingVec: { x: 0, z: -1 } },
            health,
            guard: { raised: false, parryReady: false },
            inventory: { hasItem: () => false },
        };
        const hp0 = shooter.hp;
        shooter._spawnProjectile(0, 1);
        for (let i = 0; i < 400 && shooter.projectiles.length; i++) {
            shooter._updateProjectiles(0.016, hero);
        }
        t.ok('an unguarded bolt still lands', health.hp < 10, `hp=${health.hp}`);
        t.ok('...and the shooter is untouched', shooter.hp === hp0);
    }
    {
        // Facing AWAY with the shield up is not a block — the cone is the
        // whole point, exactly as it is for melee.
        const shooter = spawn('frost', { x: 0, y: 1, z: 0 }, { ai: 'ranged' });
        const health = new HealthPool(10);
        const hero = {
            root: { position: { x: 0, y: 1.95, z: 6 } },
            state: { facingVec: { x: 0, z: 1 } },    // running away
            health,
            guard: { raised: true, parryReady: false },
            inventory: { hasItem: () => false },
        };
        shooter._spawnProjectile(0, 1);
        for (let i = 0; i < 400 && shooter.projectiles.length; i++) {
            shooter._updateProjectiles(0.016, hero);
        }
        t.ok('a shield facing the wrong way blocks nothing', health.hp < 10, `hp=${health.hp}`);
    }
    {
        // The Reflector Plate keeps a reason to exist: it is the PASSIVE
        // version of the same verb — frontal bolts bounce with no shield up
        // and no button held.
        const shooter = spawn('frost', { x: 0, y: 1, z: 0 }, { ai: 'ranged' });
        const health = new HealthPool(10);
        const hero = {
            root: { position: { x: 0, y: 1.95, z: 6 } },
            state: { facingVec: { x: 0, z: -1 } },
            health,
            guard: { raised: false, parryReady: false },
            inventory: { hasItem: (id) => id === 'reflector_plate' },
        };
        const hp0 = shooter.hp;
        shooter._spawnProjectile(0, 1);
        for (let i = 0; i < 400 && shooter.projectiles.length; i++) {
            shooter._updateProjectiles(0.016, hero);
        }
        t.ok('the Reflector Plate bounces bolts with no guard held',
            health.hp === 10 && shooter.hp < hp0, `hp=${health.hp} enemy=${shooter.hp}`);
    }

    // --- lancer: a lane, not a circle -------------------------------------
    {
        const l = spawn('lancer');
        t.ok('a lancer starts idle', l._lungeT === 0);
        const player = {
            root: { position: { x: 0, y: 1.95, z: -6 } },
            health: { dead: false, damage: () => ({ accepted: true }) },
            state: { facingVec: { x: 0, z: 1 } },
        };
        // Drive it until it commits.
        for (let i = 0; i < 20 && l._windupT <= 0; i++) l.update(0.05, player);
        t.ok('a lancer telegraphs before it moves', l._windupT > 0, `windup=${l._windupT}`);
        t.ok('the telegraph is on the ground', !!l._tell);
        const dir = { ...l.state.facingVec };

        // Run the windup out; the lunge direction is locked at commit time.
        for (let i = 0; i < 40 && l._lungeT <= 0; i++) l.update(0.05, player);
        t.ok('the lancer does launch', l._lungeT > 0, `lunge=${l._lungeT}`);
        t.ok('the lunge keeps the direction it committed to, so it can be sidestepped',
            Math.abs(l._lungeDir.x - dir.x) < 0.2 && Math.abs(l._lungeDir.z - dir.z) < 0.2,
            `dir=${JSON.stringify(l._lungeDir)} vs ${JSON.stringify(dir)}`);
    }

    // --- brood: splits ----------------------------------------------------
    {
        const spawned = [];
        const b = spawn('brood', { x: 5, y: 1, z: 5 }, { hp: 4 });
        t.ok('a brood is marked as a splitter', b.split === 2);
        attachSplit(b, (pos, opts) => {
            const child = spawn(opts.kind, pos, opts);
            spawned.push({ pos, opts, child });
            return child;
        });
        b.onDeath();
        t.ok('killing a brood produces its children', spawned.length === 2);
        t.ok('children are weaker than the parent',
            spawned.every((s) => s.opts.hp < b.maxHp), JSON.stringify(spawned.map((s) => s.opts.hp)));
        t.ok('children spawn apart, not stacked',
            Math.hypot(spawned[0].pos.x - spawned[1].pos.x,
                spawned[0].pos.z - spawned[1].pos.z) > 1);
        t.ok('children are sterile, so a room cannot be flooded',
            spawned.every((s) => s.opts.split === 0));
        t.ok('generation is tracked', spawned.every((s) => s.opts.generation === 1));
    }
    {
        // Kill a brood with its back to a wall. Blind placement at a fixed
        // radius buries half the litter inside the masonry, where nothing can
        // reach it — and every room-clear gate in the dungeon then waits on a
        // corpse that will never die. Same failure family as the plate: a
        // softlock produced by standing in an entirely ordinary place.
        const WALL = { minX: 4, maxX: 20, minZ: -20, maxZ: 20 };
        const world = {
            blocked: (x, z, half = 0.4) =>
                x + half > WALL.minX && x - half < WALL.maxX
                && z + half > WALL.minZ && z - half < WALL.maxZ,
        };
        const b = new Enemy(new THREE.Scene(), world, { x: 3, y: 1, z: 0 },
            { kind: 'brood', hp: 4 });
        const spawned = [];
        attachSplit(b, (pos, opts) => { spawned.push(pos); return spawn(opts.kind, pos, opts); });
        b.onDeath();
        t.ok('a brood against a wall still produces its children', spawned.length === 2);
        for (const [i, pos] of spawned.entries()) {
            t.ok(`child ${i} spawns somewhere it can actually be reached`,
                world.blocked(pos.x, pos.z, 0.38) === false,
                `(${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
        }
    }
    {
        // The last resort has to hold too: in a space with no free ring at all,
        // fall back to the parent's own footprint — something was standing
        // there a frame ago, so it is provably reachable.
        const world = { blocked: (x, z) => !(Math.abs(x) < 0.2 && Math.abs(z) < 0.2) };
        const b = new Enemy(new THREE.Scene(), world, { x: 0, y: 1, z: 0 },
            { kind: 'brood', hp: 4 });
        const spawned = [];
        attachSplit(b, (pos, opts) => { spawned.push(pos); return spawn(opts.kind, pos, opts); });
        b.onDeath();
        t.ok('with nowhere to scatter, children inherit the parent’s footprint',
            spawned.every((p) => p.x === 0 && p.z === 0),
            JSON.stringify(spawned));
    }
    {
        // attachSplit must be inert for everything that is not a splitter.
        const s = spawn('sentinel');
        const before = s.onDeath;
        attachSplit(s, () => { throw new Error('must not spawn'); });
        t.ok('attachSplit leaves non-splitters alone', s.onDeath === before);
    }
    {
        // A pre-existing onDeath (loot, quest hooks) must still run.
        let looted = false;
        const b = spawn('brood', { x: 0, y: 1, z: 0 }, { onDeath: () => { looted = true; } });
        attachSplit(b, () => ({}));
        b.onDeath();
        t.ok('splitting does not swallow the original death handler', looted === true);
    }

    // --- distribution: no two dungeons play the same -----------------------
    //
    // This is the assertion the whole ticket exists to make true. Before Z5,
    // twelve consecutive beats shipped the identical sentinel/scarab/frost
    // roster, so clearing Beat 02 mechanically cleared Beats 03 through 13.
    {
        const rosters = new Map();
        for (const [id, def] of Object.entries(BEAT_DEFS)) {
            const kinds = new Set();
            for (const room of Object.values(def.rooms)) {
                for (const e of room.enemies || []) kinds.add(e.kind);
            }
            rosters.set(id, [...kinds].sort().join('+'));
        }
        t.ok('every beat was sampled', rosters.size === 14, `n=${rosters.size}`);
        t.ok('no beat ships without enemies',
            [...rosters.values()].every((r) => r.length > 0));

        const sigs = new Set(rosters.values());
        t.ok('no two dungeons share a roster', sigs.size === 14,
            [...rosters].map(([k, v]) => `${k}=${v}`).join(' '));

        const used = new Set();
        for (const r of rosters.values()) for (const k of r.split('+')) used.add(k);
        t.ok('every kind in the bestiary is actually deployed',
            ALL_KINDS.every((k) => used.has(k)),
            `unused: ${ALL_KINDS.filter((k) => !used.has(k)).join(',')}`);

        // Motes must never appear before the Light Caster is obtainable
        // (granted in Beat 02), or the intended answer does not exist yet.
        const firstMote = [...rosters].findIndex(([, r]) => r.includes('mote'));
        t.ok('motes are introduced only after the ray weapon is available',
            firstMote >= 2, `first at index ${firstMote}`);
    }
}
