# ADR-010: `off_limits` enforcement — structured identifiers, dual chokepoints, hard-block failure mode

- **Status:** Proposed (design only — no implementation code in this change)
- **Date:** 2026-07-29
- **Tracking issue:** [#83](https://github.com/tradersurfer/ceo-agent/issues/83) (off_limits declarative-only, zero enforcement — this document is the "future fix" scoping that issue asked for, not a resolution of the issue itself)
- **Related:** `registry/agent-registry.json` (`off_limits` on all nine agents), `registry/registry.schema.json` (`$defs/agent`, `$defs/capability`, `$defs/skill`), `registry/skill-registry.json` (`risk` field precedent), `core/SkillExecutor.js`, `core/BridgeExecutors.js`, `sdk/BaseBridge.js`, `sdk/Permissions.js`, `sdk/constants.js` (`Statuses`, `TaskTypes`, `ExecutiveStatuses`), `core/skills/managerSkills.js` (`escalation_assessment`), every department `CONTRACT.md` (Type 1/Type 2 escalation authority), [`ADR-008`](./ADR-008-yolo-full-auto-mode.md) (found and named the gap; no auto-approval, ever), [`ADR-009`](./ADR-009-hermes-gateway-client-design.md) §4 (narrow, Hermes-only stopgap — this document is the general mechanism ADR-009 explicitly left open)

---

## Context

Issue #83 found — and this document independently reconfirmed by reading the actual files — that every agent in `registry/agent-registry.json` declares an `off_limits` array of plain-English prohibitions, and nothing in this codebase reads that field at runtime. The issue filed a starting hypothesis (restructure into machine-checkable identifiers; enforce in `SkillExecutor` and/or the bridge-dispatch layer; likely escalate rather than hard-block) and explicitly asked for a reviewed design before any code, matching this project's standing ADR-001/ADR-001a/ADR-008 discipline.

Since #83 was filed, [`ADR-009`](./ADR-009-hermes-gateway-client-design.md) §4 shipped a **narrow, Hermes-only** stopgap: a purpose-built check against Hermes's own seven `off_limits` items, scoped to `HermesGatewayClient`'s two chokepoints (`POST /v1/runs` submission and `POST /v1/runs/{run_id}/approval`), explicitly **not** a general mechanism. ADR-009 says plainly: *"#83 remains open and tracked on its own general-mechanism timeline; this ADR does not resolve it"* and *"When #83 eventually lands its general mechanism, this narrow check is expected to be replaced or subsumed by it."* This document is that general mechanism's design. It does not touch `HermesBridge`, `HermesGatewayClient`, or anything ADR-009 already specified — it answers the same three questions ADR-009 answered narrowly for Hermes alone, but for all nine agents, at the registry/schema level.

---

## 1. Matching mechanism — what the data actually looks like, and what that implies

### 1.1 The current shape, verified directly

`registry/agent-registry.json`'s nine `off_limits` arrays, quoted in full:

| Agent | `off_limits` |
|---|---|
| `ceo_agent` | Live financial transactions; Unauthorized production deployments; Changing secrets or credentials; Making legal guarantees; Making financial promises |
| `cfo_agent` | Live financial transactions without approval; Overriding the CEO Agent |
| `cto_agent` | Unauthorized production deployments; Overriding the CEO Agent |
| `cmo_agent` | Overriding the CEO Agent |
| `chro_agent` | Overriding the CEO Agent |
| `clo_agent` | Making legal guarantees; Overriding the CEO Agent |
| `hermes` | Changing credentials; Moving money; Making legal claims; Changing pricing; Approving production deployments; Deleting source files; Overriding the CEO Agent |
| `sales_intake_agent` | Sending unauthorized emails; Modifying client records outside authorized scope; Overriding CEO Agent routing decisions |
| `onboarding_comms_agent` | Sending unsolicited emails; Modifying client records outside authorized scope; Overriding CEO Agent routing decisions |

`off_limits` is **not present in `registry.schema.json`'s `$defs/agent` at all** — the schema only requires/types `id`, `name`, `title`, `department`, `role`, `capabilities`, `skills`. `off_limits` is an unvalidated, ad hoc field that happens to be free text today because nothing constrains it to be anything else. That is itself worth naming plainly: this isn't a case of a typed field being used loosely; it's a field the schema doesn't know exists.

The same schema, one `$defs` entry away, already has the shape this issue's hypothesis wants: `$defs/capability` is `{id, name, description}` where `id` matches `^[a-z][a-z0-9_]*$` — a machine-checkable identifier paired with a human label. `skills` and `capabilities` on the agent object are already arrays of these `id`s, not free text. Restructuring `off_limits` to match this existing pattern is not inventing a new convention; it's applying one already used twice in the same schema to a third field that currently ignores it.

### 1.2 But the entries don't map cleanly onto one identifier space — they fall into three different buckets

Cross-referencing all 24 registered skills (`registry/skill-registry.json`, all marked `risk: "safe"`, none touching money/credentials/legal/deployment), all 24 `TaskTypes` (`sdk/constants.js`), and Hermes's own 14-item `allowedTaskTypes` against Hermes's own 7-item `off_limits` list produces **zero overlap in every case** — not one `off_limits` phrase corresponds to an existing skill id or task type anywhere in the registry today. That finding forces a more careful answer than a flat "yes, restructure into IDs":

**Bucket A — relational/governance constraints, not actions at all.**
`"Overriding the CEO Agent"` / `"Overriding CEO Agent routing decisions"` — present on 7 of 9 agents. There is no discrete request an agent makes that *is* "overriding the CEO Agent"; it's an emergent property of a sequence of decisions, already governed by `CONTRACT.md`'s RACI tables and Type 1/Type 2 authority. No identifier-matching scheme, structured or free-text, turns this into a single checkable request. This stays doctrine.

**Bucket B — entries that qualify an agent's own existing capability space.**
`onboarding_comms_agent`'s `"Sending unsolicited emails"` sits directly on top of its actual capabilities (`email_welcome`, `email_sequence_queue`, etc. — sending email *is* this agent's job). `sales_intake_agent`'s `"Sending unauthorized emails"` and both agents' `"Modifying client records outside authorized scope"` are the same shape: the base action exists in the registry; the prohibited case is a *qualifier* (unsolicited / unauthorized / outside scope) that no current skill input schema or bridge task payload captures as a checkable field. An identifier can name *which* capabilities the restriction attaches to; it cannot, by itself, evaluate the qualifier — that needs the qualifying condition to become an explicit, validated input field, which is separate follow-up work this document does not design.

