// Z3 — the defensive verb.
//
// Every hostile action in this game already winds up, paints a ring on the
// ground, and resolves against where you are AT STRIKE TIME (enemy.js
// `_beginWindup`, bosses/base.js). That is a well-built telegraph system, and
// until now it was wasted: a telegraph asks a question, and the only answer the
// player had was "walk away". Zelda's shield is what turns a telegraph into a
// conversation — you can stand your ground and be rewarded for reading it.
//
// Three states, in escalating skill:
//
//   hold guard      → frontal hits are chipped to GUARD_CHIP and cost poise
//   press on time   → PARRY: fully negated, attacker staggered, poise refunded
//   poise exhausted → GUARD BREAK: you are wide open for BREAK_STUN seconds
//
// Directionality is the point. The guard covers a frontal cone; anything that
// arrives from behind lands in full. That is what stops "hold block forever"
// from being the dominant strategy, and it is what makes lock-on (Z4) matter —
// facing becomes a resource you have to spend deliberately.

/** Half-angle of the guarded cone, in radians. 60° each way = 120° frontal. */
export const GUARD_ARC = Math.PI / 3;
/** Fraction of damage that still gets through a successful (non-parry) block. */
export const GUARD_CHIP = 0.25;
/** Press-to-parry window. Generous enough to be learnable, tight enough to feel earned. */
export const PARRY_WINDOW = 0.18;
/** Poise pool; each blocked hit costs its damage in poise. */
export const POISE_MAX = 3;
/** Poise regenerated per second while not guarding. */
export const POISE_REGEN = 1.4;
/** Poise regen is slower while actively holding guard. */
export const POISE_REGEN_GUARDING = 0.35;
/** Seconds of total helplessness after the poise pool empties. */
export const BREAK_STUN = 0.9;
/** Movement multiplier while guarding — you turtle, you do not sprint. */
export const GUARD_SPEED_MULT = 0.45;

/**
 * True if a hit originating at `from` lands inside the cone the guard covers.
 * With no origin (environment damage, scripted hits) the answer is NO: a shield
 * should not protect against falling in a pit.
 */
export function inGuardArc(pos, facingVec, from) {
    if (!from || !facingVec) return false;
    const ox = from.x - pos.x;
    const oz = from.z - pos.z;
    const len = Math.hypot(ox, oz);
    if (len < 1e-6) return true; // hit resolved exactly on top of us — count it
    const dot = (ox / len) * facingVec.x + (oz / len) * facingVec.z;
    return dot >= Math.cos(GUARD_ARC);
}

export class GuardController {
    constructor() {
        this.active = false;      // holding guard this frame
        this.poise = POISE_MAX;
        this.parryT = 0;          // remaining parry window
        this.breakT = 0;          // remaining guard-break stun
        this.blocks = 0;          // telemetry / tests
        this.parries = 0;
        this.breaks = 0;
        this._wasHeld = false;
        this.onParry = null;      // (meta) => void — stagger the attacker
        this.onBlock = null;
        this.onBreak = null;
    }

    get broken() {
        return this.breakT > 0;
    }

    /** True while the guard is genuinely up (held, and not stunned). */
    get raised() {
        return this.active && this.breakT <= 0;
    }

    /** True during the window where a block upgrades to a parry. */
    get parryReady() {
        return this.parryT > 0 && this.raised;
    }

    /**
     * @param {boolean} held guard button state THIS frame (level-triggered, not edge)
     */
    update(dt, held) {
        if (this.breakT > 0) {
            this.breakT = Math.max(0, this.breakT - dt);
            this.active = false;
            this._wasHeld = held;
            // Poise refills during the stun — the punishment is the stun
            // itself, not a death spiral of never getting the guard back.
            this.poise = Math.min(POISE_MAX, this.poise + POISE_REGEN * dt);
            return;
        }

        // Rising edge opens the parry window. Holding does not re-open it, so
        // mashing the button is strictly worse than reading the telegraph.
        if (held && !this._wasHeld) this.parryT = PARRY_WINDOW;
        else if (this.parryT > 0) this.parryT = Math.max(0, this.parryT - dt);

        this.active = held;
        this._wasHeld = held;

        const regen = held ? POISE_REGEN_GUARDING : POISE_REGEN;
        this.poise = Math.min(POISE_MAX, this.poise + regen * dt);
    }

    /**
     * HealthPool.damageFilter implementation. Returns null to let the hit
     * through untouched, or a verdict object.
     *
     * @param {{amount:number, source:string, iFrameTime:number, meta:any}} hit
     * @param {{x:number,z:number}} pos      player world position
     * @param {{x:number,z:number}} facing   player facing unit vector
     */
    resolve(hit, pos, facing) {
        if (!this.raised) return null;
        if (hit.source === 'environment') return null; // no shielding a lava floor
        if (!inGuardArc(pos, facing, hit.meta && hit.meta.from)) return null;

        if (this.parryT > 0) {
            this.parryT = 0;
            this.parries++;
            this.poise = POISE_MAX; // a clean read costs you nothing
            if (this.onParry) this.onParry(hit.meta);
            return { negated: true, parried: true, blocked: true };
        }

        if (this.poise <= 0) return null; // already spent; this one lands

        this.poise = Math.max(0, this.poise - hit.amount);
        this.blocks++;
        if (this.onBlock) this.onBlock(hit.meta);

        if (this.poise <= 0) {
            this.breakT = BREAK_STUN;
            this.active = false;
            this.breaks++;
            if (this.onBreak) this.onBreak(hit.meta);
        }
        // Chip damage keeps blocking from being free, and the shortened
        // i-frame window means turtling through a combo still costs you.
        return { amount: hit.amount * GUARD_CHIP, iFrameTime: hit.iFrameTime * 0.6, blocked: true };
    }

    reset() {
        this.active = false;
        this.poise = POISE_MAX;
        this.parryT = 0;
        this.breakT = 0;
        this._wasHeld = false;
    }
}
