# Fitora Test Evidence

All evidence in this document must remain sanitized. Never record secret keys, authorization headers, signed checkout tokens, card data, one-time credentials, dynamic CVV, expiry, or unredacted personal data.

## Phase 0 — Workspace baseline

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Execution pack preserved | Pass | Root contains `AGENTS.md`, `00_START_HERE.md`, `CODEX_MASTER_PROMPT.txt`, `.env.example`, and the four authoritative documents under `docs/` |
| Duplicate prompt files | Pass | The two separately supplied files are byte-for-byte identical to their archive counterparts by SHA-256 comparison |
| Archive path safety | Pass | No duplicate or path-traversal entry names detected |
| Git repository | Pass | Empty local repository detected and branch renamed to `main` |
| Port availability | Pass | No listener detected on port 3000 during the baseline audit |
| Browser baseline | Pass | Local Edge and Chrome installations detected; Playwright project dependency is pending |
| Prava skill installation | Not installed | Global external-code installation was rejected by the security review; official documentation will be used instead |

## Phase 0 quality gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint completed with no findings |
| `npm run typecheck` | Pass | TypeScript strict no-emit check completed |
| `npm test` | Pass | Vitest 4.1.10: 1 file and 1 test passed |
| `npm run build` | Pass | Next.js 16.2.12 production build compiled and prerendered `/` and `/build` |
| Local HTTP smoke | Pass | `GET http://127.0.0.1:3000/` returned 200 and contained Fitora plus the mock-mode disclosure |
| In-app browser smoke | Pass | Document title, Fitora heading, “Build my outfit” link, and “Mock payment mode” text detected |

Phase 0 exit criteria are satisfied: the app serves locally, all required scripts exist, the initial unit-test baseline passes, the production build is clean, and a Git baseline exists.

## Phase 1 — Catalogue and deterministic styling

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Catalogue contract | Pass | Exactly 30 unique, schema-valid products: 10 tops, 10 bottoms, and 10 shoes; prices are integer cents and referenced image paths are local |
| Repository immutability | Pass | The trusted catalogue and nested product values are recursively frozen |
| Deterministic generation | Pass | Stable input produces the same ranking and explicit product-ID tie-breaking |
| Commerce validation | Pass | Size, stock, category, budget, duplicate-product, and total checks are server-controlled |
| Canonical rehydration | Pass | Forged client price and stock fields are ignored; unknown IDs and category swaps are rejected |
| Recommendation quality | Pass | Three complete, distinct outfits are returned for the standard fixture, with score breakdowns and truthful explanation codes |
| Edge cases | Pass | Zero budget, impossible budget, no preferred colours, exclusions, scarce candidate reuse, and malformed requests are covered |
| Route contracts | Pass | Health and outfit-generation route handlers return validated success and structured error payloads |

## Phase 1 quality gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint completed with no findings |
| `npm run typecheck` | Pass | TypeScript strict no-emit check completed |
| `npm test` | Pass | Vitest 4.1.10: 8 files and 40 tests passed |
| `npm run build` | Pass | Next.js 16.2.12 production build compiled all static pages and dynamic API routes |
| `git diff --check` | Pass | No whitespace errors detected before the milestone commit |

Phase 1 exit criteria are satisfied: catalogue facts are typed and immutable, recommendations are deterministic and budget-safe, untrusted selections are canonically rehydrated, route contracts are tested, and the complete quality gate passes.

## Phase 2 — Editorial preference and outfit experience

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Landing journey | Pass | Exact Fitora tagline, primary build action, three required journey steps, fixed-local-catalogue wording, and active provider disclosures are rendered |
| Preference validation | Pass | Occasion, USD budget, separate top/bottom sizes, EU shoe size, style, preferred colours, and excluded colours have labelled controls and precise recovery errors |
| Result contract | Pass | Client validates one to three unique `OutfitSchema` results and rejects duplicate IDs/combinations, malformed totals, malformed payloads, and non-contract errors |
| Outfit presentation | Pass | Each card shows three meaningful local images, product names, requested sizes, stock, prices, verified total, budget remaining, explanation, and score breakdown |
| Selection state | Pass | A native radio group keeps one selection; stale requests/results cannot overwrite current preferences or remain selectable |
| Safe persistence | Pass | Only validated preferences and product IDs/sizes are stored; corrupt/unavailable storage degrades to a truthful session-only state under React Strict Mode |
| Provider truthfulness | Pass | Rules/Gemini/Ollama and Mock/Prava labels resolve from validated server configuration; invalid values are explicitly labelled |
| Product assets | Pass | Exactly 30 4:5 project-authored SVG placeholders exist, all catalogue paths and manifest entries match, and automated checks reject scripts/external/data URLs |
| Responsive keyboard journey | Pass | Playwright verifies landing-to-results-to-selection, low-budget recovery, real skip-link focus, keyboard selection, and no horizontal overflow at 375 px |
| Browser errors | Pass | No page exceptions or unexpected console errors; the known 422 network message for an intentionally impossible budget is explicitly distinguished |

