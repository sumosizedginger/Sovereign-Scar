// DOM HUD — HP, weapon, mood, beat, boss bar, story hook.

import { StoryPanel } from './story.js';

/**
 * Z3: poise readout. The guard is only a real decision if its cost is visible —
 * a player who cannot see the pool draining cannot know they are about to be
 * broken, and a break that arrives unannounced reads as the game cheating.
 */
function guardLine(g) {
    if (!g) return '';
    if (g.broken) return `Guard: <span style="color:#ff7a90">BROKEN</span>\n`;
    const pips = Math.max(0, Math.round(g.poise));
    const max = Math.max(1, Math.round(g.poiseMax));
    const bar = '▮'.repeat(Math.min(pips, max)) + '▯'.repeat(Math.max(0, max - pips));
    const color = g.raised ? '#7fe0ff' : '#5a6478';
    return `Guard: <span style="color:${color}">${bar}</span>`
        + (g.parries ? ` · Parries: ${g.parries}` : '') + `\n`;
}

export class HUD {
    constructor() {
        this.el = document.createElement('div');
        this.el.id = 'ss-hud';
        Object.assign(this.el.style, {
            position: 'fixed',
            top: '12px',
            left: '12px',
            zIndex: '20',
            color: '#d8e4f0',
            background: 'rgba(8,10,18,0.82)',
            border: '1px solid #3a4058',
            padding: '12px 14px',
            borderRadius: '8px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '12px',
            lineHeight: '1.5',
            maxWidth: '380px',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
            userSelect: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        });
        document.body.appendChild(this.el);

        // Boss HP bar (top center)
        this.bossEl = document.createElement('div');
        this.bossEl.id = 'ss-boss-bar';
        Object.assign(this.bossEl.style, {
            position: 'fixed',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '22',
            width: 'min(480px, 70vw)',
            display: 'none',
            pointerEvents: 'none',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
            color: '#f0e8d8',
            textAlign: 'center',
        });
        this.bossEl.innerHTML =
            `<div id="ss-boss-name" style="margin-bottom:4px;letter-spacing:0.06em;color:#ffd060"></div>` +
            `<div style="height:12px;background:#1a1420;border:1px solid #6a4050;border-radius:6px;overflow:hidden">` +
            `<div id="ss-boss-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#c04040,#ff8060);transition:width 0.15s"></div>` +
            `</div>` +
            `<div id="ss-boss-phase" style="margin-top:3px;color:#9aa8bc;font-size:10px"></div>`;
        document.body.appendChild(this.bossEl);
        this._bossName = this.bossEl.querySelector('#ss-boss-name');
        this._bossFill = this.bossEl.querySelector('#ss-boss-fill');
        this._bossPhase = this.bossEl.querySelector('#ss-boss-phase');

        this.toastEl = document.createElement('div');
        Object.assign(this.toastEl.style, {
            position: 'fixed',
            bottom: '48px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '25',
            color: '#fff8e0',
            background: 'rgba(20,16,30,0.9)',
            border: '1px solid #d4a84b',
            padding: '10px 18px',
            borderRadius: '8px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '14px',
            opacity: '0',
            transition: 'opacity 0.25s',
            pointerEvents: 'none',
            maxWidth: '80vw',
            textAlign: 'center',
        });
        document.body.appendChild(this.toastEl);
        this._toastTimer = null;
        this._toastMsg = null;    // Ticket D: last message + when/how long it
        this._toastShownAt = -1e9; // was shown, so an identical repeat while
        this._toastMs = 0;         // still on screen refreshes instead of re-emitting.
        this._toastEmits = 0;      // count of ACTUAL visual emits (QA hook).

        this.helpEl = document.createElement('div');
        Object.assign(this.helpEl.style, {
            position: 'fixed',
            bottom: '12px',
            right: '12px',
            zIndex: '20',
            color: '#9aa8bc',
            background: 'rgba(8,10,18,0.7)',
            border: '1px solid #2a3044',
            padding: '8px 10px',
            borderRadius: '6px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
            lineHeight: '1.45',
            maxWidth: '340px',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
        });
        this.helpEl.textContent =
            'WASD move + face · Space attack · Shift dash\n' +
            'Q/R weapon · E interact · G grapple · V vial · C dust · Tab map\n' +
            'N mute · P pause · Enter advance story';
        document.body.appendChild(this.helpEl);

        // Boss intro name card (A6)
        this.cardEl = document.createElement('div');
        Object.assign(this.cardEl.style, {
            position: 'fixed',
            top: '30%',
            left: '0',
            right: '0',
            zIndex: '26',
            textAlign: 'center',
            fontFamily: 'ui-monospace, monospace',
            color: '#ffd060',
            opacity: '0',
            transition: 'opacity 0.2s',
            pointerEvents: 'none',
            textShadow: '0 2px 18px rgba(0,0,0,0.9)',
        });
        this.cardEl.innerHTML =
            `<div id="ss-card-name" style="font-size:34px;letter-spacing:0.18em;font-weight:bold"></div>` +
            `<div id="ss-card-sub" style="font-size:14px;letter-spacing:0.1em;color:#c8b490;margin-top:6px"></div>`;
        document.body.appendChild(this.cardEl);
        this._cardName = this.cardEl.querySelector('#ss-card-name');
        this._cardSub = this.cardEl.querySelector('#ss-card-sub');
        this._cardTimer = null;

        // Death overlay (A7)
        this.deathEl = document.createElement('div');
        Object.assign(this.deathEl.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '30',
            background: 'rgba(4,2,8,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '26px',
            letterSpacing: '0.22em',
            color: '#ff7a90',
            opacity: '0',
            transition: 'opacity 0.8s',
            pointerEvents: 'none',
            textShadow: '0 0 26px rgba(255,60,90,0.5)',
        });
        this.deathEl.textContent = 'THE SCAR RECLAIMS YOU';
        document.body.appendChild(this.deathEl);

