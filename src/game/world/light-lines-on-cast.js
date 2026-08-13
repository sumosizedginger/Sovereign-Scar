// src/game/world/light-lines-on-cast.js — "casting also fires a light line",
// as one implementation instead of one per dungeon.
//
// WHY THIS EXISTS
//
// Beat 12 wired this by monkey-patching `player.tryAttack` inside `onEnter` and
// restoring it in the system's `dispose`. That works, and it is the single most
// dangerous shape in this codebase to copy: a patch-and-restore pair duplicated
// across two level files means two chances to get the restore wrong, and a
// missed restore does not fail loudly — it leaks a patched `tryAttack` into
// every level the player visits afterwards.
//
// That is not hypothetical. Three specs in this repo installed a fake global
// `document` and never removed it, which silently defeated `typeof document ===
// 'undefined'` guards in production code for every spec that ran after them.
// Same shape, different global.
//
// So the second use of light lines did not copy the block. It got this.
//
// THE ONE RULE
//
// Restore only if the function currently installed is still the one we
// installed. If a later level has since patched over us, putting our captured
// original back would DELETE that level's patch — a restore that corrupts is
// worse than a restore that is skipped.

import { LightLineSystem } from './light-line-system.js';

/**
 * Make the player's attack also fire a light line, for as long as this level
 * is loaded.
 *
 * @param {object} level  the level being built (needs addSystem / onEnter)
 * @param {object} ctx    bake context (scene, collisionWorld)
 * @param {object} [opts]
 * @param {string}   [opts.weapon]   active weapon required, or null for any
 * @param {string[]} [opts.requires] inventory item ids that must all be held
 * @param {number}   [opts.range]
 * @param {number}   [opts.life]
 * @param {number}   [opts.color]
 * @returns {LightLineSystem} the system, so a caller can fire it itself
 */
export function attachLightLinesOnCast(level, ctx, opts = {}) {
    const {
        weapon = 'light_caster',
        requires = ['vector_staff'],
        range = 10,
        life = 1.8,
        color = 0xffa040,
    } = opts;

    const lines = new LightLineSystem(ctx.scene, ctx.collisionWorld);

    /** The function WE installed, so we never restore over someone else's. */
    let installed = null;
    let original = null;
    let gameRef = null;

    function restore() {
        if (!gameRef?.player || !installed) return;
        // Only unwind if we are still the outermost patch. See the header.
        if (gameRef.player.tryAttack === installed) {
            gameRef.player.tryAttack = original;
        }
        installed = null;
        original = null;
    }

    level.addSystem({
        update(dt) { lines.update(dt); },
        dispose() {
            restore();
            lines.dispose();
        },
    });
    level.lightLines = lines;

    level.onEnter = (game) => {
        gameRef = game;
        restore();                       // re-entering the same level must not stack
        // NOT `.bind(...)`. Binding returns a NEW function, so the value put
        // back on restore is a copy rather than the function that was there —
        // identity is lost, and each enter/dispose cycle wraps another bind
        // layer around the chain. The original beat 12 code bound, and the
        // spec for this file caught it on its first run. Keep the raw
        // reference and supply `this` at the call.
        original = game.player.tryAttack;
        const patched = (enemies, destructibles) => {
            const hits = original.call(game.player, enemies, destructibles);
            // THE GATE. Without this test the Pyre's own reward pickup changed
            // nothing about the game, which made it a prop. Purely additive —
            // the line is cosmetic plus a hit test — so a player who never
            // finds the staff loses a flourish and never a route.
            const inv = game.player.inventory;
            const armed = (!weapon || inv.activeWeapon === weapon)
                && requires.every((id) => inv.hasItem(id));
            if (armed && lines) {
                try {
                    lines.fire(game.player.root.position, game.player.state.facingVec,
                        { range, life, color });
                } catch (_) { /* a flourish must never break an attack */ }
            }
            return hits;
        };
        game.player.tryAttack = patched;
        installed = patched;
    };

    return lines;
}
