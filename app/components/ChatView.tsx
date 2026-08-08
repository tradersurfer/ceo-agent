'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ModelSelector, { ChatRole, CostTier } from './ModelSelector';
import CeoModeSelector from './CeoModeSelector';
import { sanitizeCitations } from '../lib/citations';

type ChatRequestBody = {
  message: string;
  attachmentIds: string[];
  role?: ChatRole;
  tier?: CostTier;
};

type Message = {
  id: string;
  role: 'user' | 'agent' | 'system' | 'skill';
  text: string;
  agentName?: string;
  usage?: { promptTokens: number | null; completionTokens: number | null };
  attachments?: { fileId: string; filename: string; size: number }[];
  skillName?: string;
  skillOutput?: unknown;
  // Captured only on a real agent response, so "regenerate" can replay the
  // exact request that produced it (including any @department/model
  // override) rather than guessing from array position.
  sourceRequest?: ChatRequestBody;
};

type Attachment = { fileId: string; filename: string; size: number };

// Textarea auto-resize (Issue: chat input was a single-line <input>, capped
// at one line no matter how long the message). Grows with content up to
// this height, then scrolls -- matches the ~4-line cap a chat compose box
// conventionally uses without letting one message push the whole layout
// around indefinitely.
const TEXTAREA_MIN_HEIGHT_PX = 40;
const TEXTAREA_MAX_HEIGHT_PX = 120;

