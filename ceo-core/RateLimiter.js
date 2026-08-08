const RATE_LIMIT_TABLE = 'rate_limit_hits';
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 30;

/**
 * In-memory sliding-window rate limiter. Default for single-instance
 * deployments — state is per-process and does not survive a restart or
 * share across instances.
 */
class InMemoryRateLimiter {
  constructor({ windowMs = DEFAULT_WINDOW_MS, maxRequests = DEFAULT_MAX_REQUESTS } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.hits = new Map(); // key -> array of hit timestamps (ms)
  }

  /**
   * Checks and records a rate-limit hit for a given key (e.g. caller IP).
   * @param {string} key Identifying key for the caller.
   * @returns {Promise<{allowed: boolean, remaining: number}>}
   */
  async check(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(key) || []).filter(t => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      this.hits.set(key, timestamps);
      return { allowed: false, remaining: 0 };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return { allowed: true, remaining: this.maxRequests - timestamps.length };
  }
}

/**
 * Supabase-backed sliding-window rate limiter — shared state across
 * instances, for multi-instance/production deployments behind a load
 * balancer. Conforms to the same `check(key)` interface as
 * `InMemoryRateLimiter`, so it's a drop-in replacement.
 *
 * Honesty note: this is a count-then-insert window, the same class of
 * "soft" sliding-window limiter most systems use without a database
 * transaction or Lua-script-style atomic primitive. Under genuinely
 * concurrent multi-instance bursts at the exact edge of the limit, two
 * requests can both read a count just under the max and both proceed —
 * a narrow, bounded overshoot, not a hard per-window guarantee. That is
 * still a real improvement over the in-memory limiter, which has zero
 * cross-instance visibility at all; it does not claim atomicity it
 * doesn't enforce, matching this project's posture elsewhere (see
 * ADR-001) of never overstating a boundary the code doesn't actually
 * provide.
 *
 * `@supabase/supabase-js` is loaded lazily in the constructor, matching
 * `sdk/MemoryClient.js` and the workflow persistence conformers, so
 * requiring this file never fails just because the package is absent.
 */
class SupabaseRateLimiter {
  /**
   * @param {object} options
   * @param {object} [options.supabase] Pre-built client (injected in tests).
   * @param {string} [options.url] SUPABASE_URL.
   * @param {string} [options.serviceRoleKey] SUPABASE_SERVICE_ROLE_KEY.
   * @param {number} [options.windowMs] Sliding window size in ms.
   * @param {number} [options.maxRequests] Max requests allowed per window.
   */
  constructor(options = {}) {
    this.table = options.table || RATE_LIMIT_TABLE;
    this.windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    this.maxRequests = options.maxRequests || DEFAULT_MAX_REQUESTS;
    this.supabase = options.supabase || options.client || null;

    if (!this.supabase) {
      const url = options.url || process.env.SUPABASE_URL || null;
      const serviceRoleKey = options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
      if (!url || !serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for SupabaseRateLimiter.');
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

  /**
   * Checks and records a rate-limit hit for a given key.
   * @param {string} key Identifying key for the caller.
   * @returns {Promise<{allowed: boolean, remaining: number}>}
   */
  async check(key) {
    const now = Date.now();
    const windowStart = new Date(now - this.windowMs).toISOString();

    const { data, error } = await this.supabase
      .from(this.table)
      .select('id')
      .eq('rate_key', key)
      .gte('hit_at', windowStart);
    this._throwIfError(error);
    const count = (data || []).length;

    if (count >= this.maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    const { error: insertError } = await this.supabase
      .from(this.table)
      .insert({ rate_key: key, hit_at: new Date(now).toISOString() });
    this._throwIfError(insertError);

    return { allowed: true, remaining: this.maxRequests - count - 1 };
  }
}

/**
 * Returns a Supabase-backed rate limiter when configured, or `null`
 * otherwise so the caller falls back to `InMemoryRateLimiter`. Mirrors
 * `createWorkflowPersistence`'s optional/lazy posture.
 * @param {object} [env] Environment source (defaults to process.env).
 * @param {object} [options] Extra options (windowMs, maxRequests) forwarded to the limiter.
 * @returns {SupabaseRateLimiter|null}
 */
function createRateLimiter(env = process.env, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return new SupabaseRateLimiter({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, ...options });
}

module.exports = {
  InMemoryRateLimiter,
  SupabaseRateLimiter,
  createRateLimiter,
  RATE_LIMIT_TABLE,
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX_REQUESTS,
};
