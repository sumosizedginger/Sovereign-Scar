// tests/game/room-decals.spec.mjs — weathering that cannot touch the game.
//
// Every dungeon kit already declared an `atmosphere` — 'drips', 'vapor',
// 'heat_shimmer', 'grit' — and every one of those was a particle effect in the
// air with nothing on the ground agreeing with it. The Mire had bubbles rising
// off a floor with no algae on it; the Pyre had heat shimmer over unscorched
// stone; the Cryo Vault had vapour above ice that had never frosted.
//
// The safety argument here is different from the trim's and simpler: trim adds
// geometry and has to prove it lands somewhere the player can never be.
// Weathering is COLOUR ONLY, so the proof is that the cell set is identical
// before and after — same keys, same count, nothing added, nothing removed.
//
// The other thing it has to get right is not drifting the certification band.
// `applyKit` sidesteps this by being brighten-only, which cannot work here:
// scorch is dark and that is the point. So coverage and strength are bounded,
// and the bound is asserted rather than left to whoever edits the table next.

import { applyRoomDecals, WEATHERING, WEATHERED_KITS } from '../../src/game/world/room-decals.js';
import { REGIONS } from '../../src/game/overworld/world7.js';
import { KITS } from '../../src/game/levels/dungeon-kits.js';
import { buildRoomFloor } from '../../src/game/world/level-builder.js';
import { fillBox } from '../../src/voxel/helpers.js';
import { CRUST_COLORS } from '../../src/game/assets/palettes.js';

function bakeRoom({ half = 12, wallH = 4 } = {}) {
    const map = new Map();
    buildRoomFloor(map, -half, half, -half, half, 0, CRUST_COLORS.floor);
    fillBox(map, -half, half, 1, wallH, -half, -half, CRUST_COLORS.wall);
    fillBox(map, -half, half, 1, wallH, half, half, CRUST_COLORS.wall);
    fillBox(map, -half, -half, 1, wallH, -half, half, CRUST_COLORS.wall);
    fillBox(map, half, half, 1, wallH, -half, half, CRUST_COLORS.wall);
    return map;
}

const lum = (hex) => 0.2126 * ((hex >> 16) & 255)
    + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255);

const meanLum = (map) => {
    let s = 0;
    for (const c of map.values()) s += lum(c);
    return s / map.size;
};

const ROOM = { half: 12, wallH: 4 };
const CRYPT = KITS['beat-01-crypt'];

