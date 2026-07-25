const WORKFLOW_AUDIT_TABLE = 'workflow_audit';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

/**
 * Supabase-backed workflow audit log. Conforms to the `append(entry)` interface
 * used by `WorkflowRuntime` (same shape as `InMemoryAuditLog`), and adds a real
 * `query()` for retrieval by tenant / run / workflow / agent / date range.
 *
 * `@supabase/supabase-js` is loaded lazily in the constructor, matching
 * `sdk/MemoryClient.js`, so requiring this file never fails when the package is
 * absent.
 */
class SupabaseAuditLog {
  /**
   * @param {object} options Supabase client or connection settings.
   * @param {object} [options.supabase] Pre-built client (injected in tests).
   */
  constructor(options = {}) {
    this.table = options.table || WORKFLOW_AUDIT_TABLE;
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
    const { event, workflowId, runId, stepId, tenantId, agentId, timestamp, ...rest } = entry;
    return {
      event,
      workflow_id: workflowId || null,
      run_id: runId || null,
      step_id: stepId || null,
      tenant_id: tenantId || null,
      agent_id: agentId || null,
      event_time: timestamp || new Date().toISOString(),
      data: rest,
    };
  }

  /**
   * Appends an audit entry. Returns the stored entry.
   * @param {object} entry WorkflowRuntime audit entry.
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
   * Queries audit entries by tenant, run, workflow, agent, and/or date range.
   * @param {object} [filters]
   * @param {string} [filters.tenantId]
   * @param {string} [filters.runId]
   * @param {string} [filters.workflowId]
   * @param {string} [filters.agentId]
   * @param {string} [filters.since] ISO timestamp (inclusive lower bound).
   * @param {string} [filters.until] ISO timestamp (inclusive upper bound).
   * @param {number} [filters.limit]
   * @returns {Promise<object[]>} Matching audit rows, oldest first.
   */
  async query({ tenantId, runId, workflowId, agentId, since, until, limit = DEFAULT_LIMIT } = {}) {
    let q = this.supabase
      .from(this.table)
      .select('*')
      .order('event_time', { ascending: true })
      .limit(normalizeLimit(limit));

    if (tenantId !== undefined) q = q.eq('tenant_id', tenantId);
    if (runId !== undefined) q = q.eq('run_id', runId);
    if (workflowId !== undefined) q = q.eq('workflow_id', workflowId);
    if (agentId !== undefined) q = q.eq('agent_id', agentId);
    if (since !== undefined) q = q.gte('event_time', since);
    if (until !== undefined) q = q.lte('event_time', until);

    const { data, error } = await q;
    this._throwIfError(error);
    return data || [];
  }
}

module.exports = { SupabaseAuditLog, WORKFLOW_AUDIT_TABLE };
