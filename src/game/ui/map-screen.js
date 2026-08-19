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
        // Phase G — the map pickup pays, not the act of LOOKING at the map.
        //
        // This awarded 500 points for pressing Tab, once per level, whether or
        // not the player had found that level's map at all. Fourteen dungeons
        // is 7,000 free points on the scoreboard for opening a menu — and a
        // score you get for opening a menu quietly tells the player the score
        // is not worth reading. The award now requires the map to have been
        // EARNED, which is what `map_memory` was always meant to name.
        if (game.level?.keyStore?.mapPickup?.()) {
            game.witnessScore?.award?.('map_memory', game.levelId || data.name || 'map');
        }
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
        // The grid gets the canvas minus the legend strip. Reserved before the
        // cell size is chosen, so the key never lands on top of a room.
        const gridH = H - LEGEND_H;
        const cell = Math.min(72, Math.floor(Math.min((W - 60) / cols, (gridH - 40) / rows)));
        const ox = (W - cols * cell) / 2, oy = (gridH - rows * cell) / 2;
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

        drawLegend(ctx, W, H, data, shown);
    }

    dispose() {
        this.el.remove();
    }
}

/** Height reserved at the bottom of the canvas for the key. */
const LEGEND_H = 58;

/**
 * The key.
 *
 * REPORTED FROM PLAY: *"Need to include some kind of key for the world map."*
 * The map draws six different marks — a filled box, a gold outline, a gold
 * DASHED outline, a yellow triangle, a violet diamond, a cyan dot — plus four
 * link colours in a dungeon, and explained none of them. A dashed gold box and
 * a solid gold box mean entirely different things and differ by a line style.
 *
 * BUILT FROM WHAT IS ACTUALLY ON SCREEN, not from a static list. A key that
 * names a symbol the player cannot see is one more thing to decode: the
 * overworld never has a boss skull, a dungeon never has a monolith, and the
 * secret dot only exists with the Echo Lens. Each entry below states the
 * condition under which it is worth drawing.
 */
function drawLegend(ctx, W, H, data, shown) {
    const dungeon = data.kind === 'dungeon';
    const any = (pred) => shown.some(pred);
    const items = [];

    items.push({ kind: 'box', fill: '#3a4a68', stroke: '#ffd060', label: 'you are here' });
    if (shown.length > 1) {
        items.push({ kind: 'box', fill: '#242c40', stroke: '#3a4058', label: 'visited' });
    }
    if (!dungeon && data.threadDestination
        && any((n) => n.id === data.threadDestination)) {
        items.push({ kind: 'dashed', stroke: '#d4a84b', label: 'your destination' });
    }
    if (any((n) => n.entrance)) {
        items.push({ kind: 'glyph', glyph: '▼', color: '#ffd060', label: 'dungeon entrance' });
    }
    if (any((n) => n.monolith)) {
        items.push({ kind: 'glyph', glyph: '◆', color: '#c084fc', label: 'monolith' });
    }
    if (any((n) => n.boss)) {
        items.push({ kind: 'glyph', glyph: '☠', color: '#ff5060', label: 'boss' });
    }
    if (data.revealSecrets && any((n) => n.secret)) {
        items.push({ kind: 'dot', color: '#7fe0ff', label: 'secret' });
    }
    if (dungeon) {
        items.push({ kind: 'line', color: '#5a6478', label: 'shut' });
        items.push({ kind: 'line', color: '#ffd060', label: 'locked' });
        items.push({ kind: 'line', color: '#ff5060', label: 'boss door' });
        items.push({ kind: 'line', color: '#7fe0ff', label: 'opened' });
    }
    if (!items.length) return;

    const top = H - LEGEND_H;
    ctx.save();
    ctx.strokeStyle = '#2a3145';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, top);
    ctx.lineTo(W - 14, top);
    ctx.stroke();

    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Two rows, packed left to right. Measured rather than assumed: a key that
    // runs off the edge of the canvas is worse than no key.
    const PAD = 16, GAP = 16, SW = 13;
    let x = PAD, row = 0;
    for (const it of items) {
        const w = SW + 6 + ctx.measureText(it.label).width;
        if (x + w > W - PAD && row === 0) { row = 1; x = PAD; }
        if (row > 1) break;
        const y = top + 17 + row * 20;
        if (it.kind === 'box' || it.kind === 'dashed') {
            if (it.fill) { ctx.fillStyle = it.fill; ctx.fillRect(x, y - 5, SW, 11); }
            ctx.strokeStyle = it.stroke;
            ctx.lineWidth = 2;
            if (it.kind === 'dashed') ctx.setLineDash([3, 3]);
            ctx.strokeRect(x, y - 5, SW, 11);
            ctx.setLineDash([]);
        } else if (it.kind === 'line') {
            ctx.strokeStyle = it.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + SW, y);
            ctx.stroke();
        } else if (it.kind === 'dot') {
            ctx.fillStyle = it.color;
            ctx.beginPath();
            ctx.arc(x + SW / 2, y, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = it.color;
            ctx.font = '13px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(it.glyph, x + SW / 2, y);
            ctx.font = '11px ui-monospace, monospace';
            ctx.textAlign = 'left';
        }
        ctx.fillStyle = '#9aa8bc';
        ctx.fillText(it.label, x + SW + 6, y);
        x += w + GAP;
    }
    ctx.restore();
}

function nearCurrent(node, nodes) {
    const current = nodes.find((candidate) => candidate.current);
    if (!current) return false;
    return Math.abs((node.sx ?? node.gx) - (current.sx ?? current.gx))
        + Math.abs((node.sy ?? node.gy) - (current.sy ?? current.gy)) <= 1;
}
