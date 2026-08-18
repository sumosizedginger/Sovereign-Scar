// tests/qa/content-density.mjs — PRINT-ONLY probe: how much game is in the game.
//
// Every other probe in this directory measures whether a thing is CORRECT.
// This one measures whether there is ENOUGH of it, because the campaign can be
// entirely correct and still be thin, and nothing in the suite would say so.
// A green suite tells you the nine enemy kinds behave as designed; it cannot
// tell you that the campaign only ever puts two of them in a room at once.
//
// Everything here is read off the authored source, so it is exact and needs no
// browser. Run it before and after any content pass:
//
//     node tests/qa/content-density.mjs
//
// Read it as a shape, not a scoreboard. The interesting numbers are the ones
// where the SYSTEM is richer than the CAMPAIGN that uses it — a built mechanic
// nobody authored an encounter for is the cheapest content in the project.

import fs from 'node:fs';
import path from 'node:path';
// Phase E1's puzzles are GENERATED per room, so they cannot be grepped out of
// the level files the way the four item locks can. Import the real defs and ask
// the real placer.
import { BEAT_LIST } from '../game/_beat-defs.mjs';
import { puzzlesForDungeon } from '../../src/game/world/puzzles.js';
import { censusFile } from './lib/boss-actions.mjs';
import { ENEMY_PALETTES } from '../../src/game/assets/palettes.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LEVELS = path.join(ROOT, 'src/game/levels');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const beats = fs.readdirSync(LEVELS)
    .filter((f) => /^beat-\d+/.test(f))
    .sort();

const bar = (n, max, w = 28) =>
    '█'.repeat(Math.round((n / Math.max(1, max)) * w)).padEnd(w, '·');

console.log('\n══ SOVEREIGN SCAR — CONTENT DENSITY ' + '═'.repeat(43));

// ── 1. Encounters ──────────────────────────────────────────────────────────
// The unit that matters is "enemies alive in the room at once", because that
// is what decides whether an encounter has a shape or is just a queue.
const enc = { rooms: 0, total: 0, hist: {}, perBeat: {} };
const kinds = {};
const pairs = {};   // "kind+ai" — the matrix trap 9 is about

// READ FROM THE REAL DEFINITIONS, NOT FROM THE SOURCE TEXT.
//
// This section used to grep the level files for an `enemies:` array whose
// closing bracket was matched by a pattern ending in "newline, twelve spaces,
// close-bracket" — which requires the closing bracket to sit at exactly twelve
// spaces of indentation. Twenty-two of the campaign's arrays are written on one
// line — `enemies: [{ x: 0, z: -3, kind: 'scarab', … }],` — and have no such
// bracket, so they were not counted as rooms at all.
//
// The TOTALS still came out right (153 either way) because the entry regex ran
// over whatever text the block match happened to swallow. The ROOM count did
// not: it reported 47 encounter rooms against a real 65, and therefore a mean
// encounter size of 3.26 against a real 2.35, and a histogram and a set of
// per-beat peaks built on the same mistake. A design conversation about
// encounter density was being had against numbers that were 28% out.
//
// `BEAT_LIST` is already imported for the puzzle census below. Nothing here
// needed to be grepped.
for (const def of BEAT_LIST) {
    const beat = def.id.slice(0, 7);
    enc.perBeat[beat] = { rooms: 0, mobs: 0, max: 0 };
    for (const room of Object.values(def.rooms)) {
        const entries = room.enemies || [];
        if (!entries.length) continue;
        enc.rooms++;
        enc.total += entries.length;
        enc.hist[entries.length] = (enc.hist[entries.length] || 0) + 1;
        enc.perBeat[beat].rooms++;
        enc.perBeat[beat].mobs += entries.length;
        enc.perBeat[beat].max = Math.max(enc.perBeat[beat].max, entries.length);
        for (const e of entries) {
            const k = e.kind;
            if (!k) continue;
            const ai = e.ai || '(default)';
            kinds[k] = (kinds[k] || 0) + 1;
            pairs[`${k} + ${ai}`] = (pairs[`${k} + ${ai}`] || 0) + 1;
        }
    }
}

const sizes = Object.keys(enc.hist).map(Number).sort((a, b) => a - b);
console.log(`\n▸ ENCOUNTERS   ${enc.total} enemies across ${enc.rooms} rooms `
    + `— mean ${(enc.total / enc.rooms).toFixed(2)}, largest ${Math.max(...sizes)}`);
for (const s of sizes) {
    console.log(`    ${s} at once  ${bar(enc.hist[s], enc.rooms)} ${enc.hist[s]} rooms`);
}
console.log('\n    per beat:');
for (const [b, v] of Object.entries(enc.perBeat)) {
    console.log(`      ${b}  ${String(v.mobs).padStart(3)} mobs / ${String(v.rooms).padStart(2)} rooms`
        + `   peak ${v.max}`);
}

