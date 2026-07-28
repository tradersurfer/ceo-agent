/**
 * Read-only activity/performance aggregation for the Status/Org UI batch
 * (Agent Performance Visibility + Live Org Chart). Built on the same real,
 * already-persisted sources HealthReporter.js and UsageTracker.js read —
 * `workflow_audit` / `skill_audit` (core/persistence/SupabaseAuditLog.js,
 * issue #52) and `model_usage` (core/UsageTracker.js, issue #51) — plus
 * `runtime.supervisor.listAgents()` to resolve bare `agentId` strings into
 * human-readable name/title/department, the same source `/api/org` already
 * uses (app/api/org/route.ts). Department grouping here follows that same
 * `agent.department || agent.lane` precedent — never a hardcoded list.
 *
 * Pulled out of any route.ts on purpose (see lib/connectionsConfig.js's
 * header) so this logic is unit-testable directly via `node --test` without
 * a running Next.js server, and so it can be required from both
 * app/api/activity/route.ts and tests/ActivityFeed.test.js.
 *
 * Real, current gaps in the audit trail this module does NOT paper over:
 *
 * - Per-skill-execution and per-workflow-step duration are not tracked.
 *   SkillExecutor#_finish() and WorkflowRuntime#_record() each append
 *   exactly one audit row at completion — no paired "started" event, no
 *   durationMs field. This module never fabricates one; per-item duration
 *   is simply absent from `skills.recent` / `workflows.recent`.
 *   Whole-workflow-*run* duration IS derivable, though: the run record
 *   itself (fetched via `workflowRuntime.store.get(runId)`) carries
 *   `createdAt`/`updatedAt`, so `workflows.runs[].durationMs` is reported
 *   for terminal (completed/failed) runs, clearly separate from — and not
 *   to be confused with — per-step timing.
 * - "Error rate" is computed only from skill_audit (explicit `status`) and
 *   workflow_audit (explicit `workflow.completed`/`workflow.failed` run
 *   outcomes) — never from model_usage. recordUsage() is only ever called
 *   after a successful chatCompletion() (see bin/chat.js, app/api/chat/
 *   route.ts), so a failed chat completion never reaches model_usage at
 *   all; blending it into an error-rate denominator would misleadingly
 *   imply chat failures are represented. `usage` below carries no
 *   `errorRate` field for this reason.
 * - "Cost per task" is cost per model_usage entry (one chat-completion
 *   call) — there is no broader "task" concept unifying it with skill/
 *   workflow executions in this codebase's data model. The two are kept as
 *   separate real activity streams here (correlated by agentId/time, not
 *   merged into one fabricated schema).
 * - `byDepartment[].working` is a recency proxy ("something completed
 *   within the last `workingWindowMs`"), not a true in-progress signal —
 *   the audit schema has no started/in-progress event, only point-in-time
 *   completion rows. Labelled as such in the returned `notes`.
 */

const DEFAULT_AUDIT_LIMIT = 200;
const DEFAULT_USAGE_LIMIT = 200;
const DEFAULT_RECENT_DISPLAY_LIMIT = 25;
const DEFAULT_WORKING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RUN_LOOKUPS = 20;

const FAIL_EVENT_PATTERN = /fail/i;
const RUN_TERMINAL_EVENTS = new Set(['workflow.completed', 'workflow.failed']);

/**
 * Reads up to `limit` recent entries from an audit log, oldest-first, same
 * "handle both backends" pattern as HealthReporter#summarizeAudit /
 * UsageTracker#summarizeUsage.
 * @param {object|null|undefined} audit
 * @param {number} limit
 * @returns {Promise<{source: string, entries: object[]}>}
 */
async function readAuditEntries(audit, limit) {
  if (!audit) return { source: 'unavailable', entries: [] };
  const source = typeof audit.query === 'function' ? 'supabase' : 'in-memory';
  const entries = typeof audit.query === 'function'
    ? await audit.query({ limit })
    : audit.list().slice(-limit);
  return { source, entries };
}

