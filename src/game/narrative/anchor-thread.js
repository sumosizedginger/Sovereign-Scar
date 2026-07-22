import { getRunMode, normalizeRunMode } from '../kernel/run-mode.js';
import { objectiveForProgress, threadStateFor, THREAD_OBJECTIVES } from './thread-data.js';

export class AnchorThread {
    constructor({ progress, mode, persist, story, hasItem } = {}) {
        this.mode = normalizeRunMode(mode);
        this.persist = persist || (() => {});
        this.story = story || null;
        this.hasItem = hasItem || (() => false);
        this.objective = objectiveForProgress(progress || {});
        this.state = threadStateFor(this.objective, progress?.thread || {});
    }

    sync(progress, announce = false) {
        const next = objectiveForProgress(progress || {});
        const changed = next?.id !== this.objective?.id;
        this.objective = next;
        this.state = threadStateFor(next, this.state);
        if (changed) {
            this.state.hintTier = 0;
            this.state.idleSeconds = 0;
            if (announce && next) this._speak(0, 'critical');
        }
        this._save();
        return changed;
    }

    onLevelEnter(levelId) {
        if (!this.objective) return;
        if (levelId === this.objective.destinationBeat) {
            this.markProgress('destination_entered');
            const id = `thread:${this.objective.id}:arrival`;
            if (!this.state.heard.includes(id)) {
                this.state.heard.push(id);
                this.story?.queue?.({
                    id, speaker: 'PREDECESSOR', priority: 'context',
                    text: 'The pull stops here. Whatever remembers the road is inside.',
                });
                this._save();
            }
        }
    }

    markProgress(_event, _detail = null) {
        this.state.idleSeconds = 0;
        this._save();
    }

    failed(actionId = 'interaction', instruction = null) {
        this.state.failedActions[actionId] = (this.state.failedActions[actionId] || 0) + 1;
        if (this.state.failedActions[actionId] >= 3 && this.state.hintTier < 2) {
            this.state.hintTier = 2;
            if (instruction) {
                const id = `thread:failed:${actionId}`;
                if (!this.state.heard.includes(id)) {
                    this.state.heard.push(id);
                    this.story?.queue?.({
                        id, speaker: 'SYSTEM', text: instruction, priority: 'critical',
                    });
                }
            } else {
                this._speak(2, 'critical');
            }
        }
        this._save();
    }

    update(dt) {
        if (!this.objective || !Number.isFinite(dt) || dt <= 0) return;
        this.state.idleSeconds += dt;
        const mode = getRunMode(this.mode);
        if (mode.hintTier1 != null && this.state.hintTier < 1
            && this.state.idleSeconds >= mode.hintTier1) {
            this.state.hintTier = 1;
            this._speak(1, 'context');
        }
        if (mode.hintTier2 != null && this.state.hintTier < 2
            && this.state.idleSeconds >= mode.hintTier2) {
            this.state.hintTier = 2;
            this._speak(2, 'critical');
        }
    }

    recall() {
        if (!this.objective) return 'The campaign is complete. Nothing remains but the witness.';
        let tier = this.state.hintTier || 0;
        if (this.mode === 'easy') tier = 2;
        else if (this.mode === 'medium') tier = Math.max(1, tier);
        else if (this.mode === 'hard') tier = Math.max(1, tier);
        else if (this.mode === 'survival') tier = 0;
        if (this.hasItem('cipher_lens') && this.mode !== 'survival') tier = Math.min(2, tier + 1);
        return this.objective.lines[Math.min(2, tier)];
    }

    currentText() {
        if (!this.objective) return 'The world has been witnessed.';
        return this.objective.lines[Math.min(2, this.state.hintTier || 0)];
    }

    destination() {
        return this.objective ? {
            beat: this.objective.destinationBeat,
            screen: this.objective.destinationScreen,
        } : null;
    }

    _speak(tier, priority) {
        if (!this.objective) return;
        const id = `thread:${this.objective.id}:tier:${tier}`;
        if (this.state.heard.includes(id)) return;
        this.state.heard.push(id);
        this.story?.queue?.({
            id,
            speaker: tier === 2 ? 'SYSTEM' : 'PREDECESSOR',
            priority,
            text: this.objective.lines[tier],
        });
        this._save();
    }

    _save() {
        this.persist({ ...this.state, heard: [...this.state.heard] });
    }
}

export function isThreadDestination(beatId) {
    return THREAD_OBJECTIVES.some((o) => o.destinationBeat === beatId);
}
