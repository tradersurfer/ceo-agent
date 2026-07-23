const { test } = require('node:test');
const assert = require('node:assert');
const { slugifyAgentId, validateCustomAgentInput, buildCustomAgentEntry } = require('../lib/customAgents');
const { loadAgentPrompt } = require('../sdk/PromptLoader');

test('slugifyAgentId normalizes names to safe ids', () => {
  assert.strictEqual(slugifyAgentId('Growth Lead'), 'growth_lead');
  assert.strictEqual(slugifyAgentId('  VP, Partnerships!  '), 'vp_partnerships');
});

test('validateCustomAgentInput rejects an unknown department', () => {
  const r = validateCustomAgentInput({ name: 'X', title: 'Y', description: 'Z', department: 'space' });
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('department')));
});

test('validateCustomAgentInput rejects a duplicate id', () => {
  const r = validateCustomAgentInput({ name: 'CMO Agent', title: 'X', description: 'Z', department: 'marketing' }, ['cmo_agent']);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('already exists')));
});

test('validateCustomAgentInput accepts a valid agent', () => {
  const r = validateCustomAgentInput({ name: 'Growth Lead', title: 'Head of Growth', description: 'You own growth experiments.', department: 'marketing' }, ['cmo_agent']);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.id, 'growth_lead');
});

test('buildCustomAgentEntry produces a routable inline-prompt agent', () => {
  const v = validateCustomAgentInput({ name: 'Growth Lead', title: 'Head of Growth', description: 'You own growth experiments.', department: 'marketing' }, []);
  const entry = buildCustomAgentEntry(v);
  assert.strictEqual(entry.custom, true);
  assert.strictEqual(entry.lane, 'marketing');
  assert.strictEqual(entry.department, 'marketing');
  assert.strictEqual(entry.reports_to, 'cmo_agent');
  assert.ok(typeof entry.prompt === 'string' && entry.prompt.includes('Growth Lead'));
});

test('loadAgentPrompt uses the inline prompt for a custom agent with no file read', () => {
  const v = validateCustomAgentInput({ name: 'Growth Lead', title: 'Head of Growth', description: 'You own growth experiments.', department: 'marketing' }, []);
  const entry = buildCustomAgentEntry(v);
  const prompt = loadAgentPrompt({ root: '/nonexistent-root', config: { agentName: 'Chief' }, agent: entry });
  assert.ok(prompt.includes('Growth Lead'));
  assert.ok(prompt.includes('Head of Growth'));
});
