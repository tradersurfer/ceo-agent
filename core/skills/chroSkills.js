/**
 * Registers CHRO Agent scaffold skills onto a SkillRegistry.
 *
 * These are structural stubs — see core/skills/ceoSkills.js for the full
 * scaffold documentation. All handlers return `{ scaffolded: true }`.
 *
 * Capabilities covered:
 *   organizational_design, talent_density_management,
 *   performance_and_rewards_strategy, change_management_orchestration,
 *   people_analytics_synthesis, culture_and_employee_experience
 *
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerChroSkills(registry) {
  const SCAFFOLD_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

  const scaffoldHandler = (skillName) => async (input) => ({
    scaffolded: true,
    skill: skillName,
    input,
    note: 'Scaffold stub — no logic implemented. See docs/BACKLOG-skill-expansion.md for implementation roadmap.',
  });

  registry.register('spans_and_layers_analysis', {
    capability: 'organizational_design',
    description: 'Audits the organizational chart, identifying middle-management bloat or stretched managers.',
    disableModelInvocation: true,
    inputSchema: {
      orgChart: { type: 'object', required: true },
      maxSpan: { type: 'number', required: false },
    },
    outputSchema: {
      analysis: { type: 'object', required: true },
      recommendations: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('spans_and_layers_analysis'),
  });

  registry.register('nine_box_talent_mapping', {
    capability: 'talent_density_management',
    description: 'Evaluates personnel on a grid of performance versus potential to generate succession plans.',
    disableModelInvocation: true,
    inputSchema: {
      employees: { type: 'array', required: true },
      performanceScale: { type: 'string', required: false },
    },
    outputSchema: {
      grid: { type: 'array', required: true },
      successionPlan: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('nine_box_talent_mapping'),
  });

  registry.register('compensation_equity_audit', {
    capability: 'performance_and_rewards_strategy',
    description: 'Scans payroll and market data to identify pay disparities, flight risks, or misalignment with rewards philosophy.',
    disableModelInvocation: true,
    inputSchema: {
      payrollData: { type: 'array', required: true },
      marketBenchmarks: { type: 'object', required: false },
    },
    outputSchema: {
      disparities: { type: 'array', required: true },
      flightRisks: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('compensation_equity_audit'),
  });

  registry.register('adkar_readiness_assessment', {
    capability: 'change_management_orchestration',
    description: 'Diagnoses where a team is stuck during a major change and recommends targeted interventions (Awareness, Desire, Knowledge, Ability, Reinforcement).',
    disableModelInvocation: true,
    inputSchema: {
      changeInitiative: { type: 'string', required: true },
      teamData: { type: 'object', required: true },
    },
    outputSchema: {
      adkarScores: { type: 'object', required: true },
      interventions: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('adkar_readiness_assessment'),
  });

  registry.register('okr_alignment_review', {
    capability: 'organizational_design',
    description: 'Audits departmental objectives to ensure goals cascade logically from overarching targets.',
    disableModelInvocation: true,
    inputSchema: {
      okrs: { type: 'array', required: true },
      topLevelObjective: { type: 'string', required: false },
    },
    outputSchema: {
      alignmentReport: { type: 'object', required: true },
      misalignments: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('okr_alignment_review'),
  });

  registry.register('interview_rubric_generation', {
    capability: 'talent_density_management',
    description: 'Dynamically generates structured, behavioral interview questions tailored to specific role capabilities.',
    disableModelInvocation: true,
    inputSchema: {
      roleTitle: { type: 'string', required: true },
      capabilities: { type: 'array', required: true },
      seniority: { type: 'string', required: false },
    },
    outputSchema: {
      rubric: { type: 'object', required: true },
      questions: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('interview_rubric_generation'),
  });

  registry.register('scarf_threat_assessment', {
    capability: 'change_management_orchestration',
    description: 'Predicts and mitigates employee backlash regarding Status, Certainty, Autonomy, Relatedness, or Fairness before communications are sent.',
    disableModelInvocation: true,
    inputSchema: {
      communication: { type: 'string', required: true },
      audience: { type: 'object', required: false },
    },
    outputSchema: {
      threatScores: { type: 'object', required: true },
      mitigations: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('scarf_threat_assessment'),
  });
}

module.exports = { registerChroSkills };
