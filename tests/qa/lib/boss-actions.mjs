// tests/qa/lib/boss-actions.mjs — count a boss's committed moves from source,
// across BOTH action architectures this project now has.
//
// WHY THIS EXISTS
//
// `content-density.mjs` used to count `this.startAction(` call sites and call
// that the moveset. That was true when it was written and quietly stopped being
// true: `BossBase` grew `defineActions()` / `chooseAction()` / `actIfReady()`,
// and the Crypt Warden moved onto it. Its three moves are declared in a list and
// committed by `actIfReady` inside base.js — so ZERO `this.startAction(` call
// sites appear in the Warden's own class body, and the probe reported the boss
// that teaches the game's core lesson as having **0 actions**.
//
// Nothing failed. The probe just printed a wrong number for a session, and a
// wrong number from an instrument is worse than no instrument, because it gets
// quoted into plans. (`AAA.md` quoted it. So did a finishing plan built on it.)
//
// THE SYSTEMIC RULE, not a special case for the Warden
//
// In BOTH architectures a committed move is an object literal carrying a
// `name:`. The difference is only who calls the commit:
//
//   old   this.startAction({ name: 'lunge', windup, aim, strike })
//   new   this.defineActions([{ name: 'slam', build: () => ({ name: 'slam', … }) }])
//
// So: collect the names from both shapes and take the UNION. A boss that uses
// both mechanisms (none do today, but nothing stops one) counts each move once,
// and a boss that migrates from one to the other does not change its count.
//
// WHY SOURCE AND NOT THE RUNNING GAME
//
// The declared list can be read off a live instance (`boss.actionSet`), but the
// old architecture's moves exist only inside `tickAI` branches — there is no
// runtime list to read, and the only honest runtime count is to drive the fight
// for thousands of frames, which is what `tests/game/boss-movesets.spec.mjs`
// already does. This is a density probe; it should stay cheap. It reads the
// authored source, and `tests/game/boss-action-census.spec.mjs` pins that the
// reading agrees with the real roster.

/** Walk a `'` `"` or `` ` `` string from its opening quote; return the index of its close. */
function skipString(src, i) {
    const q = src[i];
    for (let j = i + 1; j < src.length; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (q === '`' && src[j] === '$' && src[j + 1] === '{') {
            j = balancedFrom(src, j + 1).end;   // ${ … } may contain quotes of its own
            continue;
        }
        if (src[j] === q) return j;
    }
    return src.length;
}

/**
 * Extract the balanced region starting at the opener `src[i]` (`(`, `[` or `{`),
 * skipping over strings and comments so a brace inside either cannot close it.
 * @returns {{ text: string, end: number }}
 */
export function balancedFrom(src, i) {
    const open = src[i];
    const close = { '(': ')', '[': ']', '{': '}' }[open];
    if (!close) throw new Error(`balancedFrom: '${open}' at ${i} is not an opener`);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        const c = src[j];
        if (c === '/' && src[j + 1] === '/') {
            const nl = src.indexOf('\n', j);
            if (nl < 0) break;
            j = nl;
            continue;
        }
        if (c === '/' && src[j + 1] === '*') {
            const e = src.indexOf('*/', j + 2);
            j = e < 0 ? src.length : e + 1;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') { j = skipString(src, j); continue; }
        if (c === open) depth++;
        else if (c === close) {
            depth--;
            if (depth === 0) return { text: src.slice(i, j + 1), end: j };
        }
    }
    return { text: src.slice(i), end: src.length };
}

/**
 * Blank out every comment, preserving length and newlines so indices found in
 * the stripped text still address the original.
 *
 * This is not belt-and-braces. Without it the scan below finds
 * `this.startAction(` inside a COMMENTED-OUT line and counts a move the boss
 * does not have — caught by this module's own hostile fixture, which is the
 * only reason it is here. `balancedFrom` skipped comments internally, but the
 * search that decides WHERE to start did not.
 */
