'use client';

import { useEffect, useState } from 'react';

export default function OrgView() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/org').then(r => r.json()).then(setData);
  }, []);

  if (!data) return <div className="empty-state">Loading org chart...</div>;
  if (!data.configured) return <div className="empty-state">Run setup first.</div>;

  return (
    <div className="org-grid">
      {data.departments.map((dept: any) => (
        <div key={dept.department} className="org-card">
          <div className="org-card-header">{dept.department}</div>
          {dept.agents.map((agent: any) => (
            <div key={agent.id} className="org-agent">
              <span className="org-agent-name">{agent.name}</span>
              <span className="org-agent-title">{agent.title}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
