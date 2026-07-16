// Y-axis gravity + fall damage. XZ still owned by CollisionWorld.
// Default gravity is −Y only; setGravityVector is available for Beat 14.

const DEFAULT_GRAVITY_Y = -22;
const TERMINAL_VY = -28;
const FALL_DAMAGE_THRESHOLD = 5;
const FALL_DAMAGE_PER_UNIT = 0.35;
// Must match VOXEL_SCALE in assets/palettes.js (level cell size in world units).
const VOXEL_SIZE = 1;

export class VoxelPhysicsBody {
    /**
     * @param {{x:number,y:number,z:number}} position mutated in place
     * @param {{x:number,y:number,z:number}} extents half-extents (world units)
     * @param {(x:number,y:number,z:number)=>boolean} getVoxelAt solid occupancy in world units
     */
    constructor(position, extents, getVoxelAt) {
        this.position = position;
        this.extents = extents || { x: 0.4, y: 0.9, z: 0.4 };
        this.getVoxelAt = getVoxelAt || (() => false);
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.gravity = { x: 0, y: DEFAULT_GRAVITY_Y, z: 0 };
        this.grounded = false;
        this._fallStartY = position.y;
        this._wasGrounded = false;
        this.profile = { groundDrag: 0.86, airDrag: 0.98, windVector: { x: 0, y: 0, z: 0 } };
        this.enabled = true;
    }

    setFrictionProfile({ groundDrag, airDrag, windVector } = {}) {
        if (groundDrag != null) this.profile.groundDrag = groundDrag;
        if (airDrag != null) this.profile.airDrag = airDrag;
        if (windVector) this.profile.windVector = { ...windVector };
    }

    resetVelocity() {
        this.vx = this.vy = this.vz = 0;
    }

    /**
     * Swap gravity direction. Magnitude preserved from |DEFAULT_GRAVITY_Y|.
     * Arbitrary axes supported numerically; full wall-floor behavior for
     * non-Y gravity is a Beat 14 polish concern.
     */
    setGravityVector(vec3) {
        const x = vec3.x || 0, y = vec3.y || 0, z = vec3.z || 0;
        const len = Math.hypot(x, y, z) || 1;
        const mag = Math.abs(DEFAULT_GRAVITY_Y);
        this.gravity.x = (x / len) * mag;
        this.gravity.y = (y / len) * mag;
        this.gravity.z = (z / len) * mag;
    }