## Phase 2 quality gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint completed with no findings |
| `npm run typecheck` | Pass | TypeScript strict no-emit check completed |
| `npm test` | Pass | Vitest 4.1.10: 14 files and 88 tests passed |
| `npm run build` | Pass | Next.js 16.2.12 production build compiled all pages and dynamic routes |
| `npm run test:e2e` | Pass | Playwright 1.61.1: 4 desktop/mobile cases passed; direct runner cleaned up its Windows server process |
| In-app browser structure | Pass | Landing and build pages expose the expected semantic headings, labels, provider modes, simulated-inventory disclosures, and navigation |
| `git diff --check` | Pass | No whitespace errors detected before the milestone commit |

Phase 2 exit criteria are satisfied: the journey works at mobile and desktop widths, keyboard and form validation paths pass, no unexpected browser errors remain, persistence is non-sensitive and failure-safe, and all quality gates are green.

## Phase 3 — Controlled agent orchestration

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Strict intent boundary | Pass | A strict discriminated Zod union accepts only the supported action families and finite enum values; unknown and authority-bearing fields such as product, price, tool, approval, and payment data are rejected |
| Deterministic rules interpretation | Pass | Tests cover all action families, Unicode normalization, single-action enforcement, exact integer-cent budget parsing, replacement modifiers, explicit outfit-position context, and typed unsupported reasons |
| Adversarial text handling | Pass | Prompt-injection markers, negated commands, quoted/meta instructions, multiple actions, ambiguous parameters, malformed or truncated amounts, and unrelated numbers do not execute as positive commands |
| Semantic evidence guard | Pass | Every model-proposed action and parameter must be supported by the current user message; invented categories, styles, colours, amounts, operations, positions, checkout requests, and action-family changes are rejected before execution |
| Canonical input state | Pass | The route accepts only preferences plus one to three product ID/size references and an optional visible selected reference; unknown, duplicate, oversized, or forged rich product state is rejected before provider execution |
| One controlled execution | Pass | Each accepted turn resolves one intent and invokes one deterministic generation, revision, selection, checkout-review, help, or no-change path; provider output never chooses an unverified product or supplies commerce facts |
| Deterministic revisions | Pass | Replacement and cheaper-item tests verify strict savings, target style/colour constraints, exclusions, visible-outfit diversity, immutable inputs, canonical starting references, and typed no-change/no-result recovery |
| Final commerce verification | Pass | Every changed response is canonically rehydrated again and compared with recomputed catalogue products, sizes, stock, totals, scores, explanations, uniqueness, and selected-outfit membership before it leaves the server |
| Provider adapters | Pass | Rules, Gemini, and Ollama adapters validate inputs and outputs. Gemini tests use an injected client to verify structured JSON, deterministic settings, bounded retry and timeout; Ollama tests use mocked HTTP to verify native chat format, URL/envelope validation, timeout, and failure handling |
| Provider truthfulness | Pass | Responses separately identify configured provider, actual interpreter, template explanation mode, and a finite fallback reason. Missing configuration, invalid configuration/output, timeout, unavailability, and semantic mismatch cannot be presented as successful model interpretation |
| Gemini live gate | Deferred | Adapter and mocked integration coverage passed. No genuine Gemini credential or live-model manual test has been run or claimed |
| Agent route | Pass | `/api/agent` returns schema-valid no-store responses, sanitized validation fields, 409 for unverifiable catalogue state, and a generic 500 boundary without exposing provider payloads or secrets |
| Agent interface | Pass | Component coverage verifies accessible suggested revisions, the 280-character limit, compact request payloads, response schema validation, actual provider/fallback labels, stale-request cancellation, and safe selected/no-result synchronization |
| Safe persistence | Pass | Only validated preferences and product ID/size selection references are persisted. Agent messages, chat history, raw provider output, product presentation/commerce facts, and payment data are not persisted |
| Checkout boundary | Pass | Checkout intent requires a selected visible outfit and yields `CHECKOUT_REVIEW_READY` only. Route and browser tests confirm no payment session, checkout navigation, payment button, or request to a checkout/payment/Prava path occurs |
| Responsive agent journey | Pass | Playwright exercises cheaper-shoes and relaxed-style revisions, catalogue-verified total reduction, selection, truthful rules labels, and checkout review on desktop and mobile with no unexpected browser errors |

