/**
 * Registers CEO Agent scaffold skills onto a SkillRegistry.
 *
 * These are structural stubs — they define the schema and return a
 * scaffold-compliant placeholder. They are registered with
 * `disableModelInvocation: true` so they can only be called via explicit
 * user commands (/name or @name), never by a model deciding to call them
 * autonomously. Each handler returns a `{ scaffolded: true }` envelope so
 * callers can distinguish a stub from a real implementation.
 *
 * Capabilities covered:
 *   cross_subsidiary_coordination, joint_venture_oversight,
 *   portfolio_resource_allocation, autonomous_framework_governance
 *
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerCeoSkills(registry) {
  const SCAFFOLD_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

  const scaffoldHandler = (skillName) => async (input) => ({
    scaffolded: true,
    skill: skillName,
    input,
    note: 'Scaffold stub — no logic implemented. See docs/BACKLOG-skill-expansion.md for implementation roadmap.',
  });

  registry.register('subsidiary_health_check', {
    capability: 'cross_subsidiary_coordination',
    description: 'Pulls synthesized metrics from different corporate entities to diagnose subsidiary health.',
    disableModelInvocation: true,
    inputSchema: {
      subsidiaryIds: { type: 'array', required: true },
      metrics: { type: 'array', required: false },
    },
    outputSchema: {
      healthReport: { type: 'object', required: true },
      flags: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('subsidiary_health_check'),
  });

  registry.register('partnership_transition_planning', {
    capability: 'joint_venture_oversight',
    description: 'Structures and executes operational takeover proposals or transition plans for external enterprises.',
    disableModelInvocation: true,
    inputSchema: {
      partnerName: { type: 'string', required: true },
      transitionType: { type: 'string', required: true },
      timeline: { type: 'string', required: false },
      constraints: { type: 'array', required: false },
    },
    outputSchema: {
      transitionPlan: { type: 'object', required: true },
      milestones: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('partnership_transition_planning'),
  });

  registry.register('multi_agent_consensus_evaluation', {
    capability: 'autonomous_framework_governance',
    description: 'Reviews risk moats and consensus logic of lower-level AI trading systems or external models before approving outputs.',
    disableModelInvocation: true,
    inputSchema: {
      frameworkId: { type: 'string', required: true },
      consensusLogic: { type: 'object', required: true },
      riskThreshold: { type: 'number', required: false },
    },
    outputSchema: {
      evaluation: { type: 'object', required: true },
      recommendation: { type: 'string', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('multi_agent_consensus_evaluation'),
  });

  registry.register('resource_reallocation_directive', {
    capability: 'portfolio_resource_allocation',
    description: 'Generates formal, structured mandates for the CFO and CTO to shift assets or development bandwidth into new strategic sectors.',
    disableModelInvocation: true,
    inputSchema: {
      fromSector: { type: 'string', required: true },
      toSector: { type: 'string', required: true },
      rationale: { type: 'string', required: true },
      targetAgent: { type: 'string', required: false },
    },
    outputSchema: {
      directive: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('resource_reallocation_directive'),
  });

  registry.register('launch_roadmap_orchestration', {
    capability: 'portfolio_resource_allocation',
    description: 'Constructs and governs detailed 90-to-180-day master launch schedules with timed task blocks and milestones.',
    disableModelInvocation: true,
    inputSchema: {
      projectName: { type: 'string', required: true },
      durationDays: { type: 'number', required: false },
      milestones: { type: 'array', required: false },
    },
    outputSchema: {
      roadmap: { type: 'object', required: true },
      phases: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('launch_roadmap_orchestration'),
  });
}

module.exports = { registerCeoSkills };
