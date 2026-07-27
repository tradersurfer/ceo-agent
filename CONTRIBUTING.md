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
  from a web route, actually boot `npm run web` (or the dev server) and hit
  at least one real request path before marking the PR ready.** `npm test`
  and `next build` are necessary but not sufficient — both have shipped a
  runtime crash undetected on this project:
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

  Neither bug was reachable by the test suite or the production build step;
  both only surfaced by actually starting the dev server and making a real
  request against a route that exercises the changed code path.

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
