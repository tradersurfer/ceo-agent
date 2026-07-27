'use client';

import { useState } from 'react';
import ModelSelector, { ChatRole, CostTier, RoleCatalog } from './ModelSelector';
import { PROVIDERS } from '../../lib/providers';

type ConnectionInfo = { hasKey: boolean; keyMasked: string | null; active: boolean };

export default function ConnectionsView({ config, onSaved }: { config: any; onSaved: () => void }) {
  const connections: Record<string, ConnectionInfo> = config.connections || {};
  const catalog: RoleCatalog | null = config.catalog || null;

  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, { role: ChatRole; tier: CostTier }>>({});

  function draftFor(id: string) {
    return keyDrafts[id] || '';
  }

  function setDraft(id: string, val: string) {
    setKeyDrafts(prev => ({ ...prev, [id]: val }));
  }

  function selectionFor(id: string): { role: ChatRole; tier: CostTier } {
    return selections[id] || { role: 'claude', tier: config.costMode === 'efficient' ? 'efficient' : 'flagship' };
  }

  async function saveKey(providerId: string) {
    const value = draftFor(providerId).trim();
    if (!value) return;
    setSaving(providerId);
    setSavedMessage(prev => ({ ...prev, [providerId]: '' }));

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerKeys: { [providerId]: value } }),
    });

    if (res.ok) {
      setDraft(providerId, '');
      setSavedMessage(prev => ({ ...prev, [providerId]: 'Saved.' }));
      onSaved();
    } else {
      setSavedMessage(prev => ({ ...prev, [providerId]: 'Save failed.' }));
    }
    setSaving(null);
  }

  return (
    <div className="connections-view">
      {PROVIDERS.map((provider: { id: string; label: string }) => {
        const info: ConnectionInfo = connections[provider.id] || { hasKey: false, keyMasked: null, active: false };
        return (
          <div key={provider.id} className="connection-card">
            <div className="connection-card-header">
              <span className="connection-card-name">{provider.label}</span>
              <span className={`connection-status ${info.hasKey ? 'connection-status-connected' : 'connection-status-disconnected'}`}>
                {info.hasKey
                  ? info.active
                    ? provider.id === 'openrouter'
                      ? 'Connected'
                      // Dispatch-active without a resolved catalog (e.g.
                      // Anthropic, BYNGE Phase 2) — mirrors ModelSelector's
                      // own "direct calls enabled" copy below so this header
                      // line never overstates what's active (see
                      // ModelSelector.tsx's active-vs-catalog distinction).
                      : 'Connected — direct calls enabled'
                    : 'Connected — not active'
                  : 'Not connected'}
              </span>
            </div>
            <label>
              API key {info.hasKey && <span className="hint">(currently: {info.keyMasked})</span>}
              <input
                type="password"
                value={draftFor(provider.id)}
                onChange={e => setDraft(provider.id, e.target.value)}
                placeholder={info.hasKey ? 'Leave blank to keep current key' : 'Paste your key'}
              />
            </label>
            <button onClick={() => saveKey(provider.id)} disabled={saving === provider.id || !draftFor(provider.id).trim()}>
              {saving === provider.id ? 'Saving...' : 'Save key'}
            </button>
            {savedMessage[provider.id] && <span className="hint">{savedMessage[provider.id]}</span>}

            <div className="connection-card-models">
              <ModelSelector
                mode="expanded"
                active={info.active}
                connected={info.hasKey}
                // Only OpenRouter has a resolved role/tier catalog — that's
                // ModelBroker/ModelResolver's only data source (ADR-006's
                // catalog-merging across direct providers is out of scope).
                // A provider can be `active` (dispatch-wired, e.g. Anthropic
                // as of BYNGE Phase 2) without having one; gate on the
                // provider id itself, not on `info.active`, so a future
                // dispatch-active provider never silently inherits
                // OpenRouter's catalog under its own label.
                catalog={provider.id === 'openrouter' ? catalog : null}
                value={selectionFor(provider.id)}
                onChange={next => setSelections(prev => ({ ...prev, [provider.id]: next }))}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
