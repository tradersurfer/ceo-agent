-- Priority 5a — persistent workflow store + audit log (Supabase / Postgres).
--
-- Apply this in your Supabase project when SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY are configured. When those env vars are absent,
-- CEO Agent falls back to WorkflowRuntime's in-memory store/audit and these
-- tables are not required. Consistent with the existing memory_entries /
-- memory_sessions tables referenced by sdk/MemoryClient.js, the schema is
-- operator-provisioned rather than auto-migrated by the app.

-- Workflow run records. One row per WorkflowRuntime run, keyed by run id.
-- The full run record is stored in `record` (jsonb) for fidelity; the top-level
-- columns exist for indexing/observability.
create table if not exists workflow_runs (
  id          text primary key,
  workflow_id text not null,
  status      text not null,
  tenant_id   text,
  record      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists workflow_runs_workflow_id_idx on workflow_runs (workflow_id);
create index if not exists workflow_runs_status_idx      on workflow_runs (status);
create index if not exists workflow_runs_tenant_id_idx   on workflow_runs (tenant_id);

-- Workflow audit log. Append-only; queryable by tenant / run / workflow / agent
-- / date range (see core/persistence/SupabaseAuditLog.js `query`).
create table if not exists workflow_audit (
  id          bigint generated always as identity primary key,
  event       text not null,
  workflow_id text,
  run_id      text,
  step_id     text,
  tenant_id   text,
  agent_id    text,
  event_time  timestamptz not null default now(),
  data        jsonb not null default '{}'::jsonb
);

create index if not exists workflow_audit_run_id_idx      on workflow_audit (run_id);
create index if not exists workflow_audit_workflow_id_idx on workflow_audit (workflow_id);
create index if not exists workflow_audit_tenant_id_idx   on workflow_audit (tenant_id);
create index if not exists workflow_audit_agent_id_idx    on workflow_audit (agent_id);
create index if not exists workflow_audit_event_time_idx  on workflow_audit (event_time);
