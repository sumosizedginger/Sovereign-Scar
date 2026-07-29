// Multi-target wrapper around engine hitboxCheck.

import { hitboxCheck } from '../../combat/hitbox.js';
import { juice } from '../fx/juice.js';
import { gsfx } from '../audio/sfx-bank.js';
import { at as audioAt } from '../../audio/spatial.js';

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
    // `armorArc` lets a defender declare a narrower plate than the bulwark's
    // ±75°. A boss the player must circle needs a shorter walk to the flank
    // than a trash mob does, or "go around it" becomes "jog around it".
    if (defender.armorUp && inFrontArc(defender, attacker, defender.armorArc)) {
        if (defender.onBlocked) defender.onBlocked(attacker, move);
        audioAt(defender.root?.position, () => gsfx.hitArmor());
        juice.addTrauma(0.08);
        // Phase F2 — a blow turned by a plate throws sparks too, and it is the
        // one place they carry the most information: "that did nothing" and
        // "that did nothing BECAUSE of the plate you are standing in front of"
        // are different messages, and until now the only thing separating them
        // was a sound.
        if (juice.onImpact) {
            juice.onImpact(defender, (attacker?.state?.facingVec) || { x: 1, z: 0 }, move);
        }
        return { killed: false, damage: 0, blocked: true, armored: true };
    }
    // C3: Edge upgrade — attacker-side damage multiplier.
    //
    // The defender side is TWO windows that must not compound:
    //
    //   `vulnerableMult`  a boss recovering from a committed attack takes
    //                     double. Punishing the opening is what makes reading
    //                     the wind-up worth doing instead of mashing.
    //   `weakMult`        a boss whose modelled weak point is lit takes double
    //                     while `weakOpen` is true.
    //
    // MAX, NOT PRODUCT, and that is a design decision rather than an
    // implementation detail. On the Sand Spur the two windows are the same
    // window — it beaches itself, which IS its recovery, and the gold seam on
    // its head lights up at that exact moment. Multiplying would quietly make
    // that 4x, which is not a new mechanic, it is the fight ending early. Under
    // max, the Spur's seam becomes an honest sign for a window that already
    // paid double, and the Kinetic Core — whose bob-high window paid nothing at
    // all, measured 254 frames in 600 at a flat 1x — gets a real spike.
    //
    // Nothing else in the game sets `weakOpen`, so this is inert for enemies.
    const openMult = Math.max(
        defender.vulnerableMult || 1,
        defender.weakOpen ? (defender.weakMult || 1) : 1
    );
    const dmg = (move.damage != null ? move.damage : 1)
        * ((attacker && attacker.damageMult) || 1)
        * openMult;
    if (defender.hp == null) defender.hp = 1;
    // Notify before HP mutation so handlers can still cancel via shielded re-check
    if (defender.onHit) defender.onHit(dmg, attacker, move);
    if (defender.canHit === false || defender.shielded) {
        return { killed: false, damage: 0, blocked: true };
    }
    defender.hp -= dmg;
    if (defender.hp > 0) attacker?.onCombatHit?.(defender, dmg);
    // Four outcomes, four sounds: blocked, armoured, wounded, killed. The
    // player should be able to tell which one happened with their eyes shut —
    // and, now, which of three things in the room it happened to. A ray weapon
    // reaching across the arena and a swing at your feet used to sound like they
    // landed in the same place.
    audioAt(defender.root?.position, () => {
        if (defender.hp <= 0) gsfx.enemyDie();
        // A weak-point hit gets its own voice even when the number did not
        // change (the Spur's seam marks a window that already paid double).
        // Telling the player "that one counted" is the whole job of the cue,
        // and it was previously a light with no sound and no consequence.
        else if (defender.weakOpen) gsfx.weakPoint();
        else gsfx.hitFlesh();
    });

    // Juice: connect crunch + white flash on the struck target
    juice.hitstop(0.05);
    juice.flashTarget(defender.root);
    // Phase F2 — the other half of the impact, on the DEFENDER's terms. The
    // hook is installed by the game loop (the only thing that owns a scene) and
    // is absent in every headless spec, so this costs nothing there. The
    // attacker's facing is passed rather than a radial direction: debris thrown
    // along the blow says which way the hit came from, and in a room with three
    // enemies that is information rather than decoration.
    if (juice.onImpact) {
        juice.onImpact(defender, (attacker?.state?.facingVec) || { x: 1, z: 0 }, move);
    }

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