// ---- 1b. What each room is FOR --------------------------------------------
//
// "56% of rooms do nothing" was the premise of a content ticket, and it came
// out of the broken count above: 108 rooms minus 47 with encounters. It was
// never true. This asks the question directly instead, and the answer is that
// only fourteen rooms in the campaign offer the player nothing at all - and
// every one of them is a dungeon's ENTRANCE, which is a deliberate pattern
// rather than a gap. A quiet threshold before the dungeon starts is a room
// doing its job.
//
// The thin rooms are somewhere else entirely, and the corrected histogram is
// where to look: twenty-four rooms hold a single enemy. A room with one enemy
// in it promises a fight and delivers a speed bump, which is closer to "does
// nothing" than an empty room that never promised anything.
{
    const keysByRoom = {};
    for (const def of BEAT_LIST) {
        for (const k of def.keys || []) keysByRoom[`${def.id}/${k.room}`] = true;
    }
    const offers = { fight: 0, boss: 0, item: 0, key: 0, story: 0, blocker: 0, built: 0 };
    const bare = [];
    let solo = 0;
    let roomCount = 0;
    for (const def of BEAT_LIST) {
        for (const [rid, room] of Object.entries(def.rooms)) {
            roomCount++;
            const n = (room.enemies || []).length;
            const has = {
                fight: n > 0,
                boss: !!room.boss,
                item: !!room.onBake,
                key: !!keysByRoom[`${def.id}/${rid}`],
                story: !!room.onEnter,
                blocker: (room.blockers || []).length > 0,
                // BOTH HOOKS. Asking only `build` reported beat 11's lichgate
                // as the one room in the game with no authored geometry, and it
                // was about to be "fixed". It builds its walkable islets
                // through `platforms` instead — the platform map, which is
                // meshed without XZ solids — because an islet you stand ON is
                // not the same thing as a wall. Two hooks, one question.
                built: !!room.build || !!room.platforms,
            };
            if (n === 1) solo++;
            for (const [k, v] of Object.entries(has)) if (v) offers[k]++;
            // `built` is geometry, not a reason to be there - a room can be
            // beautifully shaped and still hand the player nothing to do.
            const reason = has.fight || has.boss || has.item || has.key
                || has.story || has.blocker;
            if (!reason) {
                bare.push(`${def.id.replace('beat-', '')}/${rid}`
                    + (has.built ? '' : '  (NO AUTHORED GEOMETRY EITHER)'));
            }
        }
    }
    console.log(`\nROOM PURPOSE   ${roomCount} rooms`);
    for (const [k, v] of Object.entries(offers)) {
        console.log(`    ${k.padEnd(10)} ${bar(v, roomCount)} ${String(v).padStart(3)} rooms`);
    }
    console.log(`\n    offering NOTHING: ${bare.length} rooms`);
    for (const b of bare) console.log(`      ${b}`);
    console.log('\n    ...and they are one per dungeon: the entrance. That is a pattern,');
    console.log('    not a gap - a quiet room before the dungeon starts.');
    console.log(`\n    The thin ones are elsewhere: ${solo} rooms hold exactly one enemy,`);
    console.log('    which promises a fight and delivers a speed bump.');
}

// ── 2. The kind × AI matrix ────────────────────────────────────────────────
// Trap 9 in HANDOFF.md is about a kind trait meeting an AI trait. That trap is
// only worth the ink if the campaign actually authors the combinations — so
// count how much of the grid is ever built.
//
// THE ROSTER IS DERIVED, NOT TYPED. This line used to read:
//
//     const KINDS = ['sentinel','scarab','frost','bulwark','mote','lancer','brood'];
//
// — seven kinds, hardcoded, against a game that has NINE. `weaver` and `censer`
// shipped with palettes, bodies, AI branches, held props and six authored
// spawns across beats 07, 09, 11, 12, 13 and 14, and this matrix has never once
// mentioned them. Worse, it printed a coverage PERCENTAGE — "37 of 42 cells
// (88%)" — computed against a grid that was two whole rows short, so the number
// most likely to be quoted into a content plan was the most wrong thing here.
//
// Same disease as the boss counter this probe had in its other half, same cure:
// ask the thing that knows. `ENEMY_PALETTES` is what `createActorRig` builds a
// kind from, so a kind that exists is a key in it, and a tenth kind added
// tomorrow appears here without anyone remembering to come back.
const KINDS = Object.keys(ENEMY_PALETTES);
const AIS = ['(default)', 'chase', 'charge', 'ranged', 'lunge', 'drift'];
console.log(`\n▸ BESTIARY MATRIX   ${KINDS.length} kinds × ${AIS.length - 1} AI behaviours`);
let filled = 0;
const w = 10;
console.log('    ' + 'kind'.padEnd(w) + AIS.map((a) => a.replace('(default)', 'deflt').padStart(7)).join(''));
for (const k of KINDS) {
    let row = '    ' + k.padEnd(w);
    for (const a of AIS) {
        const n = pairs[`${k} + ${a}`] || 0;
        if (n) filled++;
        row += (n ? String(n) : '·').padStart(7);
    }
    console.log(row);
}
console.log(`    → ${filled} of ${KINDS.length * AIS.length} cells authored `
    + `(${Math.round((filled / (KINDS.length * AIS.length)) * 100)}%)`);

