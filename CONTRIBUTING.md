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

## Running the checks

```
npm i
npm run check      # lint + typecheck + unit specs — run this before every push
npm test           # full suite: unit specs + browser E2E (needs Chrome)
```

Individually:

```
npm run lint       # ESLint, seconds
npm run typecheck  # tsc --checkJs over the checked trees, seconds
npm run test:unit  # unit specs only, ~90s, no Chrome required
npm run pages      # stage and validate the browser artifact
```

Counts move every session, so treat any number written in a document as a
hypothesis and run the thing. `npm test` prints the only figure that counts.

Set `CHROME_PATH` if `tests/harness.mjs`'s `findChrome()` doesn't locate your
browser automatically.

**CI does not run the browser half.** GitHub's hosted runners have no GPU, and
headless Chrome's WebGL smoke test proved unreliable there across several
attempts (see the `fix:` commit history around the CI workflow if you're
curious). It runs lint, typecheck, the unit specs, and a build-and-validate of
the Pages artifact. Run `npm test` locally — it's the real check for anything
that touches rendering, and it's **required before tagging a release**, because
a tag builds and attaches desktop binaries.

### Static analysis, and what it is for

`npm run lint` is correctness only. It has no opinion about formatting, quotes,
semicolons, import order or line length, and it never will — `.editorconfig` and
"match the neighbours" cover that. If a rule ever produces mostly noise here,
scope or disable it *with the reason written in `eslint.config.js`*, the way the
existing disables are. Do not silence a finding to reach green.

`npm run typecheck` covers `src/game/kernel/`, `world/`, `combat/` and
`physics/` — the files carry `// @ts-check` on line 1 and
`tests/game/typecheck-boundary.spec.mjs` fails if one loses it. To bring another
tree in: add it to `include` in `tsconfig.json`, add the pragma, and fix what
`tsc` reports — which is nearly always a JSDoc `@param` that describes an
options object less completely than the code uses it. **Do not add `@ts-ignore`
to close the gap.** An ignored error is a lie with a comment on it.

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
