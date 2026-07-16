// Health, i-frames, death.

export class HealthPool {
    constructor(max = 6) {
        this.max = max;
        this.hp = max;
        this.iFrames = 0;
        this.dead = false;
        this.onDeath = null;
        this.onDamage = null;
    }

    get ratio() {
        return this.max > 0 ? this.hp / this.max : 0;
    }

    /**
     * @returns {{ accepted:boolean, hp:number, dead:boolean }}
     */
    damage(amount, iFrameTime = 0.7) {
        if (this.dead || this.iFrames > 0 || amount <= 0) {
            return { accepted: false, hp: this.hp, dead: this.dead };
        }
        this.hp = Math.max(0, this.hp - amount);
        this.iFrames = iFrameTime;
        if (this.onDamage) this.onDamage(amount, this.hp);
        if (this.hp <= 0) {
            this.dead = true;
            if (this.onDeath) this.onDeath();
        }
        return { accepted: true, hp: this.hp, dead: this.dead };
    }

    heal(amount) {
        if (this.dead) return this.hp;
        this.hp = Math.min(this.max, this.hp + amount);
        return this.hp;
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
