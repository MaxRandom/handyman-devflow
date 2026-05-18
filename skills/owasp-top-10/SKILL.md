---
name: owasp-top-10
description: Use when reviewing code or a diff for security vulnerabilities. Walks the OWASP top-10 plus secrets exposure and prompt injection. Produces a structured findings table with severity, location, and recommendation.
---

# OWASP top-10 review

Use this skill when reviewing code for security issues — especially in Phase 7 of the dev cycle. Be specific, not generic.

## The categories

Walk through these in order on every diff:

1. **Injection (SQL / NoSQL / OS / LDAP)** — unsanitized user input flowing into queries or commands. Look for string interpolation in DB queries, `exec()` / `spawn()` with user input, untyped GraphQL inputs.
2. **Broken authentication** — weak session handling, missing auth checks, password storage. Check that new endpoints require auth, that JWT/session validation is in place.
3. **Sensitive data exposure** — hardcoded secrets, logging credentials, missing encryption. Grep the diff for `apiKey`, `password`, `token`, `secret` — these should never be hardcoded.
4. **XML external entities (XXE)** — XML parsing changes. Skip if no XML.
5. **Broken access control / IDOR** — missing authorization checks, fetching resources by ID without ownership check. Look for `findById(req.params.id)` without `WHERE owner_id = req.user.id`.
6. **Security misconfiguration** — overly permissive CORS, missing security headers, debug mode in prod. Check `cors()` calls, helmet config.
7. **XSS** — unescaped user input in HTML, `dangerouslySetInnerHTML` without sanitization, unencoded data in `<script>` tags.
8. **Insecure deserialization** — `eval`, `Function()`, `JSON.parse` of untrusted input fed into typed structures without validation.
9. **Components with known vulnerabilities** — new dependencies. Run `npm audit` / `pnpm audit` and check the additions.
10. **Insufficient logging/monitoring** — security events (login failures, auth bypass attempts, lockouts) should be logged.

Plus:

- **Prompt injection** — if the diff touches LLM code, check that user input is properly framed (e.g., not concatenated directly into the system prompt).
- **Secret exposure** — `.env` files committed, API keys in source, tokens in test fixtures.
- **SSRF** — server-side requests with user-controlled URLs.

## Severity scale

Use the same scale as `npm audit`:

- **low** — best-practice violation, no immediate exploit path.
- **moderate** — potential exploit but mitigated by other controls.
- **high** — exploitable by an authenticated user or in a constrained scenario.
- **critical** — exploitable by anyone, or root-level impact.

## Output format

Three subsections, each a markdown table:

```
## Dependency findings
| Severity | Package | Status | Reason |
|----------|---------|--------|--------|
| moderate | lodash@4.17.20 | open | CVE-2021-23337 (high). Fix: upgrade to >=4.17.21. |

## Static analysis findings
| Severity | Location | Status | Reason |
|----------|----------|--------|--------|
| (none) | | | |

## Manual diff review
| Severity | Location | Status | Reason |
|----------|----------|--------|--------|
| critical | apps/api/auth/login.ts:42 | open | SQL injection via string interpolation. Fix: parameterize. |
```

If a subsection has no findings, write `(none)` (one row or as a single line — both work).

## Behavior rules

- **Be specific.** "Missing input validation" is not a finding. "`req.body.email` flows to `db.query` at line 42 without escaping" is.
- **Don't flag generic concerns.** If you can't point at a file:line and explain the exploit path, it's not a finding.
- **Initial status is `open`.** The developer resolves or waives each finding.
- **Don't fix the issues.** Identify, report, hand off.
- **Cite the OWASP category** in the Reason when it's not obvious (e.g., "OWASP A01:2021 Broken Access Control").

## When to use waivers

A finding can be marked `waived` (not `open`) if there's a non-empty Reason explaining why it doesn't apply. Examples of valid waiver reasons:

- "Endpoint is internal-only, not exposed via gateway."
- "Input is already validated by upstream middleware at `apps/api/middleware/sanitize.ts:14`."
- "Dependency is dev-only, not bundled into the production artifact."

Examples of INVALID waiver reasons:

- "" (empty — the validator refuses)
- "Not a problem" (no reasoning)
- "Will fix later" (then file a ticket and link it)
