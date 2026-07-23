// Keyboard + mouse aim input for Sovereign Scar.

/**
 * EVERY BINDING THE GAME HAS, in one place.
 *
 * There used to be three lists: the handler below, the on-screen cheat sheet in
 * `ui/hud.js`, and `docs/CONTROLS.md` — and all three disagreed. The HUD never
 * mentioned guard, lock-on, cycle-target, mirror travel or the beat cycle; the
 * docs never mentioned the vial or the dust; and the HUD kept two hardcoded
 * copies of itself that had already drifted apart from each other. A player
 * cannot use a verb they are never told about, so a defensive move nobody
 * mentions may as well not be implemented.
 *
 * `codes` are the real KeyboardEvent.code values, so `tests/game/controls.spec.mjs`
 * can read this file, find every code the handler actually looks at, and fail
 * if any of them is missing here or absent from the docs. Adding a binding
 * without documenting it is now a test failure rather than a discovery the
 * player makes years later.
 */
export const CONTROLS = [
    { codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
        label: 'WASD / Arrows', action: 'Move + face', group: 'move',
        pad: 'Left stick', padAxes: [0, 1] },
    { label: 'Right stick', action: 'Aim', group: 'move', padOnly: true,
        pad: 'Right stick', padAxes: [2, 3] },
    { codes: ['Space', 'KeyJ'], label: 'Space / J', action: 'Attack', group: 'move',
        pad: 'A', padButtons: [0] },
    { codes: ['ShiftLeft', 'ShiftRight', 'KeyK'], label: 'Shift / K', action: 'Dash', group: 'move',
        pad: 'B', padButtons: [1] },
    { codes: ['KeyB'], mouse: 'right', label: 'RMB / B', action: 'Guard (tap = parry)', group: 'fight',
        pad: 'RT', padButtons: [7] },
    { codes: ['KeyT'], label: 'T', action: 'Lock on', group: 'fight',
        pad: 'LT', padButtons: [6] },
    { codes: ['KeyY'], label: 'Y', action: 'Switch target', group: 'fight',
        pad: 'L3', padButtons: [10] },
    { codes: ['KeyQ', 'KeyR'], label: 'Q/R', action: 'Cycle weapon', group: 'fight',
        pad: 'LB / RB', padButtons: [4, 5] },
    { codes: ['KeyE', 'KeyF'], label: 'E / F', action: 'Interact', group: 'use',
        pad: 'X', padButtons: [2] },
    { codes: ['KeyG'], label: 'G', action: 'Grapple', group: 'use',
        pad: 'Y', padButtons: [3] },
    { codes: ['KeyV'], label: 'V', action: 'Memory Vial', group: 'use' },
    { codes: ['KeyC'], label: 'C', action: 'Entropy Dust', group: 'use' },
    { codes: ['Tab'], label: 'Tab', action: 'Map', group: 'use',
        pad: 'Select', padButtons: [8] },
    { codes: ['KeyM'], label: 'M', action: 'Mirror travel', group: 'use',
        pad: 'D-up', padButtons: [12] },
    { codes: ['BracketLeft', 'BracketRight', 'PageUp', 'PageDown'],
        label: '[ / ]', action: 'Previous / next beat', group: 'meta' },
    { codes: ['Enter', 'NumpadEnter'], label: 'Enter', action: 'Advance story', group: 'meta',
        pad: 'A', padButtons: [0] },
    // Mute is keyboard-only ON PURPOSE. It gave up its trigger slot to the
    // defensive verbs (Z3/Z4) — it is a settings toggle, not something you
    // reach for mid-fight. The spec asserts it stays that way.
    { codes: ['KeyN'], label: 'N', action: 'Mute', group: 'meta' },
    { codes: ['KeyP', 'Escape'], label: 'P / Esc', action: 'Pause', group: 'meta',
        pad: 'Start', padButtons: [9] },
    // Dev-only: documented, but kept off the player's cheat sheet.
    { codes: ['F1'], label: 'F1', action: 'God mode', dev: true },
    { codes: ['F2'], label: 'F2', action: 'Defeat current boss', dev: true },
    { codes: ['F3'], label: 'F3', action: "Force boss's next phase", dev: true },
    { codes: ['F10', 'Backquote'], label: '` / F10', action: 'Dev panel', dev: true },
    { codes: ['KeyH'], label: 'H', action: 'Hide HUD chrome', dev: true },
];

