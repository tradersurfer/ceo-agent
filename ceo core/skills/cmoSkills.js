/** CMO skills — real brand/SEO/copy handlers. visual_layout_review needs layoutSpec (no vision call). */
function registerCmoSkills(registry) {
  const PERMISSION = Object.freeze({ requiresAgentAssignment: true });

  registry.register('social_post_architect_prompting', {
    capability: 'social_media_automation',
    description: 'Engineers highly precise system prompts that govern how lower-level bots generate daily platform content.',
    disableModelInvocation: true,
    inputSchema: { platform: { type: 'string', required: true }, brandVoice: { type: 'string', required: false }, postingFrequency: { type: 'string', required: false } },
    outputSchema: { systemPrompt: { type: 'string', required: true }, contentGuidelines: { type: 'object', required: true } },
    permissions: PERMISSION,
    handler: async ({ platform, brandVoice = 'clear, credible, operator-friendly', postingFrequency = 'daily' }) => {
      const p = String(platform).toLowerCase();
      const limits = { x: { maxChars: 280, hashtags: 2 }, twitter: { maxChars: 280, hashtags: 2 }, linkedin: { maxChars: 1300, hashtags: 3 }, instagram: { maxChars: 2200, hashtags: 8 }, tiktok: { maxChars: 300, hashtags: 4 }, facebook: { maxChars: 500, hashtags: 3 } };
      const rule = limits[p] || { maxChars: 500, hashtags: 3 };
      const systemPrompt = 'You write ' + p + ' posts for this brand. Voice: ' + brandVoice + '. Cadence: ' + postingFrequency + '. Hard limit: ' + rule.maxChars + ' characters. Lead with the strongest fact. No hype clichés. No fabricated metrics.';
      return { systemPrompt, contentGuidelines: { platform: p, maxChars: rule.maxChars, maxHashtags: rule.hashtags, postingFrequency: String(postingFrequency), brandVoice: String(brandVoice), bannedPhrases: ['WHAT A TIME TO BE ALIVE', "IT'S HAPPENING", 'game-changer', 'synergy'] } };
    },
  });

  registry.register('local_keyword_campaign_builder', {
    capability: 'seo_and_local_directory_optimization',
    description: 'Constructs targeted search engine optimization strategies to capture regional commercial intent.',
    disableModelInvocation: true,
    inputSchema: { businessType: { type: 'string', required: true }, location: { type: 'string', required: true }, targetKeywords: { type: 'array', required: false } },
    outputSchema: { campaign: { type: 'object', required: true }, keywordClusters: { type: 'array', required: true } },
    permissions: PERMISSION,
    handler: async ({ businessType, location, targetKeywords = [] }) => {
      const biz = String(businessType).trim();
      const loc = String(location).trim();
      const seed = targetKeywords.length ? targetKeywords.map(String) : [biz + ' near me', biz + ' in ' + loc, 'best ' + biz + ' ' + loc, loc + ' ' + biz + ' reviews'];
      const clusters = [
        { name: 'local_intent', keywords: [...new Set(seed.concat([biz + ' ' + loc]).map(k => k.toLowerCase()))] },
        { name: 'comparison', keywords: ['best ' + biz + ' ' + loc, 'top rated ' + biz + ' ' + loc].map(k => k.toLowerCase()) },
        { name: 'service_pages', keywords: [biz + ' pricing ' + loc, biz + ' appointment ' + loc].map(k => k.toLowerCase()) },
      ];
      return { campaign: { businessType: biz, location: loc, primaryKeyword: (biz + ' ' + loc).toLowerCase(), directoryTargets: ['Google Business Profile', 'Bing Places', 'Apple Business Connect'], contentPlan: ['Location landing page', 'FAQ with NAP consistency', 'Monthly review-response cadence'] }, keywordClusters: clusters };
    },
  });

  registry.register('brand_guideline_generation', {
    capability: 'brand_identity_architecture',
    description: 'Generates a starter brand guideline package: industry-aware color palette, typography defaults, and basic voice/do-not rules from brandName, industry, and optional preferences.',
    disableModelInvocation: true,
    inputSchema: { brandName: { type: 'string', required: true }, industry: { type: 'string', required: false }, preferences: { type: 'object', required: false } },
    outputSchema: { guidelines: { type: 'object', required: true }, colorPalette: { type: 'array', required: true }, typography: { type: 'object', required: true } },
    permissions: PERMISSION,
    handler: async ({ brandName, industry = 'general', preferences = {} }) => {
      const industryPalettes = {
        finance: ['#0B1F3A', '#1F6FEB', '#E8EEF7', '#111827', '#10B981'],
        cannabis: ['#1B4332', '#2D6A4F', '#D8F3DC', '#081C15', '#95D5B2'],
        tech: ['#0F172A', '#6366F1', '#EEF2FF', '#020617', '#22D3EE'],
        general: ['#111827', '#2563EB', '#F3F4F6', '#030712', '#F97316'],
      };
      const palette = preferences.colors || industryPalettes[String(industry).toLowerCase()] || industryPalettes.general;
      return {
        guidelines: { brandName: String(brandName), industry: String(industry), voice: preferences.voice || 'direct, competent, no hype', logoClearSpace: '0.5x logo height on all sides', doNot: ['stretch logo', 'use low-contrast text'] },
        colorPalette: palette.map((hex, i) => ({ role: ['primary', 'accent', 'surface', 'ink', 'highlight'][i] || ('swatch_' + (i + 1)), hex })),
        typography: (() => {
          const ind = String(industry).toLowerCase();
          const displayDefault = ind === 'finance' ? 'IBM Plex Sans' : ind === 'cannabis' ? 'Source Sans 3' : 'Inter';
          const bodyDefault = ind === 'finance' ? 'IBM Plex Sans' : 'Inter';
          return {
            display: preferences.displayFont || displayDefault,
            body: preferences.bodyFont || bodyDefault,
            mono: preferences.monoFont || 'JetBrains Mono',
            scale: { h1: '2.25rem', h2: '1.5rem', body: '1rem', small: '0.875rem' },
          };
        })(),
      };
    },
  });

  registry.register('ai_brand_training_manual_creation', {
    capability: 'brand_identity_architecture',
    description: 'Compiles historical metrics, backgrounds, and product profiles into comprehensive training manuals for AI customer service agents.',
    disableModelInvocation: true,
    inputSchema: { brandProfile: { type: 'object', required: true }, productCatalog: { type: 'array', required: false }, historicalData: { type: 'object', required: false } },
    outputSchema: { trainingManual: { type: 'object', required: true } },
    permissions: PERMISSION,
    handler: async ({ brandProfile = {}, productCatalog = [], historicalData = {} }) => {
      const products = productCatalog.map((p, i) => ({ id: p.id || ('product_' + (i + 1)), name: p.name || p.title || ('Product ' + (i + 1)), summary: p.summary || p.description || 'No description supplied.', price: p.price != null ? p.price : null }));
      return {
        trainingManual: {
          brand: { name: brandProfile.name || brandProfile.brandName || 'Brand', mission: brandProfile.mission || 'Not supplied', voice: brandProfile.voice || 'clear and helpful', bannedClaims: brandProfile.bannedClaims || [] },
          products,
          supportPolicy: { refundWindowDays: historicalData.refundWindowDays || 30, escalationEmail: historicalData.escalationEmail || null, tone: 'Solve first, then explain. Never invent policy.' },
          metricsContext: { csat: historicalData.csat != null ? historicalData.csat : null, topIssues: historicalData.topIssues || [] },
          agentRules: ['Only state facts present in this manual or live systems of record.', 'If unsure, say so and offer escalation.', 'Do not disclose internal notes or margin data.'],
        },
      };
    },
  });

  registry.register('visual_layout_review', {
    capability: 'brand_identity_architecture',
    description: 'Audits a structured layoutSpec (text contrast/overflow, logo bounds, redundant buttons). Does not analyze image pixels; imageUrl alone returns a spec_required limitation.',
    disableModelInvocation: true,
    inputSchema: { imageUrl: { type: 'string', required: false }, layoutSpec: { type: 'object', required: false } },
    outputSchema: { review: { type: 'object', required: true }, issues: { type: 'array', required: true } },
    permissions: PERMISSION,
    handler: async ({ imageUrl, layoutSpec }) => {
      if (!layoutSpec && imageUrl) {
        return { review: { mode: 'spec_required', imageUrl: String(imageUrl), note: 'Honest limitation: no vision model is called. Provide layoutSpec for a deterministic audit.' }, issues: [{ code: 'no_layout_spec', severity: 'info', detail: 'imageUrl alone is insufficient without layoutSpec.' }] };
      }
      const spec = layoutSpec || {};
      const texts = Array.isArray(spec.texts) ? spec.texts : [];
      const buttons = Array.isArray(spec.buttons) ? spec.buttons : [];
      const logo = spec.logo || null;
      const issues = [];
      for (const t of texts) {
        if (t.overflow === true || (t.box && t.content && String(t.content).length > 80 && !t.wrap)) issues.push({ code: 'text_overflow_risk', severity: 'medium', id: t.id || null });
        if (t.contrast === 'low') issues.push({ code: 'low_contrast_text', severity: 'high', id: t.id || null });
      }
      for (const b of buttons) { if (b.redundant || b.duplicateOf) issues.push({ code: 'redundant_button', severity: 'low', id: b.id || null }); }
      if (logo && (logo.x < 0 || logo.y < 0)) issues.push({ code: 'logo_out_of_bounds', severity: 'high' });
      if (!logo) issues.push({ code: 'logo_missing', severity: 'medium' });
      return { review: { mode: 'layout_spec', textCount: texts.length, buttonCount: buttons.length, hasLogo: Boolean(logo), issueCount: issues.length }, issues };
    },
  });

  registry.register('public_vs_internal_copy_separation', {
    capability: 'social_media_automation',
    description: 'Strips out internal business strategy notes or operational constraints before content is published to public-facing channels.',
    disableModelInvocation: true,
    inputSchema: { content: { type: 'string', required: true }, internalMarkers: { type: 'array', required: false } },
    outputSchema: { publicCopy: { type: 'string', required: true }, internalNotes: { type: 'array', required: true } },
    permissions: PERMISSION,
    handler: async ({ content, internalMarkers = [] }) => {
      const defaults = ['INTERNAL:', 'CONFIDENTIAL:', 'DO NOT PUBLISH', 'TODO:', 'FIXME:', '[internal]', '(internal)', 'for internal use only'];
      const markers = defaults.concat(internalMarkers.map(String));
      const lines = String(content).split(/\r?\n/);
      const publicLines = [];
      const internalNotes = [];
      for (const line of lines) {
        const hit = markers.find(m => line.toLowerCase().includes(String(m).toLowerCase()));
        if (hit) internalNotes.push({ marker: hit, line });
        else publicLines.push(line);
      }
      const publicCopy = publicLines.join('\n').replace(/\s*\[internal:[^\]]*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
      return { publicCopy, internalNotes };
    },
  });
}
module.exports = { registerCmoSkills };
