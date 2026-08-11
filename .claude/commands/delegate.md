---
description: Route a task to an external CLI agent (grok / agy / reasonix) and review the result
---

# Delegate to an external agent

Run the task below on one of the local CLI agents, then **review its output yourself
before anything lands**. These are separate processes with no knowledge of this
project's rules — treat everything they return as a draft written by a stranger.

Task: $ARGUMENTS

## The bench

All three are on PATH, authenticated, and verified working in headless mode
(smoke-tested 2026-08-08 — all returned clean stdout and exit 0).

| Agent | Invoke | Notes |
|---|---|---|
| Grok Build | `grok -p "..."` | Read the repo accurately in testing. Good default for code reasoning. |
| Antigravity | `agy -p "..."` | Gemini-backed. `--dangerously-skip-permissions` for unattended writes — sandbox only. |
| Reasonix | `reasonix run "..."` | DeepSeek Flash, cheapest, prints token cost. **Fails closed on writes without `-y`.** |

Long jobs: launch with the Bash tool's `run_in_background: true` and collect later.
Always pass a timeout — a stalled agent should not eat the session.

## Route by task type

**Send them:**
- Read-only analysis: "does X exist anywhere", "trace this call path", "find every caller of Y"
- Second opinions on a design decision, where disagreement is the useful output
- Bounded, self-contained new files with a crisp spec and no repo-wide blast radius
- Cross-checking my own reasoning — ask the same question of two agents and compare

**Do not send them:**
- Anything requiring the counterfactual discipline (revert the fix, watch a named spec
  fail, restore). They will not do it and will report success regardless.
- Anything measured rather than reasoned. This project's expensive bugs were all found
  by probes and by playing the game, not by writing more code. See `HANDOFF.md` traps.
- Level/authoring changes. Geometry the owner has played is not a thing to hand off.

## Hard rules — these exist because of real incidents

1. **They never commit and never push.** `origin` here points at **My-Engine**, not this
   game. A stray `git push` publishes Sovereign Scar to the wrong repo — that has
   happened, for three sessions. I do all commits, with the URL spelled out.
2. **They never write into the live working tree while I am editing it.** Concurrent
   edits clobber silently. Either give read-only tasks, or isolate with
   `git worktree add` and merge the result deliberately.
3. **Their green is not green.** `npm test` is run by me, in this tree, after review.
   An agent reporting "tests pass" is a claim, not a result.
4. **Report what they actually produced**, including when it was wrong or when I threw it
   away. Their output is not evidence of work done.
