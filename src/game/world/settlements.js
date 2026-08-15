// @ts-check
// Phase E3 — the people.
//
// THE HOLE THIS FILLS
//
// Zero NPCs. Forty-nine overworld screens, ninety-nine dungeon rooms, and not
// one person in any of them. Beat 09 is called *Ruined Town* and has nobody in
// it — the world has nothing it is ruined FOR. Thirty-six of forty-nine
// overworld screens contain nothing but enemies and terrain.
//
// This is the cheapest emotional content in the whole plan, and that is not a
// slight on it: the actor rig, the procedural animator, the story panel and the
// interact verb all already exist and are all already tested. What was missing
// was somebody to point them at.
//
// WHAT IT DELIBERATELY IS NOT
//
// No dialogue trees. No quest log. No shop UI beyond what the altar already
// does. A speaking NPC here is one figure, one interact prompt, and two or
// three lines through the panel the bosses already talk through — because a
// survivor who says one true thing about the road ahead is worth more than a
// branching conversation about nothing, and because a dialogue system is a
// month of work that would then need content anyway.
//
// THE DEAD OF BEAT 09
//
// Silent figures, frozen mid-task, that do not speak and cannot be interacted
// with. A phantasm dungeon called *What the Town Forgot* is asking for exactly
// that, and the restraint is the point: the moment one of them turns around,
// it is a jump scare instead of a place.

import * as THREE from 'three';
import { createActorRig } from '../characters/actor-rig.js';
import { createActorAnimator } from '../characters/actor-animator.js';
import { CRUST_COLORS } from '../assets/palettes.js';

/** Weathered, dust-coloured, and deliberately unlike every enemy palette. */
export const CIVILIAN_PALETTE = {
    skin: 0xb09070, skinDark: 0x7a6048, skinD2: 0x4c3c2c,
    hair: 0x4a3a28, hairDark: 0x241c10, hairLight: 0x6a5638,
    belt: 0x8a6830, beltDark: 0x54401c,
    // The one thing that makes them read as PEOPLE from a camera 17 units up:
    // every hostile in this game has a hot rim (red, green, violet, ice). A
    // civilian's is warm and dim, so "is that a threat" is answerable before
    // you are in range of it.
    eyeGlow: 0xffd9a0,
    freck: 0x9a7c5c, beard: 0x4a3a28, beardDark: 0x241c10,
    eyeWhite: 0xf0e8d8, pupil: 0x1c1408, brow: 0x4a3a28,
    mouth: 0x50281c, teeth: 0xe0d8c0,
};

/** The dead of beat 09: the same body with every warm colour drained out. */
export const HUSK_PALETTE = {
    ...CIVILIAN_PALETTE,
    skin: 0x8a8a90, skinDark: 0x5a5a60, skinD2: 0x3a3a40,
    hair: 0x44444a, hairDark: 0x22222a, hairLight: 0x5e5e66,
    belt: 0x50505a, beltDark: 0x303038,
    eyeGlow: 0x707880,
    freck: 0x76767e, beard: 0x44444a, beardDark: 0x22222a,
    eyeWhite: 0xc0c0c8, pupil: 0x101014, brow: 0x44444a,
    mouth: 0x3a3038, teeth: 0xb0b0b8,
};

/**
 * One standing figure. Returns `{ root, animator, update, dispose }`.
 *
 * `idle` is the only animation state it ever has, and that is a decision rather
 * than a shortcut: an NPC that walks needs pathing, collision and a reason to
 * be somewhere else, and none of those make the world feel more lived in than a
 * person standing at a fire does.
 */
export function makeFigure(scene, { x, z, y = 1.0, facing = 0, palette = CIVILIAN_PALETTE, frozen = false }) {
    const actor = createActorRig({
        palette,
        meshScale: 0.33,
        torsoProfileScale: 0.66,
        headProfileScale: 0.86,
        clothingMode: 'casual',
        groundOffset: 0,
    });
    const root = actor.root;
    root.position.set(x, y, z);
    root.rotation.y = facing;
    scene.add(root);
    const animator = createActorAnimator(actor, { archetype: 'sentinel' });
    // A husk is a still photograph. Posed once, then never ticked — the breath
    // cycle is exactly what would make it look alive.
    if (!frozen) {
        animator.setLocomotion({ speed: 0, wishX: 0, wishZ: 0, grounded: true });
    }
    return {
        root,
        actor,
        animator,
        frozen,
        update(dt) {
            if (frozen) return;
            animator.update(dt);
        },
        // ONE owner of removal. This used to detach the root here as well, and
        // `createActorRig`'s own `dispose` already does it — so the counterfactual
        // that deleted this line proved nothing, because the other line still
        // cleaned up. Two lines doing one job is a test you cannot write.
        dispose() {
            actor.dispose?.();
        },
    };
}

