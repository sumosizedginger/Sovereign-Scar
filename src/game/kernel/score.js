import { getRunMode, normalizeRunMode } from './run-mode.js';

export const SCORE_VERSION = 1;

export const SCORE_EVENTS = Object.freeze({
    enemy: 100,
    elite: 250,
    room_clear: 500,
    secret: 750,
    map_memory: 500,
    optional_item: 1500,
    flawless_phase: 1000,
    boss: 5000,
    beat: 2000,
    engineer: 2500,
    campaign: 25000,
});

export function createScoreState(mode, eligible = true) {
    return {
        version: SCORE_VERSION,
        mode: normalizeRunMode(mode),
        total: 0,
        chain: 1,
        chainExpiresAt: 0,
        awarded: [],
        ledger: {},
        eligible: !!eligible,
    };
}

export class WitnessScore {
    constructor(value, mode, persist = null) {
        const base = createScoreState(mode);
        this.state = {
            ...base,
            ...(value || {}),
            mode: normalizeRunMode(value?.mode || mode),
            awarded: Array.isArray(value?.awarded) ? [...value.awarded] : [],
            ledger: { ...(value?.ledger || {}) },
        };
        this.persist = persist;
        this.now = 0;
    }

    update(dt) {
        this.now += Math.max(0, dt || 0);
        if (this.state.chain > 1 && this.now >= this.state.chainExpiresAt) {
            this.state.chain = 1;
            this._save();
        }
    }

    resetChain() {
        if (this.state.chain === 1) return;
        this.state.chain = 1;
        this.state.chainExpiresAt = 0;
        this._save();
    }

    extendChain() {
        this.state.chain = Math.min(3, Math.round((this.state.chain + 0.25) * 100) / 100);
        this.state.chainExpiresAt = this.now + 8;
        this._save();
        return this.state.chain;
    }

    award(type, stableId, opts = {}) {
        const base = SCORE_EVENTS[type];
        if (!base) return 0;
        const key = `${type}:${stableId}`;
        if (this.state.awarded.includes(key)) return 0;
        const chainable = type === 'enemy' || type === 'elite';
        const chain = chainable ? this.state.chain : 1;
        const points = Math.round(base * getRunMode(this.state.mode).scoreMultiplier * chain);
        this.state.total += points;
        this.state.awarded.push(key);
        this.state.ledger[type] = (this.state.ledger[type] || 0) + points;
        if (chainable) {
            this.extendChain();
            return points;
        }
        if (opts.ineligible) this.state.eligible = false;
        this._save();
        return points;
    }

    markUnranked() {
        if (!this.state.eligible) return;
        this.state.eligible = false;
        this._save();
    }

    snapshot() {
        return {
            ...this.state,
            awarded: [...this.state.awarded],
            ledger: { ...this.state.ledger },
        };
    }

    _save() {
        this.persist?.(this.snapshot());
    }
}