**Bucket C — entries with zero representation anywhere in the current skill/task-type vocabulary.**
`"Live financial transactions"`, `"Changing secrets or credentials"`, `"Moving money"`, `"Deleting source files"`, `"Approving production deployments"`, `"Making legal guarantees/claims"`, `"Making financial promises"`, `"Changing pricing"`. Nothing in `skill-registry.json` or `TaskTypes` does any of these things today. This is the majority of the total entries.

### 1.3 Decision: restructure into `{id, label, restricts}` objects — confirming the issue's hypothesis, with the caveat it asked for

```json
"off_limits": [
  { "id": "move_money", "label": "Moving money", "restricts": [] },
  { "id": "override_ceo_agent", "label": "Overriding the CEO Agent", "restricts": [], "enforceable": false },
  { "id": "unsolicited_email", "label": "Sending unsolicited emails", "restricts": ["email_welcome", "email_sequence_queue", "..."] }
]
```

- `label` is the current text, verbatim — this is additive, not a rewrite of documented meaning. A human reading the registry sees the same sentence they see today.
- `id` follows the existing `^[a-z][a-z0-9_]*$` pattern already used by `capabilities`/`skills`, so the same schema validation machinery applies without inventing a new id shape.
- `restricts`: the skill ids / task-type ids this entry actually governs. Bucket B entries populate it now. Bucket C entries ship with `restricts: []` — **not enforcement today**, but a forward-declared identifier: the day a future PR adds a skill or task type that genuinely moves money or deletes files, that PR's own review is where `restricts` gets populated, and enforcement (§2) starts firing automatically without anyone having to invent a matcher under time pressure at that point. Bucket A entries carry `enforceable: false` so the schema is honest about what it can't check, rather than repeating the exact problem #83 is about — a field that implies more than it does.
- This is a schema addition to `registry.schema.json`'s `$defs/agent` (a new `$defs/offLimitsEntry`, referenced the same way `capabilities` references `$defs/capability`) plus a data migration of `agent-registry.json`'s nine arrays. Both are named here, neither is executed in this change.

### 1.4 The honest limitation this does *not* solve

