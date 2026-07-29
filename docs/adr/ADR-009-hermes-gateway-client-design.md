# ADR-009: HermesGatewayClient design — contract, credentials, lifecycle, and the off_limits gate

- **Status:** Proposed (design only — no execution/adapter code in this change)
- **Date:** 2026-07-29
- **Tracking issue:** [#36](https://github.com/tradersurfer/ceo-agent/issues/36) (implementation tracker — still gated; this document is the design ADR-001b's own *Consequences* section said implementation still needed), [#83](https://github.com/tradersurfer/ceo-agent/issues/83) (off_limits enforcement gap — addressed directly below, not deferred)
- **Builds on:** [`ADR-001`](./ADR-001-hermes-sandboxed-execution.md) (isolation reasoning, credential-scoping principles), [`ADR-001a`](./ADR-001a-hermes-gateway-client-model.md) (HTTP-client-not-subprocess decision), [`ADR-001b`](./ADR-001b-hermes-gateway-api-surface-correction.md) (the verified `/v1/runs` contract this document implements against — cited, not re-derived)
- **Related:** `SECURITY.md`, `departments/executive/ceo-agent/CONTRACT.md` (Type 1/Type 2 escalation), `registry/agent-registry.json` (`hermes.off_limits`), [`ADR-002`](./ADR-002-priority-5-runtime-hardening-sequencing.md) (`WorkflowRuntime` `waiting`/scheduler pattern this design hooks into), [`ADR-008`](./ADR-008-yolo-full-auto-mode.md) (no auto-approval, ever)

---

## Context

ADR-001 → ADR-001a → ADR-001b progressively narrowed #36 from "spawn a subprocess" to "HTTP client of a specific, verified adapter": `POST /v1/runs` on the `api_server` platform adapter (`gateway/platforms/api_server.py`), Bearer auth, default port `8642`, opt-in via `API_SERVER_ENABLED`/`API_SERVER_KEY`. ADR-001b's own *Consequences* section left two things unresolved before implementation could start: a concrete client design against that contract, and an explicit go-ahead. This ADR is the former. It does not implement `HermesGatewayClient` — it specifies what that implementation must do, so #36 has a reviewed shape to build against instead of improvising one under time pressure, matching this project's standing discipline (ADR-001/ADR-001a/ADR-008 precedent).

Independently of that chain, issue #83 found that `registry/agent-registry.json`'s `off_limits` arrays — including Hermes's own seven-item list — are documentation only, enforced by human review, not by any code path. Hermes is the first (and so far only) real external tool-execution surface in this codebase; it is exactly the case #83's own filing flags as mattering most. This ADR treats that as a design question `HermesGatewayClient` cannot ship without answering, not a separate concern to defer indefinitely.

---

## 1. The `/v1/runs` request/response contract

Sourced directly from ADR-001b's verified findings (re-verified there against the fresh `dbc18c6` submodule pin) — not re-derived here:

- **`POST /v1/runs`** — submit a task. Returns `202` with `{"run_id": "run_<uuid>", "status": "started"}` immediately (async submission, not a blocking call).
- **`GET /v1/runs/{run_id}`** — poll status: `{"object": "hermes.run", "run_id", "status", "created_at", "updated_at", ...}`.
- **`GET /v1/runs/{run_id}/events`** — SSE stream of lifecycle events (`message.delta`, `approval.request`, `run.completed`, `run.failed`, `run.cancelled`).
- **`POST /v1/runs/{run_id}/approval`** — resolve a pending tool-approval.
- **`POST /v1/runs/{run_id}/stop`** — interrupt a running task.
- **Status vocabulary:** `queued` → `running` → (`waiting_for_approval` ⇄) → `completed` | `failed` | `cancelled`.
- **Auth:** `Authorization: Bearer <API_SERVER_KEY>`, constant-time compared server-side; the adapter refuses to start without a key ≥16 characters.
- **Default bind:** `127.0.0.1:8642`, opt-in only (`API_SERVER_ENABLED` no longer force-enables it as of upstream `683059feb` — enablement now tracks having a valid key, per ADR-001b's drift finding).
- **Auth-failure error code:** `gateway_auth_failed` (not `invalid_api_key` — the pre-`32f7c5afa` code, per ADR-001b's second drift finding). Any client-side error classification `HermesGatewayClient` writes must match the current code.
- **Concurrency:** default cap of 10 concurrent runs (`gateway.api_server.max_concurrent_runs`); over-cap requests get `429` + `Retry-After`.

### A naming collision worth flagging now, before it causes a bug

The gateway's own status vocabulary uses `queued` to mean "accepted, waiting to run." `HermesBridge.runTask()`'s **existing** result vocabulary (`triggered`/`queued`/`blocked`/`failed`, unchanged since #27) uses `queued` to mean something entirely different: *"validated, but no runtime is connected at all."* Once a real gateway is wired, these two meanings must not be conflated in code or in a future implementer's head — see the mapping table in §3.

---

## 2. Credential scoping

Carries forward ADR-001/ADR-001a's credential-scoping principle, applied to the now-concrete contract:

- **New, Hermes-specific configuration** — `HERMES_GATEWAY_URL` and `HERMES_GATEWAY_API_KEY` (naming to be finalized at implementation time; semantics fixed here). These replace the *purpose* the now-wrong-shaped `HERMES_RUNTIME_PATH`/`HERMES_APPLICATION_PATH` fields served under ADR-001's subprocess model. Per ADR-001a, those two fields are **not renamed or removed by this ADR** — that edit belongs to the implementation PR, not this design doc.
- `HERMES_GATEWAY_API_KEY` **is** the gateway's `API_SERVER_KEY` value for this install — a credential scoped, by the adapter's own auth model, to task submission/query/approval/stop on that one gateway. It is provisioned per-deployment by the operator (ADR-001b's *Open items status*), not generated by CEO Agent.
- **CEO Agent's own secrets are never sent to the gateway, in either direction.** `OPENROUTER_API_KEY`, `DISPATCH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, and any bridge webhook secret must be provably absent from every outbound request `HermesGatewayClient` makes — no header, no request body field, no query string. This is the same assertion ADR-001 required of the (superseded) subprocess env; here it applies to HTTP request construction instead of `child_process` env construction, same guarantee, different transport. A future implementation must include a test asserting this, mirroring ADR-001's "a test asserts this" discipline for the child-env case.
- **The reverse must also hold:** nothing Hermes returns (run output, event payloads) is treated as trusted enough to be echoed into a privileged context (e.g. used to construct another outbound call with CEO Agent's own credentials) without going through the same validation any other untrusted external input would.
- If a future Hermes task needs to call back into CEO Agent (e.g. a webhook), that callback must use a distinct, least-privilege token — never `DISPATCH_SECRET` — unchanged from ADR-001's original requirement.

---

## 3. Timeout and failure handling across the run lifecycle

`HermesBridge.runTask()`'s existing contract (`triggered` / `queued` / `blocked` / `failed`) does not change shape — WorkflowRuntime already treats anything other than `triggered` as step failure, and that contract is preserved (ADR-001a, ADR-001b). What changes is what produces each value, now that there is a real HTTP round-trip instead of a stub.

**Submission-time mapping** (the synchronous return from `runTask()`):

| Condition | Bridge status | Notes |
|---|---|---|
| No `HERMES_GATEWAY_URL`/`HERMES_GATEWAY_API_KEY` configured | `queued` | Unchanged legacy meaning — issue #36's own acceptance criteria requires this to stay honest for unconfigured installs. |
| Task fails `BaseBridge` validation (agent/approver/project/task-type) | `blocked` | Unchanged — the gateway is never contacted. |
| `HermesBridge`'s own off_limits check rejects the task (§4) | `blocked` | New — must happen **before** any network call, not after. |
| Network error, connection refused, DNS failure, request timeout reaching the gateway | `failed` | Never `queued` — a configured-but-unreachable gateway is a real failure, not the "unconfigured" case. |
| `401` with `gateway_auth_failed` | `failed` | Configuration/credential problem; surfaced with a distinct, actionable reason so it isn't mistaken for a task-content failure. |
| `429` after bounded retry/backoff (respecting `Retry-After`) is exhausted | `failed` | Gateway at capacity; honest failure, no silent drop, no infinite retry. |
| `202` with `{run_id, status: "started"}` | `triggered` | A genuine hand-off occurred. The gateway's internal `queued`/`running` sub-state is metadata carried alongside `triggered`, never written into the bridge's `status` field — this is where the §1 naming collision must be kept apart in code. |

**Post-submission lifecycle** (async, after `triggered` has already been returned): this is a materially different problem from the synchronous mapping above — the run continues on Hermes's side after `runTask()` has already returned. Rather than inventing a new async layer, the implementation should hook into the mechanism ADR-002 already established: `WorkflowRuntime` steps already support a `waiting` status with an injectable clock and a scheduler (`resume(id, workflow)`) built for exactly this shape of "started now, resolves later." A future implementation should poll `GET /v1/runs/{run_id}` and/or consume `GET /v1/runs/{run_id}/events` (SSE) to drive that resolution:

- `running` — informational; no workflow-visible change.
- `waiting_for_approval` — maps to the workflow step's `waiting` state (not a terminal status), pending resolution. See §4 for what resolves it — critically, **not** an automatic `POST /v1/runs/{run_id}/approval` call.
- `completed` — resolves the step as the real success it already was implicitly promised to be when the workflow observed `triggered`.
- `failed` — resolves the step as a real failure, with the gateway's own reason surfaced rather than a generic message.
- `cancelled` — resolves the step as non-success but is worth keeping distinguishable from `failed` in the surfaced reason (explicit stop vs. genuine error are different facts for an operator reading the audit log), even though both are "not success" for WorkflowRuntime's existing pass/fail gate.

**Timeout enforcement**, layered:

- **Request-level timeout** on the `POST /v1/runs` call itself (short — this is a submission, not the task running). Expiry → `failed`, never a guessed `triggered`.
- **Run-level wall-clock budget** (a new config value, e.g. `HERMES_RUN_TIMEOUT_MS`), measured from the run's `created_at`. On expiry: call `POST /v1/runs/{run_id}/stop`, then resolve the workflow step as `failed` with a timeout reason — mirrors ADR-001's original "timed-out run is `failed`, never `triggered`" rule, just enforced over an HTTP-polled run instead of a supervised child process.
- **Approval-wait budget** — `waiting_for_approval` must not wait forever either. A bounded window (config value, separate from the run-level budget since a human approval wait is a different kind of "slow" than execution being slow); on expiry, `stop` the run and resolve `failed`/`cancelled` with an explicit "approval timed out" reason. This must **not** silently fall back to auto-approving — see §4.
- **SSE reconnection** is bounded (capped retries with backoff); if the stream cannot be sustained, fall back to `GET /v1/runs/{run_id}` polling; if both fail, the run's status is surfaced honestly as unknown/failed rather than assumed successful. Never infer `completed` from silence.

---

## 4. How this interacts with #83 (the off_limits enforcement gap)

This is the question the brief asked to answer directly, not survey.

**Why it applies here specifically:** Hermes's `off_limits` list — `"Changing credentials"`, `"Moving money"`, `"Making legal claims"`, `"Changing pricing"`, `"Approving production deployments"`, `"Deleting source files"`, `"Overriding the CEO Agent"` — describes exactly the kind of actions a tool-executing agent runtime (per ADR-001a: its own multi-step execution loop, its own `terminal_tool.py` backends spanning local/Docker/Modal/Daytona/SSH) is capable of attempting once a task is handed to it. Issue #83 confirms nothing in this codebase checks a request against that list before a bridge acts on it. `HermesGatewayClient` would be the first piece of code in this project that hands a task to a genuinely tool-capable external executor with no engineer reviewing each individual task first — which makes it the first place this gap has a concrete, current consequence, not a hypothetical one.

**Recommendation: do not gate #36 on #83's full resolution. Gate #36 on shipping its own narrow, Hermes-specific safeguard instead — as part of #36 itself, not deferred to a follow-up.**

Reasoning:

- #83 is scoped as a *general* mechanism question — across all nine agents in `registry/agent-registry.json`, matching free-text `off_limits` strings against arbitrary skill/bridge invocations. Its own filing says plainly that "matching a runtime request against free text reliably is itself unsolved" and may require a registry schema change. That is genuinely open-ended work with no fixed timeline, and this project's own precedent (ADR-007, on premature harness abstraction; ADR-006, declining to guess at unconfirmed provider scope) is to not block concrete, narrow work on an unscoped general design.
- But #36 does not need the general solution. It needs to answer one narrow question at one narrow chokepoint: *does this specific task, about to be handed to Hermes, plausibly do one of these seven specific things?* Hermes's list is short, fixed, and known today. A purpose-built check against these seven items — not a general free-text-matching engine for nine agents' worth of arbitrary lists — is buildable now, independent of however #83 eventually generalizes.
- The two points where CEO Agent controls what Hermes does are exactly the two points already identified in this design: **task submission** (`POST /v1/runs` — §3's `blocked` row already reserves a pre-network check here) and **approval resolution** (`POST /v1/runs/{run_id}/approval`, triggered by `waiting_for_approval`/`approval.request`). Both are within `HermesGatewayClient`'s own code, not somewhere in `SkillExecutor` or `BridgeExecutors.js` that #83's broader redesign would need to touch.
- Concretely, `HermesBridge`/`HermesGatewayClient` must, as part of #36's own scope:
  1. Before calling `POST /v1/runs`, check the task's declared intent against Hermes's seven `off_limits` items using a narrow, purpose-built matcher scoped only to this list (not a general engine) — a match returns `blocked`, gateway never contacted. This is necessarily heuristic given free-text input, same limitation #83 names; the design goal is closing the gap for the highest-risk, most-common phrasings of these seven categories, not claiming perfect coverage.
  2. **Never auto-resolve `waiting_for_approval`.** Every `approval.request` event surfaces to a human via the existing Type 1 escalation path (`CONTRACT.md`), full stop — this needs no new mechanism to decide, because ADR-008 already settled that auto-approval doesn't happen in this project regardless of what triggers the approval prompt. `HermesGatewayClient` simply must not build a code path that calls `POST /v1/runs/{run_id}/approval` without a human decision behind it.
  3. Log every submission-time block and every approval decision to the audit log (ADR-002's persistence work) with the matched `off_limits` phrase, so a false negative is at least visible after the fact even though it wasn't caught before.
- When #83 eventually lands its general mechanism, this narrow check is expected to be **replaced or subsumed** by it, not maintained in parallel forever — worth a forward-reference in #83 or a follow-up issue at that time, but not something this ADR resolves now.

This is a real, scoped safeguard, not a promise to revisit later: #36 does not merge without items 1–3 above implemented and tested, same "no implementation without its own reviewed design, no merge without human go/no-go" discipline ADR-008 and this project's practice already apply elsewhere.

---

## Non-goals for this pass

- **No `HermesGatewayClient` code.** This is a design document; §1–§4 specify a contract for a future implementation PR to build against, gated on its own review per this project's standing practice.
- **No change to `HERMES_RUNTIME_PATH`/`HERMES_APPLICATION_PATH`.** Per ADR-001a, replacing them with the gateway URL/credential pair named in §2 is implementation work, not a design-doc edit.
- **No general #83 mechanism.** The narrow, Hermes-specific check in §4 is not a substitute for #83's eventual general solution across all nine agents; it is a scoped stopgap for the one surface (Hermes) where the risk is concrete today.
- **No SSE library choice, retry/backoff constants, or exact config variable names** — named descriptively above (`HERMES_RUN_TIMEOUT_MS`, etc.) as placeholders for implementation-time decisions, not fixed here.
- **No `WorkflowRuntime` code changes.** §3's async-lifecycle sketch describes how a future implementation should use the *existing* `waiting`/scheduler mechanism (ADR-002); it does not modify that mechanism.
- **No auto-approval feature of any kind.** Already closed by ADR-008; this ADR does not reopen it and explicitly forecloses any interpretation of §4 as introducing one.
- **No submodule pin bump or re-verification pass** — this document reasons from ADR-001b's already-current (`dbc18c6`) findings; it does not re-audit the submodule.
- **No operator-facing setup/documentation changes** (enabling `api_server`, provisioning `API_SERVER_KEY`) — ADR-001b already flagged this as needed; writing it is implementation-adjacent work, not this design.

## Consequences

- `HermesGatewayClient` (#36, still gated) now has a complete design to implement against: verified contract (§1, citing ADR-001b), credential scoping (§2), lifecycle/timeout handling including the `queued`/`queued` naming collision flagged before it can cause a bug (§3), and a concrete, non-deferred answer to the off_limits question (§4) — a prerequisite satisfied, not yet a green light, consistent with ADR-001b's own framing of what would come next.
- #83 remains open and tracked on its own general-mechanism timeline; this ADR does not resolve it, but does prevent #36 from shipping as if #83 didn't exist. The narrow Hermes-specific safeguard in §4 is explicitly scoped as a stopgap expected to be superseded once #83's general mechanism lands.
- No runtime behavior changes from this ADR. `HermesBridge.runTask()` remains validate-and-queue only until a reviewed implementation PR lands.
