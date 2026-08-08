'use client';

import { useEffect, useState } from 'react';

export default function StatusView() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setData);
  }, []);

  if (!data) return <div className="empty-state">Loading status...</div>;
  if (!data.configured) return <div className="empty-state">Run setup first.</div>;

  const status = data.status || {};

  return (
    <div>
      <div className="status-cards">
        <div className="status-card">
          <p className="status-label">Active agents</p>
          <p className="status-value">{status.agentCount ?? '—'}</p>
        </div>
        <div className="status-card">
          <p className="status-label">Cost mode</p>
          <p className="status-value">{data.costMode}</p>
        </div>
        <div className="status-card">
          <p className="status-label">Health</p>
          <p className="status-value status-healthy">{status.health || 'unknown'}</p>
        </div>
      </div>
      <div className="status-list">
        {(status.agents || []).map((id: string) => (
          <div key={id} className="status-row">
            <span>{id}</span>
            <span className="status-ready">ready</span>
          </div>
        ))}
      </div>
    </div>
  );
}
