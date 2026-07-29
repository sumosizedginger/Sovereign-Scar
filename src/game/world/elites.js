// Phase D2 — elites.
//
// THE GAP THIS FILLS
//
// The campaign had exactly two difficulties of thing to fight: an enemy that
// dies in three hits, and a boss that takes twenty minutes. Nothing in between,
// for fourteen dungeons. The score system has defined an `elite` award worth
// 250 since it was written and NOTHING has ever fired it.
//
// An elite is not a new enemy. It is an existing kind with one twist, a name, a
// health bar and a guaranteed drop — which is the cheapest interesting content
// in the game, because every one of those four things already has code behind
// it. The twists are deliberately answerable with what the player already
// knows: the Plated Warden is a flanking problem, the Lance Captain is a lane
// problem, the Brood Mother is a priority problem.
//
// PLACEMENT LIVES IN ONE PLACE
//
// The plan called for hand-placing one per dungeon in ten level files. It is a
// table here and a single call in `bakeRoom` instead — trap 5, the project's
// most expensive recurring bug is the sweep that touched nine of ten sites. The
// `combine` room of each dungeon's authored `theme:` block is where they go,
// because that slot's whole job is "the mechanic, now with combat".
//
// WHERE THIS DEPARTS FROM THE PLAN, AND WHY
//
// The plan describes the Frost Chorus as three frost enemies firing in
// sequence. That is now what the ENCOUNTER DIRECTOR does to any three enemies
// in a room, for free — so building it a second time by hand would have been
// three bodies to score, three health bars, and no mechanic the room next door
// does not already have. It is one body firing a three-shot fanned volley
// instead: still a rhythm rather than a wall, still asks you to keep moving
// across rather than step out once, and it is a single thing to name and kill.
//
// The Mote Cluster is the one that genuinely needs several bodies, because
// "three targets, one health pool" IS the mechanic — so it kept them.

export const ELITES = {
    lance_captain: {
        name: 'Lance Captain',
        bodies: 1,
        // Lunges twice. The counterplay to a lunge is to step ACROSS its lane,
        // and the second lane is drawn perpendicular — through wherever that
        // step just put you. The answer is to keep moving, not to dodge once.
        opts: () => ({
            kind: 'lancer', ai: 'lunge',
            hp: 9, damage: 1.5, speed: 2.6,
            doubleLunge: true,
        }),
    },
    plated_warden: {
        name: 'Plated Warden',
        bodies: 1,
        // The plate covers 120 degrees instead of 75, so walking around the
        // side no longer clears it — you need the back, or a parry. Its turn
        // rate is dropped to keep that reachable: a wider plate on the same
        // turn rate would be the unkillable bulwark bug again, wearing a
        // health bar.
        opts: () => ({
            kind: 'bulwark', ai: 'chase',
            hp: 12, damage: 1.5, speed: 2.0,
            armorArc: (120 * Math.PI) / 180,
            turnRate: 1.7,
        }),
    },
    frost_chorus: {
        name: 'Frost Chorus',
        bodies: 1,
        opts: () => ({
            kind: 'frost', ai: 'ranged',
            hp: 8, damage: 1, volley: 3,
        }),
    },
    brood_mother: {
        name: 'Brood Mother',
        bodies: 1,
        // Four children, and the children split once more. Eight bodies from
        // one kill is a priority problem: cut the mother early and you fight
        // the whole family, cut her last and you fight her alone.
        opts: () => ({
            kind: 'brood', ai: 'charge',
            hp: 10, damage: 1.5,
            split: 4, childSplit: 2,
        }),
    },
    mote_cluster: {
        name: 'Mote Cluster',
        bodies: 3,
        // Three bodies, one health pool. Every hit counts wherever it lands,
        // so the question is not which one to kill — it is that there is no
        // "which one", and a player who spends the fight chasing one of them
        // has misread it.
        opts: (i, shared) => ({
            kind: 'mote', ai: 'drift',
            hp: 14, damage: 1,
            sharedPool: shared,
        }),
    },
};

/**
 * One per dungeon from beat 05 on. Each type appears twice across the back ten,
 * paired to the dungeon whose own idea it examines: the Plated Warden guards
 * the Citadel, whose stated theme is literally The Plate; the Frost Chorus sings
 * in the Cryo Vault; the Brood Mother spawns in the Quarry and the Mire, the two
 * dungeons built around things that come apart.
 */
export const ELITE_BY_BEAT = {
    5: 'plated_warden',
    6: 'brood_mother',
    7: 'mote_cluster',
    8: 'lance_captain',
    9: 'mote_cluster',
    10: 'frost_chorus',
    11: 'brood_mother',
    12: 'lance_captain',
    13: 'plated_warden',
    14: 'frost_chorus',
};

/** The elite this beat's `combine` room holds, or null. */
export function eliteForBeat(beatNo) {
    const id = ELITE_BY_BEAT[Number(beatNo)];
    return id ? { id, ...ELITES[id] } : null;
}

/**
 * Build the spawn list for an elite: `[{ dx, dz, opts }]`, relative to the room
 * origin. The caller owns actually constructing enemies, because only it knows
 * about room bounds, the HP curve, and the split spawner.
 */
export function eliteSpawns(beatNo, half = 10) {
    const e = eliteForBeat(beatNo);
    if (!e) return [];
    // One shared pool object per cluster, created here so every body in it
    // points at the SAME object rather than at copies that would each take
    // damage separately — which is the whole mechanic, inverted.
    const shared = {};
    const out = [];
    const ring = Math.min(2.2, half * 0.25);
    for (let i = 0; i < e.bodies; i++) {
        const a = (i / Math.max(1, e.bodies)) * Math.PI * 2;
        out.push({
            dx: e.bodies === 1 ? 0 : Math.cos(a) * ring,
            dz: (e.bodies === 1 ? 0 : Math.sin(a) * ring) - half * 0.35,
            opts: {
                ...e.opts(i, shared),
                // The name rides on every body — the health bar should read
                // "MOTE CLUSTER" whichever of the three you are looking at.
                eliteName: e.name,
                eliteId: e.id,
                // The score flag rides on exactly one, or a three-bodied elite
                // would pay out three times.
                elite: i === 0,
                loot: i === 0
                    ? { color: 0xffd060, label: `${e.name} core`, scoreType: 'secret' }
                    : null,
            },
        });
    }
    return out;
}