/** A fire: the light, the flicker, and the reason to stop walking. */
export function makeFire(scene, { x, z, y = 1.0 }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const stones = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.15, 0.3, 12),
        new THREE.MeshStandardMaterial({ color: CRUST_COLORS.slateDark, roughness: 0.95 })
    );
    stones.position.y = 0.15;
    group.add(stones);
    const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 1.0, 8),
        new THREE.MeshStandardMaterial({
            color: 0xffb050, emissive: 0xff8020, emissiveIntensity: 2.2,
            roughness: 0.4, transparent: true, opacity: 0.9,
        })
    );
    flame.position.y = 0.75;
    group.add(flame);
    const light = new THREE.PointLight(0xffa040, 6, 11);
    light.position.y = 1.1;
    group.add(light);
    scene.add(group);
    let t = Math.random() * 6;
    return {
        root: group,
        update(dt) {
            t += dt;
            // Two frequencies, not one. A single sine reads as a pulsing lamp;
            // the beat between two makes it read as a flame.
            const f = 1 + Math.sin(t * 7.3) * 0.09 + Math.sin(t * 3.1) * 0.05;
            flame.scale.set(1, f, 1);
            light.intensity = 6 * f;
        },
        dispose() {
            if (group.parent) group.parent.remove(group);
            stones.geometry.dispose(); stones.material.dispose();
            flame.geometry.dispose(); flame.material.dispose();
        },
    };
}

/**
 * The three settlements, keyed by overworld screen.
 *
 * Placed in the regions the world already names: the Tombfields (the country
 * around beats 01-02), the Sinklands (the dust flats you cross to reach the
 * middle), and Bonetown (the south, where the ruined town is). One each,
 * because three places that are worth stopping at is a world with people in it
 * and eight is a theme park.
 */
export const SETTLEMENTS = {
    r1c1: {
        id: 'tombfields-camp',
        name: 'Ash Rest',
        // Standing figures, and one of them talks.
        speaker: {
            x: 2, z: -2, facing: Math.PI,
            lines: [
                { speaker: 'KEEPER OF ASH REST', text: 'You are walking toward the Crypt. Everyone does, once.' },
                { speaker: 'KEEPER OF ASH REST', text: 'The thing inside it does not hurry. Neither should you — read the wind-up, and it is a slow old machine with a slow old idea.' },
            ],
        },
        crowd: [
            { x: -2.5, z: -1.5, facing: 1.2 },
            { x: -1.0, z: 2.6, facing: -0.6 },
            { x: 3.2, z: 2.0, facing: 2.4 },
            { x: -3.6, z: 1.2, facing: 0.3 },
            { x: 1.4, z: 3.4, facing: -2.0 },
        ],
    },
    r3c1: {
        id: 'sinklands-camp',
        name: 'The Long Sink',
        speaker: {
            x: -2, z: 2, facing: 0.4,
            lines: [
                { speaker: 'SURVEYOR', text: 'Sinklands. Nothing grows, nothing stays, and the ground gives if you stand still on it.' },
                { speaker: 'SURVEYOR', text: 'If you found the engineer and cut them loose — they came through here. Went east. Said thank you, which nobody does any more.' },
            ],
        },
        crowd: [
            { x: 1.8, z: 1.0, facing: -1.1 },
            { x: 3.0, z: -1.8, facing: 2.2 },
            { x: -0.6, z: -2.8, facing: 0.8 },
            { x: -3.2, z: -0.4, facing: 1.9 },
            { x: 2.2, z: 3.2, facing: -2.6 },
            { x: -1.4, z: 4.0, facing: 0.1 },
        ],
    },
    r5c3: {
        id: 'bonetown-camp',
        name: 'Below the Bone Forest',
        speaker: {
            x: 0, z: -3, facing: 0,
            lines: [
                { speaker: 'LAST OF THE TOWN', text: 'The town is up the road. Do not talk to anybody in it.' },
                { speaker: 'LAST OF THE TOWN', text: 'They are all still there, doing the last thing they were doing. That is what it took from them — not their lives. Their afternoon.' },
            ],
        },
        crowd: [
            { x: -2.8, z: -0.6, facing: 1.4 },
            { x: 2.6, z: 0.2, facing: -1.4 },
            { x: -1.2, z: 2.4, facing: 0.2 },
            { x: 1.6, z: 3.0, facing: -0.4 },
            { x: 4.0, z: -2.2, facing: 2.8 },
            { x: -4.0, z: 1.8, facing: -2.2 },
            { x: 0.4, z: 4.2, facing: 3.0 },
        ],
    },
};

