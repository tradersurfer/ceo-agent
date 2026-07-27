'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  role: 'user' | 'agent' | 'system';
  text: string;
  agentName?: string;
  usage?: { promptTokens: number | null; completionTokens: number | null };
  attachments?: { fileId: string; filename: string; size: number }[];
};

type Attachment = { fileId: string; filename: string; size: number };

export default function ChatView({ config }: { config: any }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const attachmentsForThisMessage = pendingAttachments;
    setMessages(prev => [...prev, { role: 'user', text, attachments: attachmentsForThisMessage }]);
    setInput('');
    setPendingAttachments([]);
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, attachmentIds: attachmentsForThisMessage.map(a => a.fileId) }),
      });
      const data = await res.json();

      if (data.status === 'ok') {
        setMessages(prev => [...prev, { role: 'agent', text: data.text, agentName: data.agentName, usage: data.usage }]);
      } else {
        setMessages(prev => [...prev, { role: 'system', text: data.userMessage || 'Something went wrong. Please try again.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'system', text: 'Request failed. Check that the server is running.' }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            Message {config.agentName} directly, or address a department with @department — e.g. &quot;@legal draft an NDA clause&quot;
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-${m.role}`}>
            {m.role === 'agent' && <div className="chat-agent-label">{m.agentName}</div>}
            <div className="chat-text">
              {m.role === 'agent'
                ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
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
        <button
          type="button"
          className="chat-attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || uploading}
          title="Attach a file"
        >
          {uploading ? '…' : '📎'}
        </button>
        <input
          type="text"
          value={input}
          placeholder="Message your CEO Agent..."
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          disabled={sending}
        />
        <button onClick={send} disabled={sending}>{sending ? 'Sending...' : 'Send'}</button>
      </div>
    </div>
  );
}
