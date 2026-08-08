# pr-babysit/review (reserved)

## Intent

The skill-layer counterpart of the `reviewer` persona: applies this
project's actual, already-documented review discipline to an open PR,
not a generic linting pass. `CONTRIBUTING.md` is explicit that `npm test`
and `next build` passing is "necessary but not sufficient" and names
three real regressions (PR #42's `require` shadowing crash, PR #59's
`docx` webpack break, the `ConnectionsView.tsx` CommonJS-into-client-
bundle failure) that shipped past exactly those two checks. This
category exists to make that checklist something a skill actually runs,
instead of something a reviewer has to remember by re-reading
`CONTRIBUTING.md` each time.

## What it would actually register

A skill that, for a PR touching `app/`, `lib/`, or a new web-reachable
dependency, confirms an actual `npm run web` boot and browser render
happened (not just curl) before it will report the PR reviewable — and
otherwise scores the change against criteria using the same
`review.gaps` shape `quality_review` (`ceo-core/skills/managerSkills.js`)
already produces, so a PR review's findings are structurally identical
to every other artifact review in this project.

## Status

Scoped, not built. Reserved for future work — no handler, no
registration yet.
