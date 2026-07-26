# ADR-001a: Hermes execution model — gateway API client, not subprocess supervisor

- **Status:** Proposed (design only — no execution code in this change)
- **Date:** 2026-07-26
- **Tracking issue:** [#36](https://github.com/tradersurfer/ceo-agent/issues/36) (implementation tracker), [#40](https://github.com/tradersurfer/ceo-agent/issues/40) (upstream submodule audit — this ADR is its direct output)
- **Amends:** [`ADR-001`](./ADR-001-hermes-sandboxed-execution.md) — supersedes its process-layer/subprocess-supervisor decision. ADR-001's kernel-layer conclusion (isolation is the operator's deployment responsibility, not something Node's application code can enforce) is carried forward unchanged, just relocated to a different boundary — see *Decision* below.
- **Related:** `SECURITY.md`

---

## Context

ADR-001's *Prerequisite for implementation* section required auditing the actual
`NousResearch/hermes-agent` submodule before any adapter code was written. Issue
#40 did that audit against the pinned commit
(`46e87b14fd6c943ef0d6671fb0d74c5dde5d4c6b`). The result changes the design.

ADR-001 modeled Hermes as invoked "per install via `HERMES_RUNTIME_PATH` /
`HERMES_APPLICATION_PATH`" — i.e. CEO Agent spawning a bounded, per-task
subprocess (its Option B: `child_process.spawn` with process-level hardening).
That model matches only one of three invocation modes the real package ships,
and not the one it's actually built around:

- **Three console entry points, three lifecycle models** — `hermes` (full CLI,
  including `hermes gateway` / `hermes gateway start|stop|status|install|
  uninstall`, i.e. **installs itself as a persistent background service**, plus
  its own `hermes cron` scheduler daemon and `hermes dashboard`), `hermes-agent`
  → `run_agent:main` (the one entry point that resembles ADR-001's bounded-script
  assumption), and `hermes-acp` → a persistent Agent Client Protocol server. The
  packaging metadata itself describes "TUI, gateway, `hy_memory` server, MCP
  servers, and on-demand CLI commands" as separate, concurrently-running
  processes — a multi-process service topology, not a script.
- **Core (unconditional) dependencies** include a full ASGI web server
  (`fastapi` + `uvicorn[standard]`), PTY process control, `psutil`-based process
  supervision, and its own `croniter`-based scheduler. This is infrastructure for
  running a persistent service, present on every install, not opt-in.
- **`tools/terminal_tool.py` (3,000+ lines) is itself a multi-backend sandbox
  orchestrator** — local, Docker, Modal, SSH, Singularity, and Daytona execution
  backends, including two (Modal, Daytona) that hand execution off to
  third-party cloud infrastructure entirely outside anything CEO Agent or its
  operator's host controls.

Given this, ADR-001's Option B — spawn `run_agent.py` per task, harden the
child process with a constructed env, scoped cwd, and timeout ladder — targets
the one invocation mode most in tension with how Hermes actually expects to
run: as an installed, persistent gateway service that already manages its own
multi-backend sandboxing. Building CEO-Agent-side subprocess hardening around a
system that already does its own execution-backend management is redundant at
best, and at worst re-opens the exact problem ADR-001's Option A (in-process
`require()`) was rejected for: giving an external tool-executing surface more
latitude in CEO Agent's own process than the integration actually needs.

## Decision

CEO Agent connects to Hermes as an **HTTP client of the `hermes gateway`'s
task-submission API** — not as a subprocess supervisor spawning `run_agent.py`.

Concretely:

- `HermesBridge.runTask()` (once implemented) issues an authenticated HTTP
  request to a configured gateway endpoint with the task payload, and maps the
  gateway's response to the existing bridge vocabulary (`triggered` / `failed`
  / `blocked` / `queued`) — same contract as ADR-001 established, different
  transport underneath it.
- CEO Agent never spawns, manages, or holds a handle to a Hermes process. No
  `child_process`, no `cwd` construction, no argv assembly, no stdio piping, no
  process-tree management for Hermes — none of that surface exists in this
  model.
