# SKILL: Content Loop
**ID:** `content-loop`  
**Version:** 1.0.0  
**Author:** JECI / JECI Group  
**Trigger:** Manual (`run content loop`) or scheduled (daily 9AM EST)

---

## Purpose
Generate a daily batch of on-brand content for Adrian Jordan across two lanes:
- **Bitcoin/DeFi lane** → X (@AdrianJordan)
- **Credit repair lane** → Facebook (JECI Credit + personal page)

Content is staged for Adrian's approval before Hermes schedules it.
Never post autonomously. Always surface drafts for review.

---

## Content Sources (Bitcoin Lane)
Pull from these sources when web search is available:
- @TheBitcoinLayer
- @stacker_news
- River Financial Research
- NYDIG Research
- mempool.space (fee data)
- 1ML.com (Lightning Network stats)

## Content Sources (Credit Lane)
- CFPB enforcement actions
- FCRA/FDCPA updates
- Credit bureau announcements
- 700 Credit Club community questions (Skool)

---

## Output Format

### Bitcoin/DeFi Post (X)
```
[DRAFT — X POST]
Topic: {topic}
Angle: {bridge narrative or standalone — use bridge max once per batch}

{post text — max 280 chars}

Tags: {2-3 relevant hashtags}
---
Approval needed before scheduling.
```

### Credit Post (Facebook)
```
[DRAFT — FACEBOOK POST]
Page: {JECI Credit | Adrian Jordan Personal}
Topic: {topic}

{post text — conversational, educational, 100-200 words}

CTA: {optional — link to jecicredit.com or 700creditclubexperts.com}
---
Approval needed before scheduling.
```

---

## Batch Structure
Each daily content batch contains:
- 2 X posts (Bitcoin/DeFi lane)
- 2 Facebook posts (Credit lane)
- 1 optional bridge post (Bitcoin ↔ credit narrative — use sparingly)

Total: 4-5 drafts per batch.

---

## Rules
- Never use the bridge narrative more than once per batch
- Never guarantee score increases or investment returns
- Never attribute fictional quotes to real people
- All drafts end with `Approval needed before scheduling`
- If web search fails, generate evergreen content from existing knowledge

---

## Execution Steps
1. Search for today's top Bitcoin/Lightning story
2. Search for today's top credit industry story
3. Draft 2 X posts from Bitcoin sources
4. Draft 2 Facebook posts from credit sources
5. Assess if bridge narrative fits — if yes, draft 1 bridge post
6. Compile all drafts into one message to Adrian via Telegram
7. Wait for approval before any scheduling action

---

## Example Trigger Commands
- `JECI run content loop` → generates today's batch
- `JECI run content loop bitcoin only` → Bitcoin lane only
- `JECI run content loop credit only` → Credit lane only
- `JECI schedule approved content` → only after Adrian confirms approval
