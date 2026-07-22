import {
    VoxelPhysicsBody,
    FALL_DAMAGE_THRESHOLD,
    VOXEL_SIZE,
} from '../../src/game/physics/voxel-physics-body.js';
import { CollisionWorld } from '../../src/engine/collision.js';

export function run(t) {
    const getVoxel = (x, y, z) => y < 0;
    const pos = { x: 0, y: 2, z: 0 };
    const body = new VoxelPhysicsBody(pos, { x: 0.4, y: 0.9, z: 0.4 }, getVoxel);
    const cw = new CollisionWorld();

    let landed = false;
    for (let i = 0; i < 120; i++) {
        const r = body.update(cw, 1 / 60, {});
        if (r.landed) landed = true;
    }
    t.ok('eventually grounded', body.grounded);
    t.ok('landed edge fired', landed);
    t.ok('resting height', pos.y > 0.5 && pos.y < 2.5, `y=${pos.y}`);

    cw.addSolid({ minX: 2, maxX: 3, minZ: -2, maxZ: 2 });
    body.resetVelocity();
    body.grounded = true;
    pos.x = 0; pos.z = 0; pos.y = 1;
    for (let i = 0; i < 60; i++) {
        body.update(cw, 1 / 60, { wishX: 1, wishZ: 0, speed: 8 });
    }
    t.ok('wall stop', pos.x < 2, `x=${pos.x}`);

    const pos2 = { x: 0, y: FALL_DAMAGE_THRESHOLD + 8, z: 10 };
    const body2 = new VoxelPhysicsBody(pos2, { x: 0.4, y: 0.9, z: 0.4 }, getVoxel);
    body2.grounded = false;
    body2._wasGrounded = true;
    body2._fallStartY = pos2.y;
    let dmg = 0;
    for (let i = 0; i < 200; i++) {
        const r = body2.update(new CollisionWorld(), 1 / 60, {});
        if (r.damage > 0) dmg = r.damage;
    }
    t.ok('fall damage', dmg > 0, `dmg=${dmg}`);

    const pos3 = { x: 0, y: 1.0, z: 0 };
    const body3 = new VoxelPhysicsBody(pos3, { x: 0.4, y: 0.9, z: 0.4 }, getVoxel);
    body3.vy = -50;
    body3.grounded = false;
    body3.update(new CollisionWorld(), 0.05, {});
    t.ok('no floor tunnel', pos3.y > -1, `y=${pos3.y}`);

    body.setFrictionProfile({ groundDrag: 0.4, airDrag: 0.98, windVector: { x: 0, y: 0, z: 0 } });
    t.ok('sand drag set', body.profile.groundDrag === 0.4);

    body.setGravityVector({ x: 0, y: 0, z: -1 });
    t.ok('gravity toward -Z', Math.abs(body.gravity.z + 22) < 0.01);
    body.setGravityVector({ x: 0, y: -1, z: 0 });
    t.ok('gravity reset -Y', body.gravity.y < 0);

    t.ok('voxel size constant', VOXEL_SIZE > 0);

    // ── Step climb onto a 1-cell platform (no XZ solid — like room.platforms) ──
    // Floor y∈[0,1); step at x∈[2,4) covers y∈[1,2). Body centre rests near y=1.95 on floor.
    const stepSolid = (x, y, z) => {
        if (y >= 0 && y < 1) return true; // floor everywhere
        if (x >= 2 && x < 4 && y >= 1 && y < 2) return true; // one-cell step
        return false;
    };
    const stepPos = { x: 0.5, y: 1.0, z: 0.5 };
    const stepBody = new VoxelPhysicsBody(
        stepPos, { x: 0.4, y: 0.95, z: 0.4 }, stepSolid,
    );
    stepBody.grounded = true;
    stepBody.vy = 0;
    for (let i = 0; i < 10; i++) {
        stepBody.update(new CollisionWorld(), 1 / 60, {});
    }
    const floorY = stepPos.y;
    t.ok('step test starts on floor', floorY > 1.8 && floorY < 2.1, `y=${floorY}`);
    let maxY = floorY;
    let onStep = false;
    for (let i = 0; i < 50; i++) {
        stepBody.update(new CollisionWorld(), 1 / 60, {
            wishX: 1, wishZ: 0, speed: 5.5, half: 0.4,
        });
        if (stepPos.y > maxY) maxY = stepPos.y;
        // Mid-slab: x in (2.3, 3.7) should be up on the step top
        if (stepPos.x > 2.3 && stepPos.x < 3.7 && stepPos.y > floorY + 0.7) {
            onStep = true;
            break;
        }
    }
    t.ok('climbs onto the step (x past riser)', stepPos.x > 2.0 || onStep, `x=${stepPos.x}`);
    t.ok('standing on step top, not still on floor',
        onStep && maxY > floorY + 0.7,
        `onStep=${onStep} y=${stepPos.y} maxY=${maxY} floorY=${floorY}`);
    t.ok('still grounded after step-up', stepBody.grounded);

    // Tall wall (maxY style): solid column with no standable top within 1 cell
    // above feet should still block — simulate with XZ solid only + no voxels.
    const wallPos = { x: 0, y: 1.0, z: 0 };
    const wallBody = new VoxelPhysicsBody(
        wallPos, { x: 0.4, y: 0.95, z: 0.4 }, (x, y) => y >= 0 && y < 1,
    );
    wallBody.grounded = true;
    const wallCw = new CollisionWorld();
    wallCw.addSolid({ minX: 2, maxX: 3, minZ: -2, maxZ: 2 });
    for (let i = 0; i < 60; i++) {
        wallBody.update(wallCw, 1 / 60, { wishX: 1, wishZ: 0, speed: 8, half: 0.4 });
    }
    t.ok('tall XZ wall still blocks (no phantom climb)', wallPos.x < 2, `x=${wallPos.x}`);
}
