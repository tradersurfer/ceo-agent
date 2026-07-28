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
      from a web route:** booted `npm run web` AND verified it in an actual
      browser (page loads, client bundle compiles, no console errors) — not
      just `npm test`/`next build`/an API-route curl (see `CONTRIBUTING.md`
      for why: three runtime-only crashes — PR #42, #59, and an
      `import.meta` client-bundle break in `ConnectionsView.tsx` — shipped
      past test/build/curl-only checks undetected). N/A otherwise.
