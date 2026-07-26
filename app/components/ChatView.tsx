'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  role: 'user' | 'agent' | 'system';
  text: string;
  agentName?: string;
  usage?: { promptTokens: number | null; completionTokens: number | null };
};

export default function ChatView({ config }: { config: any }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
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
            {m.usage && m.usage.promptTokens != null && (
              <div className="chat-usage">{m.usage.promptTokens} prompt &middot; {m.usage.completionTokens} completion</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
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
