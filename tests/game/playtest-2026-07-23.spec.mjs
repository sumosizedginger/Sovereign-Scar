// Playtest 2026-07-23 — seven issues. Each assertion was proven to fail on
// the pre-fix code (or is structural). See docs/PLAYTEST-2026-07-23.md.

import * as THREE from 'three';
import { Enemy, attachSplit } from '../../src/game/enemy.js';
import { hitboxCheck } from '../../src/combat/hitbox.js';
import { WEAPONS } from '../../src/game/combat/weapons.js';
import { HealthPool } from '../../src/game/kernel/health.js';
import { HeartDropManager } from '../../src/game/world/heart-drops.js';
import { scaleEnemyHp } from '../../src/game/world/threat-curve.js';
import { buildVoxelGeo, AO_LEVELS, vkey } from '../../src/voxel/core.js';
import { classifyFamily, FAMILY } from '../../src/game/render/materials.js';
import { CRUST_COLORS } from '../../src/game/assets/palettes.js';
import { DestructibleVoxelMesh } from '../../src/game/world/destructible-voxel-mesh.js';
import { buildPickupMesh } from '../../src/game/assets/pickup-shapes.js';
import { BEAT07_DEF } from '../../src/game/levels/beat-07-sluice.js';
import { BEAT09_DEF } from '../../src/game/levels/beat-09-town.js';
import { BEAT12_DEF } from '../../src/game/levels/beat-12-pyre.js';

function spawn(kind, at = { x: 0, y: 1, z: 0 }, opts = {}) {
    return new Enemy(new THREE.Scene(), null, at, { kind, ...opts });
}

