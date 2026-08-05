# ISSUE: Stripe webhook signature verification at the route layer

**Status:** Open — not implemented  
**Why not a skill:** `SkillExecutor` only receives a parsed JSON `input` object.
Stripe webhook authenticity requires HMAC over the **raw request body bytes**
plus the `Stripe-Signature` header, using an endpoint secret from env
(read for comparison only; never logged, never echoed, never transmitted).
Re-serializing a parsed object breaks the signature. CLI / workflow skill
invocations also have no HTTP headers.

**Proposed home:** An HTTP route (e.g. `app/api/webhooks/stripe/route.ts` or
dispatch ingress) that:

1. Reads the raw body buffer before JSON parse
2. Reads `Stripe-Signature`
3. Reads `STRIPE_WEBHOOK_SECRET` from env (HermesGatewayClient-style scoping)
4. Verifies with `crypto.createHmac` / Stripe's constructEvent equivalent
5. Fail closed on missing/invalid signature
6. Only then may call `payment_webhook_event_classify` (skill) for routing

**Acceptance:** Tampered payload rejected in an integration test with a real
HMAC comparison; secret never appears in logs or response bodies.