/** The player-facing cheat sheet, grouped, built from the table above. */
export function controlSheet() {
    const line = (g) => CONTROLS
        .filter((c) => !c.dev && !c.padOnly && c.group === g)
        .map((c) => `${c.label} ${c.action.toLowerCase()}`)
        .join(' · ');
    return [line('move'), line('fight'), line('use'), line('meta')]
        .filter(Boolean).join('\n');
}

/**
 * The gamepad cheat sheet, from the SAME table.
 *
 * This used to be four hand-written lines in `ui/hud.js`, and it had already
 * drifted: it called D-up "mood" while the binding table and the docs call it
 * mirror travel, which is what the button actually does. The keyboard sheet was
 * unified into this table an earlier session; the pad one was left behind,
 * which is exactly how it got the chance to disagree.
 *
 * Entries with no `pad` are keyboard-only and simply do not appear — the Memory
 * Vial, the Entropy Dust, the beat cycle and Mute have no button, and a legend
 * that invented one would be worse than a legend that omits it.
 */
export function padSheet() {
    const line = (g) => CONTROLS
        .filter((c) => !c.dev && c.pad && c.group === g)
        .map((c) => `${c.pad} ${c.action.toLowerCase()}`)
        .join(' · ');
    return [line('move'), line('fight'), line('use'), line('meta')]
        .filter(Boolean).join('\n');
}

export class Input {
    constructor(dom = window) {
        this.keys = new Set();
        this.mouse = { x: 0, y: 0, down: false, right: false };
        this._attackPressed = false;
        this._dashPressed = false;
        this._interactPressed = false;
        this._weaponCycle = 0;
        this._moodToggle = false;
        this._pause = false;
        this._levelNext = false;
        this._levelPrev = false;
        this._grapple = false;
        this._storyAdvance = false;
        this._muteToggle = false;
        this._anyKey = false;
        this._vial = false;
        this._dust = false;

        this._mapToggle = false; // W6

        // Z3/Z4. Guard is LEVEL-triggered (held), not edge-triggered — the
        // parry window is opened by the rising edge inside GuardController, so
        // input only has to report the button state honestly.
        this._padGuard = false;
        this._lockToggle = false;
        this._lockCycle = false;

        // Dev mode (D1): edge-triggered dev inputs, gated at the consume site
        this._devToggle = false;
        this._devKey = null;
        this.devActive = false; // set by dev-mode on toggle; enables F-key preventDefault

        // Gamepad state (B5)
        this.padActive = false;          // true once a pad has been used
        this.padMove = { x: 0, z: 0 };   // left stick (deadzoned, analog)
        this.padAim = null;              // right stick facing, or null
        this._prevButtons = [];
        this._menuCodes = [];            // synthesized nav codes for menus
        // Stick arming: a stick is only trusted once it has been SEEN at rest.
        // A drifting or stuck stick (e.g. a worn DualSense resting at x≈0.94)
        // otherwise pins movement hard in one direction forever and the player
        // cannot walk — moveVector() falls back to the pad whenever no key is
        // held, so the drift wins every frame. Un-armed sticks read as zero;
        // a healthy stick is near neutral on its first poll and arms instantly.
        this._padId = null;
        this._armMove = false;
        this._armAim = false;
        // True while a pad is connected but its left stick has never been seen
        // at rest, so movement input from it is being ignored. Drives a one-shot
        // HUD hint — silently eating input leaves the player with no idea why
        // the controller does nothing.
        this.padStickHeld = false;

        this._onKeyDown = (e) => {
            this.padActive = false; // keyboard use reverts the pad legend
            this.keys.add(e.code);
            if (e.code === 'Space' || e.code === 'KeyJ') this._attackPressed = true;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') this._dashPressed = true;
            if (e.code === 'KeyE' || e.code === 'KeyF') this._interactPressed = true;
            if (e.code === 'KeyQ') this._weaponCycle = -1;
            if (e.code === 'KeyR') this._weaponCycle = 1;
            if (e.code === 'KeyM') this._moodToggle = true;
            if (e.code === 'KeyP' || e.code === 'Escape') this._pause = true;
            if (e.code === 'BracketRight' || e.code === 'PageDown') this._levelNext = true;
            if (e.code === 'BracketLeft' || e.code === 'PageUp') this._levelPrev = true;
            if (e.code === 'KeyG') this._grapple = true;
            if (e.code === 'Enter' || e.code === 'NumpadEnter') this._storyAdvance = true;
            if (e.code === 'KeyN') this._muteToggle = true;
            if (e.code === 'KeyV') this._vial = true;
            if (e.code === 'KeyC') this._dust = true;
            if (e.code === 'KeyT') this._lockToggle = true;
            if (e.code === 'KeyY') this._lockCycle = true;
            if (e.code === 'Tab') {
                this._mapToggle = true;
                e.preventDefault(); // keep focus in the game
            }
            // Dev mode (D1)
            if (e.code === 'KeyD' && e.ctrlKey && e.shiftKey) {
                this._devToggle = true;
                e.preventDefault();
            }
            if (e.code === 'F1' && e.shiftKey) this._devKey = 'ShiftF1';
            else if (['F1', 'F2', 'F3', 'F10', 'Backquote', 'KeyH'].includes(e.code)) {
                this._devKey = e.code;
            }
            if (this.devActive && ['F1', 'F2', 'F3', 'F10'].includes(e.code)) {
                e.preventDefault();
            }
            this._anyKey = true;
            // prevent page scroll on space
            if (e.code === 'Space') e.preventDefault();
        };
        this._onKeyUp = (e) => this.keys.delete(e.code);
        this._onMouseMove = (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        };
        // The mouse no longer drives gameplay — facing comes from movement
        // (A Link to the Past style) and attacking is Space/J. Button state is
        // still tracked because menus read it; it just does not attack.
        this._onMouseDown = (e) => {
            if (e.button === 0) this.mouse.down = true;
            if (e.button === 2) this.mouse.right = true;
        };
        this._onMouseUp = (e) => {
            if (e.button === 0) this.mouse.down = false;
            if (e.button === 2) this.mouse.right = false;
        };

        // Right mouse is the guard button (Z3), so the browser context menu has
        // to stay out of the way — otherwise raising your shield opens a menu
        // and drops keyboard focus mid-fight.
        this._onContextMenu = (e) => e.preventDefault();

        dom.addEventListener('contextmenu', this._onContextMenu);
        dom.addEventListener('keydown', this._onKeyDown);
        dom.addEventListener('keyup', this._onKeyUp);
        dom.addEventListener('mousemove', this._onMouseMove);
        dom.addEventListener('mousedown', this._onMouseDown);
        dom.addEventListener('mouseup', this._onMouseUp);

        this._dom = dom;
    }

