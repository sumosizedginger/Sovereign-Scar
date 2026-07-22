import { AnchorThread } from '../../src/game/narrative/anchor-thread.js';

export function run(t) {
    const spoken = [];
    const saves = [];
    const base = { bossesDefeated: [], thread: null };
    const easy = new AnchorThread({
        progress: base, mode: 'easy',
        story: { queue: (line) => spoken.push(line) },
        persist: (state) => saves.push(state),
    });
    t.ok('fresh Thread points to Crypt', easy.destination().beat === 'beat-01-crypt');
    t.ok('Easy Recall is explicit', easy.recall().startsWith('SYSTEM:'));
    easy.update(30);
    t.ok('Easy auto-escalates at thirty seconds', easy.state.hintTier === 1 && spoken.length === 1);
    easy.update(30);
    t.ok('Easy reaches direct tier at sixty seconds', easy.state.hintTier === 2 && spoken.length === 2);
    easy.markProgress('room_entered');
    t.ok('meaningful progress resets stuck time', easy.state.idleSeconds === 0);
    easy.state.hintTier = 0;
    easy.failed('locked-door', 'SYSTEM: Find a small key.');
    easy.failed('locked-door', 'SYSTEM: Find a small key.');
    easy.failed('locked-door', 'SYSTEM: Find a small key.');
    t.ok('repeated failure produces precise SYSTEM guidance',
        spoken.some((line) => line.text === 'SYSTEM: Find a small key.'));

    const hard = new AnchorThread({ progress: base, mode: 'hard' });
    hard.update(500);
    t.ok('Hard has no automatic hints', hard.state.hintTier === 0);
    t.ok('Hard Recall gives contextual help', !hard.recall().startsWith('SYSTEM:'));
    const lens = new AnchorThread({
        progress: base, mode: 'hard', hasItem: (id) => id === 'cipher_lens',
    });
    t.ok('Cipher Lens clarifies Recall', lens.recall().startsWith('SYSTEM:'));
    const afterCrypt = { bossesDefeated: ['crypt_warden'], thread: easy.state };
    easy.sync(afterCrypt);
    t.ok('boss progress advances destination', easy.destination().beat === 'beat-02-spindle');
    t.ok('Thread state persists', saves.length > 0);
}
