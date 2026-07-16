// DOM menu overlay (B1 pause menu, B2 settings, B3 title) driven by the
// pure MenuState machine. index.js supplies live-data accessors in `ctx`
// and receives {type:'set'|'action', ...} events via onEvent.

import { MenuState } from './menu-state.js';
import { UPGRADES, nextCost } from '../kernel/upgrades.js';

const PANEL_BG = 'rgba(8,10,18,0.92)';
const BORDER = '1px solid #3a4058';
const GOLD = '#ffd060';
const DIM = '#5a647a';
const TEXT = '#d8e4f0';

function pct(v) {
    return `${Math.round(v * 100)}%`;
}

function sliderBar(v, min, max) {
    const cells = 10;
    const filled = Math.round(((v - min) / (max - min)) * cells);
    return '█'.repeat(filled) + '░'.repeat(cells - filled);
}

// ── Screen builders ─────────────────────────────────────────────────────────

export function buildScreens() {
    const settingsItems = (ctx) => {
        const s = ctx.settings();
        return [
            { type: 'slider', id: 'masterVol', label: 'Master volume', value: s.masterVol, min: 0, max: 1, step: 0.05 },
            { type: 'slider', id: 'musicVol', label: 'Music volume', value: s.musicVol, min: 0, max: 1, step: 0.05 },
            { type: 'slider', id: 'sfxVol', label: 'SFX volume', value: s.sfxVol, min: 0, max: 1, step: 0.05 },
            { type: 'select', id: 'quality', label: 'Quality', value: s.quality, options: ['low', 'med', 'high', 'ultra'] },
            { type: 'toggle', id: 'reduceShake', label: 'Reduce screen shake', value: !!s.reduceShake },
            { type: 'toggle', id: 'reduceFlash', label: 'Reduce flashes', value: !!s.reduceFlash },
            { type: 'toggle', id: 'showTimer', label: 'Show play timer', value: !!s.showTimer },
            { type: 'text', label: '←/→ adjust · Enter toggle · Esc back' },
        ];
    };

    const beatItems = (ctx) => {
        const prog = ctx.progress();
        const unlocked = new Set(prog.unlockedBeats || []);
        const defeated = new Set(prog.bossesDefeated || []);
        const items = ctx.levels().map((meta) => {
            const isOpenBeat = unlocked.has(meta.id) || meta.id === 'sandbox-combat' || meta.id === prog.currentBeat;
            const done = meta.bossId && defeated.has(meta.bossId);
            return {
                type: 'action',
                id: 'beat',
                arg: meta.id,
                label: meta.name || meta.id,
                disabled: !isOpenBeat,
                note: done ? '✓' : (isOpenBeat ? '' : '🔒'),
            };
        });
        items.push({ type: 'text', label: 'Enter to travel · Esc back' });
        return items;
    };

    const controlsItems = () => ([
        { type: 'text', label: 'WASD / arrows — move' },
        { type: 'text', label: 'Mouse — aim · LMB / Space — attack' },
        { type: 'text', label: 'Shift — dash · G — grapple · E — interact' },
        { type: 'text', label: 'Q / R — cycle weapon · M — mood shift' },
        { type: 'text', label: 'N — mute · P / Esc — pause · Enter — story' },
        { type: 'text', label: '[ ] — previous / next beat (unlocked)' },
        { type: 'text', label: '' },
        { type: 'action', id: 'back', label: 'Back' },
    ]);

    return {
        title: (ctx) => {
            const prog = ctx.progress();
            const has = ctx.hasProgress();
            const bosses = (prog.bossesDefeated || []).length;
            const mins = Math.floor((prog.playTime || 0) / 60);
            const beatName = ctx.beatName(prog.currentBeat);
            return {
                title: 'SOVEREIGN SCAR',
                subtitle: 'The Wound That Remembers',
                items: [
                    {
                        type: 'action', id: 'continue', label: has ? 'Continue' : 'Begin',
                        note: has ? `${beatName} · ${bosses}/14 · ${mins}m` : '',
                    },
                    { type: 'action', id: 'newgame', label: 'New Game', disabled: !has },
                    { type: 'submenu', id: 'beats', label: 'Beat Select', screen: 'beats' },
                    { type: 'submenu', id: 'settings', label: 'Settings', screen: 'settings' },
                    { type: 'submenu', id: 'controls', label: 'Controls', screen: 'controls' },
                ],
            };
        },
        pause: () => ({
            title: 'PAUSED',
            items: [
                { type: 'action', id: 'resume', label: 'Resume' },
                { type: 'submenu', id: 'beats', label: 'Beat Select', screen: 'beats' },
                { type: 'submenu', id: 'settings', label: 'Settings', screen: 'settings' },
                { type: 'submenu', id: 'controls', label: 'Controls', screen: 'controls' },
                { type: 'action', id: 'quitTitle', label: 'Quit to Title' },
            ],
        }),
        settings: (ctx) => ({ title: 'SETTINGS', items: settingsItems(ctx) }),
        beats: (ctx) => ({ title: 'BEAT SELECT', items: beatItems(ctx) }),
        controls: () => ({ title: 'CONTROLS', items: controlsItems() }),
        altar: (ctx) => {
            const shards = ctx.shards ? ctx.shards() : 0;
            const ups = ctx.upgrades ? ctx.upgrades() : {};
            const rows = Object.entries(UPGRADES).map(([id, u]) => {
                const lvl = ups[id] || 0;
                const cost = nextCost(id, lvl);
                return {
                    type: 'action',
                    id: 'buy',
                    arg: id,
                    label: `${u.name}  ${'■'.repeat(lvl)}${'□'.repeat(u.costs.length - lvl)}`,
                    note: cost == null ? 'MAXED' : `${u.desc} — ${cost} shards`,
                    disabled: cost == null || shards < cost,
                };
            });
            return {
                title: 'RECONSTITUTION ALTAR',
                items: [
                    { type: 'text', label: `Scar Shards: ${shards}` },
                    ...rows,
                    { type: 'action', id: 'back', label: 'Leave' },
                ],
            };
        },
        confirmNew: () => ({
            title: 'NEW GAME',
            items: [
                { type: 'text', label: 'Erase the current run? Your settings are kept.' },
                { type: 'action', id: 'confirmNewYes', label: 'Yes — start over' },
                { type: 'action', id: 'back', label: 'No — keep my run' },
            ],
        }),
    };
}