## Phase 3 quality gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint completed with no findings |
| `npm run typecheck` | Pass | TypeScript strict no-emit check completed |
| `npm test` | Pass | Vitest 4.1.10: 26 files and 200 tests passed |
| `npm run build` | Pass | Next.js 16.2.12 production build compiled `/`, `/build`, `/api/agent`, `/api/health`, and `/api/outfits/generate` |
| `npm run check` | Pass | Lint, type-check, all 200 tests, and production build completed successfully in one run |
| `npm run test:e2e` | Pass | Playwright 1.61.1: 6 desktop/mobile cases passed; the project-owned Windows server process exited cleanly |

Phase 3 exit criteria are satisfied: model output remains an untrusted intent proposal, semantic evidence and canonical catalogue data bound every action, deterministic tools own every state change, fallback is visible and truthful, chat is not persisted, and checkout review remains non-transactional.

## Phase 4 — Checkout review and provider abstraction

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Checkout review boundary | Pass | The selected outfit is reduced to three product ID/size references; `/api/checkout/review` rejects extra commerce facts, rebuilds the order from the trusted catalogue, recomputes the USD total, and creates no payment session |
| Repeated server authority | Pass | Review rendering, payment-session creation, and finalization each resolve signed state and rehydrate current catalogue product, category, merchant, size, stock, price, currency, and total facts; unknown, unavailable, changed, or forged orders fail closed |
| Explicit user approval | Pass | The review page shows exactly three canonical items, selected sizes, line prices, demo merchant, and total. A validated email plus a separate visible confirmation checkbox and click are required before `/api/checkout/create-session` runs |
| Signed checkout state | Pass | Strict HMAC claims cover review, provider session, and terminal result state. Tests reject malformed segments, invalid signatures, oversized tokens, invalid timestamps/lifetimes, future-issued state, expiry, order mismatches, and session-to-review binding mismatches |
| Cookie policy | Pass | Review, session, and result tokens use separate HTTP-only, SameSite=Lax, Path=/ cookies with bounded maximum ages; `Secure` is enabled in production and terminal completion clears transient review/session cookies |
| Configuration boundary | Pass | Mock development can use a conspicuous development-only signing fallback. Production and non-mock configurations require a server-only signing secret of at least 32 characters; malformed origins, merchant settings, provider values, and Prava prerequisites fail validation |
| Provider abstraction | Pass | At the Phase 4 snapshot, the typed provider contract validated create/finalize inputs and outputs, mock resolved as ready, and selecting the then-unavailable Prava provider failed closed without masquerading as or silently falling back to mock. The implemented Prava evidence is recorded in Phase 5 below |
| Mock hosted checkout | Pass | The separate `/checkout/mock` page persistently states “Mock payment mode — Prava credentials are not configured.”, exposes approve/decline simulation controls, and contains no card, CVV, expiry, OTP, Passkey, or credential input |
| Demo merchant | Pass | The server-only adapter independently verifies the canonical order and provider-session context before producing a deterministic sanitized order reference or typed decline |
| Retry-safe terminal result | Pass | `/api/checkout/finalize` returns an existing valid signed terminal result before any repeated provider or merchant invocation. Playwright confirms result refresh preserves the same order reference and does not issue a second finalize request |
| Result state machine | Pass | Schema and UI coverage includes awaiting-payment, provider-confirmed pending, approved, declined, expired, reconciliation-required, and mock-success presentation. A created-but-unused session is not called pending; invalid signed-cookie combinations become reconciliation-required rather than false success |
| Mutation request guard | Pass | Every checkout POST requires `application/json`; supplied Origin must exactly match the configured app origin, production requires Origin, and sibling-origin/text-plain attack tests fail before cookie or payment state mutation |
| Redirect and HTTPS policy | Pass | Mock redirects collapse to same-origin `/checkout/mock`; future Prava redirects must match the exact configured HTTPS Prava origin, while production and every Prava configuration require HTTPS app and merchant origins |
| Sanitized local history | Pass | Browser history accepts only a strict terminal summary containing provider, status, approved order reference when applicable, USD total, item count, and completion time; it deduplicates and caps history at five entries |
| Sensitive-data exclusion | Pass | Tests and browser assertions verify that email, signed tokens, provider session IDs, raw product data, card terms, CVV, and expiry do not enter local history or the public result view |
| Full mock journey | Pass | Desktop and mobile Playwright journeys cover preferences → outfits → optional agent revision → selection → review → explicit email/checkbox approval → mock hosted page → approve or decline → sanitized result, with no unexpected console or page errors |