    /**
     * Z3: guard button state THIS frame. Held, not consumed — right mouse is
     * the natural home for a shield, KeyB the keyboard-only fallback (right
     * next to Space/J, the strike keys), RT the pad binding.
     */
    guardHeld() {
        return this.mouse.right || this.keys.has('KeyB') || this._padGuard;
    }

    /** WASD / arrows as XZ wish vector (unnormalized); falls back to pad stick. */
    moveVector() {
        let x = 0, z = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
        if (!x && !z && (this.padMove.x || this.padMove.z)) {
            x = this.padMove.x;
            z = this.padMove.z;
        }
        return { x, z };
    }

    /**
     * Poll the Gamepad API once per frame (standard mapping).
     * A=attack · B=dash · X=interact · Y=grapple · LB/RB=weapon ·
     * Start=pause · Select=mute · D-up=mood · D-pad+A/B feed menu nav codes.
     * @param {Array} [padsOverride] test injection point
     */
    pollGamepad(padsOverride) {
        const pads = padsOverride
            || (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null);
        const gp = pads && [...pads].find((p) => p && p.connected !== false && p.buttons?.length);
        if (!gp) {
            this.padMove.x = 0;
            this.padMove.z = 0;
            this.padAim = null;
            this._prevButtons = [];
            this._padId = null;
            this._armMove = false;
            this._armAim = false;
            this.padStickHeld = false;
            this._padGuard = false;
            return;
        }
        const prev = this._prevButtons;
        const b = gp.buttons.map((x) => !!(x && x.pressed));
        const pressed = (i) => b[i] && !prev[i];
        const DEADZONE = 0.18;
        const dz = (v) => (Math.abs(v || 0) > DEADZONE ? v : 0);

        // A different pad (or a reconnect) must re-arm from scratch.
        if (gp.id !== this._padId) {
            this._padId = gp.id;
            this._armMove = false;
            this._armAim = false;
        }
        const rx = gp.axes?.[0] || 0, rz = gp.axes?.[1] || 0;
        const rax = gp.axes?.[2] || 0, raz = gp.axes?.[3] || 0;
        // Arm each stick the first time it is observed at rest, then trust it
        // for good. A stick already off-centre at connect (held, drifting, or
        // stuck) stays un-armed and reads zero instead of pinning movement.
        if (Math.hypot(rx, rz) <= DEADZONE) this._armMove = true;
        if (Math.hypot(rax, raz) <= DEADZONE) this._armAim = true;

        this.padStickHeld = !this._armMove;
        this.padMove.x = this._armMove ? dz(rx) : 0;
        this.padMove.z = this._armMove ? dz(rz) : 0;
        const ax = this._armAim ? dz(rax) : 0;
        const az = this._armAim ? dz(raz) : 0;
        this.padAim = Math.hypot(ax, az) > 0.3 ? { x: ax, z: az } : null;

        if (pressed(0)) { this._attackPressed = true; this._menuCodes.push('Enter'); }
        if (pressed(1)) { this._dashPressed = true; this._menuCodes.push('Backspace'); }
        if (pressed(2)) this._interactPressed = true;
        if (pressed(3)) this._grapple = true;
        if (pressed(4)) this._weaponCycle = -1;
        if (pressed(5)) this._weaponCycle = 1;
        // Triggers carry the defensive verbs (Z3/Z4): LT targets, RT guards —
        // the Ocarina layout. Mute gives up its LT slot and stays on KeyN;
        // it is a settings toggle, not something you reach for mid-fight.
        if (pressed(6)) this._lockToggle = true;
        this._padGuard = !!b[7];
        if (pressed(10)) this._lockCycle = true; // L3
        if (pressed(8)) this._mapToggle = true;
        if (pressed(9)) this._pause = true;
        if (pressed(12)) { this._moodToggle = true; this._menuCodes.push('ArrowUp'); }
        if (pressed(13)) this._menuCodes.push('ArrowDown');
        if (pressed(14)) this._menuCodes.push('ArrowLeft');
        if (pressed(15)) this._menuCodes.push('ArrowRight');

        if (b.some((v, i) => v && !prev[i])) this._anyKey = true;
        if (b.some(Boolean) || this.padMove.x || this.padMove.z) this.padActive = true;
        this._prevButtons = b;
    }

