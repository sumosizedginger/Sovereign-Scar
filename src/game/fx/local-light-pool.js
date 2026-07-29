// Pooled local-light manager (Ticket G / Change 6.2).
//
// Motivated local lights — doors, altars, machinery, ice, magma, boss weak
// points — describe form that flat ambient cannot. But an unbounded pile of
// point lights wrecks performance and forward-renderer light limits. This pool
// keeps a strict visible-light budget: only the closest / most important few
// sources own an actual THREE.PointLight each frame; the rest are "parked"
// (their light removed from the scene). Emissive props keep their bloom
// regardless — they simply do not also cast a real light while parked.
//
// The selection is pure (selectActive) so it is unit-testable without a GL
// context; the THREE bookkeeping wraps it.

import * as THREE from 'three';

/**
 * Choose up to `budget` sources by score = priority - distanceToFocus/falloff.
 * Higher priority and nearer sources win. Deterministic and allocation-light.
 * Returns the chosen source objects (a subset of `sources`).
 */
export function selectActive(sources, focus, budget, falloff = 12) {
    if (sources.length <= budget) return sources.slice();
    const scored = [];
    for (const s of sources) {
        const dx = s.x - focus.x, dy = (s.y || 0) - (focus.y || 0), dz = s.z - focus.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // A point light with a finite `distance` contributes exactly nothing
        // past it. Ranking such a source into the budget spends a real shader
        // light slot on a light that cannot reach the player — measured live in
        // the Pyre, where the entry room has two fixtures and three of the five
        // pooled slots went to rooms 60+ units away, lighting nothing.
        if (s.distance > 0 && dist > s.distance) continue;
        scored.push({ s, score: (s.priority || 0) - dist / falloff });
    }
    if (scored.length <= budget) return scored.map((e) => e.s);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, budget).map((e) => e.s);
}

export class LocalLightPool {
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.budget = opts.budget ?? 4; // audit range: 3–5
        this.falloff = opts.falloff ?? 12;
        this._sources = [];  // { x, y, z, color, intensity, distance, priority }
        this._tagged = new WeakMap(); // mesh → its source, so it registers once
        this._pool = [];      // reusable PointLight objects (== budget)
        this._makeLight = opts.makeLight || ((color) => {
            const l = new THREE.PointLight(color, 0, 0, 2);
            l.castShadow = false; // pooled fills, never shadow-casters (budget)
            return l;
        });
    }

    /** Register a motivated light source. Returns it for later mutation. */
    register(src) {
        const s = { x: 0, y: 1, z: 0, color: 0xffffff, intensity: 1, distance: 10, priority: 0, ...src };
        this._sources.push(s);
        return s;
    }

    /**
     * Register the light a mesh declares via `userData.localLight`, once.
     *
     * Deduped by object identity, and that matters: rooms bake lazily, so the
     * baker registers each fixture as it creates it, while `scan(scene)` still
     * runs on level load and would walk over the same meshes again. Registering
     * twice does not merely waste a budget slot — it doubles the light, and
     * silently, since both entries are legitimate-looking rows in the list.
     */
    registerMesh(o) {
        if (!o || !o.userData || !o.userData.localLight) return null;
        if (this._tagged.has(o)) return null;
        const cfg = o.userData.localLight;
        const p = o.getWorldPosition ? o.getWorldPosition(new THREE.Vector3()) : o.position;
        const s = this.register({
            x: p.x, y: p.y, z: p.z,
            color: cfg.color ?? 0xffffff,
            intensity: cfg.intensity ?? 1,
            distance: cfg.distance ?? 10,
            priority: cfg.priority ?? 0,
        });
        this._tagged.set(o, s);
        return s;
    }

    /** Forget a mesh's registration so it can be re-registered after a rebake. */
    forgetMesh(o) {
        const s = o && this._tagged.get(o);
        if (!s) return;
        const i = this._sources.indexOf(s);
        if (i >= 0) this._sources.splice(i, 1);
        this._tagged.delete(o);
    }

    /** Scan a scene subtree for meshes tagged `userData.localLight`. */
    scan(root) {
        if (!root || !root.traverse) return;
        root.traverse((o) => this.registerMesh(o));
    }

    /** Park every pooled light and forget all sources (call on level change). */
    clear() {
        for (const l of this._pool) {
            l.intensity = 0;
            if (l.parent) l.parent.remove(l);
        }
        this._sources.length = 0;
        this._tagged = new WeakMap();
    }

    _ensurePool() {
        while (this._pool.length < this.budget) {
            const l = this._makeLight(0xffffff);
            l.intensity = 0;
            this._pool.push(l);
        }
    }

    /** Assign the budget of pooled lights to the best sources near `focus`. */
    update(focus) {
        if (!this._sources.length) {
            for (const l of this._pool) { l.intensity = 0; if (l.parent) l.parent.remove(l); }
            return;
        }
        this._ensurePool();
        const active = selectActive(this._sources, focus || { x: 0, y: 0, z: 0 }, this.budget, this.falloff);
        for (let i = 0; i < this._pool.length; i++) {
            const l = this._pool[i];
            const s = active[i];
            if (!s) { l.intensity = 0; if (l.parent) l.parent.remove(l); continue; }
            l.color.setHex(s.color);
            l.intensity = s.intensity;
            l.distance = s.distance;
            l.position.set(s.x, s.y, s.z);
            if (!l.parent && this.scene) this.scene.add(l);
        }
    }
}
