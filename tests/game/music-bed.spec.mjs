// Music bed API — layered drones + pulse update.

import {
    initAudio, startMusicBed, stopMusicBed, updateMusicBed,
    currentMusicBed, stopAllDrones, playDrone, stopDrone,
} from '../../src/audio/synth.js';

export function run(t) {
    // Without AudioContext (node), beds no-op safely
    t.ok('startMusicBed no-throw', (() => { try { startMusicBed('crust'); return true; } catch (e) { return false; } })());
    t.ok('updateMusicBed no-throw', (() => { try { updateMusicBed(0.1); return true; } catch (e) { return false; } })());
    t.ok('stopMusicBed no-throw', (() => { try { stopMusicBed(); return true; } catch (e) { return false; } })());

    // Profiles accepted
    for (const name of ['crust', 'abyss', 'boss', 'leviathan']) {
        try {
            startMusicBed(name);
            t.ok(`bed profile ${name}`, true);
        } catch (e) {
            t.ok(`bed profile ${name}`, false, String(e));
        }
    }
    stopMusicBed();
    stopAllDrones();

    // API surface
    t.ok('currentMusicBed is fn', typeof currentMusicBed === 'function');
    t.ok('playDrone is fn', typeof playDrone === 'function');
    t.ok('stopDrone is fn', typeof stopDrone === 'function');
    t.ok('initAudio is fn', typeof initAudio === 'function');
}
