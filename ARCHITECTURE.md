# CEO Agent Platform Architecture

_Sovereign. Reusable. Multi-tenant._

---

## 1. CEO Agent Core

**Location:** `sdk/`, `core/`, `registry/`, `departments/*/src/*Bridge.js`, `app/api/dispatch/`

CEO Agent Core is the platform runtime. It has zero knowledge of any specific
business, client, tenant, or product. It only knows:

- How to supervise agents (`Supervisor`, `TaskRouter`, `BaseBridge`)
- How to validate and queue tasks (`Task`, `TaskQueue`, `Permissions`)
- How to route by department, agent ID, or capability
- How to dispatch to registered agent bridges
- How to execute a sequence of steps once routed (`WorkflowRuntime`)
- How to load the agent registry

**Core does not know about any specific tenant's business name.**
**Core does not know about any specific tenant's clients.**
**Core does not know about any specific tenant's industry.**

This is intentional and permanent. Violating this rule makes the platform
unmaintainable and un-sellable.

---

## 2. Product Structure: C-Suite Departments

CEO Agent's distribution unit is the **department**, not a bundled "office"
product. On install, a tenant activates whichever of the seven standard
departments (Executive, Finance, Operations, Technology, Marketing, People,
Legal) they need — see `organization/Organization.js` for the full chart.
Each department has a conversational head agent and, optionally, one or
more automatable agent bridges reporting to that head.

**Note on "Offices":** an earlier draft of this document described bundled
"Office products" (`offices/<id>/`) as a core platform concept. That model
belongs to a separate product — Agent-JECI's BIB Marketplace — not to CEO
Agent. CEO Agent's public scaffold does not include an `offices/` concept;
the C-suite department structure serves the role that "Offices" played in
that other system. If this repo ever needs office-style bundling in the
future, that is a distinct, deliberate decision — not an inherited default.

---

## 3. Department Agents

**Location:** `departments/<department>/<agent-id>/`

An agent is a single callable role with a defined contract
(bridge, capabilities, authorized task types). Agent bridges report to a
department head in `organization/Organization.js` and are registered in
`registry/agent-registry.json`.

Example structure:
- `departments/operations/hermes/` — the Chief Operating Officer and operations execution bridge
- `departments/finance/credit-office/` — sales intake and onboarding communications
- `examples/dispute-agent/` — optional regulated-domain reference implementation, not in the default roster

Agent products expose a bridge interface. Tenants do not write bridge code —
they configure which agents are active via environment variables
(`CEO_AGENT_PROJECTS`, `CEO_AGENT_APPROVERS`, and per-bridge runtime URLs).

---

## 4. Tenant Installations

**Location:** `.env`, `ceo-agent.config.json` (both gitignored, per-install only)

A tenant's installation-specific configuration — agent name, principal
name, business context, active departments, cost mode, model provider
keys, and bridge runtime URLs — lives entirely outside the committed
codebase. Moving to a new business or renaming the installation requires
only editing local config, zero core changes.

---

## 5. Workflow Execution

**Location:** `core/WorkflowRuntime.js`, `core/BridgeExecutors.js`

`WorkflowRuntime` executes an ordered sequence of steps with dependencies,
conditions, delays, and retries — see `docs/WORKFLOW_RUNTIME.md` for full
detail. `BridgeExecutors.js` registers the Sales Intake and Onboarding Comms
department bridges, plus the optional Dispute Agent example, as workflow-step
executors so a workflow step can call a bridge's `trigger()` method.

Workflow definitions themselves (what steps exist, in what order, for what
purpose) are not shipped in this repo — they're something an install
defines for its own use case, using `WorkflowRuntime.execute()` directly.

---

## 6. What Belongs in Core

```
sdk/                       — Supervisor, TaskRouter, BaseBridge, AgentRegistry, etc.
core/                      — Runtime, DepartmentManager, ModelBroker, RuntimeConfig, WorkflowRuntime, BridgeExecutors
registry/agent-registry.json  — canonical agent roster
departments/*/src/*Bridge.js — default department bridge implementations
examples/*/src/*Bridge.js  — optional reference bridge implementations
app/api/dispatch/          — supervisor dispatch endpoint
```

Rules for core files:
- No tenant names
- No business names
- No specific URLs or webhook addresses
- No product pricing
- No email addresses
- No Telegram tokens
- No Slack webhooks
- No branding

---

## 7. What Must Never Be Hardcoded into Core

| What | Why |
|------|-----|
| Any tenant's business name | Belongs in local `.env`/config, not committed |
| Any tenant's contact info | Belongs in local config |
| Any tenant's domain/URL | Belongs in local config |
| Any runtime service URL | Runtime env var — belongs in `.env` |
| Any webhook URL | Secret — `.env` only |
| Any bot/channel token | Secret — `.env` only |
| Payment/price IDs | Not part of this scaffold |
| Any business-specific threshold or rule | Belongs in workflow definitions the install writes itself |

---

## Deployment Model

```
CEO Agent Core
    ↓ supervises
    ├── CFO Agent, Hermes/COO, CTO Agent, CMO Agent, CHRO Agent, CLO Agent
    ↓ some department heads supervise
    └── VP of Sales, Onboarding Comms Agent (Marketing)
    ↓ automatable agents are callable via
Dispatch API  or  Workflow Runtime (BridgeExecutors)
```

The Dispute Agent remains available under `examples/` but is not part of the
default deployment model or active registry.

Same platform. Different tenants. Different departments activated. Same core.