// ── 3. Bosses ──────────────────────────────────────────────────────────────
// A boss commits to a telegraphed attack through one of TWO mechanisms now, and
// counting only the older one is how this probe came to report the Crypt Warden
// — the boss that teaches the game's core lesson — as having zero moves:
//
//   staged     a direct `this.startAction({ name: … })` in the class body
//   declared   an entry in `this.defineActions([ … ])`, committed for the boss
//              by `actIfReady` inside base.js, so the class body contains no
//              `startAction` call at all
//
// Both are object literals carrying a `name:`, so both are counted and the
// moveset is the union. See `lib/boss-actions.mjs` for why this is a rule about
// action DEFINITIONS rather than a special case for one boss.
console.log('\n▸ BOSS MOVESETS   committed actions per boss (declared + staged)');
const bossFiles = ['src/game/bosses/roster.js', 'src/game/bosses/sand-spur.js',
    'src/game/bosses/kinetic-core.js'];
let bossTotal = 0, bossCount = 0;
const unmeasurable = [];
for (const bf of bossFiles) {
    for (const b of censusFile(rd(bf), bf)) {
        // A boss that is not a BossBase subclass has no action list to read.
        // It is NOT dropped: the old probe silently omitted the Tri-Compiler
        // and then printed "across 13 bosses" for a fourteen-fight campaign.
        if (!b.isBossBase) {
            if (/Boss|Warden|Compiler|Core|Spur|Wyrm|Golem|Cloud|Mantis|Witness|Arachnid/.test(b.name)) {
                unmeasurable.push(b.name);
            }
            continue;
        }
        const n = b.names.length;
        bossTotal += n; bossCount++;
        console.log(`    ${b.name.padEnd(18)} ${bar(n, 4, 8)} ${n} action(s)`
            + `   ${b.phases} phases   ${b.mechanism}`);
    }
}
console.log(`    → ${bossTotal} committed attacks across ${bossCount} bosses `
    + `(mean ${(bossTotal / bossCount).toFixed(2)})`);
if (unmeasurable.length) {
    console.log(`    ⚠ not countable from source (no BossBase action list): `
        + `${unmeasurable.join(', ')} — driven instead by tests/game/boss-movesets.spec.mjs`);
}

// ── 4. Puzzles ─────────────────────────────────────────────────────────────
//
// TWO sources now, and counting only the first is how this probe started lying
// about its own game. The four original blocker types are literals in the level
// files; the Phase E1 puzzle beats are generated per room from
// `world/puzzles.js` and appear in no level file at all. A grep-only count
// reported "1.5 per dungeon" while forty puzzle beats were baking.
console.log('\n▸ PUZZLE VOCABULARY   authored instances per primitive');
const BLOCKERS = ['grapple_gap', 'wedge_crack', 'boot_ledge', 'caster_dark'];
let blkTotal = 0;
const allLevelSrc = fs.readdirSync(LEVELS)
    .map((f) => fs.readFileSync(path.join(LEVELS, f), 'utf8')).join('\n');
