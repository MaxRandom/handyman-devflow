---
name: clarifying-questions
description: Use when surfacing ambiguities in a requirement, ticket, or design doc — especially during intake. Produces focused, multiple-choice questions one at a time, marked with [NEEDS-ANSWER] for tracking.
---

# Clarifying questions

Use this skill when you need to extract precise requirements from an under-specified ticket, conversation, or design doc. The goal is decision-ready clarity, not exhaustive interrogation.

## The pattern

**One question per turn.** Don't dump 5 questions at once. The answerer can only focus on one thing at a time, and your follow-up depends on the answer.

**Prefer multiple-choice.** A question like "Should X be (a) per-user, (b) per-IP, or (c) both?" is much easier to answer — and surfaces the design space — than "What's the X policy?"

**Mark unanswered questions with `[NEEDS-ANSWER]`.** This gives the validator something to grep for and gives the user something to scan for. Format:

- `[NEEDS-ANSWER] Should the lockout be (a) account-wide for 60s, (b) per-IP for 5 min, or (c) both?`
- `[NEEDS-ANSWER: tradeoff context] Should we cache the result? (a) yes, with 30s TTL, (b) no, always fresh, (c) configurable.`

**Be specific about what each option means.** Don't write "(a) caching" — write "(a) cache with 30s TTL." The answerer should be able to pick without follow-up.

## When to ask vs. when to assume

- If the answer changes the implementation in a meaningful way → ask.
- If the answer is implied by team conventions in `AGENTS.md` → assume + note the assumption inline.
- If the answer is obvious from the codebase (e.g., we always use Zod for validation) → don't ask.
- If you're not sure whether to ask, ask. The cost of asking is low; the cost of guessing wrong is debugging in Phase 6.

## Anti-patterns

- ❌ "What should this look like?" — too vague.
- ❌ "Should we do A, B, C, D, E, F, or G?" — too many options.
- ❌ Asking 5 questions at once — overwhelms.
- ❌ Asking questions whose answer doesn't affect what you build — wasted cycles.

## Output convention

When using this skill inside an intake-style artifact, group questions in a `## Open questions` section, each prefixed with `[NEEDS-ANSWER]`. Use `(none)` if there are genuinely no open questions — the validator accepts both.
