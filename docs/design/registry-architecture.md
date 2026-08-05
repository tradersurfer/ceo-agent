# Registry Architecture — how `registry/` actually works

- **Status:** Documentation (no code/behavior change in this document — see the companion PR for the code changes it motivated)
- **Date:** 2026-08-05
- **Related:** `registry/agent-registry.json`, `registry/skill-registry.json`, `registry/tool-registry.json`, `registry/workflow-registry.json`, `registry/project-registry.json`, `registry/registry.schema.json`, `core/RegistryLoader.js`, `sdk/AgentRegistry.js`, `core/runtimeFactory.js`, `sdk/CapabilityResolver.js`, `core/capabilities/catalog.js`, `core/SkillExecutor.js`, `sdk/Permissions.js`, `tests/RegistryDrift.test.js`

This document exists because none of the four facts below are stated anywhere else, and each one was only discoverable by reading source directly — the same investigation a new contributor (human or agent) would otherwise have to redo from scratch. Nothing here is a design decision; it's a description of what the code actually does today.

---

## 1. Two independent loaders, not one

There are **six** files in `registry/`, but **two separate, unrelated loading paths** read them — nothing in this codebase treats `registry/` as one unit:

- **`sdk/AgentRegistry.js`** loads `agent-registry.json` alone. Instantiated directly by `core/runtimeFactory.js` and by `app/api/agents/create/route.ts`.
- **`core/RegistryLoader.js`**'s `loadRuntimeRegistries()` loads the other four executable registries — `project-registry.json`, `skill-registry.json`, `tool-registry.json`, `workflow-registry.json` — via its own `REGISTRY_FILES` map, and wires their handlers into a live `SkillRegistry`/`SkillExecutor`/`WorkflowRuntime`. **`agent-registry.json` is deliberately absent from `REGISTRY_FILES`** — it is not one of the "other four," it has its own loader.

`registry.schema.json` is not loaded by either path (see §2). `Organization.js`'s `createDefault()` is a third, independent source that hardcodes the same agent data `agent-registry.json` declares — kept in sync only by `tests/RegistryDrift.test.js`'s explicit assertion, not by either loader reading the other.

If you're adding a new registry file or wondering why an agent-registry.json edit isn't showing up somewhere `RegistryLoader.js` reads from: check which of the two loaders is actually relevant first.

---

## 2. `registry.schema.json` is not runtime-enforced

Every JSON file in `registry/` points `"$schema": "./registry.schema.json"` at it, which reads as an active contract. It is not one. **Zero lines of code in this repository load, parse, or validate against `registry.schema.json`** — no `ajv`, no custom validator, nothing in `RegistryLoader.js`, `AgentRegistry.js`, or any test. It exists purely as human-readable documentation of an intended shape.

Two concrete consequences:

- It is already out of date relative to real, tested data: `workflow-registry.json`'s `executorTypes[]` array and `project-registry.json`'s per-project `runtimeId` field are both real, both cross-checked against the live runtime by `tests/RegistryDrift.test.js`, and **neither is declared anywhere in `registry.schema.json`**. A contributor using the schema as a reference for what a valid file looks like would write an incomplete one.
- Real drift protection for the four `RegistryLoader.js`-loaded files comes entirely from `tests/RegistryDrift.test.js`'s hand-written, field-by-field `assert.deepEqual` calls against the live runtime — a narrower, differently-shaped check than schema validation (it doesn't enforce the schema's `^[a-z][a-z0-9_]*$` id pattern or `uniqueItems` constraints, for instance). `agent-registry.json` gets a separate, also-hand-written check against `Organization.js`.

Wiring the schema into an actual validation step (CI, or inside `RegistryDrift.test.js`) is real, schema-shape-affecting work — see the recommendations this document's companion PR left open, held pending an ADR.

---

## 3. Authorization runs on `agent.skills`, never on `agent.capabilities`

This is the single most important fact for anyone touching permissions in this codebase, and it is not written down anywhere else.

Traced directly in `core/SkillExecutor.js`:

