---
description: "Phase 2 — Research the codebase against the intake's affected areas. Document patterns to follow."
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Agent
---

# /task:research — Phase 2

Determine ticket from current branch: `git branch --show-current` → extract `<TICKET>` from `feature/<TICKET>-...`. Refer to it as `$TICKET` below.

## Precondition checks (HARD)

1. `git status --porcelain` → must be empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` → must be `intake-complete`. Otherwise ABORT with the next-expected hint.
3. `cd .dev-flow && npx tsx src/validators/intake.ts $TICKET` → exit code must be 0. Otherwise ABORT with stderr.

## Actions

### 1. Read the intake

Read `tickets/$TICKET/01-INTAKE.md`. Extract the **Affected areas** list.

### 2. Spawn a research subagent

Use the Agent tool. Provide the subagent with:
- `01-INTAKE.md` content
- A read of each "Affected area" file (use Glob/Read)
- The repo's AGENTS.md
- Output of: `find apps services -name 'package.json' | xargs grep -l <keywords>` (for similar features)

Ask the subagent to produce:

```
## Existing implementation
<what's already there relevant to this ticket>

## Patterns to follow
- `path/to/example.ts` — pattern description (Zod resolver, error boundary, etc.)
- `path/to/another.ts` — pattern description

## Integration points
- Backend endpoint: `path` METHOD /url
- State store: `path`
- Test fixtures: `path`
```

The patterns section MUST cite real file paths in backticks. The validator enforces this.

### 3. Write the artifact

Write `tickets/$TICKET/02-RESEARCH.md`:

```markdown
# Research — $TICKET

<research subagent output>
```

### 4. Append journal + commit

```
cd .dev-flow && npx tsx src/journal-cli.ts $TICKET research analyze ok
cd ..
git add tickets/$TICKET/02-RESEARCH.md tickets/$TICKET/.journal.jsonl
git commit -m "research: $TICKET codebase analysis"
```

### 5. Run validator

`cd .dev-flow && npx tsx src/validators/research.ts $TICKET`

If exit code 0:
- Advance state: `cd .dev-flow && npx tsx -e "import {advancePhase} from './src/state.js'; advancePhase('..', '$TICKET', 'research-complete')"`
- Commit state: `git add tickets/$TICKET/state.json && git commit -m "research: $TICKET signed off"`
- Tell user: "Phase 2 complete. Next: /task:plan."

If exit code != 0:
- Tell user the validator output. Common fix: cite real file paths in `## Patterns to follow`.
