---
name: judge-gate
description: Use when verifying that delivered work satisfies acceptance criteria — especially in Phase 6 of the dev cycle. Strict fresh-context discipline: see only the requirements + the diff + the test evidence, never the implementation rationale. Output a verdict table with PASS/FAIL/UNCLEAR per criterion.
---

# Judge gate

Use this skill when you need to evaluate whether work meets requirements without being biased by HOW the work was done. Critical for Phase 6 of the dev cycle.

## The discipline

**Fresh context.** Spawn a subagent that has NEVER seen the implementation conversation, the plan, or the research doc. It sees only:

1. The requirements (acceptance criteria from `01-INTAKE.md`).
2. The diff (`git diff <base>...HEAD`).
3. The test evidence (`05-TEST-EVIDENCE.md` + paths under `evidence/`).

If the orchestrator gives the judge anything else, REFUSE. The whole point is no implementation framing.

## Output format

A markdown table:

```
| # | Acceptance criterion | Verdict | Evidence |
|---|----------------------|---------|----------|
| 1 | <criterion verbatim> | PASS | e2e/login.spec.ts:42 — assertion verified |
| 2 | <criterion verbatim> | UNCLEAR | could not find timing assertion in test evidence |
| 3 | <criterion verbatim> | FAIL | diff shows no implementation for this criterion |
```

Verdicts:
- **PASS** — affirmative evidence that the criterion is met. Cite the specific evidence (file:line, test name, or evidence/ artifact).
- **FAIL** — clear evidence the criterion is NOT met. Cite the failing piece.
- **UNCLEAR** — the diff might satisfy the criterion but you can't verify from the available evidence. Default to UNCLEAR when in doubt.

## Hard rules

- **PASS requires affirmative evidence.** Absence of failure ≠ presence of success.
- **No hand-waving on tests.** "Tests pass" is not evidence. "`auth.controller.spec.ts:42` asserts 401 on bad password" is.
- **Each row is independent.** Don't conflate criteria. One row per acceptance criterion.
- **Missing implementation = FAIL, not UNCLEAR.** If a criterion isn't represented in the diff at all, fail it.
- **Be skeptical of yourself.** When you're tempted to mark PASS without specific evidence, mark UNCLEAR instead.

## Why fresh context matters

A judge that has seen the implementer's reasoning will rationalize gaps ("oh, that edge case is handled implicitly because of X..."). A fresh-context judge sees only what's actually in the diff and asks "does this satisfy the requirement?" — which is the question that matters.

## Anti-patterns

- ❌ Reading the plan/research/implementation doc before judging.
- ❌ Marking PASS because the test name sounds related (look at what it asserts, not what it's called).
- ❌ Marking PASS because the implementer said it's done.
- ❌ Marking UNCLEAR for everything to seem rigorous (then the developer can't act on it).
- ❌ Adding new acceptance criteria you think should have been in the intake (you're judging, not redesigning).

## After the judge

If any row is FAIL or UNCLEAR, the validator refuses to advance. The fix is upstream: re-implement, add tests, or fix the intake (and re-run from there). Do not edit the verdict to advance.