- The `HERMES_RUNTIME_PATH` / `HERMES_APPLICATION_PATH` config fields as
  currently defined in `HermesBridge.js`'s constructor (pointing at a local
  submodule checkout) are the wrong shape for this model. They are **not
  changed in this ADR** — replacing them with a gateway URL + credential pair
  is implementation work that follows once the open items below are resolved.

## What this means for HermesBridge

- **Needs:** a scoped API credential to the gateway's task-submission
  endpoint — a bearer token or API key whose authority is limited to
  submitting and querying tasks, nothing broader.
- **Does not need:** process-spawn permissions, filesystem access to a
  submodule checkout, or any form of environment construction/inheritance for
  a child process. ADR-001's entire Option B process-layer-hardening
  machinery — constructed env, `shell:false`, scoped ephemeral cwd, bounded
  output buffers, `SIGTERM`→`SIGKILL` timeout ladder, concurrency cap — is
  moot here. There is no CEO-Agent-spawned child process for any of it to
  apply to.
- Failure/timeout handling moves from "the parent supervises a child
  process's lifecycle" to "the parent makes an HTTP request with a timeout
  and interprets an HTTP-level response or error" — the same class of problem
  `OpenRouterClient` already solves for model calls, not a novel
  process-supervision problem.

## What stays the operator's responsibility (unchanged from ADR-001)

ADR-001's kernel-layer conclusion is preserved, only relocated: **Node cannot
enforce filesystem/network confinement on untrusted code, so that boundary
must come from the deployment, not CEO Agent's application code.** Under
ADR-001 this meant "the operator runs the spawned Hermes process inside a
container CEO Agent doesn't control." Under this model it means the same
thing one level up: **deploying and sandboxing the `hermes gateway` process
itself — including which of its own execution backends (Docker / Modal /
Daytona / SSH / etc.) it's configured to run tool calls through — is entirely
the operator's (or Hermes's own) concern, not something CEO Agent's code
implements or claims to provide.** CEO Agent's own responsibility narrows to:
hold no more authority over the gateway than a scoped API credential
requires, and never claim an isolation guarantee about a system it does not
run.

## Open items — unresolved, not guessed

STEP 1 did not investigate these, and implementation cannot proceed without
them:

- **The `config.yaml` / `HERMES_HOME` (`~/.hermes`) layout** — what the
  gateway needs configured to run, and where CEO Agent's operator-facing setup
  would need to write to enable it.
- **The gateway's actual task-submission API surface** — endpoint shape, auth
  scheme, request/response contract, and how task status is queried or
  reported back. The STEP 1 audit established the gateway's existence and role
  from the CLI docstring and packaging metadata only; it did not read the
  `gateway/` package's actual source at the pinned commit.

Both need their own investigation pass before `HermesBridge.runTask()` can be
implemented for real. This ADR is a design decision, not a green light to code
against an unverified API shape.

## Non-goals (unchanged from ADR-001)

- **No arbitrary shell execution reaching CEO Agent's own process** — this was
  never CEO Agent's exposure under ADR-001 and remains not so under the
  gateway-client model.
- **No unscoped credential storage** — the gateway API credential is scoped to
  task submission, not a general Hermes admin key, and is never a passthrough
  of CEO Agent's own secrets (`OPENROUTER_API_KEY`, `DISPATCH_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`), which stay exactly as un-shared as ADR-001
  required.

## Consequences

- **No runtime behavior changes from this ADR.** Hermes remains
  validate-and-queue only, exactly as #27 left it — `HermesBridge.runTask()`
  is not implemented in this change.
- ADR-001's Option B (process-layer `child_process` hardening) and its
  *Prerequisite* section are superseded, for the Hermes case specifically, by
  this document. ADR-001's general isolation reasoning — Options A/C/D, the
  two-layer default-deny framing, the credential-scoping principles — remains
  correct and is retained as background, not deleted; it may still apply to a
  different, genuinely-local tool-executing runtime in the future.
- Implementation is still gated: on resolving the two open items above, then
  building an HTTP-based `HermesGatewayClient` (in place of the never-built
  `HermesRuntimeAdapter`) with the same honest status-mapping discipline
  ADR-001 established.
- `SECURITY.md` is unchanged by this document; it should be updated once real
  gateway-client wiring lands, not before.
