// Health, i-frames, death.

/**
 * C2: hearts earned from boss kills — +1 max HP per 3 bosses defeated
 * (after 3, 6, 9, 12), on a base of 6.
 */
export function bossHeartMax(bossesDefeated, base = 6) {
    return base + Math.floor(Math.max(0, bossesDefeated) / 3);
}

export class HealthPool {
    constructor(max = 6) {
        this.max = max;
        this.hp = max;
        this.iFrames = 0;
        this.dead = false;
        this.onDeath = null;
        this.onDamage = null;
        this.incomingDamageMult = 1;
        this.environmentDamageMult = 1;
        // Z3: single interception point for every incoming hit. Enemies and
        // bosses all call damage() directly (25+ call sites), so a defensive
        // verb has to live HERE or be threaded through all of them. The filter
        // receives the already-multiplied amount and may reduce it, retime the
        // i-frames, or negate the hit outright.
        this.damageFilter = null;
    }

    get ratio() {
        return this.max > 0 ? this.hp / this.max : 0;
    }

    /**
     * `meta` is optional context for the damageFilter — notably `from` ({x,z},
     * the world position the hit came from), which is what lets a directional
     * guard decide whether the blow landed on the shield or on your back.
     * @returns {{ accepted:boolean, hp:number, dead:boolean, blocked?:boolean, parried?:boolean }}
     */
    damage(amount, iFrameTime = 0.7, source = 'hostile', meta = null) {
        if (this.dead || this.iFrames > 0 || amount <= 0) {
            return { accepted: false, hp: this.hp, dead: this.dead };
        }
        const mult = source === 'environment'
            ? this.environmentDamageMult
            : this.incomingDamageMult;
        let dealt = amount * (Number.isFinite(mult) ? mult : 1);
        let blocked = false, parried = false;

        if (this.damageFilter) {
            const v = this.damageFilter({ amount: dealt, source, iFrameTime, meta }) || null;
            if (v) {
                blocked = !!v.blocked;
                parried = !!v.parried;
                if (Number.isFinite(v.amount)) dealt = v.amount;
                if (Number.isFinite(v.iFrameTime)) iFrameTime = v.iFrameTime;
                // A parry costs the attacker, not the defender: no hp lost and
                // no i-frames granted, so a perfect read leaves you free to
                // punish immediately instead of blinking through the opening.
                if (v.negated || dealt <= 0) {
                    return { accepted: false, hp: this.hp, dead: this.dead, blocked: true, parried };
                }
            }
        }
        this.hp = Math.max(0, this.hp - dealt);
        this.iFrames = iFrameTime;
        if (this.onDamage) this.onDamage(dealt, this.hp);
        if (this.hp <= 0) {
            this.dead = true;
            if (this.onDeath) this.onDeath();
        }
        return { accepted: true, hp: this.hp, dead: this.dead, blocked, parried };
    }

    kill() {
        if (this.dead) return { accepted: false, hp: 0, dead: true };
        this.hp = 0;
        this.iFrames = 0;
        this.dead = true;
        if (this.onDamage) this.onDamage(this.max, 0);
        if (this.onDeath) this.onDeath();
        return { accepted: true, hp: 0, dead: true };
    }

    heal(amount) {
        if (this.dead) return this.hp;
        this.hp = Math.min(this.max, this.hp + amount);
        return this.hp;
    }

    /**
     * Raise (or restore) the heart cap — C2 progression. Raising the cap
     * also fills the newly gained hearts; lowering clamps hp. Cap 12.
     */
    setMax(n) {
        const next = Math.max(1, Math.min(12, Math.floor(n)));
        const gained = next - this.max;
        this.max = next;
        if (gained > 0 && !this.dead) this.hp = Math.min(this.max, this.hp + gained);
        this.hp = Math.min(this.max, this.hp);
        return this.max;
    }

    fullRestore() {
        this.hp = this.max;
        this.dead = false;
        this.iFrames = 0;
    }

    update(dt) {
        if (this.iFrames > 0) this.iFrames = Math.max(0, this.iFrames - dt);
    }

    get invulnerable() {
        return this.iFrames > 0 || this.dead;
    }
}
