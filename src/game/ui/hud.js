// The player's HUD — health, guard, weapon, what you are carrying, where to go.
//
// WHAT THIS USED TO BE, AND WHY IT CHANGED
//
// One bordered black panel in the top-left corner containing eleven lines of
// monospace text, rebuilt from a template string every frame:
//
//     SOVEREIGN SCAR
//     Beat: 01 Crypt Breach
//     Mode: MEDIUM · Reconstitutions: 5
//     HP ♥♥♥♥♥♥ (6/6)
//     Guard: ▮▮▮
//     Weapon: Bare Strike
//     Keys: 0/3 · Shards: 0 · Mood: crust
//     Witness: 0
//     Thread: The Crypt is north. Something inside is still using my name.
//     Small keys: 0 · Bosses: 0/14
//
//     The Scarred Crust — fourteen wounds await
//
// Every one of those is true. That was never the problem. The problem is that
// four of them are things only the person BUILDING the game needs — `Beat:` is
// an internal level id, `Mood:` is a lighting preset name, `Bosses: 0/14` is a
// completion counter, `(6/6)` is the number behind the hearts already drawn
// beside it — and a player reading a wall of `label: value` pairs is looking at
// an engineering dashboard, not at a game. It is the single loudest reason a
// first screenshot reads as "developer build".
//
// So the split here is not cosmetic. It is:
//
//   PLAYER      health, guard, weapon, keys, currency, consumables, objective
//   DEVELOPER   beat id, mood preset, completion counters, raw numbers
//
// The developer half is not deleted. It moves into `#ss-hud-dev`, which renders
// only while dev mode is on, so the instrumentation a build session needs is one
// keystroke away and a player never sees it. See `tests/game/hud-player.spec.mjs`
// for the gate that keeps it that way.
//
// A NOTE ON THE PANEL BOX
//
// The old element had a background, a border, a radius and a drop shadow, which
// is what a debug overlay looks like because a debug overlay has to stay legible
// over anything. A game HUD earns legibility from heavy text-shadow instead and
// lets the world show through. That one change does more for "does this look
// like a game" than any of the content edits.

import { StoryPanel } from './story.js';
import { controlSheet, padSheet } from '../input.js';

const SHADOW = '0 2px 4px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.7)';

/**
 * Health, as a row of hearts and nothing else.
 *
 * The numeric `(4/6)` that used to sit beside these is gone from normal play:
 * it is the same fact twice, and the second copy is the one that reads as a
 * debug readout. Half-hearts are drawn because damage is not always integral —
 * a 0.5 hit used to round up and show a full heart the player did not have.
 */
function heartRow(hp, max) {
    const full = Math.floor(Math.max(0, hp));
    const half = Math.max(0, hp) - full >= 0.25 && full < max;
    let out = '';
    for (let i = 0; i < max; i++) {
        const state = i < full ? 'full' : (i === full && half ? 'half' : 'empty');
        const color = state === 'empty' ? '#4a2030' : '#ff4a63';
        const glyph = state === 'half' ? '♥' : '♥';
        const clip = state === 'half'
            ? 'background:linear-gradient(90deg,#ff4a63 50%,#4a2030 50%);-webkit-background-clip:text;background-clip:text;color:transparent;'
            : `color:${color};`;
        out += `<span style="${clip}font-size:19px;line-height:1;margin-right:1px;`
            + `text-shadow:${SHADOW}">${glyph}</span>`;
    }
    return `<div style="display:flex;align-items:center">${out}</div>`;
}

/**
 * Guard, as pips.
 *
 * Z3: the guard is only a real decision if its cost is visible — a player who
 * cannot see the pool draining cannot know they are about to be broken, and a
 * break that arrives unannounced reads as the game cheating. Drawn as segments
 * rather than `▮▯` glyphs so a broken guard can flash without the row changing
 * width.
 */
function guardRow(g) {
    if (!g) return '';
    const max = Math.max(1, Math.round(g.poiseMax));
    const pips = Math.max(0, Math.round(g.poise));
    const lit = g.broken ? '#ff5570' : (g.raised ? '#7fe0ff' : '#8fa4bc');
    let out = '';
    for (let i = 0; i < max; i++) {
        const on = i < pips && !g.broken;
        out += `<span style="display:inline-block;width:13px;height:5px;margin-right:3px;`
            + `border-radius:2px;background:${on ? lit : 'rgba(20,26,40,0.75)'};`
            + `box-shadow:${on ? `0 0 6px ${lit}` : 'inset 0 0 0 1px rgba(140,160,190,0.35)'}"></span>`;
    }
    return `<div style="display:flex;align-items:center;margin-top:5px">${out}</div>`;
}

