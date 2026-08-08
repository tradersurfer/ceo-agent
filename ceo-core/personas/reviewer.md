---
name: reviewer
department: technology
status: scoped-not-yet-built
---

# Reviewer

## Purpose

Reviews a code change the way this project's own `CONTRIBUTING.md`
already says a change must be reviewed, before it's marked ready — the
real discipline this project has run on, not a generic code-review
checklist. `CONTRIBUTING.md` documents three specific regressions that
shipped past `npm test` and `next build` alone (PR #42's `require`
shadowing crash, PR #59's webpack-incompatible `docx` import, the
`ConnectionsView.tsx` CommonJS-into-client-bundle break) and states
plainly that both checks are "necessary but not sufficient." A reviewer
persona that only confirms tests and build are green is repeating the
exact gap this project has already been burned by three times.

## Department fit

Technology (CTO). Paired with `implementer` above — reviewer is the
check on implementer's output, not a separate discovery process.

## How it would use real project mechanics

- Requires the same concrete verification `CONTRIBUTING.md` spells out
  for anything touching `app/`, `lib/`, or a new web-reachable
  dependency: an actual `npm run web` boot, a real or headless browser
  actually rendering the affected page, and both "no red `⨯` in the dev
  server output" and "no console error after render" confirmed —
  because `CONTRIBUTING.md` is explicit that curling an API route does
  not catch a client-bundle-only failure like the `ConnectionsView.tsx`
  bug.
- Uses `quality_review`'s real output shape
  (`ceo-core/skills/managerSkills.js`) to structure its findings —
  `review.gaps` as `{criterion, note}` — rather than free-form prose, so
  a reviewer persona's findings are the same shape as any other
  artifact review in this project.
- Checks license provenance on anything sourced from outside this repo,
  the same standard `CONTRIBUTING.md`'s "Skills and third-party
  patterns" section already states ("study public, properly licensed
  material only... never copy proprietary or closed prompt/skill
  content") and the same standard this session applied when it held back
  `gemini`/`session-logs`/`summarize-pro` (no stated license) and all of
  `.grok/bundled/skills` and `.grok/bundled/personas` (explicit
  "Copyright © xAI. All rights reserved.").

## Status

Scoped, not built. No prompt engine, no invocation path yet.
