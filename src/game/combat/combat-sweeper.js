// Multi-target wrapper around engine hitboxCheck.

import { hitboxCheck } from '../../combat/hitbox.js';
import { juice } from '../fx/juice.js';
import { gsfx } from '../audio/sfx-bank.js';

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
/**
 * Z5: is `attacker` standing inside `defender`'s frontal plate arc?
 * Exported so the bestiary spec can pin the geometry without a live scene.
 */
export function inFrontArc(defender, attacker, halfAngle = Math.PI / 2.4) {
    const fv = defender?.state?.facingVec;
    if (!fv || !attacker?.root) return false;
    const ox = attacker.root.position.x - defender.root.position.x;
    const oz = attacker.root.position.z - defender.root.position.z;
    const len = Math.hypot(ox, oz);
    if (len < 1e-6) return true;
    return ((ox / len) * fv.x + (oz / len) * fv.z) >= Math.cos(halfAngle);
}

export function applyHit(defender, move, attacker) {
    if (!defender) return { killed: false, damage: 0 };
    if (defender.canHit === false || defender.shielded) {
        if (defender.onBlocked) defender.onBlocked(attacker, move);
        return { killed: false, damage: 0, blocked: true };
    }
    // Z5 — directional armour. A plate on the front is not a plate on the
    // back, and no amount of damage gets through it: the answers are to flank
    // (which is what lock-on strafing is FOR) or to parry the swing, which
    // drops the plate for the length of the stagger. Ray weapons are melee's
    // equal here on purpose — the lesson is positioning, not loadout.
    if (defender.armorUp && inFrontArc(defender, attacker)) {
        if (defender.onBlocked) defender.onBlocked(attacker, move);
        gsfx.hitArmor();
        juice.addTrauma(0.08);
        return { killed: false, damage: 0, blocked: true, armored: true };
    }
    // C3: Edge upgrade — attacker-side damage multiplier.
    // `vulnerableMult` is the defender side: a boss recovering from a committed
    // attack takes double. Punishing the opening is what makes reading the
    // wind-up worth doing instead of just mashing whenever you are in range.
    const dmg = (move.damage != null ? move.damage : 1)
        * ((attacker && attacker.damageMult) || 1)
        * (defender.vulnerableMult || 1);
    if (defender.hp == null) defender.hp = 1;
    // Notify before HP mutation so handlers can still cancel via shielded re-check
    if (defender.onHit) defender.onHit(dmg, attacker, move);
    if (defender.canHit === false || defender.shielded) {
        return { killed: false, damage: 0, blocked: true };
    }
    defender.hp -= dmg;
    if (defender.hp > 0) attacker?.onCombatHit?.(defender, dmg);
    // Four outcomes, four sounds: blocked, armoured, wounded, killed. The
    // player should be able to tell which one happened with their eyes shut.
    if (defender.hp > 0) gsfx.hitFlesh(); else gsfx.enemyDie();

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