## Phase 4 quality gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint completed with no findings as part of the final Phase 4 gate |
| `npm run typecheck` | Pass | TypeScript strict no-emit check completed as part of the final Phase 4 gate |
| `npm test` | Pass | Vitest 4.1.10: 49 files and 378 tests passed |
| `npm run build` | Pass | Next.js 16.2.12 production build compiled the checkout APIs and review, mock-hosted, and result pages |
| `npm run check` | Pass | Lint, type-check, all 49 files/378 tests, and production build completed successfully in one run |
| `npm run test:e2e` | Pass | Playwright 1.61.1: 10/10 desktop/mobile cases passed, including four checkout approval/decline runs |
| Refresh idempotency browser proof | Pass | Approved mock result retained its sanitized order reference after reload and the observed `/api/checkout/finalize` request count remained one |

Phase 4 exit criteria are satisfied for the mock provider: the complete explicitly approved mock transaction path passes on desktop and mobile, and mock mode cannot be mistaken for Prava. Retry safety is deliberately bounded to the signed-cookie MVP because no shared database exists; global replay protection across copied cookies, browsers, or server instances is not claimed. The real Prava items that were future work at this milestone are covered by the Phase 5 working-tree evidence below; live sandbox proof remains separate and unclaimed.

## Phase 5 — Prava Hosted Checkout implementation

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Official contract mapping | Pass (mocked) | Direct REST contracts cover `POST /v1/sessions`, `GET /v1/sessions/{sessionId}/payment-result`, and `POST /v1/sessions/{sessionId}/report-status` using current official field names, exact USD decimal strings, bounded schemas, and sanitized errors |
| Authentication/environment boundary | Pass (mocked) | Application configuration accepts only the exact official sandbox API/hosted origins with an `sk_test_*` key. Production Prava origins, `sk_live_*`, mismatched origins/keys, non-HTTPS Fitora/merchant origins, missing signing secrets, and malformed keys fail closed. Production constants tested inside the isolated low-level client are inactive capability scaffolding, not an accepted application environment |
| Privacy-preserving identity | Pass | The normalized shopper email is required only where the provider contract needs it; the Prava `user_id` is a stable domain-separated HMAC and does not reveal the email |
| Session creation | Pass (mocked) | The route rehydrates the canonical three-item order, requires the existing visible approval boundary, assigns each rendered form a distinct lowercase RFC UUID attempt ID, and submits `integration_type: "full_checkout"` with `/checkout/callback/<attempt-UUID>`. Its signed payment token binds the attempt ID and review JTI to the canonical order snapshot and stores no hosted credential |
| Hosted redirect | Pass (mocked) | The returned `iframe_url` must match the exact hosted origin for its environment; stale/duplicate `session_token` values are replaced with the returned token, which is used only in the redirect URL and not persisted in public application state |
| Browser callback boundary | Pass (mocked) | `/checkout/callback/<lowercase-RFC-attempt-UUID>` reads only that attempt's signed state and verifies the path locator against the payment claim. The bare callback, invalid locator, cross-attempt cookies, and attacker query values fail closed without selecting or authorizing payment state |
| Provider polling and create timeout | Pass (mocked) | Bounded server-side polling covers `pending`, `awaiting_result`, `completed`, and `failed`, including timeout, oversized/malformed response, HTTP error, and uncertain-state handling. Prava session creation has a 10-second server boundary; the browser waits 15 seconds so an authoritative response can arrive first |
| Credential containment | Pass | One-time token, dynamic CVV, expiry, and transaction context are parsed into a narrow server-only object passed directly to the merchant adapter; automated assertions verify they are absent from callback responses, result cookies, public errors, and serialized output |
| Canonical drift and mismatch handling | Pass | The signed payment token carries the canonical order snapshot. Catalogue drift disables merchant execution and safely reports `DECLINED`. One uniquely attributable merchant/amount/product mismatch also declines/reports; ambiguous multi-transaction or multi-line context enters reconciliation without guessing a transaction reference |
| Demo merchant | Pass | The Prava-specific demo merchant runs only after canonical context validation and returns a deterministic approved or declined outcome without logging, returning, or persisting credentials |
| Provider reporting | Pass (mocked) | Every merchant attempt maps to exactly `APPROVED` or `DECLINED`; report requests carry the bound transaction reference and sanitized outcome fields, while confirmed and uncertain provider responses take distinct paths |
| Retry, uncertainty, and reconciliation | Pass (mocked) | Current provider state is checked before merchant work; signed progress resumes reporting without re-executing the merchant, signed reconciliation prevents false terminal success, and concurrent callbacks for one session coalesce within one process. Browser timeout/network ambiguity locks the form, and an in-process tombstone prevents automatic recreation of an uncertain attempt |
| Attempt and cookie capacity | Pass | A 20-minute browser lease serializes cooperative tabs. A one-hour HTTP-only random browser scope lets same-process logic atomically union active cookie IDs with outstanding reservations across distinct reviews and reject an aggregate fourth attempt before provider fetch. Invalid, expired, orphaned, and terminal sets are pruned; the separate best-effort production client bucket permits 20 distinct attempts per 10 minutes |
| Distributed rate-limit boundary | Human gate | Application browser/process controls are not authoritative across independent Vercel instances. Before public deployment, configure a WAF rule for `POST /api/checkout/create-session`; initial recommendation is 20 requests per 10 minutes per source IP, adjustable downward after legitimate demo traffic is observed |
| Browser-controlled finalize rejection | Pass | The public mock-finalize route rejects a Prava payment attempt and states that real hosted payments finalize only after the provider callback |
| Mock-path regression | Pass | The separate labelled mock hosted page and its explicit approve/decline journey remain available as the credential-free default |
| Live Prava sandbox | Not run | No real account/key, deployed HTTPS allowed domain, hosted card/OTP/biometric/Passkey approval, live session response, or sandbox completion has been supplied or claimed |

