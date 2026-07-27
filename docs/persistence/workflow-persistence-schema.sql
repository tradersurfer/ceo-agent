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

-- Skill-execution audit log (Priority 5e follow-up, issue #52). Logically
-- separate from workflow_audit rather than a shared table: nothing in this
-- codebase invokes a skill from a workflow step, so there is no
-- workflow_id/run_id/step_id to correlate, and this table gets its own
-- natural columns instead of three columns that would always be null.
-- Append-only; queryable by tenant / agent / skill / status / date range
-- (see core/persistence/SupabaseAuditLog.js `query`).
create table if not exists skill_audit (
  id          bigint generated always as identity primary key,
  event       text not null,
  skill_name  text,
  status      text,
  reason      text,
  tenant_id   text,
  agent_id    text,
  event_time  timestamptz not null default now(),
  data        jsonb not null default '{}'::jsonb
);

create index if not exists skill_audit_skill_name_idx on skill_audit (skill_name);
create index if not exists skill_audit_tenant_id_idx  on skill_audit (tenant_id);
create index if not exists skill_audit_agent_id_idx   on skill_audit (agent_id);
create index if not exists skill_audit_event_time_idx on skill_audit (event_time);

-- Model-usage audit log (issue #51). Chat completions bypass both
-- workflow_audit and skill_audit entirely (bin/chat.js and
-- app/api/chat/route.ts call OpenRouterClient#chatCompletion directly, not
-- through WorkflowRuntime or SkillExecutor), so this is its own table for
-- the same reason skill_audit is separate from workflow_audit: no
-- cross-table correlation to preserve, own natural columns instead.
-- Token counts, the pricing snapshot used to estimate cost, and the
-- estimated cost itself live in `data` (jsonb) rather than as first-class
-- columns — they're aggregated on read (see core/UsageTracker.js
-- `summarizeUsage`), not filtered on individually. `estimated_cost_usd` is
-- an estimate against OpenRouter's documented (not independently verified
-- from this environment) per-token pricing contract — see
-- core/ModelResolver.js `extractPricing`.
-- Append-only; queryable by tenant / agent / model / date range (see
-- core/persistence/SupabaseAuditLog.js `query`).
create table if not exists model_usage (
  id          bigint generated always as identity primary key,
  event       text not null,
  model       text,
  role        text,
  cost_tier   text,
  tenant_id   text,
  agent_id    text,
  event_time  timestamptz not null default now(),
  data        jsonb not null default '{}'::jsonb
);

create index if not exists model_usage_model_idx      on model_usage (model);
create index if not exists model_usage_tenant_id_idx  on model_usage (tenant_id);
create index if not exists model_usage_agent_id_idx   on model_usage (agent_id);
create index if not exists model_usage_event_time_idx on model_usage (event_time);
