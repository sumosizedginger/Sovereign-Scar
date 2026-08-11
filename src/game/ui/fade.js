// A full-screen colour wash, for cutscenes and the ending.
//
// This existed already, but only as three hardcoded lines inside
// `EndingSequence` — a `background` plus a `transition: background 2.5s` on the
// credits overlay's own div. That works exactly once, for one colour, for one
// caller, and cannot be reached by anything else.
//
// A fade left opaque is the same class of bug as a stuck `cinematic` flag: the
// screen is a solid rectangle, the game underneath is running fine, and the only
// way out is a reload. So `clear()` is instant and unconditional, and everything
// that can interrupt a scene is expected to call it.

const Z = 40; // above the world, below the menu (50) and the credits overlay

export class ScreenFade {
    constructor() {
        this.el = document.createElement('div');
        this.el.id = 'ss-fade';
        Object.assign(this.el.style, {
            position: 'fixed',
            inset: '0',
            zIndex: String(Z),
            background: '#000000',
            opacity: '0',
            pointerEvents: 'none', // never eat a click, even at full opacity
            transition: 'opacity 0.6s ease',
        });
        document.body.appendChild(this.el);
        this._opacity = 0;
    }

    /** True while anything is covering the screen at all. */
    get covering() {
        return this._opacity > 0.001;
    }

    /**
     * Wash to `color` over `duration` seconds. Named colours are whatever CSS
     * accepts; 'black' and 'white' are the two the game uses.
     */
    to(color = 'black', duration = 0.6) {
        this.el.style.transition = `opacity ${Math.max(0, duration)}s ease`;
        this.el.style.background = color === 'white' ? '#ffffff' : (color || '#000000');
        // Force a reflow so a `to` immediately after a `clear` animates instead
        // of the browser coalescing both into one no-op style change.
        void this.el.offsetHeight;
        this.el.style.opacity = '1';
        this._opacity = 1;
    }

    /** Wash back to the game. */
    from(duration = 0.6) {
        this.el.style.transition = `opacity ${Math.max(0, duration)}s ease`;
        this.el.style.opacity = '0';
        this._opacity = 0;
    }

    /**
     * Instantly transparent, no transition. The escape hatch — call it from
     * anything that can cut a scene short (level load, death, a beat that threw).
     * Deliberately not `from(0)`: this must not depend on a transition firing.
     */
    clear() {
        this.el.style.transition = 'none';
        this.el.style.opacity = '0';
        this._opacity = 0;
        void this.el.offsetHeight;
        this.el.style.transition = 'opacity 0.6s ease';
    }

    dispose() {
        if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    }
}