```js
if (skill.permissions?.requiresAgentAssignment) {
  const agent = context.agentId && this.agentResolver ? this.agentResolver(context.agentId) : null;
  const permissions = new Permissions({ tasks: agent ? agent.skills : [] });
  if (!agent || !permissions.isTaskAllowed(skillName)) {
    return this._finish('failed', skillName, context, { error: '...', reason: 'permission_denied' });
  }
}
```

`Permissions.isTaskAllowed()` checks the skill **name** against `agent.skills` — the array of skill-name strings each agent declares in `agent-registry.json`/`Organization.js`. Neither `agent.capabilities` nor a skill's own `capability` field is read anywhere in this check, or anywhere else in the authorization path (`sdk/Permissions.js`, `sdk/BaseBridge.js`).

`agent.capabilities` and `skill.capability` are real, but they are **categorization/display metadata, not a permission gate**:

- `agent.capabilities` is read by `Organization.js`'s `getOrganizationChart()`/`exportBlueprint()` (display), by `tests/RegistryDrift.test.js` (drift check), and by `sdk/CapabilityResolver.js`/`sdk/TaskRouter.js`'s capability-based routing branch — which is real, live code (wired into `sdk/Supervisor.js` → `core/JECIRuntime.js`) but **not reachable from any shipped product surface today**: both `app/api/chat/route.ts` and `app/api/dispatch/handler.js` route only by `assignedAgent` or `department`, never by `capability`. It would only matter the moment something starts routing by capability.
- `skill.capability` is read only by `SkillRegistry.findByCapability()`, which nothing in the live app calls today.

It follows that a skill's `capability` value does not need to match any real `agent.capabilities` entry for that skill to work correctly — 22 of the 65 registered skills currently declare a `capability` no agent actually has (mostly manager-skill and document-generation capabilities), and this is harmless by construction, not a bug, precisely because capability strings don't gate anything.

**If you are adding permission-gated behavior:** grant it via `agent.skills` (skill name), exactly like every existing skill does. `agent.capabilities` will not restrict or allow anything.

---

## 4. `agent-registry.json`'s metadata block is the odd one out

Every other file in `registry/` shares one top-level metadata convention:

```json
{ "$schema": "./registry.schema.json", "schemaVersion": "2.0.0", "registryType": "..." }
```

`agent-registry.json` alone uses a different, unrelated shape instead:

```json
{ "$schema": "./registry.schema.json", "registryType": "agents", "registry": { "version": "1.1.0", "owner": null, "org": null, "canonical_lead_agent": "ceo_agent", "description": "..." } }
```

Different key (`registry.version` vs. `schemaVersion`), different nesting (a whole metadata object vs. a flat string), different version number, and this block isn't modeled anywhere in `registry.schema.json`'s `agents` branch (which only requires `registryType` + `agents[]`). Not wrong — `sdk/AgentRegistry.js` doesn't read this block for anything functional — just inconsistent with the other five files in a way that isn't documented anywhere else, and easy to either copy incorrectly into a new registry file or assume is meaningful boilerplate when extending `agent-registry.json` itself.

---

## Where the real capability list lives

Two related-but-independent artifacts now exist for capabilities, each serving a different purpose, both kept honest by an explicit drift test against the same real source (`Organization.createDefault()`):

- **`sdk/CapabilityResolver.js`'s `RECOGNIZED_CAPABILITIES`** — the bare-string allowlist the (currently unreached) capability-routing path checks against. Drift-tested by `tests/RegistryDrift.test.js`.
- **`core/capabilities/catalog.js`** — the human-readable catalog (`{id, name, department, description}` per capability), mirroring `core/frameworks/catalog.js`'s pattern exactly (pure code, deep-frozen, no backing JSON file). Drift-tested by `tests/CapabilityCatalog.test.js`.

Both must equal the real 81-capability set `Organization.createDefault().listAgents().flatMap(agent => agent.capabilities)` produces exactly. If you add a capability to an agent, both need a matching entry or their respective drift test fails — this is intentional, not a bug to work around.
