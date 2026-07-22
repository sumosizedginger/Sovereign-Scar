import { getRunMode, normalizeRunMode } from './run-mode.js';

export function createLivesState(mode) {
    const id = normalizeRunMode(mode);
    const max = getRunMode(id).charges;
    return {
        charges: max,
        maxCharges: max,
        expeditionId: null,
        status: 'living',
    };
}

export function normalizeLivesState(value, mode) {
    const base = createLivesState(mode);
    if (!value || typeof value !== 'object') return base;
    const max = base.maxCharges;
    return {
        charges: max == null ? null : Math.max(0, Math.min(max,
            Number.isFinite(value.charges) ? Math.floor(value.charges) : max)),
        maxCharges: max,
        expeditionId: value.expeditionId || null,
        status: value.status === 'dead' || value.status === 'complete' ? value.status : 'living',
    };
}

export function enterExpedition(value, mode, expeditionId) {
    const state = normalizeLivesState(value, mode);
    if (!expeditionId || state.status !== 'living') return state;
    if (state.expeditionId === expeditionId) return state;
    return { ...state, expeditionId, charges: state.maxCharges };
}

/**
 * Resolve an expedition break: the broken expedition is over, so the next
 * `enterExpedition` — even into the SAME dungeon — starts a fresh one with
 * a full charge reserve (Narrative spec 4.4/4.5/12.3). Without clearing
 * `expeditionId`, reloading the dungeon the player died in would see the
 * old id, keep the stored zero charges, and every subsequent death would
 * re-break an already broken expedition.
 */
export function breakExpedition(value, mode) {
    const state = normalizeLivesState(value, mode);
    if (state.status !== 'living') return state;
    return { ...state, expeditionId: null };
}

export function refillCharges(value, mode) {
    const state = normalizeLivesState(value, mode);
    if (state.status !== 'living') return state;
    return { ...state, charges: state.maxCharges };
}

export function consumeDeath(value, mode) {
    const id = normalizeRunMode(mode);
    const state = normalizeLivesState(value, id);
    if (state.status !== 'living') return { state, outcome: 'sealed' };
    if (id === 'easy') return { state, outcome: 'respawn' };
    const charges = Math.max(0, (state.charges ?? 1) - 1);
    if (id === 'survival') {
        return { state: { ...state, charges: 0, status: 'dead' }, outcome: 'run_end' };
    }
    if (charges === 0) {
        return { state: { ...state, charges: 0 }, outcome: 'expedition_break' };
    }
    return { state: { ...state, charges }, outcome: 'respawn' };
}

export function deathShardLoss(carried, mode) {
    const rate = getRunMode(mode).shardLoss;
    return Math.max(0, Math.floor(Math.max(0, carried || 0) * rate));
}

export function chargeLabel(value, mode) {
    const state = normalizeLivesState(value, mode);
    return state.maxCharges == null ? '∞' : String(state.charges);
}
