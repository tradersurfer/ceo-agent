'use client';

import { useState } from 'react';

const ALL_DEPARTMENTS = [
  { id: 'finance', label: 'Finance (CFO)' },
  { id: 'operations', label: 'Operations (COO)' },
  { id: 'technology', label: 'Technology (CTO)' },
  { id: 'marketing', label: 'Marketing (CMO)' },
  { id: 'people', label: 'People (CHRO)' },
  { id: 'legal', label: 'Legal (CLO)' },
];

export default function SettingsView({ config, onSaved }: { config: any; onSaved: () => void }) {
  const [agentName, setAgentName] = useState(config.agentName);
  const [principalName, setPrincipalName] = useState(config.principalName);
  const [businessContext, setBusinessContext] = useState(config.businessContext);
  const [costMode, setCostMode] = useState(config.costMode);
  const [activeDepartments, setActiveDepartments] = useState<string[]>(
    config.activeDepartments.filter((d: string) => d !== 'executive')
  );
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  function toggleDept(id: string) {
    setActiveDepartments(prev => (prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    setSavedMessage('');
    const body: any = { agentName, principalName, businessContext, costMode, activeDepartments };

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSavedMessage('Saved.');
      onSaved();
    } else {
      setSavedMessage('Save failed.');
    }
    setSaving(false);
  }

  return (
    <div className="settings-form">
      <label>
        Agent name
        <input value={agentName} onChange={e => setAgentName(e.target.value)} />
      </label>
      <label>
        Your name
        <input value={principalName} onChange={e => setPrincipalName(e.target.value)} />
      </label>
      <label>
        Business context
        <textarea rows={3} value={businessContext} onChange={e => setBusinessContext(e.target.value)} />
      </label>
      <fieldset>
        <legend>Departments</legend>
        {ALL_DEPARTMENTS.map(d => (
          <label key={d.id} className="checkbox-row">
            <input type="checkbox" checked={activeDepartments.includes(d.id)} onChange={() => toggleDept(d.id)} />
            {d.label}
          </label>
        ))}
      </fieldset>
      <label>
        Cost mode
        <select value={costMode} onChange={e => setCostMode(e.target.value)}>
          <option value="flagship">Flagship</option>
          <option value="efficient">Efficient</option>
        </select>
      </label>
      <p className="hint">
        Manage provider API keys (OpenRouter, Anthropic, OpenAI, Google, xAI) in the Connections tab.
      </p>
      <button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
      {savedMessage && <span className="hint">{savedMessage}</span>}
    </div>
  );
}
