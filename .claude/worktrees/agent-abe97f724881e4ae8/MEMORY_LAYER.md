# Shared Memory Layer

The CEO Agent uses a Supabase-backed shared memory layer so agents can persist decisions, summaries, handoffs, facts, and task status across sessions.

The schema lives in your own Supabase project (configured per install — see `.env`):

- `public.memory_sessions`: one active, completed, or handed-off work session.
- `public.memory_entries`: chronological memory records linked to a tenant and optionally a session.

RLS is enabled. Server-side code must use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your own environment; never commit real keys.

## Client

The thin SDK client lives at `sdk/MemoryClient.js`.

Core calls:

- `startSession({ tenantId, agentSource, topic })`
- `writeEntry({ tenantId, sessionId, agentSource, entryType, title, content, relatedEntryIds, metadata, expiresAt })`
- `getRecentEntries({ tenantId, sessionId, agentSource, entryType, limit })`
- `getSessionWithEntries(sessionId)`
- `handoff({ fromAgent, toAgent, sessionId, title, content, relatedEntryIds })`
- `searchByText(query, { tenantId, limit })`

`agentSource` is always explicit. The client does not infer which agent is calling.

## Handoff Example

```js
const MemoryClient = require('./sdk/MemoryClient');

const memory = new MemoryClient();

const session = await memory.startSession({
  tenantId: null,
  agentSource: 'ceo_agent',
  topic: 'Example task handoff',
});

await memory.handoff({
  fromAgent: 'ceo_agent',
  toAgent: 'hermes',
  sessionId: session.id,
  title: 'Handoff example',
  content: 'Describe what was completed and what the next agent should do.',
});

const resumed = await memory.getSessionWithEntries(session.id);
console.log(resumed.entries);
```

## Dispatch Integration

`app/api/dispatch/handler.js` writes a `task_status` entry for each dispatch when Supabase env vars are configured. If Supabase is not configured or the memory write fails, dispatch continues. This is additive and does not replace the existing JSON-file memory/state mechanisms.

## Setup

To wire this up for your own install:

1. Create a Supabase project.
2. Run the schema migration for `memory_sessions` and `memory_entries` (see `sdk/MemoryStore.js` for the expected shape).
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your `.env`.
4. Enable RLS on both tables before going to production.