// Beat 12 Vector Staff — procedural light-voxel line with lifetime decay.

import * as THREE from 'three';
import { applyHit } from '../combat/combat-sweeper.js';

/**
 * Brightest this line may glow. Kept just under the project's boss ceiling of
 * 0.55 (`bosses/base.js`) — a scenery effect has no business outshining the
 * thing trying to kill you.
 */
const MAX_EMISSIVE = 0.5;

/** Seconds between damage ticks for a target standing in the line. */
const BURN_INTERVAL = 0.4;

/** Damage per tick. A standing hazard, not a second sword. */
const BURN_DAMAGE = 0.5;

export class LightLineSystem {
    constructor(scene, collisionWorld) {
        this.scene = scene;
        this.collisionWorld = collisionWorld;
        this.lines = [];
        this._id = 0;
    }

    /**
     * Fire a luminous line along a facing vector.
     */
    fire(origin, facing, opts = {}) {
        const range = opts.range || 8;
        const life = opts.life || 2.5;
        const color = opts.color || 0xfff0a0;
        const id = `ll:${this._id++}`;

        const dir = new THREE.Vector3(facing.x, 0, facing.z).normalize();
        const len = range;
        const geo = new THREE.BoxGeometry(0.15, 0.15, len);
        // 2.2 -> 0.5, AND TRANSPARENT FROM THE FIRST FRAME.
        //
        // `UnrealBloomPass` runs at threshold 0.85 and the project's ceiling for
        // any emissive part is `BOSS_EMISSIVE_MAX = 0.55` — set precisely
        // because a roster full of 1.1–2.4 values turned a whole boss arena
        // into one white blob (`bosses/base.js:13`). This line was FOUR TIMES
        // the brightest thing any boss is allowed to be, which is the owner's
        // report: "lines from the light caster are WAY too bright."
        //
        // `transparent` was only ever set inside `update()`, so the first frame
        // of every line rendered fully opaque at full strength before the fade
        // had run once — the line did not appear, it popped.
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: MAX_EMISSIVE,
            roughness: 0.3,
            transparent: true,
            opacity: 1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            origin.x + dir.x * (len * 0.5),
            origin.y + 0.9,
            origin.z + dir.z * (len * 0.5)
        );
        mesh.lookAt(origin.x + dir.x * len, origin.y + 0.9, origin.z + dir.z * len);
        if (this.scene) this.scene.add(mesh);

        // Register thin solids along the line for walkability/blockers (optional)
        const solidIds = [];
        if (opts.solid && this.collisionWorld) {
            const steps = Math.ceil(len);
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const sx = origin.x + dir.x * range * t;
                const sz = origin.z + dir.z * range * t;
                const sid = `${id}:${i}`;
                this.collisionWorld.addSolid({
                    id: sid,
                    minX: sx - 0.2, maxX: sx + 0.2,
                    minZ: sz - 0.2, maxZ: sz + 0.2,
                });
                solidIds.push(sid);
            }
        }

        const line = {
            id, mesh, mat, life, maxLife: life, solidIds,
            hitPoints: [{
                x: origin.x + dir.x * range,
                y: origin.y,
                z: origin.z + dir.z * range,
            }],
            dir: { x: dir.x, z: dir.z },
            origin: { ...origin },
            range,
        };
        this.lines.push(line);
        return line;
    }

    /**
     * @param {number} dt
     * @param {object[]} [targets] anything that may be standing in a line.
     *
     * THE LINE NOW BURNS WHAT STANDS IN IT.
     *
     * Beat 12 toasts that "the Light Caster now leaves a standing line", and
     * until this the line was a lit box. `hitsEntity` below was written,
     * correct, and CALLED BY NOTHING; `line.hitPoints` was computed and read by
     * nothing; the `solid` branch in `fire()` was gated on an option no caller
     * ever passed. Three quarters of a mechanic, wired at one end only — the
     * exact shape this project's traps file warns about — and a toast promising
     * the player a verb the game did not have.
     *
     * Damage goes through `applyHit`, the same path a sword swing takes, so the
     * line obeys shields, plates, i-frames and death exactly like everything
     * else. A hazard with its own private damage rule is a second set of
     * combat rules to keep in step, and this project has already paid for one
     * of those.
     */
    update(dt, targets = []) {
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const L = this.lines[i];
            L.life -= dt;
            const a = Math.max(0, L.life / L.maxLife);
            L.mat.emissiveIntensity = MAX_EMISSIVE * a;
            L.mat.opacity = a;

            if (L.life > 0 && targets && targets.length) {
                L.burnT = (L.burnT || 0) + dt;
                if (L.burnT >= BURN_INTERVAL) {
                    L.burnT = 0;
                    this._burn(L, targets);
                }
            }

            if (L.life <= 0) {
                this._disposeLine(L);
                this.lines.splice(i, 1);
            }
        }
    }

    /** Damage everything currently standing in `L`. */
    _burn(L, targets) {
        // A stand-in attacker at the line's origin, aimed along it, so
        // directional armour resolves against where the beam is coming FROM
        // rather than against wherever the player has since walked.
        const from = {
            root: { position: { x: L.origin.x, y: L.origin.y || 0, z: L.origin.z } },
            state: { facingVec: { x: L.dir.x, z: L.dir.z } },
        };
        for (const e of targets) {
            if (!e || e.defeated) continue;
            if (e.state && e.state.current === 'DEAD') continue;
            if (!this.hitsEntity(e, L)) continue;
            applyHit(e, { damage: BURN_DAMAGE, knockback: 0, kind: 'light_line' }, from);
        }
    }

    /** Ray-ish hit test against point targets. */
    hitsEntity(entity, line) {
        if (!entity?.root?.position || !line) return false;
        const p = entity.root.position;
        const ox = line.origin.x, oz = line.origin.z;
        const dx = p.x - ox, dz = p.z - oz;
        const forward = dx * line.dir.x + dz * line.dir.z;
        if (forward < 0 || forward > line.range) return false;
        const lateral = Math.abs(-dx * line.dir.z + dz * line.dir.x);
        return lateral < (entity.hitRadius || 0.5) + 0.25;
    }

    _disposeLine(L) {
        if (this.collisionWorld) for (const id of L.solidIds) this.collisionWorld.removeSolid(id);
        if (L.mesh.parent) L.mesh.parent.remove(L.mesh);
        L.mesh.geometry.dispose();
        L.mat.dispose();
    }

    dispose() {
        for (const L of this.lines) this._disposeLine(L);
        this.lines = [];
    }
}
