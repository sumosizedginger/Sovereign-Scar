// Ending sequence (B4): whiteout → epilogue slides → stats card → scrolling
// credits → done callback. Driven by update(dt) from the main loop; Enter
// (or click) advances. State machine is exposed for tests via `phase`.

const EPILOGUE = [
    { speaker: 'SYSTEM', text: 'LEVIATHAN PROCESS TERMINATED. World coordinate symmetry restored.' },
    { speaker: 'PREDECESSOR', text: 'The OS falls silent. The memory keys burn like stars going home.' },
    { speaker: 'PREDECESSOR', text: 'The Crypt where you woke is only a room again. The corridor only stone.' },
    { speaker: 'PREDECESSOR', text: 'Across the Crust the monoliths dim, doors stand open, and the fourteen wounds breathe out.' },
    { speaker: 'GUMOI', text: 'Index closed. Every wrong turn you took is filed under: the way here.' },
    { speaker: 'PREDECESSOR', text: 'The Scar does not close. It was never meant to close.' },
    { speaker: 'PREDECESSOR', text: 'It heals the way broken pottery heals — sealed in gold, stronger at the seam.' },
    { speaker: 'PREDECESSOR', text: 'Somewhere below, the Abyss keeps its colors. Visit it kindly. It is also ours.' },
    { speaker: 'SYSTEM', text: 'Construct: you are free. The wound remembers, and so will we.' },
];

/** The person the credits are actually about. */
export const AUTHOR = 'sumosizedginger';

/**
 * The credit roll.
 *
 * This used to read `['GAME', 'Sovereign Scar team']` — a team that does not
 * exist and never did — while the author's name appeared exactly once, attached
 * to the ENGINE rather than to the game, on a line above `MADE WITH Claude`.
 * A player reaching the end of fourteen dungeons would have come away thinking
 * a studio built this and a tool helped.
 *
 * It is one person's game. Every dungeon, every boss, every rule about how the
 * fight reads, and the call on every one of them, is theirs. The roll says so
 * now, and `tests/game/credits.spec.mjs` keeps it saying so.
 *
 * Rows are `[label, value, style?]`. `style: 'lead'` renders large.
 */
export const CREDITS = [
    ['SOVEREIGN SCAR', 'The Wound That Remembers', 'lead'],
    ['', ''],
    ['CREATED BY', AUTHOR, 'lead'],
    ['', ''],
    ['DESIGN', AUTHOR],
    ['DIRECTION', AUTHOR],
    ['WORLD & DUNGEON DESIGN', AUTHOR],
    ['COMBAT DESIGN', AUTHOR],
    ['BESTIARY & BOSSES', AUTHOR],
    ['ART DIRECTION', AUTHOR],
    ['LIGHTING & LOOK', AUTHOR],
    ['NARRATIVE', AUTHOR],
    ['SOUND & SCORE DIRECTION', AUTHOR],
    ['ENGINE', `My-Engine 0.2.0 — ${AUTHOR}`],
    ['PRODUCTION', AUTHOR],
    ['PLAYTEST & QA', AUTHOR],
    ['', ''],
    ['THE FINAL CALL ON ALL OF IT', AUTHOR, 'lead'],
    ['', ''],
    ['', 'Fourteen dungeons. Fourteen bosses.'],
    ['', 'One person decided every one of them.'],
    ['', ''],
    ['BUILT WITH', 'three.js r185 · zero build · offline first'],
    ['MADE WITH', 'Claude'],
    ['', ''],
    ['', 'The Scar is quiet now.'],
    ['', 'Thank you for playing.'],
];

/**
 * How long the roll takes, derived from how much roll there is.
 *
 * The scroll is a CSS keyframe from `translateY(60vh)` to `translateY(-110%)`,
 * so its SPEED depends on the height of the content — a fixed 24s meant that
 * lengthening the credits silently sped them up until nobody could read them.
 * Pacing it per row keeps the reading speed constant whatever gets added later.
 */
const CREDIT_ROW_SECONDS = 1.7;
const CREDITS_MIN_SECONDS = 20;
export const CREDITS_SECONDS = Math.max(
    CREDITS_MIN_SECONDS, Math.round(CREDITS.length * CREDIT_ROW_SECONDS));

