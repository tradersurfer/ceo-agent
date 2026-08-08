# SKILL: Refinement Loop
**ID:** `refinement-loop`  
**Version:** 1.0.0  
**Author:** JECI / JECI Group  
**Trigger:** Manual (`run refinement loop`) or after any content/output batch

---

## Purpose
JECI reviews her own outputs before surfacing them to Adrian.
Catches errors, tone drift, policy violations, and quality issues
before they reach Adrian's approval queue.

This is JECI's internal quality gate — not a replacement for Adrian's approval.

---

## When to Run
- After generating a content batch
- After drafting any external-facing document
- After generating dispute letters (quality check only — no legal review)
- After producing any agent output that will be sent to a client or posted publicly

---

## Review Criteria

### 1. Accuracy Check
- [ ] Are all facts verifiable or clearly labeled as estimates?
- [ ] Are Bitcoin prices/stats sourced from today's data?
- [ ] Are credit stats (score ranges, timelines) FCRA-accurate?
- [ ] No guaranteed outcomes stated?

### 2. Tone Check
- [ ] Bitcoin lane: analytical, infrastructure-focused, not price-hype
- [ ] Credit lane: educational, empowering, not fear-based
- [ ] Bridge narrative: used max once per batch?
- [ ] No emojis unless Adrian's style guide allows?

### 3. Policy Check
- [ ] No legal advice given?
- [ ] No financial advice given?
- [ ] No guaranteed credit score increases?
- [ ] No real person quoted with fictional statements?
- [ ] All client PII masked (SSN, full account numbers, DOB)?

### 4. Quality Check
- [ ] Is the output actually useful to the reader?
- [ ] Does it match the platform format (X = 280 chars, Facebook = conversational)?
- [ ] Is the CTA appropriate and not overly salesy?
- [ ] Would Adrian be proud to put his name on this?

---

## Output Format

```
[REFINEMENT LOOP REPORT]
Batch: {content type and date}
Items reviewed: {count}

PASSED: {list items that passed all checks}

FLAGGED: {list items with issues}
  - Item: {title/description}
  - Issue: {specific problem found}
  - Suggested fix: {concrete correction}

BLOCKED: {items that must not be sent — policy violations}

Recommendation: {approve batch | revise flagged items | block batch}
---
Ready for Adrian's final review.
```

---

## Escalation Rules
- **PASS** → surface to Adrian for approval as normal
- **FLAGGED** → auto-revise if fix is simple (typo, format) — else surface to Adrian with flag
- **BLOCKED** → never send, notify Adrian immediately with reason

---

## Example Trigger Commands
- `JECI run refinement loop on last batch` → reviews most recent output
- `JECI refine and resubmit` → revises flagged items and re-queues
- `JECI explain why item was blocked` → detailed explanation of block reason
