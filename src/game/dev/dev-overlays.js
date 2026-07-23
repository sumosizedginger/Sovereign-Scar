// Dev overlays (D5) — FPS / draw calls / luminance / positions, ~4 Hz.

export class DevOverlays {
    constructor(dev) {
        this.dev = dev;
        this.visible = false;
        this._acc = 0;
        this._fpsSamples = [];
        this._lum = null;
        this._lumAcc = 0;
        this.el = document.createElement('div');
        this.el.id = 'ss-dev-overlay';
        Object.assign(this.el.style, {
            position: 'fixed',
            top: '12px',
            right: '12px',
            zIndex: '40',
            color: '#a8ffb0',
            background: 'rgba(4,12,6,0.82)',
            border: '1px solid #3a5840',
            padding: '8px 10px',
            borderRadius: '6px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
            lineHeight: '1.5',
            whiteSpace: 'pre',
            display: 'none',
            pointerEvents: 'none',
        });
        document.body.appendChild(this.el);
    }

    toggle() {
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'block' : 'none';
    }

    hide() {
        this.visible = false;
        this.el.style.display = 'none';
    }

    update(dt, game) {
        if (!this.visible) return;
        this._fpsSamples.push(dt > 0 ? 1 / dt : 0);
        if (this._fpsSamples.length > 60) this._fpsSamples.shift();

        // Luminance on a 1 s cadence, only while visible (reuses S6 sampler)
        this._lumAcc += dt;
        if (this._lumAcc > 1 && !window.__ssLumRequest) {
            this._lumAcc = 0;
            // Spread is shown next to the mean because the two disagree in the
            // direction that matters: flattening a room raises the mean and
            // collapses the spread. Tuning lights against the mean alone is
            // what produced the flat build.
            window.__ssLumRequest = (v) => { this._lum = v.mean; this._spread = v.spread; };
        }

        this._acc += dt;
        if (this._acc < 0.25) return; // ~4 Hz
        this._acc = 0;

        const fps = this._fpsSamples.length
            ? this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length
            : 0;
        const info = game.renderer?.info?.render || {};
        const p = game.player?.root?.position;
        const b = game.level?.boss;
        const lines = [
            `FPS ${fps.toFixed(0)} · calls ${info.calls ?? '?'} · tris ${info.triangles ?? '?'}`,
            `lum ${this._lum != null ? this._lum.toFixed(1) : '…'} · spread ${this._spread != null ? this._spread : '…'}`,
            p ? `player ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}` : '',
            b ? `boss ${b.hp?.toFixed?.(1) ?? b.hp}/${b.maxHp} ph ${b.phase || 1}/${b.maxPhase || '?'}` : 'boss —',
            `${game.levelId} · ${game.mood?.mood || '?'}`,
        ];
        this.el.textContent = lines.filter(Boolean).join('\n');
    }
}
