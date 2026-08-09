// Real Stripe webhook signature verification (issue #100).
//
// Deliberately lives here, NOT in ceo-core/skills/cooSkills.js's
// payment_webhook_event_classify: SkillExecutor only ever receives a parsed
// JSON `input` object, and Stripe signs the RAW request body bytes, not a
// re-serialized object -- re-stringifying breaks the signature. This module
// has no Next.js dependency (same "core logic lives outside route.ts,
// testable without Next.js" split app/api/dispatch/handler.js and
// app/api/health/route.ts already use) and no dependency on the Stripe SDK
// -- the verification scheme is a documented, stable HMAC construction,
// implemented directly with Node's own crypto module.
//
// Stripe-Signature header shape: "t=<unix ts>,v1=<hex hmac>[,v1=<hex>...][,v0=<hex>]".
// Signed payload: `${t}.${rawBody}`, HMAC-SHA256 keyed by the endpoint's
// webhook secret, hex-encoded. Multiple v1 entries occur during secret
// rotation (Stripe signs with both the old and new secret for a window) --
// a match against ANY v1 entry is a valid signature. v0 entries use the
// deprecated SHA1 scheme and are never checked.

const crypto = require('crypto');

const DEFAULT_TOLERANCE_SECONDS = 300; // Stripe's own SDK default.

/**
 * Parses a Stripe-Signature header into its timestamp and v1 signatures.
 * @param {string} header Raw Stripe-Signature header value.
 * @returns {{timestamp: number, v1: string[]}|null} Parsed fields, or null if malformed.
 */
function parseSignatureHeader(header) {
  if (typeof header !== 'string' || !header.trim()) return null;
  const parts = header.split(',').map(part => part.trim()).filter(Boolean);
  let timestamp = null;
  const v1 = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 't') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === 'v1' && value) {
      v1.push(value);
    }
  }
  if (timestamp === null || v1.length === 0) return null;
  return { timestamp, v1 };
}

/**
 * Constant-time hex-string comparison. Returns false (never throws) on a
 * length mismatch instead of leaking timing information via Buffer
 * allocation size or an early return before the safe compare runs.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeHexEqual(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a Stripe webhook signature against the RAW request body.
 *
 * Fails closed: any missing input, malformed header, non-matching
 * signature, or (unless explicitly disabled) a timestamp outside the
 * replay-tolerance window returns { valid: false }. There is no code path
 * that returns { valid: true } without a real HMAC comparison succeeding.
 *
 * @param {object} input
 * @param {string|Buffer} input.rawBody The exact, unmodified request body Stripe signed.
 * @param {string|null|undefined} input.signatureHeader The Stripe-Signature header value.
 * @param {string|null|undefined} input.secret The endpoint's webhook signing secret (STRIPE_WEBHOOK_SECRET). Read for comparison only -- never returned, never logged by this function.
 * @param {object} [options]
 * @param {number} [options.toleranceSeconds] Replay-tolerance window in seconds. Defaults to 300 (Stripe SDK default). Pass 0 to disable the timestamp check (tests only -- an install should never disable this).
 * @param {number} [options.nowSeconds] Injectable "current time" in unix seconds, for deterministic tests.
 * @returns {{valid: boolean, reason?: string, timestamp?: number}}
 */
function verifyStripeSignature(input, options = {}) {
  const { rawBody, signatureHeader, secret } = input || {};
  if (!secret) return { valid: false, reason: 'not_configured' };
  if (rawBody == null) return { valid: false, reason: 'missing_body' };
  if (!signatureHeader) return { valid: false, reason: 'missing_signature_header' };

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { valid: false, reason: 'malformed_signature_header' };

  const toleranceSeconds = options.toleranceSeconds != null ? options.toleranceSeconds : DEFAULT_TOLERANCE_SECONDS;
  const nowSeconds = options.nowSeconds != null ? options.nowSeconds : Math.floor(Date.now() / 1000);
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return { valid: false, reason: 'timestamp_out_of_tolerance', timestamp: parsed.timestamp };
  }

  const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const signedPayload = `${parsed.timestamp}.${bodyString}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  const matched = parsed.v1.some(candidate => safeHexEqual(candidate, expected));
  if (!matched) return { valid: false, reason: 'signature_mismatch' };

  return { valid: true, timestamp: parsed.timestamp };
}

module.exports = { verifyStripeSignature, parseSignatureHeader, safeHexEqual };
