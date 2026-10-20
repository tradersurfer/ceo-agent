#!/usr/bin/env node
/**
 * CEO Agent TUI — Full-screen terminal interface (Part 13)
 * Built with Ink (React for CLIs), rebind from hermes-agent/ui-tui to ceo-core
 */

const React = require('react');
const { createRuntime } = require('../ceo-core/runtimeFactory.js');
const { registerBridgeExecutors } = require('../ceo-core/BridgeExecutors.js');
const { WorkflowRuntime } = require('../ceo-core/WorkflowRuntime.js');
const { Organization } = require('../organization/Organization.js');
const { CapabilityResolver } = require('../sdk/CapabilityResolver.js');

// Dynamic import for ink (ESM-only with top-level await)
let Text, Box, useInput, useApp, render;
async function loadInk() {
  const ink = await import('ink');
  Text = ink.Text;
  Box = ink.Box;
  useInput = ink.useInput;
  useApp = ink.useApp;
  render = ink.render;
}

// --- TUI Components ---------------------------------------------------------

function Header({ runtime, onModelChange }) {
  const org = Organization.createDefault();
  const departments = org.getAllAgents().map(a => a.department).filter(Boolean);
  const uniqueDepts = [...new Set(departments)];

  return React.createElement(Box, { flexDirection: "row", paddingX: 1, paddingY: 1, borderStyle: "single", borderColor: "blue" },
    React.createElement(Text, { bold: true, color: "cyan" }, "CEO Agent TUI"),
    React.createElement(Text, { color: "gray" }, " | "),
    React.createElement(Text, null, "Departments: " + uniqueDepts.join(', ')),
    React.createElement(Text, { color: "gray" }, " | "),
    React.createElement(Text, null, "Agents: " + org.getAllAgents().length)
  );
}

function AgentList({ runtime }) {
  const org = Organization.createDefault();
  const agents = org.getAllAgents();

  return React.createElement(Box, { flexDirection: "column", paddingX: 1, paddingY: 1, borderStyle: "single", borderColor: "green" },
    React.createElement(Text, { bold: true }, "Available Agents"),
    agents.map(agent =>
      React.createElement(Box, { key: agent.id, flexDirection: "row", marginTop: 1 },
        React.createElement(Text, { color: "yellow" }, "▸ "),
        React.createElement(Text, { bold: true }, agent.title),
        React.createElement(Text, { color: "gray" }, " (" + agent.id + ")"),
        React.createElement(Text, { color: "gray" }, " — "),
        React.createElement(Text, { color: "blue" }, agent.department)
      )
    )
  );
}

function ChatArea({ runtime, onSend }) {
  const [input, setInput] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const { stdin, stdout } = useApp();

  const handleSubmit = React.useCallback(() => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    onSend(userMsg);
  }, [input, onSend]);

  useInput((input, key) => {
    if (key.return) handleSubmit();
    if (key.ctrl && input === 'c') process.exit(0);
  });

  return React.createElement(Box, { flexDirection: "column", paddingX: 1, paddingY: 1, borderStyle: "single", borderColor: "yellow", height: "100%" },
    React.createElement(Text, { bold: true }, "Chat"),
    React.createElement(Box, { flexDirection: "column", marginTop: 1 },
      messages.map((msg, i) =>
        React.createElement(Box, { key: i, flexDirection: "row", marginBottom: 1 },
          React.createElement(Text, { color: msg.role === 'user' ? 'cyan' : 'magenta' }, msg.role === 'user' ? 'You' : 'Agent' + ": "),
          React.createElement(Text, null, msg.content)
        )
      )
    ),
    React.createElement(Box, { flexDirection: "row", marginTop: 1 },
      React.createElement(Text, { color: "gray" }, "› "),
      React.createElement(Text, null,
        React.createElement('input', {
          value: input,
          onChange: e => setInput(e.target.value),
          onKeyDown: e => e.key === 'Enter' && handleSubmit(),
          style: { border: 'none', outline: 'none', flex: 1, background: 'transparent' }
        })
      )
    )
  );
}

function StatusBar({ runtime }) {
  return React.createElement(Box, { flexDirection: "row", paddingX: 1, paddingY: 1, borderStyle: "single", borderColor: "gray" },
    React.createElement(Text, { color: "green" }, "● Connected"),
    React.createElement(Text, { color: "gray" }, " | "),
    React.createElement(Text, null, "Mode: Interactive"),
    React.createElement(Text, { color: "gray" }, " | "),
    React.createElement(Text, null, "Ctrl+C to exit")
  );
}

// --- Main App ---------------------------------------------------------------

function TUIApp({ runtime }) {
  const [selectedAgent, setSelectedAgent] = React.useState(null);

  const handleSend = React.useCallback(async (message) => {
    // TODO: Dispatch to selected agent via ceo-core
    // For now, just echo
    console.log(`Sending to ${selectedAgent || 'default'}: ${message}`);
  }, [selectedAgent]);

  return React.createElement(Box, { flexDirection: "column", height: "100%" },
    React.createElement(Header, { runtime: runtime, onModelChange: () => {} }),
    React.createElement(Box, { flexDirection: "row", flex: 1 },
      React.createElement(AgentList, { runtime: runtime }),
      React.createElement(ChatArea, { runtime: runtime, onSend: handleSend })
    ),
    React.createElement(StatusBar, { runtime: runtime })
  );
}

// --- Entry Point ------------------------------------------------------------

async function main() {
  console.log('Starting CEO Agent TUI...\n');

  // Initialize ceo-core runtime with required config
  const runtime = createRuntime({
    activeDepartments: ['finance', 'operations', 'technology', 'marketing', 'people', 'legal'],
    customAgents: [],
    ceoMode: 'aggressive'
  });
  registerBridgeExecutors(runtime.workflowRuntime, { project: 'ceo-agent' });

  // Dynamic import for ink (ESM-only with top-level await)
  const render = await loadInk();

  // Render the Ink app
  const { unmount } = render(
    React.createElement(TUIApp, { runtime }),
    { patchConsole: true }
  );

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    unmount();
    console.log('\nTUI closed.');
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error('TUI startup failed:', err);
  process.exit(1);
});