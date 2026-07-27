# Vision Backlog

This is a **reference document**, not an implementation plan and not a set
of individual tracked issues. It triages a batch of product-direction ideas
— sourced in part from AionUi (Apache-2.0), a comparable open-source agent
UI Adrian reviewed — into what needs a design doc first, what's validated
but should be built original, what's real and low-risk to scope later, and
what's reference material only.

**Nothing here is approved for implementation as-is.** Anything that
eventually gets built goes through this project's normal path: an ADR for
anything touching security or execution scope (same standard as
[ADR-001](./adr/ADR-001-hermes-sandboxed-execution.md) /
[ADR-001a](./adr/ADR-001a-hermes-gateway-client-model.md)), real logic, real
tests, and real permission wiring for anything touching the skill/agent
registries — the same standard `docs/BACKLOG-skill-expansion.md` holds
itself to.

---

## Needs a design doc before any implementation (do not build directly)

### YOLO / full-auto mode

Auto-approve all agent actions without confirmation — an idea from AionUi,
which ships a comparable feature.

This runs directly against this project's standing security discipline:

- The sandboxing carefulness [ADR-001](./adr/ADR-001-hermes-sandboxed-execution.md)
  and [ADR-001a](./adr/ADR-001a-hermes-gateway-client-model.md) went through
  for Hermes execution specifically because an external, tool-executing
  surface must be treated as untrusted and default-deny, not because Hermes
  itself is suspect. (No ADR-001b exists in `docs/adr/` as of this writing —
  check again before scoping this, since ADR-001a's own open items, the
  gateway config layout and task-submission API surface, are still
  unresolved and could still produce one.)
- Per-skill permission gating through `core/SkillRegistry.js` /
  `core/SkillExecutor.js` (see `docs/SKILLS.md`).
- Audit logging on every outcome (`core/persistence/SupabaseAuditLog.js`).
- Every department's explicit `off_limits` list in
  `registry/agent-registry.json` (e.g. "Live financial transactions,"
  "Unauthorized production deployments," "Overriding the CEO Agent").
- The standing no-merge-without-human-go/no-go rule this project operates
  under — nothing here ships without an explicit human decision, which is
  close to the opposite of what full-auto mode asks for by design.

This is worth citing as a concrete data point, not a reason to distrust the
idea's source: AionUi is Apache-2.0 and otherwise a reasonable reference,
but it independently failed a third-party automated security scan with
high-severity findings. That's a signal about the specific auto-approval
feature class, not a judgment on the rest of this backlog.

If a scoped version of this ever gets built, it needs its own ADR first —
explicit scope, explicit non-goals, reviewed before code — the same bar
ADR-001 set for Hermes execution. Nothing about auto-approval should land
as an incidental flag on an unrelated PR.

---

## Validated conceptually, build original (don't port code)

### "Team Mode" — Leader/Teammate multi-agent coordination via a shared task board

AionUi implements a Leader/Teammate coordination model over a shared task
board. Conceptually, this is architecturally close to what this codebase
already does: CEO Agent as the executive/leader layer routing to department
heads (`organization/Organization.js`, `TASK_ROUTER.md`), which in turn
delegate to skills through `core/SkillRegistry.js` /
`core/SkillExecutor.js`, with Hermes as a bridge-based execution head
(`departments/operations/hermes/`). The existing `/org` command and
`OrgView.tsx` component already render the org chart as installed
departments and their agents.

That AionUi ships something in this shape is a useful validation that the
department-head-plus-skill-delegation direction here is architecturally
sound — not a reason to think this needs a new subsystem. Given the
security-scan flag above, treat AionUi's own implementation as validation
only, not as a code source, until it's better understood independently of
this backlog note.

---

## Real, low-risk, log for future scoping

