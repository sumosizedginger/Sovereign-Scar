// tests/game/threat-curve.spec.mjs
//
// ZeldaLevel.md listed the difficulty curve as something the Z1-Z7 plan could
// not fix, because it had never been measured. Measuring it found an inversion:
// authored enemy HP is nearly flat (4 in beat 02, 5 in beat 14) while the
// player's best weapon damage triples. From beat 05 onward every ordinary
// enemy died to fewer than two landed hits, in about six tenths of a second,
// for ten dungeons running. The back half of the campaign was mechanically
// softer than the front half.
//
// The cost was not "the game is easy". It was that the BESTIARY STOPPED
// WORKING. A bulwark asks "are you willing to move?", but if two swings delete
// it then walking around it is strictly slower than standing still and mashing
// — so the question is never actually put to the player. Ten dungeons of
// carefully differentiated enemy design, answered by the damage curve with
// "no need to engage".
//
// These specs pin the property, not the numbers: an enemy has to live long
// enough for its behaviour to happen.

import { BEAT_LIST } from './_beat-defs.mjs';
import {
    scaleEnemyHp, scaleBossHp, applyBossCurve, playerDamageAt, beatNumberOf,
} from '../../src/game/world/threat-curve.js';

/** Authored boss HP, measured from the live game before the curve was added. */
const AUTHORED_BOSS_HP = [8, 12, 14, 12, 16, 14, 15, 14, 12, 16, 18, 16, 18, 28];

/** Landed hits an average enemy in this beat survives, at that beat's damage. */
function hitsToKill(beat) {
    const def = BEAT_LIST[beat - 1];
    const hps = [];
    for (const room of Object.values(def.rooms)) {
        for (const e of room.enemies || []) hps.push(scaleEnemyHp(e.hp, beat));
    }
    if (!hps.length) return null;
    const avg = hps.reduce((a, b) => a + b, 0) / hps.length;
    return avg / playerDamageAt(beat);
}

