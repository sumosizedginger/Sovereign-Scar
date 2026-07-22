// Acquisition chains for the Resonance Fork and Entropy Dust (Narrative §7).
//
// Both items used to fall out of ordinary cache pickups; the design calls
// for short side stories borrowed from A Link to the Past's Flute/quest
// grammar without copying its content:
//
//   Resonance Fork — an engineer core freed in the Bleeding Quarry grants
//   the Buried Frequency; a small hot/cold sound puzzle on the overworld
//   locates the buried Fork; a broken weather relay activates it. Activation
//   unlocks Altar Travel (menu gates on the item) and motif replay.
//
//   Entropy Dust — an unstable spore found in the Bone Forest is delivered
//   to a rescued systems engineer's camp; the refined Dust is ready after
//   the player seals one more wound (any further boss defeat) and returns.
//
// Stage helpers are pure functions over the inventory so they unit-test
// without a scene; the add* builders wire props + interact systems using
// the same level.addSystem pattern as the Reconstitution Altar.

import * as THREE from 'three';

export const FORK_FLAG_FREQUENCY = 'chain:fork:frequency';
export const FORK_FLAG_DORMANT = 'chain:fork:dormant';
export const DUST_FLAG_SPORE = 'chain:dust:spore';
export const DUST_FLAG_DELIVERED = 'chain:dust:delivered';
export const DUST_FLAG_DELIVERED_AT = 'chain:dust:deliveredAt';

/** 'none' → 'frequency' → 'dormant' → 'active' */
export function forkStage(inventory) {
    if (inventory.hasItem('resonance_fork')) return 'active';
    if (inventory.getFlag(FORK_FLAG_DORMANT)) return 'dormant';
    if (inventory.getFlag(FORK_FLAG_FREQUENCY)) return 'frequency';
    return 'none';
}

/** 'none' → 'spore' → 'refining' → 'refined' → 'ready' */
export function dustStage(inventory, bossesDefeated) {
    if (inventory.hasItem('entropy_dust')) return 'ready';
    if (inventory.getFlag(DUST_FLAG_DELIVERED)) {
        const at = Number(inventory.flags?.[DUST_FLAG_DELIVERED_AT] ?? 0);
        return (bossesDefeated || 0) > at ? 'refined' : 'refining';
    }
    if (inventory.getFlag(DUST_FLAG_SPORE)) return 'spore';
    return 'none';
}

/** Beat-06 engineer core: the freed engineer hands over the Buried Frequency. */
export function grantBuriedFrequency(game) {
    const inv = game.player?.inventory;
    if (!inv || forkStage(inv) !== 'none') return false;
    inv.setFlag(FORK_FLAG_FREQUENCY);
    game.persistInventory?.();
    game.hud?.story?.queue?.([
        { speaker: 'SYSTEM', text: 'ENGINEER CORE 5 RESTORED. Broadcasting one buried frequency, then silence.' },
        { speaker: 'PREDECESSOR', text: 'A tuning song with dirt on it. Something resonant sleeps under the Crust — walk until the song burns.' },
    ]);
    game.hud?.toast?.('Buried Frequency received — follow the song on the overworld', 3600);
    return true;
}

/** Beat-08 spore pickup body, shared so the level def stays declarative. */
export function collectUnstableSpore(game) {
    const inv = game.player?.inventory;
    if (!inv || inv.getFlag(DUST_FLAG_SPORE)) return false;
    inv.setFlag(DUST_FLAG_SPORE);
    game.persistInventory?.();
    game.hud?.story?.queue?.([
        { speaker: 'PREDECESSOR', text: 'That spore is chewing on its own pattern. Do not pocket it near anything you love.' },
        { speaker: 'PREDECESSOR', text: 'The engineer camped west of the Bone Forest gate reads entropy for a living. Take it there.' },
    ]);
    game.hud?.toast?.('Unstable spore — deliver it to the systems engineer', 3200);
    return true;
}

function makeProp(builder) {
    const group = new THREE.Group();
    builder(group);
    return group;
}

function disposeGroup(group) {
    if (group.parent) group.parent.remove(group);
    group.traverse((o) => {
        if (o.isMesh) {
            o.geometry?.dispose?.();
            o.material?.dispose?.();
        }
    });
}

/**
 * The buried Fork dig site: a low mound that sings hotter as the player
 * closes in while carrying the Buried Frequency. E digs within reach.
 */
export function addForkDigSite(level, ctx, { x, z }) {
    const mound = makeProp((g) => {
        const m = new THREE.Mesh(
            new THREE.ConeGeometry(0.9, 0.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x877b68, roughness: 1 })
        );
        m.position.y = 0.25;
        g.add(m);
    });
    mound.position.set(x, 0.5, z);
    ctx.scene.add(mound);

    let pingCooldown = 0;
    level.addSystem({
        update(dt, game) {
            const inv = game.player?.inventory;
            if (!inv || forkStage(inv) !== 'frequency') return;
            pingCooldown -= dt;
            const p = game.player.root.position;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d > 26) return;
            if (pingCooldown <= 0) {
                // Hot/cold bands: the ping cadence and wording carry the
                // sound puzzle; closer = faster + hotter.
                pingCooldown = d < 4 ? 1.2 : d < 10 ? 2.2 : 3.6;
                const band = d < 4 ? 'BURNING' : d < 10 ? 'clear' : 'faint';
                game.hud?.toast?.(`The Buried Frequency sings — ${band}`, 1100);
                game.sfx?.ping?.();
            }
            if (d < 2.2) {
                if (game.input?.consumeInteract?.()) {
                    inv.setFlag(FORK_FLAG_DORMANT);
                    game.persistInventory?.();
                    game.hud?.story?.queue?.([
                        { speaker: 'PREDECESSOR', text: 'A Resonance Fork, caked in centuries. It hums but will not speak.' },
                        { speaker: 'PREDECESSOR', text: 'The old weather relay east of here spoke to every altar at once. Wake the Fork there.' },
                    ]);
                    game.hud?.toast?.('Dormant Resonance Fork recovered — wake it at the weather relay', 3600);
                }
            }
        },
        dispose() { disposeGroup(mound); },
    });
    return mound;
}

