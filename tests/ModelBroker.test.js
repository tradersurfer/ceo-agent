const test = require('node:test');
const assert = require('node:assert/strict');
const ModelBroker = require('../ceo-core/ModelBroker');

test('getPricing returns the resolved tier pricing', () => {
  const broker = new ModelBroker([{
    id: 'claude', role: 'claude',
    tiers: {
      flagship: { apiModelId: 'anthropic/claude-opus-5', pricing: { prompt: 0.000015, completion: 0.000075 } },
      efficient: { apiModelId: 'anthropic/claude-haiku-4.5', pricing: { prompt: 0.000001, completion: 0.000005 } },
    },
  }]);

  assert.deepEqual(broker.getPricing('claude', 'flagship'), { prompt: 0.000015, completion: 0.000075 });
  assert.deepEqual(broker.getPricing('claude', 'efficient'), { prompt: 0.000001, completion: 0.000005 });
});

test('getPricing returns null for an unresolved model, unknown id, or unknown tier', () => {
  const broker = new ModelBroker([{ id: 'hermes', role: 'hermes', apiModelId: 'local' }]);
  assert.equal(broker.getPricing('hermes', 'flagship'), null, 'hermes has no tiers/pricing at all');
  assert.equal(broker.getPricing('does_not_exist', 'flagship'), null);

  const brokerWithFlagshipOnly = new ModelBroker([{
    id: 'claude', role: 'claude',
    tiers: { flagship: { apiModelId: 'anthropic/claude-opus-5', pricing: { prompt: 0.000015, completion: 0.000075 } } },
  }]);
  assert.equal(brokerWithFlagshipOnly.getPricing('claude', 'efficient'), null);
});

test('getApiModelId and getPricing work generically for the "cheapest" tier, same as flagship/efficient (BYNGE §5 decision (b))', () => {
  const broker = new ModelBroker([{
    id: 'claude', role: 'claude',
    tiers: {
      flagship: { apiModelId: 'anthropic/claude-opus-5', pricing: { prompt: 0.000015, completion: 0.000075 } },
      efficient: { apiModelId: 'anthropic/claude-haiku-4.5', pricing: { prompt: 0.000001, completion: 0.000005 } },
      cheapest: { apiModelId: 'anthropic/claude-value-tier', pricing: { prompt: 0.0000003, completion: 0.0000015 } },
    },
  }]);

  assert.equal(broker.getApiModelId('claude', 'cheapest'), 'anthropic/claude-value-tier');
  assert.deepEqual(broker.getPricing('claude', 'cheapest'), { prompt: 0.0000003, completion: 0.0000015 });
});
