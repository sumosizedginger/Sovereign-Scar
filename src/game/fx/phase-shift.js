// Beat 05 Citadel phase-shift helper — flash + mood ramp.

import { sfx } from '../../audio/synth.js';

export function triggerPhaseShift(moodController, toMood = 'abyss', duration = 1.5) {
    if (!moodController) return;
    sfx.phase();
    moodController.startRamp(toMood, duration);
    return duration;
}
