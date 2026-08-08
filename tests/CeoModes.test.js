const test = require('node:test');
const assert = require('node:assert/strict');
const { CEO_MODES, DEFAULT_CEO_MODE, resolveCeoMode } = require('../ceo-core/ceoModes');

test('all three named modes exist with distinct threshold pairs', () => {
  assert.equal(Object.keys(CEO_MODES).length, 3);
  assert.ok(CEO_MODES.conservative);
  assert.ok(CEO_MODES.aggressive);
  assert.ok(CEO_MODES.musk_mode);
  // Conservative escalates sooner (lower threshold) and holds a stricter
  // quality bar (higher passThreshold) than Aggressive, which in turn is
  // stricter on both axes than Musk Mode.
  assert.ok(CEO_MODES.conservative.escalationThreshold < CEO_MODES.aggressive.escalationThreshold);
  assert.ok(CEO_MODES.aggressive.escalationThreshold < CEO_MODES.musk_mode.escalationThreshold);
  assert.ok(CEO_MODES.conservative.qualityPassThreshold > CEO_MODES.aggressive.qualityPassThreshold);
  assert.ok(CEO_MODES.aggressive.qualityPassThreshold > CEO_MODES.musk_mode.qualityPassThreshold);
});

test('aggressive is the default and matches the historical hardcoded values', () => {
  assert.equal(DEFAULT_CEO_MODE, 'aggressive');
  assert.equal(CEO_MODES.aggressive.escalationThreshold, 7);
  assert.equal(CEO_MODES.aggressive.qualityPassThreshold, 0.8);
});

test('resolveCeoMode falls back to the default for unset or unrecognized ids', () => {
  assert.equal(resolveCeoMode(undefined).id, 'aggressive');
  assert.equal(resolveCeoMode('not_a_real_mode').id, 'aggressive');
  assert.equal(resolveCeoMode('musk_mode').id, 'musk_mode');
});
