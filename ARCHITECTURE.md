# CEO Agent Platform Architecture

_Sovereign. Reusable. Multi-tenant._

---

## 1. CEO Agent Core

**Location:** `sdk/`, `core/`, `registry/`, `agents/*/src/*Bridge.js`, `app/api/dispatch/`

CEO Agent Core is the platform runtime. It has zero knowledge of any specific
business, client, tenant, or product. It only knows:

- How to supervise agents (`Supervisor`, `TaskRouter`, `BaseBridge`)
- How to validate and queue tasks (`Task`, `TaskQueue`, `Permissions`)
- How to route by department, agent ID, or capability
- How to dispatch to registered agent bridges
- How to load the agent registry

**Core does not know about any specific tenant's business name.**
**Core does not know about any specific tenant's clients.**
**Core does not know about any specific tenant's industry beyond what's declared in their installed Office.**

This is intentional and permanent. Violating this rule makes the platform
unmaintainable and un-sellable.

---

## 2. Marketplace

The storefront where Office products and Agent products are listed,
previewed, and installed by tenants. CEO Agent Core is the engine underneath.
The Marketplace is the product distribution layer — the App Store for
CEO-Agent-powered business automation.

Tenants browse, select, and install offices and agents from the marketplace.
The marketplace does not contain workflow logic. It contains listings,
pricing, install flows, and tenant onboarding.

---

## 3. Office Products

**Location:** `offices/<office-id>/`

An office product is a vertical-specific bundle of workflows, agent
assignments, and default configuration. It is generic — it knows nothing
about a specific tenant's branding or business name.

Example structure:
- `offices/<vertical-a>/` — e.g. a professional-services vertical (credit repair, legal intake, consulting)
- `offices/<vertical-b>/` — e.g. a general business-automation vertical (lead intake, scheduling, follow-up)

An office product defines:
- What it does (`office.json`)
- Which agents it requires and which are optional
- Which workflow packs it includes
- What config a tenant must provide to install it

---

## 4. Agent Products

**Location:** `agents/<category>/<agent-id>/`

An agent product is a single callable agent with a defined contract
(bridge, capabilities, authorized task types). Agents can be required
by an office, optionally added to an office, or installed standalone.

Example structure:
- `agents/legal-compliance/dispute-agent/` — regulated dispute/compliance automation pipeline
- `agents/operations/hermes/` — operations and execution automation

Agent products expose a bridge interface. Tenants do not write bridge code —
they configure which agents are active in their `office-install.json`.

---

## 5. Tenant Installations

**Location:** `tenants/<tenant-id>/`

A tenant is a business that has installed one or more office products.
Tenant configuration contains:

- Brand identity (name, tagline, colors, website)
- Contact and notification routing (email, Slack, Telegram)
- Which office is installed and which workflows are active
- Tenant-specific overrides (subject lines, step delays, agent persona)
- References to env var keys (never actual secrets)

Tenant config is the only place business-specific information lives.
Moving a tenant to a new office or renaming a tenant requires only
editing their config directory — zero core changes.

---

## 6. Workflow Packs

**Location:** `offices/<office-id>/workflows/<workflow-id>.json`

A workflow pack is a reusable, ordered sequence of automation steps
triggered by a specific event. Steps have types, templates, delays,
and optional conditions.

Workflow packs are office-level assets. They are tenant-agnostic.
Tenants enable or disable workflow packs in their `office-install.json`
and may override specific step parameters (subject lines, delay timing)
without modifying the pack itself.

---

## 7. What Belongs in Core
sdk/                     — Supervisor, TaskRouter, BaseBridge, AgentRegistry, etc.
core/                    — Runtime, DepartmentManager, ModelBroker, RuntimeConfig
registry/agent-registry.json  — canonical agent roster
agents/*/src/*Bridge.js  — agent bridge implementations
app/api/dispatch/        — supervisor dispatch endpoint

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

## 8. What Belongs in Tenant Config
tenants/<id>/tenant.json         — brand, contact, notification routing
tenants/<id>/office-install.json — which office, which workflows, overrides

Rules for tenant files:
- All business-specific naming lives here
- References to env var names (not actual values) for secrets
- Step-level overrides (subject lines, delay timing, persona name)
- Never actual API keys, tokens, or webhook URLs

---

## 9. What Must Never Be Hardcoded into Core

| What | Why |
|------|-----|
| Any tenant's business name | Belongs in `tenants/<id>/tenant.json` |
| Any tenant's contact info | Belongs in `tenants/<id>/tenant.json` |
| Any tenant's domain/URL | Belongs in tenant config |
| Any runtime service URL | Runtime env var — belongs in `.env` |
| Any webhook URL | Secret — `.env` only, referenced by key name in tenant config |
| Any bot/channel token | Secret — `.env` only |
| Email templates with specific brand names | Template variables only; brand injected from tenant config at render time |
| Payment/price IDs | Product config — belongs in office or tenant config, not core |
| Third-party client IDs | Tenant-specific integration — belongs in tenant config |
| Any business-specific threshold or rule | Workflow config — belongs in workflow JSON |

---

## Deployment Model
CEO Agent Core
↓ supervises
├── Agent A
├── Agent B
└── Agent C
↓ all serve
Office Workflows
↓ installed by
Tenant Installation
↓ listed on
Marketplace

Same platform. Different tenants. Different workflows. Same core.