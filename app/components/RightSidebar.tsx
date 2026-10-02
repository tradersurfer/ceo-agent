'use client';

// Right sidebar — live agent status + activity feed.
//
// Both sources already exist and return real data today: /api/status
// (supervisor: agentCount, per-agent list, health state) and /api/activity
// (buildActivityFeed: recent skills, recent workflow runs, usage by agent,
// per-department rollups, and a `notes` object documenting what the audit
// schema does NOT track). Nothing here is derived client-side, and nothing is
// invented: a metric the feed cannot supply renders as "unknown", never 0.
//
// Two deliberate choices:
//
// 1. Both endpoints are polled rather than pushed. The gateway has no
//    server-sent event for status, and polling every 10s keeps this component
//    a pure reader with no lifecycle to leak. A poll is abandoned on unmount.
//
// 2. A failed fetch renders a distinct "can't reach the runtime" state rather
//    than an empty list. An empty activity feed and an unreachable runtime are
//    different facts and must not look alike — the same rule the rest of the
//    app follows for missing-vs-unknown (see StatusView's configured check and
//    ActivityView's setup prompt).

import { useEffect, useState } from 'react';

type AgentStatus = {
  configured?: boolean;
  costMode?: string;
  status?: {
    agentCount?: number;
    agents?: string[];
    health?: string;
  };
};

type ActivityFeed = {
  configured?: boolean;
  generatedAt?: string;
  skills?: { recent?: any[]; failureCount?: number; errorRate?: number | null };
  workflows?: { recent?: any[]; runTerminalCount?: number; failureCount?: number };
  usage?: { totalCostUsd?: number; costUnknownCalls?: number; byAgent?: Record<string, any> };
  byDepartment?: Record<string, any>;
  notes?: Record<string, string>;
};

const POLL_MS = 10_000;

// A metric that is genuinely unknown must read as unknown. buildActivityFeed
// returns null errorRate (not 0) when it has no samples, and a cost of 0 can
// mean either "free" or "nothing measured" — costUnknownCalls distinguishes
// them, so this respects that distinction instead of collapsing both to zero.
function formatErrorRate(errorRate: number | null | undefined, sampleSize: number | undefined): string {
  if (errorRate == null) return '—';
  if (!sampleSize) return 'no samples';
  return `${Math.round(errorRate * 100)}%`;
}

function formatCost(totalCostUsd: number | undefined, unknownCalls: number | undefined): string {
  if (totalCostUsd == null) return '—';
  if (totalCostUsd === 0 && unknownCalls) return `0 (${unknownCalls} unpriced)`;
  return `$${totalCostUsd.toFixed(4)}`;
}

export default function RightSidebar() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        // Both endpoints are independent; one failing must not blank the other.
        const [statusRes, activityRes] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/activity'),
        ]);
        const statusJson = await statusRes.json();
        const activityJson = await activityRes.json();
        if (cancelled) return;
        setAgentStatus(statusJson);
        setFeed(activityJson);
        setUnreachable(!statusRes.ok || !activityRes.ok);
      } catch {
        if (!cancelled) setUnreachable(true);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const status = agentStatus?.status;
  const agents = status?.agents || [];
  const health = status?.health;

  // Health is a state, not a decoration: name it in text so the badge is not
  // the only carrier of the information.
  const healthClass =
    health === 'healthy' ? 'right-status-badge-ok'
    : health === 'degraded' ? 'right-status-badge-warn'
    : health ? 'right-status-badge-danger'
    : '';

  return (
    <aside className="right-sidebar" aria-label="Runtime status and activity">
      <section className="right-section">
        <h2 className="right-section-title">Agents</h2>

        {unreachable && (
          <p className="right-unreachable" role="status">
            Can&apos;t reach the runtime — values below may be stale.
          </p>
        )}

        <div className="right-stat-row">
          <div className="right-stat">
            <span className="right-stat-label">Active</span>
            <span className="right-stat-value">{status?.agentCount ?? '—'}</span>
          </div>
          <div className="right-stat">
            <span className="right-stat-label">Cost mode</span>
            <span className="right-stat-value">{agentStatus?.costMode ?? '—'}</span>
          </div>
          <div className="right-stat">
            <span className="right-stat-label">Health</span>
            <span className={`right-status-badge ${healthClass}`}>{health || 'unknown'}</span>
          </div>
        </div>

        {agents.length > 0 ? (
          <ul className="right-agent-list">
            {agents.map(id => (
              <li key={id} className="right-agent-row">
                <span className="right-agent-id">{id}</span>
                <span className="right-agent-ready">ready</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="right-empty">No agents reported yet.</p>
        )}
      </section>

      <section className="right-section">
        <h2 className="right-section-title">Activity</h2>

        <div className="right-stat-row">
          <div className="right-stat">
            <span className="right-stat-label">Skill errors</span>
            <span className="right-stat-value">
              {formatErrorRate(feed?.skills?.errorRate, feed?.skills?.recent?.length)}
            </span>
          </div>
          <div className="right-stat">
            <span className="right-stat-label">Workflow fails</span>
            <span className="right-stat-value">{feed?.workflows?.failureCount ?? '—'}</span>
          </div>
          <div className="right-stat">
            <span className="right-stat-label">Spend</span>
            <span className="right-stat-value">
              {formatCost(feed?.usage?.totalCostUsd, feed?.usage?.costUnknownCalls)}
            </span>
          </div>
        </div>

        <h3 className="right-subsection-title">Recent skills</h3>
        {feed?.skills?.recent?.length ? (
          <ul className="right-feed-list">
            {feed.skills.recent.slice(0, 8).map((entry: any, i: number) => (
              <li key={`${entry.skillName ?? 'skill'}-${i}`} className="right-feed-row">
                <span className="right-feed-name">{entry.skillName || 'skill'}</span>
                <span className={`right-feed-status right-feed-status-${entry.status || 'unknown'}`}>
                  {entry.status || 'unknown'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="right-empty">No skill activity recorded yet.</p>
        )}

        <h3 className="right-subsection-title">Recent workflows</h3>
        {feed?.workflows?.recent?.length ? (
          <ul className="right-feed-list">
            {feed.workflows.recent.slice(0, 8).map((entry: any, i: number) => (
              <li key={`${entry.workflowId ?? entry.runId ?? 'wf'}-${i}`} className="right-feed-row">
                <span className="right-feed-name">{entry.workflowId || entry.runId || 'workflow'}</span>
                <span className={`right-feed-status right-feed-status-${entry.status || 'unknown'}`}>
                  {entry.status || 'unknown'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="right-empty">No workflow runs recorded yet.</p>
        )}

        {/* The feed documents its own gaps. Surfacing them is more honest than
            letting a reader assume the numbers above are complete. */}
        {feed?.notes && Object.keys(feed.notes).length > 0 && (
          <details className="right-notes">
            <summary className="right-subsection-title">What this feed does not track</summary>
            <dl className="right-notes-list">
              {Object.entries(feed.notes).map(([key, text]) => (
                <div key={key} className="right-note">
                  <dt>{key}</dt>
                  <dd>{String(text)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </section>
    </aside>
  );
}