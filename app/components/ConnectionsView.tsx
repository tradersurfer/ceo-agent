'use client';

import { useState } from 'react';
import ModelSelector, { ChatRole, CostTier, RoleCatalog } from './ModelSelector';

type ConnectionInfo = { hasKey: boolean; keyMasked: string | null; active: boolean };
type ProviderMeta = { id: string; label: string };

export default function ConnectionsView({ config, onSaved }: { config: any; onSaved: () => void }) {
  // The provider display list (id/label only) is relayed through
  // /api/config's response rather than required directly from lib/
  // providers.js. lib/providers.js is a plain CommonJS module with no
  // import/export syntax of its own — pulling it into the client bundle
  // (however it's imported, `import` or `require()`) trips Next dev's
  // Fast-Refresh instrumentation: webpack injects `import.meta.webpackHot.
  // accept()` into every module reachable from a 'use client' boundary, and
  // that injection is only valid syntax for a file webpack parses as ESM
  // ("Module" grammar). A file with zero import/export statements parses as
  // "Script" grammar instead, so the injected line is a hard parse error —
  // `next build` (production, no Fast-Refresh injection) never catches this,
  // only `next dev` does. Reading it from `config` — server-computed data
  // this component already receives as a prop — avoids bundling the CJS
  // module into the client at all, which is the actual fix, not a
  // require()-vs-import syntax swap (verified that alone does not resolve
  // it: same error, same cache-cleared repro, before this restructuring).
  const providers: ProviderMeta[] = config.providers || [];
  const connections: Record<string, ConnectionInfo> = config.connections || {};
  const catalog: RoleCatalog | null = config.catalog || null;

  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, { role: ChatRole; tier: CostTier }>>({});

  function draftFor(id: string) {
    return keyDrafts[id] || '';
  }

  function setDraft(id: string, val: string) {
    setKeyDrafts(prev => ({ ...prev, [id]: val }));
    // Typing clears a previous error/success line so a stale "rejected by
    // OpenRouter" doesn't sit under a field the user is actively retyping.
    setErrorMessage(prev => (prev[id] ? { ...prev, [id]: '' } : prev));
  }

  function selectionFor(id: string): { role: ChatRole; tier: CostTier } {
    return selections[id] || { role: 'claude', tier: config.costMode === 'efficient' ? 'efficient' : 'flagship' };
  }

  async function saveKey(providerId: string) {
    const value = draftFor(providerId).trim();
    if (!value) return;
    setSaving(providerId);
    setSavedMessage(prev => ({ ...prev, [providerId]: '' }));
    setErrorMessage(prev => ({ ...prev, [providerId]: '' }));

    let res: Response;
    try {
      res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerKeys: { [providerId]: value } }),
      });
    } catch {
      // Network-level failure reaching our own server — no HTTP status and
      // therefore no server-provided reason to show.
      setErrorMessage(prev => ({ ...prev, [providerId]: 'Could not reach the server. Check your connection and try again.' }));
      setSaving(null);
      return;
    }

    if (res.ok) {
      setDraft(providerId, '');
      setSavedMessage(prev => ({ ...prev, [providerId]: 'Saved.' }));
      onSaved();
    } else {
      // Show the server's specific reason ("That OpenRouter API key was
      // rejected…", "That looks like an OpenAI key…", "could not reach the
      // provider…") instead of the old blanket "Save failed." The server
      // returns an author-written, key-free message; fall back to a generic
      // one only if the body is missing or unparseable.
      let detail = 'Save failed.';
      try {
        const body = await res.json();
        if (body && typeof body.error === 'string' && body.error) detail = body.error;
      } catch {
        // Non-JSON error body (proxy/gateway page) — keep the generic text.
      }
      setErrorMessage(prev => ({ ...prev, [providerId]: detail }));
    }
    setSaving(null);
  }

  return (
    <div className="connections-view">
      {providers.map((provider: ProviderMeta) => {
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
              {saving === provider.id ? 'Checking…' : 'Save key'}
            </button>
            {savedMessage[provider.id] && <span className="hint">{savedMessage[provider.id]}</span>}
            {/* Real reason the key was refused — e.g. rejected by the
                provider, or pasted into the wrong provider's card. Rendered
                in an aria-live region so a screen reader announces a
                rejection that arrives asynchronously. */}
            {errorMessage[provider.id] && (
              <span className="hint connection-error" role="alert" data-testid={`connection-error-${provider.id}`}>
                {errorMessage[provider.id]}
              </span>
            )}

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
