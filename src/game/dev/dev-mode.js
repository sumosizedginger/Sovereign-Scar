// Dev Mode (Phase D) — gate, badge, god mode, boss controls.
// All dev behavior lives behind `dev.enabled`; when off, every dev input is
// discarded at one place in index.js and this module costs nothing per frame.

import { loadSovereignProgress, saveSovereignProgress } from '../kernel/progress.js';
import { sfx } from '../../audio/synth.js';
import { DevPanel } from './dev-panel.js';
import { DevOverlays } from './dev-overlays.js';
import { DevGeometry } from './dev-geometry.js';

function persistSetting(key, value) {
    const cur = loadSovereignProgress().settings || {};
    saveSovereignProgress({ settings: { ...cur, [key]: value } });
}

/**
 * Make a health pool immortal without changing how a fight resolves.
 *
 * God mode means "I do not die". It must NOT mean "combat resolves
 * differently", and the obvious implementation makes it mean exactly that:
 *
 *     if (god) return { accepted: false };     // ← the bug
 *
 * `HealthPool.damage` is where `damageFilter` runs, and `damageFilter` is
 * `GuardController.resolve` — so returning here silently switches OFF the
 * PARRY, the verb the whole defensive kit is built around. The consequence is
 * not "the dev takes no damage": a `bulwark`'s plate is opened by a parry or by
 * flanking, so a god-mode player who parries is fighting something that cannot
 * be opened at all. Inside a SEALED room that is a softlock. Measured in
 * beat-05 greathall: 89 enemy wind-ups, 0 staggers, 0 damage in either
 * direction, door still shut after two minutes — with a blade and with the
 * Light Caster alike, because a plate refuses rays from the front too. With god
 * off, the same fight ends in 7 wind-ups and 3 parries.
 *
 * This wrapper has broken combat once before in the same shape: an earlier
 * version took `(n, iframes)` and dropped the rest, eating the `meta.from` the
 * directional guard resolves against, so the shield never engaged.
 *
 * So run the REAL path with both damage multipliers pinned to zero. The filter
 * resolves — a parry still staggers whoever swung, poise still spends, the
 * guard arc still matters, i-frames still arm — and `dealt` is 0, so the pool
 * returns before it can touch `hp`. `onDamage` is muted for the same call
 * because a hurt flash for zero damage is a lie in the other direction.
 *
 * Both multipliers, not one: `damage()` picks `environmentDamageMult` when
 * `source === 'environment'`, so zeroing only the hostile one leaves lava
 * killing a god-mode player.
 *
 * Exported and dependency-free so `tests/game/god-mode-combat.spec.mjs` can
 * drive the real thing — `DevMode` itself builds DOM on construction, and a
 * spec that reproduces this logic instead of importing it passes whatever the
 * shipped wrapper does.
 *
 * @param {object} health         a HealthPool
 * @param {() => boolean} isGod   whether god mode is active right now
 */
export function installGodDamageWrapper(health, isGod) {
    const orig = health.damage.bind(health);
    health.damage = (...args) => {
        if (!isGod()) return orig(...args);
        const inMult = health.incomingDamageMult;
        const envMult = health.environmentDamageMult;
        const onDamage = health.onDamage;
        health.incomingDamageMult = 0;
        health.environmentDamageMult = 0;
        health.onDamage = null;
        try {
            return { ...orig(...args), accepted: false };
        } finally {
            health.incomingDamageMult = inMult;
            health.environmentDamageMult = envMult;
            health.onDamage = onDamage;
        }
    };
    return health;
}

class DevMode {
    constructor() {
        this.enabled = false;
        this.god = false;
        this.oneHit = false;
        this.hooks = null;   // { loadLevel, LEVELS, applyUpgradeStats, input, camRig }
        this.panel = null;
        this.overlays = null;
        this.geometry = null;
        this._badge = null;
        this._wrapped = false;
    }

