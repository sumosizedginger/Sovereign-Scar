// tests/game/light-lines.spec.mjs — the patch goes on, and it comes back off.
//
// `light-lines-on-cast.js` monkey-patches `player.tryAttack`. That is the most
// dangerous shape in this codebase, and it is now used by TWO dungeons, so the
// guarantee has to be a test rather than a comment.
//
// The failure it guards is silent by construction: a `tryAttack` that stays
// patched after its level unloads keeps firing light lines in every later
// level, and nothing errors. This repo has already had the identical bug in a
// different global — three specs installed a fake `document` and never removed
// it, defeating `typeof document === 'undefined'` guards in production code for
// every spec that ran afterwards.
//
// Section 3 is the one worth the most: restoring must be conditional. If a
// LATER level has patched over us, putting our captured original back would
// delete that level's patch. A restore that corrupts is worse than one skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachLightLinesOnCast } from '../../src/game/world/light-lines-on-cast.js';
import { stripComments } from '../qa/lib/boss-actions.mjs';

/** Minimal level: only what the helper touches. */
function fakeLevel() {
    const systems = [];
    return { systems, addSystem(s) { systems.push(s); return s; } };
}

/** Minimal bake context. LightLineSystem only needs somewhere to put meshes. */
function fakeCtx() {
    return {
        scene: { add() {}, remove() {} },
        collisionWorld: null,
    };
}

/** A player whose attack is identifiable, plus a controllable inventory. */
function fakeGame(over = {}) {
    const base = function baseAttack() { return ['base']; };
    return {
        player: {
            tryAttack: base,
            root: { position: { x: 0, y: 1, z: 0 } },
            state: { facingVec: { x: 0, z: 1 } },
            inventory: {
                activeWeapon: 'light_caster',
                items: new Set(['vector_staff']),
                hasItem(id) { return this.items.has(id); },
            },
            ...over,
        },
        _base: base,
    };
}

