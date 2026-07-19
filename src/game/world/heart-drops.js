// Heart recovery. Before this existed HealthPool.heal() was never called by
// anything: the only way to get hearts back was to die, so every fight
// permanently drained you until a death reset the run. Slain enemies now
// drop hearts, and rooms can be seeded with them.

import * as THREE from 'three';
import { sfx } from '../../audio/synth.js';

const HEART_COLOR = 0xff3b5c;

// Pixel-art heart silhouette, one cell per voxel.
const HEART_ROWS = [
    '.X.X.',
    'XXXXX',
    'XXXXX',
    '.XXX.',
    '..X..',
];
const CELL = 0.12;

/**
 * A pixel heart laid flat in the XZ plane. The game is played from directly
 * above, so the silhouette has to face UP to be recognisable — an upright
 * heart in the XY plane is seen edge-on and reads as a pink bar.
 */
function buildHeartMesh() {
    const mat = new THREE.MeshStandardMaterial({
        color: HEART_COLOR,
        emissive: HEART_COLOR,
        emissiveIntensity: 0.9,
        roughness: 0.6,
    });
    const geo = new THREE.BoxGeometry(CELL, CELL * 0.7, CELL);
    const group = new THREE.Group();
    const rows = HEART_ROWS.length;
    const cols = HEART_ROWS[0].length;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (HEART_ROWS[r][c] !== 'X') continue;
            const m = new THREE.Mesh(geo, mat);
            // Row 0 is the top of the heart, which points "north" (−z).
            m.position.set((c - (cols - 1) / 2) * CELL, 0, (r - (rows - 1) / 2) * CELL);
            group.add(m);
        }
    }
    return group;
}

export class HeartDrop {
    constructor(scene, x, y, z, amount = 1) {
        this.scene = scene;
        this.amount = amount;
        this.mesh = buildHeartMesh();
        this.mesh.position.set(x, (y != null ? y : 1.0) + 0.5, z);
        scene.add(this.mesh);
        this.taken = false;
        // Hearts expire so a cleared room does not stay littered with them.
        this.life = 18;
        this._t = Math.random() * Math.PI * 2;
    }

    /** @returns {boolean} false once the drop should be removed */
    update(dt, player) {
        if (this.taken) return false;
        this.life -= dt;
        this._t += dt;
        this.mesh.position.y += Math.sin(this._t * 3) * dt * 0.35;
        this.mesh.rotation.y += dt * 2;
        // Blink out over the last two seconds rather than vanishing abruptly
        if (this.life < 2) this.mesh.visible = Math.floor(this.life * 8) % 2 === 0;
        if (this.life <= 0) return false;

        if (player && player.health && !player.health.dead) {
            const p = player.root.position;
            const d = Math.hypot(p.x - this.mesh.position.x, p.z - this.mesh.position.z);
            if (d < 1.0 && Math.abs(p.y - this.mesh.position.y) < 2.0) {
                // A full-health player leaves the heart on the ground for later.
                if (player.health.hp >= player.health.max) return true;
                player.health.heal(this.amount);
                sfx.pickup?.();
                this.taken = true;
                return false;
            }
        }
        return true;
    }

    dispose() {
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.traverse((c) => {
            c.geometry?.dispose();
            c.material?.dispose();
        });
    }
}

/**
 * Owns every loose heart in the current level. Enemies are polled for death
 * rather than hooking Enemy.onDeath, because levels already assign onDeath
 * for their own scripting and wrapping it per level would be brittle.
 */
export class HeartDropManager {
    constructor(scene) {
        this.scene = scene;
        this.drops = [];
    }

    spawn(x, y, z, amount = 1) {
        const d = new HeartDrop(this.scene, x, y, z, amount);
        this.drops.push(d);
        return d;
    }

    /**
     * Roll a drop for a slain enemy. Tuned so a fight is survivable without
     * making hearts so common that damage stops mattering: tougher enemies
     * (more max HP) drop more often, and a hurt player gets better odds —
     * the classic Zelda "the game quietly helps when you are low" curve.
     */
    rollForKill(enemy, player) {
        const hurt = player?.health
            ? 1 - (player.health.hp / Math.max(1, player.health.max))
            : 0;
        const base = 0.22 + Math.min(0.18, (enemy?.maxHp || 3) * 0.03);
        const chance = base + hurt * 0.35;
        if (Math.random() > chance) return null;
        const p = enemy.root.position;
        return this.spawn(p.x, p.y, p.z);
    }

    /** Poll enemies for fresh kills, then advance every loose heart. */
    update(dt, enemies, player) {
        for (const e of enemies || []) {
            if (!e || e._heartRolled) continue;
            if (e.state?.current !== 'DEAD') continue;
            e._heartRolled = true;
            this.rollForKill(e, player);
        }
        this.drops = this.drops.filter((d) => {
            const keep = d.update(dt, player);
            if (!keep) d.dispose();
            return keep;
        });
    }

    clear() {
        for (const d of this.drops) d.dispose();
        this.drops = [];
    }
}
