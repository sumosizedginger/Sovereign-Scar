// Combat readability + survivability.
//
// Guards the three things that made the game feel unfair in playtest: enemy
// hits landed instantly with no tell and no way to dodge, and there was no
// way to recover hearts. Also pins the A Link to the Past facing model.

import * as THREE from 'three';
import { Enemy } from '../../src/game/enemy.js';
import { HeartDrop, HeartDropManager } from '../../src/game/world/heart-drops.js';
import { Player } from '../../src/game/player.js';
import { CollisionWorld } from '../../src/engine/collision.js';
import { BossBase } from '../../src/game/bosses/base.js';

/** A player stand-in with the surface Enemy actually touches. */
function fakePlayer(x = 0, z = 0, hp = 6) {
    return {
        root: { position: { x, y: 1, z } },
        health: {
            hp, max: 6, dead: false, iFrames: 0,
            get invulnerable() { return this.iFrames > 0 || this.dead; },
            damage(n) {
                if (this.iFrames > 0 || this.dead) {
                    return { accepted: false, hp: this.hp };
                }
                this.hp -= n;
                this.iFrames = 0.9;
                return { accepted: true, hp: this.hp };
            },
            heal(n) { this.hp = Math.min(this.max, this.hp + n); return this.hp; },
        },
    };
}

/** Tick an enemy for `seconds` at a fixed step. */
function tick(enemy, player, seconds, step = 0.05, onStep) {
    for (let t = 0; t < seconds; t += step) {
        enemy.update(step, player);
        if (onStep) onStep(t);
    }
}