Every enforcement point available today (`BaseBridge.validateTask`, `SkillExecutor.run`) checks **which skill or task type was invoked**, never **what the request's payload actually contains** — confirmed by reading every bridge: the only handling of `task.payload` anywhere in `SalesIntakeBridge`, `OnboardingCommsBridge`, or the executor path is spreading it unexamined into an outbound request body. Structured identifiers close the category-level gap (§1.2, Bucket B: "was a restricted skill invoked at all") but cannot close a payload-level gap — a generically-named Hermes task type like `file_processing`, `sandbox_execution`, or `automation_run` whose payload happens to delete source files or move money is invisible to this design, exactly as it is invisible to ADR-009's narrow Hermes check today. Payload/semantic inspection is a materially harder, separate problem and is explicitly out of scope here — naming it is the point, not solving it, per this project's standing "don't overclaim coverage" discipline (ADR-008, ADR-009 §4's own "necessarily heuristic... not claiming perfect coverage" language).

---

## 2. Enforcement location — both chokepoints, as siblings, not one shared gate

Reading the actual call paths confirms the issue's own suspicion that these are genuinely separate, not one gate wearing two names:

- **`SkillExecutor.run()`** (`core/SkillExecutor.js:47-58`): when a skill requires agent assignment, it builds a `Permissions` instance scoped to `agent.skills` and calls `isTaskAllowed(skillName)`. This is an **allowlist** check against what the agent may invoke.
- **`BaseBridge.validatePermissions()`** (`sdk/BaseBridge.js:81-87`): builds a *separately scoped* `Permissions` instance from the bridge's own `allowedTaskTypes`/`allowedApprovers`/`allowedProjects`, and checks `isTaskAllowed(taskType)` / `isApproved(task.approved_by)` against **that** allowlist. Failures accumulate into `errors`, and `execute()` (`BaseBridge.js:115-131`) turns a non-empty `errors` array into `TaskResult.status = Statuses.BLOCKED` before any bridge-specific code runs.

These are two different `Permissions` instances, built from two different allowlists, invoked from two different call paths (in-process skill dispatch vs. bridge task validation) — exactly the "different call paths... may need separate enforcement points, not one shared gate" the issue flagged as an open question. The answer is: **both, as symmetric sibling checks next to the allowlist check each path already has**, not a new shared module either path calls out to.

- **In `SkillExecutor.run()`**: immediately after the existing `requiresAgentAssignment` block, add a lookup of the resolved agent's `off_limits` entries and check `skillName` against each entry's `restricts` set. A match returns `this._finish('failed', skillName, context, { error: ..., reason: 'off_limits_violation' })` — the exact same return shape already used for `reason: 'permission_denied'` two lines above it, flowing through the exact same `_finish()`/audit-append path that already exists. No new audit mechanism is needed.
- **In `BaseBridge.validatePermissions()`**: add a sibling check next to `isTaskAllowed`/`isApproved`, pushing onto the same `errors` array that already produces `Statuses.BLOCKED` via `execute()`. No new result shape, no new status value.

Because both insertion points already have exactly the right shape for a deny check (an allowlist test that already produces a `failed`/`blocked` outcome on miss), the *code* surface this design implies is small — two conditional blocks reusing existing plumbing. The schema/data work in §1 is the larger piece of this proposal, not the enforcement code.

**Deliberately not proposed:** `Organization.js`, named in #83's original grep as another zero-hit file. Reading it confirms why: it's a registration/lookup surface (`registerAgent`, `findAgent`, `getOrganizationChart`, `exportBlueprint`) with no request-validation responsibility today — there is nothing resembling a chokepoint there to add a check to. If a future audit finds a real gap at that layer, that's separate work; this design does not manufacture a third enforcement point where no request currently flows through one.

---

## 3. Failure mode — hard block, with the audit trail carrying the escalation signal

### 3.1 What "escalate" actually means in this codebase today

`CONTRACT.md`'s Type 1/Type 2 split is real doctrine, but the one piece of code that operationalizes it — `escalation_assessment` (`core/skills/managerSkills.js:120-142`) — is **advisory only**: it returns `{ assessment: { score, escalate, reasons } }` to whatever agent called it. Nothing reads `assessment.escalate` and automatically pauses or blocks anything; the codebase relies entirely on the calling agent choosing to obey its own assessment. There is no synchronous "pause this call and wait for a human decision" primitive anywhere in `SkillExecutor` or the bridge-dispatch path today. (`WorkflowRuntime`'s `waiting`/`resume()` mechanism, which ADR-009 §3 points to for Hermes's async run lifecycle, is the closest thing that exists — but it governs workflow *steps* resolving later, not a single in-flight `SkillExecutor.run()` or `BaseBridge.execute()` call pausing mid-validation.)

### 3.2 What the existing sibling checks already do

