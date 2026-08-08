# execute-plan/implement (reserved)

## Intent

A skill category for taking the output of `task_decomposition`
(`ceo-core/skills/managerSkills.js`) — an ordered task list with
acceptance criteria — and actually driving it to completion, rather than
leaving decomposition as the last real step. Right now `task_decomposition`
produces `{objective, tasks, assumptions}`; nothing in the registry
consumes that output as a live execution plan. This category is where
that consumption would live: the `implementer` persona's skill-layer
counterpart.

## What it would actually register

A skill that accepts a `task_decomposition` result and a target task id,
executes or delegates that single task, and reports back in the same
completion vocabulary `departments-subagents/executive/ceo-agent/
CONTRACT.md` already requires of every department output — analysis,
routing, queued, blocked, failed, or verified complete, never an
unverified "done." Explicitly does not auto-approve or auto-execute a
Type 1 decision (irreversible, high-cost, outside assigned authority,
per the Bezos Type 1/Type 2 rule `IDENTITY.md` already defines) without
the same escalation `escalation_assessment` already enforces elsewhere.

## Status

Scoped, not built. Reserved for future work — no handler, no
registration yet.
