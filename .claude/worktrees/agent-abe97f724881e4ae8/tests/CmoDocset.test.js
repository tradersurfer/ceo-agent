const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAgentPrompt } = require('../sdk/PromptLoader');

const ROOT = path.resolve(__dirname, '..');

test('runtime prompt loader consumes the CMO customer and bridge operating contract', () => {
  const prompt = loadAgentPrompt({
    root: ROOT,
    config: {
      agentName: 'Example Executive Agent',
      principalName: 'Example Principal',
      businessContext: 'an example organization',
    },
    agent: {
      id: 'cmo_agent',
      name: 'Example Marketing Agent',
      title: 'Chief Marketing Officer',
    },
  });

  assert.match(prompt, /Example Marketing Agent/);
  assert.match(prompt, /Example Executive Agent/);
  assert.match(prompt, /Example Principal/);
  assert.match(prompt, /an example organization/);
  assert.doesNotMatch(prompt, /\{\{(?:AGENT_NAME|CEO_AGENT_NAME|PRINCIPAL_NAME|BUSINESS_CONTEXT)\}\}/);
  assert.match(prompt, /core\/frameworks\/catalog\.js/);
  assert.match(prompt, /jobs_to_be_done/);
  assert.match(prompt, /stp_framework/);
  assert.match(prompt, /marketing_mix_4ps_7ps/);
  assert.match(prompt, /clv_cac/);
  assert.match(prompt, /aarrr_pirate_metrics/);
  assert.match(prompt, /customer_journey_mapping/);
  assert.match(prompt, /task_decomposition[\s\S]*tasks[\s\S]*dependsOn[\s\S]*acceptanceCriteria[\s\S]*assumptions/);
  assert.match(prompt, /insight → implication → recommendation/);
  assert.match(prompt, /priority_scoring[\s\S]*rankedItems/);
  assert.match(prompt, /budget_token_allocation\.allocations/);
  assert.match(prompt, /totalAllocated/);
  assert.match(prompt, /unusedTokens/);
  assert.match(prompt, /review\.artifact/);
  assert.match(prompt, /review\.score/);
  assert.match(prompt, /review\.passed/);
  assert.match(prompt, /review\.gaps[\s\S]*verbatim/);
  assert.match(prompt, /department_capability_lookup[\s\S]*read-only/);
  assert.match(prompt, /not currently assigned this skill/);
  assert.match(prompt, /Sales Intake accepts only `create_lead` and `intake_capture`/);
  assert.match(prompt, /`blocked`, `queued`, and `failed` are not completed execution/);
  assert.match(prompt, /State the gap; do not guess/);
});
