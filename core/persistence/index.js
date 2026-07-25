const { SupabaseWorkflowStore, WORKFLOW_RUNS_TABLE } = require('./SupabaseWorkflowStore');
const { SupabaseAuditLog, WORKFLOW_AUDIT_TABLE } = require('./SupabaseAuditLog');

/**
 * Returns Supabase-backed workflow persistence (`{ store, audit }`) when
 * Supabase credentials are configured, or `null` otherwise so the caller falls
 * back to WorkflowRuntime's in-memory defaults. This mirrors the optional/lazy
 * posture of `sdk/MemoryClient.js`: no Supabase client (and no
 * `@supabase/supabase-js` require) is constructed unless credentials are present.
 *
 * @param {object} [env] Environment source (defaults to process.env).
 * @returns {{store: object, audit: object}|null}
 */
function createWorkflowPersistence(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return {
    store: new SupabaseWorkflowStore({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
    audit: new SupabaseAuditLog({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
  };
}

module.exports = {
  SupabaseWorkflowStore,
  SupabaseAuditLog,
  createWorkflowPersistence,
  WORKFLOW_RUNS_TABLE,
  WORKFLOW_AUDIT_TABLE,
};
