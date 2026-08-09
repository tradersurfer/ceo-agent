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

// Drag-resize bounds (#110). The expanded default is 180px (app/globals.css
// .sidebar) and the collapsed rail is a fixed 56px (see that CSS file's own
// comment for the real content-fit math behind that number) -- drag-resize
// is deliberately scoped to a range strictly above the collapsed rail, not
// down to it: dragging to near-zero does NOT count as "collapsed" (#110's
// own open question). Collapsing stays the explicit toggle button's job so
// the two mechanisms never fight over what "narrow" means. MIN_WIDTH_PX
// (140px) matches the same textarea-floor precedent already documented in
// tests/browser/ChatInputResponsive.test.js -- below that, nav-item-label
// text has too little room to read as more than a sliver next to the icon.
// MAX_WIDTH_PX (320px) is roughly the point past which the sidebar starts
// competing with .content for real reading width on a typical laptop
// viewport rather than just being generously roomy.
const MIN_WIDTH_PX = 140;
const MAX_WIDTH_PX = 320;
const DEFAULT_WIDTH_PX = 180;

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

  // Drag-resize state (#110). width is only ever applied to the DOM while
  // expanded (see the inline style below) -- collapsed always uses the
  // CSS-fixed 56px rail regardless of what width was last dragged.
  // Session-sticky the same way collapse/expand already is: an in-memory
  // value that lives for as long as this component instance does, not
  // persisted to storage (that's an open question #110 explicitly left
  // undecided, not something to assume here).
  const [width, setWidth] = useState(DEFAULT_WIDTH_PX);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

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
    // Expanding from collapsed restores the last dragged (or default)
    // width -- it's still sitting in `width` state, untouched while
    // collapsed, so there's nothing extra to do here; explicitly noted
    // per #110's own open question so this isn't an accidental omission.
    setCollapsed(prev => !prev);
  }

  function clampWidth(value: number) {
    return Math.min(MAX_WIDTH_PX, Math.max(MIN_WIDTH_PX, value));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (collapsed) return;
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    setWidth(clampWidth(drag.startWidth + delta));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (collapsed) return;
    const STEP_PX = 10;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setWidth(prev => clampWidth(prev - STEP_PX));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setWidth(prev => clampWidth(prev + STEP_PX));
    }
  }

  return (
    <aside
      ref={asideRef}
      className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}
      style={collapsed ? undefined : { width: `${width}px` }}
    >
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
      {!collapsed && (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={MIN_WIDTH_PX}
          aria-valuemax={MAX_WIDTH_PX}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
        />
      )}
    </aside>
  );
}
