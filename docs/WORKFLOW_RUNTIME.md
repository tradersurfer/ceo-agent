# Workflow Runtime

`core/WorkflowRuntime.js` is the execution engine for multi-step automated
work. It is intentionally generic — it has no knowledge of any specific
business or tenant.

## What it does

- Executes an ordered list of steps.
- Supports step dependencies (`depends_on`), so a step only runs after
  another completes or is skipped.
- Supports conditional steps (`condition: { field, operator, value }`) —
  currently `eq` and `exists` operators.
- Supports delayed steps (`delay_minutes` / `delay_hours` / `delay_days`) —
  a delayed step goes into `waiting` status until its scheduled time, and
  the run must be re-invoked via `resume()` after that time to continue.
- Supports retries (`max_attempts`) — a failing step is retried up to the
  configured limit before the run is marked `failed`.
- Emits lifecycle events via a Node `EventEmitter` and records them to a
  pluggable audit log (defaults to in-memory; swap in a real store for
  production).
- **Has real executors registered for the default Sales Intake and Onboarding
  Comms bridges, plus the optional Dispute Agent example**, via
  `core/BridgeExecutors.js` — a workflow step with `type: 'create_lead'`, for
  example, actually calls `SalesIntakeBridge.trigger()`.

## What it does NOT do yet

- **No scheduler.** `resume()` must be called by something external once a
  delayed step's scheduled time has passed — there's no built-in cron or
  polling loop in this scaffold. A production install needs to wire this.
- **No persistent store wired by default.** `InMemoryWorkflowStore` and
  `InMemoryAuditLog` lose all state on process restart. Swap in real
  implementations (e.g. Supabase-backed, matching the pattern in
  `sdk/MemoryClient.js`) before relying on this for anything that needs
  to survive a restart.
- **No pre-built workflow definitions.** This engine and its bridge
  executors are ready to use, but no actual workflow JSON/object is
  shipped in this repo — each install defines its own.

## Usage

Register the real bridge executors, define a workflow, and execute it:

```js
const { WorkflowRuntime } = require('../ceo-core/WorkflowRuntime');
const { registerBridgeExecutors } = require('../ceo-core/BridgeExecutors');

const runtime = new WorkflowRuntime();
registerBridgeExecutors(runtime, { project: 'your-project-id' });

const workflow = {
  id: 'example-workflow',
  steps: [
    { id: 'capture', type: 'create_lead' },
    { id: 'welcome', type: 'email_welcome', depends_on: 'capture' },
    { id: 'follow_up', type: 'email_welcome', depends_on: 'welcome', delay_days: 2 },
  ],
};

const run = await runtime.execute({ workflow, input: { name: 'Example Lead' } });
```

Remember: bridges default to a locked-down `CEO_AGENT_PROJECTS` allowlist
(empty by default — see `sdk/Permissions.js`). Set that env var to include
your project id, or the executors will correctly block every step.
