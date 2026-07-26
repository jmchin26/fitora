# Fitora

> Implementation in progress. The Phase 0 application baseline is healthy; catalogue, recommendation, agent, and checkout features are still being built.

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

- AI: rules fallback only until a genuine provider is configured and manually verified.
- Payment: mock mode only until the Prava sandbox flow is configured and proven end to end.
- Merchant: simulated Fitora demo merchant with simulated inventory.

See [`docs/STATUS.md`](docs/STATUS.md) for live delivery status and [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) for acceptance criteria.

## Local development

Requirements: Node.js 20.19 or newer and npm. Node.js 24 LTS is recommended.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Quality gates:

```bash
npm run check
npm run test:e2e
```
