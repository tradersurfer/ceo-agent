/**
 * Provider API-key validation for the Connections tab (app/api/config's
 * POST) and the CLI setup wizard (bin/setup.js).
 *
 * Two layers, in this order, and the second is the one that actually
 * decides:
 *
 *  1. `validateKeyShape` — a pure, local, offline prefix/shape check. It
 *     cannot prove a key is real (anyone can type a string that matches
 *     the shape), but it rejects obvious garbage ("hello", a key pasted
 *     for the wrong provider) instantly and without a network round-trip.
 *  2. `verifyProviderKey` — a live, authenticated, side-effect-free GET
 *     against the provider's own API. THIS is the authoritative check:
 *     only the provider itself can say whether a key is real. A
 *     well-formed fake ("sk-or-v1-" + 130 hex chars) passes layer 1
 *     and still gets caught here.
 *
 * The verification endpoints and their auth-header shapes are each
 * provider client's own — deliberately not duplicated by hand here,
 * which is how the two lists drift. Every entry below was confirmed
 * against the live API with a bogus key (all five discriminate an
 * invalid key from a valid-shaped one):
 *
 *   - openrouter: GET /api/v1/key, `Authorization: Bearer`. Free,
 *     returns the key's own metadata (never used — only the status
 *     matters). 401 for invalid (three distinct 401 bodies observed:
 *     "No cookie auth credentials found" with no header, "Missing
 *     Authentication header" for a junk value, "User not found" for a
 *     well-shaped fake — all 401, so status alone is sufficient and we
 *     never parse the body).
 *   - anthropic: GET /v1/models, `x-api-key` + `anthropic-version`
 *     (sdk/AnthropicClient.js#listModels' own endpoint/headers).
 *   - openai:    GET /v1/models, `Authorization: Bearer`
 *     (sdk/OpenAIClient.js#listModels).
 *   - google:    GET /v1beta/models?pageSize=1, `x-goog-api-key`
 *     (sdk/GoogleClient.js#listModels).
 *   - xai:       GET /v1/models, `Authorization: Bearer`
 *     (sdk/XaiClient.js#listModels).
 *
 * Status handling is deliberately provider-aware, because the five
 * APIs do NOT agree on how they report a bad key — observed live:
 * Anthropic/OpenAI/OpenRouter answer 401, while Google and xAI answer
 * **400** with an auth error in the body. Treating a 400 as "invalid"
 * universally would be wrong in the other direction, so each provider
 * declares its own invalid-key status set below.
 *
 * Two rules this module holds to without exception:
 *
 *  - TRANSIENT FAILURES ARE NOT INVALID KEYS. A network blip, a 429, or
 *    a provider 5xx must NEVER report `valid: false, errorCode:
 *    'invalid'` — that would let a bad network destroy a working key in
 *    `.env`. They surface as `errorCode: 'network' | 'rate_limited' |
 *    'server'`, and the caller's job is to refuse the save *without*
 *    deleting what's already stored. Overwriting a good key with a bad
 *    one is the worst outcome this feature could produce, so it is the
 *    one it is built to make impossible.
 *  - NO PROVIDER ERROR TEXT IS EVER RETURNED. OpenAI and xAI echo a
 *    masked form of the submitted key back in their error bodies, and
 *    echoing provider text to the browser would leak key material
 *    into logs/UI. Every message below is a fixed string authored here.
 *
 * Dependency-free CommonJS, same constraint as lib/providers.js: it is
 * required from an app/api route handler and from bin/setup.js. Like
 * lib/providers.js it must never be imported into a 'use client'
 * component — ConnectionsView reads its key hints from the /api/config
 * response instead.
 */

const { PROVIDER_ENV_VARS } = require('./providers');

/** Default per-request timeout. Long enough for a slow provider, short
 *  enough that a hung socket doesn't leave the Save button spinning. */
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * Per-provider verification config. `invalidStatuses` are the statuses
 * that mean "this key is not usable", confirmed per provider against
 * the live API (see module comment) — notably Google and xAI report a
 * bad key as 400, not 401.
 */
