const test = require('node:test');
const assert = require('node:assert/strict');
const ModelBroker = require('../core/ModelBroker');

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
