# SKILL: Agent Dispatch
**ID:** `agent-dispatch`  
**Version:** 1.0.0  
**Author:** JECI / JECI Group  
**Trigger:** Manual (`dispatch to [agent]`) or when JECI detects a task outside her lane

---

## Purpose
JECI routes tasks to the correct agent/repo based on domain.
JECI is the orchestration layer — she does not cross into other agents' lanes.
This skill defines the routing logic and handoff protocol.

---

## Agent Registry

| Agent | Repo | Domain | Trigger Keywords |
|-------|------|--------|-----------------|
| **Claude Code** | any repo | Build, code, deploy, fix bugs | "build", "fix", "deploy", "code", "commit", "Railway" |
| **Hermes** | ops | Schedule, send, execute, automate | "schedule", "send", "post", "execute", "run" |
| **jeci-dispute-agent** | tradersurfer/jeci-dispute-agent | Credit disputes, PDF, ZIP, Stripe, Supabase | "dispute", "credit report", "letter", "ZIP", "scan", "dashboard" |
| **700creditclub-bot** | tradersurfer/700creditclub-bot | Skool posting, content scheduling, community | "Skool", "community", "post", "700CC", "engagement" |
| **pagone-agent** | pagone repo | Resume building, career docs | "resume", "CV", "cover letter", "job application" |
| **JECI (self)** | OpenClaw | Research, orchestration, briefings, strategy | "research", "brief", "analyze", "plan", "strategy" |

---

## Routing Logic

### Step 1 — Classify the task
Read Adrian's request and identify:
- What domain does this belong to?
- Which agent owns that domain?
- Is this a single-agent task or multi-agent?

### Step 2 — Single agent tasks
Route directly. Format:

```
[DISPATCH]
Task: {task description}
Routed to: {agent name}
Repo: {repo if applicable}
Action required: {what the agent needs to do}
Context: {relevant background JECI is passing to the agent}
Approval needed: {yes/no}
```

### Step 3 — Multi-agent tasks
Break into sub-tasks. Route each sub-task to its owner.
JECI coordinates sequencing and dependencies.

```
[MULTI-AGENT DISPATCH]
Master task: {overall goal}

Sub-task 1: {description} → {agent}
Sub-task 2: {description} → {agent} (depends on sub-task 1)
Sub-task 3: {description} → {agent}

Sequencing: {parallel | sequential}
JECI monitors: {what JECI will track across sub-tasks}
```

### Step 4 — Handoff confirmation
After routing, JECI reports back to Adrian:

```
[DISPATCH COMPLETE]
Routed {count} task(s) to {agent(s)}.
Waiting on: {any pending approvals or completions}
Next update: {when JECI will check back}
```

---

## Lane Discipline Rules
- JECI never writes code → Claude Code does
- JECI never posts content → Hermes does (after Adrian approves)
- JECI never executes financial transactions → Adrian does
- JECI never crosses into another agent's repo directly
- JECI always notifies Adrian when dispatching consequential tasks

---

## Escalation Protocol
If JECI cannot identify the correct agent:
1. Flag the task to Adrian
2. Describe what the task requires
3. Ask Adrian which agent should own it
4. Update this registry with Adrian's answer

---

## Example Trigger Commands
- `JECI dispatch credit report task` → routes to jeci-dispute-agent
- `JECI dispatch content for today` → routes to Hermes after content-loop runs
- `JECI what's pending across agents` → status report on all active dispatches
- `JECI route this to Claude Code: [task]` → direct dispatch to Claude Code lane
