const WORKFLOW_AUDIT_TABLE = 'workflow_audit';
const SKILL_AUDIT_TABLE = 'skill_audit';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

// The entry keys promoted to first-class row columns beyond the universal
// event/tenantId/agentId/timestamp set, keyed by table so a single class can
// back both workflow_audit and skill_audit without either table growing
// columns that never apply to it (workflow_id/run_id/step_id on skill_audit,
// or skill_name/status/reason on workflow_audit). Defaults to the
// workflow_audit set so existing callers that don't pass `entryColumns` keep
// producing byte-identical rows to before this became configurable.
const DEFAULT_ENTRY_COLUMNS = Object.freeze(['workflowId', 'runId', 'stepId']);

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

/** camelCase -> snake_case, e.g. "skillName" -> "skill_name". */
function toSnakeCase(key) {
  return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Supabase-backed audit log. Conforms to the `append(entry)` interface used
 * by `WorkflowRuntime` and `SkillExecutor` (same shape as `InMemoryAuditLog`),
 * and adds a real `query()` for retrieval by tenant / agent / date range plus
 * whichever table-specific columns this instance was configured with.
 *
 * One class backs two logically-separate tables (`workflow_audit`,
 * `skill_audit` — see issue #52): skill invocations are never triggered from
 * a workflow step in this codebase today (nothing calls `SkillExecutor.run()`
 * from `WorkflowRuntime`'s executor map), so there is no cross-table
 * correlation to preserve, and each table gets its own natural columns
 * instead of a shared table with columns that never apply to one side.
 *
 * `@supabase/supabase-js` is loaded lazily in the constructor, matching
 * `sdk/MemoryClient.js`, so requiring this file never fails when the package is
 * absent.
 */
class SupabaseAuditLog {
  /**
   * @param {object} options Supabase client or connection settings.
   * @param {object} [options.supabase] Pre-built client (injected in tests, or
   *   shared across store/audit/skillAudit conformers — see core/persistence/index.js).
   * @param {string} [options.table] Target table. Defaults to `workflow_audit`.
   * @param {string[]} [options.entryColumns] Entry keys promoted to first-class
   *   row columns beyond event/tenantId/agentId/timestamp. Defaults to the
   *   workflow shape (`workflowId`, `runId`, `stepId`).
   */
  constructor(options = {}) {
    this.table = options.table || WORKFLOW_AUDIT_TABLE;
    this.entryColumns = options.entryColumns || DEFAULT_ENTRY_COLUMNS;
    this.supabase = options.supabase || options.client || null;

    if (!this.supabase) {
      const url = options.url || process.env.SUPABASE_URL || null;
      const serviceRoleKey = options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
      if (!url || !serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for SupabaseAuditLog.');
      }
      const { createClient } = require('@supabase/supabase-js');
      this.supabase = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  _throwIfError(error) {
    if (error) throw error instanceof Error ? error : new Error(error.message || String(error));
  }

  _toRow(entry) {
    const rest = { ...entry };
    const row = {
      event: rest.event,
      tenant_id: rest.tenantId ?? null,
      agent_id: rest.agentId ?? null,
      event_time: rest.timestamp || new Date().toISOString(),
    };
    delete rest.event;
    delete rest.tenantId;
    delete rest.agentId;
    delete rest.timestamp;

    for (const column of this.entryColumns) {
      row[toSnakeCase(column)] = rest[column] ?? null;
      delete rest[column];
    }

    row.data = rest;
    return row;
  }

  /**
   * Appends an audit entry. Returns the stored entry.
   * @param {object} entry Audit entry (shape depends on the caller — WorkflowRuntime or SkillExecutor).
   * @returns {Promise<object>} Stored entry.
   */
  async append(entry) {
    const row = this._toRow({ ...entry, timestamp: entry.timestamp || new Date().toISOString() });
    const { data, error } = await this.supabase
      .from(this.table)
      .insert(row)
      .select()
      .single();
    this._throwIfError(error);
    return data || row;
  }

  /**
   * Queries audit entries by tenant, agent, table-specific columns, and/or
   * date range. Filters for columns this instance wasn't configured with
   * (e.g. `runId` against a skill_audit instance) are simply never applied —
   * no error, just an absent `.eq()` clause — so callers don't need to know
   * which instance they're querying.
   * @param {object} [filters]
   * @param {string} [filters.tenantId]
   * @param {string} [filters.agentId]
   * @param {string} [filters.runId] workflow_audit only.
   * @param {string} [filters.workflowId] workflow_audit only.
   * @param {string} [filters.skillName] skill_audit only.
   * @param {string} [filters.status] skill_audit only.
   * @param {string} [filters.since] ISO timestamp (inclusive lower bound).
   * @param {string} [filters.until] ISO timestamp (inclusive upper bound).
   * @param {number} [filters.limit]
   * @returns {Promise<object[]>} Matching audit rows, oldest first.
   */
  async query({ tenantId, runId, workflowId, agentId, skillName, status, since, until, limit = DEFAULT_LIMIT } = {}) {
    let q = this.supabase
      .from(this.table)
      .select('*')
      .order('event_time', { ascending: true })
      .limit(normalizeLimit(limit));

    if (tenantId !== undefined) q = q.eq('tenant_id', tenantId);
    if (runId !== undefined) q = q.eq('run_id', runId);
    if (workflowId !== undefined) q = q.eq('workflow_id', workflowId);
    if (agentId !== undefined) q = q.eq('agent_id', agentId);
    if (skillName !== undefined) q = q.eq('skill_name', skillName);
    if (status !== undefined) q = q.eq('status', status);
    if (since !== undefined) q = q.gte('event_time', since);
    if (until !== undefined) q = q.lte('event_time', until);

    const { data, error } = await q;
    this._throwIfError(error);
    return data || [];
  }
}

module.exports = { SupabaseAuditLog, WORKFLOW_AUDIT_TABLE, SKILL_AUDIT_TABLE };