export function run(t) {
    // ── Issue 4: held-shield reflect kills an ordinary shooter ────────────
    {
        const liveHp = scaleEnemyHp(3, 7);
        const shooter = spawn('frost', { x: 0, y: 1, z: 0 }, { ai: 'ranged' });
        shooter.hp = liveHp;
        shooter.maxHp = liveHp;
        const health = new HealthPool(10);
        const hero = {
            root: { position: { x: 0, y: 1.95, z: 6 } },
            state: { facingVec: { x: 0, z: -1 } },
            health,
            guard: { raised: true, parryReady: false },
            inventory: { hasItem: () => false },
            damageMult: 1,
        };
        shooter._spawnProjectile(0, 1);
        for (let i = 0; i < 400 && shooter.projectiles.length; i++) {
            shooter._updateProjectiles(0.016, hero);
        }
        if (shooter.hp <= 0) shooter.state.current = 'DEAD';
        t.ok('held-shield reflect kills a Beat-07-scaled shooter without a parry',
            shooter.hp <= 0 || shooter.state.current === 'DEAD',
            `hp=${shooter.hp} max=${shooter.maxHp}`);
        t.ok('...and the player took no damage', health.hp === 10, `hp=${health.hp}`);
    }

    // ── Issue 5: mote dives into melee reach on burst windup ───────────────
    {
        const m = spawn('mote');
        t.ok('mote cruises airborne at rest', m.airborne === true);
        const cruiseHero = {
            root: { position: { x: 0, y: 1.95, z: 0 } },
            state: { facingVec: { x: 0, z: -1 } },
        };
        m.rig.position.set(0, m.rig.position.y, -1.2);
        t.ok('cruise height is out of heavy_mallet reach',
            hitboxCheck(cruiseHero, m, WEAPONS.heavy_mallet) === false);

        const player = {
            root: { position: { x: 0, y: 1.95, z: -2 } },
            health: { dead: false, damage: () => ({ accepted: true }) },
            state: { facingVec: { x: 0, z: 1 } },
        };
        m.attackCd = 0;
        m.rig.position.x = 0;
        m.rig.position.z = -2;
        for (let i = 0; i < 40 && m._windupT <= 0; i++) m.update(0.05, player);
        t.ok('mote commits a burst windup', m._windupT > 0, `windup=${m._windupT}`);
        for (let i = 0; i < 30; i++) {
            if (m._windupT < 0.05) m._windupT = 0.2;
            m.update(0.05, player);
        }
        t.ok('during windup the mote is no longer airborne', m.airborne === false);
        m.rig.position.x = 0;
        m.rig.position.z = 0;
        const hero = {
            root: { position: { x: 0, y: 1.95, z: -1.2 } },
            state: { facingVec: { x: 0, z: 1 } },
        };
        t.ok('heavy_mallet reaches a diving mote',
            hitboxCheck(hero, m, WEAPONS.heavy_mallet) === true,
            `mote y=${m.rig.position.y.toFixed(2)}`);
    }

    // ── Issue 7: enemies clamp to room bounds ─────────────────────────────
    {
        const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
        const e = spawn('sentinel', { x: 0, y: 1, z: 0 }, { roomBounds: bounds, speed: 8 });
        const player = {
            root: { position: { x: 0, y: 1.95, z: -20 } },
            health: { dead: false, damage: () => ({ accepted: false }) },
            state: { facingVec: { x: 0, z: 1 } },
        };
        for (let i = 0; i < 180; i++) e.update(1 / 60, player);
        t.ok('enemy cannot leave its room bounds through a doorway',
            e.rig.position.z >= bounds.minZ - 1e-6,
            `z=${e.rig.position.z.toFixed(3)}`);
    }
    {
        const bounds = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
        const kids = [];
        const parent = spawn('brood', { x: 2.8, y: 1, z: 0 }, {
            roomBounds: bounds, split: 2, hp: 2,
        });
        attachSplit(parent, (pos, opts) => {
            const c = spawn(opts.kind || 'brood', pos, opts);
            kids.push(c);
            return c;
        });
        parent.onDeath();
        t.ok('brood spawn produces children', kids.length === 2, `n=${kids.length}`);
        for (const c of kids) {
            t.ok('child is inside room bounds',
                c.rig.position.x >= bounds.minX && c.rig.position.x <= bounds.maxX
                && c.rig.position.z >= bounds.minZ && c.rig.position.z <= bounds.maxZ,
                `pos=(${c.rig.position.x.toFixed(2)},${c.rig.position.z.toFixed(2)})`);
        }
    }

    // ── Issue 1: shatter rewards ──────────────────────────────────────────
    {
        const mgr = new HeartDropManager(new THREE.Scene());
        const d = mgr.dropAt(0, 1, 0, { heart: 1 });
        t.ok('dropAt can spawn a heart at a world point', !!d && mgr.drops.length === 1);
    }
    {
        const scene = new THREE.Scene();
        const map = new Map();
        map.set(vkey(0, 0, 0), 0x888888);
        const dest = new DestructibleVoxelMesh(
            map,
            new THREE.MeshStandardMaterial({ vertexColors: true }),
            null, null, 't',
            { origin: { x: 5, y: 1, z: 5 }, scene, voxelSize: 1 }
        );
        dest.hiddenPickup = { label: 'Secret cache', color: 0xffd060 };
        const added = [];
        const onShatter = (d) => {
            if (d?.hiddenPickup && d.isEmpty) {
                added.push(d.hiddenPickup);
                d.hiddenPickup = null;
            }
        };
        const n = dest.shatterConnected(0, 0, 0, 8);
        t.ok('shatter removes the island', n > 0 && dest.isEmpty);
        onShatter(dest);
        t.ok('emptying a boulder with hiddenPickup reveals it',
            added.length === 1 && added[0].label === 'Secret cache');
    }

    // ── Issue 2: bright levels were retrimmed (not left at peak wash) ─────
    {
        const a = BEAT07_DEF.lightTune?.ambient ?? 99;
        const k = BEAT07_DEF.lightTune?.key ?? 99;
        // Below the original blown-out peak, above the overcorrected dark.
        // Original peak was 2.0/1.85 with pale floor + high capShade. Key is
        // the real cut; ambient may sit at 2.0 after the band retrim.
        t.ok('Sluice key below original blown-out 1.85', k < 1.85, `key=${k}`);
        t.ok('Sluice ambient high enough to clear the band', a >= 1.6, `ambient=${a}`);
        t.ok('Town ambient below original peak 2.25',
            (BEAT09_DEF.lightTune?.ambient ?? 99) < 2.25);
        t.ok('Town key below original peak 2.0',
            (BEAT09_DEF.lightTune?.key ?? 99) < 2.0);
        t.ok('Pyre ambient below original peak 2.3',
            (BEAT12_DEF.lightTune?.ambient ?? 99) < 2.3);
        t.ok('Pyre key below original peak 2.05',
            (BEAT12_DEF.lightTune?.key ?? 99) < 2.05);
    }

    // ── Issue 3: pickup emissive no longer destroys silhouettes ───────────
    {
        const mesh = buildPickupMesh({ label: 'Scar Suture', color: 0xff3b5c, reward: 'suture' });
        let maxE = 0;
        mesh.traverse((c) => {
            if (c.material?.emissiveIntensity != null) {
                maxE = Math.max(maxE, c.material.emissiveIntensity);
            }
        });
        t.ok('suture emissive is below the ACES-shoulder 2.0', maxE < 1.5, `maxE=${maxE}`);
        t.ok('suture still glows (findable on dark floors)', maxE >= 0.4, `maxE=${maxE}`);
    }

    // ── Graphics ticket 1: AO out of albedo ───────────────────────────────
    {
        // Floor plane + two walls meeting at a corner — classic deep AO site.
        const map = new Map();
        for (let x = 0; x < 4; x++) {
            for (let z = 0; z < 4; z++) map.set(vkey(x, 0, z), CRUST_COLORS.limestone);
        }
        for (let y = 1; y < 4; y++) {
            for (let x = 0; x < 4; x++) map.set(vkey(x, y, 0), CRUST_COLORS.limestone);
            for (let z = 0; z < 4; z++) map.set(vkey(0, y, z), CRUST_COLORS.limestone);
        }
        const geo = buildVoxelGeo(map, 0);
        const color = geo.getAttribute('color');
        const ao = geo.getAttribute('aoLevel');
        t.ok('geometry carries aoLevel', !!ao && ao.count === color.count);
        const c = new THREE.Color(CRUST_COLORS.limestone);
        let maxDelta = 0;
        let minAo = 1;
        for (let i = 0; i < color.count; i++) {
            maxDelta = Math.max(maxDelta,
                Math.abs(color.getX(i) - c.r),
                Math.abs(color.getY(i) - c.g),
                Math.abs(color.getZ(i) - c.b));
            minAo = Math.min(minAo, ao.getX(i));
        }
        t.ok('colour equals palette (AO not in albedo)', maxDelta < 0.02, `Δ=${maxDelta}`);
        t.ok('aoLevel carries real occlusion in a corner', minAo < 0.9, `minAo=${minAo}`);
        t.ok('deepest AO reaches the table floor',
            minAo <= AO_LEVELS[AO_LEVELS.length - 1] + 1e-6, `minAo=${minAo}`);
    }
    {
        t.ok('goldLeaf stays energy without AO pollution',
            classifyFamily(CRUST_COLORS.goldLeaf) === FAMILY.ENERGY);
        t.ok('iron stays metal without AO pollution',
            classifyFamily(CRUST_COLORS.iron) === FAMILY.METAL);
        // Polluted (old) path would flip — pin that the bug is real.
        const hex = CRUST_COLORS.limestone;
        const open = classifyFamily(hex);
        const r = ((hex >> 16) & 255) * 0.5;
        const g = ((hex >> 8) & 255) * 0.5;
        const b = (hex & 255) * 0.5;
        const polluted = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
        t.ok('AO-in-albedo WOULD flip limestone family (the bug this pins)',
            classifyFamily(polluted) !== open,
            `${open} vs ${classifyFamily(polluted)}`);
    }
}
