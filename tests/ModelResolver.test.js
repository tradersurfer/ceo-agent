const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRoleModels, extractPricing, pickCheapest, pickEfficient, PROVIDER_PREFIXES } = require('../ceo-core/ModelResolver');

function model(id, created, prompt = '0.000001') {
  return {
    id,
    name: id,
    created,
    context_length: 100000,
    pricing: { prompt },
    architecture: { output_modalities: ['text'] },
  };
}

test('resolves provider product families rather than adjacent provider models', () => {
  const resolved = resolveRoleModels([
    model('google/gemma-4-flagship', 500),
    model('google/gemini-2.5-pro', 300),
    model('google/gemini-3-flash-lite', 400),
  ]);

  assert.equal(resolved.gemini.flagship.apiModelId, 'google/gemini-2.5-pro');
  assert.equal(resolved.gemini.efficient.apiModelId, 'google/gemini-3-flash-lite');
});

test('codex resolves independently from general GPT models', () => {
  const resolved = resolveRoleModels([
    model('openai/gpt-6-pro', 500),
    model('openai/gpt-5.3-codex', 400),
    model('openai/gpt-5.2-codex', 300),
  ]);

  assert.equal(resolved.gpt.flagship.apiModelId, 'openai/gpt-6-pro');
  assert.equal(resolved.codex.flagship.apiModelId, 'openai/gpt-5.3-codex');
});

test('flagship prefers stable premium family while efficient prefers newest small tier', () => {
  const resolved = resolveRoleModels([
    model('anthropic/claude-opus-4.8', 400),
    model('anthropic/claude-opus-4.8-fast', 450),
    model('anthropic/claude-opus-5-preview', 500),
    model('anthropic/claude-haiku-4.5', 350, '0.000001'),
    model('anthropic/claude-3-haiku', 100, '0.0000001'),
  ]);

  assert.equal(resolved.claude.flagship.apiModelId, 'anthropic/claude-opus-4.8');
  assert.equal(resolved.claude.efficient.apiModelId, 'anthropic/claude-haiku-4.5');
});

test('resolved models retain per-token pricing for downstream cost tracking', () => {
  const resolved = resolveRoleModels([model('anthropic/claude-opus-4.8', 400, '0.000015')]);
  assert.deepEqual(resolved.claude.flagship.pricing, { prompt: 0.000015, completion: null });
});

test('extractPricing parses both prompt and completion, and handles missing/malformed pricing', () => {
  assert.deepEqual(extractPricing({ pricing: { prompt: '0.000003', completion: '0.000015' } }), { prompt: 0.000003, completion: 0.000015 });
  assert.equal(extractPricing({}), null);
  assert.equal(extractPricing(null), null);
  assert.deepEqual(extractPricing({ pricing: { prompt: 'not-a-number' } }), { prompt: null, completion: null });
});

// --- pickCheapest (BYNGE §5 decision (b): a real cheapest-price resolver,
// not a rename of pickEfficient's size heuristic) -------------------------

test('pickCheapest selects the lowest-priced candidate among several distinct prices', () => {
  const models = [
    model('anthropic/claude-a', 100, '0.000010'),
    model('anthropic/claude-b', 200, '0.000002'), // the real cheapest
    model('anthropic/claude-c', 300, '0.000030'),
  ];
  const cheapest = pickCheapest(models, PROVIDER_PREFIXES.claude, 'claude');
  assert.equal(cheapest.id, 'anthropic/claude-b');
});

test('pickCheapest breaks an exact price tie deterministically — first candidate at the minimum price wins', () => {
  const models = [
    model('anthropic/claude-first', 100, '0.000005'),
    model('anthropic/claude-second', 200, '0.000005'), // identical price, listed second
    model('anthropic/claude-third', 300, '0.000009'),
  ];
  const cheapest = pickCheapest(models, PROVIDER_PREFIXES.claude, 'claude');
  assert.equal(cheapest.id, 'anthropic/claude-first', 'the first-listed candidate at the minimum price must win');

  // Prove the tie-break follows input order (not model identity, not
  // creation date) by reversing which tied model comes first.
  const reordered = [
    model('anthropic/claude-second', 200, '0.000005'),
    model('anthropic/claude-first', 100, '0.000005'),
    model('anthropic/claude-third', 300, '0.000009'),
  ];
  const cheapestReordered = pickCheapest(reordered, PROVIDER_PREFIXES.claude, 'claude');
  assert.equal(cheapestReordered.id, 'anthropic/claude-second', 'the winner must flip when the tied pair is reordered in the input');
});

test('pickCheapest picks the genuinely cheapest model even when it differs from pickEfficient\'s size-keyword pick', () => {
  const models = [
    // Matches SMALL_TIER_KEYWORDS ("haiku") — pickEfficient will grab this
    // by name alone — but it is NOT the cheapest model here.
    model('anthropic/claude-haiku-4.5', 400, '0.000020'),
    // No small-tier keyword in the id at all, but it really is the
    // cheapest candidate by price.
    model('anthropic/claude-value-tier', 300, '0.000003'),
    model('anthropic/claude-opus-5', 500, '0.000090'),
  ];

  const efficientPick = pickEfficient(models, PROVIDER_PREFIXES.claude, 'claude');
  const cheapestPick = pickCheapest(models, PROVIDER_PREFIXES.claude, 'claude');

  assert.equal(efficientPick.id, 'anthropic/claude-haiku-4.5', 'sanity check: pickEfficient follows the name heuristic regardless of price');
  assert.equal(cheapestPick.id, 'anthropic/claude-value-tier', 'pickCheapest must follow real price data, not reuse the efficient heuristic under a new name');
  assert.notEqual(efficientPick.id, cheapestPick.id, 'this test only proves the point if efficient and cheapest genuinely disagree');
});

test('pickCheapest never crowns an unpriced candidate over a priced one', () => {
  const unpriced = {
    id: 'anthropic/claude-mystery',
    name: 'mystery',
    created: 999, // newest by creation date, but has no pricing at all
    context_length: 1000,
    architecture: { output_modalities: ['text'] },
  };
  const priced = model('anthropic/claude-known', 100, '0.000050');
  const cheapest = pickCheapest([unpriced, priced], PROVIDER_PREFIXES.claude, 'claude');
  assert.equal(cheapest.id, 'anthropic/claude-known', 'an unpriced model must never beat a priced one, regardless of recency');
});

test('pickCheapest returns null when there are no matching candidates', () => {
  assert.equal(pickCheapest([], PROVIDER_PREFIXES.claude, 'claude'), null);
  assert.equal(pickCheapest([model('openai/gpt-6', 100)], PROVIDER_PREFIXES.claude, 'claude'), null, 'a non-matching prefix must not be selected');
});

test('resolveRoleModels resolves a third "cheapest" tier per role, distinct from flagship/efficient', () => {
  const resolved = resolveRoleModels([
    model('anthropic/claude-haiku-4.5', 400, '0.000020'),
    model('anthropic/claude-value-tier', 300, '0.000003'),
    model('anthropic/claude-opus-5', 500, '0.000090'),
  ]);

  assert.equal(resolved.claude.cheapest.apiModelId, 'anthropic/claude-value-tier');
  assert.equal(resolved.claude.efficient.apiModelId, 'anthropic/claude-haiku-4.5');
  assert.notEqual(resolved.claude.cheapest.apiModelId, resolved.claude.efficient.apiModelId);
  assert.deepEqual(resolved.claude.cheapest.pricing, { prompt: 0.000003, completion: null });
});
