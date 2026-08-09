import { NextResponse } from 'next/server';
const { handleStripeWebhook } = require('./handler');
const { getRuntime } = require('../../../../lib/ceoAgentServer');

// Force the Node.js runtime (not Edge): signature verification needs
// Node's crypto module (lib/stripeWebhookVerify.js), same requirement
// HermesGatewayClient's credential handling has.
export const runtime = 'nodejs';

/**
 * POST /api/webhooks/stripe
 *
 * Real Stripe webhook signature verification at the route layer (issue
 * #100) -- NOT inside payment_webhook_event_classify, which only ever
 * receives an already-parsed JSON object and has no access to the raw
 * body bytes or HTTP headers a real signature check needs.
 *
 * request.text() reads the exact raw body BEFORE any JSON parsing --
 * critical, since Stripe signs the raw bytes and re-serializing a parsed
 * object would never match. STRIPE_WEBHOOK_SECRET is read from env once,
 * passed to the verifier for comparison only, and never appears in any
 * response this route returns (see handler.js).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('stripe-signature');
  const { runtime } = getRuntime();

  const result = await handleStripeWebhook({
    rawBody,
    signatureHeader,
    secret: process.env.STRIPE_WEBHOOK_SECRET || null,
    skillExecutor: runtime.skillExecutor,
  });

  return NextResponse.json(result.body, { status: result.httpStatus });
}
