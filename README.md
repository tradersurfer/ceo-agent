# CEO Agent

**The AI that runs your AI workforce.**

CEO Agent is an orchestration layer that sits above your other AI agents and models. It learns your business, knows who's responsible for what, decides who handles a task, and answers for the outcome — the way a real CEO runs a company, not the way a chatbot answers a question.

You can rename her on install. The role doesn't change.

> **Status: working v1, CLI.** Identity, SDK, organizational model, setup wizard, chat interface, dispatch API, and workflow execution engine are all built and live-tested. A web interface is in progress. See [Roadmap](#roadmap).

---

## Install and run it

Not yet published to npm — install from the repository.

```
git clone https://github.com/tradersurfer/ceo-agent.git
cd ceo-agent
npm install
npm run setup
```

Requires Node 18 or newer. The setup wizard will:
- Name your CEO Agent
- Ask about your business
- Let you activate whichever departments you need
- Choose flagship or efficient cost mode
- Save your OpenRouter key to a local, gitignored `.env`
- Launch straight into the chat interface

After setup, start it again anytime:

```
npm start
```

Inside the chat interface:

```
/org       show your active org chart
/status    runtime + agent status
/models    resolved model assignments (both cost tiers)
/cost      view or change cost mode (flagship / efficient)
/help      full command list
/exit      quit
```

Address a department head directly with `@department`, e.g. `@legal draft an NDA clause`. Anything else goes to CEO Agent directly.

---

## What Makes This Different

Most "AI assistants" answer one question at a time. CEO Agent runs the org: she knows which department head owns which kind of work, delegates to them, and stays accountable for the result — while also being able to answer things directly herself when a task doesn't need to go anywhere else.

| Capability | Description |
|---|---|
| Executive orchestration | Owns the top-level decision layer — decides what gets done, in what order, by whom |
| Multi-agent task routing | Reads incoming work, identifies the right department, delegates to the head built for it |
| Model-agnostic | Resolves the current best available model per provider live from OpenRouter, rather than hardcoding stale model names |
| Cost-aware | Dual-tier model resolution (flagship/efficient), prompt caching, real token usage shown after every response |
| Quality control | Reviews delegated work before it's considered done |
| Business-vocabulary interface | Speaks in Business / Department / Employee terms — not agent/prompt/API jargon |

---

## Architecture

```
                         CEO AGENT
                    Chief Intelligence
                    & Orchestration
                          |
       -----------------------------------------------------
       |          |          |            |          |          |
      CFO      HERMES/COO    CTO          CMO        CHRO        CLO
    Finance       Ops       Tech        Market.     People      Legal
                                            |
                                      VP Sales,
                                  Onboarding Comms
```

Seven departments, standard C-suite model. Hermes fills the COO seat directly,
and Marketing includes a VP of Sales plus onboarding communications. The
domain-specific Dispute Agent is retained under `examples/` as a reference
implementation, not activated in the default roster. Activate only the
departments your business needs. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for
the full model.

---

## What's In This Repo

| Path | What it is |
|---|---|
| `IDENTITY.md` | The CEO Agent's white-label identity template |
| `core/` | Runtime config, department management, model routing, workflow execution engine |
| `sdk/` | Agent lifecycle, task routing, memory, permissions — the production SDK |
| `organization/` | The programmatic C-suite org-chart model |
| `bin/setup.js` | Interactive CLI setup wizard |
| `bin/chat.js` | The chat interface — live model calls, cost-mode switching, org chart, status |
| `app/api/dispatch/` | Dispatch API — real bridge execution for automatable agents |
| `departments/operations/hermes/` | Operations department head and bridge (Hermes, powered by [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)) |
| `departments/finance/` | Sales intake and onboarding communications bridges |
| `examples/dispute-agent/` | Optional domain-specific reference implementation; not in the default roster |
| `tests/` | Automated test coverage (WorkflowRuntime, BridgeExecutors) |
| `ARCHITECTURE.md` | The full department / agent product model |
| `SECURITY.md` | Honest security posture — what's handled, what's your responsibility |
| `TASK_ROUTER.md`, `BEHAVIOR.md`, `ORGANIZATION-STRUCTURE.md` | Reference behavior specs |

---

## Who This Is For

- A solo entrepreneur running a local business
- A CFO or CEO at a larger private company who wants an executive AI layer
- A small business owner with their own existing tech stack

Available through both the CLI and the local-only web dashboard.

---

## Roadmap

- [x] White-label identity layer
- [x] Core SDK (task routing, memory, permissions, agent lifecycle)
- [x] Organizational model (standard C-suite: CFO/COO/CTO/CMO/CHRO/CLO)
- [x] Example agent bridges (operations, finance, legal-compliance)
- [x] Installer / setup wizard — built and live-tested
- [x] Chat interface — live model resolution, real completions, cost-mode switching
- [x] Dispatch API — real bridge execution, rate limiting, timing-safe auth
- [x] Workflow execution engine — tested, wired to real bridge executors
- [x] Cost/token optimization — dual-tier models, prompt caching, usage visibility
- [x] Security hardening pass — see `SECURITY.md`
- [x] Web interface — chat, org chart, status, and settings dashboard
- [ ] Marketplace listing as the flagship install

Some install-specific pieces remain by design, not as gaps: production runtime URLs for each bridge, persistent workflow storage, and a scheduler for delayed workflow steps are all things an individual install configures for itself.

---

## License

MIT — see [`LICENSE`](./LICENSE). Copyright (c) 2026 JECI Group, LLC.

---

## Contributing

Issues are being filed as this moves toward a public release — check the Issues tab for open items. PRs welcome.
