# Security Posture

This document describes the current security model of the CEO Agent scaffold honestly — what's handled, what isn't yet, and what you're responsible for as an installer.

## What's handled

- **Dispatch API authentication** — `/api/dispatch` requires a `x-dispatch-secret` header matching `DISPATCH_SECRET` from your `.env`, checked with a timing-safe comparison (`crypto.timingSafeEqual`).
- **Rate limiting** — the dispatch endpoint limits each caller (by IP) to 30 requests/minute using an in-memory sliding window. This is sufficient for a single-instance deployment.
- **Secrets never committed** — `.env` and `ceo-agent.config.json` are gitignored by default. Never commit real API keys, webhook secrets, or tokens.
- **Secrets never logged** — the setup wizard and chat IDE never echo back API keys or tokens in console output.
- **Task-type allowlisting** — every agent bridge (`SalesIntakeBridge`, `OnboardingCommsBridge`, `DisputeAgentBridge`, `HermesBridge`) only accepts pre-approved task types, approvers, and projects, configured via env vars (`CEO_AGENT_APPROVERS`, `CEO_AGENT_PROJECTS`).
- **No hardcoded credentials or personal paths** anywhere in this codebase.
- **Web dashboard binds to localhost only** — `npm run web` and `npm run web:start` explicitly bind to 127.0.0.1, not all network interfaces, since this is a single-local-user tool by default.

## What's NOT yet handled — you are responsible for these

- **Multi-instance rate limiting** — the in-memory limiter resets per process and doesn't share state across multiple server instances. If you deploy behind a load balancer with multiple instances, replace it with a shared store (Redis, etc.) before relying on it.
- **Model API key rotation** — this scaffold doesn't rotate or manage OpenRouter/model provider keys. Rotate them yourself if compromised.
- **Sandboxing of agent execution** — Hermes and other agent runtimes are not sandboxed by this scaffold. If you wire a real Hermes runtime, apply your own process isolation.
- **Dependency auditing** — run `npm audit` yourself before production use; this scaffold doesn't automate it.
- **Tracked transitive dependency advisories** — `GHSA-qx2v-qp2m-jg93` and `GHSA-6g55-p6wh-862q` (PostCSS), plus `GHSA-f88m-g3jw-g9cj` (sharp/libvips), are transitive-only through Next.js; the available `npm audit fix --force` would perform a breaking downgrade to Next 9.3.3, so these remain tracked pending a safe non-breaking upstream fix.
- **Major-version dependency upgrades** — Next.js, React, and TypeScript have major-version upgrades available (15→16, 18→19, and 5→7 respectively) that have not yet been evaluated. These are deferred until after v0.1 to avoid introducing breaking changes immediately before release, not because they are known to be vulnerable.
- **Human-in-the-loop enforcement beyond task-type allowlisting** — the bridges block unauthorized task types, but no additional confirmation step exists for high-stakes actions (e.g. sending real client emails, real financial transactions) beyond what you configure in your own runtime wiring.
- **TLS/HTTPS** — this scaffold assumes you're deploying behind infrastructure (Vercel, a reverse proxy, etc.) that terminates TLS. It does not handle this itself.

## Reporting a vulnerability

This is an early-stage open-source scaffold. If you find a security issue, please open an issue on this repository (or contact JECI Group, LLC directly if the issue involves exposed credentials — do not post exposed secrets publicly).

Copyright (c) 2026 JECI Group, LLC
