# Fitora

> Implementation in progress. Phase 3 is complete: Fitora can interpret one bounded revision at a time, rehydrate every submitted product reference from the trusted catalogue, execute deterministic styling tools, verify the final state again, and prepare a non-transactional checkout review.

Fitora is an AI shopping and styling agent for students and young professionals seeking gender-neutral smart-casual outfits. It turns an occasion, budget, sizes, colour preferences, and style into three complete catalogue-verified looks, supports controlled revisions, and proceeds to an explicitly approved sandbox checkout.

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
- State: browser storage contains only validated preferences and product ID/size references, including the selected reference. Agent messages, provider output, product presentation facts, and payment data are not persisted.
- Checkout: the Phase 3 checkout intent only produces a review-ready event after a visible outfit is selected. It does not create a payment session or navigate to payment.
- Payment: mock mode remains the safe default until the Phase 4 provider architecture and later Prava sandbox flow are implemented and proven end to end.
- Merchant: simulated Fitora demo merchant with simulated inventory.

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

Quality gates:

```bash
npm run check
npm run test:e2e
```
