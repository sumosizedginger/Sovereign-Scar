// C3: Reconstitution Altar — a glowing kintsugi shrine that opens the
// upgrade shop when the player interacts nearby. One per act (beats 01/06/13).

import * as THREE from 'three';

export function addAltar(level, ctx, { x, z, y = 0.5 } = {}) {
    const scene = ctx.scene;
    const group = new THREE.Group();

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.75, 0.9, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2436, roughness: 0.6, metalness: 0.3 })
    );
    base.position.y = 0.45;
    group.add(base);

    const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({
            color: 0xd4a84b,
            emissive: 0xd4a84b,
            emissiveIntensity: 1.6,
            roughness: 0.3,
        })
    );
    crystal.position.y = 1.55;
    group.add(crystal);

    const glow = new THREE.PointLight(0xd4a84b, 6, 7);
    glow.position.y = 1.6;
    group.add(glow);

    group.position.set(x, y, z);
    scene.add(group);

    let promptCooldown = 0;
    level.addSystem({
        update(dt, game) {
            crystal.rotation.y += dt * 1.2;
            crystal.position.y = 1.55 + Math.sin(performance.now() * 0.002) * 0.12;
            promptCooldown -= dt;

            const p = game.player.root.position;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d < 2.0) {
                if (promptCooldown <= 0) {
                    promptCooldown = 2.6;
                    game.hud.toast('E — Reconstitution Altar', 1800);
                }
                if (game.input.consumeInteract()) {
                    game.openAltar?.();
                }
            }
        },
        dispose() {
            if (group.parent) group.parent.remove(group);
            base.geometry.dispose();
            base.material.dispose();
            crystal.geometry.dispose();
            crystal.material.dispose();
        },
    });
    return group;
}
