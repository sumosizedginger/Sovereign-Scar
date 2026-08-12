// tests/game/hud-player.spec.mjs — the normal game must not show the player
// the inside of the build.
//
// The HUD used to print eleven lines of `label: value` into one bordered black
// panel, four of which exist only for whoever is BUILDING the game:
//
//     Beat: 01 Crypt Breach       ← internal level id
//     Mood: crust                 ← lighting preset name
//     Bosses: 0/14                ← completion counter
//     HP ♥♥♥♥♥♥ (6/6)             ← the number behind the hearts next to it
//
// Nothing was broken. That is the point — a wrong number fails a test, and a
// correct number shown to the wrong audience fails nothing at all, forever. So
// the audience is what this spec asserts.
//
// TWO CLAIMS, AND THE SECOND IS THE ONE THAT AGES
//
//   1. normal play shows the player what they need and none of the above
//   2. dev mode still shows ALL of it
//
// Without (2) this spec rewards deleting the instrumentation, which would be a
// worse project to work on and would get quietly re-added inside the player's
// panel the first time someone needed to see a mood name.
//
// NOT SO BROAD THAT STORY TEXT BECOMES IMPOSSIBLE
//
// The objective line is real prose written by the narrative, and prose is
// allowed to contain the word "beat". So the scan runs over the panel with the
// objective's own text removed, and the last section proves that a deliberately
// hostile objective — one containing every forbidden label — does not trip the
// gate.

function fakeEl() {
    return {
        style: {},
        textContent: '',
        innerHTML: '',
        id: '',
        children: [],
        appendChild(c) { this.children.push(c); return c; },
        querySelector() { return fakeEl(); },
        addEventListener() {},
        removeEventListener() {},
    };
}

function installDomShim() {
    globalThis.document = {
        createElement: () => fakeEl(),
        body: fakeEl(),
        getElementById: () => null,
    };
}

import { HUD } from '../../src/game/ui/hud.js';

/** Visible text of a rendered panel: tags out, entities in. */
const strip = (html) => String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The labels that must never reach a player, taken from the panel that shipped
 * rather than from a wish list. Each is anchored with its colon or its slash so
 * an ordinary English sentence cannot match by accident.
 */
const DEV_ONLY = [
    /\bBeat:/,          // internal level id — "Beat: 01 Crypt Breach"
    /\bMood:/,          // lighting preset — "Mood: crust"
    /\bMode:/,          // run-mode label in dashboard form
    /\bBosses:\s*\d+\/14/, // completion counter
    /\bWitness:/,       // raw score readout
    /\bThread:/,        // the internal name of the objective system
    /\bReconstitutions\b/,
    /\bSOVEREIGN SCAR\b/,  // the title, printed over the game every frame
    /\(\s*\d+(\.\d+)?\s*\/\s*\d+\s*\)/,  // "(6/6)" — the number behind the hearts
];

/** A full frame of state, shaped exactly as index.js hands it over. */
function frame(over = {}) {
    return {
        hidden: false,
        pad: false,
        dev: false,
        hp: 4,
        maxHp: 6,
        guard: { poise: 2, poiseMax: 3, raised: false, broken: false, parries: 1 },
        weapon: 'Bulwark Shield',
        memoryKeys: 1,
        scarShards: 40,
        bankedShards: 0,
        vials: 1,
        vialSlots: 2,
        entropyCharges: 3,
        sutures: 2,
        runMode: 'medium',
        charges: 5,
        score: 1200,
        chain: 1,
        thread: 'The Crypt is north. Something inside is still using my name.',
        smallKeys: 2,
        hasBossKey: true,
        mood: 'crust',
        beatId: 'beat-01-crypt',
        beatName: '01 Crypt Breach',
        paused: false,
        banner: 'The Scarred Crust — fourteen wounds await',
        bossesDefeated: 0,
        boss: null,
        showTimer: false,
        playTime: 91,
        ...over,
    };
}