/**
 * Normalizes one raw audit row into a flat camelCase shape regardless of
 * backend. InMemoryAuditLog entries are already flat camelCase. Supabase
 * rows (SupabaseAuditLog#_toRow) promote configured `entryColumns` to
 * snake_case top-level columns (e.g. `skillName` -> `skill_name`,
 * `costTier` -> `cost_tier`) and nest everything else, still camelCase,
 * under `data` — so reading a Supabase row correctly requires reversing
 * both transforms, not just spreading `.data` (a naive `{...entry.data}`
 * misses every promoted column, which is most of the identifying fields:
 * skillName, agentId, workflowId, runId, stepId, model, costTier).
 * @param {object} raw
 * @returns {object} Flat entry with event/tenantId/agentId/timestamp plus whichever table-specific fields are present.
 */
function normalizeEntry(raw) {
  const data = raw && raw.data && typeof raw.data === 'object' ? raw.data : {};
  return {
    event: raw.event ?? null,
    tenantId: raw.tenant_id ?? raw.tenantId ?? null,
    agentId: raw.agent_id ?? raw.agentId ?? null,
    timestamp: raw.event_time ?? raw.timestamp ?? null,
    workflowId: raw.workflow_id ?? raw.workflowId ?? data.workflowId ?? null,
    runId: raw.run_id ?? raw.runId ?? data.runId ?? null,
    stepId: raw.step_id ?? raw.stepId ?? data.stepId ?? null,
    skillName: raw.skill_name ?? raw.skillName ?? data.skillName ?? null,
    status: raw.status ?? data.status ?? null,
    reason: raw.reason ?? data.reason ?? null,
    model: raw.model ?? data.model ?? null,
    role: raw.role ?? data.role ?? null,
    costTier: raw.cost_tier ?? raw.costTier ?? data.costTier ?? null,
    promptTokens: data.promptTokens ?? raw.promptTokens ?? null,
    completionTokens: data.completionTokens ?? raw.completionTokens ?? null,
    estimatedCostUsd: data.estimatedCostUsd ?? raw.estimatedCostUsd ?? null,
  };
}

/**
 * Builds an agentId -> {id, name, title, department} directory from the
 * live supervisor, same source `/api/org` uses. Never throws on a
 * malformed/missing supervisor.
 * @param {object|null} supervisor
 * @returns {object}
 */
function buildAgentDirectory(supervisor) {
  const directory = {};
  if (!supervisor || typeof supervisor.listAgents !== 'function') return directory;
  for (const agent of supervisor.listAgents()) {
    if (!agent || !agent.id) continue;
    directory[agent.id] = {
      id: agent.id,
      name: agent.name || agent.id,
      title: agent.title || null,
      department: agent.department || agent.lane || null,
    };
  }
  return directory;
}

/**
 * Resolves an agentId against the directory. An id with no match (a since-
 * removed/renamed agent, or an entry recorded with no agentId at all)
 * renders gracefully — the raw id (or "Unknown") — rather than throwing or
 * being silently dropped from the feed.
 * @param {object} directory From buildAgentDirectory().
 * @param {string|null} agentId
 * @returns {{id: string|null, name: string, title: string|null, department: string|null, resolved: boolean}}
 */
function resolveAgent(directory, agentId) {
  if (!agentId) return { id: null, name: 'Unknown', title: null, department: null, resolved: false };
  const known = directory[agentId];
  if (known) return { ...known, resolved: true };
  return { id: agentId, name: agentId, title: null, department: null, resolved: false };
}

/**
 * Recent skill-execution activity, who/what/status/when, plus an error rate
 * computed purely from skill_audit's explicit `status` field.
 * @param {object|null|undefined} audit `skillExecutor.audit`.
 * @param {object} directory
 * @param {number} limit
 * @returns {Promise<object>}
 */
