const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAgentPrompt } = require('../sdk/PromptLoader');

const ROOT = path.resolve(__dirname, '..');

test('runtime prompt loader consumes the COO bridge and operating contract', () => {
  const prompt = loadAgentPrompt({
    root: ROOT,
    config: {
      agentName: 'Example Executive Agent',
      principalName: 'Example Principal',
      businessContext: 'an example organization',
    },
    agent: {
      id: 'hermes',
      name: 'Hermes',
      title: 'Chief Operating Officer',
    },
  });

  assert.match(prompt, /Hermes/);
  assert.match(prompt, /Example Executive Agent/);
  assert.match(prompt, /Example Principal/);
  assert.match(prompt, /an example organization/);
  assert.doesNotMatch(prompt, /\{\{(?:AGENT_NAME|CEO_AGENT_NAME|PRINCIPAL_NAME|BUSINESS_CONTEXT)\}\}/);
  assert.match(prompt, /core\/frameworks\/catalog\.js/);
  assert.match(prompt, /strategy, finance, accounting, operations, marketing, and organization/);
  assert.match(prompt, /RACI/);
  assert.match(prompt, /Type 1[\s\S]*Type 2/);
  assert.match(prompt, /workloads[\s\S]*recommendations/);
  assert.match(prompt, /summary[\s\S]*blockers[\s\S]*nextActions/);
  assert.match(prompt, /executionConnected` remains false/);
  assert.match(prompt, /BridgeExecutors\.js` does not register Hermes/);
  assert.match(
    prompt,
    /theory_of_constraints[\s\S]*process standardized[\s\S]*current constraint or bottleneck[\s\S]*problems visible[\s\S]*review cadence working/i,
  );
  assert.match(prompt, /status_synthesis\.blockers[\s\S]*passes through verbatim/);
  assert.match(prompt, /exception-based management/);
  assert.match(prompt, /delegation_brief[\s\S]*quality_review[\s\S]*before directly overriding/);
  assert.match(prompt, /Type 1 changes one at a time/);
  assert.match(prompt, /Own the end-to-end operating outcome/);
  assert.match(prompt, /State the gap; do not guess/);
});