        this.story = new StoryPanel();
    }

    /** D5: hide every HUD element for chrome-free capture (dev H key). */
    setHidden(v) {
        this._devHidden = !!v;
        const vis = v ? 'hidden' : 'visible';
        for (const el of [this.el, this.bossEl, this.toastEl, this.helpEl, this.cardEl]) {
            el.style.visibility = vis;
        }
        if (this.story?.el) this.story.el.style.visibility = vis;
    }

    /** Boss intro card: fade in 0.2s, hold, fade out. */
    bossCard(name, subtitle = '', hold = 1.6) {
        this._cardName.textContent = (name || '').toUpperCase();
        this._cardSub.textContent = subtitle || '';
        this.cardEl.style.opacity = '1';
        clearTimeout(this._cardTimer);
        this._cardTimer = setTimeout(() => {
            this.cardEl.style.opacity = '0';
        }, hold * 1000);
    }

    showDeath(message = 'THE SCAR RECLAIMS YOU') {
        this.deathEl.textContent = message;
        this.deathEl.style.opacity = '1';
    }

    hideDeath() {
        this.deathEl.style.opacity = '0';
    }

    toast(msg, ms = 2200) {
        // Ticket D — UI never repeats the same message. A message identical to
        // the one currently on screen only refreshes its dwell; it does not
        // re-emit (no flicker, no stacked duplicates). Proximity prompts and
        // rapid repeated pickups can fire every frame without spamming. Once
        // the toast has faded, the same text may legitimately show again.
        const now = performance.now();
        const stillShowing = msg === this._toastMsg
            && now - this._toastShownAt < this._toastMs;
        this._toastShownAt = now;
        this._toastMs = ms;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.toastEl.style.opacity = '0';
        }, ms);
        if (stillShowing) return; // dwell refreshed, nothing re-rendered
        this._toastMsg = msg;
        this._toastEmits++;
        this.toastEl.textContent = msg;
        this.toastEl.style.opacity = '1';
    }

    update(state) {
        // Title screen hides gameplay chrome (B3) — content still renders so
        // the panel is fresh the instant it reappears (and inspectable).
        const chrome = state.hidden ? 'none' : '';
        if (this.el.style.display !== chrome) {
            this.el.style.display = chrome;
            this.helpEl.style.display = chrome;
        }
        // Swap control legend when a gamepad becomes active (B5)
        if (state.pad && !this._padLegend) {
            this._padLegend = true;
            this.helpEl.textContent =
                'Left stick move · Right stick aim · A attack\n' +
                'B dash · RT guard/parry · LT lock-on · L3 switch target\n' +
                'X interact · Y grapple · LB/RB weapon\n' +
                'Select map · D-up mood · Start pause';
        } else if (!state.pad && this._padLegend) {
            this._padLegend = false;
            this.helpEl.textContent =
                'WASD move + face · Space attack · Shift dash\n' +
                'RMB/L guard (tap = parry) · T lock-on · Y switch target\n' +
                'Q/R weapon · E interact · G grapple · V vial · C dust · Tab map\n' +
                'N mute · P pause · Enter advance story';
        }
        const hp = state.hp ?? 0;
        const max = state.maxHp ?? 6;
        const filled = Math.max(0, Math.ceil(hp));
        const empty = Math.max(0, max - filled);
        const hearts = '♥'.repeat(filled) + '♡'.repeat(empty);
        const keys = state.memoryKeys || 0;
        const bosses = state.bossesDefeated != null ? state.bossesDefeated : null;
        this.el.innerHTML =
            `<b style="color:#7fe0ff">SOVEREIGN SCAR</b>\n` +
            `Beat: <span style="color:#ffd060">${state.beatName || state.beatId || '?'}</span>\n` +
            `Mode: <span style="color:${state.runMode === 'survival' ? '#ff7a90' : '#a8b4c8'}">${String(state.runMode || 'medium').toUpperCase()}</span>` +
            (state.charges != null ? ` · Reconstitutions: ${state.charges}` : '') + `\n` +
            `HP ${hearts} (${Number.isInteger(Number(hp)) ? hp : Number(hp).toFixed(1)}/${max})\n` +
            guardLine(state.guard) +
            `Weapon: ${state.weapon || '—'}\n` +
            `Keys: ${keys}/3 · Shards: ${state.scarShards || 0}` +
            (state.bankedShards ? ` carried / ${state.bankedShards} banked` : '') +
            ` · Mood: ${state.mood || 'crust'}` +
            (state.vialSlots ? `\nMemory Vials: ${state.vials || 0}/${state.vialSlots}` : '') +
            (state.entropyCharges != null ? ` · Entropy: ${state.entropyCharges}` : '') +
            (state.sutures ? `\nScar Sutures: ${state.sutures % 4}/4` : '') +
            (state.score != null ? `\nWitness: ${state.score}${state.chain > 1 ? ` · Chain x${Number(state.chain).toFixed(2)}` : ''}` : '') +
            (state.thread ? `\n<span style="color:#d4a84b">Thread: ${state.thread}</span>` : '') +
            (state.smallKeys != null ? `\n<span style="color:#ffd060">Small keys: ${state.smallKeys}${state.hasBossKey ? ' · BOSS KEY' : ''}</span>` : '') +
            (bosses != null ? ` · Bosses: ${bosses}/14` : '') +
            (state.showTimer ? `\nTime: ${Math.floor((state.playTime || 0) / 60)}:${String(Math.floor((state.playTime || 0) % 60)).padStart(2, '0')}` : '') +
            (state.paused ? `\n<span style="color:#ff7a90">PAUSED</span>` : '') +
            (state.banner ? `\n\n<span style="color:#a8b4c8">${state.banner}</span>` : '');

        // Boss bar
        const boss = state.boss;
        if (!state.hidden && boss && boss.hp != null && boss.maxHp && boss.state?.current !== 'DEAD' && !boss.defeated) {
            this.bossEl.style.display = 'block';
            this._bossName.textContent = (boss.bossName || 'BOSS').toUpperCase();
            const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
            this._bossFill.style.width = `${(frac * 100).toFixed(1)}%`;
            const phase = boss.phase || 1;
            const maxP = boss.maxPhase || 3;
            this._bossPhase.textContent = `PHASE ${phase}/${maxP}` + (boss.shielded ? ' · ARMORED' : '') + (boss.canHit === false ? ' · PHASED' : '');
            // Color by phase
            if (frac > 0.55) this._bossFill.style.background = 'linear-gradient(90deg,#c04040,#ff8060)';
            else if (frac > 0.28) this._bossFill.style.background = 'linear-gradient(90deg,#c07020,#ffb040)';
            else this._bossFill.style.background = 'linear-gradient(90deg,#8010a0,#e040ff)';
        } else {
            this.bossEl.style.display = 'none';
        }

        if (this.story && state.dt) this.story.update(state.dt);
    }

    dispose() {
        this.el.remove();
        this.toastEl.remove();
        this.helpEl.remove();
        this.bossEl.remove();
        this.cardEl.remove();
        this.deathEl.remove();
        this.story?.dispose();
    }
}
