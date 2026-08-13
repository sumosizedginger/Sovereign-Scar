// tests/game/hit-sound-honesty.spec.mjs — the sound must answer the damage.
//
// THE BUG THIS EXISTS TO PIN
//
// Owner report, 2026-08-13, playing 04 Sky Monument:
//
//   "Starts as soon as I enter dungeon 4, and it's like a sound of being hit.
//    Like doot doot doot even while standing still. It's random, and started as
//    soon as I entered the dungeon."
//
// Their screenshot showed 6/6 hearts. Nothing was hitting them.
//
// The mote's burst played `sfx.hurt()` — the WOUND sound — unconditionally,
// whatever `HealthPool.damage()` returned. It returns `accepted: false` in four
// cases, and in every one of them nothing happened to the player:
//
//     this.dead                     — already gone
//     this.iFrames > 0              — still blinking from the last hit
//     damageFilter negated the hit  — BLOCKED or PARRIED
//     god mode                      — same route, via the filter
//
// The worst of those is the block, because blocking a mote is the RIGHT
// ANSWER. The design note above `MOTE_HOLD` says so in as many words: "with
// chip damage now zero, standing your ground and facing it is a genuine second
// answer." So the reward for reading a mote correctly was the sound of being
// wounded, once every 2.65 seconds, for as long as the player stood there.
//
// A mote parks at `MOTE_HOLD` 2.0 and bursts inside `MOTE_BURST` 2.6, on a
// `1.8 / actionFrequency + 0.85` cooldown. Stand inside that and it never
// stops. That is the "doot doot doot".
//
// WHY THIS IS A CLASS AND NOT A TYPO
//
// The same file's two other attacks — the melee and the projectile — already
// gate on the result. So did the boss base. Two sites in the whole codebase did
// not: this one, and fall damage in `player.js`. Both are pinned below.
//
// `sfx-bank.js:219` records this project learning the same lesson once already:
// the parry used to share the block clang, "identical feedback for its most and
// least skilful outcomes". This is that, one worse — the least skilful outcome's
// sound for the most skilful one.

import * as THREE from 'three';
import { Enemy } from '../../src/game/enemy.js';
import { HealthPool } from '../../src/game/kernel/health.js';
import { GuardController } from '../../src/game/combat/guard.js';
import { installGodDamageWrapper } from '../../src/game/dev/dev-mode.js';
import { sfx } from '../../src/audio/synth.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', '..', 'src', 'game');

/**
 * Record what the game plays, by patching the shipped `sfx` object.
 *
 * `sfx` is a plain exported object of functions, so this listens to the real
 * calls the real code makes rather than to a copy of them. RETURNS THE UNDO —
 * a spec that patches a shared module owns putting it back, or every spec after
 * it in the run inherits a silent game.
 */
function listen() {
    const heard = [];
    const originals = {};
    for (const k of Object.keys(sfx)) {
        if (typeof sfx[k] !== 'function') continue;
        originals[k] = sfx[k];
        sfx[k] = (...a) => { heard.push(k); return undefined; };
    }
    return {
        heard,
        restore() { for (const k of Object.keys(originals)) sfx[k] = originals[k]; },
    };
}

/** A player the mote can burst on: real HealthPool, real GuardController. */
function makeTarget({ facing = { x: 0, z: 1 }, guarding = false } = {}) {
    const health = new HealthPool(6);
    const guard = new GuardController();
    const rig = { position: new THREE.Vector3(0, 1.95, 0) };
    const state = { facingVec: facing };
    health.damageFilter = (hit) => guard.resolve(hit, rig.position, state.facingVec);
    return { health, guard, rig, root: rig, state };
}

/**
 * Fire one mote burst at `target` and report what was heard.
 *
 * Drives the SHIPPED `_aiDrift` through the shipped windup rather than calling
 * a copy of its resolve — the whole failure was in which branch that resolve
 * takes, so a spec that reimplemented it would be testing itself.
 */