    /** Drain synthesized menu-navigation codes (pad d-pad / A / B). */
    consumeMenuCodes() {
        if (!this._menuCodes.length) return [];
        const v = this._menuCodes;
        this._menuCodes = [];
        return v;
    }

    consumeAttack() {
        const v = this._attackPressed;
        this._attackPressed = false;
        return v;
    }

    consumeDash() {
        const v = this._dashPressed;
        this._dashPressed = false;
        return v;
    }

    consumeInteract() {
        const v = this._interactPressed;
        this._interactPressed = false;
        return v;
    }

    consumeWeaponCycle() {
        const v = this._weaponCycle;
        this._weaponCycle = 0;
        return v;
    }

    consumeMoodToggle() {
        const v = this._moodToggle;
        this._moodToggle = false;
        return v;
    }

    consumePause() {
        const v = this._pause;
        this._pause = false;
        return v;
    }

    consumeLevelNext() {
        const v = this._levelNext;
        this._levelNext = false;
        return v;
    }

    consumeLevelPrev() {
        const v = this._levelPrev;
        this._levelPrev = false;
        return v;
    }

    consumeGrapple() {
        const v = this._grapple;
        this._grapple = false;
        return v;
    }

    consumeStoryAdvance() {
        const v = this._storyAdvance;
        this._storyAdvance = false;
        return v;
    }

    consumeMuteToggle() {
        const v = this._muteToggle;
        this._muteToggle = false;
        return v;
    }

    consumeAnyKey() {
        const v = this._anyKey;
        this._anyKey = false;
        return v;
    }

    consumeVial() {
        const v = this._vial;
        this._vial = false;
        return v;
    }

    consumeDust() {
        const v = this._dust;
        this._dust = false;
        return v;
    }

    consumeLockToggle() {
        const v = this._lockToggle;
        this._lockToggle = false;
        return v;
    }

    consumeLockCycle() {
        const v = this._lockCycle;
        this._lockCycle = false;
        return v;
    }

    consumeMapToggle() {
        const v = this._mapToggle;
        this._mapToggle = false;
        return v;
    }

    consumeDevToggle() {
        const v = this._devToggle;
        this._devToggle = false;
        return v;
    }

    /** One dev key code per frame: F1 | ShiftF1 | F2 | F3 | F10 | Backquote | KeyH. */
    consumeDevKey() {
        const v = this._devKey;
        this._devKey = null;
        return v;
    }

    dispose() {
        const dom = this._dom;
        dom.removeEventListener('contextmenu', this._onContextMenu);
        dom.removeEventListener('keydown', this._onKeyDown);
        dom.removeEventListener('keyup', this._onKeyUp);
        dom.removeEventListener('mousemove', this._onMouseMove);
        dom.removeEventListener('mousedown', this._onMouseDown);
        dom.removeEventListener('mouseup', this._onMouseUp);
    }
}
