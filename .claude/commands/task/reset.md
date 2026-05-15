---
description: "Rewind state.phase to a prior phase. Does not delete artifacts."
allowed-tools: Bash, Read, Write
argument-hint: "--to <phase>"
---

# /task:reset

Usage: `/task:reset --to <phase>`

Valid phases: `init`, `intake-complete`, `research-complete`, `plan-complete`, `implementation-complete`, `tests-complete`, `verified`, `security-reviewed`.

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Actions

1. Read `tickets/$TICKET/state.json`.
2. Confirm with the user: "About to rewind state.phase from <current> to <target>. Artifacts will NOT be deleted; you'll just be allowed to re-run from <target>'s next phase. Proceed? (yes/no)"
3. If yes, update state.phase, set last_error=null, update updated_at.
4. Append journal entry: `cd .dev-flow && npx tsx src/journal-cli.ts $TICKET reset rewind ok "<from> -> <to>"`
5. Commit:
```
git add tickets/$TICKET/state.json tickets/$TICKET/.journal.jsonl
git commit -m "reset: $TICKET rewind <from> -> <to>"
```
6. Print the next command to run based on the new phase.