function burst(target, at = { x: 0, y: 1.95, z: 2.2 }, holdGuard = false) {
    const mote = new Enemy(new THREE.Scene(), null, at, { kind: 'mote', hp: 3 });
    const ear = listen();
    try {
        const dx = target.rig.position.x - at.x;
        const dz = target.rig.position.z - at.z;
        const dist = Math.hypot(dx, dz);
        mote.attackCd = 0;
        mote._aiDrift(1 / 60, target, dx, dz, dist);
        // `_beginWindup` sets `_windupT`, and `update(dt, player)` counts it
        // down and fires `_pendingStrike`. Driving the real `update` is the
        // point — the failure was in which branch the resolve takes, so a spec
        // that called the resolve directly would be testing its own arithmetic.
        const scheduled = mote._windupT > 0;
        for (let i = 0; i < 300 && mote._windupT > 0; i++) {
            // The guard is LEVEL-triggered: holding it means calling update
            // with `held` every frame. Not stepping it froze `parryT` at
            // whatever it was when the burst started, so a case meant to test a
            // BLOCK was quietly testing a parry — the window is 0.3s and the
            // mote's windup is 0.85s, so in play it has long since closed.
            if (holdGuard) target.guard.update(1 / 60, true);
            mote.update(1 / 60, target);
        }
        return {
            heard: [...ear.heard],
            hp: target.health.hp,
            scheduled,
            resolved: scheduled && mote._windupT <= 0 && mote._pendingStrike == null,
        };
    } finally {
        ear.restore();
    }
}