## Phase 5 final release gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run check` | Pass | ESLint, strict TypeScript, Vitest 4.1.10 with 61 files/507 tests, and the Next.js 16.2.12 optimized production build completed in one clean run |
| `npm test` | Pass | Vitest 4.1.10: 61 files and 507 tests passed in the final full-suite run |
| `npm run test:e2e` | Pass | Playwright 1.61.1 passed 10/10 desktop/mobile cases after the latest hardening, including four mock checkout approval/decline journeys |
| Secret/sensitive-field assertions | Pass in automated suites | Tests exercise authorization/session/credential redaction boundaries with synthetic placeholders only; no genuine Prava secret or payment credential is present |

This evidence proves the implemented contracts and state machine against mocked provider responses. It does not prove provider availability, dashboard configuration, allowed-domain acceptance, hosted authentication, or a successful real sandbox payment. Contract sources: [authentication and environments](https://docs.prava.space/authentication), [create session](https://docs.prava.space/api-reference/create-session), [integration modes](https://docs.prava.space/sdk/integration-modes), [get payment result](https://docs.prava.space/api-reference/get-payment-result), and [report status](https://docs.prava.space/api-reference/report-status).

## Phase 6 — Product asset manifest

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Catalogue-to-manifest mapping | Pass | The strict manifest contains exactly the same 30 product IDs as the catalogue: 10 tops, 10 bottoms, and 10 shoes |
| Local fallback coverage | Pass | Every product maps to an existing local SVG and to itself as the fallback; no remote, data, script, or untracked asset path is accepted |
| Dimensions and format | Pass | Every placeholder declares and renders a 640×800 4:5 SVG canvas |
| Provenance | Pass | Every entry is explicitly `project-authored`, `project-owned`, brand-neutral, and requires no attribution |
| Final image pack | Not supplied | No generated or clearly licensed final image bundle was provided, so the safe placeholders were deliberately retained and are not described as product photography |

Phase 6 is complete for the available inputs: the asset ledger is strict and truthful, and the fallback set is complete. Replacing these files remains conditional on receiving a verifiable image pack with exact source, license, dimensions, and product mapping.
