# JECI Dispute Agent

## Identity

**ID:** dispute_agent  
**Name:** JECI Dispute Agent  
**Title:** Credit Dispute Automation Agent  
**Reports To:** Agent JECI  
**Repo:** tradersurfer/jeci-dispute-agent  
**Stack:** Next.js 14 · TypeScript · Supabase · Anthropic SDK · Stripe · Railway

---

## What This Agent Does

The Dispute Agent is a fully deployed autonomous service that handles the
complete credit dispute lifecycle — from PDF ingestion to letter generation
to bureau response parsing. It operates independently but is supervised
by Agent JECI for task routing and escalation.

---

## Department

`credit_dispute` → routes here from JECI's TaskRouter

---

## Runtime Services

| Route | Purpose |
|-------|---------|
| `POST /api/agent/run` | Trigger the agent action loop (webhook-protected) |
| `POST /api/analyze` | Submit a credit report PDF for full analysis |
| `GET /api/disputes` | List/read dispute records |
| `POST /api/disputes` | Create a dispute record |
| `GET /api/clients` | List clients |
| `POST /api/clients` | Create a client |
| `GET /api/download` | Download generated letter ZIP |
| `POST /api/crc/sync` | Sync with Credit Repair Cloud |
| `GET /api/status` | Health check (to be added) |

---

## Reusable Services (Do Not Duplicate)

These modules in `jeci-dispute-agent` are the canonical implementations.
Any other JECI Group service needing these capabilities should call this
agent rather than re-implementing them.

| Module | Capability |
|--------|-----------|
| `lib/pdf/reportParser.ts` | PDF text extraction → Claude credit report parse |
| `lib/pdf/reportAdapter.ts` | Raw parsed report → structured CreditReport type |
| `lib/email/sequences.ts` | 8-template lifecycle email scheduler |
| `lib/email/resend.ts` | Resend email delivery |
| `action_queue` (Supabase table) | Typed, prioritized, scheduled task queue pattern |

---

## Action Types

The agent loop processes these action types from its `action_queue` table:

- `generate_letter` — Claude produces FCRA/FDCPA dispute letter
- `parse_response` — Claude parses bureau response into structured outcome
- `recommend_next_round` — Strategy engine decides next escalation step
- `follow_up` — Monitors disputes 35 days post-send for non-response
- `escalate` — Flags for human/legal review after 4+ rounds

---

## Bridge

`agents/dispute-agent/src/DisputeAgentBridge.js`

Set env vars to connect runtime:
- `DISPUTE_AGENT_URL` — base URL of the deployed dispute agent (e.g. `https://dispute.railway.app`)
- `DISPUTE_AGENT_WEBHOOK_SECRET` — matches `AGENT_WEBHOOK_SECRET` in the dispute agent's env

---

## What Agent JECI Supervises Here

- Task routing decisions (inbound credit dispute requests go to this agent)
- Escalation handling (when dispute rounds exceed threshold)
- Quality review of letter output before client delivery (future)
- CRC sync coordination through Hermes