    /**
     * Call once at boot after player/game exist.
     * @param {object} game shared game context
     * @param {object} hooks { loadLevel, LEVELS, applyUpgradeStats, input }
     */
    init(game, hooks) {
        this.hooks = hooks;

        // Badge (D1)
        const badge = document.createElement('div');
        badge.id = 'ss-dev-badge';
        Object.assign(badge.style, {
            position: 'fixed',
            bottom: '12px',
            left: '12px',
            zIndex: '40',
            color: '#ffb020',
            background: 'rgba(30,20,4,0.85)',
            border: '1px solid #ffb020',
            padding: '4px 10px',
            borderRadius: '5px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
            letterSpacing: '0.12em',
            display: 'none',
            pointerEvents: 'none',
            userSelect: 'none',
        });
        document.body.appendChild(badge);
        this._badge = badge;

        // God mode (D2): permanent wrapper, flag checked inside — avoids
        // double-wrap bugs. player.health.damage is the single damage entry.
        // The wrapper itself lives in `installGodDamageWrapper` above, where a
        // spec can reach it without constructing DevMode (which builds DOM).
        if (!this._wrapped) {
            this._wrapped = true;
            installGodDamageWrapper(game.player.health, () => this.enabled && this.god);
        }

        this.panel = new DevPanel(this);
        this.overlays = new DevOverlays(this);
        this.geometry = new DevGeometry(this);

        // Activation: URL ?dev=1 or persisted setting
        const url = new URLSearchParams(window.location.search);
        const setting = !!(loadSovereignProgress().settings || {}).devMode;
        if (url.get('dev') === '1' || setting) this.enable(game);
    }

    toggle(game) {
        if (this.enabled) this.disable(game);
        else this.enable(game);
    }

    enable(game) {
        this.enabled = true;
        if (this.hooks?.input) this.hooks.input.devActive = true;
        persistSetting('devMode', true);
        this._refreshBadge();
        game?.hud?.toast?.('Dev mode ON (Ctrl+Shift+D to exit)', 1800);
    }

    disable(game) {
        this.enabled = false;
        this.god = false;
        this.oneHit = false;
        if (this.hooks?.input) this.hooks.input.devActive = false;
        persistSetting('devMode', false);
        this.panel?.close(game);
        this.overlays?.hide();
        this.geometry?.setEnabled(false, game);
        if (this.hooks?.applyUpgradeStats) this.hooks.applyUpgradeStats();
        this._refreshBadge();
        game?.hud?.toast?.('Dev mode OFF', 1400);
    }

    _refreshBadge() {
        if (!this._badge) return;
        this._badge.style.display = this.enabled ? 'block' : 'none';
        this._badge.textContent = 'DEV'
            + (this.god ? ' · GOD' : '')
            + (this.oneHit ? ' · 1HIT' : '');
    }

    /** One dev key per frame, already gated on dev.enabled by the caller. */
    handleKey(code, game) {
        switch (code) {
            case 'F1': // god toggle (D2)
                this.god = !this.god;
                game.hud?.toast?.(this.god ? 'GOD on' : 'GOD off', 1000);
                break;
            case 'ShiftF1': // one-hit-kill sub-toggle (D2)
                this.oneHit = !this.oneHit;
                if (this.oneHit) {
                    game.player.damageMult = 1000;
                } else if (this.hooks?.applyUpgradeStats) {
                    this.hooks.applyUpgradeStats(); // recompute the legit value
                }
                game.hud?.toast?.(this.oneHit ? 'One-hit-kill on' : 'One-hit-kill off', 1000);
                break;
            case 'F2': { // instant boss defeat (D4) — attachBoss fires the real path
                const b = game.level?.boss;
                if (!b || b.defeated) break;
                if (b.cores) {
                    for (const c of b.cores) {
                        c.hp = 0;
                        c.state.current = 'DEAD';
                        c.onDeath?.();
                    }
                } else {
                    b.hp = 0;
                    b.onDeath?.();
                }
                game.hud?.toast?.('Dev: boss killed', 1200);
                break;
            }
            case 'F3': { // force next phase (D4)
                const b = game.level?.boss;
                if (!b || b.defeated || b.cores) break;
                const idx = b.phase - 1; // threshold that triggers phase+1
                if (!b.phaseThresholds || idx >= b.phaseThresholds.length) break; // max phase
                b.hp = Math.max(1, Math.floor(b.maxHp * b.phaseThresholds[idx]));
                b._phaseDirty = true;
                sfx.phase?.();
                break;
            }
            case 'F10':
            case 'Backquote': // dev panel (D3)
                this.panel?.toggle(game);
                break;
            case 'KeyH': // chrome-free frame (D5)
                game.hud?.setHidden?.(!game.hud._devHidden);
                break;
            default:
                break;
        }
        this._refreshBadge();
    }

    update(dt, game) {
        this.overlays?.update(dt, game);
        this.geometry?.update(dt, game);
    }
}

export const dev = new DevMode();
