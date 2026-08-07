'use client';

import { useEffect, useRef, useState } from 'react';

// Icon glyphs are plain Unicode symbols, not a fabricated brand asset --
// same convention ChatView's attach button already uses (the paperclip
// emoji, see chat-attach-button). A real per-item SVG icon set would be a
// bigger, separate design decision; these are enough to keep every nav
// item reachable as a real tap target when the sidebar is collapsed to a
// rail, not just a decoration.
const TABS = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'org', label: 'Org chart', icon: '🗂️' },
  { id: 'status', label: 'Status', icon: '📊' },
  { id: 'activity', label: 'Activity', icon: '📈' },
  { id: 'add', label: 'Add agent', icon: '➕' },
  { id: 'connections', label: 'Connections', icon: '🔌' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
] as const;

// Reuses this file's existing "compact layout" breakpoint (see
// app/globals.css: .chat-view/.status-cards max-width:640px, and the
// chat-input-row mobile stack this same session added at 641px) rather
// than introducing a second, different mobile threshold for the sidebar.
const MOBILE_BREAKPOINT_PX = 640;

export default function Sidebar({
  agentName,
  tab,
  onSelect,
}: {
  agentName: string;
  tab: string;
  onSelect: (t: 'chat' | 'org' | 'status' | 'activity' | 'add' | 'connections' | 'settings') => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Once the user manually toggles, their choice sticks for the rest of
  // the session -- the responsive-default effect below checks this ref
  // and stops re-deriving from window width the moment it's set, so a
  // browser resize (or a tab/route change re-rendering this component)
  // never silently reverts a deliberate user choice back to the default.
  const userToggledRef = useRef(false);

  useEffect(() => {
    function applyResponsiveDefault() {
      if (userToggledRef.current) return;
      setCollapsed(window.innerWidth < MOBILE_BREAKPOINT_PX);
    }
    applyResponsiveDefault();
    window.addEventListener('resize', applyResponsiveDefault);
    return () => window.removeEventListener('resize', applyResponsiveDefault);
  }, []);

  function toggleCollapsed() {
    userToggledRef.current = true;
    setCollapsed(prev => !prev);
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <>
            <img src="/logo-mark.png" alt="" width={20} height={20} className="sidebar-logo" />
            <span className="sidebar-header-name">{agentName}</span>
          </>
        )}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <nav>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-item ${tab === t.id ? 'active' : ''}`}
            onClick={() => onSelect(t.id)}
            title={collapsed ? t.label : undefined}
            aria-label={t.label}
          >
            <span className="nav-item-icon" aria-hidden="true">{t.icon}</span>
            {!collapsed && <span className="nav-item-label">{t.label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
