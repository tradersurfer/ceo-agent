const { createClient } = require('@supabase/supabase-js');

const DEFAULT_LIMIT = 20;
const MEMORY_TABLE = 'memory_entries';
const SESSION_TABLE = 'memory_sessions';

function cleanRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), 100);
}

class MemoryClient {
  /**
   * Creates a Supabase-backed shared memory client.
   * @param {object} options Supabase client or connection settings.
   */
  constructor(options = {}) {
    this.supabase = options.supabase || options.client || null;
    this.url = options.url || process.env.SUPABASE_URL || null;
    this.serviceRoleKey = options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || null;

    if (!this.supabase) {
      if (!this.url || !this.serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for MemoryClient.');
      }
      this.supabase = createClient(this.url, this.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  _throwIfError(error) {
    if (error) {
      throw error instanceof Error ? error : new Error(error.message || String(error));
    }
  }

  /**
   * Starts a memory session.
   * @param {object} input Session fields.
   * @returns {Promise<object>} Created memory_sessions row.
   */
  async startSession({ tenantId = null, agentSource, topic }) {
    if (!agentSource) throw new Error('agentSource is required.');
    const record = cleanRecord({
      tenant_id: tenantId,
      agent_source: agentSource,
      topic,
      status: 'active',
    });
    const { data, error } = await this.supabase
      .from(SESSION_TABLE)
      .insert(record)
      .select()
      .single();
    this._throwIfError(error);
    return data;
  }

  /**
   * Writes a memory entry.
   * @param {object} input Entry fields.
   * @returns {Promise<object>} Created memory_entries row.
   */
  async writeEntry({
    tenantId = null,
    sessionId = null,
    agentSource,
    entryType,
    title,
    content,
    relatedEntryIds = [],
    metadata = {},
    expiresAt = null,
  }) {
    if (!agentSource) throw new Error('agentSource is required.');
    if (!entryType) throw new Error('entryType is required.');
    const record = cleanRecord({
      tenant_id: tenantId,
      session_id: sessionId,
      agent_source: agentSource,
      entry_type: entryType,
      title,
      content,
      related_entry_ids: relatedEntryIds,
      metadata,
      expires_at: expiresAt,
    });
    const { data, error } = await this.supabase
      .from(MEMORY_TABLE)
      .insert(record)
      .select()
      .single();
    this._throwIfError(error);
    return data;
  }

  /**
   * Gets recent memory entries with optional filters.
   * @param {object} filters Query filters.
   * @returns {Promise<object[]>} Matching memory_entries rows.
   */
  async getRecentEntries({ tenantId, sessionId, agentSource, entryType, limit = DEFAULT_LIMIT } = {}) {
    let query = this.supabase
      .from(MEMORY_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(normalizeLimit(limit));

    if (tenantId !== undefined) query = query.eq('tenant_id', tenantId);
    if (sessionId !== undefined) query = query.eq('session_id', sessionId);
    if (agentSource !== undefined) query = query.eq('agent_source', agentSource);
    if (entryType !== undefined) query = query.eq('entry_type', entryType);

    const { data, error } = await query;
    this._throwIfError(error);
    return data || [];
  }

  /**
   * Loads a memory session and its entries in chronological order.
   * @param {string} sessionId Memory session id.
   * @returns {Promise<object>} Session row with entries array.
   */
  async getSessionWithEntries(sessionId) {
    if (!sessionId) throw new Error('sessionId is required.');
    const sessionResult = await this.supabase
      .from(SESSION_TABLE)
      .select('*')
      .eq('id', sessionId)
      .single();
    this._throwIfError(sessionResult.error);

    const entriesResult = await this.supabase
      .from(MEMORY_TABLE)
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    this._throwIfError(entriesResult.error);

    return { ...sessionResult.data, entries: entriesResult.data || [] };
  }

  /**
   * Writes a handoff memory entry.
   * @param {object} input Handoff fields.
   * @returns {Promise<object>} Created handoff row.
   */
  async handoff({ fromAgent, toAgent, sessionId, title, content, relatedEntryIds = [], tenantId = null }) {
    if (!fromAgent) throw new Error('fromAgent is required.');
    if (!toAgent) throw new Error('toAgent is required.');
    return this.writeEntry({
      tenantId,
      sessionId,
      agentSource: fromAgent,
      entryType: 'handoff',
      title,
      content,
      relatedEntryIds,
      metadata: { fromAgent, toAgent },
    });
  }

  /**
   * Performs simple text search over title and content.
   * @param {string} queryText Search text.
   * @param {object} options Search filters.
   * @returns {Promise<object[]>} Matching memory_entries rows.
   */
  async searchByText(queryText, { tenantId, limit = DEFAULT_LIMIT } = {}) {
    if (!queryText) return [];
    const escaped = String(queryText).replace(/[%_]/g, '\\$&');
    let query = this.supabase
      .from(MEMORY_TABLE)
      .select('*')
      .or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)
      .order('created_at', { ascending: false })
      .limit(normalizeLimit(limit));

    if (tenantId !== undefined) query = query.eq('tenant_id', tenantId);

    const { data, error } = await query;
    this._throwIfError(error);
    return data || [];
  }
}

module.exports = MemoryClient;
