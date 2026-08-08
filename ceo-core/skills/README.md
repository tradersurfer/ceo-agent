# Skills Organization

This directory contains all skill handler files registered with the
`SkillRegistry` via `core/RegistryLoader.js`.

## Current structure (flat)

```
core/skills/
  |- exampleSkills.js           — 3 example skills (summarize, format, lookup)
  |- managerSkills.js           — 10 management skills (decomposition, delegation, etc.)
  |- scopeCreepSkill.js          — 1 code review skill
  |- schemaMarkupSkills.js       — 4 schema.org markup skills
  |- contentQualitySkill.js      — 1 content quality analysis skill
  |- documentCreationSkills.js   — 3 document generation skills (docx, pdf, xlsx)
  |- financialModelSkill.js      — 2 financial skills (model, csv import)
  |- webSearchSkill.js           — 1 web search skill
  |- ceoSkills.js                — 5 CEO scaffold skills
  |- cfoSkills.js                — 8 CFO scaffold skills
  |- cooSkills.js                — 2 COO scaffold skills
  |- ctoSkills.js                — 5 CTO scaffold skills
  |- cmoSkills.js                — 6 CMO scaffold skills
  |- chroSkills.js               — 7 CHRO scaffold skills
  |- cloSkills.js                — 7 CLO scaffold skills
```

## Proposed restructure (needs ADR before adoption)

The following domain-based structure is proposed in `docs/BACKLOG-vision.md`
but has **not been adopted** — it needs its own review/ADR-style decision
before any restructuring, per the standing rule that `/core` structural
changes require explicit approval.

```
core/skills/
  |- marketing/          — schema markup, content quality, social media, brand
  |- data/               — financial modeling, DCF, treasury
  |- integrations/       — webhooks, payment gateway, API sync
  |- legal/              — IRAC, contract audit, regulatory scanning
  |- people/             — spans & layers, nine-box, compensation, ADKAR
  |- technology/         — UI generation, backend, deployment, containerization
  |- executive/          — subsidiary health, partnership transition, roadmap
  |- registry.json       — manifest indexing all skills and routing maps
```

Two architectural rules noted in the proposal:
1. Every skill file should export a standard schema (OpenAI tool-definition
   or Anthropic tool-declaration shape) with description/parameters.
2. A `RegistryLoader.js` should lazy-load only the tool definitions matching
   the active agent's department/workflow stage.

## Sources referenced for future skill expansion

The following sources were identified during the C-suite expansion planning:

### ClawHub ecosystem (https://clawhub.ai)
Scanned trending skills (180 sampled), plugins (1,634 total), and official
organizations (22 total). Relevant findings by category are documented in
`docs/BACKLOG-c-suite-expansion.md`. Key candidates:

- **SpendCap** (@receiptprotocol) — hard spending limits for AI agents (treasury)
- **OrgX for OpenClaw** (@useorgx) — persistent org memory/coordination
- **ClawGuard / ClawLens** — audit guardrails and observability
- **Digital Marketing Pro** — 158 skills / 25 agents for marketing automation
- **Legal Data Plugin** — 66 sources / 100+ countries for legal compliance
- **Stock Analysis** — screening/backtesting for financial analysis

### Local skill sources (not merged — reference only)
These are local paths on the developer's machine that cannot be accessed
from the repository. They are documented here as a manifest of intended
future skill imports:

- `~/.codex/skills/.main/docs` — Codex CLI docs skill
- Hermes clone skills: autonomous-ai-agents, GitHub, note-taking, media,
  domain, devops, apple, social-media, mcp, software-development,
  research, diagramming, productivity, xlsx, pptx, imagine
- `.grok/bundled/skills` — design, execute-plan, pr-babysit
- `.grok/bundled/personas` — design-doc-reviewer, design-doc-writer,
  implementer, researcher, security-auditor, reviewer, test-writer
- `.openclaw/workspace/skills` — content-summarizer, gemini, session-logs,
  summarize-pro

These would each need individual evaluation, licensing check, and
adaptation to the SkillRegistry pattern before import.
