const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, fireEvent } = require('@testing-library/react');
const Sidebar = require('../../app/components/Sidebar').default;

afterEach(() => {
  cleanup();
});

function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function renderSidebar(props = {}) {
  return render(
    React.createElement(Sidebar, {
      agentName: 'CEO Agent',
      tab: 'chat',
      onSelect: () => {},
      ...props,
    })
  );
}

test('at a desktop-width viewport (>=640px), the sidebar is expanded by default: agent name and full nav labels are visible', () => {
  setViewportWidth(1024);
  renderSidebar();

  assert.ok(screen.getByText('CEO Agent'));
  assert.ok(screen.getByText('Chat'));
  assert.ok(screen.getByText('Settings'));
  assert.equal(document.querySelector('.sidebar-collapsed'), null);
});

test('at a narrow mobile viewport (390px), the sidebar is collapsed by default: agent name and nav labels are hidden, only icons remain', () => {
  setViewportWidth(390);
  renderSidebar();

  assert.throws(() => screen.getByText('CEO Agent'), 'agent name should not render in the collapsed rail');
  assert.throws(() => screen.getByText('Chat'), 'nav item text labels should not render in the collapsed rail');
  assert.ok(document.querySelector('.sidebar-collapsed'), 'sidebar should carry the collapsed class');
  // Every nav item must still be a real, labeled tap target -- collapsed
  // means icon-only, not unreachable.
  assert.ok(screen.getByLabelText('Chat'));
  assert.ok(screen.getByLabelText('Settings'));
});

test('every nav item stays clickable and fires onSelect while collapsed', () => {
  setViewportWidth(390);
  let selected = null;
  renderSidebar({ onSelect: id => { selected = id; } });

  fireEvent.click(screen.getByLabelText('Org chart'));
  assert.equal(selected, 'org');
});

test('manually collapsing at desktop width sticks -- a later resize back to desktop width does not re-expand it', () => {
  setViewportWidth(1024);
  renderSidebar();

  fireEvent.click(screen.getByLabelText('Collapse sidebar'));
  assert.ok(document.querySelector('.sidebar-collapsed'));

  // Simulate the window actually resizing (still desktop-wide) -- the
  // pre-existing responsive-default effect would, if it weren't gated on
  // the user-toggled flag, snap this back to expanded because 1024px is
  // above the mobile breakpoint. It must not.
  setViewportWidth(1100);
  fireEvent(window, new window.Event('resize'));

  assert.ok(document.querySelector('.sidebar-collapsed'), 'a manual collapse must survive a subsequent resize');
});

test('manually expanding at mobile width sticks -- a later resize stays at mobile width does not re-collapse it', () => {
  setViewportWidth(390);
  renderSidebar();
  assert.ok(document.querySelector('.sidebar-collapsed'));

  fireEvent.click(screen.getByLabelText('Expand sidebar'));
  assert.equal(document.querySelector('.sidebar-collapsed'), null);

  // Still a narrow viewport -- the responsive default alone would want
  // this collapsed. The user's explicit choice to expand must win.
  setViewportWidth(375);
  fireEvent(window, new window.Event('resize'));

  assert.equal(document.querySelector('.sidebar-collapsed'), null, 'a manual expand must survive a subsequent resize at mobile width');
});

test('before any manual toggle, resizing across the breakpoint still re-derives the responsive default', () => {
  setViewportWidth(1024);
  renderSidebar();
  assert.equal(document.querySelector('.sidebar-collapsed'), null);

  setViewportWidth(390);
  fireEvent(window, new window.Event('resize'));

  assert.ok(document.querySelector('.sidebar-collapsed'), 'without a manual toggle yet, the sidebar should still track the responsive default on resize');
});

// -- Drag-resize (#110) --------------------------------------------------

test('expanded sidebar defaults to 180px and renders a resize handle', () => {
  setViewportWidth(1024);
  renderSidebar();
  const sidebar = document.querySelector('.sidebar');
  assert.equal(sidebar.style.width, '180px');
  assert.ok(document.querySelector('.sidebar-resize-handle'), 'expanded sidebar must expose a resize handle');
});

test('collapsed sidebar renders no resize handle and no inline width (CSS-fixed 56px rail wins)', () => {
  setViewportWidth(390);
  renderSidebar();
  assert.equal(document.querySelector('.sidebar-resize-handle'), null, 'collapsed rail must not be draggable');
  const sidebar = document.querySelector('.sidebar');
  assert.equal(sidebar.style.width, '', 'no inline width should be applied while collapsed');
});

test('ArrowRight/ArrowLeft on the resize handle grows/shrinks the sidebar width, clamped to [140, 320]', () => {
  setViewportWidth(1024);
  renderSidebar();
  const handle = document.querySelector('.sidebar-resize-handle');
  const sidebar = document.querySelector('.sidebar');

  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  assert.equal(sidebar.style.width, '190px');

  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  assert.equal(sidebar.style.width, '170px');

  for (let i = 0; i < 20; i += 1) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  assert.equal(sidebar.style.width, '140px', 'width must clamp at the 140px floor, never go below it');

  for (let i = 0; i < 30; i += 1) fireEvent.keyDown(handle, { key: 'ArrowRight' });
  assert.equal(sidebar.style.width, '320px', 'width must clamp at the 320px ceiling, never exceed it');
});

test('collapsing then expanding restores the last dragged width, not the 180px default', () => {
  setViewportWidth(1024);
  renderSidebar();
  const handle = document.querySelector('.sidebar-resize-handle');
  for (let i = 0; i < 5; i += 1) fireEvent.keyDown(handle, { key: 'ArrowRight' });
  assert.equal(document.querySelector('.sidebar').style.width, '230px');

  fireEvent.click(screen.getByLabelText('Collapse sidebar'));
  assert.ok(document.querySelector('.sidebar-collapsed'));

  fireEvent.click(screen.getByLabelText('Expand sidebar'));
  assert.equal(document.querySelector('.sidebar').style.width, '230px', 'expanding again must restore the dragged width, not reset to the 180px default');
});

test('drag-resize does not collapse the sidebar even at the minimum width -- collapsing stays the toggle button\'s job only', () => {
  setViewportWidth(1024);
  renderSidebar();
  const handle = document.querySelector('.sidebar-resize-handle');
  for (let i = 0; i < 20; i += 1) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  assert.equal(document.querySelector('.sidebar').style.width, '140px');
  assert.equal(document.querySelector('.sidebar-collapsed'), null, 'dragging to the width floor must not itself trigger the collapsed state');
});
