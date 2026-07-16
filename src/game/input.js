// Keyboard + mouse aim input for Sovereign Scar.

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

        this._mapToggle = false; // W6

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
        this._onMouseDown = (e) => {
            if (e.button === 0) {
                this.mouse.down = true;
                this._attackPressed = true;
            }
            if (e.button === 2) this.mouse.right = true;
        };
        this._onMouseUp = (e) => {
            if (e.button === 0) this.mouse.down = false;
            if (e.button === 2) this.mouse.right = false;
        };

        dom.addEventListener('keydown', this._onKeyDown);
        dom.addEventListener('keyup', this._onKeyUp);
        dom.addEventListener('mousemove', this._onMouseMove);
        dom.addEventListener('mousedown', this._onMouseDown);
        dom.addEventListener('mouseup', this._onMouseUp);

        this._dom = dom;
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
            return;
        }
        const prev = this._prevButtons;
        const b = gp.buttons.map((x) => !!(x && x.pressed));
        const pressed = (i) => b[i] && !prev[i];
        const dz = (v) => (Math.abs(v || 0) > 0.18 ? v : 0);

        this.padMove.x = dz(gp.axes?.[0]);
        this.padMove.z = dz(gp.axes?.[1]);
        const ax = dz(gp.axes?.[2]);
        const az = dz(gp.axes?.[3]);
        this.padAim = Math.hypot(ax, az) > 0.3 ? { x: ax, z: az } : null;

        if (pressed(0)) { this._attackPressed = true; this._menuCodes.push('Enter'); }
        if (pressed(1)) { this._dashPressed = true; this._menuCodes.push('Backspace'); }
        if (pressed(2)) this._interactPressed = true;
        if (pressed(3)) this._grapple = true;
        if (pressed(4)) this._weaponCycle = -1;
        if (pressed(5)) this._weaponCycle = 1;
        if (pressed(8)) this._muteToggle = true;
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
        dom.removeEventListener('keydown', this._onKeyDown);
        dom.removeEventListener('keyup', this._onKeyUp);
        dom.removeEventListener('mousemove', this._onMouseMove);
        dom.removeEventListener('mousedown', this._onMouseDown);
        dom.removeEventListener('mouseup', this._onMouseUp);
    }
}
