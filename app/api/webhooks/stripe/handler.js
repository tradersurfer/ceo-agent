// Orchestration for POST /api/webhooks/stripe (issue #100). Core logic
// lives here, not in route.ts -- same "testable without Next.js" split
// app/api/dispatch/handler.js and app/api/health/route.ts already use.
//
// Order matters and is fixed: verify the raw-body signature FIRST, fail
// closed on anything but a real match, and only then parse the body and
// hand it to payment_webhook_event_classify for classification/routing.
// payment_webhook_event_classify itself is unmodified by this work -- it
// stays a pure classifier; this is the separate verification precondition
// it was always scoped to need (ceo-core/skills/cooSkills.js's own header
// comment, docs/ISSUE-stripe-webhook-verification-route-layer.md).

const { verifyStripeSignature } = require('../../../../lib/stripeWebhookVerify');

/**
 * @param {object} input
 * @param {string|Buffer} input.rawBody Exact raw request body bytes/string.
 * @param {string|null} input.signatureHeader The Stripe-Signature header value.
 * @param {string|null|undefined} input.secret STRIPE_WEBHOOK_SECRET. Never echoed into the returned result.
 * @param {import('../../../../ceo-core/SkillExecutor').SkillExecutor} input.skillExecutor
 * @param {string} [input.agentId] Agent id skill authorization is checked against. Defaults to 'hermes' (the real agent-registry.json owner of payment_webhook_event_classify).
 * @returns {Promise<{httpStatus: number, body: object}>} A response-shaped result the route wrapper returns as-is -- never includes the secret, the raw signature header, or the computed HMAC in either branch.
 */
async function handleStripeWebhook({ rawBody, signatureHeader, secret, skillExecutor, agentId = 'hermes' }) {
  if (!secret) {
    // Distinct from an invalid signature: this install hasn't configured
    // Stripe webhooks at all. Still fails closed -- no event is ever
    // classified without a secret to verify against.
    return { httpStatus: 503, body: { error: 'Stripe webhooks are not configured on this install.' } };
  }

  const verification = verifyStripeSignature({ rawBody, signatureHeader, secret });
  if (!verification.valid) {
    // Deliberately generic: the reason code (signature_mismatch vs.
    // malformed_signature_header vs. timestamp_out_of_tolerance) is useful
    // for server-side logs/audit, never for the HTTP response body -- an
    // attacker probing this endpoint learns nothing about why their
    // forged signature failed.
    return { httpStatus: 400, body: { error: 'Invalid Stripe signature.' } };
  }

  let event;
  try {
    const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    event = JSON.parse(bodyString);
  } catch {
    return { httpStatus: 400, body: { error: 'Verified signature, but the body is not valid JSON.' } };
  }

  if (!skillExecutor) {
    // Signature is real and verified; classification is just unavailable
    // in this call context. Still a 200 -- Stripe should not retry a
    // webhook whose authenticity was already confirmed.
    return { httpStatus: 200, body: { received: true, classified: false } };
  }

  const result = await skillExecutor.run('payment_webhook_event_classify', { webhookEvent: event, provider: 'stripe' }, undefined, { agentId });
  if (result.status !== 'ok') {
    return { httpStatus: 200, body: { received: true, classified: false, classificationError: result.error || result.reason || 'unknown' } };
  }
  return { httpStatus: 200, body: { received: true, classified: true, transactionStatus: result.output.transactionStatus, actions: result.output.actions } };
}

module.exports = { handleStripeWebhook };
