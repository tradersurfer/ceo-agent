const { test } = require('node:test');
const assert = require('node:assert');
const { friendlyMessageFor } = require('../lib/userMessages');

test('never leaks raw status codes or JSON error bodies', () => {
  const msg = friendlyMessageFor('model_call_failed', 'OpenRouter completion failed: 401 {"error":{"message":"User not found.","code":401}}');
  assert.doesNotMatch(msg, /401/);
  assert.doesNotMatch(msg, /\{.*"error"/);
  assert.match(msg, /API key/i);
});

test('unknown status falls back to a generic plain message', () => {
  const msg = friendlyMessageFor('some_future_status', 'raw stack trace or whatever');
  assert.doesNotMatch(msg, /raw stack trace/);
  assert.match(msg, /try again/i);
});

test('rate limit is distinguished from a generic failure', () => {
  const msg = friendlyMessageFor('model_call_failed', '429 rate limit exceeded');
  assert.match(msg, /rate.limit/i);
});

test('blocked and queued statuses have distinct plain messages', () => {
  assert.notStrictEqual(
    friendlyMessageFor('blocked', ''),
    friendlyMessageFor('queued', '')
  );
});
