const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAgentPrompt } = require('../sdk/PromptLoader');

const ROOT = path.resolve(__dirname, '..');

test('runtime prompt loader consumes the CLO legal and dispute-bridge operating contract', () => {
  const prompt = loadAgentPrompt({
    root: ROOT,
    config: {
      agentName: 'Example Executive Agent',
      principalName: 'Example Principal',
      businessContext: 'an example organization',
    },
    agent: {
      id: 'clo_agent',
      name: 'Example Legal Agent',
      title: 'Chief Legal Officer',
    },
  });

  assert.match(prompt, /Example Legal Agent/);
  assert.match(prompt, /Example Executive Agent/);
  assert.match(prompt, /Example Principal/);
  assert.match(prompt, /an example organization/);
  assert.doesNotMatch(prompt, /\{\{(?:AGENT_NAME|CEO_AGENT_NAME|PRINCIPAL_NAME|BUSINESS_CONTEXT)\}\}/);

  assert.match(prompt, /core\/frameworks\/catalog\.js/);
  // Legal-domain frameworks referenced by id.
  assert.match(prompt, /irac_legal_analysis/);
  assert.match(prompt, /regulatory_compliance_mapping/);
  assert.match(prompt, /contract_risk_allocation/);
  assert.match(prompt, /enterprise_risk_management/);
  assert.match(prompt, /legal_hold_and_privilege/);
  assert.match(prompt, /regulatory_horizon_scanning/);

  // Legal information, not licensed advice.
  assert.match(prompt, /not licensed legal advice/i);

  // Type 1 / Type 2 scoped to legal reversibility.
  assert.match(prompt, /internal policy[\s\S]*Type 2/i);
  assert.match(prompt, /external contract[\s\S]*Type 1/i);

  // decision_memo as ADR-style record for Type 1 legal decisions.
  assert.match(prompt, /Architecture Decision Record/);
  assert.match(prompt, /decision_memo[\s\S]*options[\s\S]*recommendation[\s\S]*rationale[\s\S]*risks/);
  assert.match(prompt, /insight → implication → recommendation/);
  assert.match(prompt, /escalation_assessment[\s\S]*assessment\.escalate/);

  // Lean skill set: priority_scoring held; budget_token_allocation and
  // task_decomposition and department_capability_lookup NOT held.
  assert.match(prompt, /priority_scoring[\s\S]*rankedItems/);
  assert.match(prompt, /not assigned[\s\S]*budget_token_allocation/);
  assert.match(prompt, /not currently assigned[\s\S]*task_decomposition/);
  assert.match(prompt, /department_capability_lookup[\s\S]*read-only/);
  assert.match(prompt, /not currently assigned this skill/);

  // quality_review gaps preserved verbatim.
  assert.match(prompt, /review\.artifact/);
  assert.match(prompt, /review\.score/);
  assert.match(prompt, /review\.passed/);
  assert.match(prompt, /review\.gaps[\s\S]*verbatim/);

  // Dispute Agent bridge documented at its real current wiring.
  assert.match(prompt, /examples\/dispute-agent\//);
  assert.match(prompt, /WorkflowRuntime executor/);
  assert.match(prompt, /x-dispute-secret/);
  assert.match(prompt, /Only `triggered`/);
  assert.match(prompt, /`blocked`, `queued`, and `failed` are not completed execution/);

  // No decorative mechanisms.
  assert.match(prompt, /no contract-repository system, compliance-tracking dashboard, or litigation-management engine/);
  assert.match(prompt, /never present a decorative mechanism/);

  // Human-accountability boundary.
  assert.match(prompt, /without authorized human review/);
  assert.match(prompt, /Never claim to be licensed counsel/);
  assert.match(prompt, /State the gap; do not guess/);
});
