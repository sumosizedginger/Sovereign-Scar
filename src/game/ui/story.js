// Narrative story panel — queued dialogue lines with speaker labels.

export class StoryPanel {
    constructor() {
        this.el = document.createElement('div');
        this.el.id = 'ss-story';
        Object.assign(this.el.style, {
            position: 'fixed',
            left: '50%',
            bottom: '96px',
            transform: 'translateX(-50%)',
            zIndex: '30',
            minWidth: '320px',
            maxWidth: '560px',
            color: '#f0e8d8',
            background: 'linear-gradient(180deg, rgba(18,14,28,0.94), rgba(10,8,16,0.96))',
            border: '1px solid #d4a84b',
            borderRadius: '10px',
            padding: '14px 18px 12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '13px',
            lineHeight: '1.55',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity 0.2s',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        });
        document.body.appendChild(this.el);

        this.queue_ = [];
        this.current = null;
        this.timer = 0;
        this.defaultHold = 3.2;
        this.visible = false;
    }

    /** Drop current + pending lines (used on level load). */
    clear() {
        this.queue_ = [];
        this.current = null;
        this.timer = 0;
        this.visible = false;
        this.el.style.opacity = '0';
        this.el.innerHTML = '';
    }

    /**
     * @param {Array<{speaker?:string, text:string, hold?:number}>|string[]} lines
     * @param {{replace?:boolean}} [opts] replace=true clears prior queue first
     */
    queue(lines, opts = {}) {
        if (!lines) return;
        if (opts.replace) this.clear();
        const arr = Array.isArray(lines) ? lines : [lines];
        for (const line of arr) {
            if (typeof line === 'string') this.queue_.push({ speaker: '', text: line, hold: this.defaultHold });
            else this.queue_.push({
                speaker: line.speaker || '',
                text: line.text || '',
                hold: line.hold != null ? line.hold : this.defaultHold,
            });
        }
        if (!this.current) this._next();
    }

    _next() {
        if (!this.queue_.length) {
            this.current = null;
            this.visible = false;
            this.el.style.opacity = '0';
            return;
        }
        this.current = this.queue_.shift();
        this.timer = this.current.hold;
        this.visible = true;
        const sp = this.current.speaker
            ? `<div style="color:#d4a84b;font-size:11px;letter-spacing:0.08em;margin-bottom:4px">${escapeHtml(this.current.speaker)}</div>`
            : '';
        this.el.innerHTML = sp + `<div>${escapeHtml(this.current.text)}</div>` +
            `<div style="margin-top:8px;color:#6a7088;font-size:10px">Enter / click — next</div>`;
        this.el.style.opacity = '1';
    }

    /** Advance or skip current line. */
    advance() {
        if (!this.current && !this.queue_.length) return false;
        this._next();
        return true;
    }

    update(dt) {
        if (!this.current) return;
        this.timer -= dt;
        if (this.timer <= 0) this._next();
    }

    dispose() {
        this.el.remove();
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
