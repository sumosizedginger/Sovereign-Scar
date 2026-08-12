// tests/game/boss-action-census.spec.mjs — the instrument that counts bosses
// must count BOTH ways a boss can have a move.
//
// This spec exists because `content-density.mjs` printed "CryptWarden — 0
// action(s)" for a session and nothing anywhere went red. The probe counted
// `this.startAction(` call sites; `BossBase` had grown a second architecture
// (`defineActions` → `chooseAction` → `actIfReady`) and the Warden had moved
// onto it, so its three moves live in a declaration list and are committed for
// it inside base.js. Zero call sites in its own body. Zero reported.
//
// A probe cannot go red on its own, so this is the alarm for it.
//
// THE FIXTURES ARE NOT THE POINT — THE ROSTER IS
//
// Two hand-written class bodies below pin each architecture in isolation, and
// they are genuinely useful: they are the only place the "both mechanisms at
// once" and "same move named twice" cases exist, because no shipped boss does
// either yet. But a spec made ONLY of fixtures tests my idea of the code
// (trap: "wire the alarm to the building"), so the last section reads the REAL
// roster files and pins the real Warden and a real old-architecture boss. If
// someone migrates another boss and the counter stops seeing it, that section
// fails, not the fixtures.

import fs from 'node:fs';
import path from 'node:path';
import { actionsInClassBody, censusFile } from '../qa/lib/boss-actions.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── Fixtures ───────────────────────────────────────────────────────────────
// Written in the shape the real files use, including the trap that broke the
// old probe: the DECLARED entries carry a nested `build: () => ({ name: … })`,
// so a naive count of `name:` occurrences reads double.

const OLD_ARCHITECTURE = `
export class OldBoss extends BossBase {
    tickAI(player, d) {
        if (d < 3) {
            this.startAction({
                name: 'lunge',
                windup: 0.5,
                aim: (p) => ({ x: p.x, z: p.z, radius: 2 }),
                strike: (p) => this.hitPlayer(p, 1),
            });
            return;
        }
        this.startAction({ name: 'spit', windup: 0.8, strike: () => {} });
    }
}
`;

const NEW_ARCHITECTURE = `
export class NewBoss extends BossBase {
    constructor(scene, position) {
        super(scene, { id: 'new', phaseThresholds: [0.5] });
        this.defineActions([
            {
                name: 'slam',
                weight: 3,
                range: [0, 9],
                build: () => ({
                    name: 'slam',
                    windup: 0.75,
                    aim: (p) => ({ x: p.x, z: p.z, radius: 2.4 }),
                    strike: () => {},
                }),
            },
            {
                name: 'sweep',
                weight: 2,
                build: () => ({ name: 'sweep', windup: 0.45, strike: () => {} }),
            },
            {
                name: 'ground-crack',
                phase: 2,
                build: () => ({ name: 'ground-crack', windup: 1.0, strike: () => {} }),
            },
        ]);
    }
    tickAI(player, d) { this.actIfReady(player, d); }
}
`;

// A boss doing both at once. None ship like this; the union rule has to hold
// anyway, or the first migration that half-lands double-counts.
const MIXED = `
export class MixedBoss extends BossBase {
    constructor() {
        super();
        this.defineActions([
            { name: 'slam', build: () => ({ name: 'slam' }) },
            { name: 'sweep', build: () => ({ name: 'sweep' }) },
        ]);
    }
    tickAI(p, d) {
        this.actIfReady(p, d);
        // A scripted opener that bypasses the chooser — still a move.
        if (this.phase === 3) this.startAction({ name: 'finisher', windup: 2 });
        // The SAME move, committed from a second branch. One move, not two.
        if (this.enraged) this.startAction({ name: 'slam', windup: 0.4 });
    }
}
`;

// Braces and quotes inside strings and comments must not close a region early.
const HOSTILE = `
export class AwkwardBoss extends BossBase {
    tickAI() {
        // this.startAction({ name: 'commented-out' })
        const label = "a { brace } and a ' quote";
        const tpl = \`phase \${this.phase} of {n}\`;
        this.startAction({ name: 'real', windup: 0.5 });
    }
}
`;

