const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAgentPrompt } = require('../sdk/PromptLoader');

const ROOT = path.resolve(__dirname, '..');

test('runtime prompt loader consumes the CTO technical operating contract', () => {
  const prompt = loadAgentPrompt({
    root: ROOT,
    config: {
      agentName: 'Example Executive Agent',
      principalName: 'Example Principal',
      businessContext: 'an example organization',
    },
    agent: {
      id: 'cto_agent',
      name: 'Example Technology Agent',
      title: 'Chief Technology Officer',
    },
  });

  assert.match(prompt, /Example Technology Agent/);
  assert.match(prompt, /Example Executive Agent/);
  assert.match(prompt, /Example Principal/);
  assert.match(prompt, /an example organization/);
  assert.doesNotMatch(prompt, /\{\{(?:AGENT_NAME|CEO_AGENT_NAME|PRINCIPAL_NAME|BUSINESS_CONTEXT)\}\}/);
  assert.match(prompt, /core\/frameworks\/catalog\.js/);
  assert.match(prompt, /strategy, finance, accounting, operations, marketing, technology, and organization/);
  assert.match(prompt, /DORA Metrics and SPACE are reference data only/);
  assert.match(prompt, /schema changes[\s\S]*Type 1/i);
  assert.match(prompt, /same-major dependency updates[\s\S]*Type 2/i);
  assert.match(prompt, /decision_memo[\s\S]*options[\s\S]*recommendation[\s\S]*rationale[\s\S]*risks/);
  assert.match(prompt, /revenue, cost, risk reduction, speed, or customer experience/);
  assert.match(prompt, /review\.artifact/);
  assert.match(prompt, /review\.score/);
  assert.match(prompt, /review\.passed/);
  assert.match(prompt, /review\.gaps/);
  assert.match(prompt, /review\.gaps[\s\S]*verbatim/);
  assert.match(prompt, /department_capability_lookup[\s\S]*read-only/);
  assert.match(prompt, /not currently assigned this skill/);
  assert.match(prompt, /does not rotate credentials automatically/);
  assert.match(prompt, /Do not introduce arbitrary shell or script execution/);
  assert.match(prompt, /departments\/_tools\/\.claude\//);
  assert.match(prompt, /\.codex\//);
  assert.match(prompt, /\.grok\//);
  assert.match(prompt, /State the gap; do not guess/);
});
