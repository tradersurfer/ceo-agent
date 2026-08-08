# design (reserved)

## Intent

A skill category for producing the ADR this project already requires
before a structural change lands. `ceo-core/skills/README.md` states the
standing rule directly: `/ceo-core` structural changes need an
ADR-style decision before adoption. Right now that document gets written
by hand each time (`docs/adr/ADR-008-...`, `ADR-009-...`,
`ADR-010-...`); this category is where that becomes a real, registered
skill instead of a manual step someone has to remember to do.

## What it would actually register

Two skills, mirroring the `design-doc-writer` / `design-doc-reviewer`
personas but as callable `SkillRegistry` capabilities rather than prose
roles:

- a drafting skill that takes a proposed change plus the existing ADR
  set and produces a structured decision/alternatives/consequences
  document in this project's existing ADR shape;
- a review skill that scores a draft against real repository state
  (does the claimed capability actually exist in
  `ceo-core/frameworks/` or `registry/skill-registry.json`?) and returns
  findings through the same `review.gaps` shape `quality_review`
  (`ceo-core/skills/managerSkills.js`) already produces for every other
  artifact.

## Status

Scoped, not built. Reserved for future work — no handler, no
registration, no `SkillRegistry.register()` call exists yet.
