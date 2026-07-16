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

        this._onKeyDown = (e) => {
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

    /** WASD / arrows as XZ wish vector (unnormalized). */
    moveVector() {
        let x = 0, z = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
        return { x, z };
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

    dispose() {
        const dom = this._dom;
        dom.removeEventListener('keydown', this._onKeyDown);
        dom.removeEventListener('keyup', this._onKeyUp);
        dom.removeEventListener('mousemove', this._onMouseMove);
        dom.removeEventListener('mousedown', this._onMouseDown);
        dom.removeEventListener('mouseup', this._onMouseUp);
    }
}
