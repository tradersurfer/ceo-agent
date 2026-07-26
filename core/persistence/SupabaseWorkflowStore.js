const WORKFLOW_RUNS_TABLE = 'workflow_runs';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Supabase-backed workflow run store. Conforms to the same interface as
 * `InMemoryWorkflowStore` in `core/WorkflowRuntime.js` (`save(record)` /
 * `get(id)`), so it is a drop-in replacement wired in through
 * `workflowRuntimeOptions.store`.
 *
 * The `@supabase/supabase-js` dependency is loaded lazily in the constructor
 * (never at module top-level), matching `sdk/MemoryClient.js`, so requiring
 * this file never fails just because the package is absent — it is only needed
 * when a store is actually constructed against real Supabase credentials.
 */
class SupabaseWorkflowStore {
  /**
   * @param {object} options Supabase client or connection settings.
   * @param {object} [options.supabase] Pre-built client (injected in tests).
   * @param {string} [options.url] SUPABASE_URL.
   * @param {string} [options.serviceRoleKey] SUPABASE_SERVICE_ROLE_KEY.
   */
  constructor(options = {}) {
    this.table = options.table || WORKFLOW_RUNS_TABLE;
    this.supabase = options.supabase || options.client || null;

    if (!this.supabase) {
      const url = options.url || process.env.SUPABASE_URL || null;
      const serviceRoleKey = options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
      if (!url || !serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for SupabaseWorkflowStore.');
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

  _toRow(record) {
    const context = record.context || {};
    return {
      id: record.id,
      workflow_id: record.workflowId,
      status: record.status,
      tenant_id: context.tenantId || context.tenant_id || null,
      record,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }

  /**
   * Upserts a workflow run record by id and returns the stored record.
   * @param {object} record WorkflowRuntime run record.
   * @returns {Promise<object>} The stored record.
   */
  async save(record) {
    const { data, error } = await this.supabase
      .from(this.table)
      .upsert(this._toRow(record), { onConflict: 'id' })
      .select('record')
      .single();
    this._throwIfError(error);
    return data ? clone(data.record) : clone(record);
  }

  /**
   * Fetches a workflow run record by id, or null if not found.
   * @param {string} id Run id.
   * @returns {Promise<object|null>} The record or null.
   */
  async get(id) {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('record')
      .eq('id', id)
      .maybeSingle();
    this._throwIfError(error);
    return data ? clone(data.record) : null;
  }
}

module.exports = { SupabaseWorkflowStore, WORKFLOW_RUNS_TABLE };