export function run(t) {
    // ---------------------------------------------------------------
    // THE LOAD-BEARING CASE: geometry is untouched
    // ---------------------------------------------------------------
    {
        const plain = bakeRoom();
        const weathered = bakeRoom();
        const touched = applyRoomDecals(weathered, ROOM, CRYPT, 'tomb');

        t.ok('weathering actually recoloured something', touched > 0, `touched=${touched}`);
        t.ok('the cell count is unchanged', weathered.size === plain.size,
            `${plain.size} -> ${weathered.size}`);
        let missing = 0, extra = 0;
        for (const k of plain.keys()) if (!weathered.has(k)) missing++;
        for (const k of weathered.keys()) if (!plain.has(k)) extra++;
        t.ok('no cell was removed', missing === 0, `${missing} missing`);
        t.ok('no cell was added', extra === 0, `${extra} added`);
        // Which is the whole safety argument: colour cannot change collision,
        // traversal, door triggers, spawns or getVoxelAt.
    }

    // ---------------------------------------------------------------
    // it does not drift the certification band
    // ---------------------------------------------------------------
    {
        // Every kit, on the same room, so the comparison is like for like.
        let worst = 0, worstKit = '';
        for (const [id, kit] of Object.entries(KITS)) {
            const plain = bakeRoom();
            const weathered = bakeRoom();
            applyRoomDecals(weathered, ROOM, kit, 'room');
            const before = meanLum(plain), after = meanLum(weathered);
            const drift = Math.abs(after - before);
            if (drift > worst) { worst = drift; worstKit = `${kit.name} (${id})`; }
        }
        // The gate's bands are 45 wide (Crust) and 40 (Abyss), and levels sit
        // 5+ points inside them. Holding the worst kit under 8 points of albedo
        // drift keeps weathering from being the thing that pushes one out.
        t.ok('no kit drifts the room mean by more than 8', worst < 8,
            `worst=${worst.toFixed(1)} on ${worstKit}`);
        t.ok('but weathering is visible at all', worst > 0.5,
            `worst=${worst.toFixed(1)} — if this is ~0 nothing is being applied`);
    }

    // ---------------------------------------------------------------
    // patches, not salt-and-pepper
    // ---------------------------------------------------------------
    {
        // A per-cell random threshold gives speckle, which reads as compression
        // artefacts rather than as dirt. Weathering pools. The test: walk a row
        // of the floor and count how often "is this cell weathered" FLIPS. With
        // smooth noise a run of weathered cells stays weathered for a while.
        const plain = bakeRoom();
        const map = bakeRoom();
        applyRoomDecals(map, ROOM, KITS['beat-11-mire'], 'algae');
        let flips = 0, weathered = 0, cells = 0;
        let prev = null;
        for (let x = -ROOM.half; x <= ROOM.half; x++) {
            const k = `${x},0,3`;
            const isW = map.get(k) !== plain.get(k);
            if (prev !== null && isW !== prev) flips++;
            prev = isW;
            if (isW) weathered++;
            cells++;
        }
        t.ok('the row has both weathered and clean cells',
            weathered > 0 && weathered < cells, `${weathered}/${cells}`);
        // Random per-cell at ~36% coverage would flip roughly 2*p*(1-p)*n ≈ 11
        // times across 25 cells. Patches flip a handful of times at most.
        t.ok('weathering forms patches, not speckle', flips <= 6,
            `${flips} flips across ${cells} cells — random would be ~11`);
    }

    // ---------------------------------------------------------------
    // walls stain vertically, and the lit cap is left alone
    // ---------------------------------------------------------------
    {
        const plain = bakeRoom();
        const map = bakeRoom();
        applyRoomDecals(map, ROOM, KITS['beat-07-sluice'], 'waterline');
        let capTouched = 0;
        for (let x = -ROOM.half; x <= ROOM.half; x++) {
            if (map.get(`${x},${ROOM.wallH},${ROOM.half}`)
                !== plain.get(`${x},${ROOM.wallH},${ROOM.half}`)) capTouched++;
        }
        t.ok('the wall cap course is never weathered', capTouched === 0,
            `${capTouched} cap cells touched — the kit brightens the cap as a lit `
            + 'inlay, and staining over it removes the only shading the room had');

        // A vertical column of wall should vary with height — that is what makes
        // it read as running down the face rather than as the floor's pattern
        // smeared sideways.
        let varied = 0;
        for (let x = -ROOM.half; x <= ROOM.half; x++) {
            const col = new Set();
            for (let y = 1; y < ROOM.wallH; y++) col.add(map.get(`${x},${y},${ROOM.half}`));
            if (col.size > 1) varied++;
        }
        t.ok('wall staining varies with height', varied > 3,
            `${varied} columns vary — staining runs down a face, it does not band`);
    }

    // ---------------------------------------------------------------
    // determinism
    // ---------------------------------------------------------------
    {
        const a = bakeRoom(); applyRoomDecals(a, ROOM, CRYPT, 'tomb');
        const b = bakeRoom(); applyRoomDecals(b, ROOM, CRYPT, 'tomb');
        let diff = 0;
        for (const [k, c] of a) if (b.get(k) !== c) diff++;
        t.ok('the same room weathers identically twice', diff === 0, 'no Math.random');

        const c = bakeRoom(); applyRoomDecals(c, ROOM, CRYPT, 'a-different-room');
        let differs = 0;
        for (const [k, v] of a) if (c.get(k) !== v) differs++;
        t.ok('a different room weathers differently', differs > 0,
            'otherwise every room in a dungeon wears the same stain');
    }

    // ---------------------------------------------------------------
    // every kit is covered, and the table stays sane
    // ---------------------------------------------------------------
    {
        const kitNames = Object.values(KITS).map((k) => k.name);
        const missing = kitNames.filter((n) => !WEATHERING[n]);
        t.ok('every dungeon kit declares weathering', missing.length === 0,
            missing.join(', '));
        // TWO CLASSES OF ENTRY, and the check got stronger rather than looser
        // when the second arrived. Dungeon entries name a kit. Overworld
        // entries are `ow:<region>` and name one of the eight regions in
        // `world7.js` — that level has no kit at all, which is why its
        // forty-nine screens were the only places in the game receiving no
        // weathering.
        const owNames = Object.keys(REGIONS).map((r) => `ow:${r}`);
        const orphan = WEATHERED_KITS.filter(
            (n) => !kitNames.includes(n) && !owNames.includes(n));
        t.ok('no weathering entry names a kit or region that does not exist',
            orphan.length === 0, orphan.join(', '));
        // …and the reverse, which is the half that actually bites: a region
        // renamed in world7.js would silently stop being weathered.
        const unweathered = owNames.filter((n) => !WEATHERED_KITS.includes(n));
        t.ok('every overworld region declares weathering',
            unweathered.length === 0, unweathered.join(', '));
        t.ok('…and there are eight of them',
            owNames.length === 8, `${owNames.length}: ${Object.keys(REGIONS).join(', ')}`);
        // The namespace exists because three region ids are one capital letter
        // from a kit name. If that prefix were ever dropped, `quarry` would
        // resolve against `Quarry` on any case-insensitive lookup.
        t.ok('overworld entries stay namespaced',
            owNames.every((n) => n.startsWith('ow:')));

        for (const [name, s] of Object.entries(WEATHERING)) {
            t.ok(`${name} coverage is bounded`, s.coverage > 0 && s.coverage <= 0.45,
                `coverage=${s.coverage} — past ~0.45 it stops being weathering and `
                + 'becomes the floor colour');
            t.ok(`${name} strength is bounded`, s.strength > 0 && s.strength <= 0.45,
                `strength=${s.strength}`);
            t.ok(`${name} targets a real surface`,
                ['floor', 'wall', 'both'].includes(s.where), s.where);
        }
    }

    // ---------------------------------------------------------------
    // it can be switched off, and declines silly input
    // ---------------------------------------------------------------
    {
        const off = bakeRoom();
        t.ok('weathering can be disabled per level',
            applyRoomDecals(off, ROOM, CRYPT, 'x', { enabled: false }) === 0);
        t.ok('a level with no kit is skipped',
            applyRoomDecals(bakeRoom(), ROOM, null, 'x') === 0,
            'the overworld has no kit and must stay untouched');
        t.ok('an unknown kit is skipped',
            applyRoomDecals(bakeRoom(), ROOM, { name: 'Nope' }, 'x') === 0);
        t.ok('an empty map is fine', applyRoomDecals(new Map(), ROOM, CRYPT, 'x') === 0);
    }
}
