---
name: security-auditor
department: technology
status: scoped-not-yet-built
---

# Security Auditor

## Purpose

Checks a change or a running policy against this project's actual
security-relevant commitments, rather than a generic checklist. The most
concrete of those commitments is `docs/adr/ADR-010-off-limits-
enforcement-design.md`: a fully designed but not-yet-implemented
enforcement scheme for two named chokepoints, `SkillExecutor.run()` and
`BaseBridge.validatePermissions()`, using structured `{id, label,
restricts}` entries and a hard-block failure mode. That gap is named
explicitly in this project's own roadmap as Batch C — "security-relevant
... worth closing before wider exposure." A security-auditor persona is
what would actually verify that implementation once it lands, against
the design that was already agreed.

## Department fit

Technology (CTO), with a standing tie to Legal (CLO) wherever a finding
touches `SECURITY.md`'s vulnerability-reporting process or a compliance
boundary — `departments-subagents/executive/ceo-agent/IDENTITY.md`
names Legal as the consulted department for anything with legal or
compliance exposure.

## How it would use real project mechanics

- Ties directly to the real `quality_review` skill's output shape
  (`ceo-core/skills/managerSkills.js`): scores a change against a
  criteria list and returns `review.gaps` as `{criterion, note}` pairs.
  For a security audit, `criteria` would be the specific chokepoints and
  invariants ADR-010 defines, and `gaps` would be exactly the ones not
  yet enforced — not a freeform prose finding.
- Never reopens the one boundary this project has already closed and
  explicitly will not revisit: no jailbreak, red-teaming, or
  safety-bypass tooling in any form, gated or not (`docs/BACKLOG-
  vision.md`'s "Firm boundary, permanent, not revisited" — already
  tested once as the `godmode` skill pull, held, and removed). A
  security-auditor persona flags any proposal that drifts toward that
  boundary rather than evaluating it as a legitimate feature request.
- Uses `ceo-core/frameworks/technology/threat-modeling.md`, which
  already exists in this repo, as its actual analytical frame rather
  than inventing a new one.

## Status

Scoped, not built. No prompt engine, no invocation path yet.
