---
name: bitbucket-pr-body
description: Use when composing a Bitbucket PR body for a dev-cycle ticket — Phase 8. Assembles intake summary + plan summary + test results + verification table + security summary into a reviewer-friendly format with links to the ticket folder.
---

# Bitbucket PR body composition

Use this skill in Phase 8 of the dev cycle to compose the PR body that gets passed to `bitbucketPullRequest.create`. The goal is a reviewer-ready summary that links to the full audit trail without overwhelming.

## Template

```markdown
## $TICKET — <one-line ticket title>

### Intent (from intake)
<Understood requirements section from 01-INTAKE.md, verbatim — bullet list>

### Implementation summary (from plan)
<task list — one line per task title from 03-PLAN.md>

### Test results (from evidence)
- Unit: PASS (<count of tests>)
- Integration: PASS (<count>) | SKIPPED
- E2E: PASS (<count>) — trace: tickets/$TICKET/evidence/<run-id>/

### Verification (judge-gate)
<Verification table from 06-VERIFICATION.md — first 5 rows, "...and N more" if longer>

### Security
- Dependency findings: <total>, <open=0>, <waived count> ✅
- Static analysis: <total>, <open=0>, <waived count> ✅
- Manual review: <total>, <open=0>, <waived count> ✅

### Artifacts
Full audit trail in `tickets/$TICKET/`. See:
- `01-INTAKE.md` — requirements + open questions
- `02-RESEARCH.md` — codebase analysis
- `03-PLAN.md` — implementation plan
- `05-TEST-EVIDENCE.md` — captured test runs
- `06-VERIFICATION.md` — judge-gate verdict
- `07-SECURITY.md` — security review
```

## Behavior rules

- **Read the artifacts; don't paraphrase.** Pull the Understood requirements verbatim. Don't summarize them — they ARE the requirements.
- **Truncate the verification table at 5 rows.** Long tables hurt review. Add "...and N more" if longer; reviewers can open `06-VERIFICATION.md` for the full table.
- **Show counts.** "Unit: PASS (142)" is more reassuring than "Unit: PASS." If you can't extract the count from the evidence, write "PASS" without parens.
- **Don't include rationales.** Reviewers will read the artifacts if they want details. The PR body is the table of contents, not the doc itself.
- **Always include the artifacts list at the bottom.** It's the reviewer's escape hatch.

## What to omit

- The plan's per-task acceptance criteria (too long).
- The research doc's existing-implementation section (reviewer can read the diff).
- Per-finding security details (the security artifact has the full table).
- Anything that's already visible in the diff.

## Edge cases

- **No integration tests:** write "Integration: SKIPPED — no backend changes."
- **All security sections clean:** can collapse to "Security: clean (no dependency, static, or manual findings)."
- **No verification rows:** that's a Phase 6 failure — should not reach Phase 8. If it does, refuse to compose the PR body.
