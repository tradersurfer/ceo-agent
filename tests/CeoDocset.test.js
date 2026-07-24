const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAgentPrompt } = require('../sdk/PromptLoader');

const ROOT = path.resolve(__dirname, '..');

test('runtime prompt loader consumes the expanded CEO behavioral contract', () => {
  const prompt = loadAgentPrompt({
    root: ROOT,
    config: {
      agentName: 'Example Executive Agent',
      principalName: 'Example Principal',
      businessContext: 'an example organization',
    },
    agent: {
      id: 'ceo_agent',
      name: 'CEO Agent',
      title: 'Chief Intelligence & Orchestration Agent',
    },
  });

  assert.match(prompt, /Example Executive Agent/);
  assert.match(prompt, /Example Principal/);
  assert.match(prompt, /an example organization/);
  assert.doesNotMatch(prompt, /\{\{(?:AGENT_NAME|PRINCIPAL_NAME|BUSINESS_CONTEXT)\}\}/);
  assert.match(prompt, /core\/frameworks\/catalog\.js/);
  assert.match(prompt, /strategy, finance, accounting, operations, marketing, and organization/);
  assert.match(prompt, /task_decomposition[\s\S]*MECE/);
  assert.match(prompt, /Type 1[\s\S]*Type 2/);
  assert.match(prompt, /assessment\.issue/);
  assert.match(prompt, /assessment\.score/);
  assert.match(prompt, /assessment\.escalate/);
  assert.match(prompt, /assessment\.reasons/);
  assert.match(prompt, /State the gap; do not guess/);
});
