// HermesGatewayClient — HTTP client for the Hermes `api_server` gateway adapter.
//
// Implements the verified contract from ADR-001b (incl. both drift corrections)
// and ADR-009's §3 submission mapping, for the synchronous task-submission path
// that HermesBridge.runTask() requires:
//
//   - POST /v1/runs  -> 202 { run_id: "run_…", status: "started" }
//   - Bearer-token auth (Authorization: Bearer <API_SERVER_KEY>)
//   - Default bind 127.0.0.1:8642, opt-in adapter
//   - 401 auth-failure code is `gateway_auth_failed` (NOT `invalid_api_key`)
//   - 429 + Retry-After above the concurrency cap (bounded retry/backoff)
//
// This client is deliberately narrow: it only implements the synchronous
// submission path. It NEVER echoes CEO Agent's own secrets into any outbound
// request (ADR-009 §2) — asserted by test in HermesBridgeGateway.test.js.

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;

class HermesGatewayError extends Error {
  /**
   * @param {string} code One of 'auth'|'rate_limited'|'unreachable'|'timeout'|'http'|'malformed'|'unconfigured'.
   * @param {string} message Human-readable, actionable reason.
   * @param {object} [options] Extra error context.
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'HermesGatewayError';
    this.code = code;
    this.cause = options.cause || null;
  }
}

class HermesGatewayClient {
  /**
   * @param {string|null} gatewayUrl Base URL of the `api_server` adapter (e.g. http://127.0.0.1:8642).
   * @param {string|null} apiKey The gateway's `API_SERVER_KEY` value.
   * @param {object} [options] Overrides for timeout/retry tuning (tests only; installs use env vars).
   */
  constructor(gatewayUrl, apiKey, options = {}) {
    this.gatewayUrl = gatewayUrl ? String(gatewayUrl).replace(/\/+$/, '') : null;
    this.apiKey = apiKey || null;
    this.timeoutMs = options.timeoutMs || Number(process.env.HERMES_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    this.maxAttempts = options.maxAttempts || Number(process.env.HERMES_MAX_RETRY_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  }

  /** A gateway is usable only when both the URL and a valid (>=16 char) key are configured. */
  isConfigured() {
    return Boolean(this.gatewayUrl && this.apiKey && this.apiKey.length >= 16);
  }

  /** True when configured but the key is too weak to ever be accepted upstream (ADR-001b drift 1). */
  keyTooShort() {
    return Boolean(this.gatewayUrl && this.apiKey && this.apiKey.length < 16);
  }

  /** Builds the POST /v1/runs request body from a validated Hermes task. */
  buildBody(task) {
    const input = [task.goal, task.task].filter(Boolean).join(' — ');
    const body = { input };
    if (task.payload && typeof task.payload === 'object') {
      Object.assign(body, task.payload);
    }
    return body;
  }

  /**
   * Submits a task to the gateway's POST /v1/runs endpoint.
   * @param {object} task A validated Hermes task.
   * @returns {Promise<{status:'triggered', runId:string, gatewayStatus:string}>}
   * @throws {HermesGatewayError} Classified failure.
   */
  async submit(task) {
    if (this.keyTooShort()) {
      throw new HermesGatewayError(
        'auth',
        "HERMES_GATEWAY_API_KEY is configured but shorter than the gateway's required 16 characters; the api_server adapter will not start (ADR-001b drift 1).",
      );
    }
    if (!this.isConfigured()) {
      throw new HermesGatewayError(
        'unconfigured',
        'Hermes gateway is not configured (HERMES_GATEWAY_URL / HERMES_GATEWAY_API_KEY missing).',
      );
    }

    const url = `${this.gatewayUrl}/v1/runs`;
    const body = this.buildBody(task);

    // Bounded retry for 429 (honoring Retry-After); every other outcome
    // returns or throws immediately. Never retries indefinitely (ADR-009 §3).
    let attempts = 0;
    while (attempts < this.maxAttempts) {
      attempts += 1;
      const outcome = await this._singleAttempt(url, body);
      if (outcome.status !== 'retry') return outcome.result;
      const delayMs = outcome.retryAfterMs != null ? outcome.retryAfterMs : DEFAULT_RETRY_BASE_MS * attempts;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new HermesGatewayError(
      'rate_limited',
      `Hermes gateway returned 429 and retries were exhausted after ${this.maxAttempts} attempt(s).`,
    );
  }

  async _singleAttempt(url, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        if (cause && cause.name === 'AbortError') {
          throw new HermesGatewayError(
            'timeout',
            `Timed out reaching Hermes gateway at ${this.gatewayUrl} after ${this.timeoutMs}ms.`,
            { cause },
          );
        }
        throw new HermesGatewayError(
          'unreachable',
          `Could not reach Hermes gateway at ${this.gatewayUrl}: ${cause && cause.message ? cause.message : String(cause)}`,
          { cause },
        );
      }

      if (response.status === 202) {
        const data = await response.json().catch(() => ({}));
        if (data && typeof data.run_id === 'string' && data.run_id.length) {
          return {
            status: 'success',
            result: { status: 'triggered', runId: data.run_id, gatewayStatus: data.status || 'started' },
          };
        }
        throw new HermesGatewayError('malformed', `Gateway returned 202 without a run_id: ${JSON.stringify(data)}`);
      }

      if (response.status === 401 || response.status === 403) {
        const code = await this._extractErrorCode(response);
        if (code === 'gateway_auth_failed') {
          throw new HermesGatewayError(
            'auth',
            'Hermes gateway rejected the API_SERVER_KEY (gateway_auth_failed). Check HERMES_GATEWAY_API_KEY.',
          );
        }
        throw new HermesGatewayError(
          'auth',
          `Hermes gateway auth failed (HTTP ${response.status}). Confirm the api_server adapter is enabled and HERMES_GATEWAY_API_KEY is set to the API_SERVER_KEY.`,
        );
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
        return { status: 'retry', retryAfterMs };
      }

      const bodyText = await response.text().catch(() => '');
      throw new HermesGatewayError('http', `Hermes gateway returned HTTP ${response.status} on POST /v1/runs: ${bodyText.slice(0, 500)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async _extractErrorCode(response) {
    try {
      const data = await response.json();
      return data && data.error && data.error.code;
    } catch {
      return null;
    }
  }
}

module.exports = { HermesGatewayClient, HermesGatewayError };