async function buildSkillActivity(audit, directory, limit) {
  const { source, entries } = await readAuditEntries(audit, limit);
  const normalized = entries.map(normalizeEntry);

  let failureCount = 0;
  const recent = normalized.map(entry => {
    if (entry.status === 'failed') failureCount += 1;
    const agent = resolveAgent(directory, entry.agentId);
    return {
      event: entry.event,
      skillName: entry.skillName,
      status: entry.status,
      reason: entry.reason,
      agentId: entry.agentId,
      agentName: agent.name,
      department: agent.department,
      agentResolved: agent.resolved,
      timestamp: entry.timestamp,
    };
  });
  recent.reverse(); // most-recent first

  return {
    source,
    sampleSize: normalized.length,
    failureCount,
    errorRate: normalized.length ? Number((failureCount / normalized.length).toFixed(4)) : null,
    recent,
  };
}

/**
 * Recent workflow activity (step + run-level events), an error rate
 * computed only from run-terminal outcomes (`workflow.completed` /
 * `workflow.failed` — not raw event-row counts, which would double-count a
 * single failed run's `workflow.step.failed` and `workflow.failed` rows),
 * and run-level duration for the terminal runs referenced in this sample.
 * @param {object|null|undefined} audit `workflowRuntime.audit`.
 * @param {object|null|undefined} store `workflowRuntime.store` (for run-level createdAt/updatedAt).
 * @param {object} directory
 * @param {number} limit
 * @returns {Promise<object>}
 */
async function buildWorkflowActivity(audit, store, directory, limit) {
  const { source, entries } = await readAuditEntries(audit, limit);
  const normalized = entries.map(normalizeEntry);

  let runTerminalCount = 0;
  let runFailureCount = 0;
  const orderedRunIds = [];
  const seenRunIds = new Set();

  const recent = normalized.map(entry => {
    if (RUN_TERMINAL_EVENTS.has(entry.event)) {
      runTerminalCount += 1;
      if (entry.event === 'workflow.failed') runFailureCount += 1;
    }
    if (entry.runId && !seenRunIds.has(entry.runId)) {
      seenRunIds.add(entry.runId);
      orderedRunIds.push(entry.runId);
    }
    const agent = resolveAgent(directory, entry.agentId);
    return {
      event: entry.event,
      workflowId: entry.workflowId,
      runId: entry.runId,
      stepId: entry.stepId,
      agentId: entry.agentId,
      agentName: agent.name,
      department: agent.department,
      agentResolved: agent.resolved,
      timestamp: entry.timestamp,
    };
  });
  recent.reverse(); // most-recent first

  // Run-level duration: resolvable from the run record's createdAt/updatedAt
  // (see core/WorkflowRuntime.js#_run — record.updatedAt is set once the
  // run reaches a terminal status), unlike per-step timing which the audit
  // schema simply doesn't carry. Capped and taken from the most-recently-
  // seen run ids (recent[] is already most-recent-first, so reverse the
  // collection order) to bound Supabase round-trips per request.
  const runs = [];
  if (store && typeof store.get === 'function') {
    const lookupIds = orderedRunIds.slice(-MAX_RUN_LOOKUPS).reverse();
    for (const runId of lookupIds) {
      try {
        const record = await store.get(runId);
        if (!record) continue;
        const terminal = record.status === 'completed' || record.status === 'failed';
        runs.push({
          runId: record.id,
          workflowId: record.workflowId,
          status: record.status,
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
          durationMs: terminal && record.createdAt && record.updatedAt
            ? Math.max(0, new Date(record.updatedAt).getTime() - new Date(record.createdAt).getTime())
            : null,
        });
      } catch {
        // One unreachable/missing run record shouldn't break the whole feed.
      }
    }
  }

  return {
    source,
    sampleSize: normalized.length,
    runTerminalCount,
    failureCount: runFailureCount,
    errorRate: runTerminalCount ? Number((runFailureCount / runTerminalCount).toFixed(4)) : null,
    recent,
    runs,
  };
}

/**
 * Cost/usage per model_usage entry (one chat-completion call = one unit of
 * costed work), overall and broken down by agent. Deliberately carries no
 * `errorRate` — see this module's header for why blending in model_usage
 * would be misleading (it only ever records the success path).
 * @param {object|null|undefined} audit `runtime.usageAudit`.
 * @param {object} directory
 * @param {number} limit
 * @returns {Promise<object>}
 */
