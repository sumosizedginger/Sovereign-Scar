// Multi-target wrapper around engine hitboxCheck.

import { hitboxCheck } from '../../combat/hitbox.js';
import { juice } from '../fx/juice.js';

/**
 * Sweep a move against many defenders; returns hit list.
 * @param {object} attacker { root: { position }, state: { facingVec } }
 * @param {object[]} defenders each { root: { position }, hitRadius?, state? }
 * @param {object} move { range, depthTolerance, vertical, omni? }
 * @returns {object[]} defenders that were hit
 */
export function combatSweep(attacker, defenders, move) {
    if (!attacker || !defenders || !move) return [];
    const hits = [];
    for (const d of defenders) {
        if (!d || (d.state && d.state.current === 'DEAD')) continue;
        // Dematerialize (Phantasm): skip entirely
        if (d.canHit === false) continue;
        // Shielded: still "hit" for feedback but applyHit will block damage
        if (hitboxCheck(attacker, d, move)) hits.push(d);
    }
    return hits;
}

/**
 * Apply damage + optional knockback to a defender in place.
 * @returns {{ killed: boolean, damage: number }}
 */
export function applyHit(defender, move, attacker) {
    if (!defender) return { killed: false, damage: 0 };
    if (defender.canHit === false || defender.shielded) {
        if (defender.onBlocked) defender.onBlocked(attacker, move);
        return { killed: false, damage: 0, blocked: true };
    }
    const dmg = move.damage != null ? move.damage : 1;
    if (defender.hp == null) defender.hp = 1;
    // Notify before HP mutation so handlers can still cancel via shielded re-check
    if (defender.onHit) defender.onHit(dmg, attacker, move);
    if (defender.canHit === false || defender.shielded) {
        return { killed: false, damage: 0, blocked: true };
    }
    defender.hp -= dmg;

    // Juice: connect crunch + white flash on the struck target
    juice.hitstop(0.05);
    juice.flashTarget(defender.root);

    if (move.knockback && attacker && defender.root && defender.root.position) {
        const fv = (attacker.state && attacker.state.facingVec) || { x: 1, z: 0 };
        const kb = move.knockback;
        if (defender.physics) {
            defender.physics.applyImpulse(fv.x * kb, 1.5, fv.z * kb);
        } else if (defender.knockbackVel) {
            defender.knockbackVel.x = fv.x * kb;
            defender.knockbackVel.z = fv.z * kb;
        } else {
            defender.root.position.x += fv.x * kb * 0.15;
            defender.root.position.z += fv.z * kb * 0.15;
        }
    }

    const killed = defender.hp <= 0;
    if (killed) {
        if (defender.state) defender.state.current = 'DEAD';
        if (defender.onDeath) defender.onDeath();
        juice.addTrauma(0.2);
        if (juice.onKill) juice.onKill(defender);
    }
    return { killed, damage: dmg };
}
