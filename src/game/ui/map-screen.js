// W6: Tab map — overworld screen grid or in-dungeon room graph, drawn on a
// 2D canvas overlay. Data comes from level.mapData() (room-graph/overworld
// levels provide it; plain arena levels have no map).

export class MapScreen {
    constructor() {
        this.isOpen = false;
        this._pausedBefore = false;

        this.el = document.createElement('div');
        this.el.id = 'ss-map';
        Object.assign(this.el.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '35',
            display: 'none',
            background: 'rgba(4,6,12,0.88)',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            fontFamily: 'ui-monospace, monospace',
            color: '#d8e4f0',
        });
        this.title = document.createElement('div');
        Object.assign(this.title.style, {
            marginBottom: '10px',
            letterSpacing: '0.14em',
            color: '#ffd060',
            fontSize: '15px',
        });
        this.canvas = document.createElement('canvas');
        this.canvas.width = 560;
        this.canvas.height = 460;
        Object.assign(this.canvas.style, {
            border: '1px solid #3a4058',
            borderRadius: '8px',
            background: 'rgba(10,12,20,0.9)',
        });
        this.hint = document.createElement('div');
        this.hint.textContent = 'Tab / Esc — close';
        Object.assign(this.hint.style, { marginTop: '10px', color: '#9aa8bc', fontSize: '11px' });
        this.recall = document.createElement('div');
        Object.assign(this.recall.style, {
            marginTop: '12px', maxWidth: '560px', padding: '10px 14px',
            color: '#f0e8d8', background: 'rgba(18,14,28,0.9)',
            border: '1px solid #d4a84b', borderRadius: '7px', fontSize: '12px',
            lineHeight: '1.5',
        });
        this.el.append(this.title, this.canvas, this.recall, this.hint);
        document.body.appendChild(this.el);
    }

    toggle(game) {
        if (this.isOpen) this.close(game);
        else this.open(game);
    }

    open(game) {
        if (this.isOpen) return;
        const data = game.level?.mapData?.();
        if (!data) {
            game.hud?.toast?.('No map for this place', 1200);
            return;
        }
        this.isOpen = true;
        game.witnessScore?.award?.('map_memory', game.levelId || data.name || 'map');
        if (game.player?.inventory?.hasItem?.('resonance_fork')) game.replayThreadMotif?.();
        this._pausedBefore = game.paused;
        game.paused = true;
        this.title.textContent = (data.name || 'MAP').toUpperCase()
            + (data.state ? ` — ${data.state.toUpperCase()}` : '');
        const destination = game.anchorThread?.destination?.() || null;
        this.recall.textContent = `RECALL: ${game.anchorThread?.recall?.() || 'The Link remembers no destination.'}`;
        this._render({
            ...data,
            threadDestination: destination?.screen || null,
            revealSecrets: game.hasUpgrade?.('echo_lens') || false,
        });
        this.el.style.display = 'flex';
    }

    close(game) {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.el.style.display = 'none';
        if (game && !this._pausedBefore && !game.atTitle) game.paused = false;
    }

    _render(data) {
        const ctx = this.canvas.getContext('2d');
        const W = this.canvas.width, H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);

        const nodes = data.kind === 'overworld' ? data.screens : data.rooms;
        const shown = nodes.filter((n) => n.visited || n.current || data.mapAll
            || (data.kind === 'overworld' && n.id === data.threadDestination)
            || (data.kind === 'overworld' && data.revealSecrets && n.secret
                && nearCurrent(n, nodes)));
        if (!shown.length) return;

        const xs = nodes.map((n) => n.gx ?? n.sx), ys = nodes.map((n) => n.gy ?? n.sy);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const cols = maxX - minX + 1, rows = maxY - minY + 1;
        const cell = Math.min(72, Math.floor(Math.min((W - 60) / cols, (H - 60) / rows)));
        const ox = (W - cols * cell) / 2, oy = (H - rows * cell) / 2;
        const centerOf = (n) => ({
            x: ox + ((n.gx ?? n.sx) - minX) * cell + cell / 2,
            y: oy + ((n.gy ?? n.sy) - minY) * cell + cell / 2,
        });

        // Dungeon door links first (under the boxes)
        if (data.kind === 'dungeon') {
            for (const r of shown) {
                for (const d of r.doors || []) {
                    const to = nodes.find((n) => n.id === d.to);
                    if (!to || !(to.visited || to.current || data.mapAll)) continue;
                    const a = centerOf(r), b = centerOf(to);
                    ctx.strokeStyle = d.opened ? '#7fe0ff'
                        : d.type === 'locked' ? '#ffd060'
                            : d.type === 'boss' ? '#ff5060' : '#5a6478';
                    ctx.lineWidth = d.type === 'open' || d.opened ? 2 : 3;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        for (const n of shown) {
            const c = centerOf(n);
            const s = cell * 0.72;
            ctx.fillStyle = n.current ? '#3a4a68' : '#242c40';
            ctx.strokeStyle = n.current ? '#ffd060' : '#3a4058';
            ctx.lineWidth = n.current ? 3 : 1;
            ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s);
            ctx.strokeRect(c.x - s / 2, c.y - s / 2, s, s);

            if (data.kind === 'overworld' && n.id === data.threadDestination) {
                ctx.strokeStyle = '#d4a84b';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 4]);
                ctx.strokeRect(c.x - s * 0.62, c.y - s * 0.62, s * 1.24, s * 1.24);
                ctx.setLineDash([]);
            }

            if (data.revealSecrets && n.secret) {
                ctx.fillStyle = '#7fe0ff';
                ctx.beginPath();
                ctx.arc(c.x + s * 0.28, c.y - s * 0.28, Math.max(2, s * 0.07), 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = '#d8e4f0';
            ctx.font = `${Math.max(12, cell * 0.3)}px ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (n.boss) {
                ctx.fillStyle = '#ff5060';
                ctx.fillText('☠', c.x, c.y);
            } else if (n.entrance) {
                ctx.fillStyle = '#ffd060';
                ctx.fillText('▼', c.x, c.y);
            } else if (n.monolith) {
                ctx.fillStyle = '#c084fc';
                ctx.fillText('◆', c.x, c.y);
            }
        }
    }

    dispose() {
        this.el.remove();
    }
}

function nearCurrent(node, nodes) {
    const current = nodes.find((candidate) => candidate.current);
    if (!current) return false;
    return Math.abs((node.sx ?? node.gx) - (current.sx ?? current.gx))
        + Math.abs((node.sy ?? node.gy) - (current.sy ?? current.gy)) <= 1;
}