export function run(t) {
    // ── 0. THE FIXTURE MUST BE ABLE TO HEAR ────────────────────────────────
    // Every assertion below is "this sound did not play", which is also what a
    // listener attached to nothing reports.
    {
        const ear = listen();
        sfx.hurt();
        sfx.block();
        ear.restore();
        t.ok('the listener hears the shipped sfx object',
            ear.heard.join(',') === 'hurt,block', ear.heard.join(',') || 'nothing');
        t.ok('…and puts it back', typeof sfx.hurt === 'function' && sfx.hurt.length === 0
            || typeof sfx.hurt === 'function', 'restored');
    }

    // ── 1. A LANDED BURST STILL SOUNDS LIKE A WOUND ────────────────────────
    // The counterfactual for everything below: silence the sound entirely and
    // this is the assertion that goes red.
    {
        const target = makeTarget();
        const r = burst(target);
        // THE FIXTURE HAS TO ACTUALLY FIRE. Every "did not play" assertion below
        // also passes when nothing resolved at all — which is exactly what
        // happened on the first run of this spec: the driver watched the wrong
        // field, no strike ever landed, and four negatives went green for the
        // wrong reason. Only this positive case caught it.
        t.ok('the burst was scheduled', r.scheduled, 'windup started');
        t.ok('the burst resolved', r.resolved, 'pending strike fired');
        t.ok('a burst that lands plays the wound sound',
            r.heard.includes('hurt'), r.heard.join(',') || 'silence');
        t.ok('…and actually costs health', r.hp < 6, `hp ${r.hp}`);
    }

    // ── 2. I-FRAMES: THE REPORTED SYMPTOM ──────────────────────────────────
    // A second burst inside the i-frames of the first did nothing and said
    // otherwise. This is the shape of "doot doot doot at 6/6".
    {
        const target = makeTarget();
        target.health.iFrames = 0.7;
        const r = burst(target);
        t.ok(`${''}the burst resolved (guard case)`, r.resolved, 'pending strike fired');
        t.ok('a burst during i-frames costs nothing', r.hp === 6, `hp ${r.hp}`);
        t.ok('…and is silent, not a wound',
            !r.heard.includes('hurt'), r.heard.join(',') || 'silence');
    }

    // ── 3. GOD MODE: WHAT THE OWNER'S SCREENSHOT SHOWED ────────────────────
    // DEV · GOD was enabled in the report. God mode routes through the same
    // refusal, so the noise ran forever with the health bar full.
    {
        const target = makeTarget();
        // THE REAL WRAPPER, not a filter that returns `negated`. God mode does
        // not short-circuit — it pins both damage multipliers to zero and runs
        // the whole path, precisely so a parry still resolves. `dev-mode.js`
        // exports this dependency-free for exactly this reason, and my first
        // version of this case invented a negating filter instead: a fixture
        // that mimes the feature answers questions about the mime.
        installGodDamageWrapper(target.health, () => true);
        const r = burst(target);
        t.ok(`${''}the burst resolved (guard case)`, r.resolved, 'pending strike fired');
        t.ok('a burst under god mode costs nothing', r.hp === 6, `hp ${r.hp}`);
        t.ok('…and does not play the wound sound',
            !r.heard.includes('hurt'), r.heard.join(',') || 'silence');
    }

    // ── 4. THE BLOCK — THE ONE THAT MATTERS ────────────────────────────────
    // Blocking a mote is the documented right answer. It must not sound like
    // failing to.
    {
        // A REAL RAISED GUARD, resolved by the real `GuardController` through
        // the real arc check — the mote is at +z and the target faces +z, so
        // the burst lands on the shield. `GUARD_CHIP` is 0, so `dealt` reaches
        // zero and the pool answers `accepted: false, blocked: true`.
        const target = makeTarget();
        target.guard.update(1 / 60, true);
        // Past the 0.3s parry window, so this is a BLOCK and not a parry.
        for (let i = 0; i < 30; i++) target.guard.update(1 / 60, true);
        const r = burst(target, { x: 0, y: 1.95, z: 2.2 }, true);
        t.ok('the fixture actually has its guard up', target.guard.raised, 'raised');
        t.ok('…and is past the parry window, so this is a block',
            target.guard.parryT <= 0, `parryT ${target.guard.parryT}`);
        t.ok('…and the guard recorded a block', target.guard.blocks > 0,
            `blocks ${target.guard.blocks}`);
        t.ok(`${''}the burst resolved (guard case)`, r.resolved, 'pending strike fired');
        t.ok('a blocked burst costs nothing', r.hp === 6, `hp ${r.hp}`);
        t.ok('a blocked burst does NOT sound like a wound',
            !r.heard.includes('hurt'), r.heard.join(',') || 'silence');
        t.ok('a blocked burst sounds like a block',
            r.heard.includes('block'), r.heard.join(',') || 'silence');
    }

    // ── 5. THE PARRY KEEPS ITS OWN SOUND, AND ONLY ITS OWN ─────────────────
    // `player.js`'s `guard.onParry` already plays `gsfx.parry()`. Adding a
    // second sound here would stack on top of the best cue in the game — which
    // is the failure `sfx-bank.js:219` describes, running the other way.
    {
        // A REAL parry: raise the guard this frame so the parry window is open.
        const target = makeTarget();
        let parried = false;
        target.guard.onParry = () => { parried = true; };
        target.guard.update(1 / 60, true);
        const r = burst(target, { x: 0, y: 1.95, z: 2.2 }, false);
        t.ok('the fixture actually parried', parried, 'guard.onParry fired');
        t.ok('a parried burst plays neither wound nor block here',
            !r.heard.includes('hurt') && !r.heard.includes('block'),
            r.heard.join(',') || 'silence');
    }

    // ── 6. THE WHOLE CLASS, SWEPT ──────────────────────────────────────────
    // Two sites in the codebase called a hurt sound without reading the answer.
    // This is the alarm for the other one, and for any third.
    {
        const files = ['enemy.js', 'player.js', path.join('bosses', 'base.js')];
        const offenders = [];
        for (const f of files) {
            const src = fs.readFileSync(path.join(SRC, f), 'utf8');
            // `health.damage(...)` whose result is discarded, with a hurt sound
            // within the next few lines.
            const re = /(?:^|\n)([^\n]*\bhealth\.damage\([\s\S]{0,220}?\)\s*;)([\s\S]{0,120}?)(v?sfx\.hurt\(\))/g;
            let m;
            while ((m = re.exec(src)) !== null) {
                const call = m[1];
                const between = m[2];
                // Assigned to something, or already guarded on the result?
                const capturesResult = /(?:const|let|var)\s+\w+\s*=\s*[\s\S]*health\.damage\(/.test(call);
                const guarded = /\b(?:res|r)\??\.accepted/.test(between)
                    || /\baccepted\b/.test(between);
                if (!capturesResult || !guarded) offenders.push(`${f}: ${call.trim().slice(0, 60)}`);
            }
        }
        t.ok('no damage call discards its answer and then plays a hurt sound',
            offenders.length === 0, offenders.join(' | ') || 'clean');
    }

    // ── 7. FALL DAMAGE, THE OTHER SITE ─────────────────────────────────────
    // Same defect, different file: a landing under god mode or inside i-frames
    // played the wound sound. Read at source because driving a real fall needs
    // a real world, which `fall-anchor.spec.mjs` already owns.
    {
        const src = fs.readFileSync(path.join(SRC, 'player.js'), 'utf8');
        t.ok('fall damage reads its answer before it plays a sound',
            /const res = this\.health\.damage\(result\.damage[\s\S]{0,120}?if \(res\.accepted\) vsfx\.hurt\(\)/
                .test(src),
            'player.js landing branch');
    }
}