export function stripComments(src) {
    let out = '';
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') {
            const nl = src.indexOf('\n', i);
            const end = nl < 0 ? src.length : nl;
            out += ' '.repeat(end - i);
            i = end - 1;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            const e = src.indexOf('*/', i + 2);
            const end = e < 0 ? src.length : e + 2;
            for (let k = i; k < end; k++) out += src[k] === '\n' ? '\n' : ' ';
            i = end - 1;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') {
            const end = skipString(src, i);
            out += src.slice(i, end + 1);
            i = end;
            continue;
        }
        out += c;
    }
    return out;
}

/** The object literals sitting directly inside an `[ … ]`, not nested ones. */
function topLevelObjects(arrayText) {
    const out = [];
    for (let j = 1; j < arrayText.length - 1; j++) {
        const c = arrayText[j];
        if (c === "'" || c === '"' || c === '`') { j = skipString(arrayText, j); continue; }
        if (c === '{') {
            const obj = balancedFrom(arrayText, j);
            out.push(obj.text);
            j = obj.end;
        }
    }
    return out;
}

/** The first `name: '…'` in a region — in both shapes that is the move's name. */
function firstName(text) {
    const m = text.match(/\bname\s*:\s*(['"])([^'"]*)\1/);
    return m ? m[2] : null;
}

/**
 * Committed moves declared in one class body.
 * @returns {{ declared: string[], staged: string[], names: string[] }}
 *   declared — via `defineActions([…])`  (chooseAction / actIfReady architecture)
 *   staged   — via a direct `this.startAction({…})` call site
 *   names    — the union, which is the boss's moveset
 */
export function actionsInClassBody(rawBody) {
    const body = stripComments(rawBody);
    const declared = [];
    const staged = [];

    for (const m of body.matchAll(/\bdefineActions\s*\(/g)) {
        const open = m.index + m[0].length - 1;
        const args = balancedFrom(body, open).text;
        const arrIdx = args.indexOf('[');
        if (arrIdx < 0) continue;
        for (const entry of topLevelObjects(balancedFrom(args, arrIdx).text)) {
            declared.push(firstName(entry) || `unnamed-${declared.length + 1}`);
        }
    }

    for (const m of body.matchAll(/this\.startAction\s*\(/g)) {
        const open = m.index + m[0].length - 1;
        const args = balancedFrom(body, open).text;
        staged.push(firstName(args) || `unnamed-${staged.length + 1}`);
    }

    return { declared, staged, names: [...new Set([...declared, ...staged])] };
}

/**
 * Every exported class in a source file, with its moveset.
 *
 * Classes that do not extend `BossBase` are RETURNED, not dropped. The old
 * probe filtered them out silently, which is how the Tri-Compiler — an actual
 * boss fight, beat 02 — disappeared from a census that then printed "across 13
 * bosses" for a fourteen-boss campaign. A fight the instrument cannot measure
 * should say so out loud.
 *
 * @returns {Array<{ name, superClass, isBossBase, declared, staged, names, phases }>}
 */
export function censusFile(raw, file = '') {
    // Stripping preserves length, so every index below still addresses `raw`.
    const src = stripComments(raw);
    const classes = [...src.matchAll(/^export class (\w+)(?:\s+extends\s+(\w+))?/gm)];
    return classes.map((c, i) => {
        const from = c.index;
        const to = i + 1 < classes.length ? classes[i + 1].index : src.length;
        const body = src.slice(from, to);
        const { declared, staged, names } = actionsInClassBody(body);
        const phaseList = (body.match(/phaseThresholds:\s*\[([^\]]*)\]/) || [])[1];
        return {
            file,
            name: c[1],
            superClass: c[2] || null,
            isBossBase: c[2] === 'BossBase',
            declared,
            staged,
            names,
            mechanism: declared.length && staged.length ? 'both'
                : declared.length ? 'declared'
                    : staged.length ? 'staged' : 'none',
            phases: phaseList
                ? phaseList.split(',').filter((s) => s.trim()).length + 1
                : 3,
        };
    });
}
