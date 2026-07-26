# AGENTS.md — Fitora Repository Rules

## Mission

Build a reliable hackathon MVP named **Fitora**: an AI shopping and styling agent that converts a user's occasion, budget, sizes, preferred colours, and style into complete purchasable outfits, allows controlled revisions, obtains explicit approval, and completes a sandbox payment using Prava Hosted Checkout.

## Product boundary

Fitora is not a general fashion marketplace. The MVP supports:

- one gender-neutral catalogue;
- one demo merchant;
- USD only;
- three categories: top, bottom, shoes;
- three occasions: interview, presentation, casual event;
- three styles: minimal, smart casual, relaxed;
- exactly 30 products;
- English only;
- no registration, social features, virtual try-on, real inventory feed, scraping, or multi-merchant checkout.

## Engineering principles

1. Correctness before visual novelty.
2. Complete transaction path before extra features.
3. Pure domain functions before framework-specific code.
4. Server is authoritative for catalogue, price, size, stock, merchant, and total.
5. Model output is untrusted input and must be schema-validated.
6. Payment credentials are ultra-sensitive and must remain transient, server-only, and unlogged.
7. Mock modes must be obvious and cannot masquerade as production integrations.
8. Keep the implementation small enough to understand and demo under pressure.

## Preferred stack

- Current stable Next.js App Router
- TypeScript in strict mode
- Tailwind CSS
- Zod
- Vitest and Testing Library
- Playwright for end-to-end tests
- Official Google Gen AI SDK for Gemini
- Direct Prava REST calls for Hosted Checkout
- npm unless the existing environment strongly favours another package manager

Do not add a database, authentication framework, global state library, component mega-library, vector database, multi-agent framework, or scraping stack unless an acceptance criterion cannot be met without it.

## Required scripts

The final `package.json` must expose at least:

- `dev`
- `build`
- `start`
- `lint`
- `typecheck`
- `test`
- `test:watch`
- `test:e2e`
- `check` — lint + typecheck + unit tests + build

## Quality gates

Before each milestone commit:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build` for milestone and release commits
5. relevant Playwright tests after the UI path exists

Do not suppress failures with broad lint disables, `any`, skipped tests, empty catches, arbitrary timeouts, or hard-coded success responses.

## Git rules

- Work on `main` locally unless Codex deliberately uses isolated worktrees.
- Make small milestone commits.
- Never commit `.env*` files containing secrets, generated build output, browser profiles, test card data, or payment credentials.
- Never rewrite published history or force-push.
- Recommended commit sequence:
  - `chore: initialize fitora workspace`
  - `feat: add typed product catalogue and styling engine`
  - `feat: build preference and outfit experience`
  - `feat: add controlled agent orchestration`
  - `feat: add checkout provider architecture`
  - `feat: integrate prava hosted checkout`
  - `test: add end-to-end purchase coverage`
  - `docs: finalize demo and submission materials`

## Security requirements

- Secrets are server-only environment variables.
- Validate every API request with Zod.
- Rehydrate product records from server catalogue using IDs; ignore client-supplied names, prices, stock, and merchant data.
- Store money as integer cents internally and format at the display edge.
- Sign checkout state with HMAC using `CHECKOUT_SIGNING_SECRET`.
- Use HTTP-only, Secure-in-production, SameSite=Lax, short-lived cookies for hosted-checkout state.
- Redact authorization headers, secret keys, session tokens, one-time card token, dynamic CVV, and expiry from logs and errors.
- Never send Prava one-time credentials to a client component.
- Report every real Prava checkout result as `APPROVED` or `DECLINED`.
- Make finalize logic retry-safe as far as possible without an external database. Check current Prava state before attempting merchant checkout again.

## AI rules

- The model may parse natural language into a constrained `AgentIntent` schema.
- The model may create concise explanations from verified outfit facts.
- The model may not directly call the payment endpoint, approve a transaction, or choose an unverified product.
- Payment requires a visible user click after a complete order summary.
- On AI failure, use deterministic parsing and explanation templates.
- Show a developer-visible mode badge: `Gemini`, `Local Ollama`, or `Rules fallback`.

## Payment rules

- Start with `PAYMENT_PROVIDER=mock` so development is not blocked by credentials.
- Mock mode must show a persistent “Mock payment mode” banner and must use a separate mock hosted page.
- Real mode uses `PAYMENT_PROVIDER=prava` and Prava sandbox.
- Hosted session must be created only when the user is ready to pay because sessions are short-lived.
- Use `integration_type: "full_checkout"` and a callback URL controlled by Fitora.
- After the callback, poll payment result, call the server-only demo merchant adapter, report status, and render a sanitized result.

## Stop conditions

Codex may stop and request human action only for:

- GitHub, Google, Prava, or Vercel authentication;
- entering a secret into local/Vercel environment settings;
- adding an allowed domain in Prava;
- card entry, OTP, biometric, or Passkey approval;
- actions that may create real charges;
- destructive external deletion;
- final public deployment or hackathon submission.

Everything else is an engineering decision Codex should make and document.