/** The broken weather relay: activates a dormant Fork into the real item. */
export function addWeatherRelay(level, ctx, { x, z }) {
    const relay = makeProp((g) => {
        const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.28, 4.4, 6),
            new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.7, metalness: 0.5 })
        );
        mast.position.y = 2.2;
        mast.rotation.z = 0.16; // broken lean
        g.add(mast);
        const dish = new THREE.Mesh(
            new THREE.ConeGeometry(1.0, 0.5, 10, 1, true),
            new THREE.MeshStandardMaterial({ color: 0x7a8090, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide })
        );
        dish.position.set(0.5, 4.0, 0);
        dish.rotation.z = Math.PI / 2.4;
        g.add(dish);
    });
    relay.position.set(x, 0.5, z);
    ctx.scene.add(relay);

    let promptCooldown = 0;
    level.addSystem({
        update(dt, game) {
            promptCooldown -= dt;
            const inv = game.player?.inventory;
            if (!inv) return;
            const p = game.player.root.position;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d > 2.6) return;
            const stage = forkStage(inv);
            if (stage === 'dormant') {
                if (promptCooldown <= 0) {
                    promptCooldown = 2.6;
                    game.hud?.toast?.('E — seat the Fork in the relay cradle', 1800);
                }
                if (game.input?.consumeInteract?.()) {
                    game.collectOptionalItem?.('resonance_fork', 'Resonance Fork', 'chain:weather-relay');
                    game.hud?.story?.queue?.([
                        { speaker: 'SYSTEM', text: 'RELAY HANDSHAKE ACCEPTED. Altar lattice remembered.' },
                        { speaker: 'PREDECESSOR', text: 'Every altar you have touched now answers the Fork. Travel is a chord, not a walk.' },
                    ]);
                    game.replayThreadMotif?.();
                }
            } else if (stage === 'frequency' && promptCooldown <= 0) {
                promptCooldown = 3.2;
                game.hud?.toast?.('The relay cradle is empty. Something resonant belongs here.', 2200);
            }
        },
        dispose() { disposeGroup(relay); },
    });
    return relay;
}

/** The rescued systems engineer's camp: spore delivery + refined Dust. */
export function addEngineerCamp(level, ctx, { x, z }) {
    const camp = makeProp((g) => {
        const tent = new THREE.Mesh(
            new THREE.ConeGeometry(1.4, 1.6, 4),
            new THREE.MeshStandardMaterial({ color: 0x5a3040, roughness: 0.9 })
        );
        tent.position.y = 0.8;
        tent.rotation.y = Math.PI / 4;
        g.add(tent);
        const lamp = new THREE.PointLight(0x7fe0ff, 4, 6);
        lamp.position.set(1.2, 1.4, 0.6);
        g.add(lamp);
        const core = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.3, 0),
            new THREE.MeshStandardMaterial({
                color: 0x7fe0ff, emissive: 0x7fe0ff, emissiveIntensity: 1.2, roughness: 0.4,
            })
        );
        core.position.set(1.2, 0.9, 0.6);
        g.add(core);
    });
    camp.position.set(x, 0.5, z);
    ctx.scene.add(camp);

    let promptCooldown = 0;
    level.addSystem({
        update(dt, game) {
            promptCooldown -= dt;
            const inv = game.player?.inventory;
            if (!inv) return;
            const p = game.player.root.position;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d > 3.0) return;
            const bosses = (game.progressSnapshot?.().bossesDefeated || []).length;
            const stage = dustStage(inv, bosses);
            if (stage === 'spore') {
                if (promptCooldown <= 0) {
                    promptCooldown = 2.6;
                    game.hud?.toast?.('E — hand the unstable spore to the engineer', 1800);
                }
                if (game.input?.consumeInteract?.()) {
                    inv.setFlag(DUST_FLAG_DELIVERED);
                    inv.setFlag(DUST_FLAG_DELIVERED_AT, bosses);
                    game.persistInventory?.();
                    game.hud?.story?.queue?.([
                        { speaker: 'SYSTEM', text: 'ENGINEER: Live decay pattern. Beautiful. Horrible. Give me time.' },
                        { speaker: 'SYSTEM', text: 'ENGINEER: Seal one more wound and come back. It will be Dust by then.' },
                    ]);
                    game.hud?.toast?.('Spore delivered — return after sealing another wound', 3200);
                }
            } else if (stage === 'refining' && promptCooldown <= 0) {
                promptCooldown = 3.2;
                game.hud?.toast?.('ENGINEER: Still refining. Seal another wound first.', 2400);
            } else if (stage === 'refined') {
                if (promptCooldown <= 0) {
                    promptCooldown = 2.6;
                    game.hud?.toast?.('E — collect the refined Entropy Dust', 1800);
                }
                if (game.input?.consumeInteract?.()) {
                    game.collectOptionalItem?.('entropy_dust', 'Entropy Dust', 'chain:engineer-camp');
                    game.hud?.story?.queue?.([
                        { speaker: 'SYSTEM', text: 'ENGINEER: Three measured charges. Altars will re-cut it. Aim it at things you want confused.' },
                    ]);
                }
            }
        },
        dispose() { disposeGroup(camp); },
    });
    return camp;
}
