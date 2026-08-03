const Organization = require('../../organization/Organization');
const { resolveCeoMode } = require('../ceoModes');

const MANAGER_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

function clampScore(value) {
  return Math.max(1, Math.min(5, Number(value) || 1));
}

function registerManagerSkills(registry, options = {}) {
  const organization = options.organization || Organization.createDefault();
  // CEO Modes (Stream B2, core/ceoModes.js): resolved once at registration
  // time, same lifecycle as `organization` above. An explicit per-call
  // `threshold`/`passThreshold` in a skill's input always overrides the
  // configured mode's default — see escalation_assessment/quality_review
  // below — this only changes what happens when the caller doesn't supply
  // one, exactly like a config default, not new decision logic.
  const ceoMode = options.ceoMode || resolveCeoMode();
  const register = (name, capability, description, inputSchema, outputSchema, handler) => registry.register(name, {
    capability,
    description,
    inputSchema,
    outputSchema,
    permissions: MANAGER_PERMISSION,
    handler,
  });

  register(
    'task_decomposition',
    'management_planning',
    'Breaks an objective into an ordered list of tasks with acceptance criteria.',
    {
      objective: { type: 'string', required: true },
      deliverables: { type: 'array', required: false },
      constraints: { type: 'array', required: false },
    },
    { objective: { type: 'string', required: true }, tasks: { type: 'array', required: true }, assumptions: { type: 'array', required: true } },
    async ({ objective, deliverables = [], constraints = [] }) => {
      const parts = deliverables.length
        ? deliverables
        : objective.split(/[.;]\s+/).map(item => item.trim()).filter(Boolean);
      return {
        objective,
        tasks: parts.map((title, index) => ({
          id: `task_${index + 1}`,
          title: String(title),
          dependsOn: index === 0 ? [] : [`task_${index}`],
          acceptanceCriteria: `Completed and verified: ${title}`,
        })),
        assumptions: constraints.length ? constraints.map(String) : ['No additional constraints supplied.'],
      };
    },
  );

  register(
    'delegation_brief',
    'management_delegation',
    'Builds a structured delegation brief for a task assigned to someone else.',
    {
      task: { type: 'string', required: true },
      assignee: { type: 'string', required: true },
      desiredOutcome: { type: 'string', required: true },
      context: { type: 'string', required: false },
      deadline: { type: 'string', required: false },
    },
    { brief: { type: 'object', required: true } },
    async input => ({
      brief: {
        assignee: input.assignee,
        task: input.task,
        desiredOutcome: input.desiredOutcome,
        context: input.context || 'No additional context supplied.',
        deadline: input.deadline || null,
        checkIn: 'Escalate blockers early and return evidence with the completed work.',
      },
    }),
  );

  register(
    'priority_scoring',
    'management_prioritization',
    'Ranks a list of items by impact, urgency, and effort.',
    { items: { type: 'array', required: true } },
    { rankedItems: { type: 'array', required: true } },
    async ({ items }) => ({
      rankedItems: items.map((item, index) => ({
        id: item.id || `item_${index + 1}`,
        title: item.title || item.id || `Item ${index + 1}`,
        score: clampScore(item.impact) * 2 + clampScore(item.urgency) * 2 - clampScore(item.effort),
      })).sort((a, b) => b.score - a.score),
    }),
  );

  register(
    'decision_memo',
    'management_decision_support',
    'Formats a decision, its options, and rationale into an approval-ready memo.',
    {
      decision: { type: 'string', required: true },
      options: { type: 'array', required: true },
      recommendation: { type: 'string', required: true },
      rationale: { type: 'string', required: true },
      risks: { type: 'array', required: false },
    },
    { memo: { type: 'object', required: true } },
    async ({ decision, options, recommendation, rationale, risks = [] }) => ({
      memo: { decision, options, recommendation, rationale, risks, approvalRequired: true },
    }),
  );

  register(
    'status_synthesis',
    'management_reporting',
    'Summarizes a list of status updates into counts, blockers, and next actions.',
    { updates: { type: 'array', required: true } },
    { summary: { type: 'object', required: true }, blockers: { type: 'array', required: true }, nextActions: { type: 'array', required: true } },
    async ({ updates }) => {
      const summary = {};
      for (const update of updates) summary[update.status || 'unknown'] = (summary[update.status || 'unknown'] || 0) + 1;
      return {
        summary,
        blockers: updates.filter(update => update.blocker).map(update => ({ id: update.id || null, blocker: update.blocker })),
        nextActions: updates.filter(update => update.nextAction).map(update => ({ id: update.id || null, action: update.nextAction })),
      };
    },
  );

  register(
    'escalation_assessment',
    'management_escalation',
    'Scores whether an issue should be escalated based on impact, urgency, reversibility, and authority.',
    {
      issue: { type: 'string', required: true },
      impact: { type: 'number', required: true },
      urgency: { type: 'number', required: true },
      reversible: { type: 'boolean', required: true },
      withinAuthority: { type: 'boolean', required: true },
      // Optional per-call override of the configured CEO mode's escalation
      // threshold (core/ceoModes.js). Omit to use the mode's default —
      // this is the same "explicit input wins over configured default"
      // shape budget_token_allocation/quality_review already use.
      threshold: { type: 'number', required: false },
    },
    { assessment: { type: 'object', required: true } },
    async input => {
      const score = clampScore(input.impact) + clampScore(input.urgency)
        + (input.reversible ? 0 : 2) + (input.withinAuthority ? 0 : 3);
      const threshold = input.threshold != null ? input.threshold : ceoMode.escalationThreshold;
      const reasons = [];
      if (!input.withinAuthority) reasons.push('Decision exceeds assigned authority.');
      if (!input.reversible) reasons.push('Decision is difficult to reverse.');
      if (clampScore(input.impact) >= 4) reasons.push('Potential impact is high.');
      if (clampScore(input.urgency) >= 4) reasons.push('Time sensitivity is high.');
      return { assessment: { issue: input.issue, score, threshold, escalate: score >= threshold, reasons } };
    },
  );

  register(
    'department_capability_lookup',
    'management_org_lookup',
    'Finds departments or agents whose name or capabilities match a query.',
    { query: { type: 'string', required: true } },
    { matches: { type: 'array', required: true } },
    async ({ query }) => {
      const normalized = query.trim().toLowerCase();
      const matches = [];
      for (const department of organization.listDepartments()) {
        if (department.id.includes(normalized) || department.name.toLowerCase().includes(normalized)) {
          matches.push({ type: 'department', id: department.id, name: department.name });
        }
      }
      for (const agent of organization.listAgents()) {
        const capabilities = agent.capabilities.filter(capability => capability.includes(normalized));
        if (capabilities.length || agent.name.toLowerCase().includes(normalized)) {
          matches.push({ type: 'agent', id: agent.id, name: agent.name, department: agent.department, capabilities });
        }
      }
      return { matches };
    },
  );

  register(
    'workload_balancing',
    'management_capacity',
    'Computes per-owner utilization and suggests reassignments away from overloaded owners.',
    { assignments: { type: 'array', required: true } },
    { workloads: { type: 'array', required: true }, recommendations: { type: 'array', required: true } },
    async ({ assignments }) => {
      const workloads = assignments.map(item => {
        const capacity = Math.max(Number(item.capacity) || 0, 1);
        const utilization = (Number(item.workload) || 0) / capacity;
        return { owner: item.owner, workload: Number(item.workload) || 0, capacity, utilization };
      });
      const available = workloads.filter(item => item.utilization < 0.8).sort((a, b) => a.utilization - b.utilization);
      return {
        workloads,
        recommendations: workloads.filter(item => item.utilization > 1).map((item, index) => ({
          from: item.owner,
          to: available[index % Math.max(available.length, 1)]?.owner || null,
          reason: `${item.owner} is above capacity.`,
        })),
      };
    },
  );

  register(
    'quality_review',
    'management_quality',
    'Scores an artifact against a list of pass/fail criteria and reports gaps.',
    {
      artifact: { type: 'string', required: true },
      criteria: { type: 'array', required: true },
      passThreshold: { type: 'number', required: false },
    },
    { review: { type: 'object', required: true } },
    async ({ artifact, criteria, passThreshold }) => {
      // Same "explicit input wins over configured mode default" shape as
      // escalation_assessment's threshold above — an explicit passThreshold
      // still always wins over the configured CEO mode's default.
      const threshold = passThreshold != null ? passThreshold : ceoMode.qualityPassThreshold;
      const passedCount = criteria.filter(item => item.passed === true).length;
      const score = criteria.length ? passedCount / criteria.length : 0;
      return {
        review: {
          artifact,
          score,
          passThreshold: threshold,
          passed: score >= threshold,
          gaps: criteria.filter(item => item.passed !== true).map(item => ({ criterion: item.name, note: item.note || null })),
        },
      };
    },
  );

  register(
    'budget_token_allocation',
    'management_budgeting',
    'Allocates a token budget across work items by minimum reservation, then priority x complexity weighting.',
    { totalTokens: { type: 'number', required: true }, workItems: { type: 'array', required: true } },
    { allocations: { type: 'array', required: true }, totalAllocated: { type: 'number', required: true }, unusedTokens: { type: 'number', required: true } },
    async ({ totalTokens, workItems }) => {
      const budget = Math.max(0, Math.floor(totalTokens));
      const minimums = workItems.map(item => Math.max(0, Math.floor(item.minimumTokens || 0)));
      const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
      if (minimumTotal > budget) throw new Error('Minimum token allocations exceed totalTokens.');
      const remaining = budget - minimumTotal;
      const weights = workItems.map(item => clampScore(item.priority) * clampScore(item.complexity));
      const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
      let distributed = 0;
      const allocations = workItems.map((item, index) => {
        const extra = index === workItems.length - 1
          ? remaining - distributed
          : Math.floor(remaining * (weights[index] / weightTotal));
        distributed += extra;
        return { id: item.id || `work_${index + 1}`, tokens: minimums[index] + extra };
      });
      const totalAllocated = allocations.reduce((sum, item) => sum + item.tokens, 0);
      return { allocations, totalAllocated, unusedTokens: budget - totalAllocated };
    },
  );

  return registry;
}

module.exports = { registerManagerSkills, MANAGER_PERMISSION };