export default function ChatView({ config, onConfigChange }: { config: any; onConfigChange?: () => void | Promise<void> }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // Tracks which single message is being regenerated, separate from
  // `sending` (a brand-new send), so only that message's own button
  // disables/shows a busy state instead of the whole compose row.
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // null = no override — the department default resolves the role/tier
  // server-side (core/resolveDepartmentRole.js). Set only when the user
  // actively picks a model here; this is a per-message, session-only
  // override, never persisted back to ceo-agent.config.json (where the
  // selection ultimately "should" live long-term is explicitly flagged as
  // unresolved in docs/design/BYNGE-connection-scoping.md §3).
  const [modelOverride, setModelOverride] = useState<{ role: ChatRole; tier: CostTier } | null>(null);
  const [savingCeoMode, setSavingCeoMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextIdRef = useRef(0);

  const defaultTier: CostTier = config.costMode === 'efficient' ? 'efficient' : 'flagship';
  const selectorValue = modelOverride || { role: 'claude' as ChatRole, tier: defaultTier };
  const openRouterConnection = config.connections?.openrouter || { hasKey: false, active: true };
  const ceoModes = config.ceoModes || [];
  const ceoModeValue = config.ceoMode || 'aggressive';
  const busy = sending || regeneratingId !== null;

  function nextId() {
    nextIdRef.current += 1;
    return `m${nextIdRef.current}`;
  }

  // Persists like SettingsView's save, not modelOverride's session-only
  // state above -- CEO mode is a runtime-wide setting (bin/chat.js's `/mode`
  // persists+rebuilds the same way), not a per-message override. Sends the
  // existing costMode/activeDepartments through explicitly: the shared
  // POST /api/config handler resets costMode to 'flagship' whenever a
  // request omits it (see route.ts), so a ceoMode-only body would silently
  // downgrade an efficient-tier setup.
  async function handleCeoModeChange(nextMode: string) {
    if (nextMode === ceoModeValue || savingCeoMode) return;
    setSavingCeoMode(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: config.agentName,
          principalName: config.principalName,
          businessContext: config.businessContext,
          activeDepartments: config.activeDepartments,
          costMode: config.costMode,
          departmentModelDefaults: config.departmentModelDefaults,
          ceoMode: nextMode,
        }),
      });
      await onConfigChange?.();
    } finally {
      setSavingCeoMode(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // An empty textarea's scrollHeight is an inflated browser artifact (it
    // does not match the height a single real line of typed text measures
    // at) -- rather than clamp a bogus number, go straight to the min
    // height when there is nothing typed.
    if (!el.value) {
      el.style.height = `${TEXTAREA_MIN_HEIGHT_PX}px`;
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN_HEIGHT_PX), TEXTAREA_MAX_HEIGHT_PX)}px`;
  }, [input]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setPendingAttachments(prev => [...prev, { fileId: data.fileId, filename: data.filename, size: data.size }]);
      } else {
        setUploadError(data.error || 'Upload failed.');
      }
    } catch {
      setUploadError('Upload failed. Check that the server is running.');
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(fileId: string) {
    setPendingAttachments(prev => prev.filter(a => a.fileId !== fileId));
  }

  // Shared by send() and regenerate() so both replay identical request/
  // response handling -- regenerate must reproduce exactly what a first
  // send would have done for the same body, not a parallel implementation.
  async function postChat(body: ChatRequestBody) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const attachmentsForThisMessage = pendingAttachments;
    const requestBody: ChatRequestBody = {
      message: text,
      attachmentIds: attachmentsForThisMessage.map(a => a.fileId),
      ...(modelOverride ? { role: modelOverride.role, tier: modelOverride.tier } : {}),
    };
    setMessages(prev => [...prev, { id: nextId(), role: 'user', text, attachments: attachmentsForThisMessage }]);
    setInput('');
    setPendingAttachments([]);
    setSending(true);

    try {
      const data = await postChat(requestBody);

      if (data.kind === 'skill') {
        if (data.status === 'ok') {
          setMessages(prev => [...prev, { id: nextId(), role: 'skill', text: '', skillName: data.skillName, skillOutput: data.output }]);
        } else {
          setMessages(prev => [...prev, { id: nextId(), role: 'system', text: data.userMessage || `Skill "${data.skillName}" failed.` }]);
        }
      } else if (data.status === 'ok') {
        setMessages(prev => [...prev, { id: nextId(), role: 'agent', text: data.text, agentName: data.agentName, usage: data.usage, sourceRequest: requestBody }]);
      } else {
        setMessages(prev => [...prev, { id: nextId(), role: 'system', text: data.userMessage || 'Something went wrong. Please try again.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: nextId(), role: 'system', text: 'Request failed. Check that the server is running.' }]);
    } finally {
      setSending(false);
    }
  }

  // Replays the exact request that produced the given agent message and
  // replaces it in place (same id/position) with the fresh response --
  // never guesses the original request from nearby array position.
  async function regenerate(id: string) {
    const target = messages.find(m => m.id === id);
    if (!target || target.role !== 'agent' || !target.sourceRequest || busy) return;
    setRegeneratingId(id);
    try {
      const data = await postChat(target.sourceRequest);
      if (data.status === 'ok' && data.kind !== 'skill') {
        setMessages(prev => prev.map(m => (
          m.id === id
            ? { ...m, text: data.text, agentName: data.agentName, usage: data.usage }
            : m
        )));
      } else {
        setMessages(prev => [...prev, { id: nextId(), role: 'system', text: data.userMessage || 'Regeneration failed. Please try again.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: nextId(), role: 'system', text: 'Regeneration failed. Check that the server is running.' }]);
    } finally {
      setRegeneratingId(null);
    }
  }

  async function copyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context, no
      // navigator.clipboard in this environment) -- fail silently rather
      // than surface a disruptive error for a non-critical convenience action.
    }
  }

  function editMessage(text: string) {
    setInput(text);
    textareaRef.current?.focus();
  }

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            Message {config.agentName} directly, or address a department with @department — e.g. &quot;@legal draft an NDA clause&quot;.
            Run a skill directly with /name or @name — e.g. &quot;/format_currency {'{"amount": 42.5}'}&quot;.
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`chat-bubble chat-${m.role}`}>
            {m.role === 'agent' && <div className="chat-agent-label">{m.agentName}</div>}
            {m.role === 'skill' && <div className="chat-agent-label">skill: {m.skillName}</div>}
            <div className="chat-text">
              {m.role === 'agent'
                ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitizeCitations(m.text)}</ReactMarkdown>
                : m.role === 'skill'
                  ? <pre className="chat-skill-output">{JSON.stringify(m.skillOutput, null, 2)}</pre>
                  : m.text}
            </div>
            {m.attachments && m.attachments.length > 0 && (
              <div className="chat-attachments">
                {m.attachments.map(a => (
                  <span key={a.fileId} className="chat-attachment-chip">📎 {a.filename}</span>
                ))}
              </div>
            )}
            {m.usage && m.usage.promptTokens != null && (
              <div className="chat-usage">{m.usage.promptTokens} prompt &middot; {m.usage.completionTokens} completion</div>
            )}
            {(m.role === 'agent' || m.role === 'user') && (
              <div className="chat-actions">
                <button
                  type="button"
                  className="chat-action-button"
                  onClick={() => copyMessage(m.id, m.text)}
                  disabled={!m.text}
                >
                  {copiedId === m.id ? 'Copied' : 'Copy'}
                </button>
                {m.role === 'user' && (
                  <button type="button" className="chat-action-button" onClick={() => editMessage(m.text)} disabled={busy}>
                    Edit
                  </button>
                )}
                {m.role === 'agent' && m.sourceRequest && (
                  <button
                    type="button"
                    className="chat-action-button"
                    onClick={() => regenerate(m.id)}
                    disabled={busy}
                  >
                    {regeneratingId === m.id ? 'Regenerating…' : 'Regenerate'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {(pendingAttachments.length > 0 || uploadError) && (
        <div className="chat-pending-attachments">
          {pendingAttachments.map(a => (
            <span key={a.fileId} className="chat-attachment-chip">
              📎 {a.filename}
              <button type="button" className="chat-attachment-remove" onClick={() => removeAttachment(a.fileId)} aria-label={`Remove ${a.filename}`}>×</button>
            </span>
          ))}
          {uploadError && <span className="chat-upload-error">{uploadError}</span>}
        </div>
      )}
      <div className="chat-input-row">
        <input type="file" ref={fileInputRef} onChange={handleFileSelected} style={{ display: 'none' }} />
        {/* Grouped so the responsive breakpoint in globals.css can stack
            .chat-input-toggles (CEO Modes + model role/tier chips -- 11
            toggle chips between them) onto its own row below this one at
            narrow widths, instead of all 11 sharing the same flex row as
            the textarea and crushing it toward zero width. */}
        <div className="chat-input-primary">
          <button
            type="button"
            className="chat-attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || uploading}
            title="Attach a file"
          >
            {uploading ? '…' : '📎'}
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            placeholder="Message your CEO Agent..."
            className="chat-textarea"
            rows={1}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              // Shift+Enter inserts a newline (now that this is a real
              // multi-line textarea) instead of sending.
              if (e.shiftKey) return;
              // Issue #87: an Enter keystroke that confirms an IME composition
              // (e.g. selecting a candidate while typing CJK/predictive text)
              // also fires a native/synthetic 'Enter' keydown. Treating that as
              // a send trigger races the composition-confirming update against
              // the controlled input's value, which can send a garbled or
              // partial in-progress value instead of the finished text.
              // `isComposing` is the standard signal; `keyCode === 229` is the
              // long-standing fallback for browsers/IMEs that don't set
              // `isComposing` reliably on the keydown event.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              send();
            }}
            disabled={busy}
          />
          <button onClick={send} disabled={busy}>{sending ? 'Sending...' : 'Send'}</button>
        </div>
        <div className="chat-input-toggles">
          {ceoModes.length > 0 && (
            <CeoModeSelector
              modes={ceoModes}
              value={ceoModeValue}
              onChange={handleCeoModeChange}
              disabled={busy || savingCeoMode}
            />
          )}
          <div className="chat-model-selector">
            <ModelSelector
              mode="compact"
              active={openRouterConnection.active !== false}
              connected={!!openRouterConnection.hasKey}
              catalog={config.catalog || null}
              value={selectorValue}
              onChange={setModelOverride}
              disabled={busy}
            />
            {modelOverride && (
              <button type="button" className="chat-model-reset" onClick={() => setModelOverride(null)}>
                Use department default
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