Every check currently sitting next to where an `off_limits` check would go — `isTaskAllowed`, `isApproved`, `isProjectAllowed` in `BaseBridge`, and the `requiresAgentAssignment` permission check in `SkillExecutor` — **hard-blocks, synchronously, today**. None of them escalate-and-wait; all of them return `blocked`/`failed` immediately, consistent with `CONTRACT.md`'s own "Permission is deny-by-default" line.

### 3.3 Decision: hard block, not escalate-and-wait

`off_limits` is definitionally the same class of check as the ones it would sit beside — a boundary the agent must never cross — and arguably a higher-stakes one, not a lower-stakes one. Treating it more leniently than `isTaskAllowed` (which already hard-blocks) would be an inconsistency in the same function, not a considered refinement. Three concrete reasons, not just doctrine:

1. **No pause-and-resume infrastructure exists at this chokepoint.** Building one would mean designing the general case of the approval-wait mechanism ADR-009 §3 sketches *narrowly*, for Hermes's async run lifecycle alone — a materially larger, unscoped feature. Conflating that with closing #83's enforcement gap would block a concrete, buildable fix on a speculative one.
2. **A block that "escalates" but doesn't actually pause execution is worse than a hard block, not better.** It either blocks anyway (making "escalate" a synonym for "block" in practice, with extra steps) or it doesn't block, which is precisely the outcome ADR-008 already rejected — full-auto/bypass-on-a-toggle is closed, and a synchronous continue-past-off_limits path is the same shape of bypass with different branding.
3. **Structured identifiers (§1) remove most of the "ambiguous free text, so escalate for safety" reasoning #83 raised.** An `id` match against `restricts` is a deterministic Set-membership test — the same category as `isTaskAllowed`, not a fuzzy judgment call requiring human interpretation before a decision can be made.

**What "escalate" means here instead:** the block itself is the escalation signal, surfaced honestly rather than swallowed. The `_finish()`/`BaseBridge` error path already writes an audit event on every failure; this design's only requirement is that an `off_limits` violation carries its own distinct `reason: 'off_limits_violation'` (not folded into generic `permission_denied`), so it can be filtered and surfaced to a human differently downstream — a dashboard filter, an alert rule, a review queue — without inventing new plumbing to do it. This is exactly the shape ADR-009 §4 already committed to for Hermes alone ("blocked, gateway never contacted" + "Log every submission-time block... with the matched off_limits phrase") — this section generalizes that same shape to both chokepoints, for all nine agents.

---

## Non-goals

- **No code in this change.** `SkillExecutor.js`, `BaseBridge.js`, `registry.schema.json`, and `registry/agent-registry.json` are all unmodified by this document.
- **No payload/semantic-level inspection.** §1.4 names this limitation; solving it is separate, harder, unscoped follow-up work.
- **No change to `Organization.js`.** Named and deliberately excluded in §2, not merely omitted.
- **No new synchronous approval-wait primitive.** §3.3 explicitly declines to build one as part of closing this gap.
- **No change to ADR-009 or `HermesGatewayClient`.** ADR-009's narrow, already-specified Hermes-only check (§4 of that document) is untouched here. Per ADR-009's own framing, it is expected to be superseded by this general mechanism once implemented — that supersession is a future follow-up, not part of this document.
- **No qualifier-field design for Bucket B entries** (e.g. what makes an email "solicited"). Named in §1.2 as needed, not designed here.
- **No id vocabulary finalized.** The examples in §1.3 (`move_money`, `unsolicited_email`, `override_ceo_agent`) are illustrative; the actual id list is implementation-time work, reviewed the same as any other registry change.

## Consequences

- Issue #83 now has a reviewed design to implement against, closing the "no implementation without its own reviewed design" prerequisite it named for itself — implementation is still a separate, later PR, gated on its own human go/no-go per standing practice (ADR-001/ADR-008/ADR-009 precedent).
- Once implemented, `registry.schema.json` gains one new `$defs` entry and `agent-registry.json`'s nine `off_limits` arrays migrate to structured form without changing their human-readable meaning.
- Two small, symmetric checks land in `SkillExecutor.run()` and `BaseBridge.validatePermissions()`, reusing existing result/audit shapes rather than introducing new ones.
- `off_limits` violations become distinguishable in the audit trail (`reason: 'off_limits_violation'`) from generic permission denials, for the first time.
- ADR-009 §4's narrow Hermes-only check remains in place and functioning until a future implementation PR actually supersedes it — this document does not deprecate or disable it.
- The payload-level gap named in §1.4 remains open and should be tracked as its own follow-up issue once this design's category-level enforcement ships — not solved by, and not blocking, this proposal.
