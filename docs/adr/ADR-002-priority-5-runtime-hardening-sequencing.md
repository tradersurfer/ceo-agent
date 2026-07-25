# ADR-002: Priority 5 runtime hardening — scope, sequencing, and split

- **Status:** Proposed (scoping/sequencing decision — see per-PR implementation below)
- **Date:** 2026-07-24
- **Related:** Priority 5 (runtime unification & production readiness); `SECURITY.md`; ADR-001

---

## Context

Priority 5 groups seven production-readiness items: persistent workflow store,
persistent audit log, a real scheduler for delayed steps, idempotency/duplicate
protection, a shared (Redis-backed) rate limiter, runtime skill authorization, and
health checks/observability.

The brief asked to **scope and sequence this rather than force it into one PR, and
to first read the current code to separate what is genuinely in-memory-only from
what is already real.** That investigation changes the scope materially, so this
ADR records the findings and the resulting split before any implementation.

## Current-state findings (grounded in the code, not assumed)

### Already real — do NOT rebuild

- **Runtime skill authorization is already implemented.** `core/SkillExecutor.js`
  (`run()`, lines ~47–58): when a skill declares `permissions.requiresAgentAssignment`,
  the executor resolves the agent via `agentResolver(context.agentId)`, constructs
  `new Permissions({ tasks: agent.skills })`, and denies invocation with
  `reason: 'permission_denied'` if the agent is not assigned that skill. This is
  exactly the Priority 5 line item "skill authorization wired to `AgentProfile.skills`
  at the runtime level, not just declared." It exists and enforces. **No
  implementation PR is needed** — at most a coverage/doc check.

- **Persistence and audit are already abstracted, not hard-coded to memory.**
  `core/WorkflowRuntime.js` takes `{ store, audit, eventBus, clock }` in its
  constructor. `InMemoryWorkflowStore` implements `save(record)` / `get(id)`;
  `InMemoryAuditLog` implements `append(entry)` / `list()`. The runtime only ever
  calls those interfaces. So "persistent store/audit" means **implementing a
  Supabase-backed conformer to the existing interface and wiring it in**, not
  rewriting the runtime.

- **The clock is injectable** (`clock = () => new Date()`), and delayed steps
  already compute `state.scheduledFor` and set status `waiting`. A scheduler is a
  poller over `waiting` runs — the runtime already produces exactly the state a
  scheduler consumes, and the injectable clock makes it fake-timer testable offline.

- **Supabase is the established persistence stack** (`sdk/MemoryClient.js`, the
  Priority 1 registries, `recordDispatchMemory` gated on `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY`, loaded optionally/lazily). New persistence should
  follow this pattern, not introduce a parallel one.

### Genuinely in-memory-only / missing

- **Workflow run + audit persistence:** the default `store`/`audit` are in-memory;
  state is lost on restart and not shared across instances. Interface exists;
  Supabase conformer does not.
- **Scheduler:** `resume(id, workflow)` exists but must be called by an external
  caller. Nothing polls for due `waiting` steps automatically.
- **Idempotency:** `execute()` derives a run id but there is no
  duplicate-execution guard across instances.
- **Rate limiter:** `app/api/dispatch/handler.js` uses an in-memory sliding window
  (`requestLog` Map), per-process only — as `SECURITY.md` already states.
- **Health/observability:** `app/api/status` reports runtime + supervisor status,
  but there is no dedicated liveness/readiness endpoint and no counters for
  routing / cost / failures / skill+workflow execution.

## Decision

**Split Priority 5 into five sequenced, independently reviewable and testable PRs**,
and drop the already-done skill-authorization item from the build. Do not force
this into one PR: the pieces have different dependencies, different infra needs,
and different testability, and a single mega-PR would be poorly verifiable —
exactly the failure mode the project has avoided elsewhere.

### PR 5a — Persistent workflow store + audit log (Supabase) — *foundation*
- Implement `SupabaseWorkflowStore` (`save`/`get`) and `SupabaseAuditLog`
  (`append`, plus a queryable `list`/`query` by tenant / run / workflow / agent /
  date) conforming to the existing interfaces.