export function run(t) {
    // ── 1. The patch goes on ───────────────────────────────────────────────
    {
        const level = fakeLevel();
        attachLightLinesOnCast(level, fakeCtx());
        const game = fakeGame();
        const before = game.player.tryAttack;
        level.onEnter(game);
        t.ok('entering the level patches tryAttack', game.player.tryAttack !== before);
        t.ok('and the original still runs underneath',
            JSON.stringify(game.player.tryAttack([], [])) === JSON.stringify(['base']));
    }

    // ── 2. And it comes back off ───────────────────────────────────────────
    {
        const level = fakeLevel();
        attachLightLinesOnCast(level, fakeCtx());
        const game = fakeGame();
        const before = game.player.tryAttack;
        level.onEnter(game);
        for (const s of level.systems) s.dispose?.();
        t.ok('disposing the level restores the original tryAttack',
            game.player.tryAttack === before);

        // Re-entering must not stack a second wrapper on the first.
        level.onEnter(game);
        const once = game.player.tryAttack;
        level.onEnter(game);
        for (const s of level.systems) s.dispose?.();
        t.ok('re-entering does not stack patches', game.player.tryAttack === before,
            'a stacked patch restores to a patched function, not the original');
        t.ok('and each entry installs a fresh wrapper', typeof once === 'function');
    }

    // ── 3. A restore must never corrupt a LATER level's patch ──────────────
    // Two dungeons use this now. If the Pyre's dispose runs after the finale
    // has already patched, blindly restoring would delete the finale's patch
    // and the player would silently lose the effect for the rest of the run.
    {
        const a = fakeLevel();
        attachLightLinesOnCast(a, fakeCtx());
        const b = fakeLevel();
        attachLightLinesOnCast(b, fakeCtx());
        const game = fakeGame();
        const original = game.player.tryAttack;

        a.onEnter(game);
        const afterA = game.player.tryAttack;
        b.onEnter(game);
        const afterB = game.player.tryAttack;
        t.ok('the second level patches over the first', afterB !== afterA);

        // Now the FIRST level tears down, out of order.
        for (const s of a.systems) s.dispose?.();
        t.ok('a stale dispose does not rip out the live level\'s patch',
            game.player.tryAttack === afterB,
            'restoring unconditionally would put the pre-A original back here');

        for (const s of b.systems) s.dispose?.();
        t.ok('and the live level still restores cleanly when its turn comes',
            game.player.tryAttack === afterA || game.player.tryAttack === original,
            'B restores to what it captured, which was A\'s patch');
    }

    // ── 4. The gate is a real gate ─────────────────────────────────────────
    // The Pyre's reward was a prop until the staff actually gated something.
    {
        const level = fakeLevel();
        const lines = attachLightLinesOnCast(level, fakeCtx(), {
            weapon: 'light_caster', requires: ['vector_staff'],
        });
        let fired = 0;
        lines.fire = () => { fired++; };

        const game = fakeGame();
        level.onEnter(game);

        game.player.inventory.items.delete('vector_staff');
        game.player.tryAttack([], []);
        t.ok('no staff, no line', fired === 0, `${fired} fired`);

        game.player.inventory.items.add('vector_staff');
        game.player.tryAttack([], []);
        t.ok('staff held, line fires', fired === 1, `${fired} fired`);

        game.player.inventory.activeWeapon = 'anchor_link';
        game.player.tryAttack([], []);
        t.ok('wrong weapon, no line', fired === 1, `${fired} fired`);
    }

    // ── 5. The finale's gate differs from the Pyre's ───────────────────────
    // A reprise that changes nothing is a copy. Beat 14 passes `weapon: null`,
    // so the staff works with anything drawn.
    {
        const level = fakeLevel();
        const lines = attachLightLinesOnCast(level, fakeCtx(), {
            weapon: null, requires: ['vector_staff'],
        });
        let fired = 0;
        lines.fire = () => { fired++; };
        const game = fakeGame();
        level.onEnter(game);
        game.player.inventory.activeWeapon = 'anchor_link';
        game.player.tryAttack([], []);
        t.ok('with no weapon requirement the staff fires with any weapon drawn',
            fired === 1, `${fired} fired`);
        game.player.inventory.items.delete('vector_staff');
        game.player.tryAttack([], []);
        t.ok('but the staff is still required', fired === 1, `${fired} fired`);
    }

    // ── 6. A thrown flourish never breaks an attack ────────────────────────
    {
        const level = fakeLevel();
        const lines = attachLightLinesOnCast(level, fakeCtx());
        lines.fire = () => { throw new Error('boom'); };
        const game = fakeGame();
        level.onEnter(game);
        let out = null;
        let threw = false;
        try { out = game.player.tryAttack([], []); } catch (_) { threw = true; }
        t.ok('a failing light line does not take the swing down with it', !threw);
        t.ok('and the attack still returns its hits',
            JSON.stringify(out) === JSON.stringify(['base']));
    }

    // ── 7. Both call sites, and they must not be the same call ─────────────
    // Everything above tests the helper in isolation, and all of it stays green
    // if beat 14 pastes beat 12's arguments — which would make the "reprise"
    // a copy, and this whole item pointless. The counterfactual sweep found
    // exactly that hole. So the call sites themselves are read.
    {
        const root = path.dirname(fileURLToPath(import.meta.url));
        const lvl = (f) => fs.readFileSync(
            path.join(root, '..', '..', 'src', 'game', 'levels', f), 'utf8');
        const pyre = lvl('beat-12-pyre.js');
        const levi = lvl('beat-14-leviathan.js');

        for (const [name, src] of [['beat 12', pyre], ['beat 14', levi]]) {
            t.ok(`${name} uses the shared helper, not its own patch`,
                /attachLightLinesOnCast\(/.test(src) && !/player\.tryAttack\s*=/.test(src),
                'an inlined tryAttack patch is the leak this file exists to prevent');
        }

        // The gates must differ, or nothing was reprised.
        const gateOf = (src) => {
            const m = stripComments(src).match(/attachLightLinesOnCast\([\s\S]{0,600}?\}\);/);
            return m ? m[0] : '';
        };
        const gp = gateOf(pyre);
        const gl = gateOf(levi);
        t.ok('the Pyre requires the Light Caster', /weapon:\s*'light_caster'/.test(gp), gp.slice(0, 90));
        t.ok('the finale does not — the staff works with anything drawn',
            /weapon:\s*null/.test(gl), gl.slice(0, 90));
        t.ok('and the two uses are actually different',
            gp.replace(/\s+/g, '') !== gl.replace(/\s+/g, ''),
            'a reprise that changes nothing is a copy');
        t.ok('both still require the staff',
            /vector_staff/.test(gp) && /vector_staff/.test(gl));
    }
}
