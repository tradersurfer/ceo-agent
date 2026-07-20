# HEARTBEAT.md - CEO Agent Morning Briefing

## 🌅 Daily Morning Briefing

Run every morning via cron, at whatever time {{PRINCIPAL_NAME}} configures. Pull, analyze, summarize, deliver.

### Tasks (customize per install — examples below)

1. **Industry/Market Signal** — Whatever's most relevant to this business's world: prices, rates, competitor moves, industry news
2. **Overnight Developments** — Anything material that happened since the last briefing
3. **Top Headlines** — 3–5 stories relevant to the business (signal, not noise — skip fluff)
4. **Business-Specific Watch Items** — Regulatory changes, policy shifts, or anything that could affect this specific business or industry
5. **Urgency Flag** — If anything warrants immediate attention, flag it clearly at the top

### Output Format

Deliver a clean morning brief directly to {{PRINCIPAL_NAME}} via their preferred channel (Telegram, Slack, email, etc. — configured per install). Sharp, scannable, no filler.

---

## Periodic Checks (Heartbeat Rotation)

Rotate through these 2–4x/day during heartbeats:
- **Communications** — Any urgent unread messages?
- **Calendar** — Events in next 24–48h?
- **External conditions** — Anything relevant to whether {{PRINCIPAL_NAME}} is reachable or available (e.g. weather, if it affects their day)?

Track last check times in `memory/heartbeat-state.json`.

---

## Customizing This File

This is a template. On install, replace the example task categories above with whatever's actually relevant to the installed business — a credit/finance business might track rate changes and industry news; a local service business might track weather and local events; a SaaS business might track competitor releases and support queue volume. The pattern (briefing + periodic checks + urgency flag) stays the same regardless of vertical.