/** Distance at which the interact prompt appears. */
export const TALK_RANGE = 3.2;

/**
 * Build a settlement into a level, at a world origin.
 *
 * Returns a system (`{ update, dispose }`) — the level owns the lifetime, the
 * same way it owns every other prop, so a screen that unloads takes its people
 * with it.
 */
export function addSettlement(level, ctx, origin, def) {
    const scene = ctx.scene;
    const parts = [];
    const fire = makeFire(scene, { x: origin.x, z: origin.z });
    parts.push(fire);
    for (const c of def.crowd || []) {
        parts.push(makeFigure(scene, {
            x: origin.x + c.x, z: origin.z + c.z, facing: c.facing,
        }));
    }
    let speaker = null;
    if (def.speaker) {
        speaker = makeFigure(scene, {
            x: origin.x + def.speaker.x,
            z: origin.z + def.speaker.z,
            facing: def.speaker.facing,
        });
        parts.push(speaker);
    }

    let promptCd = 0;
    let spoken = false;
    const sx = origin.x + (def.speaker?.x || 0);
    const sz = origin.z + (def.speaker?.z || 0);
    return {
        id: def.id,
        parts,
        update(dt, game) {
            for (const p of parts) p.update?.(dt);
            if (!def.speaker || !game?.player) return;
            promptCd = Math.max(0, promptCd - dt);
            const p = game.player.root.position;
            if (Math.hypot(p.x - sx, p.z - sz) > TALK_RANGE) return;
            if (game.input?.consumeInteract?.()) {
                spoken = true;
                for (const [i, line] of def.speaker.lines.entries()) {
                    game.hud?.story?.queue?.({
                        id: `${def.id}:${i}`,
                        speaker: line.speaker,
                        text: line.text,
                        priority: 'flavor',
                    });
                }
                return;
            }
            if (promptCd <= 0 && !spoken) {
                promptCd = 2.4;
                game.hud?.toast?.(`E — speak to the ${def.name}`, 1600);
            }
        },
        dispose() {
            for (const p of parts) p.dispose?.();
            parts.length = 0;
        },
    };
}

/**
 * Beat 09's dead: figures frozen mid-task, scattered through the ruined town.
 *
 * Local coordinates, applied per room, so a room only gets the ones that fit
 * inside it.
 */
export const TOWN_DEAD = [
    { x: -4, z: -3, facing: 0.6 },
    { x: 3, z: -4, facing: -1.8 },
    { x: -2, z: 4, facing: 2.4 },
    { x: 5, z: 2, facing: -0.4 },
    { x: 0, z: -5, facing: 1.2 },
];

export function addTownDead(level, ctx, origin, half) {
    const figures = [];
    for (const d of TOWN_DEAD) {
        // Only the ones that actually fit. A husk clipped into a wall is a bug
        // that reads as one, not as atmosphere.
        if (Math.abs(d.x) > half - 2 || Math.abs(d.z) > half - 2) continue;
        figures.push(makeFigure(ctx.scene, {
            x: origin.x + d.x, z: origin.z + d.z, facing: d.facing,
            palette: HUSK_PALETTE, frozen: true,
        }));
    }
    return {
        id: 'town-dead',
        figures,
        update() {},
        dispose() {
            for (const f of figures) f.dispose();
            figures.length = 0;
        },
    };
}