export function run(t) {
    const scene = new THREE.Scene();

    // ── Telegraph: a melee enemy must not damage on contact alone ─────────
    {
        const p = fakePlayer(1, 0);
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        // One frame in range: the old code damaged here immediately.
        e.update(0.05, p);
        t.ok('no instant damage on the frame an enemy reaches you',
            p.health.hp === 6, `hp=${p.health.hp}`);
        t.ok('windup is running', e._windupT > 0, `windup=${e._windupT}`);
        t.ok('a telegraph ring is on the ground', !!e._tell);
        e.dispose();
    }

    // ── The strike does land if you stand in it ──────────────────────────
    {
        const p = fakePlayer(1, 0);
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        tick(e, p, 1.0);
        t.ok('standing in the telegraph gets you hit',
            p.health.hp < 6, `hp=${p.health.hp}`);
        e.dispose();
    }

    // ── Avoidance by walking out during the windup ───────────────────────
    {
        const p = fakePlayer(1, 0);
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        e.update(0.05, p); // commits the strike
        p.root.position.x = 6; // walk clear while it winds up
        tick(e, p, 0.8);
        t.ok('walking out of the telegraph makes the strike whiff',
            p.health.hp === 6, `hp=${p.health.hp}`);
        e.dispose();
    }

    // ── Avoidance by i-frames (dash) ─────────────────────────────────────
    {
        const p = fakePlayer(1, 0);
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        e.update(0.05, p);
        p.health.iFrames = 5; // dashing through it
        tick(e, p, 0.8);
        t.ok('i-frames absorb a strike you cannot outrun',
            p.health.hp === 6, `hp=${p.health.hp}`);
        e.dispose();
    }

    // ── The windup is long enough to actually react to ───────────────────
    {
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        t.ok('windup leaves reaction time', e.windup >= 0.35, `windup=${e.windup}`);
        e.dispose();
    }

    // ── Charger telegraphs before it commits to a lane ────────────────────
    {
        const p = fakePlayer(6, 0);
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'scarab' });
        e.update(0.05, p);
        t.ok('charge winds up before launching', e._windupT > 0 && e._chargeT === 0,
            `windup=${e._windupT} charge=${e._chargeT}`);
        t.ok('charge shows a telegraph', !!e._tell);
        e.dispose();
    }

    // ── Ranged enemy aims before firing ──────────────────────────────────
    {
        const p = fakePlayer(6, 0);
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'frost' });
        e.update(0.05, p);
        t.ok('ranged winds up before shooting',
            e._windupT > 0 && e.projectiles.length === 0);
        tick(e, p, 0.9);
        t.ok('ranged does fire after the windup', e.projectiles.length > 0,
            `n=${e.projectiles.length}`);
        e.dispose();
    }

    // ── Dead enemies drop their telegraph ────────────────────────────────
    {
        const p = fakePlayer(1, 0);
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        e.update(0.05, p);
        e.state.current = 'DEAD';
        e.update(0.05, p);
        t.ok('killing a winding-up enemy clears its telegraph', !e._tell);
        e.dispose();
    }

    // ── Telegraphs must be ABOVE the floor, or they warn nobody ──────────
    // Room floors have their top face at y = 1. Rings were previously pinned
    // at an absolute y ≈ 0.08, i.e. buried a full unit underground.
    {
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        e.telegraphAt(0, 0, 1.5, 0.5);
        t.ok('enemy telegraph sits on top of the floor, not under it',
            e._tell.position.y > 1.0, `y=${e._tell.position.y}`);
        e.dispose();
    }
    {
        const boss = new BossBase(scene, {
            id: 'test', name: 'Test', position: { x: 0, y: 1.2, z: 0 },
            mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)),
        });
        boss.telegraphAt(0, 0, 3, 1);
        t.ok('boss telegraph sits on top of the floor, not under it',
            boss._telegraph.position.y > 1.0, `y=${boss._telegraph.position.y}`);
        boss.clearTelegraph();
    }

    // ── Heart drops ──────────────────────────────────────────────────────
    {
        const p = fakePlayer(0, 0, 2);
        const h = new HeartDrop(scene, 0, 1, 0, 1);
        h.update(0.05, p);
        t.ok('walking over a heart heals', p.health.hp === 3, `hp=${p.health.hp}`);
        t.ok('the heart is consumed', h.taken === true);
    }
    {
        const p = fakePlayer(0, 0, 6);
        const h = new HeartDrop(scene, 0, 1, 0, 1);
        const kept = h.update(0.05, p);
        t.ok('a full-health player leaves the heart for later',
            kept === true && h.taken === false);
        h.dispose();
    }
    {
        const p = fakePlayer(50, 50, 2);
        const h = new HeartDrop(scene, 0, 1, 0, 1);
        h.update(0.05, p);
        t.ok('hearts do not vacuum across the room', p.health.hp === 2);
        h.dispose();
    }
    {
        const p = fakePlayer(50, 50, 2);
        const h = new HeartDrop(scene, 0, 1, 0, 1);
        h.life = 0.05;
        const kept = h.update(0.1, p);
        t.ok('uncollected hearts expire', kept === false);
        h.dispose();
    }

    // ── Drop manager rolls exactly once per corpse ────────────────────────
    {
        const mgr = new HeartDropManager(scene);
        const p = fakePlayer(50, 50, 1);
        const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
        e.state.current = 'DEAD';
        // Force every roll to succeed, otherwise "<= 1 drop" passes trivially
        // on a run where nothing dropped at all and proves nothing.
        const realRandom = Math.random;
        Math.random = () => 0;
        try {
            for (let i = 0; i < 20; i++) mgr.update(0.016, [e], p);
        } finally {
            Math.random = realRandom;
        }
        t.ok('a corpse is rolled once, not every frame',
            mgr.drops.length === 1, `drops=${mgr.drops.length}`);
        t.ok('the kill was actually processed', e._heartRolled === true);
        mgr.clear();
        e.dispose();
    }
    {
        // A badly hurt player must have a real chance of relief.
        const mgr = new HeartDropManager(scene);
        const hurt = fakePlayer(50, 50, 1);
        let drops = 0;
        for (let i = 0; i < 400; i++) {
            const e = new Enemy(scene, null, { x: 0, y: 1, z: 0 }, { kind: 'sentinel' });
            if (mgr.rollForKill(e, hurt)) drops++;
            e.dispose();
        }
        t.ok('hurt players get hearts often enough to matter',
            drops > 120 && drops < 360, `drops=${drops}/400`);
        mgr.clear();
    }

    // ── Facing follows movement, never the mouse ─────────────────────────
    {
        const cw = new CollisionWorld();
        const player = new Player(scene, cw, () => false);
        const input = {
            moveVector: () => ({ x: 1, z: 0 }),
            padAim: null,
            mouse: { x: 0, y: 0, down: false }, // cursor hard left — must not matter
            consumeAttack: () => false,
            consumeDash: () => false,
            consumeWeaponCycle: () => 0,
        };
        player.update(0.05, input, [], [], null, null);
        t.ok('walking right faces right', player.state.facingVec.x > 0.9,
            JSON.stringify(player.state.facingVec));

        input.moveVector = () => ({ x: 0, z: -1 });
        player.update(0.05, input, [], [], null, null);
        t.ok('walking up faces up', player.state.facingVec.z < -0.9,
            JSON.stringify(player.state.facingVec));

        // Standing still holds the last facing (LttP: no strafing, no drift)
        input.moveVector = () => ({ x: 0, z: 0 });
        player.update(0.05, input, [], [], null, null);
        t.ok('standing still keeps your facing', player.state.facingVec.z < -0.9,
            JSON.stringify(player.state.facingVec));

        t.ok('mouse aim is gone entirely',
            typeof player.aimAtScreen === 'undefined');
        player.dispose();
    }

    // ── Dash gives a usable dodge window ─────────────────────────────────
    {
        const cw = new CollisionWorld();
        const player = new Player(scene, cw, () => false);
        player.tryDash();
        t.ok('dash i-frames are long enough to dodge with',
            player.health.iFrames >= 0.3, `iFrames=${player.health.iFrames}`);
        player.dispose();
    }
}
