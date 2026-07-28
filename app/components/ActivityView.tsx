'use client';

import { useEffect, useState } from 'react';

// Read-only Agent Performance Visibility view. Polls /api/activity, which is
// backed by lib/activityFeed.js -- see that file's header for exactly which
// figures (who/what/cost) are real and which (per-item duration, a blended
// chat error rate) are honestly omitted rather than fabricated. This
// component only formats and displays what the API already returns; it
// performs no aggregation of its own and calls no mutating endpoint.

const POLL_MS = 15000;

function formatTime(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatPercent(rate: number | null) {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function formatCost(cost: number | null) {
  if (cost == null) return 'unknown';
  return `$${cost.toFixed(4)}`;
}

function formatMs(ms: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ActivityView() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch('/api/activity')
        .then(r => r.json())
        .then(d => { if (!cancelled) setData(d); })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!data) return <div className="empty-state">Loading activity...</div>;
  if (!data.configured) return <div className="empty-state">Run setup first.</div>;

  const skills = data.skills || { sampleSize: 0, errorRate: null, recent: [] };
  const workflows = data.workflows || { sampleSize: 0, errorRate: null, recent: [], runs: [] };
  const usage = data.usage || { sampleSize: 0, totalCostUsd: 0, costUnknownCalls: 0, byAgent: {}, recent: [] };
  const notes = data.notes || {};
  const usageByAgent = Object.values(usage.byAgent || {}) as any[];

  return (
    <div className="activity-view">
      <div className="status-cards">
        <div className="status-card">
          <p className="status-label">Skill executions (sampled)</p>
          <p className="status-value">{skills.sampleSize}</p>
        </div>
        <div className="status-card">
          <p className="status-label">Skill error rate</p>
          <p className="status-value">{formatPercent(skills.errorRate)}</p>
        </div>
        <div className="status-card">
          <p className="status-label">Workflow run error rate</p>
          <p className="status-value">{formatPercent(workflows.errorRate)}</p>
        </div>
        <div className="status-card">
          <p className="status-label">Cost (sampled model calls)</p>
          <p className="status-value">${(usage.totalCostUsd || 0).toFixed(4)}</p>
        </div>
      </div>

      <section className="activity-section">
        <h3>Recent skill executions</h3>
        {skills.recent.length === 0 ? (
          <p className="chat-empty">No skill executions recorded yet.</p>
        ) : (
          <div className="activity-table">
            <div className="activity-row activity-row-header">
              <span>Agent</span>
              <span>Skill</span>
              <span>Status</span>
              <span>When</span>
            </div>
            {skills.recent.map((item: any, i: number) => (
              <div key={i} className="activity-row">
                <span title={item.agentResolved ? undefined : 'Unresolved agent id -- not present in the current org'}>
                  {item.agentName}{!item.agentResolved && item.agentId ? ' (unresolved)' : ''}
                </span>
                <span>{item.skillName || '—'}</span>
                <span className={item.status === 'failed' ? 'activity-status-failed' : 'activity-status-ok'}>{item.status || '—'}</span>
                <span>{formatTime(item.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="activity-section">
        <h3>Recent workflow activity</h3>
        {workflows.recent.length === 0 ? (
          <p className="chat-empty">No workflow activity recorded yet.</p>
        ) : (
          <div className="activity-table">
            <div className="activity-row activity-row-header">
              <span>Agent</span>
              <span>Event</span>
              <span>Workflow / run</span>
              <span>When</span>
            </div>
            {workflows.recent.map((item: any, i: number) => (
              <div key={i} className="activity-row">
                <span title={item.agentResolved ? undefined : 'Unresolved agent id -- not present in the current org'}>
                  {item.agentName}{!item.agentResolved && item.agentId ? ' (unresolved)' : ''}
                </span>
                <span className={/fail/i.test(item.event || '') ? 'activity-status-failed' : ''}>{item.event || '—'}</span>
                <span>{item.workflowId || '—'}{item.runId ? ` / ${item.runId}` : ''}</span>
                <span>{formatTime(item.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
        {workflows.runs && workflows.runs.length > 0 && (
          <div className="activity-subsection">
            <p className="hint">Run-level duration (whole run, not per-step -- see note below):</p>
            <div className="activity-table">
              <div className="activity-row activity-row-header">
                <span>Run</span>
                <span>Status</span>
                <span>Duration</span>
              </div>
              {workflows.runs.map((run: any) => (
                <div key={run.runId} className="activity-row">
                  <span>{run.runId}</span>
                  <span className={run.status === 'failed' ? 'activity-status-failed' : ''}>{run.status}</span>
                  <span>{formatMs(run.durationMs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="activity-section">
        <h3>Cost / usage by agent</h3>
        {usageByAgent.length === 0 ? (
          <p className="chat-empty">No model usage recorded yet.</p>
        ) : (
          <div className="activity-table">
            <div className="activity-row activity-row-header">
              <span>Agent</span>
              <span>Calls</span>
              <span>Tokens (prompt / completion)</span>
              <span>Cost</span>
            </div>
            {usageByAgent.map((agent: any) => (
              <div key={agent.agentId || 'unknown'} className="activity-row">
                <span title={agent.agentResolved ? undefined : 'Unresolved agent id -- not present in the current org'}>
                  {agent.agentName}{!agent.agentResolved && agent.agentId ? ' (unresolved)' : ''}
                </span>
                <span>{agent.calls}</span>
                <span>{agent.promptTokens} / {agent.completionTokens}</span>
                <span>{formatCost(agent.costUsd)}{agent.costUnknownCalls > 0 ? ` (${agent.costUnknownCalls} unpriced)` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="activity-notes">
        {notes.duration && <p className="hint">{notes.duration}</p>}
        {notes.errorRate && <p className="hint">{notes.errorRate}</p>}
      </section>
    </div>
  );
}
