# Contributing to CEO Agent

Thanks for considering a contribution. This project is solo-maintained, so
please open an issue before starting significant work — it saves everyone
time if the direction doesn't fit.

## Before you start

- Check open issues and the roadmap docs first; your idea may already be
  scoped or intentionally deferred.
- For anything beyond a small fix, open an issue describing the change
  before opening a PR.

## Development setup

1. Fork and clone the repo
2. `npm install`
3. Run the test suite before making changes, to confirm a clean baseline:
   `npm test`
4. Copy `.env.example` to `.env` and fill in your own API keys (never commit
   real credentials — see `SECURITY.md`)

## Making a change

- Keep PRs focused — one logical change per PR
- Add or update tests for any behavior change
- Run the full test suite before opening the PR
- Follow the existing code style (no new linter, just match what's there)
- Update relevant docs (`README.md`, `docs/`) if the change affects setup,
  configuration, or behavior a user would notice
- **If the change touches `app/`, `lib/`, or adds a new dependency reachable
  from a web route, actually boot the dev server (`npm run web`) and verify
  it in an actual browser before marking the PR ready.** `npm test` and
  `next build` are necessary but not sufficient — three separate runtime
  crashes have now shipped past both of those undetected on this project:
  - PR #42 added a `require('path')` inside `loadRuntimeRegistries()` that
    shadowed the module-level `path` import via temporal-dead-zone hoisting,
    crashing the entire runtime-construction path (CLI, web, dispatch) with
    `Cannot access 'path' before initialization`. `npm run web:build` passed
    anyway, because Next's static build never calls
    `loadRuntimeRegistries()` — a green build didn't mean the app worked.
  - PR #59 added `docx` as a dependency. It contains a `require()` pattern
    webpack can't statically analyze, breaking every web route that
    transitively imports it through `core/RegistryLoader.js` — nearly the
    whole dashboard (chat, health, status, org, dispatch). It shipped
    because verification was `npm test` plus a plain-Node script, never an
    actual `npm run web` boot.
  - A `ConnectionsView.tsx` change imported `lib/providers.js` (a plain
    CommonJS module with no import/export syntax) via ES `import` from a
    `'use client'` component. This broke `next dev`'s client bundle with a
    `Module parse failed: Cannot use 'import.meta' outside a module` error —
    webpack's Fast-Refresh instrumentation injects `import.meta.webpackHot.
    accept()` into every module reachable from a client boundary, which is
    invalid syntax for a file webpack parses as Script (not Module) grammar.
    **Booting the dev server and curling an API route — the boot-check as
    originally scoped — did not catch this**, because API route handlers
    compile separately from the client-side page bundle; the client bundle
    only compiles when a browser actually requests and renders the page.
    `next build`'s production bundle never injects Fast-Refresh code either,
    so this was invisible to every build, test, and API-curl boot-check that
    ran before it was caught.

  **What "verify it in an actual browser" means, concretely**: booting
  `npm run web` and curling an API route is not sufficient on its own — load
  the actual page (or the specific page/component the change affects) in a
  real browser context and confirm (a) the client bundle compiles without
  error (no red `⨯` in the dev server's terminal output) and (b) the
  browser's own console shows no errors after the page renders. A tool that
  drives a real or headless browser (not curl, not a plain HTTP client)
  satisfies this — the point is exercising the actual client-bundle compile
  and render path, not just a server response.

  None of these three bugs were reachable by the test suite or the
  production build step; each only surfaced by actually starting the dev
  server and exercising the specific path (server request, or client-bundle
  render) the change touched.

## Security

Do not open a public issue for a security vulnerability. See `SECURITY.md`
for the reporting process.

## Skills and third-party patterns

If a contribution is inspired by patterns from other agent ecosystems:
study public, properly licensed material only; preserve required
attribution; never copy proprietary or closed prompt/skill content. This is
an MIT-licensed project — original implementations only.

## Code of conduct

This project follows `CODE_OF_CONDUCT.md`. Be respectful; disagreements
about technical direction are fine, personal attacks aren't.