export function run(t) {
    const ttk = [];
    for (let b = 1; b <= 14; b++) ttk.push(hitsToKill(b));

    // --- the inversion cannot come back -------------------------------------
    const early = ttk.slice(1, 5).reduce((a, n) => a + n, 0) / 4;   // beats 2-5
    const late = ttk.slice(8).reduce((a, n) => a + n, 0) / 6;       // beats 9-14
    t.ok('late-game enemies are not softer than early-game ones',
        late > early, `early=${early.toFixed(1)} hits late=${late.toFixed(1)} hits`);
    t.ok('and the finale is the most durable fight in the campaign',
        ttk[13] === Math.max(...ttk), `finale=${ttk[13].toFixed(1)} max=${Math.max(...ttk).toFixed(1)}`);

    // --- an enemy must outlive its own telegraph ------------------------------
    //
    // Below roughly two landed hits there is no fight: the enemy dies inside
    // its own wind-up and nothing it was built to do ever executes.
    for (let b = 2; b <= 14; b++) {
        t.ok(`beat ${String(b).padStart(2, '0')} enemies survive long enough to act`,
            ttk[b - 1] >= 1.8, `${ttk[b - 1].toFixed(1)} hits`);
    }

    // --- the reward beat is deliberate ---------------------------------------
    //
    // Beat 05 hands over the Tectonic Wedge. A new weapon has to FEEL like one,
    // so beat 05 is intentionally the softest point of the back half — the
    // player gets a dungeon to enjoy the spike before the curve closes it.
    const backHalf = ttk.slice(4);
    t.ok('the beat that grants the Wedge is the softest of the back half',
        Math.min(...backHalf) === ttk[4], `b05=${ttk[4].toFixed(1)} min=${Math.min(...backHalf).toFixed(1)}`);
    t.ok('...and the curve climbs back past the early game afterwards',
        ttk[7] >= early - 0.2, `b08=${ttk[7].toFixed(1)} vs early ${early.toFixed(1)}`);

    // --- the early game is left alone ----------------------------------------
    //
    // Beats 1-4 were tuned against a 1-damage weapon and play correctly. The
    // curve must not touch them, or fixing the back half breaks the front.
    for (let b = 1; b <= 4; b++) {
        const def = BEAT_LIST[b - 1];
        const authored = [];
        for (const room of Object.values(def.rooms)) {
            for (const e of room.enemies || []) authored.push(e.hp != null ? e.hp : 3);
        }
        t.ok(`beat ${String(b).padStart(2, '0')} is passed through exactly as authored`,
            authored.every((hp) => scaleEnemyHp(hp, b) === hp));
    }

    // --- authored HP keeps its meaning ---------------------------------------
    //
    // The curve sets the ABSOLUTE figure; the authored number stays a relative
    // weight, so an enemy written tougher than its neighbour stays tougher.
    for (let b = 5; b <= 14; b++) {
        t.ok(`beat ${String(b).padStart(2, '0')} preserves relative toughness`,
            scaleEnemyHp(5, b) > scaleEnemyHp(3, b),
            `${scaleEnemyHp(3, b)} < ${scaleEnemyHp(5, b)}`);
    }

    // --- nothing outside the campaign is touched -----------------------------
    t.ok('the overworld is not scaled', scaleEnemyHp(4, 0) === 4);
    t.ok('an unknown level id is not scaled', scaleEnemyHp(4, beatNumberOf('overworld')) === 4);
    t.ok('a sandbox is not scaled', scaleEnemyHp(4, beatNumberOf('sandbox-combat')) === 4);
    t.ok('beat ids parse', beatNumberOf('beat-08-bone') === 8);

    // --- scaling is sane -----------------------------------------------------
    t.ok('nothing is ever scaled below 1 HP',
        [1, 2, 3, 4, 5].every((hp) => [...Array(14)].every((_, i) => scaleEnemyHp(hp, i + 1) >= 1)));
    t.ok('HP stays on a half-point grid so debug readouts stay readable',
        [...Array(14)].every((_, i) => (scaleEnemyHp(4, i + 1) * 2) % 1 === 0));
    t.ok('player damage tracks the actual grant order',
        playerDamageAt(4) === 1 && playerDamageAt(5) === 2.5 && playerDamageAt(9) === 3,
        `${playerDamageAt(4)} ${playerDamageAt(5)} ${playerDamageAt(9)}`);

    // --- bosses --------------------------------------------------------------
    //
    // Authored boss HP is 12-18 for the entire campaign, with no progression in
    // it. Measured in landed hits that made nine of fourteen bosses die in 4-6,
    // against a beat-01 tutorial boss that takes 8 — and, once the trash curve
    // above landed, made beat 13's ORDINARY enemies tougher than most bosses.
    const bossTtk = AUTHORED_BOSS_HP.map((hp, i) => scaleBossHp(hp, i + 1) / playerDamageAt(i + 1));

    for (let b = 1; b <= 14; b++) {
        t.ok(`beat ${String(b).padStart(2, '0')}'s boss outlasts its own dungeon's enemies`,
            bossTtk[b - 1] > ttk[b - 1] * 2,
            `boss=${bossTtk[b - 1].toFixed(1)} trash=${ttk[b - 1].toFixed(1)} hits`);
    }
    t.ok('no boss is easier than the tutorial boss',
        bossTtk.every((n) => n >= bossTtk[0]),
        bossTtk.map((n) => n.toFixed(1)).join(' '));
    t.ok('the final boss is the longest fight in the game',
        bossTtk[13] === Math.max(...bossTtk), `${bossTtk[13].toFixed(1)}`);
    t.ok('boss durability never goes backwards after the Wedge',
        bossTtk.slice(4).every((n, i, a) => i === 0 || n >= a[i - 1]),
        bossTtk.slice(4).map((n) => n.toFixed(1)).join(' '));

    // Multi-core bosses expose maxHp as a getter over their cores; the curve
    // must scale the cores and never try to assign the aggregate.
    {
        const cores = [{ maxHp: 5, hp: 5 }, { maxHp: 5, hp: 5 }, { maxHp: 5, hp: 5 }];
        const boss = { cores, get maxHp() { return cores.reduce((a, c) => a + c.maxHp, 0); } };
        let threw = false;
        try { applyBossCurve(boss, 13); } catch { threw = true; }
        t.ok('a multi-core boss scales without assigning its getter', threw === false);
        t.ok('...and the aggregate lands on the curve',
            Math.abs(boss.maxHp - scaleBossHp(15, 13)) <= 2,
            `${boss.maxHp} vs ${scaleBossHp(15, 13)}`);
        t.ok('...with each core kept at full health', cores.every((c) => c.hp === c.maxHp));
    }
    {
        const boss = { maxHp: 16, hp: 16 };
        applyBossCurve(boss, 0);
        t.ok('a boss outside the campaign is left alone', boss.maxHp === 16);
        applyBossCurve(boss, 2);
        t.ok('and so are the early beats the curve deliberately skips', boss.maxHp === 16);
    }
}
