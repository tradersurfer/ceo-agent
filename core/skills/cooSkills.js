/**
 * Registers COO/Hermes scaffold skills onto a SkillRegistry.
 *
 * These are structural stubs — see core/skills/ceoSkills.js for the full
 * scaffold documentation. All handlers return `{ scaffolded: true }`.
 *
 * Capabilities covered:
 *   api_webhook_orchestration, cross_platform_backend_sync
 *
 * NOTE: docker_sandbox_management, database_script_execution, and
 * shell_script_automation are EXCLUDED — they conflict with ADR-001a which
 * settled that CEO Agent talks to Hermes as an HTTP client of the gateway's
 * task-submission API and never spawns processes, manages containers, or
 * executes shell/DB commands itself. See docs/BACKLOG-skill-expansion.md
 * and docs/adr/ADR-001a-hermes-gateway-client-model.md for details.
 *
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerCooSkills(registry) {
  const SCAFFOLD_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

  const scaffoldHandler = (skillName) => async (input) => ({
    scaffolded: true,
    skill: skillName,
    input,
    note: 'Scaffold stub — no logic implemented. See docs/BACKLOG-skill-expansion.md for implementation roadmap.',
  });

  registry.register('payment_gateway_sync', {
    capability: 'api_webhook_orchestration',
    description: 'Handles the operational side of revenue — processing Stripe API webhooks, verifying transaction statuses, and triggering subsequent access or CRM updates.',
    disableModelInvocation: true,
    inputSchema: {
      webhookEvent: { type: 'object', required: true },
      provider: { type: 'string', required: false },
    },
    outputSchema: {
      transactionStatus: { type: 'string', required: true },
      actions: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('payment_gateway_sync'),
  });

  registry.register('webhook_payload_parsing', {
    capability: 'api_webhook_orchestration',
    description: 'Intercepts incoming data arrays, extracts critical operational variables, and routes them to the correct department.',
    disableModelInvocation: true,
    inputSchema: {
      payload: { type: 'object', required: true },
      source: { type: 'string', required: false },
    },
    outputSchema: {
      parsed: { type: 'object', required: true },
      routedTo: { type: 'string', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('webhook_payload_parsing'),
  });
}

module.exports = { registerCooSkills };
