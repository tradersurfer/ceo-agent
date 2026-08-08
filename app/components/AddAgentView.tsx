'use client';

import { useState } from 'react';

const DEPARTMENTS = [
  { id: 'finance', label: 'Finance (CFO)' },
  { id: 'operations', label: 'Operations (COO)' },
  { id: 'technology', label: 'Technology (CTO)' },
  { id: 'marketing', label: 'Marketing (CMO)' },
  { id: 'people', label: 'People (CHRO)' },
  { id: 'legal', label: 'Legal (CLO)' },
];

export default function AddAgentView({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('marketing');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, title, department, description }),
      });
      const data = await res.json();
      if (res.ok && data.created) {
        setMessage(`Created ${data.agent.name} (${data.agent.id}), reporting to ${data.agent.reportsTo}.`);
        setName('');
        setTitle('');
        setDescription('');
        onCreated();
      } else {
        setMessage((data.details && data.details.join(' ')) || data.error || 'Create failed.');
      }
    } catch {
      setMessage('Request failed. Check that the server is running.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-form">
      <label>
        Name
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Growth Lead" />
      </label>
      <label>
        Title
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Head of Growth" />
      </label>
      <label>
        Department
        <select value={department} onChange={e => setDepartment(e.target.value)}>
          {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </label>
      <label>
        Description
        <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="One paragraph: what this agent owns." />
      </label>
      <button onClick={submit} disabled={saving}>{saving ? 'Adding...' : 'Add agent'}</button>
      {message && <span className="hint">{message}</span>}
    </div>
  );
}
