/**
 * Registers CEO Agent skills onto a SkillRegistry.
 * Real deterministic handlers on structured input only (no live connectors).
 */
function registerCeoSkills(registry) {
  const PERMISSION = Object.freeze({ requiresAgentAssignment: true });
  const clamp = (v, min = 0, max = 100) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
  };

  registry.register('subsidiary_health_check', {
    capability: 'cross_subsidiary_coordination',
    description: 'Pulls synthesized metrics from different corporate entities to diagnose subsidiary health.',
    disableModelInvocation: true,
    inputSchema: { subsidiaryIds: { type: 'array', required: true }, metrics: { type: 'array', required: false } },
    outputSchema: { healthReport: { type: 'object', required: true }, flags: { type: 'array', required: true } },
    permissions: PERMISSION,
    handler: async ({ subsidiaryIds = [], metrics = [] }) => {
      const byId = new Map();
      for (const row of metrics) {
        const id = String(row.subsidiaryId || row.id || '');
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(row);
      }
      const subsidiaries = [];
      const flags = [];
      for (const rawId of subsidiaryIds) {
        const id = String(rawId);
        const rows = byId.get(id) || [];
        let revenue = 0, cost = 0, headcount = 0, nps = null, cashDays = null;
        for (const row of rows) {
          if (row.revenue != null) revenue += Number(row.revenue) || 0;
          if (row.cost != null) cost += Number(row.cost) || 0;
          if (row.headcount != null) headcount = Math.max(headcount, Number(row.headcount) || 0);
          if (row.nps != null) nps = Number(row.nps);
          if (row.cashRunwayDays != null) cashDays = Number(row.cashRunwayDays);
        }
        const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : (rows.length ? 0 : null);
        let score = 50;
        if (margin != null) score += clamp(margin, -30, 30) * 0.5;
        if (nps != null) score += clamp(nps, -100, 100) * 0.15;
        if (cashDays != null) score += cashDays < 30 ? -20 : cashDays < 90 ? -8 : 5;
        if (rows.length === 0) score = 25;
        score = clamp(Math.round(score));
        const status = score < 40 ? 'critical' : score < 60 ? 'watch' : 'healthy';
        if (rows.length === 0) flags.push({ subsidiaryId: id, code: 'missing_metrics', severity: 'high' });
        if (margin != null && margin < 0) flags.push({ subsidiaryId: id, code: 'negative_margin', severity: 'high', margin });
        if (cashDays != null && cashDays < 60) flags.push({ subsidiaryId: id, code: 'short_runway', severity: cashDays < 30 ? 'critical' : 'medium', cashRunwayDays: cashDays });
        if (nps != null && nps < 0) flags.push({ subsidiaryId: id, code: 'negative_nps', severity: 'medium', nps });
        subsidiaries.push({ subsidiaryId: id, score, status, metrics: { revenue, cost, margin: margin == null ? null : Math.round(margin * 10) / 10, headcount, nps, cashRunwayDays: cashDays, observationCount: rows.length } });
      }
      const averageScore = subsidiaries.length ? Math.round(subsidiaries.reduce((s, x) => s + x.score, 0) / subsidiaries.length) : 0;
      return { healthReport: { generatedAt: new Date().toISOString(), subsidiaryCount: subsidiaries.length, averageScore, subsidiaries }, flags };
    },
  });

  registry.register('partnership_transition_planning', {
    capability: 'joint_venture_oversight',
    description: 'Structures a typed operational transition plan (acquisition, joint venture, divestiture, outsourcing) with phased milestones and type-specific workstreams. Does not execute the transition.',
    disableModelInvocation: true,
    inputSchema: { partnerName: { type: 'string', required: true }, transitionType: { type: 'string', required: true }, timeline: { type: 'string', required: false }, constraints: { type: 'array', required: false } },
    outputSchema: { transitionPlan: { type: 'object', required: true }, milestones: { type: 'array', required: true } },
    permissions: PERMISSION,
    handler: async ({ partnerName, transitionType, timeline = '90_days', constraints = [] }) => {
      const type = String(transitionType).toLowerCase().replace(/[\s-]+/g, '_');
      const phasesByType = {
        acquisition: ['diligence', 'integration_planning', 'systems_cutover', 'culture_alignment', 'stabilization'],
        joint_venture: ['term_sheet', 'governance_setup', 'ops_handoff', 'kpi_baseline', 'first_review'],
        divestiture: ['scope_lock', 'buyer_enablement', 'data_separation', 'customer_comms', 'closeout'],
        outsourcing: ['scope_definition', 'vendor_onboarding', 'knowledge_transfer', 'sla_activation', 'hypercare'],
      };
      const phaseNames = phasesByType[type] || ['discovery', 'planning', 'execution', 'validation', 'closeout'];
      const dayBudget = /180/.test(timeline) ? 180 : /60/.test(timeline) ? 60 : /30/.test(timeline) ? 30 : 90;
      const slice = Math.max(5, Math.floor(dayBudget / phaseNames.length));
      const milestones = phaseNames.map((name, index) => ({
        id: 'm' + (index + 1), name, dayOffset: (index + 1) * slice,
        owner: index < 2 ? 'ceo_agent' : index < 4 ? 'coo_agent' : 'cfo_agent',
        exitCriteria: 'Phase "' + name + '" complete with signed checklist and no open P0 blockers.',
      }));
      return {
        transitionPlan: {
          partnerName: String(partnerName), transitionType: type, timelineDays: dayBudget,
          constraints: constraints.map(String),
          governance: { decisionForum: 'CEO + department heads weekly', escalationPath: ['department_head', 'ceo_agent', 'principal'], freezeWindowDays: Math.min(14, Math.floor(dayBudget / 6)) },
          workstreams: (function () {
            const byType = {
              acquisition: [
                { id: 'diligence', focus: 'Financial, legal, and operational diligence checklist' },
                { id: 'people', focus: 'Retention offers, org mapping, communications' },
                { id: 'systems', focus: 'Access cutover, data migration, integrations' },
                { id: 'customers', focus: 'Contract assignment and support continuity' },
                { id: 'finance', focus: 'Purchase accounting, billing cutover, cash controls' },
              ],
              joint_venture: [
                { id: 'governance', focus: 'Board seats, voting rights, deadlock rules' },
                { id: 'people', focus: 'JV staffing and secondments' },
                { id: 'systems', focus: 'Shared systems and data boundaries' },
                { id: 'finance', focus: 'Capital calls, P&L split, reporting' },
              ],
              divestiture: [
                { id: 'scope', focus: 'Asset and liability perimeter lock' },
                { id: 'people', focus: 'TUPE/transfer communications where applicable' },
                { id: 'systems', focus: 'Data separation and access revocation' },
                { id: 'customers', focus: 'Novation and support handoff' },
                { id: 'finance', focus: 'Purchase price mechanics and stranded costs' },
              ],
              outsourcing: [
                { id: 'scope', focus: 'SOW and SLA definition' },
                { id: 'vendor', focus: 'Vendor onboarding and security review' },
                { id: 'knowledge', focus: 'Knowledge transfer and runbooks' },
                { id: 'finance', focus: 'Invoice controls and chargeback model' },
              ],
            };
            return byType[type] || [
              { id: 'people', focus: 'Roles, retention, communications' },
              { id: 'systems', focus: 'Access, data, integrations' },
              { id: 'customers', focus: 'Contracts, support continuity' },
              { id: 'finance', focus: 'Cash, billing, reporting cutover' },
            ];
          })(),
        },
        milestones,
      };
    },
  });

  registry.register('multi_agent_consensus_evaluation', {
    capability: 'autonomous_framework_governance',
    description: 'Reviews risk moats and consensus logic of lower-level AI trading systems or external models before approving outputs.',
    disableModelInvocation: true,
    inputSchema: { frameworkId: { type: 'string', required: true }, consensusLogic: { type: 'object', required: true }, riskThreshold: { type: 'number', required: false } },
    outputSchema: { evaluation: { type: 'object', required: true }, recommendation: { type: 'string', required: true } },
    permissions: PERMISSION,
    handler: async ({ frameworkId, consensusLogic = {}, riskThreshold = 0.7 }) => {
      const threshold = clamp(Number(riskThreshold) || 0.7, 0, 1);
      const findings = [];
      let riskScore = 0;
      const minAgents = Number(consensusLogic.minAgents || consensusLogic.quorum || 0);
      const agreement = Number(consensusLogic.agreementThreshold || consensusLogic.agreement || 0);
      const hasVeto = Boolean(consensusLogic.humanVeto || consensusLogic.principalVeto);
      const hasKillSwitch = Boolean(consensusLogic.killSwitch || consensusLogic.circuitBreaker);
      const maxPosition = Number(consensusLogic.maxPositionPct || consensusLogic.maxExposurePct || 0);
      const models = Array.isArray(consensusLogic.models) ? consensusLogic.models : [];
      if (minAgents < 2) { findings.push({ code: 'weak_quorum', severity: 'high', detail: 'Fewer than 2 agents in consensus quorum.' }); riskScore += 0.25; }
      if (!(agreement > 0 && agreement <= 1)) { findings.push({ code: 'missing_agreement_threshold', severity: 'high', detail: 'Agreement threshold missing or invalid (expect 0-1).' }); riskScore += 0.2; }
      else if (agreement < 0.6) { findings.push({ code: 'low_agreement_threshold', severity: 'medium', detail: 'Agreement threshold below 0.6.' }); riskScore += 0.1; }
      if (!hasVeto) { findings.push({ code: 'no_human_veto', severity: 'high', detail: 'No human/principal veto path declared.' }); riskScore += 0.2; }
      if (!hasKillSwitch) { findings.push({ code: 'no_kill_switch', severity: 'medium', detail: 'No circuit breaker / kill switch declared.' }); riskScore += 0.1; }
      if (maxPosition <= 0 || maxPosition > 25) { findings.push({ code: 'position_limit_concern', severity: 'medium', detail: 'Max position % missing or above 25%.' }); riskScore += 0.1; }
      if (models.length && models.length < 2) { findings.push({ code: 'single_model_dependency', severity: 'medium', detail: 'Only one model listed.' }); riskScore += 0.1; }
      riskScore = clamp(Math.round(riskScore * 100) / 100, 0, 1);
      let recommendation = 'reject';
      if (riskScore <= 0.25 && findings.every(f => f.severity !== 'high')) recommendation = 'approve';
      else if (riskScore < 0.55) recommendation = 'approve_with_conditions';
      return {
        evaluation: {
          frameworkId: String(frameworkId), riskScore, riskThreshold: threshold, findings,
          controls: { minAgents, agreementThreshold: agreement || null, humanVeto: hasVeto, killSwitch: hasKillSwitch, maxPositionPct: maxPosition || null, modelCount: models.length },
        },
        recommendation,
      };
    },
  });

  registry.register('resource_reallocation_directive', {
    capability: 'portfolio_resource_allocation',
    description: 'Generates a formal reallocation mandate document for CFO/CTO (or a named target agent) describing sector shift intent, assignees, and success metrics. Does not move budget or capacity itself.',
    disableModelInvocation: true,
    inputSchema: { fromSector: { type: 'string', required: true }, toSector: { type: 'string', required: true }, rationale: { type: 'string', required: true }, targetAgent: { type: 'string', required: false } },
    outputSchema: { directive: { type: 'object', required: true } },
    permissions: PERMISSION,
    handler: async ({ fromSector, toSector, rationale, targetAgent }) => {
      const targets = targetAgent ? [String(targetAgent)] : ['cfo_agent', 'cto_agent'];
      return {
        directive: {
          id: 'rad_' + Date.now(), issuedAt: new Date().toISOString(), issuedBy: 'ceo_agent',
          fromSector: String(fromSector), toSector: String(toSector), rationale: String(rationale), assignees: targets,
          actions: targets.map(agent => ({
            agent,
            action: agent.includes('cfo')
              ? 'Reallocate budget capacity from ' + fromSector + ' toward ' + toSector + '; return 30-day cash impact.'
              : 'Reprioritize engineering bandwidth from ' + fromSector + ' toward ' + toSector + '; return capacity plan.',
          })),
          successMetrics: [
            'Measurable capacity or budget moved from ' + fromSector + ' to ' + toSector,
            'No critical regressions in the source sector during transition',
            'Written acknowledgment from each assignee within 5 business days',
          ],
          reviewDateOffsetDays: 30, status: 'issued',
        },
      };
    },
  });

  registry.register('launch_roadmap_orchestration', {
    capability: 'portfolio_resource_allocation',
    description: 'Constructs and governs detailed 90-to-180-day master launch schedules with timed task blocks and milestones.',
    disableModelInvocation: true,
    inputSchema: { projectName: { type: 'string', required: true }, durationDays: { type: 'number', required: false }, milestones: { type: 'array', required: false } },
    outputSchema: { roadmap: { type: 'object', required: true }, phases: { type: 'array', required: true } },
    permissions: PERMISSION,
    handler: async ({ projectName, durationDays = 90, milestones = [] }) => {
      const days = Math.max(30, Math.min(180, Math.floor(Number(durationDays) || 90)));
      const specs = [
        { name: 'discovery', weight: 0.15, owner: 'ceo_agent' },
        { name: 'build', weight: 0.35, owner: 'cto_agent' },
        { name: 'gtm_prep', weight: 0.2, owner: 'cmo_agent' },
        { name: 'launch', weight: 0.15, owner: 'coo_agent' },
        { name: 'stabilize', weight: 0.15, owner: 'ceo_agent' },
      ];
      let cursor = 0;
      const phases = specs.map((spec, index) => {
        const length = index === specs.length - 1 ? days - cursor : Math.max(5, Math.round(days * spec.weight));
        const startDay = cursor + 1;
        const endDay = cursor + length;
        cursor = endDay;
        return { id: 'phase_' + (index + 1), name: spec.name, owner: spec.owner, startDay, endDay, durationDays: length };
      });
      const milestoneRows = milestones.length
        ? milestones.map((m, i) => ({ id: 'ms_' + (i + 1), title: typeof m === 'string' ? m : (m.title || m.name || ('Milestone ' + (i + 1))), day: typeof m === 'object' && m.day != null ? Number(m.day) : Math.round(((i + 1) / (milestones.length + 1)) * days) }))
        : [
          { id: 'ms_1', title: 'Scope locked', day: phases[0].endDay },
          { id: 'ms_2', title: 'Build complete', day: phases[1].endDay },
          { id: 'ms_3', title: 'GTM ready', day: phases[2].endDay },
          { id: 'ms_4', title: 'Public launch', day: phases[3].endDay },
          { id: 'ms_5', title: 'Post-launch review', day: days },
        ];
      return { roadmap: { projectName: String(projectName), durationDays: days, generatedAt: new Date().toISOString(), cadence: 'weekly executive review', milestones: milestoneRows }, phases };
    },
  });
}
module.exports = { registerCeoSkills };
