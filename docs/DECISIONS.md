# Fitora Decisions

## D-001 — Preserve deterministic authority

- Date: 2026-07-26
- Status: Accepted
- Decision: Catalogue data, filtering, outfit scoring, totals, inventory validation, intent execution, and payment state remain deterministic server-controlled logic. AI providers may interpret or explain but never become a source of commerce truth.
- Reason: This is the central safety and truthfulness requirement of the execution pack.

## D-002 — Safe local defaults

- Date: 2026-07-26
- Status: Accepted
- Decision: The application will boot with `AI_PROVIDER=rules` and `PAYMENT_PROVIDER=mock`. Both modes will be visibly labelled. Genuine Gemini and Prava modes remain configurable server-side.
- Reason: Local development and automated tests must remain unblocked without misrepresenting integration status.

## D-003 — Editorial design direction

- Date: 2026-07-26
- Status: Accepted
- Decision: Use a warm off-white canvas, near-black editorial typography, muted sage/taupe accents, generous whitespace, 4:5 product imagery, restrained motion, and a serif display face paired with a highly legible sans-serif system stack.
- Reason: This applies the product brief while preserving contrast, mobile usability, and reduced-motion support.

## D-004 — Prava integration source

- Date: 2026-07-26
- Status: Accepted
- Decision: Do not install the external Prava coding-agent repository globally after the security review rejected that persistent trust boundary. Implement against current official Prava documentation and isolate the integration behind a provider adapter.
- Reason: The execution pack explicitly permits proceeding from official documentation when skill installation is unavailable.

## D-005 — Deployment target precedence

- Date: 2026-07-26
- Status: Accepted
- Decision: Preserve the authoritative Next.js App Router and Vercel architecture. General site-building guidance informs UX and validation but does not replace the requested framework or hosting target.
- Reason: The supplied project specification takes precedence over generic website scaffolding defaults.

## D-006 — ESLint compatibility over newest major

- Date: 2026-07-26
- Status: Accepted
- Decision: Use the stable ESLint 9 line with `eslint-config-next@16.2.12` instead of ESLint 10.
- Reason: The official Next.js 16.2 scaffold selects ESLint 9, and transitive accessibility/import/react plugins currently declare peer support through ESLint 9. Installing ESLint 10 produced invalid peer-resolution evidence, so the compatible line is safer for a clean quality gate.

## D-007 — Rehydrate all commerce selections at the server boundary

- Date: 2026-07-26
- Status: Accepted
- Decision: Accept only product IDs and requested sizes from recommendation or checkout clients, then reload category, price, stock, and all other facts from the immutable server catalogue before validation or total calculation.
- Reason: Client-visible outfit objects are presentation data and can be tampered with. Canonical rehydration prevents forged price, inventory, category, and total values from entering commerce logic.

## D-008 — Treat the first catalogue colour as the dominant styling colour

- Date: 2026-07-26
- Status: Accepted
- Decision: Score outfit colour compatibility from each product's first listed colour while retaining all listed colours for preference and exclusion filtering.
- Reason: Taking the best score across every colour pair collapsed much of the real catalogue to the same maximum score. An explicit dominant-colour convention produces meaningful, deterministic variation without hidden AI judgment.

## D-009 — Derive visible provider modes from validated server configuration

- Date: 2026-07-26
- Status: Accepted
- Decision: Resolve AI and payment modes through one server-side allowlist and render those active values in both health output and interface badges. Unknown values display an explicit invalid-configuration label.
- Reason: Hard-coded mode badges become false as soon as an integration is enabled; truthful mode disclosure is an application contract, not decorative copy.

## D-010 — Treat outfit generation as a one-to-three result contract

- Date: 2026-07-26
- Status: Accepted
- Decision: Accept and present one, two, or three unique server-validated outfits. Standard demo inputs still return three; narrowly viable budgets may truthfully return fewer.
- Reason: The deterministic engine promises up to three distinct results. Rejecting a valid one- or two-result response incorrectly turns a constrained but useful result into an application error.

## D-011 — Persist references, never presentation or commerce facts

- Date: 2026-07-26
- Status: Accepted
- Decision: Browser storage may contain validated preferences and selected product IDs/sizes only. It must never contain prices, stock, merchant facts, product objects, chat history, or payment data; unavailable storage becomes an explicitly session-only experience.
- Reason: Convenience state is untrusted and optional. Every future commerce transition must rehydrate canonical server facts.

