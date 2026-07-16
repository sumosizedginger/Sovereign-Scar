import {
    buildScatteredPredecessor,
    buildGearRing,
    buildBoulder,
    buildIceCrystal,
    buildBoneArch,
    stampMap,
} from '../../src/game/assets/props.js';
import { CRUST_COLORS, ABYSS_COLORS, HERO_PALETTE, MOOD_PRESETS } from '../../src/game/assets/palettes.js';

export function run(t) {
    t.ok('predecessor voxels', buildScatteredPredecessor().size > 5);
    t.ok('gear voxels', buildGearRing(4).size > 10);
    t.ok('boulder', buildBoulder(0, 0, 0, 2).size > 5);
    t.ok('ice', buildIceCrystal().size >= 5);
    t.ok('bone arch', buildBoneArch().size >= 10);
    const dest = new Map();
    stampMap(dest, buildIceCrystal(), 5, 0, 5);
    t.ok('stamp works', dest.size >= 5);
    t.ok('palettes', !!(CRUST_COLORS.slate && ABYSS_COLORS.violet));
    t.ok('hero palette', !!HERO_PALETTE.eyeGlow);
    t.ok('crust bloom', MOOD_PRESETS.crust.bloom === 0.6);
    t.ok('abyss bloom', MOOD_PRESETS.abyss.bloom === 2.4);
}
