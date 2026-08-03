/**
 * Registers CMO Agent scaffold skills onto a SkillRegistry.
 *
 * These are structural stubs — see core/skills/ceoSkills.js for the full
 * scaffold documentation. All handlers return `{ scaffolded: true }`.
 *
 * Capabilities covered:
 *   social_media_automation, seo_and_local_directory_optimization,
 *   brand_identity_architecture, community_engagement_strategy,
 *   campaign_performance_analytics
 *
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerCmoSkills(registry) {
  const SCAFFOLD_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

  const scaffoldHandler = (skillName) => async (input) => ({
    scaffolded: true,
    skill: skillName,
    input,
    note: 'Scaffold stub — no logic implemented. See docs/BACKLOG-skill-expansion.md for implementation roadmap.',
  });

  registry.register('social_post_architect_prompting', {
    capability: 'social_media_automation',
    description: 'Engineers highly precise system prompts that govern how lower-level bots generate daily platform content.',
    disableModelInvocation: true,
    inputSchema: {
      platform: { type: 'string', required: true },
      brandVoice: { type: 'string', required: false },
      postingFrequency: { type: 'string', required: false },
    },
    outputSchema: {
      systemPrompt: { type: 'string', required: true },
      contentGuidelines: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('social_post_architect_prompting'),
  });

  registry.register('local_keyword_campaign_builder', {
    capability: 'seo_and_local_directory_optimization',
    description: 'Constructs targeted search engine optimization strategies to capture regional commercial intent.',
    disableModelInvocation: true,
    inputSchema: {
      businessType: { type: 'string', required: true },
      location: { type: 'string', required: true },
      targetKeywords: { type: 'array', required: false },
    },
    outputSchema: {
      campaign: { type: 'object', required: true },
      keywordClusters: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('local_keyword_campaign_builder'),
  });

  registry.register('brand_guideline_generation', {
    capability: 'brand_identity_architecture',
    description: 'Generates full digital starter packages, including exact typography rules and color palettes.',
    disableModelInvocation: true,
    inputSchema: {
      brandName: { type: 'string', required: true },
      industry: { type: 'string', required: false },
      preferences: { type: 'object', required: false },
    },
    outputSchema: {
      guidelines: { type: 'object', required: true },
      colorPalette: { type: 'array', required: true },
      typography: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('brand_guideline_generation'),
  });

  registry.register('ai_brand_training_manual_creation', {
    capability: 'brand_identity_architecture',
    description: 'Compiles historical metrics, backgrounds, and product profiles into comprehensive training manuals for AI customer service agents.',
    disableModelInvocation: true,
    inputSchema: {
      brandProfile: { type: 'object', required: true },
      productCatalog: { type: 'array', required: false },
      historicalData: { type: 'object', required: false },
    },
    outputSchema: {
      trainingManual: { type: 'object', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('ai_brand_training_manual_creation'),
  });

  registry.register('visual_layout_review', {
    capability: 'brand_identity_architecture',
    description: 'Audits graphics, ensuring text strings are placed correctly, logos are positioned, and unnecessary buttons are stripped.',
    disableModelInvocation: true,
    inputSchema: {
      imageUrl: { type: 'string', required: false },
      layoutSpec: { type: 'object', required: false },
    },
    outputSchema: {
      review: { type: 'object', required: true },
      issues: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('visual_layout_review'),
  });

  registry.register('public_vs_internal_copy_separation', {
    capability: 'social_media_automation',
    description: 'Strips out internal business strategy notes or operational constraints before content is published to public-facing channels.',
    disableModelInvocation: true,
    inputSchema: {
      content: { type: 'string', required: true },
      internalMarkers: { type: 'array', required: false },
    },
    outputSchema: {
      publicCopy: { type: 'string', required: true },
      internalNotes: { type: 'array', required: true },
    },
    permissions: SCAFFOLD_PERMISSION,
    handler: scaffoldHandler('public_vs_internal_copy_separation'),
  });
}

module.exports = { registerCmoSkills };
