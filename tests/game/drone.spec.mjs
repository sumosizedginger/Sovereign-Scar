import {
    playDrone, stopDrone, stopAllDrones, initAudio, playTone, sfx,
} from '../../src/audio/synth.js';

export function run(t) {
    t.ok('playDrone export', typeof playDrone === 'function');
    t.ok('stopDrone export', typeof stopDrone === 'function');
    t.ok('stopAllDrones export', typeof stopAllDrones === 'function');
    const id = playDrone('square', 80, 0.3, 'music', 'test');
    t.ok('no audioCtx → null', id === null);
    stopDrone('test');
    stopAllDrones();
    t.ok('sfx.shatter', typeof sfx.shatter === 'function');
    t.ok('sfx.dash', typeof sfx.dash === 'function');
    t.ok('sfx.hurt', typeof sfx.hurt === 'function');
    t.ok('sfx.phase', typeof sfx.phase === 'function');
    t.ok('initAudio', typeof initAudio === 'function');
    t.ok('playTone still present', typeof playTone === 'function');
}
