'use client';

import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import OrgView from './components/OrgView';
import StatusView from './components/StatusView';
import SettingsView from './components/SettingsView';

type Tab = 'chat' | 'org' | 'status' | 'settings';

export default function Home() {
  const [tab, setTab] = useState<Tab>('chat');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function refreshConfig() {
    const res = await fetch('/api/config');
    const data = await res.json();
    setConfig(data);
    setLoading(false);
  }

  useEffect(() => {
    refreshConfig();
  }, []);

  if (loading) {
    return <div className="empty-state">Loading...</div>;
  }

  if (!config.configured) {
    return (
      <div className="empty-state">
        <h1>No CEO Agent found</h1>
        <p>
          Run <code>npm run setup</code> in your terminal first, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar agentName={config.agentName} tab={tab} onSelect={setTab} />
      <main className="content">
        {tab === 'chat' && <ChatView config={config} />}
        {tab === 'org' && <OrgView />}
        {tab === 'status' && <StatusView />}
        {tab === 'settings' && <SettingsView config={config} onSaved={refreshConfig} />}
      </main>
    </div>
  );
}
