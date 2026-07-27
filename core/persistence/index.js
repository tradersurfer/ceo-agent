const { SupabaseWorkflowStore, WORKFLOW_RUNS_TABLE } = require('./SupabaseWorkflowStore');
const { SupabaseAuditLog, WORKFLOW_AUDIT_TABLE, SKILL_AUDIT_TABLE } = require('./SupabaseAuditLog');

// Entry keys SkillExecutor's audit entries carry beyond the universal
// event/tenantId/agentId/timestamp set (see core/SkillExecutor.js#_finish).
const SKILL_AUDIT_ENTRY_COLUMNS = ['skillName', 'status', 'reason'];

/**
 * Returns Supabase-backed workflow + skill-execution persistence
 * (`{ store, audit, skillAudit }`) when Supabase credentials are configured,
 * or `null` otherwise so the caller falls back to WorkflowRuntime's and
 * SkillExecutor's own in-memory defaults. This mirrors the optional/lazy
 * posture of `sdk/MemoryClient.js`: no Supabase client (and no
 * `@supabase/supabase-js` require) is constructed unless credentials are present.
 *
 * `audit` and `skillAudit` are two logically-separate SupabaseAuditLog
 * instances (`workflow_audit` / `skill_audit` tables — see issue #52's
 * reasoning: nothing in this codebase invokes a skill from a workflow step
 * today, so there's no cross-table correlation to preserve, and each table
 * gets its own natural columns instead of one shared table with columns that
 * never apply to one side). Both share the same underlying Supabase client as
 * `store`, so configuring persistence never opens more than one connection.
 *
 * @param {object} [env] Environment source (defaults to process.env).
 * @returns {{store: object, audit: object, skillAudit: object}|null}
 */
function createWorkflowPersistence(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    store: new SupabaseWorkflowStore({ supabase }),
    audit: new SupabaseAuditLog({ supabase }),
    skillAudit: new SupabaseAuditLog({ supabase, table: SKILL_AUDIT_TABLE, entryColumns: SKILL_AUDIT_ENTRY_COLUMNS }),
  };
}

module.exports = {
  SupabaseWorkflowStore,
  SupabaseAuditLog,
  createWorkflowPersistence,
  WORKFLOW_RUNS_TABLE,
  WORKFLOW_AUDIT_TABLE,
  SKILL_AUDIT_TABLE,
  SKILL_AUDIT_ENTRY_COLUMNS,
};
