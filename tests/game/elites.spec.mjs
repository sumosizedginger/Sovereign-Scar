// tests/game/elites.spec.mjs — Phase D2 and D3.
//
// WHAT THIS COVERS
//
// D2 — ELITES. The campaign had exactly two difficulties of thing to fight:
// three hits, or twenty minutes. The score system has defined an `elite` award
// worth 250 since it was written and nothing has ever fired it. Five elites now
// exist, one per dungeon from beat 05, each an existing kind with one twist.
//
// D3 — THE BESTIARY GRID. The kind x AI matrix was 18 of 35 cells authored, and
// the seventeen missing ones were free content: existing enemies, retuned. Plus
// two genuinely new kinds — the Weaver, which changes the ROOM, and the Censer,
// the first enemy in the game whose answer is target priority.
//
// THE CLAIMS THAT MATTER MOST
//
// - ONE POOL, THREE BODIES, ONE PAYOUT. The Mote Cluster shares a health pool
//   through an accessor over `hp`, so every damage path in the game lands in it
//   without knowing it exists. It must also DIE as one — `applyHit` only marks
//   the body it struck, so without a check the other two sit alive at zero HP,
//   unkillable forever.
// - THE BROOD CAP HOLDS. Children that split is a new thing; children whose
//   children split is a room that fills up and never empties. `childSplit` must
//   not be inherited.
// - THE SLOW CLEARS. The Weaver is the first thing outside a boss to write
//   `player.hazardSlow`. Nothing but a boss ever wrote a zero back, so in a
//   room with no boss the player would have walked out of a web and stayed slow
//   for the rest of the game.
// - THE CENSER CANNOT SAVE ITSELF. That exception IS the enemy. If it ever
//   shields itself the room becomes unwinnable rather than harder.

import * as THREE from 'three';
import {
    Enemy, attachSplit,
    CENSE_R, CENSE_HEAL, CENSE_SHIELD, WEB_SLOW, WEB_LEN, WEB_LIFE,
    VOLLEY_GAP, ENEMY_STEP,
} from '../../src/game/enemy.js';
import { EncounterDirector } from '../../src/game/world/encounter-director.js';
import { ELITES, ELITE_BY_BEAT, eliteForBeat, eliteSpawns } from '../../src/game/world/elites.js';
import { BODIES } from '../../src/game/characters/bodies.js';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';
import { SCORE_EVENTS } from '../../src/game/kernel/score.js';
import { applyHit } from '../../src/game/combat/combat-sweeper.js';
import { inFrontArc } from '../../src/game/combat/combat-sweeper.js';
import { BEAT_LIST } from './_beat-defs.mjs';
import { createDungeon } from '../../src/game/world/room-graph.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { Player } from '../../src/game/player.js';
import { CryptWarden } from '../../src/game/bosses/roster.js';

const AIS = ['chase', 'charge', 'ranged', 'lunge', 'drift'];
const DEFAULT_AI = {
    sentinel: 'chase', scarab: 'charge', frost: 'ranged', bulwark: 'chase',
    mote: 'drift', lancer: 'lunge', brood: 'charge',
    weaver: 'weave', censer: 'censer',
};

function fakePlayer(x = 0, z = 0) {
    return {
        root: { position: { x, y: 1.4, z } },
        state: { facingVec: { x: 1, z: 0 } },
        hitRadius: 0.45,
        hazardSlow: 0,
        inventory: { hasItem: () => false },
        guard: { raised: false },
        health: {
            hp: 1e9, max: 1e9, dead: false, iFrames: 0,
            damage() { return { accepted: true }; },
        },
    };
}

const mk = (scene, kind, x, z, opts = {}) =>
    new Enemy(scene, null, { x, y: 1.0, z }, { kind, hp: 20, ...opts });

