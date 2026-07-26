# Fitora

> Implementation in progress. Phase 4 is complete: Fitora can generate and revise catalogue-verified outfits, require a visible order review and explicit approval, and complete an unmistakably labelled mock hosted checkout through a sanitized, retry-safe terminal result.

Fitora is an AI shopping and styling agent for students and young professionals seeking gender-neutral smart-casual outfits. It turns an occasion, budget, sizes, colour preferences, and style into up to three complete catalogue-verified looks, supports controlled revisions, and currently completes an explicitly approved mock checkout while real Prava sandbox integration remains pending.

## Planned MVP

- English-only responsive experience.
- Exactly 30 fictional local products: 10 tops, 10 bottoms, and 10 pairs of shoes.
- Deterministic outfit filtering, scoring, diversity, and explanations.
- Controlled agent providers: Gemini, optional local Ollama, and a visibly labelled rules fallback.
- Payment providers: Prava Hosted Checkout and a visibly labelled mock flow.
- Server-authoritative price, size, stock, merchant, and order validation.
- No user accounts, scraping, external product database, or production card processing.

## Current integration status

- Catalogue: 30 validated fictional products (10 tops, 10 bottoms, and 10 pairs of shoes).
- Styling: deterministic rules engine returns up to three ranked, diverse, budget-safe outfits or structured recovery guidance.
- Experience: users can generate, select, and safely refine up to three catalogue-verified looks on mobile or desktop.
- Agent: strict Zod intents and semantic evidence checks constrain each message to one supported action. Provider output proposes an intent only; it cannot supply products, prices, stock, totals, approval, or payment results.
- AI: deterministic rules are the safe default. Gemini and local Ollama adapters support bounded structured output, timeouts, validation, and truthful rules fallback. Adapter and mocked integration tests pass; a genuine Gemini credential test has not started and is intentionally deferred.
- State: normal builder storage contains only validated preferences and product ID/size references. Terminal local history is separately schema-limited to five sanitized provider/status/order-reference/total/item-count/time summaries. Agent messages, email, signed tokens, session IDs, raw provider output, product presentation facts, and payment credentials are not persisted.
- Checkout: the browser submits only selected product IDs and sizes. The server rehydrates current catalogue facts and recomputes the order at review, session creation, and finalization. A complete three-item summary, validated email, explicit confirmation checkbox, and click are required before a hosted session is created.
- Checkout security: strict HMAC review, payment-session, and terminal-result claims use short-lived HTTP-only, SameSite=Lax cookies that are Secure in production. Session state is bound to the reviewed checkout, and invalid, expired, mismatched, changed, or tampered state fails closed.
- Payment: the typed provider architecture and full mock path are implemented. Mock mode uses a separate persistently labelled hosted page with approve/decline controls and no card fields. `PAYMENT_PROVIDER=prava` currently fails closed—configuration is invalid without its required secret, and the provider factory reports explicit `NOT_IMPLEMENTED` unavailability once selected; it never silently falls back to mock.
- Merchant: the server-only demo merchant revalidates the canonical order and provider-session context before producing a deterministic sanitized order reference or decline.
- Result: terminal finalization returns an existing valid signed result before repeating provider or merchant work, so ordinary retries and refreshes are idempotent within the cookie-only MVP boundary. No database-backed cross-browser or distributed replay guarantee is claimed.
- Prava: real Hosted Checkout, callback polling, merchant-result reporting to Prava, and live sandbox proof remain Phase 5. No Prava account, secret, allowed domain, card/OTP/Passkey action, or manual success has been claimed.

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

The Gemini adapter is covered with injected/mocked clients, but a real-credential manual test is still deferred. The interface reports both the configured provider and the provider that actually interpreted the request; configuration, timeout, availability, invalid-output, or semantic-evidence failures fall back to rules with an explicit reason.

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

Do not set `PAYMENT_PROVIDER=prava` for a working demo yet. The provider intentionally fails closed as not implemented until Phase 5 is completed from current official Prava documentation and the human prerequisites in [`docs/MANUAL_ACTIONS.md`](docs/MANUAL_ACTIONS.md) are satisfied.

Latest verified quality evidence: Vitest 4.1.10 passed 49 files/378 tests, the production build passed, and Playwright 1.61.1 passed 10/10 desktop/mobile cases including four mock checkout approval/decline runs. See [`docs/TEST_EVIDENCE.md`](docs/TEST_EVIDENCE.md) for the sanitized evidence record.

Quality gates:

```bash
npm run check
npm run test:e2e
```
