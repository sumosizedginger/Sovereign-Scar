# assets/

Two different kinds of thing live here, and the difference matters.

## Shipped — the build depends on these

| file | read by |
|---|---|
| `icon.ico` | `package.json` → `build.win.icon`; electron-builder stamps it into the `.exe` |
| `icon.png` | `electron/main.cjs` window icon, for un-packaged `npm run desktop`; listed in `build.files` |

**Both are generated.** Do not hand-edit them:

```bash
npm run icon
```

`scripts/make-icon.mjs` is the source of truth, and
`tests/game/app-icon.spec.mjs` regenerates from it and compares bytes — so an
edited binary, or art changed without a regenerate, fails the suite rather than
silently shipping.

## Not shipped — historical captures

`screenshots/*.png` (five files, ~2.9 MB) are **read by nothing**: not
`index.html`, not any module, not any test, not embedded in any markdown. They
are a record of what the game looked like at the time they were taken, listed in
`BUILD_LOG.md`.

`leviathan-boss.png` is the odd one. `tests/boss-e2e.spec.mjs` used to overwrite
it on every full run, which is why `git status` was never clean for the life of
the project; the test now writes to a temp path instead, and the file has been
an orphan since (`docs/FINISHING-PASS-2026-08-11.md` §B2).

Safe to delete if the disk is wanted. Kept because they cost nothing to keep and
they are the only images the project has of its own past.
