# Dispute Agent Reference

## Identity

**ID:** `dispute_agent`

**Name:** Dispute Agent

**Title:** Dispute Automation Agent

**Reports To:** CLO Agent

---

## Purpose

This example demonstrates how a domain-specific automation agent can integrate
with CEO Agent without becoming part of the default install. It is intended as
a reference for regulated or approval-sensitive workflows.

The example validates every task against configured projects, approvers, and
task types before attempting runtime execution.

---

## Default Status

This agent is not included in `organization/Organization.js` or
`registry/agent-registry.json`. An installer must review the domain assumptions,
configure the required environment variables, and explicitly register it before
using it.

---

## Allowed Task Types

- `intake_parsing`
- `pdf_parse`
- `dispute_generate`
- `dispute_parse_response`
- `dispute_strategy`
- `letter_package`
- `email_sequence`
- `agent_loop_trigger`
- `crm_action`

---

## Bridge

`examples/dispute-agent/src/DisputeAgentBridge.js`

Runtime connectivity is configured per install:

- `DISPUTE_AGENT_URL` — base URL for the reviewed runtime
- `DISPUTE_AGENT_WEBHOOK_SECRET` — secret sent through the
  `x-dispute-secret` request header

No runtime URL, credential, tenant identity, or business-specific rule is
hardcoded in this example.

---

## Safety Boundary

- Do not send letters or external communications without the installer's
  required approval.
- Do not treat generated material as legal advice or a legal guarantee.
- Do not modify client records outside the configured project scope.
- Do not enable this example without reviewing its runtime and data-handling
  requirements for the intended jurisdiction.
