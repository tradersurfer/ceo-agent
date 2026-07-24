# ADR-001: Sandboxed execution for the Hermes runtime

- **Status:** Proposed (design only — no execution code in this change)
- **Date:** 2026-07-24
- **Tracking issue:** [#36](https://github.com/tradersurfer/ceo-agent/issues/36)
- **Related:** [#27](https://github.com/tradersurfer/ceo-agent/issues/27) (bridge wiring, merged), `SECURITY.md`

> This is the repository's first ADR. There was no prior `docs/adr/` directory;
> the roadmap's later `ADR-006` (multi-provider SDK strategy) has not yet been
> written. This document establishes the canonical Context / Decision /
> Consequences / Non-goals ADR structure for the project, matching the
> `architecture_decision_records` framework already in `core/frameworks/catalog.js`.

---

## Context

`HermesBridge` (`departments/operations/hermes/src/HermesBridge.js`) validates a
structured task and returns `blocked` or `queued`. As of #27 it is registered as
a WorkflowRuntime executor and is dispatched through its real `runTask()`, but it
**does not execute anything** — `runTask()` delegates to `BaseBridge.execute()`,
which only validates and queues. Making Hermes actually *do* operational work
means invoking the external Hermes runtime.

That runtime is the `NousResearch/hermes-agent` git submodule
(`.gitmodules` → `https://github.com/NousResearch/hermes-agent.git`), mounted at
`departments/operations/hermes/hermes-agent/` and invoked per install via
`HERMES_RUNTIME_PATH` / `HERMES_APPLICATION_PATH`. It is an **external, local
agent runtime with tool-execution capability** — the class of program that runs
commands, reads and writes files, and makes network calls on the operator's
behalf.

`SECURITY.md` already states the boundary honestly:

> **Sandboxing of agent execution** — Hermes and other agent runtimes are not
> sandboxed by this scaffold. If you wire a real Hermes runtime, apply your own
> process isolation.

So the security problem is not incidental — it is the entire reason execution was
deferred. Wiring execution without isolation would give an external, tool-capable
process the parent Node process's full ambient authority: every secret in
`process.env` (`OPENROUTER_API_KEY`, `DISPATCH_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, webhook secrets), the whole filesystem, and
unrestricted network egress. That is unacceptable for a white-label product other
people install.

**This ADR designs the isolation boundary. It does not implement it.** A
prerequisite of any implementation is a concrete audit of the submodule's actual
runtime requirements (see *Prerequisite* below), which cannot be assumed from
outside the checked-out code.

## Decision drivers

1. An external tool-executing runtime must be treated as **untrusted**, even
   though it is a reputable upstream — trust is about capability and blast
   radius, not provenance.
2. The isolation boundary must **default to deny**: no ambient env, no network,
   no filesystem beyond an explicit scope, no unbounded resource use.
3. The code must never **claim** an isolation guarantee it does not actually
   enforce. Node.js cannot, by itself, restrict a child process's filesystem or
   network access; the design must be honest about which boundary is enforced by
   CEO Agent's code and which is delegated to the operator's deployment (a
   container / OS sandbox).
4. Until real isolation exists, Hermes stays validate-and-queue-only. Shipping
   partial isolation that *looks* like execution is worse than shipping none.

## Isolation options considered

### Option A — In-process (`require()` the submodule and call it)
Rejected. Shares the Node event loop and, critically, the parent's
`process.env`, file descriptors, and network stack. Zero isolation, maximum blast
radius. This is precisely the non-option `SECURITY.md` warns against.

### Option B — `child_process.spawn` with process-level hardening
Spawn the runtime as a separate OS process with:
- an **explicitly constructed** environment object (never `...process.env`);
- `shell: false` and an explicit `argv` (no string interpolation of task content
  into a command line);
- `cwd` set to a per-run, ephemeral, scoped working directory;
- piped (not inherited) stdio, with **bounded** output buffers;
- a hard wall-clock timeout enforced by the parent (`AbortSignal.timeout` to
  signal, then `SIGTERM` → `SIGKILL`);
- a concurrency cap so one caller cannot spawn unbounded processes.

Necessary, and all of it is implementable in Node — **but not sufficient**:
`child_process` does **not** restrict what the child can read on the filesystem
or which network hosts it can reach. A spawned process can still `open()` any
readable file and connect to any host.

### Option C — Container / OS-level isolation (Docker/Podman, seccomp, gVisor)
Run the runtime inside a container with `--network none` (or an egress-allowlist
proxy), a read-only root filesystem plus a single writable scoped volume, a
non-root user, dropped Linux capabilities, a seccomp profile, and cgroup limits
on memory / CPU / pids. This is the security-correct boundary for untrusted,
tool-executing code, because filesystem and network confinement are enforced by
the kernel, not by hopeful cooperation.

Cost: requires a container runtime on the host and heavier operational surface.

### Option D — microVM (Firecracker) / full VM
Strongest isolation, highest complexity and latency. Overkill for a first pass;
noted as a future option if Hermes runs genuinely hostile workloads.

## Decision

Adopt a **two-layer boundary** and be explicit about who enforces each layer:

1. **Process-layer hardening (enforced by CEO Agent's code, Option B).** A future
   `HermesRuntimeAdapter` spawns the runtime with a constructed minimal env, no
   shell, a scoped ephemeral `cwd`, bounded output, hard timeout, and a
   concurrency cap. Results map to the existing bridge vocabulary: a genuine
   successful run → `triggered`; validation failure → `blocked`; timeout /
   non-zero exit / oversized output / spawn error → `failed`; unconfigured
   runtime → `queued` (unchanged from today).

2. **Kernel-layer confinement (delegated to the operator's deployment, Option
   C).** Filesystem and network isolation are provided by running Hermes inside a
   container the operator configures (`--network none` or egress allowlist,
   read-only rootfs + one scoped volume, dropped caps, seccomp, cgroup limits).
   CEO Agent **documents this as a hard requirement** for enabling execution and
   must not present filesystem/network isolation as something its own code
   provides.

The recommended **minimum viable** first implementation is therefore: implement
the process-layer hardening fully, ship a reference container manifest, and gate
real execution behind an explicit opt-in (`HERMES_SANDBOX_MODE`) that refuses to
run untrusted execution unless a container boundary is declared present. This
keeps the honest posture: without the operator's confinement layer, Hermes stays
`queued`.

### Credential handling

Hermes runs with **its own scoped credentials**, never inherited parent access.

- The child environment is built as a fresh object containing only the variables
  Hermes actually needs (e.g. a dedicated `HERMES_*` credential set), never
  `{ ...process.env }`.
- Parent secrets — `OPENROUTER_API_KEY`, `DISPATCH_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, bridge webhook secrets — must be
  provably absent from the child env (a test asserts this).
- Prefer short-lived / narrowly-scoped credentials issued per run over long-lived
  shared secrets, so a compromised run has a bounded, revocable blast radius.
- Any credential Hermes needs to call back into CEO Agent must be a distinct,
  least-privilege token, not the dispatch secret.

### Failure, timeout, and resource-exhaustion handling

- **Wall-clock timeout:** a hard per-run limit; on expiry, `SIGTERM`, then
  `SIGKILL` after a grace period. A timed-out run is `failed`, never `triggered`.
- **Output flooding:** stdout/stderr buffers are capped; exceeding the cap
  terminates the run and returns `failed` (prevents parent memory exhaustion via
  output).
- **Resource caps:** memory / CPU / pids limits via the container's cgroup
  configuration (kernel-enforced); the process layer additionally caps
  concurrency so a single tenant cannot exhaust host process slots.
- **Non-blocking:** the parent never blocks the event loop on a child; a hung
  child cannot stall dispatch or the workflow runtime.
- **Honest status:** every failure path returns `failed` (or `blocked`/`queued`
  as appropriate) with a truthful reason. WorkflowRuntime already treats anything
  other than `triggered` as step failure — that contract is preserved.

## Non-goals (hard boundaries for the first pass)

Mirroring the security boundaries the roadmap set for Priority 4 skill execution
(no arbitrary shell, no unrestricted filesystem, no unreviewed network):

- **No arbitrary network access** from the sandbox. Default deny; egress only to
  an explicitly configured allowlist, if any.
- **No filesystem writes outside** a single scoped, ephemeral per-run working
  directory. No writes to the repo, the home directory, or system paths.
- **No inheritance of the parent environment or secrets.**
- **No arbitrary shell execution.** `shell: false`, explicit `argv`, and task
  content is never interpolated into a command string.
- **No unbounded runtime, memory, CPU, output, or process count.**
- **No claim of kernel-level filesystem/network isolation from Node alone** — that
  boundary is the operator's container, and the product says so plainly.
- **Not** a general-purpose code sandbox, a multi-tenant compute platform, or a
  replacement for the operator's own infrastructure hardening.

## Prerequisite for implementation

Before writing adapter code, audit the actual `NousResearch/hermes-agent`
submodule (currently referenced but not checked out in this repo):

- language runtime and version (Node? Python? both?);
- dependency footprint and install step;
- what filesystem paths it genuinely needs to read/write;
- what network destinations it must reach to function;
- how it is invoked (CLI entrypoint, argv/stdin protocol, exit-code semantics);
- what credentials it consumes and how they are passed.

The isolation design above is correct regardless of these answers, but the
concrete adapter, container manifest, and egress allowlist cannot be finalized
without them.

## What implementation would take (separate from this design)

1. Audit the submodule (prerequisite above).
2. `HermesRuntimeAdapter` implementing the process-layer hardening and the
   result→status mapping; wired into `HermesBridge` behind `HERMES_SANDBOX_MODE`.
3. A reference container manifest (rootfs read-only, `--network none` or egress
   allowlist, non-root, dropped caps, seccomp, cgroup limits) and a documented
   "execution requires this boundary" deployment requirement.
4. Configuration: `HERMES_RUNTIME_PATH`, `HERMES_SANDBOX_MODE`, resource limits,
   egress allowlist, scoped credential wiring.
5. Tests in the existing style, against a **mock** runtime (no live Hermes
   needed): parent env/secrets provably not inherited; timeout kills a hung
   child; oversized output is capped and fails; non-zero exit → `failed`; a
   successful mock run → `triggered`; unconfigured → `queued`.
6. Update `SECURITY.md` to move Hermes sandboxing from "not handled" to a
   described, bounded capability — only once the above is real.

## Consequences

- **No runtime behavior changes from this ADR.** Hermes remains validate-and-queue
  only, exactly as #27 left it. This is a design artifact.
- The project now has a `docs/adr/` directory and a canonical ADR format for
  future decisions (including the still-unwritten multi-provider ADR).
- Implementation is explicitly gated on a security-correct boundary and an
  upstream audit, so no one is tempted to ship "execution" that quietly runs an
  untrusted process with the parent's full authority.
- `SECURITY.md`'s honest posture is preserved: nothing here claims isolation the
  code does not yet enforce.
