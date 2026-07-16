// Named surface friction / wind profiles for VoxelPhysicsBody.

export const FRICTION = {
    default: { groundDrag: 0.86, airDrag: 0.98, windVector: { x: 0, y: 0, z: 0 }, label: 'default' },
    sand: { groundDrag: 0.4, airDrag: 0.98, windVector: { x: 0, y: 0, z: 0 }, label: 'sand' },
    ice: { groundDrag: 0.995, airDrag: 0.995, windVector: { x: 0, y: 0, z: 0 }, label: 'ice' },
    wind: { groundDrag: 0.86, airDrag: 0.98, windVector: { x: 1.8, y: 0, z: 0 }, label: 'wind' },
    sludge: { groundDrag: 0.35, airDrag: 0.97, windVector: { x: 0, y: 0, z: 0 }, label: 'sludge' },
};

export function getProfile(name) {
    return FRICTION[name] || FRICTION.default;
}
