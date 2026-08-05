# Registry migration: payment_gateway_sync → payment_webhook_event_classify

Update in the same PR as the skill handler change:

1. `registry/skill-registry.json` — change skill `id` and `description` to match cooSkills.js
2. `registry/agent-registry.json` — hermes (and any other) skills array entry
3. `organization/Organization.js` — hermes agent `skills` array
4. `docs/BACKLOG-skill-expansion.md` — name reference if present

Do not leave the old id registered; RegistryDrift and agent allowlists must agree.
