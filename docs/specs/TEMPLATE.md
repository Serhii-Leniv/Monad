# <Feature name>

- **Status:** draft | approved | shipped | superseded
- **Written:** YYYY-MM-DD
- **Shipped in:** v0.0.0 _(fill on merge)_

## Problem

What the user was trying to do and what got in the way. Concrete and situational — "I had four
agents running and couldn't tell which one was waiting on me" beats "add status indicators."

One paragraph. If this section is hard to write, the feature is not ready to build.

## Behaviour

Numbered, observable statements. Each one describes something a person can see or do in the app.
No implementation — no file names, no function names, no data structures.

1. When I <do something>, <observable result>.
2. When I <do something else>, <observable result>.
3. <State that persists> survives an app restart.

Write these so that a person with the app open could check each one by hand. If a statement can't
be checked that way, it belongs in **Notes**, not here.

## Out of scope

What this deliberately does *not* do. This section prevents scope drift and stops a later reader
from treating an omission as a bug.

- <thing that sounds related but isn't included>

## Acceptance checks

How each behaviour above is proven. Every numbered behaviour needs at least one entry, and every
entry names the check that will exist in the repo after this ships.

| # | Check | Kind | Where |
|---|---|---|---|
| 1 | <what is asserted> | smoke / unit / manual | `scripts/smoke/<name>.cjs` or `src/**/<name>.test.ts` |
| 2 | <what is asserted> | unit | `src/renderer/src/<name>.test.ts` |
| 3 | <what is asserted> | smoke | `scripts/smoke/<name>.cjs` — **must be wired into `.github/workflows/ci.yml`** |

**Manual-only is a last resort.** A check that exists only as "someone looks at it" will not
survive the next feature. Use it only for genuinely visual things (animation, spacing, colour), and
say so explicitly.

Rule from [CLAUDE.md](../../CLAUDE.md): _a feature is not complete until a test exists that would
fail if the feature were removed._

## Terms

Domain terms this feature uses, and any new ones it introduces. Existing terms must match
[CONTEXT.md](../../CONTEXT.md) exactly — check before inventing a synonym.

- **<term>** — <meaning>. _(existing / new)_

If this feature introduces a new term, add it to `CONTEXT.md` in the same PR.

## Risk

Which danger zones from [CLAUDE.md](../../CLAUDE.md) this touches, if any: worktree lifecycle, agent
cwd pinning, merge onto base branch, file-panel path handling, `workspaces.json` read/write, preload
bridge / CSP.

State which smokes are therefore mandatory. Write "none" if it touches no danger zone — but check
the list before writing it.

## Decisions

Choices made while specifying this, with the reason. If any of them is architectural — something a
future contributor might otherwise reverse without knowing why — write an ADR in `docs/adr/` and
link it here.

- <decision> — <why> _(→ ADR-NNN, if applicable)_

## Open questions

Anything unresolved. **The spec is not approved while this section has entries.**

- [ ] <question>

## Notes

Anything else worth recording: prior art, rejected alternatives, things to revisit later.