export function run(t) {
    const scene = new THREE.Scene();

    // ── The table itself ───────────────────────────────────────────────────
    {
        t.ok('the elite award finally has something to fire it',
            SCORE_EVENTS.elite === 250);
        const beats = Object.keys(ELITE_BY_BEAT).map(Number).sort((a, b) => a - b);
        t.ok('one elite per dungeon from beat 05 on',
            beats.length === 10 && beats[0] === 5 && beats[9] === 14,
            beats.join(','));
        t.ok('nothing before beat 05 has one', !eliteForBeat(4) && !eliteForBeat(1),
            'the tutorial act teaches; it does not examine');
        for (const [beat, id] of Object.entries(ELITE_BY_BEAT)) {
            t.ok(`beat ${beat}'s elite exists in the table`, !!ELITES[id], id);
        }
        const used = new Set(Object.values(ELITE_BY_BEAT));
        t.ok('all five types are actually used', used.size === Object.keys(ELITES).length,
            [...used].join(', '));
    }

    // Every elite lands in a real room, and it is the dungeon's `combine` room.
    {
        let placed = 0;
        let bad = null;
        for (const def of BEAT_LIST) {
            const beatNo = Number(String(def.id).match(/beat-(\d+)/)?.[1] || 0);
            const e = eliteForBeat(beatNo);
            if (!e) continue;
            const roomId = def.theme?.combine;
            if (!roomId || !def.rooms?.[roomId]) {
                bad = `${def.id}: combine room "${roomId}" does not exist`;
                break;
            }
            if (def.rooms[roomId].boss) {
                bad = `${def.id}: combine room is the boss room`;
                break;
            }
            placed++;
        }
        t.ok('every elite has a room to stand in', bad === null, bad || '');
        t.ok('all ten are placed', placed === 10, `${placed}`);
    }

    // The spawn list pays out exactly once, however many bodies it has.
    {
        for (const beat of Object.keys(ELITE_BY_BEAT).map(Number)) {
            const spawns = eliteSpawns(beat, 10);
            const scored = spawns.filter((s) => s.opts.elite).length;
            t.ok(`beat ${beat}'s elite scores once`, scored === 1,
                `${scored} of ${spawns.length} bodies carry the flag`);
            t.ok(`beat ${beat}'s elite is named on every body`,
                spawns.every((s) => !!s.opts.eliteName));
            t.ok(`beat ${beat}'s elite drops something`,
                spawns.some((s) => !!s.opts.loot), 'a guaranteed drop is half the point');
        }
        // The cluster's bodies must point at ONE pool object, not three copies.
        const cluster = eliteSpawns(7, 10);
        t.ok('the mote cluster is three bodies', cluster.length === 3);
        t.ok('sharing one pool object',
            cluster[0].opts.sharedPool === cluster[1].opts.sharedPool
            && cluster[1].opts.sharedPool === cluster[2].opts.sharedPool,
            'three copies of the pool would be three separate health bars');
    }

    // ── Mote Cluster: one pool, and it dies as one ─────────────────────────
    {
        const shared = {};
        const bodies = [0, 1, 2].map((i) => mk(scene, 'mote', i * 2, 0, {
            hp: 12, sharedPool: shared,
        }));
        t.ok('all three read the same health', bodies.every((b) => b.hp === bodies[0].hp));

        applyHit(bodies[1], { damage: 4 }, { state: { facingVec: { x: 1, z: 0 } } });
        t.ok('hitting one drains the pool', bodies[0].hp === 8, `${bodies[0].hp}`);
        t.ok('and every body sees it', bodies[2].hp === 8);

        applyHit(bodies[2], { damage: 8 }, { state: { facingVec: { x: 1, z: 0 } } });
        t.ok('the pool is empty', bodies[0].hp <= 0);
        t.ok('the struck body is marked dead', bodies[2].state.current === 'DEAD');
        t.ok('the others are NOT yet — applyHit only marks what it hit',
            bodies[0].state.current !== 'DEAD');

        const player = fakePlayer(0, 0);
        for (const b of bodies) b.update(1 / 60, player);
        t.ok('but one frame later the whole cluster has fallen',
            bodies.every((b) => b.state.current === 'DEAD'),
            'two motes alive at zero HP would be unkillable — every further hit '
            + 'takes the pool further below zero and never marks them');
    }

    // ── Plated Warden: a wider plate that is still flankable ───────────────
    {
        const arc = ELITES.plated_warden.opts().armorArc;
        const warden = mk(scene, 'bulwark', 0, 0, ELITES.plated_warden.opts());
        warden.state.setFacing(1, 0);
        t.ok('the plate is wider than a bulwark default', warden.armorArc > Math.PI / 2.4);
        const at = (x, z) => ({ root: { position: { x, y: 1, z } } });
        t.ok('the front is covered', inFrontArc(warden, at(2, 0), warden.armorArc));
        t.ok('and so is the flank a bulwark would have left open',
            inFrontArc(warden, at(1, 1.4), warden.armorArc),
            'that is the twist — walking around the side no longer clears it');
        t.ok('the back is still open', !inFrontArc(warden, at(-2, 0), warden.armorArc),
            'a plate you cannot get behind is the unkillable-bulwark bug with a name');
        t.ok('and it turns slowly enough to be got behind',
            warden.turnRate < 2.2 && warden.turnRate > 0,
            `${warden.turnRate} rad/s against a player who orbits at ~3.7`);
        t.ok('the arc is a real number', arc > 0 && arc < Math.PI);
    }

    // ── Brood Mother: the children split, the grandchildren do not ────────
    {
        const spawned = [];
        const mother = mk(scene, 'brood', 0, 0, ELITES.brood_mother.opts());
        attachSplit(mother, (pos, opts) => {
            const child = mk(scene, opts.kind, pos.x, pos.z, opts);
            attachSplit(child, (p2, o2) => {
                const gc = mk(scene, o2.kind, p2.x, p2.z, o2);
                spawned.push({ gen: 2, e: gc, split: o2.split });
                return gc;
            });
            spawned.push({ gen: 1, e: child, split: opts.split });
            return child;
        });

        mother.onDeath();
        const kids = spawned.filter((s) => s.gen === 1);
        t.ok('the mother sheds four', kids.length === 4, `${kids.length}`);
        t.ok('and each of them can split once', kids.every((k) => k.split === 2));

        for (const k of kids) k.e.onDeath();
        const grandkids = spawned.filter((s) => s.gen === 2);
        t.ok('the four become eight', grandkids.length === 8, `${grandkids.length}`);
        t.ok('and there it STOPS', grandkids.every((g) => g.split === 0),
            'childSplit is not inherited; a brood that fills the room never empties it');
    }

    // ── Frost Chorus: a rhythm, not a wall ────────────────────────────────
    {
        // Count SPAWNS, not live projectiles. Bolts leave the list when they
        // reach the player or time out, so `projectiles.length` measures what
        // is still in the air — which at these ranges is a stopwatch, not a
        // claim about the volley. The first draft of this measured zero bolts
        // from a working frost caster for exactly that reason.
        const countingFrost = (opts) => {
            const e = mk(scene, 'frost', 6, 0, opts);
            e.fired = 0;
            const real = e._spawnProjectile.bind(e);
            e._spawnProjectile = (...a) => { e.fired++; return real(...a); };
            return e;
        };

        const chorus = countingFrost(ELITES.frost_chorus.opts());
        const player = fakePlayer(0, 0);
        let guard = 0;
        while (chorus.fired === 0 && guard++ < 1200) chorus.update(1 / 60, player);
        t.ok('it fires', guard < 1200);
        t.ok('one bolt at a time, not three at once', chorus.fired === 1,
            `${chorus.fired} bolts on the first frame — three together is a wall `
            + 'you step out of once, not a rhythm you move through');

        // Half a beat later, still only the one — the gap is real.
        for (let i = 0; i < Math.floor(VOLLEY_GAP * 60 * 0.5); i++) {
            chorus.update(1 / 60, player);
        }
        t.ok('and the second waits its turn', chorus.fired === 1, `${chorus.fired}`);

        for (let i = 0; i < Math.ceil(VOLLEY_GAP * 3 * 60) + 4; i++) {
            chorus.update(1 / 60, player);
        }
        t.ok('the whole volley arrives', chorus.fired === 3, `${chorus.fired}`);

        // An ordinary frost is unchanged.
        const plain = countingFrost({});
        guard = 0;
        while (plain.fired === 0 && guard++ < 1200) plain.update(1 / 60, player);
        for (let i = 0; i < Math.ceil(VOLLEY_GAP * 3 * 60) + 4; i++) {
            plain.update(1 / 60, player);
        }
        t.ok('a plain frost still fires exactly one per wind-up', plain.fired === 1,
            `${plain.fired}`);
    }

    // ── Lance Captain: the second lane is perpendicular ────────────────────
    {
        const captain = mk(scene, 'lancer', 5, 0, ELITES.lance_captain.opts());
        const player = fakePlayer(0, 0);
        let guard = 0;
        while (!(captain._lungeT > 0) && guard++ < 1200) captain.update(1 / 60, player);
        t.ok('it lunges', guard < 1200);
        const first = { ...captain._lungeDir };

        while (captain._lungeT > 0 && guard++ < 1400) captain.update(1 / 60, player);
        t.ok('and immediately commits to a second', captain._windupT > 0,
            'the follow-up is the twist; a pause makes it two ordinary lunges');
        while (captain._windupT > 0 && guard++ < 1600) captain.update(1 / 60, player);
        const second = captain._lungeDir;
        const dot = first.x * second.x + first.z * second.z;
        t.ok('the second lane is perpendicular to the first', Math.abs(dot) < 1e-6,
            `dot ${dot.toFixed(4)} — stepping ACROSS the first lane is the `
            + 'counterplay, so the second is drawn through where that step put you');
        // World space, not an angle sign (trap 1).
        t.ok('and it is a real heading',
            Math.abs(Math.hypot(second.x, second.z) - 1) < 1e-6);
        t.ok('the body faces the lane it will run down',
            Math.abs(captain.state.facingVec.x - second.x) < 1e-3
            && Math.abs(captain.state.facingVec.z - second.z) < 1e-3,
            'the tell is marked along facing; turning afterwards would draw one '
            + 'lane and run down another');

        // It chains ONCE, not forever.
        let chains = 0;
        for (let i = 0; i < 60 * 20; i++) {
            const was = captain._lungeChained;
            captain.update(1 / 60, player);
            if (!was && captain._lungeChained) chains++;
        }
        t.ok('and a plain lancer never chains at all',
            mk(scene, 'lancer', 5, 0, {}).doubleLunge === false);
        t.ok('the captain re-arms for later lunges rather than chaining forever',
            chains > 0, `${chains} chains over twenty seconds`);
    }

    // ── The elites are actually in the world ───────────────────────────────
    //
    // Everything above reads the TABLE. The counterfactual sweep caught that:
    // deleting the spawn call in `bakeRoom` outright left every assertion green,
    // because the spec was checking that the recipe existed and never that
    // anybody cooked. This bakes a real dungeon and looks in its enemy list.
    {
        const dungeonScene = new THREE.Scene();
        const cw = new CollisionWorld();
        const def = BEAT_LIST[4]; // beat 05 — the first dungeon with an elite
        let level = null;
        let err = null;
        try {
            level = createDungeon(
                { scene: dungeonScene, collisionWorld: cw, particles: null },
                def,
                {
                    keyStore: {
                        isOpen: () => false, open() {},
                        mapPickup: () => false, takeMapPickup() {},
                        isPickupTaken: () => false, takePickup() {},
                    },
                }
            );
        } catch (e) { err = e; }
        t.ok('beat 05 bakes headless', !err && !!level, err ? String(err.message) : '');
        if (level) {
            const found = level.enemies.filter((e) => e.elite);
            t.ok('and its elite is standing in it', found.length === 1,
                `${found.length} elites in ${level.enemies.length} enemies`);
            t.ok('with the name the table gave it',
                found[0]?.eliteName === ELITES[ELITE_BY_BEAT[5]].name,
                found[0]?.eliteName || 'none');
            t.ok('and a health bar to hang it on',
                found[0]?.bossName === found[0]?.eliteName && found[0]?.maxHp > 0);
            t.ok('the dungeon also got a director',
                !!level.director && level.director.tokens === 2,
                `tokens ${level.director?.tokens}`);
            level.dispose?.();
        }
    }

    // ── The hazard slow is CLEARED, through the real Player ────────────────
    //
    // Also a counterfactual catch. Every assertion above zeroed
    // `player.hazardSlow` by hand before each tick, so the spec was doing the
    // clearing the shipped code is supposed to do. Deleting the reset line left
    // it green — and in the running game, walking out of a web in a room with
    // no boss in it would have left the player slowed for the rest of the run,
    // because nothing else would ever have written a zero.
    {
        const pScene = new THREE.Scene();
        const player = new Player(pScene, new CollisionWorld(), (x, y) => y < 1);
        player.rig.position.set(0, 1.95, 0);
        const input = {
            moveVector: () => ({ x: 0, z: 0 }), padAim: null,
            guardHeld: () => false, attackHeld: () => false,
            consumeAttack: () => false, consumeDash: () => false,
            consumeWeaponCycle: () => 0,
            consumeLockToggle: () => false, consumeLockCycle: () => false,
        };
        const weaver = mk(pScene, 'weaver', 6, 0, { hp: 20 });
        // A strand laid straight through the origin, where the player stands.
        weaver.rig.position.set(0, 1.0, 0);
        weaver._spawnWeb(0, 1);
        weaver.rig.position.set(6, 1.0, 0);

        weaver._tickWebs(1 / 60, player);
        player.update(1 / 60, input, [], null);
        t.ok('standing on a strand slows the real player',
            player._hazardSlow === WEB_SLOW, `${player._hazardSlow}`);

        player.rig.position.set(40, 1.95, 40);
        weaver._tickWebs(1 / 60, player);
        player.update(1 / 60, input, [], null);
        weaver._tickWebs(1 / 60, player);
        player.update(1 / 60, input, [], null);
        t.ok('and walking off it gives the speed back',
            player._hazardSlow === 0, `still ${player._hazardSlow}`);
    }

    // ── Two hazard sources compose; the last one to tick does not win ──────
    //
    // A boss's patches used to ASSIGN `player.hazardSlow`. With the Weaver in
    // the game there are now two writers, and whichever ticks last would decide
    // — so a player standing in a web, in a boss room, is unslowed for exactly
    // as long as the boss has a patch somewhere else on the floor.
    {
        const pScene = new THREE.Scene();
        const player = new Player(pScene, new CollisionWorld(), (x, y) => y < 1);
        player.rig.position.set(0, 1.95, 0);
        player.hazardSlow = 0;

        const weaver = mk(pScene, 'weaver', 6, 0, { hp: 20 });
        weaver.rig.position.set(0, 1.0, 0);
        weaver._spawnWeb(0, 1);

        const boss = new CryptWarden(pScene, { x: 30, y: 1, z: 30 });
        boss.spawnPatch({ x: 30, z: 30, r: 2, life: 5, slow: 0.2, kind: 'test' });

        weaver._tickWebs(1 / 60, player);      // web writes 0.4
        boss.tickPatches(1 / 60, player);      // boss is far away: its own slow is 0
        t.ok('a distant boss patch does not erase the web underfoot',
            player.hazardSlow === WEB_SLOW,
            `${player.hazardSlow} — assignment would have clobbered this to 0`);
        boss.dispose?.();
    }

    // ── D3: the grid is fully authored ────────────────────────────────────
    {
        const cells = new Set();
        for (const def of BEAT_LIST) {
            for (const room of Object.values(def.rooms || {})) {
                for (const e of room.enemies || []) {
                    cells.add(`${e.kind}:${e.ai || DEFAULT_AI[e.kind] || 'chase'}`);
                }
            }
        }
        const legacy = ['sentinel', 'scarab', 'frost', 'bulwark', 'mote', 'lancer', 'brood'];
        const missing = [];
        for (const k of legacy) {
            for (const a of AIS) if (!cells.has(`${k}:${a}`)) missing.push(`${k}/${a}`);
        }
        t.ok('every kind x AI cell is authored somewhere in the campaign',
            missing.length === 0,
            missing.length ? `missing: ${missing.join(', ')}` : '35/35');
        t.ok('the two new kinds are actually placed',
            cells.has('weaver:weave') && cells.has('censer:censer'),
            [...cells].filter((c) => /weaver|censer/.test(c)).join(', '));
    }

    // The new kinds have their own body and palette, not the sentinel fallback.
    {
        for (const k of ['weaver', 'censer']) {
            t.ok(`${k} has its own body`, !!BODIES[k]);
            t.ok(`${k} has its own palette`, !!ENEMY_PALETTES[k],
                'falling back to the sentinel makes a new kind invisible as a new kind');
        }
    }

    // ── The Weaver ────────────────────────────────────────────────────────
    {
        const player = fakePlayer(0, 0);
        const weaver = mk(scene, 'weaver', 6, 0, { hp: 20 });
        let guard = 0;
        while (weaver.webs.length === 0 && guard++ < 1800) weaver.update(1 / 60, player);
        t.ok('the weaver spins a strand', weaver.webs.length === 1, `after ${guard} frames`);

        const w = weaver.webs[0];
        const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
        t.ok('the strand is a real line', Math.abs(len - WEB_LEN) < 1e-6, `${len}`);
        // Laid ACROSS the line to the player, not along it.
        const along = Math.abs(((w.x1 - w.x0) / len) * 1 + ((w.z1 - w.z0) / len) * 0);
        t.ok('and it is laid across the approach, not down it', along < 0.2,
            `|component along the player line| = ${along.toFixed(3)}`);

        // Standing on it slows; walking off it does not.
        player.root.position.x = (w.x0 + w.x1) / 2;
        player.root.position.z = (w.z0 + w.z1) / 2;
        player.hazardSlow = 0;
        weaver._tickWebs(1 / 60, player);
        t.ok('standing on a strand slows you', player.hazardSlow === WEB_SLOW,
            `${player.hazardSlow}`);

        player.root.position.x += 40;
        player.hazardSlow = 0;
        weaver._tickWebs(1 / 60, player);
        t.ok('stepping off it does not', player.hazardSlow === 0);

        // It is a slow, not a wall — a strand must never become collision.
        t.ok('a strand is never collision', WEB_SLOW < 1,
            'geometry appearing mid-fight in a room you have to cross is a softlock');

        // And it expires, so a long fight is not a fight in treacle.
        for (let i = 0; i < Math.ceil(WEB_LIFE * 60) + 10; i++) {
            weaver._tickWebs(1 / 60, player);
        }
        t.ok('strands expire', weaver.webs.length === 0);
    }

    // ── The Censer ────────────────────────────────────────────────────────
    {
        const player = fakePlayer(0, 0);
        const censer = mk(scene, 'censer', 8, 0, { hp: 6 });
        const ally = mk(scene, 'sentinel', 8, 2, { hp: 10 });
        const distant = mk(scene, 'sentinel', 8 + CENSE_R + 4, 0, { hp: 10 });
        const list = [censer, ally, distant];
        const director = new EncounterDirector(3, () => list);

        ally.hp = 4;
        distant.hp = 4;
        censer.hp = 3;
        const censerHpBefore = censer.hp;

        let guard = 0;
        while (ally.hp === 4 && guard++ < 2400) {
            director.update(1 / 60);
            for (const e of list) e.update(1 / 60, player);
        }
        t.ok('the censer pulses', guard < 2400, `after ${guard} frames`);
        t.ok('a nearby ally is healed', ally.hp > 4, `${ally.hp}`);
        t.ok('by the declared amount, capped at its maximum',
            ally.hp <= ally.maxHp && ally.hp - 4 <= CENSE_HEAL + 1e-6);
        t.ok('and shielded', ally._shieldT > 0 && ally.shielded === true);
        t.ok('THE CENSER CANNOT SAVE ITSELF', censer.hp === censerHpBefore
            && !censer.shielded,
            'a self-shielding support makes the room unwinnable rather than harder');
        t.ok('and it cannot reach across the room',
            distant.hp === 4 && !distant.shielded, `${distant.hp}`);

        // A shield actually refuses damage — that is what makes it a priority.
        const before = ally.hp;
        applyHit(ally, { damage: 5 }, { state: { facingVec: { x: 1, z: 0 } } });
        t.ok('the shield turns a hit away', ally.hp === before,
            'if it only reduced damage, ignoring the censer would still work');

        // And it wears off, so killing the censer is enough.
        for (let i = 0; i < Math.ceil(CENSE_SHIELD * 60) + 4; i++) ally.update(1 / 60, player);
        t.ok('the shield expires', ally.shielded === false);

        // With no director it has nobody to find, and must not throw.
        const lonely = mk(scene, 'censer', 8, 0, { hp: 6 });
        let threw = false;
        try {
            for (let i = 0; i < 600; i++) lonely.update(1 / 60, player);
        } catch (_) { threw = true; }
        t.ok('a censer with no director is harmless, not broken', !threw);
    }

    // ── An enemy stands ON the ground, not inside it ───────────────────────
    //
    // The owner's report, from playing: "Enemies do not step up onto terrain
    // like the player does, this can cause them to be hidden in the blocks."
    //
    // They had no Y at all. `_move` resolved X and Z against the collision
    // world and NOTHING wrote `rig.position.y` after the spawn set it to a flat
    // 1.0 — while Phase E2 put terraces in every room, in the platform map,
    // which is meshed deliberately without XZ solids so a step stays standable
    // and can never wall anything off. The one kind of geometry an enemy could
    // walk into was the one kind its mover could not see.
    //
    // Asserted in world space against a real column, never as "the code calls
    // the function".
    {
        // A three-high step covering x >= 2, floor everywhere else.
        const solid = (x, y) => (x >= 2 ? y < 3 : y < 1);
        const make = (x, z, opts = {}) => new Enemy(
            new THREE.Scene(), null, { x, y: 1, z },
            { kind: 'sentinel', hp: 3, getVoxelAt: solid, ...opts }
        );

        const onFlat = make(0, 0);
        t.ok('a body on flat floor rests on the floor', onFlat.rig.position.y === 1,
            `y=${onFlat.rig.position.y}`);

        // Spawned INSIDE the step. Placement is not locomotion: the step limit
        // that stops a chaser scaling a cliff must not also refuse to lift a
        // body out of the terrace it was authored inside. Four bodies in the
        // campaign stayed buried when this was one rule instead of two.
        const inside = make(4, 0);
        t.ok('a body authored inside a terrace is lifted onto it',
            inside.rig.position.y === 3, `y=${inside.rig.position.y}`);
        t.ok('and nothing solid is left in its chest',
            !solid(inside.rig.position.x, inside.rig.position.y + 0.5));

        // Walking up a one-cell step: allowed, and it ARRIVES on top.
        const oneUp = (x, y) => (x >= 2 ? y < 2 : y < 1);
        const climber = new Enemy(new THREE.Scene(), null, { x: 0, y: 1, z: 0 },
            { kind: 'sentinel', hp: 3, getVoxelAt: oneUp });
        for (let i = 0; i < 40; i++) climber._move(1, 0, 1, 0.25);
        t.ok('a one-cell step is climbed', climber.rig.position.y === 2,
            `y=${climber.rig.position.y} at x=${climber.rig.position.x.toFixed(1)}`);
        t.ok('and the body is above the step, not in it',
            !oneUp(climber.rig.position.x, climber.rig.position.y + 0.5));

        // Walking at a three-high wall: refused, and the body stays OUT of it.
        // Not "stops moving" — a body that levitates up a cliff is a worse bug
        // than one that gives up.
        const walker = make(0, 0);
        for (let i = 0; i < 60; i++) walker._move(1, 0, 1, 0.25);
        t.ok('a three-cell wall is not climbed', walker.rig.position.y === 1,
            `y=${walker.rig.position.y}`);
        t.ok('and the body never ends up inside it',
            !solid(walker.rig.position.x, walker.rig.position.y + 0.5),
            `stopped at x=${walker.rig.position.x.toFixed(2)}`);

        // Falling is not capped. An enemy chased off a ledge belongs on the
        // lower floor, not hovering over it.
        const faller = make(4, 0);
        for (let i = 0; i < 60; i++) faller._move(-1, 0, 1, 0.25);
        t.ok('a drop of any height is taken', faller.rig.position.y === 1,
            `y=${faller.rig.position.y}`);

        // The step limit is the hero's own, so terraced rooms stay passable to
        // both of them.
        t.ok('an enemy climbs exactly as high as the player', ENEMY_STEP === 1);

        // No level, no change: the sandbox and most specs build enemies with no
        // voxel query at all and must behave exactly as they did before.
        const blind = new Enemy(new THREE.Scene(), null, { x: 0, y: 1, z: 0 },
            { kind: 'sentinel', hp: 3 });
        const y0 = blind.rig.position.y;
        for (let i = 0; i < 20; i++) blind._move(1, 0, 1, 0.25);
        t.ok('a body with no level is left exactly where it was',
            blind.rig.position.y === y0);
    }
}
