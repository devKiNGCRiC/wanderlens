---
name: review-changes
description: Run the full Wanderlens review pass over the current diff — lint, types, then the react-native, ui, and security reviewers — and report consolidated findings. Use before committing or before asking for a review.
---

# Reviewing changes

Named `review-changes` rather than `code-review` so it doesn't shadow the
built-in `/code-review` command. Use the built-in for a general bug hunt; use
this one for the Wanderlens-specific pass.

## 1. Scope

```bash
git status
git diff
```

Review the diff, not the whole repo. If nothing is uncommitted, ask what to
review.

## 2. Automated checks

```bash
npm run lint
npx tsc --noEmit
```

Both must pass. Report failures with the actual output — don't summarize an
error away.

## 3. Targeted review

Dispatch the subagents whose domain the diff actually touches:

| Diff touches | Agent |
|---|---|
| Screens, components, hooks | `react-native-reviewer` |
| Styles, layout, anything visual | `ui-reviewer` |
| Auth, Supabase, keys, `lib/ai.ts`, a new table | `security-reviewer` |

Running all three on a one-line style change is waste. Pick what fits.

## 4. Manual pass

Things the agents won't catch:

- Does this belong here? (`.claude/rules/architecture.md`)
- Is there an existing helper in `lib/` or component in `components/` that
  already does this?
- Debug `console.log`, commented-out blocks, `TODO` left behind
- A screen added without its guard in `app/_layout.tsx`
- Copy that doesn't sound like the app — check empty and error strings

## 5. Report

Consolidate into one list, deduplicated, ranked by severity:

- **Must fix** — a real defect, with the input or action that triggers it
- **Should fix** — correct but fragile, or inconsistent with the codebase
- **Consider** — genuine judgment calls

State plainly what passed. Don't invent findings to fill the list — "lint and
types pass, nothing else found" is a valid result.