- Wire into `core/runtimeFactory.js` behind env, **falling back to in-memory when
  Supabase is not configured** — matching `MemoryClient`'s optional/lazy pattern,
  so text-only/offline installs are unaffected.
- Tests: interface-conformance tests against a mock/in-memory double (the existing
  WorkflowRuntime tests already exercise the interface); audit query-shape tests.
  Live-Supabase integration is the operator's environment, not a unit test.
- **New dependency:** none beyond `@supabase/supabase-js` (already present).

### PR 5b — Scheduler for delayed steps — *depends on 5a for durability*
- A poller that finds `waiting` runs whose `scheduledFor` is due and calls
  `resume()`. Uses the injectable clock; offline-testable with fake timers.
- Single-process works without 5a; durable/cross-restart scheduling uses the 5a
  store. Sequence after 5a so the durable path is real.
- Tests: due/not-due selection, resume invocation, no double-resume, clock-driven.
- **New dependency:** none.

### PR 5c — Idempotency / duplicate-execution protection — *depends on 5a*
- Accept an idempotency key (or reuse run id) on `execute()`; dedupe via the
  store's conditional insert so a retried or multi-instance dispatch does not
  double-run.
- Needs the shared store (5a) to dedupe across instances.
- Tests: same key → single run; different keys → distinct runs; concurrent
  attempts → one winner.
- **New dependency:** none.

### PR 5d — Shared rate limiter — *parallelizable with 5b/5c*
- Abstract the dispatch limiter behind an interface and ship a **shared-store**
  implementation. **Decision: prefer a Supabase-backed (or existing-shared-store)
  limiter over introducing Redis**, for stack consistency — the brief explicitly
  asks not to introduce new infra "without reason," and Supabase is already the
  pattern. Redis is a *new operational dependency* and should only be adopted if a
  measured need (sub-millisecond token-bucket at dispatch latency) is demonstrated;
  that trade-off is called out here rather than silently pulling Redis in.
- Keep the in-memory limiter as the default for single-instance installs.
- Tests: window accounting, limit enforcement, per-caller isolation against a
  shared-store double.
- **New dependency:** none if Supabase-backed; **Redis only if explicitly chosen**
  (flagged, not defaulted).

### PR 5e — Health checks + observability — *last; observes what is now real*
- `/api/health` (liveness/readiness: config present, Supabase reachable when
  configured, model-resolution status) plus counters for routing / cost /
  failures / skill+workflow execution surfaced through health/status.
- Tests: endpoint shape, healthy/unhealthy transitions, counter increments.
- **New dependency:** none.

### Not a PR — skill authorization
Already enforced at runtime (see findings). At most, add a focused test if coverage
is missing; otherwise nothing to build.

## Sequencing

`5a (foundation)` → `5b (scheduler)` → `5c (idempotency)` and `5d (rate limiter)`
in parallel (infrastructure-level, independent) → `5e (health/observability)` last.

## Non-goals (this scope)

- No parallel persistence stack — Supabase only, matching existing usage.
- No new infra dependency (Redis) unless a measured need justifies it, and never
  as a silent default.
- No live-infra integration tests in CI — unit tests run against interface doubles
  offline; wiring real Supabase/Redis is the operator's deployment concern, per the
  `MemoryClient` precedent.
- No rewrite of `WorkflowRuntime`, `SkillExecutor`, or the dispatch handler's public
  contracts — new capability is added behind the existing interfaces.

## Consequences

- Priority 5 becomes five focused PRs with clear dependencies and honest infra/
  testability boundaries, instead of one unverifiable epic.
- One roadmap item (runtime skill authorization) is recognized as already done,
  avoiding duplicated work — the value of reading before building.
- The Redis-vs-Supabase decision is made explicit and defaults to stack
  consistency, so no new operational dependency is introduced by accident.
- This ADR changes no runtime behavior; each subsystem lands and is verified on its
  own PR.
