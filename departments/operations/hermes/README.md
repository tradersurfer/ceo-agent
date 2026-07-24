# Hermes — Chief Operating Officer

{{AGENT_NAME}} is the Chief Operating Officer for {{BUSINESS_CONTEXT}}, reports to {{CEO_AGENT_NAME}}, and turns approved direction into operating plans, ownership, capacity decisions, workflow readiness, and accountable status.

## Runtime source of truth

`PROMPT.md` is the system-prompt source consumed by CLI and web chat. The prompt loader substitutes:

- `{{AGENT_NAME}}`
- `{{CEO_AGENT_NAME}}`
- `{{PRINCIPAL_NAME}}`
- `{{BUSINESS_CONTEXT}}`

Missing operating facts remain `null` or unknown; the COO is instructed to state the gap rather than fabricate them.

The full executive framework catalog is implemented in `core/frameworks/catalog.js` and exposed by `runtimeFactory` as `runtime.frameworkCatalog`.

## Current integration, accurately

`src/HermesBridge.js` is a validation-and-queue bridge:

- it checks `agent`, approver, project, task type, goal, and task;
- it returns `blocked` for invalid work;
- it returns `queued` for valid work;
- it does not execute an external runtime;
- `executionConnected` remains false.

`CEO_AGENT_APPROVERS` defaults to `ceo_agent`. `CEO_AGENT_PROJECTS` defaults to empty, so no project passes bridge validation until the installer configures one. `HERMES_RUNTIME_PATH` and `HERMES_APPLICATION_PATH` are metadata, not active adapters.

The optional `hermes-agent` submodule points to external runtime source. Having the submodule checked out does not connect it to CEO Agent.

The dispatch API currently special-cases Hermes as queued without calling `HermesBridge.runTask()`. `core/BridgeExecutors.js` does not register Hermes as a WorkflowRuntime executor. These are deliberate truths in the COO prompt so conversational responses cannot overstate execution.

## Manager skills

Hermes is selectively assigned:

- task decomposition;
- delegation briefs;
- priority scoring;
- status synthesis;
- escalation assessment;
- department/capability lookup;
- workload balancing;
- quality review;
- budget/token allocation.

These skills return permission-gated, audited analysis. They do not automatically execute workflows, change permissions, reassign work, or authorize spending.

## Document map

- `IDENTITY.md` defines the COO mandate, bridge reality, RACI, decision rights, and boundaries.
- `BEHAVIOR.md` defines intake, framework use, workload/status handling, collaboration, failure, and acceptance criteria.
- `CONTRACT.md` defines structured inputs, allowed bridge task types, output states, permissions, workflow limits, and prohibited actions.
- `PROMPT.md` is the executable behavioral instruction.
- `SOUL.md` defines durable operating judgment, stewardship, and status truth.

## Scope

This document set changes COO/Hermes only. CEO, CFO, CTO, CMO, CHRO, CLO, subordinate agents, bridges, workflow runtime, and manager-skill implementations are unchanged.
