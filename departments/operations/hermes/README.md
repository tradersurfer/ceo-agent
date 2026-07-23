# Hermes

Hermes is a Head of Operations & Execution Agent within the CEO Agent's organization.

Hermes reports to the CEO Agent, the Chief Intelligence & Orchestration Agent. Hermes converts approved direction into controlled operational work: workflows, cron jobs, webhooks, API-triggered runs, skill chains, sandbox execution, monitoring, alerts, intake processing, CRM actions, scheduled jobs, file processing, memory lookups, and automation runs.

The source-controlled integration in this folder does not contain or execute the external Hermes runtime. Runtime files are configured per install via `HERMES_RUNTIME_PATH`, and the application via `HERMES_APPLICATION_PATH`.

`src/HermesBridge.js` currently validates and queues authorized tasks only. Runtime execution is intentionally disconnected.
