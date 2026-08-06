const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAgentPrompt } = require('../sdk/PromptLoader');

const ROOT = path.resolve(__dirname, '..');

test('runtime prompt loader consumes the CHRO people and organization operating contract', () => {
  const prompt = loadAgentPrompt({
    root: ROOT,
    config: {
      agentName: 'Example Executive Agent',
      principalName: 'Example Principal',
      businessContext: 'an example organization',
    },
    agent: {
      id: 'chro_agent',
      name: 'Example People Agent',
      title: 'Chief People Officer',
    },
  });

  assert.match(prompt, /Example People Agent/);
  assert.match(prompt, /Example Executive Agent/);
  assert.match(prompt, /Example Principal/);
  assert.match(prompt, /an example organization/);
  assert.doesNotMatch(prompt, /\{\{(?:AGENT_NAME|CEO_AGENT_NAME|PRINCIPAL_NAME|BUSINESS_CONTEXT)\}\}/);

  assert.match(prompt, /core\/frameworks\/catalog\.js/);
  // People-domain frameworks are referenced by id.
  assert.match(prompt, /galbraiths_star_model/);
  assert.match(prompt, /spans_and_layers/);
  assert.match(prompt, /competing_values_framework/);
  assert.match(prompt, /scarf_model/);
  assert.match(prompt, /kotters_8_step/);
  assert.match(prompt, /adkar_model/);
  assert.match(prompt, /skill_will_matrix/);
  assert.match(prompt, /nine_box_grid/);
  assert.match(prompt, /employee_experience_equation/);
  assert.match(prompt, /worldatwork_total_rewards/);
  assert.match(prompt, /lamp_framework/);

  // Systemic-before-individual diagnostic posture.
  assert.match(prompt, /system before the individual/i);

  // decision_memo shape and business-outcome linkage.
  assert.match(prompt, /decision_memo[\s\S]*options[\s\S]*recommendation[\s\S]*rationale[\s\S]*risks/);
  assert.match(prompt, /insight → implication → recommendation/);
  assert.match(prompt, /business outcome/);

  // priority_scoring for shared-pool competition; CHRO holds no budget authority.
  assert.match(prompt, /priority_scoring[\s\S]*rankedItems/);
  assert.match(prompt, /not assigned[\s\S]*budget_token_allocation/);
  assert.match(prompt, /shared cross-department pool/);

  // workload_balancing IS held — real capacity output shape.
  assert.match(prompt, /workload_balancing[\s\S]*workloads[\s\S]*recommendations/);
  assert.match(prompt, /utilization/);

  // department_capability_lookup IS held (unlike CMO): run directly, read-only.
  assert.match(prompt, /department_capability_lookup[\s\S]*read-only/);
  assert.match(prompt, /one of the authorized roles other heads request a lookup from/);

  // task_decomposition is NOT held — request or escalate, do not claim to run it.
  assert.match(prompt, /not currently assigned[\s\S]*task_decomposition/);
  assert.match(prompt, /Do not present yourself as running `task_decomposition`/);

  // quality_review gaps preserved verbatim.
  assert.match(prompt, /review\.artifact/);
  assert.match(prompt, /review\.score/);
  assert.match(prompt, /review\.passed/);
  assert.match(prompt, /review\.gaps[\s\S]*verbatim/);

  // No decorative mechanisms without a real runtime hook.
  assert.match(prompt, /9-box/);
  assert.match(prompt, /never present a decorative mechanism/);

  // Human accountability and honesty boundaries.
  assert.match(prompt, /without authorized human review/);
  assert.match(prompt, /State the gap; do not guess/);
  // Issue #86(a): the actual sentence PR #90 added, not just that the
  // Type 1/Type 2 framework is mentioned somewhere.
  assert.match(prompt, /Apply this classification internally to decide how to act; state the resulting decision, action, or escalation directly rather than narrating the classification process to the user\./);
  // Issue #86(b), reframed: real guidance for an unclear/unrecognized
  // request, not a generic non-committal disclaimer.
  assert.match(prompt, /ask one targeted clarifying question naming what's missing, or state plainly what you would need to proceed/);
});
