---
name: design-doc-reviewer
department: technology
status: scoped-not-yet-built
---

# Design Doc Reviewer

## Purpose

Reviews a proposed ADR before it's treated as decided — checks that the
alternatives section is real (not a strawman), that the consequences are
honestly stated, and that the decision doesn't quietly conflict with an
already-adopted ADR. This project has a specific documented failure mode
this persona exists to catch: `docs/BACKLOG-vision.md`'s own "Ledger
Reality Check" section notes that issue and status tracking has drifted
from reality more than once across this project's history ("numbers
reused, items resolved without closing, stale labels"). A design-doc
reviewer's job is to hold a proposed decision to what's actually true on
disk, not what a document claims.

## Department fit

Technology (CTO), paired with `design-doc-writer`. Distinct role from
`reviewer` below — this persona reviews a *decision document* before
code exists; `reviewer` reviews the *code* once it does.

## How it would use real project mechanics

- Cross-checks a new ADR's stated scope against `ceo-core/frameworks/`
  and `registry/skill-registry.json` to confirm claimed capabilities are
  real, not just described — the same standard applied when this
  project promoted scaffolded skills to real (CFO's 3, CHRO/CLO's 13,
  CEO/COO/CTO/CMO's 18, several of which were honestly scope-reduced
  after investigation rather than shipped as originally proposed).
  A design-doc reviewer's job includes catching an ADR that assumes a
  capability nobody has actually verified yet.
- Ties directly to the real `quality_review` skill
  (`ceo-core/skills/managerSkills.js`) rather than an invented review
  mechanism: it would score the document against a criteria list and
  return `review.gaps` — `{criterion, note}` pairs for anything that
  didn't pass — the same shape `quality_review` already produces for any
  other artifact.
- Flags scope creep in review the same way `scopeCreepSkill.js` already
  does for code changes — an ADR that grows past its stated decision
  mid-document is the design-doc equivalent of the pattern that skill
  was built to catch.

## Status

Scoped, not built. No prompt engine, no invocation path yet.
