// Pickup silhouettes by reward type.
//
// Every pickup in the game — a handful of shards, a small key, a Memory Vial
// chassis, a Scar Suture worth a quarter of a heart container — was the same
// 0.35 octahedron in a different colour. From a camera 17.5 units up, colour is
// the weakest signal there is: it washes out under the Abyss mood grade, it is
// unavailable to a colour-blind player entirely, and it is the first thing lost
// to bloom on a bright floor.
//
// Shape survives all three. A player should be able to tell across a dark room
// whether the thing glinting behind the rubble is worth crossing for, because
// that judgement *is* the exploration loop — Z7 made rewards mean different
// things, and this is what makes the difference visible before you walk over.

import * as THREE from 'three';

function mat(color, emissiveIntensity = 2, extra = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity,
        roughness: 0.35,
        metalness: 0.2,
        ...extra,
    });
}

/**
 * A heart piece. Two lobes and a point — the most recognisable shape in the
 * genre, and worth borrowing precisely because the player already knows it.
 */
function buildSuture(color) {
    const g = new THREE.Group();
    const m = mat(color, 2.4);
    for (const s of [-1, 1]) {
        const lobe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.16), m);
        lobe.position.set(s * 0.13, 0.13, 0);
        g.add(lobe);
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.16), m);
    g.add(body);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.16), m);
    tip.position.y = -0.19;
    g.add(tip);
    return g;
}

/** A Memory Vial chassis: a stoppered flask. Reads as equipment, not currency. */
function buildVial(color) {
    const g = new THREE.Group();
    const glass = mat(color, 1.6, { transparent: true, opacity: 0.85 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.42, 6), glass);
    g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 6), glass);
    neck.position.y = 0.28;
    g.add(neck);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.16),
        mat(0xd4a84b, 0.8));
    cap.position.y = 0.39;
    g.add(cap);
    return g;
}

/** A key: bit and ward. The one pickup whose shape players already read fluently. */
function buildKey(color, boss = false) {
    const g = new THREE.Group();
    const m = mat(color, boss ? 2.6 : 1.8);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), m);
    g.add(shaft);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 5, 10), m);
    bow.position.y = 0.32;
    g.add(bow);
    for (let i = 0; i < (boss ? 3 : 2); i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.08), m);
        tooth.position.set(0.11, -0.14 - i * 0.11, 0);
        g.add(tooth);
    }
    return g;
}

/** Lore: a folded record. Flat and pale, so it never reads as loot. */
function buildLore(color) {
    const g = new THREE.Group();
    const m = mat(color, 1.2);
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.05), m);
    g.add(sheet);
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.07), mat(color, 0.6));
    fold.position.y = 0.1;
    g.add(fold);
    return g;
}

/** Currency: a cluster of small shards. Deliberately the least interesting. */
function buildShards(color) {
    const g = new THREE.Group();
    const m = mat(color, 2);
    const spots = [[0, 0.05, 0, 0.22], [0.14, -0.06, 0.06, 0.15], [-0.13, -0.04, -0.05, 0.13]];
    for (const [x, y, z, s] of spots) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), m);
        shard.position.set(x, y, z);
        shard.rotation.set(x * 4, y * 6, z * 4);
        g.add(shard);
    }
    return g;
}

/** A real item — weapon or tool. A pedestal-worthy prism with a bright core. */
function buildItem(color) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0),
        mat(color, 1.4, { transparent: true, opacity: 0.6 }));
    g.add(shell);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), mat(0xffffff, 3));
    g.add(core);
    return g;
}

const BUILDERS = {
    suture: buildSuture,
    vial: buildVial,
    lore: buildLore,
    currency: buildShards,
    key: (c) => buildKey(c, false),
    bosskey: (c) => buildKey(c, true),
    item: buildItem,
};

/**
 * Decide a pickup's shape from its data.
 *
 * Reward type is authoritative (Z7 made it explicit data). The label sniffing
 * below is a fallback for pickups that predate that and never declared one —
 * the same fallback room-graph uses for scoring, kept in step deliberately.
 */
export function pickupKind(data = {}) {
    if (data.shape) return data.shape;
    if (data.reward?.type) return data.reward.type;
    const label = data.label || '';
    if (/boss key/i.test(label)) return 'bosskey';
    if (/key/i.test(label)) return 'key';
    if (/suture/i.test(label)) return 'suture';
    if (/vial|chassis/i.test(label)) return 'vial';
    if (/record|testimony|lore|note/i.test(label)) return 'lore';
    if (/cache|seam|shard/i.test(label)) return 'currency';
    return 'item';
}

/** Build the mesh for a pickup. Always returns something drawable. */
export function buildPickupMesh(data = {}) {
    const kind = pickupKind(data);
    const color = data.color || 0x7fe0ff;
    const build = BUILDERS[kind] || BUILDERS.item;
    const g = build(color);
    g.name = `pickup:${kind}`;
    g.userData.pickupKind = kind;
    return g;
}

/** Dispose a group built here (nested meshes, so the caller cannot just guess). */
export function disposePickupMesh(obj) {
    if (!obj) return;
    obj.traverse?.((o) => {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material?.dispose?.();
    });
    obj.parent?.remove(obj);
}