/** A single carried thing: a coloured dot, a count, a short word. */
function chip(color, label, value) {
    return `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:11px;`
        + `text-shadow:${SHADOW}">`
        + `<span style="width:7px;height:7px;border-radius:50%;background:${color};`
        + `box-shadow:0 0 7px ${color}"></span>`
        + (value != null ? `<b style="color:#f0f4fa;font-size:13px">${value}</b>` : '')
        + `<span style="color:#b8c4d6;font-size:10px;letter-spacing:0.1em">${label}</span>`
        + `</span>`;
}

export class HUD {
    constructor() {
        this.el = document.createElement('div');
        this.el.id = 'ss-hud';
        Object.assign(this.el.style, {
            position: 'fixed',
            top: '14px',
            left: '16px',
            zIndex: '20',
            // No background, no border, no radius. See the note at the top of
            // this file — the box was the single most "internal tool" thing on
            // the screen.
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            maxWidth: '340px',
            pointerEvents: 'none',
            userSelect: 'none',
        });
        document.body.appendChild(this.el);

        // Developer state. Same information the old panel mixed into the player's
        // view, kept whole, kept monospace, and shown only when dev mode is on.
        this.devEl = document.createElement('div');
        this.devEl.id = 'ss-hud-dev';
        Object.assign(this.devEl.style, {
            position: 'fixed',
            top: '150px',
            left: '16px',
            zIndex: '20',
            color: '#a8ffb0',
            background: 'rgba(4,12,6,0.8)',
            border: '1px solid #3a5840',
            borderRadius: '5px',
            padding: '6px 9px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '11px',
            lineHeight: '1.5',
            whiteSpace: 'pre',
            display: 'none',
            pointerEvents: 'none',
            userSelect: 'none',
        });
        document.body.appendChild(this.devEl);

        // Boss HP bar (top center)
        this.bossEl = document.createElement('div');
        this.bossEl.id = 'ss-boss-bar';
        Object.assign(this.bossEl.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '22',
            width: 'min(480px, 70vw)',
            display: 'none',
            pointerEvents: 'none',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: '12px',
            color: '#f0e8d8',
            textAlign: 'center',
        });
        this.bossEl.innerHTML =
            `<div id="ss-boss-name" style="margin-bottom:5px;letter-spacing:0.16em;font-size:12px;font-weight:600;color:#ffd060;text-shadow:${SHADOW}"></div>` +
            `<div style="height:9px;background:rgba(14,8,16,0.85);border:1px solid #6a4050;border-radius:5px;overflow:hidden">` +
            `<div id="ss-boss-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#c04040,#ff8060);transition:width 0.15s"></div>` +
            `</div>` +
            // `margin-top` was 3px against a 12px bar with a 12px label above
            // it, and the phase line overlapped the bar it describes.
            `<div id="ss-boss-phase" style="margin-top:6px;color:#c0ccdc;font-size:10px;letter-spacing:0.14em;text-shadow:${SHADOW}"></div>`;
        document.body.appendChild(this.bossEl);
        this._bossName = this.bossEl.querySelector('#ss-boss-name');
        this._bossFill = this.bossEl.querySelector('#ss-boss-fill');
        this._bossPhase = this.bossEl.querySelector('#ss-boss-phase');

        this.toastEl = document.createElement('div');
        Object.assign(this.toastEl.style, {
            position: 'fixed',
            // The story panel sits at `bottom: 96px` and is routinely taller
            // than 48px, so a toast at 48px was drawn straight through it —
            // three overlapping boxes of text on the first frame of the game.
            // Toasts move above the dialogue instead of under it.
            bottom: '186px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '25',
            color: '#fff8e0',
            background: 'rgba(20,16,30,0.92)',
            border: '1px solid #d4a84b',
            padding: '9px 16px',
            borderRadius: '7px',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: '13px',
            opacity: '0',
            transition: 'opacity 0.25s',
            pointerEvents: 'none',
            maxWidth: '70vw',
            textAlign: 'center',
        });
        document.body.appendChild(this.toastEl);
        this._toastTimer = null;
        this._toastMsg = null;    // Ticket D: last message + when/how long it
        this._toastShownAt = -1e9; // was shown, so an identical repeat while
        this._toastMs = 0;         // still on screen refreshes instead of re-emitting.
        this._toastEmits = 0;      // count of ACTUAL visual emits (QA hook).
        this._menuOpen = false;    // see setMenuOpen — a menu suppresses toasts.

