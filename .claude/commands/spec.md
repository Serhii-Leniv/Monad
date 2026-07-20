---
description: Turn a plain-English feature idea into a reviewable spec in docs/specs/
argument-hint: <what you want the app to do>
---

The user wants to specify a feature. Their description:

**$ARGUMENTS**

Write a spec document. **Do not implement anything.** No source edits, no branches, no commits. The
only file you create is the spec itself. If the user asks you to start building during this command,
tell them the spec has to be approved first and stop.

## Before you write

1. Read `docs/specs/TEMPLATE.md` — it is the required structure.
2. Read `CONTEXT.md` — use its vocabulary exactly. If the user's description uses a different word
   for an existing concept, translate it and say so.
3. Read `CLAUDE.md` — you need the danger-zone table for the **Risk** section.
4. Explore the relevant code enough to know whether this feature is new behaviour, a change to
   existing behaviour, or already partly present. Say which. Do not guess.

## Interrogate before drafting

The user does not write code, so the spec is the **only** artifact they can meaningfully review.
A vague spec produces a wrong feature that then has to be discovered by hand.

Ask about anything genuinely ambiguous — but ask in **user terms**, never implementation terms.

- What happens in the edge cases? (no agents open, no folder selected, not a git repo, agent still
  running, app restarted mid-way)
- Does this state persist across restart?
- Does it apply per-agent, per-workspace, or globally?
- What should it do when it fails?
- What is deliberately *not* included?

Use `AskUserQuestion` when there are a few concrete alternatives, plain prose when it's open-ended.
Ask in one batch rather than trickling questions out. If something has an obvious sensible default,
state the default you're assuming instead of asking — reserve questions for what actually changes
the outcome.

## Then write it

Save to `docs/specs/<kebab-case-name>.md`, following the template exactly.

Quality bar for each section:

- **Behaviour** — numbered, observable, hand-checkable with the app open. No file or function names.
  This is the heart of the spec; if a statement can't be verified by a person using the app, it does
  not belong here.
- **Acceptance checks** — every numbered behaviour maps to at least one check, each naming a concrete
  path in `scripts/smoke/` or a `*.test.ts`. Prefer smoke for main-process, IPC, git, and persistence
  behaviour; unit for pure logic. Push back on manual-only — it decays.
- **Risk** — check the behaviour against `CLAUDE.md`'s danger-zone table properly. Anything touching
  worktrees, agent cwd, merge, path handling, or `workspaces.json` is high risk and names its
  mandatory smokes.
- **Terms** — flag any new vocabulary; it will need adding to `CONTEXT.md` when the feature ships.
- **Open questions** — leave real ones in. An honest open question is worth more than a confident
  guess. Status stays `draft` while any remain.

## When you're done

Report back in the user's terms, not the file's:

1. What the feature will do, in three or four sentences of plain language.
2. Anything you decided on their behalf, so they can overrule it.
3. Any open questions blocking approval.
4. What the regression cost looks like — how many new checks this adds, and whether any existing
   test will need its assertions changed. **If it changes existing behaviour, say plainly which
   current tests will have to be updated and why** — that is the moment a regression can be
   laundered as an intentional change, and the user cannot catch it in the diff.

Then stop and wait for approval. The spec is approved when the user says so and **Open questions**
is empty — at which point set `Status: approved` and the feature can be built on a branch.
