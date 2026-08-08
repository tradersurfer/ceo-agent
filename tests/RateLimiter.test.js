const test = require('node:test');
const assert = require('node:assert/strict');
const { InMemoryRateLimiter, SupabaseRateLimiter, createRateLimiter } = require('../ceo-core/RateLimiter');
const { makeFakeSupabase } = require('./helpers/fakeSupabase');

// ---------------------------------------------------------------------------
// InMemoryRateLimiter
// ---------------------------------------------------------------------------

test('InMemoryRateLimiter allows requests up to the configured max within the window', async () => {
  const limiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 3 });
  const first = await limiter.check('caller-a');
  const second = await limiter.check('caller-a');
  const third = await limiter.check('caller-a');

  assert.deepEqual(first, { allowed: true, remaining: 2 });
  assert.deepEqual(second, { allowed: true, remaining: 1 });
  assert.deepEqual(third, { allowed: true, remaining: 0 });
});

test('InMemoryRateLimiter blocks requests once the max is reached within the window', async () => {
  const limiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 2 });
  await limiter.check('caller-a');
  await limiter.check('caller-a');
  const blocked = await limiter.check('caller-a');

  assert.deepEqual(blocked, { allowed: false, remaining: 0 });
});

test('InMemoryRateLimiter isolates counts per caller key', async () => {
  const limiter = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1 });
  const callerA = await limiter.check('caller-a');
  const callerB = await limiter.check('caller-b');

  assert.equal(callerA.allowed, true);
  assert.equal(callerB.allowed, true);
  const callerASecond = await limiter.check('caller-a');
  assert.equal(callerASecond.allowed, false);
});

test('InMemoryRateLimiter accounts for the sliding window by forgetting expired hits', async () => {
  let now = 0;
  const limiter = new InMemoryRateLimiter({ windowMs: 1000, maxRequests: 1 });
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const first = await limiter.check('caller-a');
    assert.equal(first.allowed, true);
    now += 500; // still inside the window
    const stillBlocked = await limiter.check('caller-a');
    assert.equal(stillBlocked.allowed, false);
    now += 600; // now 1100ms after the first hit, past the 1000ms window
    const allowedAgain = await limiter.check('caller-a');
    assert.equal(allowedAgain.allowed, true);
  } finally {
    Date.now = realNow;
  }
});

// ---------------------------------------------------------------------------
// SupabaseRateLimiter
// ---------------------------------------------------------------------------

test('SupabaseRateLimiter allows requests up to the configured max within the window', async () => {
  const supabase = makeFakeSupabase();
  const limiter = new SupabaseRateLimiter({ supabase, windowMs: 60_000, maxRequests: 2 });

  const first = await limiter.check('caller-a');
  const second = await limiter.check('caller-a');

  assert.deepEqual(first, { allowed: true, remaining: 1 });
  assert.deepEqual(second, { allowed: true, remaining: 0 });
  assert.equal(supabase._rows('rate_limit_hits').length, 2);
});

test('SupabaseRateLimiter blocks requests once the max is reached, without inserting a new row', async () => {
  const supabase = makeFakeSupabase();
  const limiter = new SupabaseRateLimiter({ supabase, windowMs: 60_000, maxRequests: 1 });

  await limiter.check('caller-a');
  const blocked = await limiter.check('caller-a');

  assert.deepEqual(blocked, { allowed: false, remaining: 0 });
  assert.equal(supabase._rows('rate_limit_hits').length, 1);
});

test('SupabaseRateLimiter isolates counts per caller key', async () => {
  const supabase = makeFakeSupabase();
  const limiter = new SupabaseRateLimiter({ supabase, windowMs: 60_000, maxRequests: 1 });

  const callerA = await limiter.check('caller-a');
  const callerB = await limiter.check('caller-b');
  const callerASecond = await limiter.check('caller-a');

  assert.equal(callerA.allowed, true);
  assert.equal(callerB.allowed, true);
  assert.equal(callerASecond.allowed, false);
});

test('SupabaseRateLimiter accounts for the sliding window, ignoring hits outside it', async () => {
  const supabase = makeFakeSupabase();
  const limiter = new SupabaseRateLimiter({ supabase, windowMs: 60_000, maxRequests: 1 });

  // Seed a hit well outside the window directly, bypassing check().
  supabase._rows('rate_limit_hits').push({ id: 1, rate_key: 'caller-a', hit_at: new Date(Date.now() - 120_000).toISOString() });

  const result = await limiter.check('caller-a');
  assert.equal(result.allowed, true);
});

test('SupabaseRateLimiter matches the InMemoryRateLimiter contract for allow/block shape', async () => {
  const supabase = makeFakeSupabase();
  const supa = new SupabaseRateLimiter({ supabase, windowMs: 60_000, maxRequests: 2 });
  const mem = new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 2 });

  assert.deepEqual(await supa.check('k'), await mem.check('k'));
  assert.deepEqual(await supa.check('k'), await mem.check('k'));
  assert.deepEqual(await supa.check('k'), await mem.check('k'));
});

test('requires credentials when no client is injected', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => new SupabaseRateLimiter(), /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    if (saved.url) process.env.SUPABASE_URL = saved.url;
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});

// ---------------------------------------------------------------------------
// createRateLimiter factory
// ---------------------------------------------------------------------------

test('createRateLimiter returns null without Supabase env vars', () => {
  assert.equal(createRateLimiter({}), null);
});

test('createRateLimiter builds a SupabaseRateLimiter when credentials are present', () => {
  const limiter = createRateLimiter({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' });
  assert.ok(limiter instanceof SupabaseRateLimiter);
});