const VERIFIERS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/key',
    buildHeaders: key => ({ Authorization: `Bearer ${key}` }),
    invalidStatuses: [401, 403],
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/models',
    buildHeaders: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    invalidStatuses: [401, 403],
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    buildHeaders: key => ({ Authorization: `Bearer ${key}` }),
    invalidStatuses: [401, 403],
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
    buildHeaders: key => ({ 'x-goog-api-key': key }),
    invalidStatuses: [400, 401, 403],
  },
  xai: {
    url: 'https://api.x.ai/v1/models',
    buildHeaders: key => ({ Authorization: `Bearer ${key}` }),
    invalidStatuses: [400, 401, 403],
  },
};

/**
 * Key-shape prefixes per provider, the layer-1 pre-filter. These are the
 * prefixes the providers actually issue today, confirmed against live
 * keys and the providers' own docs; several accept multiple generations
 * of key, so each is a list. A key whose shape doesn't match is rejected
 * without spending a network round-trip.
 *
 * Four of the five are unambiguous on their own (OpenRouter 'sk-or-',
 * Anthropic 'sk-ant-', Google 'AIza', xAI 'xai-'); OpenAI's is the broad
 * 'sk-', which every other `sk-*` key also starts with, so OpenAI is
 * never identified by prefix and never wins a prefix tie.
 *
 * This table exists to catch a key pasted into the WRONG card with an
 * actionable message instead of a bare provider-side 401. That case is
 * real, not hypothetical: this repo's own `.env` was found carrying an
 * `sk-or-v1-…` value under `OPENAI_API_KEY` — an OpenRouter key sitting
 * in OpenAI's slot, exactly the bug this check makes visible.
 *
 * Attribution is resolved by longest matching prefix across ALL
 * providers in `validateKeyShape`, so the more specific `sk-or-v1-`
 * beats OpenAI's generic `sk-` and the key is correctly reported as
 * OpenRouter's. A real case this must not break: a genuine OpenAI
 * `sk-proj-…` key matches only `sk-` and is still accepted for OpenAI.
 */
const KEY_PREFIXES = {
  // OpenRouter: current "sk-or-v1-<64 hex>-<64 hex>" keys, plus the
  // shorter legacy "sk-or-<40 hex>" format still accepted by the API.
  openrouter: ['sk-or-v1-', 'sk-or-'],
  // Anthropic: "sk-ant-api03-…" (the "03" is the current key version).
  anthropic: ['sk-ant-api03-', 'sk-ant-'],
  // OpenAI: "sk-proj-…", "sk-svcacct-…", and the older bare "sk-…".
  openai: ['sk-'],
  // Google AI Studio: every Google API key starts "AIza".
  google: ['AIza'],
  // xAI: "xai-…".
  xai: ['xai-'],
};

/**
 * Providers whose key is OPTIONAL, declared in lib/providers.js as
 * `keyOptional: true`. OpenCode Zen is the live case: `POST /v1/chat/completions`
 * succeeds with no Authorization header at all (sdk/OpenCodeZenClient.js), so
 * there is no documented key format to prefix-match and no endpoint that
 * answers "is this key valid" — the free-model roster is usable keyless.
 *
 * Why this is an explicit opt-out rather than an entry in KEY_PREFIXES: a
 * fabricated prefix would let a well-formed string for some other provider
 * pass as an OpenCode key, which is the exact misattribution this module
 * exists to prevent. A provider that cannot be verified must be skipped
 * honestly, not verified against a guess.
 *
 * Invariant: every id here MUST still appear in PROVIDER_IDS, and
 * `keyOptional` MUST be true in lib/providers.js. tests/ProviderKeyValidation
 * enforces both, so a provider cannot quietly become unverified.
 */
