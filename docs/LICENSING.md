# Licensing — what the repository currently says, and the decision it needs

**Status: unresolved, and it needs the owner, not an engineer.** Nothing in this
pass changed the licence, the `LICENSE` file, or the `license` field in
`package.json`. This document reports what those files communicate today, where
they disagree, and what each possible intention would require. Choosing between
them is a policy decision about rights, and it is not one to make by inference.

---

## 1. What is on disk right now

| file | what it says |
|---|---|
| `LICENSE` | The MIT License, in full. `Copyright (c) 2026 sumosizedginger`. Grants rights "to deal in the Software … without restriction", including to "use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies". |
| `package.json` | `"license": "MIT"` — the SPDX identifier for the whole package. |
| `README.md` | "MIT (inherits kit license). Game content © project authors." |
| `LICENSE`, last lines | "Third-party components retain their own licenses: Three.js (lib/three/) — MIT, see lib/three/LICENSE." |

The vendored dependencies are consistent and not in question: three.js is MIT
and its licence travels with it (the Pages artifact ships `lib/three/LICENSE`
and `lib/three/addons/LICENSE` for exactly that reason). My-Engine 0.2.0, from
which `src/engine/`, `src/voxel/`, `src/combat/`, `src/characters/` and
`src/audio/` are vendored, is the "kit" the README refers to.

## 2. Where they disagree

**The MIT grant has no carve-out, and "Game content © project authors" is not
one.**

MIT already leaves copyright with the author — that is what the "Copyright (c)"
line at the top of it means. Restating authorship therefore reserves nothing. A
reader who wanted to take the narrative text, the fourteen dungeon layouts, the
boss designs, the composed score, or the art direction and ship them in their
own game would read `LICENSE` plus `package.json` and conclude, reasonably, that
MIT covers all of it. The `README.md` sentence does not contradict that; it
reads as a note about who wrote the thing, not as a reservation of rights.

Three further points a reader would notice:

- **"Content" is never defined anywhere.** In a repository with no art assets
  and no audio files, the narrative, the levels and the music are *source code*
  — `src/game/levels/*.js`, `src/game/narrative/*.js`, `src/game/audio/tracks.js`.
  A licence that means to treat them differently from the engine code has to say
  which files it means, because the file extension will not.
- **`package.json` is the machine-readable answer** and it says MIT, flatly. Any
  tool that resolves licences — an SBOM generator, a corporate scanner, npm
  itself — will report this project as MIT with no reservation.
- **Some of the design source is already outside the repository.** `README.md`
  points at `../Sovereign-Scar-Narrative-Bible.md` and two sibling documents in
  the parent folder. Those are not in the tree and are not covered by `LICENSE`
  either way.

## 3. The options

### A. The whole repository is MIT, deliberately

**What it means.** Anyone may take the code, the levels, the story, the music
and the world, modify them, and sell the result, provided they carry the
copyright notice. The author keeps copyright and keeps the right to relicense;
they do not keep exclusivity.

**What would need to change.** Almost nothing — `LICENSE` and `package.json`
already say this. The one edit is to **remove or rewrite the README sentence**,
because "Game content © project authors" reads as a reservation and there is
none. Something like:

> MIT, including the game content. Copyright remains with the author; the
> licence grants everyone else the right to use it.

**Choose this if** the point of publishing is that people can learn from it and
build on it, and being copied is acceptable.

### B. Code under MIT, original game content reserved

**What it means.** The engine, the systems, the tooling and the tests are open.
The narrative, the world, the characters, the fourteen dungeon designs and the
score are not — nobody may ship a game containing them.

**What would need to change**, and all of it is required, because a split that
is only announced in a README is not a split:

1. **`LICENSE` must state the split and define the boundary.** MIT's own text
   grants rights to "the Software" with no exception, so the exception has to be
   added around it — conventionally, a short preamble above the MIT text naming
   which paths are MIT and which are reserved, or two files (`LICENSE-CODE` and
   `LICENSE-CONTENT`) with a `LICENSE` that points at both.
2. **The boundary has to be a file list, not a category.** "Content" is not a
   file extension here. It would need to name paths — plausibly
   `src/game/levels/`, `src/game/narrative/`, `src/game/audio/tracks.js`,
   `src/game/bosses/roster.js`, the story text in `src/game/ui/`, and the design
   documents — and that list has to be maintained, which is a real ongoing cost.
3. **`package.json` must stop saying `MIT`.** SPDX has no expression for
   "MIT for some paths"; the honest value is `"license": "SEE LICENSE IN LICENSE"`.
   Leaving it as `MIT` while the `LICENSE` file says otherwise is the worst of
   the available states, because the machine-readable answer and the
   human-readable one disagree.
4. **The reserved half needs a stated permission**, or it is simply "all rights
   reserved" — which means nobody may fork the repository at all, including to
   fix a bug, because a fork copies the content too. Most projects that do this
   grant something narrow: read, fork and modify for personal use, no
   redistribution of the content.

**Choose this if** the game is meant to remain the author's, and the code is the
part being shared.

### C. Some other deliberate split

Nothing in `README.md`, `HANDOFF.md`, `REVIEW.md`, `CONTRIBUTING.md` or the
commit history states a different intent, so there is no evidence for a third
option — but the obvious ones exist and are worth naming:

- **Code MIT, content CC BY-NC-SA** (or another Creative Commons term). Same
  structural work as B, but the reserved half gets an off-the-shelf licence with
  known meaning instead of a bespoke sentence.
- **Everything under a source-available licence** (e.g. PolyForm Noncommercial):
  one licence, no boundary to maintain, but the code stops being reusable in the
  way MIT makes it.
- **Dual licence**: MIT for the code, and a separate commercial arrangement for
  anyone wanting the content. Only worth the paperwork if someone asks.

## 4. What this pass did and did not do

**Did:** read the three files, identify the inconsistency, write this.

**Did not:** change `LICENSE`, change `package.json`, or change the README's
licence sentence. Every one of those alters what someone is permitted to do with
the work, and that is the owner's call. The README now links here so a reader
who notices the ambiguity finds the analysis rather than guessing.

**The one thing that is safe to say either way:** the current state is
*ambiguous*, not wrong. Nobody has been misled yet because nothing has been
distributed under it at scale. Publishing to GitHub Pages and GitHub Releases
changes that — the game becomes something people can find, play and fork — which
is why this is worth settling now rather than later.
