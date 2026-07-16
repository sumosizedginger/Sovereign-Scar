// Unit tests for multi-phase boss framework + roster + attachBoss.

import { BossBase, attachBoss, moveToward, bounceArena } from '../../src/game/bosses/base.js';
import {
    CryptWarden, TriCompiler, ProxyBoss, ObsidianArachnid,
    HydroidCloud, SkeletalMantis, PhantasmBoss, FrostAndFuel,
    SludgeGolem, MagmaWyrm, GumoiWitness, LeviathanBoss,
} from '../../src/game/bosses/roster.js';
import { SandSpur } from '../../src/game/bosses/sand-spur.js';
import { KineticCore } from '../../src/game/bosses/kinetic-core.js';
import { LEVELS } from '../../src/game/levels/registry.js';
import {
    createMultiCoreBoss, createPhantasm, createLeviathanCore,
} from '../../src/game/bosses/legacy-factories.js';

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

    // Legacy factories
    t.ok('createMultiCoreBoss fn', typeof createMultiCoreBoss === 'function');
    t.ok('createPhantasm fn', typeof createPhantasm === 'function');
    t.ok('createLeviathanCore fn', typeof createLeviathanCore === 'function');

    // Registry
    t.ok('15 levels registered', LEVELS.length === 15, `n=${LEVELS.length}`);
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
}