export class EndingSequence {
    /**
     * @param {object} opts
     * @param {function} [opts.onDone] fired after credits complete/skip
     */
    constructor(opts = {}) {
        this.onDone = opts.onDone || (() => {});
        this.phase = 'idle'; // idle | fade | epilogue | stats | credits | done
        this.t = 0;
        this.slide = 0;
        this.stats = null;

        this.el = document.createElement('div');
        this.el.id = 'ss-ending';
        Object.assign(this.el.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '50',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            textAlign: 'center',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: '#d8e4f0',
            background: '#ffffff',
            transition: 'background 2.5s ease',
            userSelect: 'none',
        });
        document.body.appendChild(this.el);
    }

    get isActive() {
        return this.phase !== 'idle' && this.phase !== 'done';
    }

    /** @param {{playTime:number, deaths:number, bosses:number, shards:number, keys:number}} stats */
    start(stats) {
        if (this.isActive) return;
        this.stats = stats || {};
        this.phase = 'fade';
        this.t = 0;
        this.slide = 0;
        this.el.style.display = 'flex';
        this.el.style.background = '#ffffff';
        this.el.innerHTML = '';
    }

    /** Enter / click: advance slides, skip credits. */
    advance() {
        if (this.phase === 'epilogue') {
            this.slide++;
            this.t = 0;
            if (this.slide >= EPILOGUE.length) this.phase = 'stats';
            this._render();
        } else if (this.phase === 'stats') {
            this.phase = 'credits';
            this.t = 0;
            this._render();
        } else if (this.phase === 'credits') {
            this._finish();
        }
    }

    update(dt) {
        if (!this.isActive) return;
        this.t += dt;
        if (this.phase === 'fade' && this.t > 1.2) {
            this.phase = 'epilogue';
            this.t = 0;
            this.el.style.background = '#05030a';
            this._render();
        } else if (this.phase === 'epilogue' && this.t > 7) {
            this.advance(); // auto-advance slow readers' slides
        } else if (this.phase === 'credits' && this.t > CREDITS_SECONDS + 2) {
            this._finish();
        }
    }

    _finish() {
        this.phase = 'done';
        this.el.style.display = 'none';
        this.el.innerHTML = '';
        this.onDone();
    }

    _fmtTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(sec % 60)}s`;
    }

    _render() {
        if (this.phase === 'epilogue') {
            const s = EPILOGUE[Math.min(this.slide, EPILOGUE.length - 1)];
            this.el.innerHTML =
                `<div style="max-width:640px;padding:0 24px">` +
                `<div style="color:#d4a84b;font-size:12px;letter-spacing:0.28em;margin-bottom:18px">${s.speaker}</div>` +
                `<div style="font-size:20px;line-height:1.7;letter-spacing:0.04em">${s.text}</div>` +
                `<div style="color:#5a647a;font-size:11px;margin-top:40px">Enter — continue</div>` +
                `</div>`;
        } else if (this.phase === 'stats') {
            const st = this.stats;
            const row = (k, v) =>
                `<div style="display:flex;justify-content:space-between;gap:40px;padding:6px 0">` +
                `<span style="color:#9aa8bc">${k}</span><span style="color:#ffd060">${v}</span></div>`;
            // 12.4: reconcile the score ledger against the displayed total.
            // Every award writes both `total` and `ledger[type]`, so their
            // sums must agree; showing the check (and failing it loudly)
            // keeps the number the player sees honest.
            const ledger = st.ledger || {};
            const ledgerRows = Object.entries(ledger)
                .sort((a, b) => b[1] - a[1])
                .map(([type, pts]) =>
                    `<div style="display:flex;justify-content:space-between;gap:40px;padding:3px 0;font-size:12px">` +
                    `<span style="color:#6a7690">· ${type.replace(/_/g, ' ')}</span>` +
                    `<span style="color:#c9b896">${pts}</span></div>`)
                .join('');
            const ledgerTotal = Object.values(ledger).reduce((a, b) => a + (b || 0), 0);
            const reconciled = ledgerTotal === (st.score || 0);
            const reconcileRow =
                `<div id="ss-ledger-check" data-reconciled="${reconciled}" ` +
                `style="display:flex;justify-content:space-between;gap:40px;padding:8px 0;` +
                `border-top:1px solid #3a4058;margin-top:6px;font-size:12px">` +
                `<span style="color:${reconciled ? '#7fe0ff' : '#ff5060'}">` +
                (reconciled
                    ? `Ledger reconciled — ${st.events || 0} events`
                    : `LEDGER MISMATCH`) +
                `</span><span style="color:${reconciled ? '#7fe0ff' : '#ff5060'}">` +
                (reconciled ? `${ledgerTotal} ✓` : `${ledgerTotal} ≠ ${st.score || 0}`) +
                `</span></div>`;
            this.el.innerHTML =
                `<div style="font-size:24px;letter-spacing:0.22em;color:#7fe0ff;margin-bottom:30px">RUN COMPLETE</div>` +
                `<div style="min-width:320px;background:rgba(8,10,18,0.9);border:1px solid #3a4058;border-radius:10px;padding:22px 30px;font-size:14px">` +
                row('Time', this._fmtTime(st.playTime || 0)) +
                row('Deaths', st.deaths || 0) +
                row('Bosses', `${st.bosses || 0} / 14`) +
                row('Scar Shards', st.shards || 0) +
                row('Memory Keys', `${st.keys || 0} / 3`) +
                row('Run Mode', String(st.runMode || 'medium').toUpperCase()) +
                row('Witness Score', st.score || 0) +
                ledgerRows +
                reconcileRow +
                `</div>` +
                `<div style="color:#5a647a;font-size:11px;margin-top:28px">Enter — credits</div>`;
        } else if (this.phase === 'credits') {
            const rows = CREDITS.map(([k, v, style]) => {
                const lead = style === 'lead';
                return `<div style="padding:${lead ? 16 : 10}px 0">` +
                    (k ? `<div style="color:#d4a84b;font-size:11px;letter-spacing:0.3em;margin-bottom:${lead ? 8 : 4}px">${k}</div>` : '') +
                    (v ? `<div style="font-size:${lead ? 26 : 16}px;letter-spacing:0.06em;` +
                        `color:${lead ? '#ffd060' : '#d8e4f0'}">${v}</div>` : '') +
                    `</div>`;
            }).join('');
            this.el.innerHTML =
                `<div style="height:100%;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;width:100%">` +
                `<div style="animation:ss-credits-scroll ${CREDITS_SECONDS}s linear forwards;text-align:center;padding-bottom:10vh">${rows}</div>` +
                `</div>` +
                `<style>@keyframes ss-credits-scroll { from { transform: translateY(60vh); } to { transform: translateY(-110%); } }</style>`;
        }
    }

    dispose() {
        this.el.remove();
    }
}
