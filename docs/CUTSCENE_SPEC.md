# Task: implement `src/game/narrative/cutscene.js`

You are writing ONE new file in this repo. Read the surrounding code first. Do not
modify any existing file — another engineer is editing them right now and your edits
would be thrown away.

## Context

Sovereign Scar is a hand-made voxel Zelda-like. Zero build step: plain ES modules
loaded straight from disk by the browser, `import` with explicit `.js` extensions, no
bundler, no TypeScript, no new dependencies. Three.js is available as `three`.

The game already has everything needed to *show* a cutscene and nothing that can
*run* one. You are writing the thing that runs one.

Read these before writing anything:

- `src/game/ui/story.js` — `StoryPanel`. Reached at runtime as `game.hud.story`.
  `queue(lines, opts)` takes a string[] or `{speaker, text, hold, id, priority}[]`.
- `src/game/camera-rig.js` — `CameraRig`, reached as `game.cameraRig`. It has
  `focus({height, back, duration, target})` and `clearFocus()` today. Assume a
  `hold({target, height, back, duration})` **will exist** by the time this lands —
  another engineer is adding it. Call it; do not write it.
- `src/game/index.js` — the frame loop. Look at how `ending.isActive` gates
  gameplay, and how the menu block drains input latches. Read only; change nothing.
- `src/game/input.js` — the `consume*()` latches. Note `consumeInteract()` is a
  SINGLE latch shared by seven different systems.

## What to build

```js
export class CutsceneDirector {
    constructor(opts = {})            // { onDone } optional
    play(game, scene)                 // scene = { id, skippable = true, beats: [...] }
    update(dt, game)                  // stepped from the frame loop
    skip(game)                        // jump to the end immediately
    stop(game)                        // hard stop, release everything
    get active()                      // boolean
}
```

A **beat** is `{ at, camera?, story?, fade?, sfx?, fn? }`:

- `at` — seconds from the start of the scene. Beats fire in `at` order, each exactly
  once, and a beat whose time is already past when the scene starts still fires.
- `camera` — `{ target: {x,y,z}, height?, back?, duration? }`, passed to
  `game.cameraRig.hold(...)`. Absent means leave the camera alone.
- `story` — passed straight to `game.hud.story.queue(...)`.
- `fade` — `{ to: 'black'|'white'|null, duration }`. Call `game.fade?.to(...)` /
  `game.fade?.from(...)` if present; if absent, skip it silently. Do not implement
  fading yourself, and do not crash when it is missing.
- `sfx` — a string naming a method on `game.sfx`; call it if it exists.
- `fn` — `(game) => void`, called last.

Every optional hook must be called defensively (`?.`) so a scene that names something
the build does not have degrades to a no-op instead of throwing mid-cutscene.

## The requirement that matters more than the rest

**`game.cinematic` must never be left `true`.** It gates player control. If it sticks,
the player's controls are dead and the only way out is a reload. This project has
already shipped two softlocks and is not shipping a third.

It must be cleared on ALL of: natural completion, `skip()`, `stop()`, and an exception
thrown from any beat's `fn`. Put the release in a single private method and make every
one of those paths go through it. Wrap beat dispatch in try/catch: a scene that throws
must still hand control back, and should report the error rather than swallow it.

Also: `play()` must refuse to start and return `false` when a boss fight is active
(`game.activeBoss`) or the current room is sealed (`game.level?.sealState?.()` reports
active). Taking control away mid-fight is worse than skipping the scene.

While active, drain the input latches each frame the way the menu block in `index.js`
does, so a press during a cutscene does not fire the instant it ends.

## Style

Match the file you see around you. This codebase comments **why**, not what — most
comments in it exist because something went wrong once. Terse, plain, no marketing
adjectives, no restating the code. Look at `story.js` and `camera-rig.js` for the
register. British-ish spelling is used in places; follow the local file.

Do not add a test file — the spec is being written separately.

## Deliverable

Write the file to `src/game/narrative/cutscene.js`. Report what you wrote and any
assumption you had to make. If something in this spec is impossible or contradicts the
code you read, say so instead of inventing an API.