async function buildUsageActivity(audit, directory, limit) {
  const { source, entries } = await readAuditEntries(audit, limit);
  const normalized = entries.map(normalizeEntry);

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUsd = 0;
  let costUnknownCalls = 0;
  const byAgent = {};
  const recent = [];

  for (const entry of normalized) {
    const agent = resolveAgent(directory, entry.agentId);
    const promptTokens = entry.promptTokens || 0;
    const completionTokens = entry.completionTokens || 0;
    const costUsd = entry.estimatedCostUsd;

    totalPromptTokens += promptTokens;
    totalCompletionTokens += completionTokens;
    if (costUsd == null) costUnknownCalls += 1;
    else totalCostUsd += costUsd;

    const key = entry.agentId || 'unknown';
    if (!byAgent[key]) {
      byAgent[key] = {
        agentId: entry.agentId,
        agentName: agent.name,
        department: agent.department,
        agentResolved: agent.resolved,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        costUnknownCalls: 0,
      };
    }
    byAgent[key].calls += 1;
    byAgent[key].promptTokens += promptTokens;
    byAgent[key].completionTokens += completionTokens;
    if (costUsd == null) byAgent[key].costUnknownCalls += 1;
    else byAgent[key].costUsd += costUsd;

    recent.push({
      agentId: entry.agentId,
      agentName: agent.name,
      department: agent.department,
      agentResolved: agent.resolved,
      model: entry.model,
      costUsd: costUsd == null ? null : costUsd,
      timestamp: entry.timestamp,
    });
  }
  recent.reverse(); // most-recent first
  for (const bucket of Object.values(byAgent)) bucket.costUsd = Number(bucket.costUsd.toFixed(6));

  return {
    source,
    sampleSize: normalized.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(6)),
    costUnknownCalls,
    byAgent,
    recent,
  };
}

function isWithinWindow(timestamp, now, windowMs) {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= windowMs && t - now <= 1000; // small forward tolerance for clock skew
}

function describeWorkflowEvent(event) {
  if (!event) return 'worked on a workflow';
  return event.replace(/^workflow\./, '').replace(/\./g, ' ');
}

/**
 * Groups activity by department (agent.department || agent.lane — same
 * precedent as app/api/org/route.ts, never a hardcoded list) for OrgView's
 * live indicator: agent roster per department, recent skill/workflow
 * counts and failures, a `working` recency flag, and a short paraphrased
 * highlight of the most recent item. Every department with at least one
 * agent in the directory is represented, even with zero recent activity.
 * @param {object} directory
 * @param {object} skills From buildSkillActivity().
 * @param {object} workflows From buildWorkflowActivity().
 * @param {number} now Epoch ms "now" (injectable for tests).
 * @param {number} windowMs "Recently active" window.
 * @returns {object} Map of department -> summary.
 */
function buildDepartmentSummary({ directory, skills, workflows, now, windowMs }) {
  const departments = {};

  function ensureDept(dept) {
    if (!departments[dept]) {
      departments[dept] = {
        department: dept,
        agentCount: 0,
        recentSkillCount: 0,
        recentWorkflowCount: 0,
        skillFailures: 0,
        workflowFailures: 0,
        working: false,
        lastActivity: null,
        highlight: null,
      };
    }
    return departments[dept];
  }

  for (const agent of Object.values(directory)) {
    if (!agent.department) continue;
    ensureDept(agent.department).agentCount += 1;
  }

  // Merge both streams and sort newest-first so the first item encountered
  // per department while iterating is genuinely the most recent overall
  // (not just "most recent skill event", which a two-pass fold would bias
  // toward if skills happened to be folded first).
  const combined = [
    ...skills.recent.map(item => ({ ...item, kind: 'skill' })),
    ...workflows.recent.map(item => ({ ...item, kind: 'workflow' })),
  ]
    .filter(item => item.department)
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

  for (const item of combined) {
    const bucket = ensureDept(item.department);
    if (item.kind === 'skill') {
      bucket.recentSkillCount += 1;
      if (item.status === 'failed') bucket.skillFailures += 1;
    } else {
      bucket.recentWorkflowCount += 1;
      if (FAIL_EVENT_PATTERN.test(item.event || '')) bucket.workflowFailures += 1;
    }
    if (isWithinWindow(item.timestamp, now, windowMs)) {
      bucket.working = true;
      if (!bucket.lastActivity || new Date(item.timestamp) > new Date(bucket.lastActivity)) {
        bucket.lastActivity = item.timestamp;
      }
    }
    if (!bucket.highlight) {
      bucket.highlight = item.kind === 'skill'
        ? `${item.agentName} ran ${item.skillName || 'a skill'}${item.status === 'failed' ? ' (failed)' : ''}`
        : `${item.agentName} ${describeWorkflowEvent(item.event)}`;
    }
  }

  return departments;
}

