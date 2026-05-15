---
name: tdd-discipline
description: Use when implementing a feature, bug fix, or refactor in code. Enforces strict RED-GREEN-REFACTOR: write the failing test first, observe it fail, then write the minimum implementation to make it pass. Atomic commits per task.
---

# TDD discipline

Use this skill any time you're writing implementation code that has a meaningful behavior to verify. Apply it per task, not per feature.

## The cycle

For every behavior change:

1. **RED — write the failing test.**
   - The test encodes the acceptance criterion.
   - Save the test file BEFORE writing any implementation.
   - Run it. Confirm it fails. Capture the failure message (you'll need it to verify the cycle).

2. **GREEN — write the minimum implementation.**
   - Just enough code to make the test pass. No extra features. No "while I'm in here" cleanup.
   - Run the test. Confirm it passes.

3. **REFACTOR (optional).**
   - Only if it adds clarity now or removes near-duplicate code.
   - Re-run the test after.
   - If you're tempted to refactor across files, that's a separate task — note it as a follow-up.

4. **COMMIT atomically.**
   - Stage only the files relevant to this task: the test + the implementation.
   - Commit message: `<type>: <ticket> <task title>` with a `Plan-Task: <id>` trailer if part of a structured plan.
   - Use `git commit -m "feat: ..." -m "Plan-Task: 1"` (two `-m` flags produces a proper trailer block).

## Why test-first

- The test forces you to specify the behavior in concrete terms BEFORE you bias yourself by writing the implementation.
- The failing-then-passing transition proves the test is real (a test that always passes verifies nothing).
- Atomic commits give a clean reviewable diff and a clean revert target.

## Hard rules

- **Never write the implementation before the test.** If you catch yourself doing it, stop and write the test.
- **Never commit a failing test.** Fix it or revert it before committing.
- **Never bypass lint/typecheck.** No `--no-verify`. If they fail, fix the underlying issue.
- **Don't expand scope mid-task.** Note unrelated improvements as follow-ups; finish the task you started.
- **If you can't make the test pass without expanding scope, STOP and report.** Better to escalate than make a quiet wrong call.

## Anti-patterns

- ❌ Writing the implementation, then writing a test that mirrors it (test verifies your code, not the requirement).
- ❌ Committing test + implementation + unrelated cleanup in one commit.
- ❌ Skipping the RED step ("I know it would fail, let me just write the code").
- ❌ Writing one big test that covers 5 behaviors at once.
- ❌ Writing tests that mock the unit under test (you're testing the mock, not the code).

## When TDD doesn't apply

- Pure config changes (no behavior to verify).
- Documentation-only changes.
- Markdown / prompt files.
- One-line comment additions.

For everything that changes runtime behavior, the cycle applies.
