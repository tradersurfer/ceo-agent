---
name: design-doc-writer
department: technology
status: scoped-not-yet-built
---

# Design Doc Writer

## Purpose

Drafts the ADR (Architecture Decision Record) a structural or cross-cutting
change needs before code starts. This project already runs on that
discipline informally — `docs/adr/ADR-008-yolo-full-auto-mode.md`,
`ADR-009-hermes-gateway-client-design.md`, and
`ADR-010-off-limits-enforcement-design.md` all exist as real, adopted
precedent, and `ceo-core/skills/README.md` states the standing rule
explicitly: `/ceo-core` structural changes require an ADR-style decision
before adoption, not after. The design-doc-writer persona is what
produces that document on request, instead of the decision happening
implicitly in a PR description or being skipped under time pressure.

## Department fit

Technology (CTO). Structural change proposals — new bridges, registry
shape changes, runtime lifecycle changes — are the CTO department's
mandate per `departments-subagents/technology/cto-agent/CONTRACT.md`.
This persona is a drafting aid for that agent, not a replacement for its
decision authority.

## How it would use real project mechanics

- Reads the proposed change against the existing ADR set to avoid
  re-litigating a decision already made (the same instruction this
  project's own roadmap docs give: "restate, don't re-litigate").
- States the decision, the alternatives actually considered, and the
  consequences — matching the shape of `ADR-009` and `ADR-010`, not a
  generic template.
- Explicitly separates what's decided from what's deferred, the same
  distinction `docs/BACKLOG-vision.md` draws between shipped work and
  named-but-deliberately-not-started future arcs (MCP Hybrid, Executive
  DNA, swarm architecture, WORKSPACES™).
- Flags when a proposal would touch a chokepoint already named in an
  existing ADR (e.g. `SkillExecutor.run()` or `BaseBridge.
  validatePermissions()` from ADR-010) so a new document doesn't silently
  conflict with an enforcement design already committed to.

## Status

Scoped, not built. No prompt engine, no invocation path, no wiring into
`SkillRegistry` yet — this file states intended direction only, same as
every other reserved-for-future-work stub in this batch.
