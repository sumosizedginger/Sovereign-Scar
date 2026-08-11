// Timeline runner for scripted scenes. The HUD could already show lines and the
// camera could already move; nothing owned the clock or the control gate. That
// is this class.
//
// `game.cinematic` is the softlock risk: it gates player control, and if it
// sticks the only exit is a reload. Every exit path — natural end, skip, stop, a
// beat `fn` that throws — goes through `_release`, and nothing else clears it.
//
// First draft written by the Grok Build CLI against `CUTSCENE_SPEC.md`; the
// beat-dispatch shape and the single-release rule are its work. Reviewed and
// changed here on four counts, all noted at the point they apply.

export class CutsceneDirector {
    /**
     * @param {object} [opts]
     * @param {function} [opts.onDone] fired after a natural finish or a skip
     */
    constructor(opts = {}) {
        this.onDone = opts.onDone || null;
        this._active = false;
        this._t = 0;
        this._beats = [];
        this._i = 0;
        this._skippable = true;
        this._id = null;
        this._doneCb = null;
    }

    get active() {
        return this._active;
    }

    /** The scene currently running, or null. Handy in a spec failure message. */
    get sceneId() {
        return this._id;
    }

    /**
     * @param {object} game
     * @param {{id?:string, skippable?:boolean, beats?:object[]}} scene
     * @returns {boolean} false if refused (already running, boss, sealed room)
     */
    play(game, scene) {
        if (!game || !scene) return false;
        // Taking the controls away mid-fight is worse than dropping the scene.
        if (this._active) return false;
        if (game.activeBoss) return false;
        if (game.level?.sealState?.()) return false;

        const beats = Array.isArray(scene.beats) ? scene.beats.slice() : [];
        beats.sort((a, b) => (a?.at || 0) - (b?.at || 0));

        this._active = true;
        this._t = 0;
        this._beats = beats;
        this._i = 0;
        this._skippable = scene.skippable !== false;
        this._id = scene.id || null;
        this._doneCb = this.onDone;
        game.cinematic = true;

        // Beats at or before t=0 fire now rather than a frame late.
        this._drain(game);
        if (this._active && this._i >= this._beats.length) this._finish(game);
        return true;
    }

    update(dt, game) {
        if (!this._active || !game) return;

        // REVIEW 1 — the skip has to be read BEFORE the drain, not after.
        //
        // The draft drained every latch each frame, `consumeStoryAdvance` and
        // `consumeAnyKey` among them, and left `skip()` for a caller to invoke.
        // But those two latches ARE the skip, and the director had already eaten
        // them: whatever ran next saw nothing pressed, every frame, so no scene
        // could ever be interrupted. The thing meant to swallow stray input was
        // swallowing the one press that mattered.
        const wantsSkip = !!game.input?.consumeStoryAdvance?.();
        if (wantsSkip && this._skippable) {
            this.skip(game);
            return;
        }

        // Everything else is drained so a press during the scene cannot fire the
        // instant control comes back — the same trap the menu block avoids.
        this._drainInput(game);

        const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        this._t += step;
        this._drain(game);
        if (this._active && this._i >= this._beats.length) this._finish(game);
    }

    /**
     * Jump to the end.
     *
     * REVIEW 2 — a skip skips the PRESENTATION, not the consequences. The draft
     * fired every remaining beat whole, which meant skipping a seven-beat scene
     * queued all seven of its lines and you sat through the dialogue you had
     * just asked to not watch. Side effects (`fn`) still run, because a scene
     * that grants an item or sets a story flag must not be skippable into an
     * inconsistent save. Camera, story, fade and sfx are dropped.
     */
    skip(game) {
        if (!this._active || !game) return;
        if (!this._skippable) return;
        while (this._i < this._beats.length) {
            const beat = this._beats[this._i++];
            if (typeof beat?.fn !== 'function') continue;
            try {
                beat.fn(game);
            } catch (e) {
                console.warn('cutscene skip fn', this._id || '', e);
                this._release(game);
                return;
            }
        }
        game.hud?.story?.clear?.();
        this._finish(game);
    }

    /** Hard stop — no remaining beats, no onDone. */
    stop(game) {
        if (!this._active) return;
        this._release(game);
    }

    /**
     * The only place that clears the control gate. Every exit path calls this.
     * @private
     */
    _release(game) {
        this._active = false;
        this._t = 0;
        this._beats = [];
        this._i = 0;
        this._id = null;
        if (!game) return;
        game.cinematic = false;
        // REVIEW 3 — ease the camera home, do not cut it.
        //
        // The draft called `clearFocus()`, which drops a held shot on the frame
        // it is called: the camera teleports from wherever the scene parked it
        // back to the player. `releaseHold` blends it. `clearFocus` stays as the
        // fallback for a build without the hold channel.
        if (game.cameraRig?.releaseHold) game.cameraRig.releaseHold(0.8);
        else game.cameraRig?.clearFocus?.();
        // A fade left opaque is a black screen over a running game — the same
        // dead end as a stuck flag, so it is torn down on the same path.
        game.fade?.clear?.();
    }

    /** @private */
    _finish(game) {
        const cb = this._doneCb;
        this._doneCb = null;
        this._release(game);
        try { cb?.(game); } catch (e) { console.warn('cutscene onDone', e); }
    }

    /** Fire every beat whose time has come. @private */
    _drain(game) {
        while (this._i < this._beats.length) {
            const beat = this._beats[this._i];
            const at = beat?.at != null ? beat.at : 0;
            if (at > this._t) break;
            this._i++;
            if (!this._fire(game, beat)) return;
        }
    }

    /**
     * Dispatch one beat. On throw: report, release control, abort the scene.
     * Every hook is optional — a scene naming something this build does not have
     * degrades to a no-op rather than throwing halfway through and stranding the
     * player behind a black screen.
     * @returns {boolean} false if the scene was aborted
     * @private
     */
    _fire(game, beat) {
        if (!beat) return true;
        try {
            if (beat.camera) {
                const c = beat.camera;
                game.cameraRig?.hold?.({
                    target: c.target,
                    height: c.height,
                    back: c.back,
                    duration: c.duration,
                });
            }
            if (beat.story != null) game.hud?.story?.queue?.(beat.story);
            if (beat.fade) {
                const f = beat.fade;
                if (f.to == null) game.fade?.from?.(f.duration);
                else game.fade?.to?.(f.to, f.duration);
            }
            if (beat.sfx) {
                const fn = game.sfx?.[beat.sfx];
                if (typeof fn === 'function') fn.call(game.sfx);
            }
            if (typeof beat.fn === 'function') beat.fn(game);
        } catch (e) {
            console.warn('cutscene beat', this._id || '', e);
            this._release(game);
            return false;
        }
        return true;
    }

    /**
     * REVIEW 4 — `consumePause` is deliberately NOT in this list. Pausing during
     * a cutscene has to keep working; it is the player's other way out.
     * @private
     */
    _drainInput(game) {
        const input = game.input;
        if (!input) return;
        input.consumeAttack?.();
        input.consumeDash?.();
        input.consumeInteract?.();
        input.consumeWeaponCycle?.();
        input.consumeMoodToggle?.();
        input.consumeGrapple?.();
        input.consumeAnyKey?.();
        input.consumeLevelNext?.();
        input.consumeLevelPrev?.();
        input.consumeMapToggle?.();
        input.consumeVial?.();
        input.consumeDust?.();
    }
}