    /**
     * Integrate one frame.
     * @param {{ resolveMove: Function }} collisionWorld
     * @param {number} dt
     * @param {{ wishX?: number, wishZ?: number, speed?: number, half?: number }} [input]
     */
    update(collisionWorld, dt, input = {}) {
        if (!this.enabled) {
            return { landed: false, fallDistance: 0, damage: 0, grounded: this.grounded };
        }
        dt = Math.min(0.05, Math.max(0, dt));

        // Apply gravity
        this.vx += this.gravity.x * dt;
        this.vy += this.gravity.y * dt;
        this.vz += this.gravity.z * dt;

        // Wish direction (player control) — stronger on ground
        const speed = input.speed != null ? input.speed : 5.5;
        const half = input.half != null ? input.half : this.extents.x;
        if (input.wishX || input.wishZ) {
            const len = Math.hypot(input.wishX || 0, input.wishZ || 0) || 1;
            const wx = (input.wishX || 0) / len;
            const wz = (input.wishZ || 0) / len;
            const control = this.grounded ? 1 : 0.35;
            this.vx = wx * speed * control + (this.grounded ? 0 : this.vx * (1 - control));
            this.vz = wz * speed * control + (this.grounded ? 0 : this.vz * (1 - control));
            // Preserve horizontal magnitude blend for air
            if (!this.grounded) {
                this.vx = this.vx * 0.5 + wx * speed * 0.35;
                this.vz = this.vz * 0.5 + wz * speed * 0.35;
            } else {
                this.vx = wx * speed;
                this.vz = wz * speed;
            }
        } else if (this.grounded) {
            // Friction kill when no input
            this.vx *= this.profile.groundDrag;
            this.vz *= this.profile.groundDrag;
            if (Math.abs(this.vx) < 0.02) this.vx = 0;
            if (Math.abs(this.vz) < 0.02) this.vz = 0;
        } else {
            this.vx *= this.profile.airDrag;
            this.vz *= this.profile.airDrag;
        }

        // Wind bias
        const w = this.profile.windVector || { x: 0, y: 0, z: 0 };
        this.vx += (w.x || 0) * dt;
        this.vz += (w.z || 0) * dt;

        // Terminal velocity on primary gravity axis (Y default)
        if (this.vy < TERMINAL_VY) this.vy = TERMINAL_VY;
        if (this.vy > -TERMINAL_VY) { /* allow upward */ }

        // Track fall start
        if (!this.grounded && this._wasGrounded) {
            this._fallStartY = this.position.y;
        }

        // Y sub-steps to avoid floor tunneling
        const stepY = this.vy * dt;
        const maxStep = VOXEL_SIZE * 0.9;
        const steps = Math.max(1, Math.ceil(Math.abs(stepY) / maxStep));
        const subDt = dt / steps;
        let landed = false;
        let fallDistance = 0;
        let damage = 0;

        for (let i = 0; i < steps; i++) {
            this.position.y += this.vy * subDt;

            // Ground snap: feet at position.y - extents.y
            const feetY = this.position.y - this.extents.y;
            const gx = this.position.x;
            const gz = this.position.z;
            const solidUnder = this._solidAt(gx, feetY - 0.02, gz) || this._solidAt(gx, feetY, gz);

            if (this.vy <= 0 && solidUnder) {
                // Snap feet to top of voxel cell
                const cell = Math.floor(feetY / VOXEL_SIZE);
                const top = (cell + 1) * VOXEL_SIZE;
                // Walk up: find highest solid top under feet within 1 cell
                let snapY = top;
                for (let dy = 0; dy <= 2; dy++) {
                    const ty = feetY - dy * VOXEL_SIZE;
                    if (this._solidAt(gx, ty, gz)) {
                        snapY = (Math.floor(ty / VOXEL_SIZE) + 1) * VOXEL_SIZE;
                        break;
                    }
                }
                if (this._solidAt(gx, feetY - 0.01, gz) || this._solidAt(gx, this.position.y - this.extents.y - 0.05, gz)) {
                    const groundTop = this._groundTop(gx, this.position.y, gz);
                    if (groundTop != null) {
                        this.position.y = groundTop + this.extents.y + 0.001;
                        if (!this.grounded) {
                            fallDistance = Math.max(0, this._fallStartY - this.position.y);
                            if (fallDistance > FALL_DAMAGE_THRESHOLD) {
                                damage = (fallDistance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_UNIT;
                            }
                            landed = true;
                        }
                        this.vy = 0;
                        this.grounded = true;
                    }
                }
            } else if (this.vy > 0 && this._solidAt(gx, this.position.y + this.extents.y, gz)) {
                // Hit ceiling
                this.vy = 0;
                this.grounded = false;
            } else {
                // Check still supported
                if (!this._solidAt(gx, this.position.y - this.extents.y - 0.08, gz)) {
                    this.grounded = false;
                }
            }
        }

        // XZ via CollisionWorld
        const nx = this.position.x + this.vx * dt;
        const nz = this.position.z + this.vz * dt;
        if (collisionWorld && collisionWorld.resolveMove) {
            const resolved = collisionWorld.resolveMove(
                this.position.x, this.position.z, nx, nz, half
            );
            // Cancel velocity into wall
            if (Math.abs(resolved.x - nx) > 1e-4) this.vx = 0;
            if (Math.abs(resolved.z - nz) > 1e-4) this.vz = 0;
            this.position.x = resolved.x;
            this.position.z = resolved.z;
        } else {
            this.position.x = nx;
            this.position.z = nz;
        }

        this._wasGrounded = this.grounded;
        return { landed, fallDistance, damage, grounded: this.grounded };
    }

    _solidAt(wx, wy, wz) {
        return !!this.getVoxelAt(wx, wy, wz);
    }

    _groundTop(wx, wy, wz) {
        // Search downward a few cells for a solid top
        for (let i = 0; i < 8; i++) {
            const y = wy - this.extents.y - i * VOXEL_SIZE * 0.5;
            if (this._solidAt(wx, y, wz)) {
                return (Math.floor(y / VOXEL_SIZE) + 1) * VOXEL_SIZE;
            }
        }
        return null;
    }

    /** Impulse helpers */
    applyImpulse(ix, iy, iz) {
        this.vx += ix || 0;
        this.vy += iy || 0;
        this.vz += iz || 0;
        if (iy > 0) this.grounded = false;
    }
}

export { FALL_DAMAGE_THRESHOLD, FALL_DAMAGE_PER_UNIT, DEFAULT_GRAVITY_Y, VOXEL_SIZE };
