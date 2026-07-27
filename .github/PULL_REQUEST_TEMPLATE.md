## Summary

What does this PR change, and why?

## Testing

How was this verified? Paste actual test output, not a description of
testing.

## Checklist

- [ ] Tests added/updated for the change
- [ ] Full test suite passes locally
- [ ] Docs updated if this affects setup, config, or user-visible behavior
- [ ] No secrets, personal identifiers, or private infra details in the
      diff
- [ ] **If this touches `app/`, `lib/`, or adds a new dependency reachable
      from a web route:** booted `npm run web` and hit at least one real
      request path — not just `npm test`/`next build` (see
      `CONTRIBUTING.md` for why: two runtime-only crashes, PR #42 and #59,
      shipped past both of those undetected). N/A otherwise.