export function run(t) {
    // ── 1. Each architecture, alone ────────────────────────────────────────
    {
        const old = actionsInClassBody(OLD_ARCHITECTURE);
        t.ok('old architecture: both startAction sites counted',
            old.names.length === 2 && old.names.includes('lunge') && old.names.includes('spit'),
            old.names.join(','));
        t.ok('old architecture: nothing is reported as declared',
            old.declared.length === 0, old.declared.join(','));
    }
    {
        const neu = actionsInClassBody(NEW_ARCHITECTURE);
        // The number that was 0 before this fix.
        t.ok('new architecture: all three declared moves counted',
            neu.names.length === 3, neu.names.join(','));
        t.ok('new architecture: named correctly, not by position',
            ['slam', 'sweep', 'ground-crack'].every((n) => neu.names.includes(n)),
            neu.names.join(','));
        // The nested `build: () => ({ name: … })` is the same string; a probe
        // that counts `name:` occurrences reads 6 here.
        t.ok('new architecture: the nested build() name is not a second move',
            neu.declared.length === 3, `${neu.declared.length} declared`);
        t.ok('new architecture: nothing is reported as staged',
            neu.staged.length === 0, neu.staged.join(','));
    }

    // ── 2. Both at once, and the same move twice ───────────────────────────
    {
        const mixed = actionsInClassBody(MIXED);
        t.ok('mixed: declared and staged are unioned, not summed',
            mixed.names.length === 3, mixed.names.join(','));
        t.ok('mixed: a move committed from two branches counts once',
            mixed.names.filter((n) => n === 'slam').length === 1, mixed.names.join(','));
        t.ok('mixed: the scripted opener is still a move',
            mixed.names.includes('finisher'), mixed.names.join(','));
    }

    // ── 3. Braces where they do not belong ─────────────────────────────────
    {
        const awk = actionsInClassBody(HOSTILE);
        t.ok('a commented-out action is not counted, a real one is',
            awk.names.length === 1 && awk.names[0] === 'real', awk.names.join(','));
    }

    // ── 4. The real roster — the part that is not my own invention ─────────
    {
        const roster = censusFile(rd('src/game/bosses/roster.js'), 'roster.js');
        const byName = Object.fromEntries(roster.map((c) => [c.name, c]));

        const warden = byName.CryptWarden;
        t.ok('roster: the Crypt Warden is found at all', !!warden, Object.keys(byName).join(','));
        // The regression itself. This read 0 before the counter learned the
        // second architecture, and `boss-movesets.spec.mjs` independently drives
        // the same three moves out of the live boss.
        t.ok('roster: the Crypt Warden has its three moves',
            warden && warden.names.length === 3, warden ? warden.names.join(',') : 'missing');
        t.ok('roster: and they are the three the fight actually commits',
            warden && ['slam', 'sweep', 'ground-crack'].every((n) => warden.names.includes(n)),
            warden ? warden.names.join(',') : 'missing');
        t.ok('roster: the Warden is recognised as the declared architecture',
            warden && warden.mechanism === 'declared', warden?.mechanism);

        // An unmigrated boss must not have been broken by teaching the counter
        // the new shape.
        const wyrm = byName.MagmaWyrm;
        t.ok('roster: an old-architecture boss still counts',
            wyrm && wyrm.names.length >= 3 && wyrm.mechanism === 'staged',
            wyrm ? `${wyrm.names.length} ${wyrm.mechanism}` : 'missing');

        // Every BossBase subclass in the roster has at least two moves. The
        // campaign-wide "three questions" claim is boss-movesets.spec.mjs's job
        // — it can see threats that are not staged actions. This one only
        // claims the INSTRUMENT never reads a shipped boss as empty again.
        const empty = roster.filter((c) => c.isBossBase && c.names.length === 0);
        t.ok('roster: no BossBase subclass reads as having zero moves',
            empty.length === 0, empty.map((c) => c.name).join(',') || 'none');

        // The Tri-Compiler is a real fight that this instrument CANNOT measure.
        // Pinned so it stays visible rather than silently vanishing from the
        // census the way it did before.
        const tri = byName.TriCompiler;
        t.ok('roster: the Tri-Compiler is still surfaced as unmeasurable',
            tri && !tri.isBossBase, tri ? `extends ${tri.superClass}` : 'missing');
    }
    {
        for (const f of ['src/game/bosses/sand-spur.js', 'src/game/bosses/kinetic-core.js']) {
            const bosses = censusFile(rd(f), f).filter((c) => c.isBossBase);
            t.ok(`${path.basename(f)}: its boss still counts`,
                bosses.length === 1 && bosses[0].names.length >= 2,
                bosses.map((b) => `${b.name}=${b.names.length}`).join(',') || 'none found');
        }
    }
}