## D-012 — Own the Playwright server lifecycle on Windows

- Date: 2026-07-26
- Status: Accepted
- Decision: Run end-to-end tests through a small Node launcher that starts the Next CLI directly, confirms the Fitora health endpoint, lets Playwright reuse that server, and terminates the child process in a `finally` block.
- Reason: Playwright completed all cases but its built-in Windows web-server wrapper did not exit reliably. Explicit lifecycle ownership makes `npm run test:e2e` deterministic without weakening test coverage.

## D-013 — Treat model output as an evidence-bound intent proposal

- Date: 2026-07-26
- Status: Accepted
- Decision: Gemini or Ollama may propose exactly one member of the strict `AgentIntent` union. The server reparses that output with Zod and independently requires the action and every parameter to appear unambiguously in the current user message before any tool runs.
- Reason: A JSON schema alone proves shape, not semantic truth. The evidence guard prevents invented categories, colours, styles, amounts, operations, positions, checkout requests, prompt-injection actions, and hidden-context decisions from becoming executable state changes.

## D-014 — Execute one deterministic tool and verify the final state again

- Date: 2026-07-26
- Status: Accepted
- Decision: Each agent turn maps one verified intent to one bounded deterministic path. Submitted product ID/size references are canonically rehydrated before interpretation, and every resulting outfit state is rehydrated and compared again before the response is released.
- Reason: Initial validation does not prove that revision code produced a valid commerce state. Final verification keeps catalogue products, sizes, stock, totals, scores, explanations, uniqueness, and selection membership server-authoritative across the whole turn.

## D-015 — Disclose configured provider, actual interpreter, and fallback separately

- Date: 2026-07-26
- Status: Accepted
- Decision: Agent responses report the configured provider, the provider that actually interpreted the request, deterministic template explanation mode, and a finite fallback reason. Rules are the default; Gemini and Ollama failures fall back only after cancellation, timeout, output, and semantic checks.
- Reason: A configured model is not necessarily the model that completed a request. Separate fields make missing credentials, invalid configuration, timeout, unavailability, invalid output, and semantic mismatch visible without leaking raw provider data.

## D-016 — Keep Phase 3 agent persistence reference-only

- Date: 2026-07-26
- Status: Accepted
- Decision: Persist only validated preferences and product ID/size selection references. Keep agent messages, chat history, raw provider output, product presentation facts, and future payment data in transient memory only; abort and discard requests when their verified context becomes stale.
- Reason: Agent conversation is unnecessary for recovery and expands both privacy and stale-state risk. Compact references can always be revalidated against current server authority.

## D-017 — Make checkout intent review-only until checkout architecture exists

- Date: 2026-07-26
- Status: Accepted
- Decision: `REQUEST_CHECKOUT` requires an explicitly selected visible outfit and produces only a `CHECKOUT_REVIEW_READY` event. It creates no hosted session, payment request, approval, redirect, or payment control in Phase 3.
- Reason: Natural-language intent must never authorize payment. Session creation belongs behind the future explicit order summary and visible user action in the checkout provider phases.

## D-018 — Keep local Ollama optional and deployment-aware

- Date: 2026-07-26
- Status: Accepted
- Decision: Support Ollama through a validated server-side HTTP(S) base URL and model setting, but do not assume a local developer instance is reachable from Vercel. Hosted deployments use rules or Gemini unless a separately secured, server-reachable Ollama endpoint is intentionally provisioned.
- Reason: `localhost` in a Vercel function refers to the deployment environment, not the developer's computer. Making this limitation explicit prevents a local-only integration from being presented as deployable or encourages unsafe public exposure.

## D-019 — Carry checkout state in three short-lived signed cookie stages

