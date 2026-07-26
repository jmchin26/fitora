# Fitora Status

Last updated: 2026-07-26 (Asia/Kuala_Lumpur)

## Current state

- Current phase: Phase 5 implementation, mocked verification, final quality gates, and the post-hardening 10-case E2E rerun are complete in the working tree. The live Prava sandbox acceptance run is blocked at the human gate. Phase 6 asset validation is complete with the existing placeholder set.
- Latest committed milestones: Phase 5 Prava Hosted Checkout (`f2fe072`), Phase 6 product image catalogue (`3f9df6a`), release quality gates (`fb7be72`), and this final release-documentation snapshot.
- Git branch: `main`.
- Application state: the responsive landing/build journey generates, selects, and revises one to three verified outfits. Each agent turn accepts only a message plus compact preference/product references, interprets one strict intent, executes one deterministic styling action, and verifies the resulting state against the catalogue.
- Current AI provider: `rules` is the safe default; Gemini and local Ollama adapters are implemented with strict structured output, bounded timeouts, and truthful fallback disclosure.
- Current payment provider: `mock` remains the safe default and completes the full explicitly approved local checkout path through a separate, unmistakably labelled mock hosted page. The `prava` provider implements direct REST session creation and callback-driven finalization only for the exact official sandbox API/hosted origins and an `sk_test_*` server key; application configuration rejects production Prava origins and `sk_live_*`. Low-level client production constants are inactive capability scaffolding. Prava never silently falls back to mock.
- Checkout state: the server rehydrates catalogue references and recomputes the order at review and session creation. Every Prava form has a distinct lowercase RFC UUID attempt ID; its signed payment token binds that ID and the review JTI to a canonical order snapshot. Attempt-scoped HMAC review/session/result state travels only in bounded HTTP-only, SameSite=Lax cookies that are Secure in production. Invalid, expired, orphaned, and terminal sets are pruned, and no more than three valid active sets are accepted.
- Current result handling: terminal mock results remain retry-safe within the signed-cookie boundary. Prava returns to `/checkout/callback/<attempt-UUID>`; the bare callback fails closed, query values are ignored, and provider state is polled server-to-server. Catalogue drift prevents merchant execution and safely reports `DECLINED`; one uniquely attributable canonical mismatch also declines/reports, while ambiguous multi-context results enter reconciliation. Signed progress/reconciliation markers and same-process callback coalescing support retries without exposing raw payment state. Browser history remains limited to five schema-validated summaries without email, session IDs, tokens, or payment credentials.
- Real Prava gate: code and mocked HTTP contract coverage are complete. A genuine sandbox run has not started because it requires a human Prava account/key, an exact deployed HTTPS origin and allowed-domain setting, plus hosted card/OTP/biometric/Passkey approval. No live provider response or successful sandbox payment is claimed.
- Asset gate: exactly 30 project-authored 640×800 SVG placeholders remain mapped by the strict manifest. No final generated/licensed image pack was supplied, so replacing them would be an unsupported source/license claim.
- Gemini gate: adapter and mocked integration tests passed; genuine credential/manual testing is deferred and has not started.
- Ollama gate: adapter and mocked HTTP integration tests passed; a live local model test has not been claimed.
- GitHub status: GitHub CLI is unavailable; no remote is configured.
- Deployment status: not started; Vercel preparation is planned, but production deployment requires human approval and a WAF rule on `POST /api/checkout/create-session` (initial recommendation: 20 requests per 10 minutes per source IP). Application throttles are not authoritative across serverless instances.
- Next action: no unblocked local implementation remains. Live Prava, GitHub/Vercel authentication/WAF configuration, public deployment, and submission are explicit human gates.

## Environment audit

| Area | Result |
| --- | --- |
| Operating system | Windows Home Single Language, display version 25H2, build 26200.8875, AMD64 |
| Shell | Windows PowerShell 5.1.26100.8875 with `Restricted` execution policy |
| Node.js | `v24.15.0`; compatible with the selected stack, while current LTS validation identified 24.18.0 as the recommended upgrade target |
| npm / npx | `11.12.1` via `npm.cmd` / `npx.cmd`; PowerShell script aliases are blocked by the local execution policy |
| Git | `2.54.0.windows.1` |
| Git identity | Configured locally/globally; values intentionally omitted from this status file |
| GitHub CLI | Not installed or not on `PATH` |
| Port 3000 | Available at audit time |
| Local Python | Not on `PATH`; Codex bundled Python is available for development tooling |
| Browser tooling | Edge 150.0.4078.99, Chrome 150.0.7871.182, Codex browser automation, and the project Playwright runtime are available and verified |
| Workspace permissions | Project files are writable; Git metadata writes require the approved Git permission boundary |

## Passing commands

