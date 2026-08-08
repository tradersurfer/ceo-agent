# Personas

Reserved for future work. Seven persona definitions, each a role
description tied to a real, existing mechanic in this project (a real
skill, a real department contract, a real documented incident) rather
than a generic template. None are wired into `SkillRegistry` or any
invocation path yet — these are role documents, not executable engines.

No frontmatter/config convention existed elsewhere in this project for
persona-style docs (the department docs under `departments-subagents/*/
*-agent/` — `IDENTITY.md`, `CONTRACT.md`, `BEHAVIOR.md`, `PROMPT.md` —
use plain Markdown headers, no frontmatter). Each file here uses a
short YAML frontmatter block (`name`, `department`, `status`) purely so
these are machine-referenceable by slug later, with the body otherwise
matching this project's existing doc voice.

| Persona | Department |
|---|---|
| `design-doc-writer` | Technology |
| `design-doc-reviewer` | Technology |
| `implementer` | Technology |
| `researcher` | Executive |
| `security-auditor` | Technology |
| `reviewer` | Technology |
| `test-writer` | Technology |