        // The control legend. NOT permanent any more — see `setHelpVisible`.
        this.helpEl = document.createElement('div');
        this.helpEl.id = 'ss-help';
        Object.assign(this.helpEl.style, {
            position: 'fixed',
            bottom: '12px',
            right: '12px',
            zIndex: '20',
            color: '#c8d4e4',
            background: 'rgba(8,10,18,0.88)',
            border: '1px solid #3a4058',
            padding: '10px 12px',
            borderRadius: '7px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '11px',
            lineHeight: '1.5',
            maxWidth: '360px',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
            opacity: '0',
            transition: 'opacity 0.2s',
        });
        // Built from the binding table, never typed out here — the two
        // hardcoded copies this replaced had already drifted apart from each
        // other and from the actual handler.
        this.helpEl.textContent = controlSheet();
        document.body.appendChild(this.helpEl);
        this._helpShown = false;

        // Boss intro name card (A6)
        this.cardEl = document.createElement('div');
        Object.assign(this.cardEl.style, {
            position: 'fixed',
            top: '30%',
            left: '0',
            right: '0',
            zIndex: '26',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
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
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
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
        this._lastHtml = null;
        this._lastDev = null;
    }

    /** D5: hide every HUD element for chrome-free capture (dev H key). */
    setHidden(v) {
        this._devHidden = !!v;
        const vis = v ? 'hidden' : 'visible';
        for (const el of [this.el, this.devEl, this.bossEl, this.toastEl, this.helpEl,
            this.cardEl]) {
            el.style.visibility = vis;
        }
        this._applyStoryVisibility();
    }

    /**
     * The dialogue panel hides behind a menu, and comes back after it.
     *
     * Two owners want to hide this element — the dev capture key and an open
     * menu — so neither may write `visibility` directly, or whichever ran last
     * decides and the other silently loses. Photographed before this existed:
     * the pause menu drawn over a live conversation, with the panel below it
     * reading "Enter / click — next" while Enter belonged to the menu. The
     * prompt was telling the player to press a key that would do something
     * else, which is worse than the panel simply stepping aside.
     *
     * Unlike a toast, this is NOT dropped. A toast is a notification about a
     * moment and replaying it later is a ghost; a conversation is something the
     * player is in the middle of, and it is still theirs when they resume.
     */
    _applyStoryVisibility() {
        if (!this.story?.el) return;
        this.story.el.style.visibility = (this._devHidden || this._menuOpen)
            ? 'hidden' : 'visible';
    }

    /**
     * Show or hide the control legend.
     *
     * It used to be nailed to the bottom-right corner for the entire game. A
     * cheat sheet is onboarding, and onboarding that never ends is furniture:
     * it costs a permanent corner of the screen, it is the second-largest block
     * of text in a first screenshot, and by hour two the player has stopped
     * seeing it anyway.
     *
     * Discoverability is preserved three ways and only the PERMANENCE is gone:
     * it shows itself for the opening seconds of a brand-new save, it appears
     * while `?` is held, and the pause menu has always had a Controls screen.
     */
    setHelpVisible(v) {
        const want = !!v;
        if (want === this._helpShown) return;
        this._helpShown = want;
        this.helpEl.style.opacity = want ? '1' : '0';
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

    /**
     * A menu is covering the screen, so transient chrome must not paint.
     *
     * This is a RULE, not a fix for one message. `toast()` has 35 call sites
     * and every one of them fires on a game event that has nothing to do with
     * whether a menu happens to be open — entering a region, picking something
     * up, a door refusing to budge. Any of them can land on top of the title
     * screen or the pause menu, and the box is 286–323px wide at [~490, 497],
     * which on a 1280×720 frame is straight through the menu's lower rows.
     *
     * The previous attempt at this was to MOVE the toast, from `bottom: 48px`
     * to `bottom: 186px`, so it stopped colliding with the story panel. That
     * traded one collision for another: the seat it moved to is the one the
     * menu uses. Position cannot solve it, because both boxes want the middle
     * of the screen and only one of them is what the player is reading.
     *
     * Suppressed messages are DROPPED, not queued. A toast is a notification
     * about a moment; replaying it when the player closes a menu ten minutes
     * later is a ghost, not a message.
     */
    setMenuOpen(v) {
        const open = !!v;
        if (open === this._menuOpen) return;
        this._menuOpen = open;
        if (open) {
            clearTimeout(this._toastTimer);
            this.toastEl.style.opacity = '0';
            // So the message that was on screen can legitimately show again
            // once the menu closes, rather than being swallowed by the
            // repeat-suppression above.
            this._toastMsg = null;
            this._toastShownAt = -1e9;
        }
        this._applyStoryVisibility();
    }

    toast(msg, ms = 2200) {
        if (this._menuOpen) return;
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
        if (this.el.style.display !== chrome) this.el.style.display = chrome;

        // Swap control legend when a gamepad becomes active (B5)
        if (state.pad && !this._padLegend) {
            this._padLegend = true;
            // Generated from CONTROLS, like the keyboard sheet. The hand-written
            // version this replaced had already drifted: it said "D-up mood"
            // when that button does mirror travel.
            this.helpEl.textContent = padSheet();
        } else if (!state.pad && this._padLegend) {
            this._padLegend = false;
            this.helpEl.textContent = controlSheet();
        }
        if (state.hidden && this._helpShown) this.setHelpVisible(false);

        // ── The player's half ──────────────────────────────────────────────
        const hp = Number(state.hp ?? 0);
        const max = Math.max(1, Math.round(state.maxHp ?? 6));

        const chips = [];
        // Weapon first: it is the thing that changes what the attack button
        // does, and the player switches it mid-fight.
        if (state.weapon) {
            chips.push(`<span style="color:#e8eef8;font-size:12px;font-weight:600;`
                + `letter-spacing:0.05em;margin-right:12px;text-shadow:${SHADOW}">`
                + `${state.weapon}</span>`);
        }
        // Dungeon keys — the only counter a player checks against a locked door.
        if (state.smallKeys != null && state.smallKeys > 0) {
            chips.push(chip('#ffd060', 'KEYS', state.smallKeys));
        }
        if (state.hasBossKey) chips.push(chip('#ffa030', 'BOSS KEY', null));
        if (state.scarShards) chips.push(chip('#7fe0ff', 'SHARDS', state.scarShards));
        if (state.vialSlots) {
            chips.push(chip('#b070ff', 'VIALS', `${state.vials || 0}/${state.vialSlots}`));
        }
        if (state.entropyCharges != null) {
            chips.push(chip('#70ffc0', 'DUST', state.entropyCharges));
        }
        if (state.memoryKeys) chips.push(chip('#d4a84b', 'ANCHOR', `${state.memoryKeys}/3`));
        if (state.sutures) chips.push(chip('#ff90c0', 'SUTURE', `${state.sutures % 4}/4`));
        // Lives are only a number worth watching when losing them costs the run.
        if (state.charges != null && state.runMode === 'survival') {
            chips.push(chip('#ff5570', 'SURVIVAL', state.charges));
        } else if (state.charges != null) {
            chips.push(chip('#8fa4bc', 'LIVES', state.charges));
        }

        const html = heartRow(hp, max)
            + guardRow(state.guard)
            + (state.guard?.broken
                ? `<div style="margin-top:4px;color:#ff5570;font-size:10px;`
                    + `letter-spacing:0.18em;text-shadow:${SHADOW}">GUARD BROKEN</div>`
                : '')
            + (chips.length
                ? `<div style="margin-top:9px;display:flex;flex-wrap:wrap;align-items:center;`
                    + `row-gap:5px">${chips.join('')}</div>`
                : '')
            // The play timer — PLAYER-FACING, because Settings has a "Show play
            // timer" toggle (menu.js) and a setting a player can switch on is a
            // promise the screen has to keep. The HUD rewrite filed the timer
            // under developer clutter and moved it into the dev panel, which
            // silently broke that toggle for anyone not in dev mode; the wiring
            // audit (docs/WIRING-AUDIT-2026-08-12.md) caught it. No label — a
            // bare mm:ss reads as a timer, "Time:" reads as a dashboard.
            + (state.showTimer
                ? `<div style="margin-top:8px;color:#9fb0c8;font-size:11px;`
                    + `letter-spacing:0.12em;font-variant-numeric:tabular-nums;`
                    + `text-shadow:${SHADOW}">${Math.floor((state.playTime || 0) / 60)}:${String(Math.floor((state.playTime || 0) % 60)).padStart(2, '0')}</div>`
                : '')
            // The objective, as an objective — not as `Thread: <string>`. The
            // marker replaces the label: a player does not need to be told the
            // internal name of the system that produced the sentence.
            + (state.thread
                ? `<div style="margin-top:10px;color:#e0c684;font-size:12px;`
                    + `line-height:1.45;text-shadow:${SHADOW}">`
                    + `<span style="color:#d4a84b">›</span> ${state.thread}</div>`
                : '');

        // `PAUSED` is gone: the pause MENU is on screen when the game is paused,
        // and a label announcing a state the player can see is the shape of
        // thing a debug overlay prints. `banner` is gone too — `index.js` toasts
        // the same string on level entry, so it was on screen twice at once.
        if (html !== this._lastHtml) {
            this._lastHtml = html;
            this.el.innerHTML = html;
        }

        // ── The developer's half ───────────────────────────────────────────
        const showDev = !!state.dev && !state.hidden;
        if (this.devEl.style.display !== (showDev ? 'block' : 'none')) {
            this.devEl.style.display = showDev ? 'block' : 'none';
        }
        if (showDev) {
            const dev = `beat   ${state.beatId || '?'}  (${state.beatName || '?'})\n`
                + `mood   ${state.mood || '?'}\n`
                + `mode   ${String(state.runMode || 'medium')}  lives ${state.charges ?? '—'}\n`
                + `hp     ${Number.isInteger(hp) ? hp : hp.toFixed(1)}/${max}`
                + `   poise ${state.guard ? Math.round(state.guard.poise) : '—'}`
                + `/${state.guard ? Math.round(state.guard.poiseMax) : '—'}`
                + `   parries ${state.guard?.parries ?? 0}\n`
                + `keys   small ${state.smallKeys ?? '—'}  boss ${state.hasBossKey ? 'yes' : 'no'}`
                + `  anchor ${state.memoryKeys ?? 0}/3\n`
                + `score  ${state.score ?? 0}`
                + `${state.chain > 1 ? `  chain x${Number(state.chain).toFixed(2)}` : ''}\n`
                + `bosses ${state.bossesDefeated ?? 0}/14`
                + `${state.showTimer ? `  time ${Math.floor((state.playTime || 0) / 60)}:${String(Math.floor((state.playTime || 0) % 60)).padStart(2, '0')}` : ''}`
                + `${state.paused ? '\npaused' : ''}`;
            if (dev !== this._lastDev) {
                this._lastDev = dev;
                this.devEl.textContent = dev;
            }
        }

        // Boss bar
        const boss = state.boss;
        if (!state.hidden && boss && boss.hp != null && boss.maxHp && boss.state?.current !== 'DEAD' && !boss.defeated) {
            this.bossEl.style.display = 'block';
            this._bossName.textContent = (boss.bossName || 'BOSS').toUpperCase();
            const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
            this._bossFill.style.width = `${(frac * 100).toFixed(1)}%`;
            const phase = boss.phase || 1;
            const maxP = boss.maxPhase || 3;
            // `armorUp` as well as `shielded`: a directional plate (the
            // Arachnid's carapace) is still armour, and a label that only
            // tracked the absolute flag would silently go blank on exactly the
            // boss whose armour the player most needs explaining.
            const armored = boss.shielded || boss.armorUp;
            this._bossPhase.textContent = `PHASE ${phase}/${maxP}` + (armored ? ' · ARMORED' : '') + (boss.canHit === false ? ' · PHASED' : '');
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
        this.devEl.remove();
        this.toastEl.remove();
        this.helpEl.remove();
        this.bossEl.remove();
        this.cardEl.remove();
        this.deathEl.remove();
        this.story?.dispose();
    }
}
