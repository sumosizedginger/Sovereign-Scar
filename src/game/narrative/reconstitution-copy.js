// What GUMOI says when it puts the player back together.
//
// WHY THIS IS ITS OWN FILE
//
// It was ten lines inside `src/game/index.js`, a 2100-line boot-and-frame-loop
// file. Almost nothing in that file can honestly be moved out of it — every
// other function there closes over the renderer, the player, the level, the
// menu or the HUD, and pulling one out replaces a closure with a twenty-
// argument call, which is the same coupling with more places to get it wrong.
// See `docs/ARCHITECTURE.md` for the full audit and the list of extractions
// that were deliberately NOT done.
//
// This one is different, and that is the whole reason it moved: it is a pure
// function of saved progress. No renderer, no scene, no singletons, nothing
// mutable. Given the same progress it returns the same sentence, which means
// it can be tested directly rather than by driving a death in a browser — and
// it was not tested at all while it lived in the boot file, because reaching it
// required booting the game.
//
// It is also narrative content, and narrative content belongs with the
// narrative code.

/**
 * The line GUMOI speaks over a reconstitution, chosen by how much of the player
 * it has left to work with.
 *
 * The two named outcomes come first because they are about the SITUATION, not
 * about the player's remaining charges: a run that has ended and an expedition
 * that has broken are both places where the charge count is not the point.
 *
 * Below that the line degrades with `lives.charges`, and the degradation is the
 * mechanic being spoken out loud: fewer charges, less of you left, terser and
 * colder voice. A missing charge count reads as "plenty" rather than "none",
 * because an absent field means a save that predates the lives system, and a
 * migrated save should not be greeted as though the player were nearly gone.
 *
 * @param {{ lives?: { charges?: number } }} progress saved progress
 * @param {string} [outcome] 'run_end' | 'expedition_break' | anything else
 * @returns {string}
 */
export function reconstitutionLine(progress, outcome) {
    if (outcome === 'run_end') return 'I remember you. The world does not.';
    if (outcome === 'expedition_break') {
        return 'I can rebuild you, but not here. This place has eaten the route.';
    }
    const charges = progress?.lives?.charges;
    if (charges == null || charges >= 4) return 'Again. I still remember enough of you.';
    if (charges >= 2) return 'The Link is losing detail. Stop making me rebuild your hands.';
    return 'One clean memory remains.';
}
