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
