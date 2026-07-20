# CEO Agent

**The AI that runs your AI workforce.**

CEO Agent is an orchestration layer that sits above your other AI agents and models. It learns your business, knows who's responsible for what, decides who handles a task, and answers for the outcome — the way a real CEO runs a company, not the way a chatbot answers a question.

You can rename her on install. The role doesn't change.

> **Status: early scaffold.** The identity layer, SDK, organizational model, and a handful of example agent bridges are here and working. The installer wizard, full runtime wiring, and marketplace integration are still being built. See [Roadmap](#roadmap).

---

## What Makes This Different

Most "AI assistants" answer one question at a time. CEO Agent runs the org: she knows which agent handles which kind of work, delegates to it, checks the result, and reports back — while also being able to answer things directly herself when a task doesn't need a heavier agent at all.

| Capability | Description |
|---|---|
| **Executive orchestration** | Owns the top-level decision layer — decides what gets done, in what order, by which agent |
| **Multi-agent task routing** | Reads incoming work, identifies the right domain, delegates to the agent built for it |
| **Model-agnostic** | Chooses which underlying model handles a task, rather than defaulting to one option for everything |
| **Organizational memory** | Persists context across every agent and every session |
| **Quality control** | Reviews delegated work before it's considered done |
| **Business-vocabulary interface** | Speaks in Business / Office / Department / Employee terms — not agent/prompt/API jargon |

---

## Architecture

                         ┌─────────────────────┐
                         │      CEO AGENT       │
                         │  Chief Intelligence  │
                         │  & Orchestration     │
                         └──────────┬───────────┘
                                    │
            ┌───────────────┬──────┴──────┬───────────────┐
            ▼               ▼             ▼               ▼
     ┌─────────────┐ ┌─────────────┐ ┌──────────┐ ┌──────────────┐
     │ Operations  │ │ Engineering │ │  Client  │ │   Finance    │
     │   Agent     │ │    Agent    │ │ Success  │ │    Agent     │
     └─────────────┘ └─────────────┘ └──────────┘ └──────────────┘
            │               │             │               │
            ▼               ▼             ▼               ▼
     ┌─────────────┐ ┌──────────────┐ ┌──────────────────────────┐
     │   Content    │ │    Growth    │ │          Design          │
     │    Agent     │ │    Agent     │ │           Agent          │
     └─────────────┘ └──────────────┘ └──────────────────────────┘

CEO Agent sits above every specialized agent. She never does the specialized work herself — she decides *who* does it, *in what order*, and *whether the output is good enough to ship*. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full multi-tenant model.

---

## What's In This Repo

| Path | What it is |
|---|---|
| `IDENTITY.md` | The CEO Agent's white-label identity template |
| `core/` | Runtime config, department management, model routing |
| `sdk/` | Agent lifecycle, task routing, memory, permissions — the production SDK |
| `organization/` | The programmatic org-chart model (departments, roles, agents) |
| `agents/operations/hermes/` | Example operations agent bridge (Hermes, powered by [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)) |
| `agents/finance/` `agents/legal-compliance/` | Example domain-specific agent bridges |
| `ARCHITECTURE.md` | The full tenant / office / agent product model |
| `TASK_ROUTER.md`, `BEHAVIOR.md`, `ORGANIZATION-STRUCTURE.md` | Reference behavior specs |

---

## Who This Is For

Built to plug into and become the CEO for:
- A solo entrepreneur running a local business
- A CFO or CEO at a larger private company who wants an executive AI layer
- A small business owner with their own existing tech stack

Across desktop, web, and — eventually — mobile.

---

## Roadmap

- [x] White-label identity layer
- [x] Core SDK (task routing, memory, permissions, agent lifecycle)
- [x] Organizational model
- [x] Example agent bridges (operations, finance, legal-compliance)
- [ ] Installer / setup wizard (name your agent, connect models, activate departments)
- [ ] Full runtime wiring (dispatch API, workflow execution)
- [ ] Cost/token optimization pass
- [ ] Security hardening pass
- [ ] Marketplace listing as the flagship install

---

## License

MIT — see [`LICENSE`](./LICENSE). Copyright (c) 2026 JECI Group, LLC.

---

## Contributing

This is an early-stage scaffold. Issues and PRs welcome once the repo is public — check back or watch this repo for updates.
