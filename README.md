# Fitora

> The local MVP and automated release gates are complete. Fitora can generate and revise catalogue-verified outfits, require a visible order review and explicit approval, complete the labelled mock checkout, and execute the server-side Prava Hosted Checkout create/poll/merchant/report callback workflow. A genuine Prava sandbox transaction has not yet been run.

Fitora is an AI shopping and styling agent for students and young professionals seeking gender-neutral smart-casual outfits. It turns an occasion, budget, sizes, colour preferences, and style into up to three complete catalogue-verified looks, supports controlled revisions, and completes an explicitly approved checkout through either the local mock path or the implemented Prava Hosted Checkout path. The Prava path is verified with mocked HTTP contracts only; live sandbox proof remains behind the documented human gate.

## Planned MVP

- English-only responsive experience.
- Exactly 30 fictional local products: 10 tops, 10 bottoms, and 10 pairs of shoes.
- Deterministic outfit filtering, scoring, diversity, and explanations.
- Controlled agent providers: OpenAI, Gemini, optional local Ollama, and a visibly labelled rules fallback.
- Payment providers: Prava Hosted Checkout and a visibly labelled mock flow.
- Server-authoritative price, size, stock, merchant, and order validation.
- No user accounts, scraping, external product database, or production card processing.

## Current integration status

- Catalogue: 30 validated fictional products (10 tops, 10 bottoms, and 10 pairs of shoes).
- Styling: deterministic rules engine returns up to three ranked, diverse, budget-safe outfits or structured recovery guidance.
- Experience: users can generate, select, and safely refine up to three catalogue-verified looks on mobile or desktop.
- Agent: strict Zod intents and semantic evidence checks constrain each message to one supported action. Provider output proposes an intent only; it cannot supply products, prices, stock, totals, approval, or payment results.
- AI: deterministic rules are the safe default. OpenAI, Gemini, and local Ollama adapters support bounded structured output, timeouts, validation, and truthful rules fallback. Provider output can propose only a constrained styling intent; verified catalogue code owns every product and price.
- State: normal builder storage contains only validated preferences and product ID/size references. Terminal local history is separately schema-limited to five sanitized provider/status/order-reference/total/item-count/time summaries. Agent messages, email, signed tokens, session IDs, raw provider output, product presentation facts, and payment credentials are not persisted.
- Checkout: the browser submits only selected product IDs and sizes. The server rehydrates current catalogue facts and recomputes the order at review, session creation, and finalization. A complete three-item summary, validated email, explicit confirmation checkbox, and click are required before a hosted session is created.
- Checkout security: strict HMAC review, payment-session, and terminal-result claims use short-lived HTTP-only, SameSite=Lax cookies that are Secure in production. Every Prava form receives a distinct lowercase RFC UUID attempt locator. The signed payment-session claim binds that attempt to the reviewed checkout and includes the canonical order snapshot; invalid, expired, mismatched, changed, or tampered state fails closed.
- Payment: the typed provider architecture, full mock path, and direct Prava REST provider are implemented. Mock mode keeps its separate labelled hosted page. Prava mode creates `full_checkout` sessions only after approval, adds the returned `session_token` to the provider-hosted URL, and finalizes only through the server callback; the public mock-finalize endpoint rejects Prava.
- Prava security: the application accepts only the exact official sandbox API and hosted origins with an `sk_test_*` server key. Production constants inside the isolated low-level client are inactive capability scaffolding; the Fitora application does not accept `sk_live_*`. Shopper identity uses an HMAC-derived privacy-preserving `user_id`. Callback URLs are attempt-scoped as `/checkout/callback/<lowercase-RFC-attempt-UUID>`; the bare callback path fails closed, callback query values are ignored, and signed local state plus server-to-server polling determine the outcome.
- Merchant: the server-only demo merchant validates the signed canonical order snapshot and provider context. Catalogue drift disables merchant execution and safely drives a `DECLINED` report. A unique canonical context mismatch is also declined and reported; ambiguous multi-transaction or multi-line context cannot be safely attributed and therefore enters reconciliation. Prava one-time credentials pass through a narrow transient adapter and are never sent to a client, persisted, or returned in a public result.
- Result and creation safety: Prava polling, merchant execution, and `APPROVED`/`DECLINED` reporting use signed progress and reconciliation markers plus in-process callback coalescing. The server-side provider timeout is 10 seconds and the browser waits 15 seconds for an authoritative response. An ambiguous timeout/network result locks that form attempt and leaves a short-lived server tombstone. A 20-minute browser lease serializes cooperative tabs. The review route also issues a one-hour HTTP-only random browser-scope UUID; within one process, the server atomically combines that browser's valid active cookies with outstanding reservations across reviews, caps the aggregate at three, and prunes invalid, expired, orphaned, and terminal sets. A separate best-effort production client throttle allows 20 attempts per 10 minutes. Deployment-level WAF rate limiting remains authoritative across serverless instances; no database-backed cross-instance replay or rate-limit guarantee is claimed.
- Prava verification: create-session, payment-result polling, hosted URL construction, merchant execution, reporting, callback sanitization, and retry/reconciliation branches have mocked automated coverage. No Prava account/key, HTTPS allowed domain, hosted card/OTP/Passkey action, live provider response, or sandbox success is claimed.
- Assets: all 30 catalogue entries still use project-authored 640×800 SVG placeholders recorded in a strict source/license manifest. No generated or licensed final image pack was supplied, so Phase 6 intentionally preserves the truthful fallback set.

