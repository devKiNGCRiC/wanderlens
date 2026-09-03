# Git rules

## Never without being asked

- Committing
- `git push` (denied in `.claude/settings.json`)
- Force-push, hard reset, or discarding uncommitted work
- `--no-verify`

Work on the branch; let the user decide when it lands.

## Commit messages

Repo history is plain sentences in the imperative-ish past, e.g.
`Created AI caption and trail generator version 1`, `Connect tab Version 1`.
Match that rather than imposing Conventional Commits on an existing history.

Subject line under ~72 characters, describing what changed and why it matters.
Add a body only when the reasoning isn't obvious from the diff.

## Never commit

`.env`, anything matching `.env.*`, `/ios`, `/android`, `node_modules/`,
`.expo/`, keystores (`*.jks`, `*.p8`, `*.p12`). All are gitignored — if one
shows up in `git status`, something is wrong; stop and say so.

## Before committing

1. `git status` and `git diff` — read what's actually staged
2. `npm run lint` and `npx tsc --noEmit`
3. Confirm no secret, debug `console.log`, or commented-out block is riding along

One commit per logical change. Don't bundle a refactor with a feature.
