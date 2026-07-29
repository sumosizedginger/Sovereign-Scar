// Unit tests for multi-phase boss framework + roster + attachBoss.

import * as THREE from 'three';
import { BossBase, attachBoss, moveToward, bounceArena, circleStrafe } from '../../src/game/bosses/base.js';
import { applyHit, inFrontArc } from '../../src/game/combat/combat-sweeper.js';
import { hitboxCheck } from '../../src/combat/hitbox.js';
import { WEAPONS } from '../../src/game/combat/weapons.js';
import { Enemy } from '../../src/game/enemy.js';
import { CollisionWorld } from '../../src/engine/collision.js';

/**
 * A stand-in attacker `dist` from `target` at `deg` around it, facing back in.
 * 0deg is dead ahead of the target's own facing.
 */
function heroFacing(target, dist, deg) {
    const fv = target.state.facingVec;
    const base = Math.atan2(fv.x, fv.z);
    const a = base + (deg * Math.PI) / 180;
    const x = target.root.position.x + Math.sin(a) * dist;
    const z = target.root.position.z + Math.cos(a) * dist;
    return {
        root: { position: { x, y: 1.95, z } },
        state: { facingVec: { x: -Math.sin(a), z: -Math.cos(a) } },
    };
}
import {
    CryptWarden, TriCompiler, ProxyBoss, ObsidianArachnid,
    HydroidCloud, SkeletalMantis, PhantasmBoss, FrostAndFuel,
    SludgeGolem, MagmaWyrm, GumoiWitness, LeviathanBoss,
} from '../../src/game/bosses/roster.js';
import { SandSpur } from '../../src/game/bosses/sand-spur.js';
import { KineticCore } from '../../src/game/bosses/kinetic-core.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read as TEXT, not imported: the point is that the module is GONE, and an
// import of a deleted file cannot be a test of its absence — it is a crash.
const bossIndexSource = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)),
        '../../src/game/bosses/index.js'), 'utf8');