- `npm run lint`
- `npm run typecheck`
- Final `npm run check` — lint, strict type-check, Vitest 4.1.10 with 61 files/507 tests, and the Next.js 16.2.12 production build passed in one clean run
- Latest `npm run test:e2e` after hardening — Playwright 1.61.1: 10/10 desktop/mobile browser cases passed, including four mock checkout approval/decline runs
- Local HTTP smoke check — `/` returned 200 and contained the Fitora and mode labels
- In-app browser smoke check — title, primary heading, build action, and mock-mode disclosure were present
- Environment inspection and execution-pack integrity checks completed

## Failing or unavailable tooling

- The requested global installation of the Prava coding-agent skill was rejected by the security review because it would persistently trust and execute an external repository. Per the execution pack, implementation will continue from official Prava documentation.
- `gh` is unavailable.

No application quality gate is currently failing.

## Human blockers

None for local or other unblocked implementation. Real Prava, genuine Gemini, GitHub, and deployment gates still require the deferred human actions recorded in `docs/MANUAL_ACTIONS.md`; none has been claimed as passed.

## Completion summary

### Completed

- Preserved the authoritative execution pack in the repository root.
- Read `AGENTS.md` and all planning documents.
- Renamed the initial Git branch to `main`.
- Established the first environment and security evidence.
- Validated the stable framework, test, AI SDK, and CSS package lines against current official sources.
- Installed a strict Next.js App Router, TypeScript, Tailwind CSS, ESLint, Vitest, Testing Library, and Playwright baseline.
- Confirmed the baseline through lint, type-check, unit test, production build, HTTP, and browser smoke checks.
- Added exactly 30 schema-validated fictional products with immutable repository access.
- Added deterministic filtering, compatibility scoring, stable tie-breaking, outfit diversity, structured explanations, and low-budget recovery guidance.
- Added canonical server-side outfit rehydration so client-provided price, stock, category, and product facts are never trusted.
- Added health and outfit-generation route handlers with structured error responses.
- Passed the complete Phase 1 quality gate: lint, strict type-check, 40 tests, and production build.
- Built a responsive editorial landing page and guided preference form with precise USD-to-cents validation.
- Added loading, recoverable no-result, malformed-response, stale-request, and storage-unavailable states.
- Added accessible outfit cards with local 4:5 product imagery, meaningful alt text, verified prices/sizes/stock/totals, score detail, and native single selection.
- Added service-configured provider badges so the interface never hard-codes a stale AI or payment mode.
- Added 30 project-authored placeholder SVGs and a complete source/license manifest.
- Added component and Playwright coverage, including one/two/three-result contracts, 375 px overflow, skip-link focus, keyboard selection, and no unexpected browser errors.
- Passed the complete Phase 2 quality gate: lint, strict type-check, 88 tests, production build, and 4 browser journeys.
- Added a strict discriminated `AgentIntent` contract for generation, item replacement, cheaper alternatives, style/budget/colour changes, selection, checkout review, help, and typed unsupported input.
- Added deterministic rules parsing with Unicode normalization, precise integer-cent budget parsing, single-action enforcement, and rejection of prompt injection, negated commands, meta/quoted commands, ambiguous parameters, and malformed amounts.
- Added an independent semantic evidence guard so a model cannot invent a category, style, colour, amount, budget operation, outfit position, action family, or checkout instruction absent from the user message.
- Added canonical agent-state rehydration and final-state verification: client references are rebuilt from the immutable catalogue, and totals, scores, explanations, sizes, stock, uniqueness, and selection membership are recomputed before and after every turn.
- Added deterministic revision tools for replacement, cheaper alternatives, style, budget, preferred colour, and excluded colour, including visible-outfit diversity and structured no-result recovery.
- Added rules, official Google Gen AI SDK, and native Ollama chat adapters with strict JSON schemas, bounded output/timeouts, cancellation, and sanitized provider errors.
- Added truthful provider status reporting for configured mode, actual interpreter, template explanation mode, and exact fallback reason; no provider can silently masquerade as another.
- Added a validated, no-store `/api/agent` route with sanitized 400, 409, and 500 error boundaries.
- Added the accessible “Refine with Fitora” panel with one-tap commands, a 280-character input, stale-request cancellation, response validation, safe state synchronization, and no chat persistence.
- Added a checkout-review-only event that requires a selected visible outfit and explicitly creates no payment session.
- Passed the complete Phase 3 quality gate: lint, strict type-check, 26 files/200 tests, production build, and 6 desktop/mobile browser cases.
- Added an explicit checkout-review transition that sends only product IDs and selected sizes, then rehydrates all product, category, stock, price, merchant, currency, and total facts from the trusted server catalogue.
- Added strict review, payment-session, and terminal-result HMAC claims with bounded lifetimes and separate HTTP-only, SameSite=Lax cookies; production cookies are Secure and invalid, expired, future-issued, mismatched, oversized, or tampered state fails closed.
- Added a typed payment-provider interface and factory. Mock remains fully implemented, and Prava now resolves to a real direct-REST provider only after strict server configuration validation; neither provider silently substitutes for the other.
- Added email validation and a visible order-approval checkbox before the server creates a short-lived hosted session.
- Added a separate Fitora-hosted mock checkout page with persistent mock disclosure, no card-data controls, deterministic approve/decline behavior, and a server-only demo merchant adapter.
- Added retry-safe terminal finalization within the signed-cookie boundary: a valid existing result is returned without invoking the provider or merchant again, transient checkout cookies are cleared, and result refresh does not duplicate checkout.
- Added awaiting-payment, provider-confirmed pending, approved, declined, expired, reconciliation-required, and mock-success result presentation with only sanitized provider, status, order reference when approved, USD total, item count, and completion time. A newly created but unused session is never mislabelled as provider-pending.
- Added schema-validated local sanitized order history capped at five deduplicated terminal entries; email, raw product data, session IDs, signed tokens, and payment credentials are never stored.
- Added component, unit, route, and Playwright coverage for tampering, invalid/expired/mismatched state, price or availability changes, explicit approval, mock approve/decline, terminal idempotency, refresh behavior, sanitized history, mobile layout, and unexpected browser errors.
- Added same-origin JSON guards to every checkout mutation, HTTPS-only production/Prava public origins, exact provider-hosted redirect pinning, serialized review requests, and checkout/payment-attempt-bound pending markers after independent security review.
- Passed the complete Phase 4 quality gate: lint, strict type-check, 49 files/378 tests, production build, and 10/10 desktop/mobile Playwright cases including four checkout approval/decline runs.
- Implemented the Prava REST client for `full_checkout` session creation, bounded payment-result polling, and `APPROVED`/`DECLINED` result reporting with validated request/response contracts, bounded response sizes, timeouts, and sanitized errors.
- Bound Prava shopper identity to an HMAC-derived, privacy-preserving `user_id`; appended the returned `session_token` only to the exact provider-hosted checkout URL; and kept all one-time credential fields transient and server-only.
- Added per-form attempt isolation with lowercase RFC UUID callback paths, attempt-scoped cookies, a signed canonical order snapshot, and a fail-closed bare callback. Query data is ignored and provider state remains server-authoritative.
- Added fail-closed finalization: catalogue drift skips merchant execution and safely reports `DECLINED`; one uniquely attributable canonical context mismatch also declines/reports; ambiguous multi-transaction or multi-line context enters reconciliation.
- Added 10-second server/15-second browser create boundaries, uncertain-attempt UI locking and tombstones, a cooperative 20-minute browser lease, and a one-hour HTTP-only random browser scope. Same-process logic atomically unions active cookies with reservations across reviews, caps the aggregate at three, prunes stale/terminal sets, and applies a best-effort production-client threshold of 20 attempts per 10 minutes. A deployment WAF remains required for cross-instance authority.
- Added signed progress and reconciliation state plus same-process callback coalescing so ordinary retries can resume reporting without executing the merchant twice, while preserving an explicit no-database/no-cross-instance guarantee.
- Added mocked coverage for Prava contracts, client create/poll/report behavior, hosted URLs, sandbox-only application configuration, provider resolution, session creation, callback/path binding, cookie capacity/pruning, concurrent attempt throttling, callback sanitization, pending/awaiting/completed/failed states, merchant approval/decline, drift/mismatch handling, retry progress, uncertainty, and reconciliation behavior.
- Final local gates pass: lint, strict type-check, 61 files/507 tests, production build, and 10/10 post-hardening Playwright cases. This is code-complete/mock-tested evidence, not a live sandbox payment claim.
- Revalidated the Phase 6 asset boundary: the strict manifest still maps all 30 catalogue products to project-authored, project-owned, brand-neutral 640×800 SVG placeholders, and no final image pack was supplied.

### Blocked

- None for local implementation.

### Omitted

- None.

### Future work

- Configure the Vercel WAF create-session rule, then run the implemented Prava Hosted Checkout path against the real sandbox after the recorded human prerequisites are completed; collect only sanitized evidence.
- Finish the remaining local release/commit work wherever it does not require an external login, secret, hosted payment approval, deployment/WAF approval, or final submission.

Official contract references: [authentication and environments](https://docs.prava.space/authentication), [create session](https://docs.prava.space/api-reference/create-session), [integration modes](https://docs.prava.space/sdk/integration-modes), [get payment result](https://docs.prava.space/api-reference/get-payment-result), and [report status](https://docs.prava.space/api-reference/report-status).
