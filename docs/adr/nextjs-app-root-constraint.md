# Next.js App Router Root Constraint

## Issue #124 — Won't Fix

Next.js App Router requires the `app/` directory to be at the project root (adjacent to `package.json`). This is a framework constraint, not a project decision.

### Why

- Next.js's file-system router only discovers `app/` at the root of the project
- Moving `app/` to a subdirectory (e.g., `web/app/`) breaks routing, layouts, and server components
- The `next.config.js` `outputFileTracingRoot` and other workarounds don't change this fundamental requirement

### Current Structure (Correct)

```
ceo-agent/
├── app/                    # Must be at root
│   ├── layout.tsx
│   ├── page.tsx
│   └── components/
├── package.json
├── next.config.js
└── ...
```

### Reference

- Next.js docs: [App Router - Project Structure](https://nextjs.org/docs/app/building-your-application/routing#project-structure)
- Next.js issue: [app directory must be at root](https://github.com/vercel/next.js/issues/48504)

### Decision

Close #124 as **won't-fix**. The current structure is correct and required by the framework.