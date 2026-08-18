# Licensing — the decision, and what it rules out

**Status: settled 2026-08-17. The whole repository is MIT, game content
included.** This document previously set out three options and declined to
choose between them, because the choice alters what people may do with the work
and that is the owner's call, not an engineer's. The owner made it. What follows
records what was chosen, what the files now say, and — because this is the part
that matters later — what was given up by choosing it.

---

## 1. The decision

Everything in this repository is licensed under the MIT License: the engine, the
gameplay systems, the tooling, the tests, and equally the **content built with
them** — the fourteen dungeon layouts, the narrative text, the character and
boss designs, and the score.

Anyone may take any of it, modify it, fork it, ship it and sell it, provided the
copyright notice travels with the copy. Copyright remains with the author, and
the author keeps the right to relicense the work in future or to license it
differently to a specific party. What the author does **not** keep is
exclusivity.

## 2. What the files say now

| file | what it says | changed? |
|---|---|---|
| `LICENSE` | The MIT License in full, under a preamble stating that "the Software" means the content as well as the code, and that nothing is reserved. `Copyright (c) 2026 sumosizedginger`. | **preamble added** |
| `package.json` | `"license": "MIT"` — the SPDX identifier for the whole package. | unchanged, already correct |
| `README.md` | "MIT, including the game content", with the reasoning and a pointer here. | **rewritten** |
| `LICENSE`, last lines | "Third-party components retain their own licenses: Three.js (lib/three/) — MIT, see lib/three/LICENSE." | unchanged, still true |

The three now agree, which is the whole point of the exercise. The state before
this pass was not *wrong* — MIT with no carve-out is what `LICENSE` and
`package.json` always said — but the README added "Game content © project
authors", which **reads** as a reservation and reserves nothing, since MIT
already leaves copyright with the author. A reader deciding whether they could
fork the dungeons had to guess. Now they do not.

The vendored dependencies were never in question and are unaffected: three.js is
MIT and its licence travels with it, which is why the Pages artifact ships
`lib/three/LICENSE` and `lib/three/addons/LICENSE`.

## 3. What this rules out, stated plainly

A licence is easy to loosen and hard to tighten, and MIT is the loose end of the
range. Publishing under it has consequences that are worth having written down
in advance rather than discovered:

- **Someone may ship this game.** Not just the engine — the whole game, the
  fourteen dungeons and the story, under their own name, for money, without
  asking and without paying. They must carry the copyright notice; that is the
  entire obligation. This is the intended consequence of choosing MIT for the
  content, not a loophole in it.
- **Revoking it does not reach copies already made.** The author may relicense
  the project tomorrow, but every copy taken under MIT stays MIT forever. There
  is no recall.
- **A storefront release is unaffected but not protected.** Selling this on a
  store is entirely compatible with MIT; MIT simply does not stop anyone else
  from selling the same thing beside it.
- **Contributions arrive under the same terms** unless a contributor agreement
  says otherwise, and there is none. That is normal and usually desirable, but
  it means the author does not hold sole copyright over the tree once other
  people commit to it — which matters if relicensing is ever considered, because
  it then needs their agreement too.

If any of those become unacceptable, the change has to happen **before** the next
public artifact, not after.

## 4. The alternatives that were not chosen

Recorded so that a future reconsideration starts from the analysis rather than
repeating it.

### B. Code MIT, original game content reserved

The engine, systems, tooling and tests open; the narrative, world, characters,
dungeon designs and score closed, so nobody may ship a game containing them.

Rejected as a matter of intent, but its cost is the reason it would have needed
committing to rather than drifting into. All of the following are required,
because **a split announced only in a README is not a split**:

1. **`LICENSE` must state the split and define the boundary.** MIT grants rights
   to "the Software" with no exception, so an exception has to be built around
   it — a preamble naming which paths are MIT and which are reserved, or two
   files (`LICENSE-CODE`, `LICENSE-CONTENT`) with a `LICENSE` pointing at both.
2. **The boundary has to be a file list, not a category.** This repository has
   no art assets and no audio files; the narrative, the levels and the music
   *are source code* — `src/game/levels/`, `src/game/narrative/`,
   `src/game/audio/tracks.js`, `src/game/bosses/roster.js`, story text in
   `src/game/ui/`. A licence treating them differently from the engine has to
   name paths, because the file extension will not, and that list has to be
   maintained forever.
3. **`package.json` must stop saying `MIT`.** SPDX has no expression for "MIT
   for some paths"; the honest value is `"license": "SEE LICENSE IN LICENSE"`.
   A `LICENSE` and a `package.json` that disagree is the worst available state,
   because the machine-readable answer and the human-readable one conflict and
   every scanner believes the machine.
4. **The reserved half needs a stated permission**, or it is "all rights
   reserved" — meaning nobody may fork the repository at all, not even to fix a
   bug, because a fork copies the content too.

### C. Other splits

- **Code MIT, content CC BY-NC-SA.** Same structural work as B, but the reserved
  half gets an off-the-shelf licence with known meaning instead of a bespoke
  sentence.
- **Source-available throughout** (e.g. PolyForm Noncommercial): one licence, no
  boundary to maintain, but the code stops being reusable in the way MIT makes
  it.
- **Dual licence**: MIT for code, a commercial arrangement for the content. Only
  worth the paperwork once someone actually asks.

## 5. Loose ends

- **`README.md` points at `../Sovereign-Scar-Narrative-Bible.md`** and two
  sibling documents in the parent folder. Those files are **not in the tree**,
  so `LICENSE` does not reach them either way. If they are meant to be MIT they
  have to be committed; if they are meant to stay private, the README should say
  so rather than linking to a path only the author can resolve.
- **No `NOTICE` or per-file headers.** MIT does not require them and adding them
  to several hundred files would be noise. The single `LICENSE` at the root is
  sufficient and is what the Pages and Electron artifacts ship.