for (const b of BLOCKERS) {
    const n = (allLevelSrc.match(new RegExp(`type:\\s*'${b}'`, 'g')) || []).length;
    blkTotal += n;
    console.log(`    ${b.padEnd(18)} ${bar(n, 8, 10)} ${n}   (item lock)`);
}
console.log('');
const pzKinds = {};
let pzBeats = 0;
for (const def of BEAT_LIST) {
    const bn = Number(String(def.id).match(/beat-(\d+)/)?.[1] || 0);
    for (const { blockers } of puzzlesForDungeon(def, bn)) {
        pzBeats++;
        for (const b of blockers) pzKinds[b.type] = (pzKinds[b.type] || 0) + 1;
    }
}
for (const [k, n] of Object.entries(pzKinds).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(18)} ${bar(n, 42, 10)} ${n}   (puzzle)`);
}
console.log(`    → ${blkTotal} item locks + ${pzBeats} puzzle beats across `
    + `${beats.length} dungeons — `
    + `${(pzBeats / beats.length).toFixed(1)} per dungeon ask for a plan `
    + 'rather than an item');

// ── 5. Systems built but barely used ───────────────────────────────────────
// The cheapest content in the project: code that already works and that the
// campaign forgot to ask for.
console.log('\n▸ SYSTEM REACH   files that import each world system');
const SYSTEMS = ['pushable-block', 'gear-system', 'light-line-system',
    'fluid-plane', 'destructible-voxel-mesh', 'altar', 'death-echo',
    'heart-drops', 'room-decals'];
const srcFiles = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.js')) srcFiles.push(p);
    }
})(path.join(ROOT, 'src'));
// A system imported once by `index.js` is GLOBAL (every level gets it); a
// system imported once by a level file is a ONE-OFF (one dungeon gets it).
// Counting importers alone cannot tell those apart, so name them.
for (const s of SYSTEMS) {
    const users = srcFiles.filter((p) =>
        !p.endsWith(`${s}.js`) && fs.readFileSync(p, 'utf8').includes(`${s}.js`));
    const names = users.map((p) => path.basename(p));
    const levelOnly = users.length && users.every((p) => /[\\/]levels[\\/]/.test(p));
    const flag = users.length === 0 ? '← DEAD, nothing imports it'
        : levelOnly && users.length === 1 ? `← one dungeon only (${names[0]})`
            : `(${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''})`;
    console.log(`    ${s.padEnd(26)} ${String(users.length).padStart(2)}  ${flag}`);
}

// ── 6. Room shape ──────────────────────────────────────────────────────────
const doors = {};
for (const t of ['open', 'locked', 'boss', 'exit']) {
    doors[t] = (allLevelSrc.match(new RegExp(`type:\\s*'${t}'`, 'g')) || []).length;
}
const seals = (allLevelSrc.match(/seal:\s*true/g) || []).length;
const rooms = (allLevelSrc.match(/^\s{8}\w+:\s*\{$/gm) || []).length;
console.log('\n▸ TOPOLOGY');
console.log(`    rooms authored     ${rooms}`);
console.log(`    sealed (arena)     ${seals}  (${Math.round((seals / rooms) * 100)}%)`);
console.log(`    doors              open ${doors.open} · locked ${doors.locked} `
    + `· boss ${doors.boss} · exit ${doors.exit}`);

// ── 7. Player verbs ────────────────────────────────────────────────────────
const wsrc = rd('src/game/combat/weapons.js');
const melee = (wsrc.match(/^export const \w+ = arcMove/gm) || []).length;
console.log('\n▸ PLAYER VERBS');
const charged = (wsrc.match(/^\s{4}charge: \{$/gm) || []).length;
// COUNTED, not asserted. This line read "one attack button, no combo" for a
// while after `src/game/combat/combo.js` shipped — a probe that describes the
// game from memory is the thing this file exists to replace.
const comboSteps = (() => {
    try {
        const src = fs.readFileSync(path.join(ROOT, 'src/game/combat/combo.js'), 'utf8');
        const m = src.match(/COMBO_STEPS\s*=\s*(\d+)/);
        return m ? Number(m[1]) : 0;
    } catch (_) { return 0; }
})();
console.log(`    melee weapons      ${melee}   ` +
    (comboSteps > 1
        ? `(one attack button, ${comboSteps}-step combo derived per weapon)`
        : '(one attack button, no combo)'));
console.log(`    charged moves      ${charged}   ${charged >= melee
    ? '(one per weapon)' : '← NOT every weapon has one'}`);
const psrc = rd('src/game/player.js');
console.log(`    dash-attack        ${/tryDashAttack/.test(psrc) ? 'yes' : 'NO'}`);
console.log(`    upgrade nodes      ${(rd('src/game/kernel/upgrades.js')
    .match(/^\s{4}\w+: \{$/gm) || []).length}   (stats only, by design)`);
// Look for the SHIPPED mechanism, not a name it never had. The old probe
// grepped for `_attackBuffer|inputBuffer|bufferT` and reported "NO" for a
// session after phase A1 landed, because the real fix is a TIMESTAMP
// (`_attackAt` + an `INPUT_BUFFER` window), not a field with "buffer" in it.
const buffered = /INPUT_BUFFER/.test(rd('src/game/input.js'))
    && /consumeAttack\(INPUT_BUFFER\)/.test(psrc);
console.log(`    input buffering    ${buffered ? 'yes' : 'NO — presses during cooldown are dropped'}`);

console.log('\n' + '═'.repeat(78) + '\n');