const KEY_OPTIONAL = Object.freeze({
  opencode: {
    reason: 'OpenCode Zen works without a key; there is no documented key format or key-status endpoint to verify against.',
    // With no key at all the provider is simply "connected keyless" — not a
    // verification failure. A key that WAS supplied still gets the generic
    // length/whitespace checks below.
  },
});

/**
 * Minimum plausible key length per provider. Guards against a bare
 * prefix with nothing behind it ("sk-or-v1-"), which the prefix check
 * alone would happily accept. Deliberately well below real key lengths
 * (real: OpenRouter 73, Anthropic 108, OpenAI 73, Google 39, xAI 51-73)
 * so a shorter-but-valid future key format is never rejected locally —
 * the live check is the real gate; this only catches stub input.
 */
const MIN_KEY_LENGTH = 20;

/** Human-facing provider names for the wrong-card message. */
const PROVIDER_LABELS = Object.freeze({
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google AI Studio',
  xai: 'xAI',
});

/** @returns {string|null} The env var a provider's key is stored in, or
 *  null for an unknown provider id. */
function envVarFor(providerId) {
  return PROVIDER_ENV_VARS[providerId] || null;
}

/**
 * Layer 1: offline shape check.
 * @param {string} providerId Provider id from lib/providers.js.
 * @param {string} key Raw submitted key.
 * @returns {{ok: boolean, error: string|null}} `error` is an
 *   author-written, key-free message safe to show a user.
 */
function validateKeyShape(providerId, key) {
  const optional = KEY_OPTIONAL[providerId];
  if (!KEY_PREFIXES[providerId] && !optional) {
    return { ok: false, error: 'Unknown provider.' };
  }
  if (typeof key !== 'string' || !key.trim()) {
    // A keyless-optional provider is connected keyless, not misconfigured.
    if (optional) return { ok: true, error: null, keyless: true };
    return { ok: false, error: 'Enter an API key.' };
  }

  // The value is TRIMMED first, then checked for interior whitespace — the
  // order matters. A trailing newline or surrounding spaces are normal
  // paste artifacts and must be accepted (the trimmed value is what gets
  // verified), but whitespace in the MIDDLE of a key is always a mistake
  // — a real key from any of these providers is a single unbroken token.
  // Checking before trimming would reject the common "paste + Enter" case.
  const value = key.trim();
  if (/\s/.test(value)) {
    return { ok: false, error: 'API keys cannot contain spaces or line breaks.' };
  }
  if (value.length < MIN_KEY_LENGTH) {
    return { ok: false, error: 'That key is too short to be a real API key.' };
  }

  // Longest-match-wins across ALL providers' prefixes, not a
  // check-this-provider-first-then-check-others sequence. That ordering
  // is what makes the wrong-card case work: OpenAI's accepted prefix is
  // the broad 'sk-', which an OpenRouter 'sk-or-v1-…' key also starts
  // with, so a this-provider-first test would happily accept an OpenRouter
  // key in the OpenAI card. Comparing every provider's longest matching
  // prefix and taking the winner means the more specific 'sk-or-v1-'
  // beats the generic 'sk-', and the key is correctly attributed to
  // OpenRouter. Specificity, not provider order, decides attribution.
  let best = null; // { providerId, length }
  for (const [id, idPrefixes] of Object.entries(KEY_PREFIXES)) {
    for (const prefix of idPrefixes) {
      if (value.startsWith(prefix) && (!best || prefix.length > best.length)) {
        best = { providerId: id, length: prefix.length };
      }
    }
  }

  if (!best) {
    if (optional) {
      // No documented prefix to match, so prefix attribution cannot apply. The
      // key passed the whitespace/length checks above; there is nothing further
      // to assert offline for this provider.
      return { ok: true, error: null, unverified: true, reason: optional.reason };
    }
    return {
      ok: false,
      error: `This does not look like a ${PROVIDER_LABELS[providerId] || providerId} API key — expected it to start with ${KEY_PREFIXES[providerId][0]}.`,
    };
  }

  if (best.providerId !== providerId) {
    const actualLabel = PROVIDER_LABELS[best.providerId] || best.providerId;
    const ownLabel = PROVIDER_LABELS[providerId] || providerId;
    return {
      ok: false,
      error: `That looks like a ${actualLabel} key, not a ${ownLabel} key. Paste it in the ${actualLabel} field instead.`,
    };
  }

  return { ok: true, error: null };
}