export function run(t) {
    // Utilities
    {
        const pos = { x: 0, z: 0 };
        const d = moveToward(pos, { x: 10, z: 0 }, 5, 0.1);
        t.ok('moveToward advances', Math.abs(pos.x - 0.5) < 1e-6, `x=${pos.x}`);
        t.ok('moveToward distance', d > 9, `d=${d}`);
    }
    {
        const pos = { x: 11, z: 0 };
        const vel = { x: 2, z: 0 };
        const hit = bounceArena(pos, vel, { x: 0, z: 0 }, 10);
        t.ok('bounceArena reflects', hit && vel.x < 0, `vx=${vel.x}`);
    }

    // BossBase phase transitions (requires three.js via import chain)
    {
        class TestBoss extends BossBase {
            constructor() {
                super({ add() {}, remove() {} }, {
                    id: 'test', name: 'Test', hp: 10,
                    phaseThresholds: [0.66, 0.33],
                    position: { x: 0, z: 0 },
                });
            }
            tickAI() {}
        }
        let boss;
        try {
            boss = new TestBoss();
        } catch (e) {
            t.ok('BossBase constructs', false, String(e));
            return;
        }
        t.ok('boss starts phase 1', boss.phase === 1, `phase=${boss.phase}`);
        // Simulate applyHit order: onHit marks dirty, then hp drops, then update checks phase
        boss.hp = 6;
        boss.onHit(1);
        t.ok('phase still 1 until update after hp change', boss.phase === 1 || boss._phaseDirty, `phase=${boss.phase}`);
        boss.update(0.016, null, null);
        t.ok('phase 2 after update at 60%', boss.phase === 2, `phase=${boss.phase} frac=${boss.hpFrac}`);
        boss.hp = 2;
        boss._phaseDirty = true;
        boss.update(0.016, null, null);
        t.ok('phase 3 near 20%', boss.phase === 3, `phase=${boss.phase}`);
        boss.onDeath();
        t.ok('death flags set', boss.defeated && boss.state.current === 'DEAD');
        t.ok('hpFrac helper', typeof boss.hpFrac === 'number');
        t.ok('maxPhase is 3', boss.maxPhase === 3, `max=${boss.maxPhase}`);
    }

    // Roster class exports
    const roster = [
        CryptWarden, TriCompiler, ProxyBoss, ObsidianArachnid,
        HydroidCloud, SkeletalMantis, PhantasmBoss, FrostAndFuel,
        SludgeGolem, MagmaWyrm, GumoiWitness, LeviathanBoss,
        SandSpur, KineticCore,
    ];
    t.ok('14 unique boss classes', roster.length === 14, `n=${roster.length}`);
    for (const C of roster) {
        t.ok(`class ${C.name} is function`, typeof C === 'function', typeof C);
    }

    // Beat 07 Hydroid Cloud: listed as 2 phases — must actually transition
    // and run onPhaseChange (swarm growth), not just shave cooldowns.
    {
        let cloud;
        try {
            cloud = new HydroidCloud({ add() {}, remove() {} }, { x: 0, y: 2, z: 0 });
        } catch (e) {
            t.ok('HydroidCloud constructs', false, String(e));
            cloud = null;
        }
        if (cloud) {
            t.ok('Hydroid lists 2 phases', cloud.maxPhase === 2, `max=${cloud.maxPhase}`);
            t.ok('Hydroid starts phase 1', cloud.phase === 1, `phase=${cloud.phase}`);
            const orbsP1 = cloud.orbs.length;
            cloud.hp = cloud.maxHp * 0.35; // under 0.4 threshold
            cloud._phaseDirty = true;
            cloud.update(0.016, null, null);
            t.ok('Hydroid enters phase 2 at ≤40% HP', cloud.phase === 2, `phase=${cloud.phase} frac=${cloud.hpFrac}`);
            t.ok('Hydroid phase 2 grows the swarm', cloud.orbs.length > orbsP1,
                `orbs ${orbsP1}→${cloud.orbs.length}`);
            t.ok('Hydroid phase 2 raises contact damage', cloud.contactDamage >= 2,
                `contact=${cloud.contactDamage}`);
            cloud.onDeath?.();
            cloud.dispose?.();
        }
    }

    // Legacy factories
    // Phase G — the three legacy factories are CUT, and this is the guard
    // that keeps them cut. They were exported, re-exported, and called by no
    // beat file in the campaign; the only thing asserting them was the three
    // lines that used to be here, checking that a function was a function.
    t.ok('the legacy boss factories stay deleted',
        !existsSync(path.join(path.dirname(fileURLToPath(import.meta.url)),
            '../../src/game/bosses/legacy-factories.js')),
        'trap 4: deleting the call is not deleting the feature');
    t.ok('and nothing re-exports them',
        !/from '\.\/legacy-factories\.js'/.test(bossIndexSource),
        'a dead module with a live re-export is still shipped code');

    // Registry
    t.ok('16 levels registered', LEVELS.length === 16, `n=${LEVELS.length}`);
    t.ok('14 story beats', LEVELS.filter((l) => l.id.startsWith('beat-')).length === 14);

    // attachBoss win wiring
    {
        const systems = [];
        const enemies = [];
        const level = { enemies, addSystem(s) { systems.push(s); return s; }, boss: null };
        const fakeBoss = {
            bossId: 'fake',
            bossName: 'Fake',
            managedBySystem: false,
            state: { current: 'IDLE' },
            defeated: false,
            hp: 5,
            maxHp: 5,
            update() {},
            dispose() {},
        };
        attachBoss(level, fakeBoss, { nextBeat: 'x', toast: 'done' });
        t.ok('attachBoss sets managed', fakeBoss.managedBySystem === true);
        t.ok('attachBoss registers enemy', enemies.includes(fakeBoss));
        t.ok('attachBoss adds system', systems.length === 1);

        // Multi-core: container must NOT join enemies list (getter-only hp crash)
        const systems2 = [];
        const enemies2 = [];
        const level2 = { enemies: enemies2, addSystem(s) { systems2.push(s); return s; }, boss: null };
        const multi = {
            bossId: 'multi', bossName: 'Multi', managedBySystem: false,
            state: { current: 'IDLE' }, defeated: false,
            cores: [
                { managedBySystem: false, state: { current: 'IDLE' }, hp: 2 },
                { managedBySystem: false, state: { current: 'IDLE' }, hp: 2 },
            ],
            get defeated() { return this.cores.every((c) => c.state.current === 'DEAD'); },
            update() {}, dispose() {},
        };
        attachBoss(level2, multi, {});
        t.ok('multi-core container not in enemies', !enemies2.includes(multi));
        t.ok('multi-core cores in enemies', enemies2.length === 2 && enemies2[0].hp === 2);
        fakeBoss.defeated = true;
        let recorded = null;
        const game = {
            player: {},
            recordBoss(id) { recorded = id; },
            hud: { toast() {}, story: { queue() {} } },
            unlockAndSave() {},
        };
        systems[0].update(0.016, game);
        t.ok('attachBoss records defeat', recorded === 'fake', `rec=${recorded}`);
        t.ok('level marks cleared', level._bossCleared === true);
        // Second tick should not re-record
        recorded = 'once';
        systems[0].update(0.016, game);
        t.ok('defeat is single-fire', recorded === 'once');
    }

    // TriCompiler defeated when all cores dead
    {
        const scene = { add() {}, remove() {} };
        // TriCompiler needs real THREE — skip construct if fails
        try {
            const boss = new TriCompiler(scene, [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: -1, z: 0 }], { hpPerCore: 2 });
            t.ok('TriCompiler has 3 cores', boss.cores.length === 3);
            t.ok('TriCompiler not defeated initially', boss.defeated === false);
            for (const c of boss.cores) {
                c.state.current = 'DEAD';
                c.hp = 0;
            }
            t.ok('TriCompiler defeated when cores dead', boss.defeated === true);
            boss.dispose();
        } catch (e) {
            t.ok('TriCompiler constructs with three', false, String(e));
        }
    }

    // --- Obsidian Arachnid: you fight it from OUTSIDE its body -------------
    //
    // Reported from play: "the arachnid boss I had to stand inside in order to
    // hit." Measured, that was literally true, and reach was never the cause —
    // `anchor_link` connects out to 3.6m against a 2.24m visual edge. The
    // cause was `shielded = true`, an ABSOLUTE gate that `applyHit` refuses
    // from every angle. In phase 1 the only frames that could damage it were
    // its own leap, and the leap lands the spider ON the player, so the one
    // place damage ever registered was inside the model.
    {
        const scene = new THREE.Scene();
        const b = new ObsidianArachnid(scene, { x: 0, z: 0 });

        // The visible body, from its own geometry — the number the player is
        // actually looking at when they judge "am I inside it".
        const box = new THREE.Box3().setFromObject(b.root);
        const edge = Math.max(box.max.x, box.max.z);
        t.ok('the spider has real bulk', edge > 1.8, `edge=${edge.toFixed(2)}`);

        // Standing well clear of the body must be a legal swing.
        //
        // Derived from the measured body, not written as a constant. This was
        // `const OUT = 3.0`, which was outside the spider when it was authored
        // and inside it the moment the boss was given real presence — so the
        // spec started asserting that a hero standing INSIDE the model was
        // outside it, and failed for a reason that had nothing to do with the
        // bug it exists to guard. A test position relative to a body has to be
        // measured from that body.
        const OUT = edge + 0.4;
        t.ok('a swing from outside the body reaches it',
            hitboxCheck(heroFacing(b, OUT, 180), b, WEAPONS.anchor_link) === true,
            `standing ${OUT.toFixed(2)}m out, body edge ${edge.toFixed(2)}m`);
        t.ok('...and that really is outside it', OUT > edge,
            `${OUT.toFixed(2)} vs ${edge.toFixed(2)}`);
        // The margin has to stay inside the weapon, or the assertion above
        // passes for the wrong reason on the next boss that grows.
        t.ok('the flank is reachable without closing inside the carapace',
            OUT <= WEAPONS.anchor_link.range + b.hitRadius,
            `out=${OUT.toFixed(2)} reach=${(WEAPONS.anchor_link.range + b.hitRadius).toFixed(2)}`);

        // The plate is DIRECTIONAL, not absolute. This is the whole fix: it
        // used to refuse every bearing.
        t.ok('the carapace is not an absolute shield', b.shielded === false);
        t.ok('the carapace is up in phase 1', b.armorUp === true);
        b.state.facingVec = { x: 0, z: 1 };
        b._faced = true; // pin the facing so the sweep is deterministic
        const verdictAt = (deg) => applyHit(b, { damage: 0 }, heroFacing(b, OUT, deg));
        t.ok('head-on is refused', verdictAt(0).armored === true);
        t.ok('the flank is open', !verdictAt(90).armored);
        t.ok('behind is open', !verdictAt(180).armored);

        // Damage from the flank must actually land, from outside the body.
        const hp0 = b.hp;
        applyHit(b, WEAPONS.anchor_link, heroFacing(b, OUT, 135));
        t.ok('a flank swing from outside the body wounds it', b.hp < hp0,
            `${hp0} -> ${b.hp}`);
    }
    {
        // A boss must be ORIENTED when the doors shut. `state.facingVec`
        // defaults to due south, and easing to the player from there at the
        // deliberately slow turn rate left the Arachnid rotating on the spot
        // for ~1.4s with its plate aimed at nothing — every opening swing free.
        const b = new ObsidianArachnid(new THREE.Scene(), { x: 0, z: 0 });
        const north = { root: { position: { x: 0, y: 1.95, z: 6 } } };
        t.ok('facing starts at the base-class default', b.state.facingVec.z === -1);
        b.faceToward(north, 1 / 60);
        t.ok('first sight of the player snaps the body around',
            b.state.facingVec.z > 0.99, JSON.stringify(b.state.facingVec));
        t.ok('the mesh yaw follows the facing',
            Math.abs(b.root.rotation.y - Math.atan2(0, 1)) < 1e-6, `${b.root.rotation.y}`);

        // ...and thereafter it is capped, or the armoured arc would simply
        // track whoever is attacking and the flank would be unreachable.
        const south = { root: { position: { x: 0, y: 1.95, z: -6 } } };
        b.faceToward(south, 1 / 60);
        t.ok('subsequent turning is rate-capped, not snapped',
            b.state.facingVec.z > 0.99, JSON.stringify(b.state.facingVec));
    }
    {
        // The player must be able to WIN the bearing race by strafing, or
        // "get around it" is not actually available.
        const b = new ObsidianArachnid(new THREE.Scene(), { x: 0, z: 0 });
        const TURN = 1.1;                 // rad/s, the Arachnid's cap
        const orbit = 5.5 / 3.0;          // player speed / strafing radius
        t.ok('a strafing player out-turns the spider', orbit > TURN,
            `player ${orbit.toFixed(2)} rad/s vs boss ${TURN}`);
        const toFlank = b.armorArc / (orbit - TURN);
        t.ok('reaching the flank takes a second or two, not ten',
            toFlank > 0.5 && toFlank < 4, `${toFlank.toFixed(2)}s`);
    }
    {
        // A parry drops the plate, the same single rule the bestiary uses.
        const b = new ObsidianArachnid(new THREE.Scene(), { x: 0, z: 0 });
        t.ok('carapace up before the parry', b.armorUp === true);
        b.stagger(0.9);
        t.ok('a parried spider drops its plate', b.armorUp === false);
    }
    {
        // The narrower arc must not have leaked onto the bulwark, which has
        // no `armorArc` and must keep the default +/-75 degrees.
        const e = new Enemy(new THREE.Scene(), null, { x: 0, y: 1, z: 0 }, { kind: 'bulwark' });
        t.ok('a bulwark declares no custom arc', e.armorArc === undefined);
        e.state.setFacing(0, 1);
        const at70 = heroFacing(e, 2, 70);
        t.ok('the bulwark plate still spans the wider default',
            inFrontArc(e, at70) === true, '70 degrees must still be refused');
    }

    // --- Playtest 2026-07-23 issue 6: bosses respect collision + arena ------
    //
    // Bosses used to write straight to the transform. Drive one into a solid
    // for two seconds and assert its final position is OUTSIDE the solid —
    // in world space, not by checking a flag.
    {
        class WallBoss extends BossBase {
            constructor(scene, opts) { super(scene, opts); }
            tickAI(dt, player) {
                if (!player) return;
                moveToward(this.root.position, player.root.position, 8, dt);
            }
        }
        const scene = { add() {}, remove() {} };
        const cw = new CollisionWorld();
        // Wall from x=2..4, z=-5..5 — boss starts at 0 and is driven east.
        cw.addSolid({ minX: 2, maxX: 4, minZ: -5, maxZ: 5, id: 'wall' });
        const boss = new WallBoss(scene, {
            id: 'wall-test', name: 'Wall', hp: 10,
            position: { x: 0, y: 1.2, z: 0 },
            collisionWorld: cw,
            arenaRadius: 20,
            hitRadius: 1.2,
        });
        const player = { root: { position: { x: 10, y: 1.95, z: 0 } } };
        for (let i = 0; i < 120; i++) boss.update(1 / 60, player, null);
        t.ok('boss cannot walk through a solid wall',
            boss.root.position.x < 2 - 0.1,
            `x=${boss.root.position.x.toFixed(3)} (must stay west of wall at x=2)`);
        // Arena clamp: shove past the legal box and update must pull it back.
        boss.root.position.x = 50;
        boss.root.position.z = 50;
        boss.update(1 / 60, null, null);
        t.ok('arena clamp pulls a boss back inside home±radius',
            Math.abs(boss.root.position.x - boss.home.x) <= boss.arenaRadius + 1e-6
            && Math.abs(boss.root.position.z - boss.home.z) <= boss.arenaRadius + 1e-6,
            `pos=(${boss.root.position.x},${boss.root.position.z}) home=${JSON.stringify(boss.home)} r=${boss.arenaRadius}`);
        boss.dispose?.();
    }
    {
        // circleStrafe also respects the bound resolver on the position.
        const scene = { add() {}, remove() {} };
        const boss = new BossBase(scene, {
            id: 'strafe', name: 'S', hp: 5,
            position: { x: 0, y: 1.2, z: 0 },
            arenaRadius: 4,
        });
        // Minimal subclass so update runs tickAI empty + confine.
        const player = { root: { position: { x: 0, y: 1.95, z: 0 } } };
        // Spiral toward the player while they sit at the origin — without a
        // clamp the boss can wander freely; with home clamp it stays in box.
        for (let i = 0; i < 180; i++) {
            circleStrafe(boss.root.position, player, 1 / 60,
                { speed: 6, spin: 2, close: 3, minRadius: 0.5 });
            boss.confineToArena();
        }
        t.ok('circleStrafe cannot leave the arena',
            Math.abs(boss.root.position.x) <= 4.001
            && Math.abs(boss.root.position.z) <= 4.001,
            `pos=(${boss.root.position.x.toFixed(2)},${boss.root.position.z.toFixed(2)})`);
    }
    {
        // attachBoss wires collisionWorld from the level.
        const systems = [];
        const enemies = [];
        const cw = new CollisionWorld();
        const level = {
            enemies, collisionWorld: cw, halfSize: 8,
            addSystem(s) { systems.push(s); return s; }, boss: null,
        };
        const fake = new BossBase({ add() {}, remove() {} }, {
            id: 'wired', name: 'W', hp: 3, position: { x: 1, z: 1 },
        });
        t.ok('boss starts without collisionWorld when constructed bare',
            fake.collisionWorld == null);
        attachBoss(level, fake, {});
        t.ok('attachBoss wires the level collisionWorld',
            fake.collisionWorld === cw);
        t.ok('attachBoss derives arenaRadius from halfSize',
            fake.arenaRadius === Math.max(3, 8 - 1.25),
            `r=${fake.arenaRadius}`);
    }
}

