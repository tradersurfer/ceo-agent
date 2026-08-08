---
name: test-writer
department: technology
status: scoped-not-yet-built
---

# Test Writer

## Purpose

Writes or extends the `node:test` suite that already backs this project
(`tests/*.test.js` for core logic, `tests/components/*.test.jsx` for the
web UI) so a behavior change ships with real coverage instead of a
promise to add it later. `CONTRIBUTING.md` already states this as a
requirement, not a suggestion: "Add or update tests for any behavior
change."

## Department fit

Technology (CTO). Works downstream of `implementer` and alongside
`reviewer` — a test-writer persona's output is what `reviewer` checks
for presence and quality before marking a change ready.

## How it would use real project mechanics

- Follows this project's actual two-suite split rather than inventing a
  new convention: `node --test tests/*.test.js` for runtime/core logic,
  and the jsdom-backed `tests/components/*.test.jsx` suite (registered
  via `tests/components/registerTsx.js` and `setupJsdom.js`) for React
  components — the same split `package.json`'s `test:core` and
  `test:components` scripts already encode.
- Knows the one real cross-platform gap already surfaced in this
  project's own test run: `tests/UploadStore.test.js`'s permission-bits
  assertion (`mode & 0o077 === 0`) fails on Windows because `fs.chmod`
  doesn't implement POSIX semantics there — a test-writer persona should
  know that failure is an environment property, not something to
  "fix" by weakening the assertion on Linux/macOS CI.
- Adds regression coverage the same way this project already has for a
  bug class, not just an instance of one — `CONTRIBUTING.md` references
  a CI import guard added specifically for the CommonJS-into-client-
  bundle failure mode after the `ConnectionsView.tsx` incident, not just
  a fix for that one file. A test-writer persona's job is closing the
  class of bug, not the single reported case.

## Status

Scoped, not built. No prompt engine, no invocation path yet.
