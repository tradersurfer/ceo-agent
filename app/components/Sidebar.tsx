'use client';

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'org', label: 'Org chart' },
  { id: 'status', label: 'Status' },
  { id: 'activity', label: 'Activity' },
  { id: 'add', label: 'Add agent' },
  { id: 'connections', label: 'Connections' },
  { id: 'settings', label: 'Settings' },
] as const;

export default function Sidebar({
  agentName,
  tab,
  onSelect,
}: {
  agentName: string;
  tab: string;
  onSelect: (t: 'chat' | 'org' | 'status' | 'activity' | 'add' | 'connections' | 'settings') => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">{agentName}</div>
      <nav>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-item ${tab === t.id ? 'active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