See [`docs/STATUS.md`](docs/STATUS.md) for live delivery status and [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) for acceptance criteria.

## Local development

Requirements: Node.js 20.19 or newer and npm. Node.js 24 LTS is recommended.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Agent provider configuration

Keep credentials in an uncommitted `.env.local`. The default needs no model or network service:

```bash
AI_PROVIDER=rules
```

To exercise Gemini, provide both server-only values and restart the Next.js server:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_server_only_key
GEMINI_MODEL=your_supported_model
```

To use the OpenAI Responses API, add these server-only values and restart the Next.js server:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your_server_only_key
OPENAI_MODEL=gpt-5.6-luna
```

Never prefix the variable with `NEXT_PUBLIC_` and never commit it. The OpenAI adapter uses strict structured output, low reasoning effort, bounded retries, and `store: false`. The interface reports both the configured provider and the provider that actually interpreted the request; configuration, timeout, availability, invalid-output, or semantic-evidence failures fall back to rules with an explicit reason.

For an optional Ollama instance reachable from the Next.js server:

```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=your_local_model
```

An ordinary Vercel deployment cannot reach Ollama running on a developer's `localhost`. Use `rules` or Gemini for that deployment unless a separately secured, server-reachable Ollama endpoint is deliberately provisioned. Do not expose a local Ollama service publicly merely to make deployment connectivity work.

## Checkout provider configuration

The default local path needs no external payment account:

```bash
PAYMENT_PROVIDER=mock
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Local mock development has a conspicuous development-only signing fallback. For a stable local setup, and for every production or non-mock runtime, set a strong server-only value with at least 32 characters in uncommitted environment settings:

```bash
CHECKOUT_SIGNING_SECRET=replace_with_a_strong_random_server_only_value
```

The mock flow is:

1. Select one verified outfit and open checkout review.
2. The server reloads all three products and recomputes the order.
3. Review products, sizes, merchant, and USD total.
4. Enter an email, check the explicit approval control, and continue.
5. Choose approve or decline on the separate “Mock payment mode” page.
6. View the sanitized result; refreshing an approved result does not finalize it again.

The Prava code path is available only with a valid HTTPS sandbox configuration:

```bash
PAYMENT_PROVIDER=prava
PRAVA_SECRET_KEY=<server-only sk_test_* sandbox key>
PRAVA_BASE_URL=https://sandbox.api.prava.space
PRAVA_HOSTED_CHECKOUT_ORIGIN=https://sandbox.collect.prava.space
NEXT_PUBLIC_APP_URL=https://<your-exact-fitora-origin>
DEMO_MERCHANT_URL=https://<your-exact-fitora-origin>
CHECKOUT_SIGNING_SECRET=<strong server-only value>
```

Do not commit these values. The application validates the exact official sandbox API and hosted origins, an `sk_test_*` key, the application origin, and the merchant origin as one sandbox-only environment; Prava mode never silently falls back to mock. The isolated low-level client's production constants do not activate live-key support in the application. Follow the live-gate and deployment-rate-limit procedure in [`docs/MANUAL_ACTIONS.md`](docs/MANUAL_ACTIONS.md) before claiming a sandbox transaction.

Latest release evidence: `npm run check` passed lint, strict type-check, Vitest 4.1.10 with 61 files/507 tests, and the Next.js 16.2.12 production build. Playwright 1.61.1 also passed 10/10 desktop/mobile mock journeys after the latest hardening. See [`docs/TEST_EVIDENCE.md`](docs/TEST_EVIDENCE.md) for the sanitized evidence record.

Implementation references: [Prava authentication and environments](https://docs.prava.space/authentication), [create session](https://docs.prava.space/api-reference/create-session), [hosted integration modes](https://docs.prava.space/sdk/integration-modes), [get payment result](https://docs.prava.space/api-reference/get-payment-result), and [report status](https://docs.prava.space/api-reference/report-status).

Quality gates:

```bash
npm run check
npm run test:e2e
```