- Date: 2026-07-26
- Status: Accepted
- Decision: Issue distinct HMAC-signed review, payment-session, and terminal-result claims. Transport them only in bounded HTTP-only, SameSite=Lax, Path=/ cookies, add `Secure` in production, and isolate each Prava form with a fresh lowercase RFC UUID used in its cookie names and callback path. Bind payment state to both that attempt ID and the reviewed checkout JTI, and include the canonical order snapshot in the signed payment-session claim. Rehydrate the current catalogue at commerce transitions, but retain the signed snapshot as the callback authority when the catalogue later drifts.
- Reason: A browser must bridge redirects without becoming an authority for product, stock, price, merchant, total, provider session, or result facts. Per-form signed binding prevents tabs from selecting each other's state. The signed snapshot lets a legitimate provider callback be safely declined and reported even when the mutable catalogue no longer matches it.

## D-020 — Create hosted sessions only after visible review and explicit approval

- Date: 2026-07-26
- Status: Accepted
- Decision: Showing a selected outfit or interpreting checkout intent may prepare review state only. Session creation requires the complete canonical order summary, a validated email, a separate visible confirmation checkbox, and a user click. Mock checkout lives on its own persistently labelled hosted page and never renders card-data fields.
- Reason: Natural-language intent and selection are not payment authorization. The separate approval boundary keeps short-lived sessions fresh and makes the simulated provider impossible to confuse with Prava.

## D-021 — Resolve payment providers explicitly and fail closed

- Date: 2026-07-26
- Status: Accepted
- Decision: Keep create-session behavior behind one typed provider interface with schema-validated inputs and outputs. `mock` and `prava` are implemented as distinct providers, while real Prava finalization is callback-only and cannot be invoked through the browser-controlled mock finalize endpoint. An invalid or unavailable Prava configuration must never fall back to mock.
- Reason: A common creation boundary preserves explicit provider selection, while a separate callback finalization boundary prevents a browser decision from controlling a real provider outcome.

## D-022 — Make terminal finalization retry-safe within the cookie-only MVP boundary

- Date: 2026-07-26
- Status: Accepted
- Decision: Before invoking a provider or merchant during finalization, accept an already valid signed terminal result only when no review/session cookies indicate a newer checkout. On first terminal completion, issue a one-hour sanitized result cookie and clear transient review/session cookies. A real provider-pending response issues a separate short-lived marker bound to checkout and payment-attempt JTIs; a merely created session remains `awaiting_payment`. Side-effecting Prava creation uses a 10-second server timeout; the browser waits 15 seconds, then locks an ambiguous form attempt. A same-process uncertain tombstone prevents automatic duplication until expiry. Do not claim global replay protection across copied cookies, browsers, lost responses, or independent server instances without shared storage/provider idempotency.
- Reason: This prevents ordinary double-click, retry, refresh, and delayed-response duplication while preserving the no-database MVP constraint. The longer browser boundary gives the server a chance to return an authoritative failure, while the locked UI and tombstone treat an unknown create outcome conservatively. The limitation is explicit so local idempotency is not mistaken for a durable distributed transaction ledger.

## D-023 — Persist only a bounded sanitized terminal history

- Date: 2026-07-26
- Status: Accepted
- Decision: Local order history may contain at most five schema-validated, deduplicated terminal summaries: provider, approved/declined status, approved order reference when present, USD total, item count, and completion time. Never persist email, signed tokens, provider session IDs, decline internals, product presentation data, or payment credentials.
- Reason: A small local recap improves demo continuity without turning browser storage into a payment-state authority or exposing checkout-sensitive material.

## D-024 — Guard checkout mutations and hosted navigation by origin

- Date: 2026-07-26
- Status: Accepted
- Decision: Every checkout POST must use JSON and any supplied browser Origin must exactly match the configured Fitora origin; production also rejects an omitted Origin. Production and Prava configurations require HTTPS app and merchant origins. Mock hosted navigation is same-origin only. The Fitora application permits Prava only with the exact official sandbox API and hosted-checkout origins plus an `sk_test_*` key. Production-origin and `sk_live_*` constants remain isolated low-level client capability and are not accepted by application configuration.
- Reason: SameSite cookies are site-scoped rather than origin-scoped. Explicit media-type/origin checks block sibling-subdomain mutation attempts, and exact redirect pinning prevents a provider-output error from becoming an open redirect.

## D-025 — Follow the current Prava Hosted Checkout REST lifecycle

