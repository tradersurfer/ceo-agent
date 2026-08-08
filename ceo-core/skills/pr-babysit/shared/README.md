# pr-babysit/shared (reserved)

## Intent

Common groundwork for the two `pr-babysit` skills below —
`remove-wall-of-text` and `review` — so each one isn't independently
re-implementing the same lookup logic. Not a skill on its own; a
holding place for whatever both siblings need in common once either is
actually built (e.g. resolving a PR reference to its real diff/commit
history, so `remove-wall-of-text` and `review` operate on the same
notion of "this PR" rather than two slightly different ones).

## Status

Scoped, not built. Reserved for future work — no shared module exists
yet; this folder exists so the eventual shared code has a place to live
without the two skill folders importing from each other directly.