// ── DOM overlay ─────────────────────────────────────────────────────────────

export class MenuOverlay {
    constructor({ ctx, onEvent }) {
        this.state = new MenuState(buildScreens(), ctx);
        this.onEvent = onEvent || (() => {});
        this.mode = 'pause'; // 'pause' | 'title'

        this.el = document.createElement('div');
        this.el.id = 'ss-menu';
        Object.assign(this.el.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '40',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            background: 'rgba(4,6,12,0.72)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: TEXT,
            userSelect: 'none',
        });
        this.el.addEventListener('mousedown', (e) => {
            // Title mode: clicking anywhere outside a row = activate default
            if (this.mode === 'title' && e.target === this.el) this._emit(this.state.activate());
        });
        document.body.appendChild(this.el);

        this._onKey = (e) => {
            if (this.handleCode(e.code)) e.preventDefault();
        };
        window.addEventListener('keydown', this._onKey);
    }

    /** Handle one nav code (keyboard or synthesized gamepad). Returns handled. */
    handleCode(code) {
        if (!this.isOpen) return false;
        switch (code) {
            case 'ArrowUp': case 'KeyW': this.state.move(-1); break;
            case 'ArrowDown': case 'KeyS': this.state.move(1); break;
            case 'ArrowLeft': case 'KeyA': this._emit(this.state.adjust(-1)); break;
            case 'ArrowRight': case 'KeyD': this._emit(this.state.adjust(1)); break;
            case 'Enter': case 'NumpadEnter': case 'Space':
                this._emit(this.state.activate());
                break;
            case 'Backspace': this.back(); break;
            default: return false;
        }
        this.render();
        return true;
    }

    get isOpen() {
        return this.state.isOpen;
    }

    openPause() {
        this.mode = 'pause';
        this.state.open('pause');
        this.render();
        this.el.style.display = 'flex';
    }

    openTitle() {
        this.mode = 'title';
        this.state.open('title');
        this.render();
        this.el.style.display = 'flex';
    }

    openAltar() {
        this.mode = 'pause';
        this.state.open('altar');
        this.render();
        this.el.style.display = 'flex';
    }

    close() {
        this.state.close();
        this.el.style.display = 'none';
    }

    /** Esc: pop one screen; from the root of pause mode, closes (resume). */
    back() {
        const wasRoot = this.state.stack.length <= 1;
        if (wasRoot && this.mode === 'pause') {
            this.close();
            this.onEvent({ type: 'action', id: 'resume' });
            return;
        }
        if (wasRoot && this.mode === 'title') return; // can't back out of title
        this.state.back();
        this.render();
    }

    _emit(ev) {
        if (!ev) return;
        if (ev.type === 'push') {
            this.render();
            return;
        }
        this.onEvent(ev);
        this.render();
    }

    render() {
        if (!this.isOpen) return;
        const view = this.state.view();
        const isTitle = this.mode === 'title' && this.state.screenName === 'title';

        const rows = view.items.map((it, i) => {
            const selected = i === this.state.sel;
            const color = it.disabled ? DIM : (selected ? GOLD : TEXT);
            const cursor = it.type === 'text' || it.disabled ? 'default' : 'pointer';
            const prefix = selected && it.type !== 'text' ? '▶ ' : '&nbsp;&nbsp;';
            let body = it.label || '';
            if (it.type === 'slider') {
                body += `  ‹ ${sliderBar(it.value, it.min, it.max)} ${pct(it.value)} ›`;
            } else if (it.type === 'toggle') {
                body += `  ‹ ${it.value ? 'ON' : 'OFF'} ›`;
            } else if (it.type === 'select') {
                body += `  ‹ ${it.value} ›`;
            }
            const note = it.note
                ? `<span style="color:${it.disabled ? DIM : '#9aa8bc'};margin-left:14px;font-size:11px">${it.note}</span>`
                : '';
            return `<div data-row="${i}" style="padding:5px 10px;color:${color};cursor:${cursor};letter-spacing:0.04em;font-size:${it.type === 'text' ? '11px' : '14px'};${it.type === 'text' ? `color:${DIM};` : ''}">${prefix}${body}${note}</div>`;
        }).join('');

        this.el.innerHTML =
            (isTitle
                ? `<div style="font-size:44px;letter-spacing:0.24em;color:#7fe0ff;text-shadow:0 0 34px rgba(90,180,255,0.45);margin-bottom:6px">${view.title}</div>` +
                  `<div style="color:#8a96a8;letter-spacing:0.14em;margin-bottom:6px">${view.subtitle || ''}</div>` +
                  `<div style="color:#d4a84b;font-size:11px;letter-spacing:0.22em;margin-bottom:34px">√π ⊗ ∞ ⊗ τ²</div>`
                : `<div style="font-size:22px;letter-spacing:0.2em;color:${GOLD};margin-bottom:22px">${view.title}</div>`) +
            `<div style="background:${isTitle ? 'transparent' : PANEL_BG};border:${isTitle ? 'none' : BORDER};border-radius:10px;padding:${isTitle ? '0' : '18px 26px'};min-width:340px;max-height:60vh;overflow-y:auto">${rows}</div>`;

        // Row interactivity
        this.el.querySelectorAll('[data-row]').forEach((rowEl) => {
            const i = Number(rowEl.dataset.row);
            const it = view.items[i];
            if (!it || it.type === 'text' || it.disabled) return;
            rowEl.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.state.sel = i;
                if (it.type === 'slider') {
                    // click left/right half of the row = adjust down/up
                    const rect = rowEl.getBoundingClientRect();
                    const dir = e.clientX < rect.left + rect.width / 2 ? -1 : 1;
                    this._emit(this.state.adjust(dir));
                } else {
                    this._emit(this.state.activate());
                }
                this.render();
            });
        });
    }

    dispose() {
        window.removeEventListener('keydown', this._onKey);
        this.el.remove();
    }
}