- **Local inference support (Ollama/LocalAI) as opt-in OpenAI-compatible
  providers.** Fits `lib/providers.js`'s existing shape directly — any
  endpoint speaking `/v1/chat/completions` is just another provider entry
  alongside the `openrouter`/`anthropic`/`openai`/`google`/`xai` table
  already there. Genuinely low-risk once BYNGE Phase 2 exists to give
  non-OpenRouter providers a real dispatch path (`ACTIVE_PROVIDER_IDS` in
  `lib/providers.js` is `['openrouter']` only as of BYNGE Phase 0 — Phase 2
  chat-role provider wiring is landing now in a parallel stream; check its
  state before scoping this further).

  **Priority analysis (Adrian's notes):**

  - **LocalAI — best fit, prioritize first.** Full OpenAI-compatible
    drop-in, multi-modal, good tool-calling support, Docker/K8s-friendly.
    Lowest friction into the existing provider abstraction.
  - **Ollama — strong secondary.** Simplest option for dev/single-machine
    use, excellent model management plus an OpenAI-compatible endpoint.
    Ideal for a "local cost mode," testing, and privacy-sensitive runs.
    Already popular, so users are likely to already know it.
  - **LM Studio — weak as infrastructure, skip deep integration.** A
    desktop GUI aimed at end users, not a platform backend. Fine to let
    users point CEO Agent at a running LM Studio server, but not worth
    first-class/dedicated code.

  **How to add without steering the product:**

  1. Treat local as just another OpenAI-compatible provider — extend the
     existing model-resolution path so any endpoint speaking
     `/v1/chat/completions` (Ollama `:11434`, LocalAI `:8080`, LM Studio
     `:1234`, vLLM, etc.) can be registered.
  2. Make it opt-in and visible in existing surfaces — an optional
     "Add local provider" step in setup/settings, a "Local/Private" cost
     tier alongside Flagship/Efficient/Affordable. No new commands needed.
  3. Don't change the default path — OpenRouter/direct cloud providers
     stay the zero-hardware, high-quality default. Local is the
     enhancement for privacy/air-gapped use, high-volume internal cost
     control, offline/low-latency, and dev testing without burning
     credits.
  4. Scope tightly — config is just base URL + optional API key + model
     name mapping. No need to ship or manage models.

  **Practical next step (Adrian's call):** start with LocalAI and Ollama
  as optional backends; document LM Studio as "also works if you point at
  it" without dedicated code.

- **Search integration (Perplexity / ChatGPT Search / Google AI Mode) as a
  department-head tool**, to improve decision quality on research-shaped
  tasks (`TASK_ROUTER.md` already routes "Research" to CEO Agent itself).

- **Live multi-department org-chart view.** Real-time "working" status or
  paraphrased progress across departments simultaneously, extending the
  existing `OrgView.tsx` (`app/components/OrgView.tsx`). Today that
  component does a single `fetch('/api/org')` on mount and renders a static
  department/agent grid — no live or polling status yet. A natural fit once
  department drill-down work is underway; ties directly to the mission
  statement's framing of visibility into what's happening across the
  business in real time.

- **More CLI/coding integrations** (Kimi K3 Code, Grok Build, Copilot CLI,
  Droid, OpenCode) — the same shape of question as BYNGE Phase 2's chat-role
  providers, but for dev-work roles specifically rather than chat roles.

- **Document-assistant pattern validation.** AionUi ships 21 built-in
  assistants (PPT/Word/Excel/financial-model creators, etc.). This is a
  validation point, not a target: this codebase already has
  `generate_docx`, `generate_pdf`, and `generate_spreadsheet` shipped under
  CMO (`core/skills/documentCreationSkills.js`, see
  `docs/BACKLOG-skill-expansion.md`), plus `compute_financial_model` /
  `import_revenue_csv` under CFO. AionUi's specific 21-assistant catalog is
  more than this product needs — it confirms the existing direction was
  right, not a checklist to match. Adrian's explicit caveat on AionUi
  itself: "we can actually use AionUI, on the local level only, for
  ceo-agent CLI. If it doesn't fit, scrap this idea or implementation." —
  i.e. a local/CLI-only trial, not a commitment; discard if it doesn't fit.

- **Logo/favicon rollout.** Adrian has a CEO Agent logomark asset ready to
  apply as the logo and favicon across all screens/pages. Asset-swap-level
  work, low risk — just needs to get scheduled.

---

## Reference material, not action items

AI LLM School Material notes Adrian reviewed — mostly links already known
or in use in this project. This project trains multiple agents beyond CEO
Agent itself: **Agent JECI** (Business/CEO/Executive-MBA/Agentic-AI/
Generative-AI/LLM agent trainer), **LEVI** (Stocks/Options/Finance/
Investing), **Agent Domo**, and **CEO Agent**.

Reference links noted:

- [Learn to Prompt](https://learntoprompt.org) by nvk — includes a Claude
  Code guide.
- An NVIDIA paper on open-weights and American AI leadership.
- Claude Code's plugin-building and skill-building docs.
- [Open Harness](https://github.com/mifunedev/openharness) — a portable,
  per-project sandbox harness (one repo per sandbox, isolated Docker
  container, versioned state) for running coding agents (Claude Code,
  Codex, OpenCode, Pi) unattended rather than on the bare host. Relevant
  background for how BYNGE/Hermes sandboxing thinking
  ([ADR-001](./adr/ADR-001-hermes-sandboxed-execution.md) /
  [ADR-001a](./adr/ADR-001a-hermes-gateway-client-model.md)) fits the
  broader landscape.

All background reading — no action items.

---

## Proposed architecture reference (not adopted, needs Adrian's explicit decision before any restructuring)

Adrian shared file-tree structure recommendations for two areas. Logging
these as a **proposal**, not something to execute: they have **not** been
evaluated against the current actual `/core`, `/lib`, `/skills` structure,
and this is a structural-refactor candidate, not a documentation-only
backlog item — it needs its own review/ADR-style decision later, not
silent adoption.

- **A `/core/frameworks/` tree organized by department** —
  `strategic/`, `marketing/`, `operations/`, `people/` — holding
  lightweight `.md`/`.json` reference docs for LLM-parseable strategic and
  domain frameworks (OKR alignment, BSG matrix, AARRR funnel, STP
  positioning, value-stream mapping, Galbraith star model, ADKAR change
  management).

- **A restructured `/core/skills/` tree** with a `registry.json` manifest
  indexing all skills and routing maps, organized by functional domain
  (`marketing/`, `data/`, `integrations/`) rather than a flat list.
  Rationale given: presenting 50+ tools at once measurably hurts
  tool-selection accuracy, so skills should be organized as a "Unified
  Provider Interface" where the agent only sees the functional domain, not
  which backend (OpenAI / Claude / in-house script) drives it. Two
  architectural rules noted:
  - Every skill file should export a standard schema (OpenAI
    tool-definition or Anthropic tool-declaration shape) with
    description/parameters.
  - A `RegistryLoader.js` should lazy-load only the tool definitions
    matching the active agent's department/workflow stage (e.g. don't load
    marketing skills for the legal agent).

- **`/core` should stay pristine** — orchestration engine logic only
  (`WorkflowRuntime`, `ModelResolver`, etc.). Provider SDKs and
  third-party client wrappers belong in `/lib`, not `/core`.

**Expected follow-up, not yet received:** Adrian mentioned he'll send an
`agent-registry.json` file separately — he doesn't have it ready yet. This
is flagged as expected input; this doc isn't waiting on it to be
considered complete.

---

## Dashboard visual reference

Adrian shared an AionUi mobile/desktop screenshot as visual reference for a
future dashboard redesign — "more game-ish but professional." This is input
for whenever the command-surface/dashboard work is actually in scope (post-
BYNGE), not actionable today.
