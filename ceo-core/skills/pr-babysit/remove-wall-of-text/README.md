# pr-babysit/remove-wall-of-text (reserved)

## Intent

Compresses a verbose PR description, commit message, or ADR draft down
to what this project's own commit-message discipline already asks for:
state the "why," not a restatement of the diff. This repo's real commit
history already runs on that standard — messages here favor a short
rationale over an exhaustive change list. This category is where that
gets applied automatically to a draft that hasn't met it yet, rather
than relying on whoever's writing the PR to self-edit.

## What it would actually register

A skill that takes a long-form draft (PR description, commit message, or
an over-long ADR section) and returns a condensed version, flagging
anything it removed that looked like it was actually load-bearing
(a stated risk, a named alternative, a rejected approach) rather than
restating the diff — so compression doesn't quietly drop the one
sentence a reviewer actually needed.

## Status

Scoped, not built. Reserved for future work — no handler, no
registration yet.