/**
 * Layer 2: live verification against the provider's own API.
 *
 * Runs the shape check first, so an obviously-wrong key never reaches
 * the network. On success returns `{valid: true}`; on an auth failure
 * returns `{valid: false, errorCode: 'invalid'}`; on anything else
 * (offline, rate limited, provider outage) returns `valid: false` with
 * a NON-'invalid' errorCode, which callers must treat as "couldn't
 * confirm", never as "wrong key".
 *
 * @param {string} providerId Provider id from lib/providers.js.
 * @param {string} key Raw submitted key.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] Per-request timeout in ms.
 * @param {typeof fetch} [options.fetchImpl] Injected fetch, for tests.
 * @returns {Promise<{valid: boolean, errorCode: string|null, error: string|null}>}
 */
async function verifyProviderKey(providerId, key, options = {}) {
  const value = typeof key === 'string' ? key.trim() : '';
  const optional = KEY_OPTIONAL[providerId];

  if (optional) {
    // No key: connected keyless, not a failed verification. A key that WAS
    // supplied still goes through validateKeyShape's generic checks, but there
    // is no endpoint to prove it valid — say so instead of guessing one.
    if (!value) {
      return { valid: true, errorCode: null, error: null, unverified: true, reason: optional.reason };
    }
    const shape = validateKeyShape(providerId, value);
    if (!shape.ok) {
      return { valid: false, errorCode: 'invalid', error: shape.error };
    }
    return { valid: true, errorCode: null, error: null, unverified: true, reason: optional.reason };
  }

  const verifier = VERIFIERS[providerId];
  if (!verifier) {
    return { valid: false, errorCode: 'invalid', error: 'Unknown provider.' };
  }

  const shape = validateKeyShape(providerId, value);
  if (!shape.ok) {
    return { valid: false, errorCode: 'invalid', error: shape.error };
  }

  const doFetch = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? VERIFY_TIMEOUT_MS;

  let response;
  try {
    response = await doFetch(verifier.url, {
      method: 'GET',
      headers: verifier.buildHeaders(value),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Offline, DNS failure, TLS error, or our own timeout. Explicitly
    // NOT 'invalid' — see the module comment.
    return {
      valid: false,
      errorCode: 'network',
      error: `Could not reach the provider to verify this key. Check your connection and try again — your existing key was not changed.`,
    };
  }

  if (response.ok) {
    return { valid: true, errorCode: null, error: null };
  }

  if (verifier.invalidStatuses.includes(response.status)) {
    return {
      valid: false,
      errorCode: 'invalid',
      error: `That ${providerId} API key was rejected by ${providerId}. Check that you pasted the full key from the provider's dashboard.`,
    };
  }

  if (response.status === 429) {
    return {
      valid: false,
      errorCode: 'rate_limited',
      error: 'The provider is rate-limiting verification right now. Wait a moment and try again — your existing key was not changed.',
    };
  }

  return {
    valid: false,
    errorCode: 'server',
    error: `The provider's verification endpoint returned an unexpected error (HTTP ${response.status}). Your existing key was not changed.`,
  };
}

module.exports = {
  KEY_OPTIONAL,
  KEY_PREFIXES,
  MIN_KEY_LENGTH,
  VERIFIERS,
  VERIFY_TIMEOUT_MS,
  envVarFor,
  validateKeyShape,
  verifyProviderKey,
};
