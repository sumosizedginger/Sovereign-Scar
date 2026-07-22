// tests/game/dungeon-pedagogy.spec.mjs — Z6.
//
// A Zelda dungeon is built around ONE idea: it introduces the idea somewhere
// safe, complicates it, fuses it with combat, then examines it at the boss.
// Sovereign Scar had the LOCK half of that vocabulary (small keys, boss keys,
// item gates) and none of the teaching half — its gates read as toll booths,
// "do you have X", never "have you understood X".
//
// This spec cannot judge whether a room teaches well. What it CAN do is stop
// the structure from rotting: every dungeon must name its idea, name the four
// rooms that carry it, and order them so the introduction genuinely comes
// before the demand. Design intent that is not enforced decays back into bugs
// — that is the lesson this whole file exists to encode.

import { BEAT_LIST } from './_beat-defs.mjs';

/** Door-graph distance from the dungeon entrance, ignoring locks. */
function distances(def) {
    const d = { [def.start]: 0 };
    const queue = [def.start];
    while (queue.length) {
        const rid = queue.shift();
        for (const door of def.rooms[rid].doors || []) {
            if (!def.rooms[door.to] || d[door.to] != null) continue;
            d[door.to] = d[rid] + 1;
            queue.push(door.to);
        }
    }
    return d;
}

const STAGES = ['teach', 'develop', 'combine', 'test'];

export function run(t) {
    const themeIds = [];

    for (const def of BEAT_LIST) {
        const th = def.theme;
        t.ok(`${def.id} declares a theme`, !!th);
        if (!th) continue;

        themeIds.push(th.id);
        t.ok(`${def.id} theme has an id and a name`, !!th.id && !!th.name);
        t.ok(`${def.id} theme states its idea to the player`,
            typeof th.hint === 'string' && th.hint.length > 20, th.hint);

        // Every stage must point at a room that exists.
        for (const stage of STAGES) {
            t.ok(`${def.id}.${stage} names a real room`,
                !!def.rooms[th[stage]], `${stage}=${th[stage]}`);
        }
        if (!STAGES.every((s) => def.rooms[th[s]])) continue;

        // All four stages must be different rooms — an arc that revisits one
        // room is not an arc.
        t.ok(`${def.id} uses four distinct rooms for its arc`,
            new Set(STAGES.map((s) => th[s])).size === 4,
            STAGES.map((s) => th[s]).join(','));

        const d = distances(def);
        for (const stage of STAGES) {
            t.ok(`${def.id}.${stage} is reachable from the entrance`,
                d[th[stage]] != null, `${stage}=${th[stage]}`);
        }

        // The introduction has to actually come first. Monotonic, not strict
        // between develop and combine — a dungeon may legitimately branch at
        // equal depth — but teach must precede both, and the test must be last.
        t.ok(`${def.id} introduces before it develops`,
            d[th.teach] < d[th.develop], `teach=${d[th.teach]} develop=${d[th.develop]}`);
        t.ok(`${def.id} develops before it combines`,
            d[th.develop] <= d[th.combine], `develop=${d[th.develop]} combine=${d[th.combine]}`);
        t.ok(`${def.id} examines last`,
            d[th.combine] < d[th.test], `combine=${d[th.combine]} test=${d[th.test]}`);

        // The exam is the boss. A dungeon that teaches an idea and then tests
        // something else has not taught anything.
        t.ok(`${def.id} tests its idea at the boss`,
            !!def.rooms[th.test].boss, `test=${th.test}`);

        // The teach room must be a room where the idea can actually be shown,
        // and it must not be the entrance — the player needs a beat to arrive
        // before being taught.
        t.ok(`${def.id} does not teach in the entrance room`, th.teach !== def.start);
        t.ok(`${def.id} teaches somewhere with something to learn from`,
            (def.rooms[th.teach].enemies || []).length > 0
            || (def.rooms[th.teach].blockers || []).length > 0,
            `teach=${th.teach}`);
    }

    // --- across the campaign ----------------------------------------------
    t.ok('every beat declared a theme', themeIds.length === BEAT_LIST.length,
        `${themeIds.length}/${BEAT_LIST.length}`);
    t.ok('no two dungeons are about the same idea',
        new Set(themeIds).size === themeIds.length, themeIds.join(','));
    for (let i = 1; i < themeIds.length; i++) {
        t.ok(`beat ${i + 1} does not repeat the previous beat's idea`,
            themeIds[i] !== themeIds[i - 1], `${themeIds[i - 1]} → ${themeIds[i]}`);
    }
}