- Date: 2026-07-26
- Status: Accepted
- Decision: Create a Prava session only after explicit checkout approval using `integration_type: "full_checkout"`, canonical USD decimal totals, server-rehydrated merchant/product facts, and an attempt-scoped HTTPS callback at `/checkout/callback/<lowercase-RFC-attempt-UUID>`. Construct the hosted redirect from the returned `iframe_url` and set its `session_token` query parameter. After the callback, poll the payment result and report the demo merchant outcome as exactly `APPROVED` or `DECLINED` whenever one canonical transaction can be safely identified.
- Reason: This matches the current official [create-session](https://docs.prava.space/api-reference/create-session), [hosted integration](https://docs.prava.space/sdk/integration-modes), [payment-result](https://docs.prava.space/api-reference/get-payment-result), and [report-status](https://docs.prava.space/api-reference/report-status) contracts while keeping sessions short-lived and provider facts schema-validated.

## D-026 — Treat browser callback data as a signal, never payment truth

- Date: 2026-07-26
- Status: Accepted
- Decision: Ignore every callback query parameter. Require the lowercase RFC attempt UUID in the callback path, bind it to the signed payment-session claim, and fail closed on the bare `/checkout/callback` route or any invalid/mismatched locator. Resolve payment state from attempt-scoped HMAC cookies, then obtain status server-to-server. Derive Prava `user_id` from a domain-separated HMAC of normalized email rather than using email itself as the externally visible identifier.
- Reason: The documented callback does not provide a browser value that Fitora can safely treat as authenticated payment state. The opaque path locator selects only a signed, matching cookie set; it grants no authority by itself. Signed binding plus provider polling prevents attacker-controlled query, status, token, session, or order data from authorizing merchant execution.

## D-027 — Keep Prava credentials transient and make retries resumable

- Date: 2026-07-26
- Status: Accepted
- Decision: Parse one-time token, dynamic CVV, expiry, transaction reference, and product context into a narrow server-only credential object; pass it directly to the demo merchant adapter; and never log, stringify for diagnostics, persist, return, or expose it to a client component. Before merchant execution, check current Prava state and compare provider context with the signed canonical order snapshot. Catalogue drift disables merchant execution and produces a safe `DECLINED` report. A unique canonical merchant/amount/product mismatch also declines and reports; ambiguous multi-transaction or multi-line context enters reconciliation because no transaction reference can be safely selected. Use signed progress/reconciliation markers and in-process promise coalescing so callback retries can resume reporting without intentionally executing the merchant again.
- Reason: Prava credentials are ultra-sensitive, while reporting may fail after merchant execution. Fail-closed context handling prevents incorrect merchant execution without inventing a transaction reference. A signed expected outcome supports safe local retry progress without inventing a durable distributed transaction ledger; cross-instance and lost-cookie guarantees still require shared storage or provider idempotency and are not claimed.

## D-028 — Preserve the truthful Phase 6 placeholder asset set

- Date: 2026-07-26
- Status: Accepted
- Decision: Retain the 30 project-authored, project-owned, brand-neutral 640×800 SVG placeholders and their strict manifest until a generated or clearly licensed final image pack is actually supplied and verified.
- Reason: Replacing assets without source, license, dimensions, and exact product mapping would create unsupported provenance claims. The manifest-backed placeholders remain a complete, safe fallback rather than being misrepresented as photography.

## D-029 — Bound Prava session creation at browser, cookie, process, and deployment layers

- Date: 2026-07-26
- Status: Accepted
- Decision: Use a 20-minute cooperative browser lease to serialize tabs and a one-hour HTTP-only random UUID to scope server reservations to one browser without storing customer data. Before creating a session, enumerate attempt-scoped cookies, prune invalid, expired, orphaned, and terminal sets, and atomically union valid active IDs with outstanding reservations across reviews; reject any addition beyond three. Also limit one signed review to three distinct attempts and apply a separate best-effort production client threshold of 20 attempts per 10 minutes. Before public Vercel deployment, require a WAF rule on `POST /api/checkout/create-session`, initially 20 requests per 10 minutes per source IP and adjustable downward after observing demo traffic.
- Reason: Root-scoped signed cookies are large enough that unbounded attempts could exhaust request headers, while concurrent tabs and distinct reviews can race before new cookies arrive. The opaque browser scope closes that same-process aggregate race but grants no payment authority. The WAF is still authoritative across independent serverless instances because application memory and browser cooperation cannot provide a distributed rate limit.
