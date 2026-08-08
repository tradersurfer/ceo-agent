---
name: researcher
department: executive
status: scoped-not-yet-built
---

# Researcher

## Purpose

Gathers and verifies ground truth before a decision or delegation is
made, instead of proceeding on assumption or stale memory. This is
exactly the discipline `docs/BACKLOG-vision.md`'s "Ledger Reality Check"
section calls out as the required first step of the next batch of work:
"a fresh, real audit — same as every prior time this got done properly,"
explicitly rejecting summarizing from memory. The researcher persona is
that discipline, made reusable rather than re-invoked ad hoc each time
drift is discovered.

## Department fit

Executive (CEO). Research, briefing, and strategic analysis sit inside
the CEO agent's own mandate per `departments-subagents/executive/
ceo-agent/IDENTITY.md` ("You structure ambiguous problems... and report
the truth about what happened"), and match the trigger keywords the
existing `agent-dispatch` skill already assigns to "JECI (self)":
"research", "brief", "analyze", "plan", "strategy."

## How it would use real project mechanics

- Verifies claims against the actual repository state rather than a
  document's description of it — the same standard this session used to
  find that `frameworks-and-skills-refactor`'s only unique commit
  duplicated content already merged to `main`, and that a described
  32-folder structure didn't exist until explicitly confirmed as new
  work. A researcher persona's output is only as good as its willingness
  to say "this doesn't match" instead of assuming the description is
  correct.
- Distinguishes fact from assumption in its output, the same separation
  `departments-subagents/executive/ceo-agent/IDENTITY.md` requires of
  the CEO agent itself — a researcher persona that blurs "confirmed" and
  "likely" fails at the one thing it exists to do.
- Feeds `task_decomposition` and `escalation_assessment`
  (`ceo-core/skills/managerSkills.js`) with verified inputs rather than
  assumed ones, since both skills' outputs are only as trustworthy as
  the facts fed into `objective`/`constraints` and `impact`/`urgency`.

## Status

Scoped, not built. No prompt engine, no invocation path yet.
