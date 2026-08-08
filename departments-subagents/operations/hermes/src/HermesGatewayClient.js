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
// It also implements ADR-009 §3's post-submission async lifecycle (issue
// #95): GET /v1/runs/{run_id} polling, layered run-level and approval-wait
// timeouts (calling POST /v1/runs/{run_id}/stop on expiry), and mapping
// waiting_for_approval to a real, never-auto-resolved wait state. No SSE
// consumption is implemented: this environment has no reachable Hermes
// gateway to verify a real SSE stream against (checked, not assumed —
// HERMES_GATEWAY_URL is unset here), so awaitResolution() polls only, per
// ADR-009 §3's "poll and/or SSE" wording. It NEVER echoes CEO Agent's own
// secrets into any outbound request (ADR-009 §2) — asserted by test in
// HermesBridgeGateway.test.js.

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_RUN_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_APPROVAL_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_CONSECUTIVE_POLL_FAILURES = 3;

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);

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
    // ADR-009 §3 post-submission lifecycle (issue #95). Injectable for
    // tests; installs configure via env vars.
    this.runTimeoutMs = options.runTimeoutMs || Number(process.env.HERMES_RUN_TIMEOUT_MS || DEFAULT_RUN_TIMEOUT_MS);
    this.approvalTimeoutMs = options.approvalTimeoutMs || Number(process.env.HERMES_APPROVAL_TIMEOUT_MS || DEFAULT_APPROVAL_TIMEOUT_MS);
    this.pollIntervalMs = options.pollIntervalMs || Number(process.env.HERMES_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS);
    this.maxConsecutivePollFailures = options.maxConsecutivePollFailures
      || Number(process.env.HERMES_MAX_CONSECUTIVE_POLL_FAILURES || DEFAULT_MAX_CONSECUTIVE_POLL_FAILURES);
    // Injectable clock/sleep so tests can drive the lifecycle loop
    // deterministically, same pattern WorkflowRuntime already uses for its
    // own injectable clock.
    this.clock = options.clock || (() => new Date());
    this.sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
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

  /**
   * Polls GET /v1/runs/{run_id}. Same auth/timeout handling as submit()'s
   * single attempt, no retry-on-429 loop here — the caller (awaitResolution)
   * owns the polling cadence and overall timeout budget.
   * @param {string} runId Run id returned by submit().
   * @returns {Promise<object>} The gateway's run status document.
   * @throws {HermesGatewayError} Classified failure.
   */
  async pollRun(runId) {
    if (!this.isConfigured()) {
      throw new HermesGatewayError('unconfigured', 'Hermes gateway is not configured.');
    }
    const url = `${this.gatewayUrl}/v1/runs/${encodeURIComponent(runId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: controller.signal,
        });
      } catch (cause) {
        if (cause && cause.name === 'AbortError') {
          throw new HermesGatewayError('timeout', `Timed out polling Hermes run ${runId} after ${this.timeoutMs}ms.`, { cause });
        }
        throw new HermesGatewayError('unreachable', `Could not reach Hermes gateway polling run ${runId}: ${cause && cause.message ? cause.message : String(cause)}`, { cause });
      }
      if (response.status === 401 || response.status === 403) {
        throw new HermesGatewayError('auth', `Hermes gateway rejected polling run ${runId} (HTTP ${response.status}).`);
      }
      if (response.status === 404) {
        throw new HermesGatewayError('http', `Hermes gateway has no record of run ${runId} (HTTP 404).`);
      }
      if (!response.ok && response.status !== 200) {
        const bodyText = await response.text().catch(() => '');
        throw new HermesGatewayError('http', `Hermes gateway returned HTTP ${response.status} polling run ${runId}: ${bodyText.slice(0, 500)}`);
      }
      const data = await response.json().catch(() => null);
      if (!data || typeof data.status !== 'string') {
        throw new HermesGatewayError('malformed', `Gateway returned a malformed run document for ${runId}: ${JSON.stringify(data)}`);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * POSTs /v1/runs/{run_id}/stop. Best-effort: a failure here is logged by
   * the caller but never overrides the real timeout/failure reason that
   * triggered the stop attempt in the first place.
   * @param {string} runId Run id to interrupt.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async stop(runId) {
    if (!this.isConfigured()) return { ok: false, error: 'Hermes gateway is not configured.' };
    const url = `${this.gatewayUrl}/v1/runs/${encodeURIComponent(runId)}/stop`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      if (response.status >= 200 && response.status < 300) return { ok: true };
      const bodyText = await response.text().catch(() => '');
      return { ok: false, error: `HTTP ${response.status}: ${bodyText.slice(0, 300)}` };
    } catch (cause) {
      return { ok: false, error: cause && cause.message ? cause.message : String(cause) };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * ADR-009 §3's post-submission async lifecycle (issue #95). Polls a
   * triggered run to a real terminal outcome, honoring two independent,
   * layered timeout budgets and NEVER auto-resolving waiting_for_approval
   * — that is a hard non-goal (ADR-008), not a detail: this method only
   * ever reads run status and, on timeout, calls stop(); it never calls
   * POST /v1/runs/{run_id}/approval.
   *
   * @param {string} runId Run id returned by submit().
   * @param {object} [options]
   * @param {(event: object) => void} [options.onEvent] Optional audit hook,
   *   called with a structured event on every state transition/timeout.
   * @returns {Promise<{status: 'completed'|'failed'|'cancelled', reason?: string, timedOut?: 'run'|'approval', lastPoll?: object}>}
   */
  async awaitResolution(runId, options = {}) {
    const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    const runTimeoutMs = options.runTimeoutMs || this.runTimeoutMs;
    const approvalTimeoutMs = options.approvalTimeoutMs || this.approvalTimeoutMs;
    const pollIntervalMs = options.pollIntervalMs || this.pollIntervalMs;

    const startedAt = this.clock();
    let approvalStartedAt = null;
    let consecutiveFailures = 0;
    let lastPoll = null;

    for (;;) {
      const now = this.clock();
      if (approvalStartedAt) {
        if (now.getTime() - approvalStartedAt.getTime() >= approvalTimeoutMs) {
          const stopResult = await this.stop(runId);
          onEvent({ event: 'run_approval_timeout', runId, stopResult, lastPoll });
          return { status: 'failed', reason: `Approval wait timed out after ${approvalTimeoutMs}ms; run stopped.`, timedOut: 'approval', lastPoll };
        }
      } else if (now.getTime() - startedAt.getTime() >= runTimeoutMs) {
        const stopResult = await this.stop(runId);
        onEvent({ event: 'run_timeout', runId, stopResult, lastPoll });
        return { status: 'failed', reason: `Run timed out after ${runTimeoutMs}ms; run stopped.`, timedOut: 'run', lastPoll };
      }

      let poll;
      try {
        poll = await this.pollRun(runId);
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures += 1;
        onEvent({ event: 'run_poll_failed', runId, error: err instanceof Error ? err.message : String(err), consecutiveFailures });
        if (consecutiveFailures >= this.maxConsecutivePollFailures) {
          // Never infer completed from silence (ADR-009 §3): an unreachable
          // poll target after repeated tries is surfaced as a real, honest
          // failure, not assumed success.
          return { status: 'failed', reason: `Could not poll Hermes run ${runId} after ${consecutiveFailures} consecutive attempts: ${err instanceof Error ? err.message : String(err)}`, lastPoll };
        }
        await this.sleep(pollIntervalMs);
        continue;
      }

      lastPoll = poll;
      if (TERMINAL_RUN_STATUSES.has(poll.status)) {
        onEvent({ event: `run_${poll.status}`, runId, lastPoll });
        if (poll.status === 'completed') return { status: 'completed', lastPoll };
        if (poll.status === 'cancelled') return { status: 'cancelled', reason: poll.reason || 'Run was cancelled.', lastPoll };
        return { status: 'failed', reason: poll.reason || poll.error || 'Hermes reported the run failed.', lastPoll };
      }

      if (poll.status === 'waiting_for_approval') {
        if (!approvalStartedAt) {
          approvalStartedAt = now;
          onEvent({ event: 'run_waiting_for_approval', runId, lastPoll });
        }
      } else {
        // Any non-terminal, non-approval status (running, queued, or an
        // unrecognized future value) clears a prior approval-wait window —
        // the gateway itself decided to keep going, not this client.
        approvalStartedAt = null;
      }

      await this.sleep(pollIntervalMs);
    }
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
