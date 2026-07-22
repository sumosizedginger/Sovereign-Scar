# Contributing

## Philosophy

This kit is a **copy-and-hack starting point, not a framework**. Three rules
that keep it that way:

- **Zero build step.** Native ES modules only — no bundler, no transpiler, no
  framework. `three` is vendored under `lib/three/` so the kit runs fully
  offline.
- **Small surface.** Prefer a few excellent, honest examples over many
  shallow ones. Prefer hand-written docs ([docs/API.md](docs/API.md)) over
  generated ones.
- **Genre-neutral core, genre-specific everything else.** `engine/`,
  `voxel/`, `combat/`, and `characters/` should work for a belt-scroller, a
  top-down adventure, or a shmup equally. If a change only makes sense for
  one genre, it belongs in a consumer's own code, not here.

## Running tests

```
npm i
npm test           # full suite: unit specs + browser smoke test (needs Chrome)
npm run test:unit  # unit specs only, <1s, no Chrome required
```

Set `CHROME_PATH` if `tests/harness.mjs`'s `findChrome()` doesn't locate your
browser automatically.

**CI only runs `npm run test:unit`.** GitHub's hosted runners have no GPU, and
headless Chrome's WebGL smoke test proved unreliable there across several
attempts (see the `fix:` commit history around the CI workflow if you're
curious). Run `npm test` locally — it's the real check for anything that
touches rendering, and it's required before tagging a release.

## Writing specs for gameplay rules

Two rules earned the hard way, both by shipping a green suite over a broken
game. See [ZeldaLevel.md](ZeldaLevel.md) §6 for the full post-mortems.

**Test reachability, not just the mechanism.** A spec that *constructs* the
situation it tests only proves the mechanism exists. `bestiary.spec.mjs`
asserted a bulwark's front plate blocked melee by placing the attacker in front
of it by hand — and passed for the entire time the bulwark was literally
unkillable, because enemy facing snapped at the player every frame and the flank
was geometrically unreachable. A spec for a combat rule should **drive the real
code from where the player actually stands**: simulate movement at player speed,
step the production update loop, and assert the counterplay can be *reached*.

**Measure the player, not only the content.** The difficulty curve looked fine
until weapon damage went in the denominator; it was in fact running backwards,
with beats 05–14 dying in under two hits. If a number describes a fight, express
it in the unit the player experiences — landed hits, seconds — not in HP.

And when a design rule is worth having, ship the spec that makes violating it a
build failure. Design intent that is not enforced decays back into bugs.

## Code style

Match the neighbors: 4-space indent, LF line endings, no semicolon-free
style debates — just follow whatever the file you're editing already does.
`.editorconfig` enforces the mechanical parts. Doc comments (`/** ... */`)
on exported functions follow the existing terse, gotcha-focused style — state
the non-obvious constraint, skip restating the parameter names the signature
already shows.

## Pull requests

- One logical change per PR; keep the diff reviewable.
- Run `npm test` locally before opening (CI only runs the unit subset — see above).
- If you touch a public export's behavior, update
  [docs/API.md](docs/API.md) and `CHANGELOG.md` in the same PR.
- New genre-neutral capability → add or extend an example
  (`examples/*.html`) proving it, the same way `topdown-8way.html` and
  `voxel-showcase.html` do today.
