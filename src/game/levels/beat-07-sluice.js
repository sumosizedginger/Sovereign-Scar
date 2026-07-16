import { createLevelShell, ABYSS_COLORS } from './_common.js';
import { fillBox } from '../../voxel/helpers.js';
import * as THREE from 'three';
import { sfx } from '../../audio/synth.js';
import { HydroidCloud, attachBoss } from '../bosses/index.js';

export function loadBeat07(ctx) {
    const level = createLevelShell(ctx, {
        id: 'beat-07-sluice',
        name: '07 Sluice of Tears',
        half: 12,
        mood: 'abyss',
        floorColor: ABYSS_COLORS.abyssFloor,
        wallColor: ABYSS_COLORS.abyssWall,
        banner: 'Grapple anchors. Hydroid Cloud pulses — step out of the ring.',
        stamp(map) {
            fillBox(map, -10, -4, 0, 0, -2, 2, ABYSS_COLORS.basalt);
            fillBox(map, 4, 10, 0, 0, -2, 2, ABYSS_COLORS.basalt);
            fillBox(map, -2, 2, 0, 0, -10, -6, ABYSS_COLORS.basalt);
            for (let x = -3; x <= 3; x++) {
                for (let z = -1; z <= 1; z++) map.delete(`${x},0,${z}`);
            }
        },
    });

    level.musicBed = 'boss';
    level.story = [
        { speaker: 'PREDECESSOR', text: 'Tears fall upward here. The cloud drinks them.' },
        { speaker: 'SYSTEM', text: 'Magnetic Grapple (G) reaches islands. Avoid pulse rings.' },
    ];

    const anchors = [];
    for (const pos of [
        { x: -6, y: 2, z: 0 },
        { x: 6, y: 2, z: 0 },
        { x: 0, y: 2.5, z: -8 },
    ]) {
        const m = new THREE.Mesh(
            new THREE.TorusGeometry(0.4, 0.08, 8, 16),
            new THREE.MeshStandardMaterial({
                color: 0x40e0ff, emissive: 0x40e0ff, emissiveIntensity: 2,
            })
        );
        m.position.set(pos.x, pos.y, pos.z);
        m.rotation.x = Math.PI / 2;
        ctx.scene.add(m);
        anchors.push({ mesh: m, ...pos });
        level.addSystem({
            update() { m.rotation.z += 0.02; },
            dispose() {
                if (m.parent) m.parent.remove(m);
                m.geometry.dispose();
                m.material.dispose();
            },
        });
    }

    level.addPickup({ x: -8, y: 1, z: 0 }, {
        color: 0x40e0ff,
        label: 'Magnetic Grapple',
        onPickup(game) {
            game.player.inventory.grantItem('magnetic_grapple');
            game.hud.toast('Magnetic Grapple — press G near anchors');
        },
    });

    const shield = level.addDummy({ x: 0, y: 1.2, z: -8 }, {
        hp: 5, color: 0x4060a0, emissive: 0x2040ff,
    });
    shield.shielded = true;
    shield.onBlocked = () => { sfx.block(); };

    level.addSystem({
        update(dt, game) {
            if (game.input.consumeGrapple() && game.player.inventory.hasItem('magnetic_grapple')) {
                let best = null, bestD = 1e9;
                const p = game.player.root.position;
                for (const a of anchors) {
                    const d = Math.hypot(a.x - p.x, a.z - p.z);
                    if (d < bestD) { bestD = d; best = a; }
                }
                if (best && bestD < 12) {
                    game.player.grapple.start(p, best, 12);
                    if (Math.hypot(best.x - shield.root.position.x, best.z - shield.root.position.z) < 3.5) {
                        shield.shielded = false;
                        shield.mesh.material.emissive.setHex(0xff4040);
                        game.hud.toast('Shield stripped!');
                    }
                }
            }
        },
        dispose() {},
    });

    level.addEnemy({ x: 7, y: 1, z: 0 }, { kind: 'frost', hp: 3, ai: 'ranged' });

    const cloud = new HydroidCloud(ctx.scene, { x: 0, y: 2, z: -6 });
    attachBoss(level, cloud, {
        nextBeat: 'beat-08-bone',
        toast: 'Hydroid dispersed — Bone Forest awaits',
    });

    return level;
}
