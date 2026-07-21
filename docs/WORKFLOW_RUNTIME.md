# Workflow Runtime

`core/WorkflowRuntime.js` is the execution engine for Workflow Packs (see
`ARCHITECTURE.md` section 6). It is intentionally generic — it has no
knowledge of any specific business, tenant, or agent bridge.

## What it does

- Executes an ordered list of steps defined in a workflow pack.
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

## What it does NOT do yet

- **No executors are registered for the real agent bridges.** Wiring
  `SalesIntakeBridge`, `OnboardingCommsBridge`, and `DisputeAgentBridge` as
  registered executors (so a workflow pack step can actually call `trigger()`
  on a bridge) is a separate, not-yet-started task.
- **No scheduler.** `resume()` must be called by something external once a
  delayed step's scheduled time has passed — there's no built-in cron or
  polling loop in this scaffold. A production install needs to wire this
  (e.g. a scheduled job that queries waiting runs and calls `resume()`).
- **No persistent store wired by default.** `InMemoryWorkflowStore` and
  `InMemoryAuditLog` are the defaults and lose all state on process
  restart. Swap in real implementations (e.g. Supabase-backed, matching
  the pattern in `sdk/MemoryClient.js`) before relying on this for
  anything that needs to survive a restart.

## Usage

Register an executor for each step type your workflow needs, then call execute() with a workflow definition and input. Example shape (Node.js, CommonJS):

require the WorkflowRuntime class from core/WorkflowRuntime.
Create a new runtime instance.
Call runtime.registerExecutor('send_email', async ({ step, input }) => { /* call a real bridge here */ return { status: 'ok' }; }).
Define a workflow object with an id and a steps array, e.g. two steps: one 'welcome' step of type send_email, and one 'follow_up' step of type send_email that depends_on 'welcome' and has delay_days set to 2.
Call await runtime.execute({ workflow, input: { leadId: '123' } }) to start the run.
