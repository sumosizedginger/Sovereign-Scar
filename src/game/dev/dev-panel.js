// Dev panel (D3) — teleport + grants overlay. Simple clickable rows.

import { unlockBeat, resetSovereignProgress } from '../kernel/progress.js';

export class DevPanel {
    constructor(dev) {
        this.dev = dev;
        this.isOpen = false;
        this._pausedBefore = false;
        this.el = document.createElement('div');
        this.el.id = 'ss-dev-panel';
        Object.assign(this.el.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: '45',
            minWidth: '340px',
            maxHeight: '80vh',
            overflowY: 'auto',
            color: '#d8e4f0',
            background: 'rgba(8,10,18,0.96)',
            border: '1px solid #ffb020',
            padding: '14px 16px',
            borderRadius: '8px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
            lineHeight: '1.6',
            display: 'none',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        });
        document.body.appendChild(this.el);
    }

    toggle(game) {
        if (this.isOpen) this.close(game);
        else this.open(game);
    }

    open(game) {
        if (this.isOpen) return;
        this.isOpen = true;
        this._pausedBefore = game.paused;
        game.paused = true;
        this._render(game);
        this.el.style.display = 'block';
    }

    close(game) {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.el.style.display = 'none';
        if (game && !this._pausedBefore && !game.atTitle) game.paused = false;
    }

    _row(label, onClick, color = '#7fe0ff') {
        const row = document.createElement('div');
        row.textContent = label;
        Object.assign(row.style, {
            cursor: 'pointer',
            color,
            padding: '2px 6px',
            borderRadius: '4px',
        });
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,176,32,0.15)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        row.addEventListener('click', onClick);
        return row;
    }

    _render(game) {
        const { dev } = this;
        const hooks = dev.hooks || {};
        this.el.innerHTML = '';

        const title = document.createElement('div');
        title.textContent = 'DEV PANEL — click a row · ` or F10 closes';
        Object.assign(title.style, { color: '#ffb020', marginBottom: '8px', letterSpacing: '0.08em' });
        this.el.appendChild(title);

        const inv = () => game.player.inventory;

        const actions = [
            ['Grant all weapons + items', () => {
                for (const id of ['anchor_link', 'tectonic_wedge', 'heavy_mallet', 'light_caster']) {
                    inv().addWeapon(id);
                }
                inv().grantItem('magnetic_grapple');
                inv().grantItem('phase_boot');
                game.hud?.toast?.('Dev: full loadout', 1200);
            }],
            ['+100 shards', () => {
                inv().addShards(100);
                game.hud?.toast?.('Dev: +100 shards', 1000);
            }],
            ['+3 memory keys', () => {
                for (const k of ['spindle', 'sink', 'sky']) inv().grantMemoryKey(k);
                game.hud?.toast?.('Dev: memory keys granted', 1000);
            }],
            ['Unlock all beats', () => {
                for (const meta of hooks.LEVELS || []) unlockBeat(meta.id);
                game.hud?.toast?.('Dev: all beats unlocked', 1000);
            }],
            ['Max hearts + full heal', () => {
                game.player.health.setMax(12);
                game.player.health.fullRestore();
                game.hud?.toast?.('Dev: 12 hearts', 1000);
            }],
            [`Hitbox rings: ${dev.geometry?.enabled ? 'ON' : 'OFF'}`, () => {
                dev.geometry?.setEnabled(!dev.geometry.enabled, game);
                this._render(game);
            }],
            [`Overlays: ${dev.overlays?.visible ? 'ON' : 'OFF'}`, () => {
                dev.overlays?.toggle();
                this._render(game);
            }],
            ['Reset save + reload', () => {
                resetSovereignProgress();
                window.location.reload();
            }],
        ];
        for (const [label, fn] of actions) this.el.appendChild(this._row(label, fn, '#ffd060'));

        const sep = document.createElement('div');
        sep.textContent = '— teleport —';
        Object.assign(sep.style, { color: '#9aa8bc', margin: '8px 0 4px' });
        this.el.appendChild(sep);

        for (const meta of hooks.LEVELS || []) {
            this.el.appendChild(this._row(meta.name || meta.id, () => {
                hooks.loadLevel?.(meta.id);
                this.close(game);
            }));
        }
    }
}
