'use client';

import { useEffect, useState } from 'react';

// Department structure still comes from /api/org (app/api/org/route.ts),
// which derives departments dynamically from agent.department || agent.lane
// -- that grouping is left untouched here, on purpose, so this component
// never assumes today's department set/count is fixed. The only addition is
// a live overlay from /api/activity's byDepartment map (lib/activityFeed.js)
// for a "working" indicator and a short paraphrased highlight of recent
// activity. "Working" is a recency proxy (something completed recently),
// not a true in-progress signal -- the audit schema has no started/
// in-progress event, only point-in-time completion rows (see
// lib/activityFeed.js's header for the full explanation). Both fetches are
// read-only GETs; nothing here mutates agent/org/workflow state.

const ACTIVITY_POLL_MS = 15000;

function formatRelative(ts: string | null) {
  if (!ts) return null;
  const d = new Date(ts).getTime();
  if (Number.isNaN(d)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function OrgView() {
  const [data, setData] = useState<any>(null);
  const [activity, setActivity] = useState<any>(null);

  useEffect(() => {
    fetch('/api/org').then(r => r.json()).then(setData);
  }, []);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch('/api/activity')
        .then(r => r.json())
        .then(d => { if (!cancelled) setActivity(d); })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, ACTIVITY_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!data) return <div className="empty-state">Loading org chart...</div>;
  if (!data.configured) return <div className="empty-state">Run setup first.</div>;

  const byDepartment = (activity && activity.configured && activity.byDepartment) || {};

  return (
    <div className="org-grid">
      {data.departments.map((dept: any) => {
        const deptActivity = byDepartment[dept.department] || null;
        const working = Boolean(deptActivity && deptActivity.working);
        const relative = deptActivity ? formatRelative(deptActivity.lastActivity) : null;
        return (
          <div key={dept.department} className="org-card">
            <div className="org-card-header">
              <span>{dept.department}</span>
              {working && (
                <span className="org-working-indicator" title="Activity completed recently">
                  <span className="org-working-dot" />
                  active
                </span>
              )}
            </div>
            {dept.agents.map((agent: any) => (
              <div key={agent.id} className="org-agent">
                <span className="org-agent-name">{agent.name}</span>
                <span className="org-agent-title">{agent.title}</span>
              </div>
            ))}
            {deptActivity && deptActivity.highlight && (
              <div className="org-highlight">
                {deptActivity.highlight}
                {relative && <span className="org-highlight-time"> · {relative}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