/**
 * Builds the full read-only activity/performance feed.
 * @param {object} options
 * @param {object|null} options.runtime JECIRuntime (has workflowRuntime, skillExecutor, usageAudit, supervisor).
 * @param {number} [options.auditLimit] Max recent skill/workflow audit rows to read per source.
 * @param {number} [options.usageLimit] Max recent model_usage rows to read.
 * @param {number} [options.recentDisplayLimit] How many items each `recent` list is trimmed to for the API response.
 * @param {number} [options.workingWindowMs] "Recently active" window for byDepartment.working.
 * @param {number} [options.now] Epoch ms "now" (injectable for tests).
 * @returns {Promise<object>}
 */
async function buildActivityFeed({
  runtime,
  auditLimit = DEFAULT_AUDIT_LIMIT,
  usageLimit = DEFAULT_USAGE_LIMIT,
  recentDisplayLimit = DEFAULT_RECENT_DISPLAY_LIMIT,
  workingWindowMs = DEFAULT_WORKING_WINDOW_MS,
  now = Date.now(),
} = {}) {
  if (!runtime) {
    return { configured: false, generatedAt: new Date(now).toISOString() };
  }

  const directory = buildAgentDirectory(runtime.supervisor);

  const [skills, workflows, usage] = await Promise.all([
    buildSkillActivity(runtime.skillExecutor && runtime.skillExecutor.audit, directory, auditLimit),
    buildWorkflowActivity(
      runtime.workflowRuntime && runtime.workflowRuntime.audit,
      runtime.workflowRuntime && runtime.workflowRuntime.store,
      directory,
      auditLimit,
    ),
    buildUsageActivity(runtime.usageAudit, directory, usageLimit),
  ]);

  const byDepartment = buildDepartmentSummary({ directory, skills, workflows, now, windowMs: workingWindowMs });

  return {
    configured: true,
    generatedAt: new Date(now).toISOString(),
    agents: directory,
    skills: { ...skills, recent: skills.recent.slice(0, recentDisplayLimit) },
    workflows: { ...workflows, recent: workflows.recent.slice(0, recentDisplayLimit) },
    usage: { ...usage, recent: usage.recent.slice(0, recentDisplayLimit) },
    byDepartment,
    notes: {
      duration: 'Per-skill-execution and per-workflow-step duration are not tracked in the audit schema today (SkillExecutor/WorkflowRuntime append one row at completion, no started event or durationMs field) -- omitted here rather than fabricated. Whole-workflow-run duration (workflows.runs[].durationMs) is shown where derivable from the run record\'s createdAt/updatedAt, which is a distinct, run-level figure -- not a per-step one.',
      errorRate: 'skills.errorRate / workflows.errorRate are computed only from skill_audit and workflow_audit, which carry explicit success/failure outcomes. usage (model_usage / chat completions) carries no errorRate: recordUsage() only ever runs on the success path, so a failed chat completion is never recorded there at all.',
      working: `byDepartment[].working reflects activity completed within the last ${Math.round(workingWindowMs / 1000)}s -- a recency proxy, not a true in-progress signal, since the audit schema has no started/in-progress event.`,
    },
  };
}

module.exports = {
  buildActivityFeed,
  buildAgentDirectory,
  resolveAgent,
  normalizeEntry,
  buildSkillActivity,
  buildWorkflowActivity,
  buildUsageActivity,
  buildDepartmentSummary,
  DEFAULT_WORKING_WINDOW_MS,
};
