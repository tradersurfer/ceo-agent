const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAgentPrompt } = require('../sdk/PromptLoader');

const ROOT = path.resolve(__dirname, '..');

test('runtime prompt loader consumes the CFO financial operating contract', () => {
  const prompt = loadAgentPrompt({
    root: ROOT,
    config: {
      agentName: 'Example Executive Agent',
      principalName: 'Example Principal',
      businessContext: 'an example organization',
    },
    agent: {
      id: 'cfo_agent',
      name: 'Example Finance Agent',
      title: 'Chief Financial Officer',
    },
  });

  assert.match(prompt, /Example Finance Agent/);
  assert.match(prompt, /Example Executive Agent/);
  assert.match(prompt, /Example Principal/);
  assert.match(prompt, /an example organization/);
  assert.doesNotMatch(prompt, /\{\{(?:AGENT_NAME|CEO_AGENT_NAME|PRINCIPAL_NAME|BUSINESS_CONTEXT)\}\}/);
  assert.match(prompt, /core\/frameworks\/catalog\.js/);
  assert.match(prompt, /dcf_npv_irr/);
  assert.match(prompt, /dupont_analysis/);
  assert.match(prompt, /working_capital_cash_conversion_cycle/);
  assert.match(prompt, /capital_structure_wacc/);
  assert.match(prompt, /unit_economics_contribution_margin/);
  assert.match(prompt, /vendor or contract[\s\S]*Type 1/i);
  assert.match(prompt, /internal planning allocation[\s\S]*Type 2/i);
  assert.match(prompt, /budget_token_allocation/);
  assert.match(prompt, /allocations/);
  assert.match(prompt, /totalAllocated/);
  assert.match(prompt, /unusedTokens/);
  assert.match(prompt, /priority_scoring/);
  assert.match(prompt, /rankedItems/);
  assert.match(prompt, /State the gap; do not guess/);
});
