// Real Stripe webhook signature verification tests (issue #100). Builds
// signatures the same way Stripe itself does (HMAC-SHA256 over
// `${timestamp}.${rawBody}`), independent of the module under test, so
// this isn't a tautological self-check.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyStripeSignature, parseSignatureHeader } = require('../lib/stripeWebhookVerify');

const SECRET = 'whsec_test_secret_1234567890';
const BODY = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { amount: 4200, currency: 'usd' } } });

function sign(body, secret, timestamp) {
  const payload = `${timestamp}.${body}`;
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function header(body, secret, { timestamp = Math.floor(Date.now() / 1000), extraV1 = [] } = {}) {
  const v1 = sign(body, secret, timestamp);
  return [`t=${timestamp}`, `v1=${v1}`, ...extraV1.map(v => `v1=${v}`)].join(',');
}

test('a genuinely valid signature is accepted', () => {
  const sig = header(BODY, SECRET);
  const result = verifyStripeSignature({ rawBody: BODY, signatureHeader: sig, secret: SECRET });
  assert.equal(result.valid, true);
});

test('a tampered payload (body changed after signing) is rejected', () => {
  const sig = header(BODY, SECRET);
  const tampered = BODY.replace('4200', '999999');
  const result = verifyStripeSignature({ rawBody: tampered, signatureHeader: sig, secret: SECRET });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'signature_mismatch');
});

test('a signature computed with the wrong secret is rejected', () => {
  const sig = header(BODY, 'whsec_wrong_secret');
  const result = verifyStripeSignature({ rawBody: BODY, signatureHeader: sig, secret: SECRET });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'signature_mismatch');
});

test('a missing Stripe-Signature header is rejected', () => {
  const result = verifyStripeSignature({ rawBody: BODY, signatureHeader: null, secret: SECRET });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing_signature_header');
});

test('a missing configured secret is rejected (not_configured, distinct from a bad signature)', () => {
  const sig = header(BODY, SECRET);
  const result = verifyStripeSignature({ rawBody: BODY, signatureHeader: sig, secret: null });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'not_configured');
});

test('a malformed header (no v1, or no t) is rejected', () => {
  assert.equal(verifyStripeSignature({ rawBody: BODY, signatureHeader: 't=123', secret: SECRET }).valid, false);
  assert.equal(verifyStripeSignature({ rawBody: BODY, signatureHeader: 'v1=abcd', secret: SECRET }).valid, false);
  assert.equal(verifyStripeSignature({ rawBody: BODY, signatureHeader: '', secret: SECRET }).valid, false);
  assert.equal(parseSignatureHeader('garbage'), null);
});

test('a timestamp far outside the tolerance window is rejected (replay protection)', () => {
  const oldTimestamp = Math.floor(Date.now() / 1000) - 10000; // ~2.8 hours old
  const sig = header(BODY, SECRET, { timestamp: oldTimestamp });
  const result = verifyStripeSignature({ rawBody: BODY, signatureHeader: sig, secret: SECRET });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'timestamp_out_of_tolerance');
});

test('a timestamp within the tolerance window is accepted', () => {
  const recentTimestamp = Math.floor(Date.now() / 1000) - 60;
  const sig = header(BODY, SECRET, { timestamp: recentTimestamp });
  const result = verifyStripeSignature({ rawBody: BODY, signatureHeader: sig, secret: SECRET });
  assert.equal(result.valid, true);
});

test('secret rotation: a header carrying both an old and new v1 signature is accepted if EITHER matches', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const newSecret = 'whsec_new_secret';
  const oldV1 = sign(BODY, SECRET, timestamp);
  const sig = header(BODY, newSecret, { timestamp, extraV1: [oldV1] });
  // Verifying against the OLD secret should still succeed because the
  // header carries the old signature alongside the new one.
  const result = verifyStripeSignature({ rawBody: BODY, signatureHeader: sig, secret: SECRET });
  assert.equal(result.valid, true);
});

test('the secret never appears in the verification result, valid or invalid', () => {
  const sig = header(BODY, SECRET);
  const valid = verifyStripeSignature({ rawBody: BODY, signatureHeader: sig, secret: SECRET });
  const invalid = verifyStripeSignature({ rawBody: BODY, signatureHeader: 'garbage', secret: SECRET });
  for (const result of [valid, invalid]) {
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(SECRET), `verification result must never contain the secret: ${serialized}`);
  }
});

test('a v0-only header (deprecated SHA1 scheme) is rejected -- v0 is never checked', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const result = verifyStripeSignature({ rawBody: BODY, signatureHeader: `t=${timestamp},v0=deadbeef`, secret: SECRET });
  assert.equal(result.valid, false);
});
