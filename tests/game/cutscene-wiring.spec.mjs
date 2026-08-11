// The cutscene director is actually plugged in, and cannot strand the player.
//
// `CutsceneDirector` and `ScreenFade` were both complete, commented, reviewed
// modules that NOTHING imported. The director's own header calls out the risk
// it was written around — `game.cinematic` gates player control and "if it
// sticks the only exit is a reload" — and while it was unreachable that gate
// did not exist at all: `cinematic` was read by no file in the project.
//
// So these are the two questions worth asking, and the second is the one the
// suite would otherwise never ask:
//
//   1. does a scene take the controls?
//   2. does EVERY way out give them back?
//
// (2) is checked against the real exit paths, including the ones a player
// reaches by accident: skipping, a beat that throws, a hard stop, and a level
// change or death landing mid-scene.

import { CutsceneDirector } from '../../src/game/narrative/cutscene.js';

/** Enough of `game` for the director: the hooks it actually touches. */
function fakeGame() {
    const drained = [];
    const stories = [];
    const fades = [];
    const g = {
        cinematic: false,
        activeBoss: null,
        level: null,
        cameraRig: { held: null, released: 0,
            hold(o) { this.held = o; }, releaseHold() { this.released++; this.held = null; } },
        hud: { story: { queue: (s) => stories.push(s), clear: () => stories.push('CLEAR') } },
        fade: { cleared: 0, last: null,
            to(c, d) { this.last = { c, d }; }, from() { this.last = null; },
            clear() { this.cleared++; this.last = null; } },
        sfx: { ping: () => drained.push('sfx:ping') },
        input: {
            _skip: false,
            consumeStoryAdvance() { const v = this._skip; this._skip = false; return v; },
            consumeAttack: () => drained.push('attack'),
            consumeDash: () => drained.push('dash'),
        },
        _stories: stories, _fades: fades, _drained: drained,
    };
    return g;
}

export function run(t) {
    // ── A scene takes the controls, and gives them back ────────────────────
    {
        const g = fakeGame();
        const d = new CutsceneDirector();
        const ok = d.play(g, { id: 's1', beats: [{ at: 0, story: 'line' }, { at: 1.0, fn: () => {} }] });
        t.ok('the scene starts', ok === true);
        t.ok('and takes control', g.cinematic === true,
            'nothing else in the game sets this flag');
        t.ok('a beat at t=0 fires immediately', g._stories.includes('line'));

        d.update(0.5, g);
        t.ok('still running mid-scene', d.active === true);
        d.update(0.7, g);
        t.ok('the scene ends on its own', d.active === false);
        t.ok('and hands control back', g.cinematic === false);
        t.ok('and eases the camera home rather than cutting', g.cameraRig.released === 1);
        t.ok('and never leaves the screen washed', g.fade.cleared >= 1);
    }

    // ── Skipping ───────────────────────────────────────────────────────────
    {
        const g = fakeGame();
        const d = new CutsceneDirector();
        let sideEffects = 0;
        d.play(g, { id: 's2', beats: [
            { at: 5, story: 'unseen' },
            { at: 6, fn: () => { sideEffects++; } },
        ] });
        g.input._skip = true;
        d.update(0.016, g);
        t.ok('a skip ends the scene', d.active === false);
        t.ok('and returns control', g.cinematic === false);
        t.ok('side effects still run — a skip must not desync the save', sideEffects === 1);
    }

    // ── A beat that throws must not keep the controls ──────────────────────
    {
        const g = fakeGame();
        const d = new CutsceneDirector();
        d.play(g, { id: 's3', beats: [{ at: 0, fn: () => { throw new Error('boom'); } }] });
        t.ok('a throwing beat aborts the scene', d.active === false);
        t.ok('and STILL gives control back', g.cinematic === false,
            'this is the softlock the module was written to prevent');
        t.ok('and still clears the fade', g.fade.cleared >= 1);
    }

    // ── A hard stop ────────────────────────────────────────────────────────
    {
        const g = fakeGame();
        const d = new CutsceneDirector();
        d.play(g, { id: 's4', beats: [{ at: 99, story: 'never' }] });
        t.ok('a long scene is running', d.active === true && g.cinematic === true);
        d.stop(g); // what unloadLevel and the death handler call
        t.ok('stop ends it', d.active === false);
        t.ok('stop returns control', g.cinematic === false);
        t.ok('stop clears the fade', g.fade.cleared >= 1);
    }

    // ── It refuses to start where it would be dangerous ────────────────────
    {
        const g = fakeGame();
        g.activeBoss = {};
        const d = new CutsceneDirector();
        t.ok('refuses to take the controls mid-boss',
            d.play(g, { beats: [{ at: 0 }] }) === false);
        t.ok('and leaves the flag alone when it refuses', g.cinematic === false);

        const g2 = fakeGame();
        g2.level = { sealState: () => true };
        t.ok('refuses inside a sealed room',
            new CutsceneDirector().play(g2, { beats: [{ at: 0 }] }) === false);
    }

    // ── The scene clock drives the fade channel ────────────────────────────
    {
        const g = fakeGame();
        const d = new CutsceneDirector();
        // A second, later beat keeps the scene OPEN. With only the fade beat the
        // scene completes on the same call and `_release` correctly wipes the
        // wash — which is right behaviour and a useless assertion.
        d.play(g, { id: 's5', beats: [
            { at: 0, fade: { to: 'black', duration: 0.4 } },
            { at: 10, story: 'later' },
        ] });
        t.ok('a fade beat washes the screen', !!g.fade.last && g.fade.last.c === 'black',
            JSON.stringify(g.fade.last));
        d.stop(g);
        t.ok('and stopping wipes it', g.fade.last === null);
    }
}