export function run(t) {
    installDomShim();
    const hud = new HUD();

    // ── 1. Normal play ─────────────────────────────────────────────────────
    const st = frame();
    hud.update(st);
    const panel = strip(hud.el.innerHTML).replace(st.thread, '');

    for (const rx of DEV_ONLY) {
        t.ok(`normal play never shows ${rx.source}`, !rx.test(panel), panel);
    }

    // The banner was drawn in the panel AND toasted by index.js on level entry,
    // so the same sentence sat on the screen twice at once.
    t.ok('normal play does not repeat the level banner in the panel',
        !panel.includes('fourteen wounds await'), panel);
    hud.update(frame({ paused: true }));
    t.ok('normal play does not label the pause it is already showing a menu for',
        !strip(hud.el.innerHTML).includes('PAUSED'), strip(hud.el.innerHTML));

    // ── 2. …and still tells the player what they are carrying ──────────────
    hud.update(st);
    const html = hud.el.innerHTML;
    const shown = strip(html);
    // Health is drawn, not written: four lit hearts, two dark.
    const lit = (html.match(/color:#ff4a63/g) || []).length;
    const dark = (html.match(/color:#4a2030/g) || []).length;
    t.ok('health is drawn as hearts, and the right number of them',
        lit === 4 && dark === 2, `${lit} lit / ${dark} dark`);
    t.ok('the guard pool is drawn', /border-radius:2px/.test(html), shown);
    t.ok('the equipped weapon is named', shown.includes('Bulwark Shield'), shown);
    t.ok('dungeon keys are shown while carried', /2\s*KEYS/.test(shown), shown);
    t.ok('the boss key is called out', shown.includes('BOSS KEY'), shown);
    t.ok('currency is shown', /40\s*SHARDS/.test(shown), shown);
    t.ok('consumables are shown', /1\/2\s*VIALS/.test(shown) && /3\s*DUST/.test(shown), shown);
    t.ok('the objective survives, without its system name',
        shown.includes('The Crypt is north'), shown);

    // Counters the player has no use for do not get a chip just because the
    // value exists. `Keys: 0/3` was on screen for the whole first dungeon.
    const empty = strip(hud.el.innerHTML);
    hud.update(frame({ smallKeys: 0, hasBossKey: false, scarShards: 0, sutures: 0,
        memoryKeys: 0, vialSlots: 0, entropyCharges: null }));
    const lean = strip(hud.el.innerHTML);
    t.ok('an empty inventory shows no inventory chips',
        !/KEYS|SHARDS|VIALS|DUST|ANCHOR|SUTURE/.test(lean), lean || empty);
    t.ok('but health and weapon never go away',
        lean.includes('Bulwark Shield') && /♥/.test(hud.el.innerHTML), lean);

    // ── 3. Dev mode keeps every one of them ────────────────────────────────
    hud.update(frame({ dev: true }));
    const devText = String(hud.devEl.textContent);
    t.ok('dev mode renders its own panel', hud.devEl.style.display === 'block',
        hud.devEl.style.display);
    t.ok('dev mode still has the beat id', devText.includes('beat-01-crypt'), devText);
    t.ok('dev mode still has the mood preset', /mood\s+crust/.test(devText), devText);
    t.ok('dev mode still has the boss counter', devText.includes('0/14'), devText);
    t.ok('dev mode still has raw hp', /hp\s+4\/6/.test(devText), devText);
    t.ok('dev mode still has the poise numbers', /poise\s+2\/3/.test(devText), devText);
    t.ok('dev mode still has the score', devText.includes('1200'), devText);
    // And it is not leaking the other way.
    hud.update(frame({ dev: false }));
    t.ok('dev panel disappears with dev mode off', hud.devEl.style.display === 'none',
        hud.devEl.style.display);

    // ── 4. The gate does not outlaw prose ──────────────────────────────────
    // An objective is written by the narrative and may legitimately contain any
    // of these words. A gate that made this sentence unshippable would be
    // replaced within a week, and rightly.
    const hostile = 'Beat: the Warden. Your Mood: unclear. Witness: nothing. '
        + 'Bosses: 0/14 remain, and the Thread: is yours.';
    hud.update(frame({ thread: hostile }));
    const withProse = strip(hud.el.innerHTML).replace(hostile, '');
    for (const rx of DEV_ONLY) {
        t.ok(`hostile objective text does not trip ${rx.source}`,
            !rx.test(withProse), withProse);
    }
    t.ok('and the hostile objective is still displayed in full',
        strip(hud.el.innerHTML).includes('the Thread: is yours'), '');

    // ── 5. The legend is not permanent ─────────────────────────────────────
    t.ok('the control legend starts hidden', hud.helpEl.style.opacity === '0',
        hud.helpEl.style.opacity);
    hud.setHelpVisible(true);
    t.ok('and appears when asked for', hud.helpEl.style.opacity === '1',
        hud.helpEl.style.opacity);
    hud.setHelpVisible(false);
    t.ok('and goes away again', hud.helpEl.style.opacity === '0', hud.helpEl.style.opacity);
    // The title screen must never leave it stranded on screen.
    hud.setHelpVisible(true);
    hud.update(frame({ hidden: true }));
    t.ok('the title screen takes the legend down with the rest of the chrome',
        hud.helpEl.style.opacity === '0', hud.helpEl.style.opacity);
}
