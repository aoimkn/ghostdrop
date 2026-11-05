# ghostdrop

- Write everything in English: code, comments, docs, commit messages.
- Don't write comments by default. Add one only when the code alone can't convey why — e.g. a non-obvious constraint, a workaround, or a choice a reader would otherwise change.
- Never write user-facing copy. When the UI needs text, add a message key with an empty message in every locale; the owner writes the messages.
- When you hit a problem you can't fix at its root — or the fix would mean a workaround, deviating from `SPEC.md`, or `SPEC.md` is ambiguous — stop and report: what happened, the cause (or your best guess), and the options.

## SPEC.md

- `SPEC.md` is the source of truth for product behavior. When behavior changes, update `SPEC.md` in the same change.
- It covers only externally observable behavior and security guarantees. Keep implementation details — algorithms, APIs, storage, libraries — out of it.
- Add a rationale only where a reader of the spec alone would plausibly propose the alternative.
