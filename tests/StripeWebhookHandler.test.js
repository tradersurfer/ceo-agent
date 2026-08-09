// Real end-to-end route-layer test (issue #100): a genuinely signed
// payload flows through verification into the REAL payment_webhook_event_
// classify skill via a real SkillExecutor/SkillRegistry -- not a mock of
// either. A tampered payload is proven rejected BEFORE the skill is ever
// invoked.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const { registerCooSkills } = require('../ceo-core/skills/cooSkills');
const { handleStripeWebhook } = require('../app/api/webhooks/stripe/handler');

const SECRET = 'whsec_handler_test_secret';
const BODY = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { amount: 4200, currency: 'usd', customer: 'cus_1' } } });

function sign(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function buildExecutor() {
  const registry = new SkillRegistry();
  registerCooSkills(registry);
  // hermes really does have payment_webhook_event_classify in its skills
  // list (registry/agent-registry.json) -- match that here rather than
  // inventing a permissive fixture agent.
  const agent = { id: 'hermes', skills: ['payment_webhook_event_classify'], offLimits: [] };
  return new SkillExecutor(registry, { agentResolver: id => (id === agent.id ? agent : null) });
}

test('a genuinely valid signature is verified AND the real skill classifies the event', async () => {
  const result = await handleStripeWebhook({
    rawBody: BODY,
    signatureHeader: sign(BODY, SECRET),
    secret: SECRET,
    skillExecutor: buildExecutor(),
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.received, true);
  assert.equal(result.body.classified, true);
  assert.equal(result.body.transactionStatus, 'succeeded');
  assert.ok(result.body.actions.some(a => a.type === 'grant_access'));
});

test('a tampered payload is rejected with 400 BEFORE the skill is ever invoked', async () => {
  let skillWasCalled = false;
  const executor = buildExecutor();
  const realRun = executor.run.bind(executor);
  executor.run = async (...args) => { skillWasCalled = true; return realRun(...args); };

  const tampered = BODY.replace('4200', '999999');
  const result = await handleStripeWebhook({
    rawBody: tampered,
    signatureHeader: sign(BODY, SECRET), // signed over the ORIGINAL body
    secret: SECRET,
    skillExecutor: executor,
  });

  assert.equal(result.httpStatus, 400);
  assert.equal(skillWasCalled, false, 'classification must never run on an unverified/tampered payload');
});

test('a missing signature header is rejected with 400, skill never invoked', async () => {
  let skillWasCalled = false;
  const executor = buildExecutor();
  const realRun = executor.run.bind(executor);
  executor.run = async (...args) => { skillWasCalled = true; return realRun(...args); };

  const result = await handleStripeWebhook({ rawBody: BODY, signatureHeader: null, secret: SECRET, skillExecutor: executor });
  assert.equal(result.httpStatus, 400);
  assert.equal(skillWasCalled, false);
});

test('an unconfigured install (no STRIPE_WEBHOOK_SECRET) fails closed with 503, never treats the payload as verified', async () => {
  const result = await handleStripeWebhook({ rawBody: BODY, signatureHeader: sign(BODY, SECRET), secret: null, skillExecutor: buildExecutor() });
  assert.equal(result.httpStatus, 503);
  assert.equal(result.body.classified, undefined);
});

test('the secret never appears anywhere in the response body, valid or invalid path', async () => {
  const validResult = await handleStripeWebhook({ rawBody: BODY, signatureHeader: sign(BODY, SECRET), secret: SECRET, skillExecutor: buildExecutor() });
  const invalidResult = await handleStripeWebhook({ rawBody: BODY, signatureHeader: 'garbage', secret: SECRET, skillExecutor: buildExecutor() });
  for (const result of [validResult, invalidResult]) {
    const serialized = JSON.stringify(result.body);
    assert.ok(!serialized.includes(SECRET), `response body must never contain the secret: ${serialized}`);
  }
});

test('a verified signature with an unparseable JSON body is rejected with 400, not silently classified', async () => {
  const notJson = 'not actually json';
  const result = await handleStripeWebhook({
    rawBody: notJson,
    signatureHeader: sign(notJson, SECRET),
    secret: SECRET,
    skillExecutor: buildExecutor(),
  });
  assert.equal(result.httpStatus, 400);
});
