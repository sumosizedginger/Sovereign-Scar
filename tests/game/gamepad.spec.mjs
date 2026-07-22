// tests/game/gamepad.spec.mjs
// Pure-node spec for Input.pollGamepad (B5) using an injected fake pad.

import { Input } from '../../src/game/input.js';

const fakeDom = { addEventListener() {}, removeEventListener() {} };

function pad({ buttons = [], axes = [0, 0, 0, 0], id = 'test-pad' } = {}) {
    const b = Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) }));
    return { id, connected: true, buttons: b, axes };
}

export function run(t) {
    const input = new Input(fakeDom);

    // No pad: neutral state
    input.pollGamepad([]);
    t.ok('no pad → no move', input.padMove.x === 0 && input.padMove.z === 0);
    t.ok('no pad → no aim', input.padAim === null);

    // Left stick with deadzone
    input.pollGamepad([pad({ axes: [0.1, 0.1, 0, 0] })]);
    t.ok('deadzone swallows small stick', input.padMove.x === 0 && input.padMove.z === 0);
    input.pollGamepad([pad({ axes: [0.7, -0.5, 0, 0] })]);
    t.ok('left stick maps to padMove', input.padMove.x === 0.7 && input.padMove.z === -0.5);
    const mv = input.moveVector();
    t.ok('moveVector falls back to pad', mv.x === 0.7 && mv.z === -0.5);

    // Right stick aim threshold
    input.pollGamepad([pad({ axes: [0, 0, 0.2, 0.1] })]);
    t.ok('weak right stick → no aim', input.padAim === null);
    input.pollGamepad([pad({ axes: [0, 0, 0.9, 0.3] })]);
    t.ok('right stick maps to padAim', input.padAim && input.padAim.x === 0.9 && input.padAim.z === 0.3);

    // Edge-triggered buttons: A fires attack once, not while held
    input.consumeAttack(); // clear
    input.pollGamepad([pad({ buttons: [0] })]);
    t.ok('A press → attack edge', input.consumeAttack() === true);
    input.pollGamepad([pad({ buttons: [0] })]); // still held
    t.ok('A held → no repeat', input.consumeAttack() === false);
    input.pollGamepad([pad({})]); // released
    input.pollGamepad([pad({ buttons: [0] })]);
    t.ok('A re-press → fires again', input.consumeAttack() === true);

    // Full mapping table
    input.pollGamepad([pad({})]);
    input.pollGamepad([pad({ buttons: [1, 2, 3, 5, 6, 8, 9, 12] })]);
    t.ok('B → dash', input.consumeDash() === true);
    t.ok('X → interact', input.consumeInteract() === true);
    t.ok('Y → grapple', input.consumeGrapple() === true);
    t.ok('RB → weapon next', input.consumeWeaponCycle() === 1);
    // Z4 took LT for lock-on (the Ocarina slot). Mute lost the binding rather
    // than the reverse: it is a settings toggle, and the triggers are the only
    // pad real estate a player can reach without letting go of a stick.
    t.ok('LT → lock-on', input.consumeLockToggle() === true);
    t.ok('LT no longer mutes', input.consumeMuteToggle() === false);
    // The map had no pad binding at all — it was keyboard-only (Tab) and
    // unadvertised, so on a controller it was unreachable.
    t.ok('Select → map', input.consumeMapToggle() === true);
    t.ok('Start → pause', input.consumePause() === true);
    t.ok('D-up → mood', input.consumeMoodToggle() === true);

    // Menu nav codes synthesized from d-pad + A/B
    input.pollGamepad([pad({})]);
    input.consumeMenuCodes();
    input.pollGamepad([pad({ buttons: [13] })]);
    input.pollGamepad([pad({ buttons: [13, 0] })]);
    input.pollGamepad([pad({ buttons: [13, 0, 1] })]);
    const codes = input.consumeMenuCodes();
    t.ok('menu codes in order', JSON.stringify(codes) === JSON.stringify(['ArrowDown', 'Enter', 'Backspace']));
    t.ok('menu codes drained', input.consumeMenuCodes().length === 0);

    // Any pad use marks padActive; keyboard reverts it
    t.ok('pad marked active', input.padActive === true);
    input._onKeyDown({ code: 'KeyW' });
    t.ok('keyboard reverts padActive', input.padActive === false);

    // Stick arming: a pad whose stick is already off-centre when it connects
    // (held, drifting, or stuck) must NOT pin movement. Regression guard for a
    // real DualSense resting at x≈0.94 that shoved the player into a wall and
    // made the game unplayable on keyboard (moveVector falls back to the pad).
    const drift = new Input(fakeDom);
    const stuck = { axes: [0.94, -0.18, 0, 0], id: 'drifting-pad' };
    drift.pollGamepad([pad(stuck)]);
    t.ok('stuck stick does not move the player',
        drift.padMove.x === 0 && drift.padMove.z === 0);
    drift.pollGamepad([pad(stuck)]);
    t.ok('stuck stick stays suppressed while held',
        drift.padMove.x === 0 && drift.padMove.z === 0);
    t.ok('stuck stick does not flip the HUD to pad prompts', drift.padActive === false);
    t.ok('keyboard still steers past a stuck stick',
        drift.moveVector().x === 0 && drift.moveVector().z === 0);
    // Released/centred → the stick arms and works normally from then on
    drift.pollGamepad([pad({ axes: [0, 0, 0, 0], id: 'drifting-pad' })]);
    drift.pollGamepad([pad({ axes: [0.94, -0.18, 0, 0], id: 'drifting-pad' })]);
    t.ok('stick works once seen at rest', drift.padMove.x === 0.94);

    // The suppressed state is reported so the HUD can explain itself
    t.ok('suppressed stick is reported to the HUD', drift.padStickHeld === false);
    const held = new Input(fakeDom);
    held.pollGamepad([pad({ axes: [0.94, 0, 0, 0], id: 'held-pad' })]);
    t.ok('held stick flags padStickHeld', held.padStickHeld === true);
    held.pollGamepad([pad({ axes: [0, 0, 0, 0], id: 'held-pad' })]);
    t.ok('flag clears once the stick centres', held.padStickHeld === false);
    held.pollGamepad([]);
    t.ok('flag clears when the pad disconnects', held.padStickHeld === false);

    // A right stick pinned at rest must not force-steer facing either
    const aimDrift = new Input(fakeDom);
    aimDrift.pollGamepad([pad({ axes: [0, 0, -1, 0], id: 'aim-drift' })]);
    t.ok('stuck right stick yields no aim', aimDrift.padAim === null);

    // Reconnecting a different pad re-arms from scratch
    const swap = new Input(fakeDom);
    swap.pollGamepad([pad({ axes: [0, 0, 0, 0], id: 'pad-a' })]);
    swap.pollGamepad([pad({ axes: [0.9, 0, 0, 0], id: 'pad-b' })]);
    t.ok('new pad re-arms (stuck stick ignored)', swap.padMove.x === 0);
}
