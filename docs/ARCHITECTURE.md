# Fitora Technical Architecture

## 1. Architecture overview

```text
Browser
  ├─ Preference form
  ├─ Outfit cards
  ├─ Controlled agent chat
  └─ Checkout review
          │
          ▼
Next.js server routes
  ├─ Request validation (Zod)
  ├─ Catalogue lookup
  ├─ Outfit engine
  ├─ Agent orchestrator
  │    ├─ Gemini provider
  │    ├─ Ollama provider
  │    └─ Rules provider
  ├─ Checkout signer
  └─ Payment provider
       ├─ Prava Hosted Checkout
       └─ Explicit mock adapter
          │
          ▼
Demo Merchant Adapter
  └─ returns sanitized sandbox order outcome
```

The model is not the source of truth. The catalogue, filters, scoring, totals, inventory validation, and payment workflow are deterministic server-controlled code.

## 2. Recommended repository structure

```text
src/
  app/
    page.tsx
    build/page.tsx
    checkout/review/page.tsx
    checkout/callback/[attemptId]/route.ts
    checkout/callback/route.ts
    checkout/result/page.tsx
    api/
      outfits/generate/route.ts
      outfits/replace/route.ts
      agent/route.ts
      checkout/create-session/route.ts
      checkout/finalize/route.ts
      health/route.ts
  components/
    layout/
    preferences/
    outfits/
    agent/
    checkout/
    ui/
  data/
    products.json
  lib/
    catalogue/
      repository.ts
      schemas.ts
    styling/
      generate.ts
      rank.ts
      colour-compatibility.ts
      explain.ts
      validate.ts
    agent/
      orchestrator.ts
      intent-schema.ts
      providers/
        types.ts
        gemini.ts
        ollama.ts
        rules.ts
    checkout/
      attempt-id.ts
      token.ts
      cookies.ts
      order.ts
      workflow.ts
      prava-browser-lease.ts
      prava-creation-throttle.ts
      prava-session-creation.ts
    payments/
      types.ts
      factory.ts
      mock.ts
      prava.ts
    merchant/
      demo-merchant.ts
    security/
      redact.ts
    config/
      env.ts
  types/
  tests/
    fixtures/
    unit/
    integration/
e2e/
public/
  products/
  brand/
docs/
```

Exact paths may be adjusted if the resulting design is simpler, but domain boundaries must remain clear.

## 3. Domain models

### Product

```ts
type ProductCategory = 'top' | 'bottom' | 'shoes';
type Occasion = 'interview' | 'presentation' | 'casual_event';
type Style = 'minimal' | 'smart_casual' | 'relaxed';

type Product = {
  id: string;
  merchantId: 'fitora-demo';
  name: string;
  description: string;
  category: ProductCategory;
  priceCents: number;
  currency: 'USD';
  imagePath: string;
  colors: string[];
  sizes: string[];
  stockBySize: Record<string, number>;
  occasionTags: Occasion[];
  styleTags: Style[];
  active: boolean;
};
```

### UserPreferences

```ts
type UserPreferences = {
  occasion: Occasion;
  budgetCents: number;
  topSize: 'XS' | 'S' | 'M' | 'L' | 'XL';
  bottomSize: 'XS' | 'S' | 'M' | 'L' | 'XL';
  shoeSize: string; // supported EU sizes from catalogue
  preferredColors: string[];
  excludedColors: string[];
  style: Style;
};
```

### Outfit

```ts
type Outfit = {
  id: string;
  top: SelectedProduct;
  bottom: SelectedProduct;
  shoes: SelectedProduct;
  totalCents: number;
  score: number;
  scoreBreakdown: {
    occasion: number;
    style: number;
    colorCompatibility: number;
    preferredColors: number;
    budgetEfficiency: number;
  };
  reasonCodes: string[];
  explanation: string;
};
```

### AgentIntent

Use a discriminated union. Example intent names:

```text
GENERATE_OUTFITS
REPLACE_ITEM
MAKE_CHEAPER
CHANGE_STYLE
CHANGE_BUDGET
PREFER_COLOR
EXCLUDE_COLOR
SELECT_OUTFIT
REQUEST_CHECKOUT
HELP
UNSUPPORTED
```

Only validated intent objects may reach domain tools.

## 4. Outfit algorithm

### Hard constraints

1. Retrieve only active products from the configured merchant.
2. Filter by category.
3. Validate requested size and positive stock.
4. Remove excluded colours.
5. Produce combinations containing one product from each category.
6. Reject combinations above budget.

### Scoring

Score each eligible outfit from 0 to 100:

- occasion match: 30 points;
- style match: 25 points;
- colour compatibility: 20 points;
- preferred-colour coverage: 15 points;
- budget efficiency: 10 points.

Use an explicit colour compatibility matrix and deterministic calculations. Record breakdown values for UI explanation and tests.

### Diversity

Select the highest-ranked outfit first. For later results, apply a reuse penalty so the three displayed outfits are meaningfully different when alternatives exist.

### Low-budget handling

When no full outfit fits, return a structured result containing:

- minimum achievable total;
- categories causing the constraint;
- one or two actionable options, such as raising budget or changing preferences.

Do not fabricate an outfit over budget.

## 5. Agent architecture

### Controlled orchestration

The preferred design is not an unrestricted autonomous loop. Use this sequence:

1. Receive user text plus current verified state.
2. Ask the selected provider to produce a strict `AgentIntent`.
3. Validate the intent with Zod.
4. Execute one deterministic domain tool.
5. Validate the result.
6. Generate a short explanation using the provider or deterministic template.
7. Return sanitized UI events and updated state.

### Provider interface

```ts
interface AgentProvider {
  readonly name: 'gemini' | 'ollama' | 'rules';
  interpret(input: AgentInterpretInput): Promise<AgentIntent>;
  explain(input: AgentExplanationInput): Promise<string>;
}
```

### Gemini provider

- Server-side only.
- Use the official Google Gen AI SDK.
- Use a currently available free-tier Flash model selected through `GEMINI_MODEL`.
- Use structured output or function calling to obtain the `AgentIntent` schema.
- Apply a short timeout and one bounded retry.
- On API, quota, schema, or timeout failure, fall back to the rules provider and expose the fallback in a non-intrusive status indicator.

### Ollama provider

- Optional local-only provider.
- Base URL and model come from environment variables.
- Require a model that supports tool calling or reliable structured output.
- Do not automatically install large local models without human approval.
- Document that normal Vercel deployment cannot reach a laptop-local Ollama server.

### Rules provider

Implement deterministic parsing for the supported command set. It is a genuine fallback for resilience and automated tests, not the final AI claim.

## 6. UI architecture

### Landing page

- Fitora wordmark.
- Tagline: “Style that fits the moment.”
- One-sentence value proposition.
- Primary action: “Build my outfit”.
- Three-step overview: Tell us the moment → Review complete looks → Approve and pay.

### Build experience

Desktop: preference panel and results area. Mobile: sequential layout.

The agent panel becomes available after the first results are generated. Keep the panel constrained with suggested commands so the demo is predictable.

### Outfit card

- editorial 4:5 imagery;
- three item rows;
- total;
- budget remaining;
- size availability;
- score explanation;
- select action.

### Checkout review

- selected products and sizes;
- single merchant;
- subtotal / total;
- clear sandbox label where applicable;
- email field;
- explicit “Continue to Prava” action.

### Result states

- pending;
- approved;
- declined;
- expired;
- reconciliation required;
- mock success.

## 7. State and persistence without a database

### Browser state

Use browser storage only for non-sensitive convenience state:

- preferences;
- current selected outfit IDs;
- sanitized order history.

### Hosted checkout bridge

When creating a payment session:

1. Server rehydrates product IDs and recomputes the order.
2. The rendered approval form receives a fresh lowercase RFC UUID attempt ID, distinct from the signed review JTI.
3. A 20-minute browser lease serializes cooperative tabs. A one-hour HTTP-only random browser-scope UUID lets the create route atomically union valid active cookie IDs with outstanding reservations across reviews in the same process. Invalid, expired, orphaned, and terminal sets are pruned; an aggregate fourth attempt is rejected before provider side effects.
4. Server creates the Prava session with a 10-second provider timeout. The browser waits 15 seconds; an ambiguous timeout or network result locks the form attempt while a same-process tombstone prevents an automatic duplicate.
5. Server issues attempt-scoped HTTP-only SameSite=Lax cookies. The signed payment-session token contains the attempt ID, reviewed-checkout JTI, provider session reference, and canonical order snapshot; cookie lifetime cannot outlive the provider session.
6. Browser redirects to the exact Prava sandbox hosted origin.
7. Prava returns to `/checkout/callback/<lowercase-RFC-attempt-UUID>`. The bare callback fails closed; the path selects a cookie set but is authoritative only when it matches the signed session claim. Query values are ignored.
8. Server polls Prava and checks provider context against the signed canonical snapshot before merchant execution.
9. On a terminal outcome, server stores only a sanitized signed result cookie and clears that attempt's transient cookies.

This is sufficient for a hackathon MVP but is not a substitute for durable idempotency or distributed rate-limit storage. Browser-scoped aggregate reservations, per-review throttling, and the production client throttle (20 distinct attempts per 10 minutes) are process-local. A deployment WAF on `POST /api/checkout/create-session` is authoritative across Vercel instances; start with 20 requests per 10 minutes per source IP and tune downward only after observing legitimate demo traffic.

## 8. Payment provider interface

```ts
interface PaymentProvider {
  readonly name: 'prava' | 'mock';
  createSession(input: VerifiedOrderInput): Promise<HostedSession>;
  finalize(input: FinalizeInput): Promise<SanitizedPaymentResult>;
}
```

### Prava hosted path

1. POST a session to sandbox with:
   - `integration_type: "full_checkout"`;
   - user ID and email;
   - exact server-computed amount;
   - USD;
   - attempt-scoped Fitora callback URL `/checkout/callback/<lowercase-RFC-attempt-UUID>`;
   - one `purchase_context` for the demo merchant;
   - verified product details.
2. Redirect to returned hosted URL.
3. On the signed, attempt-scoped callback, ignore all query values and poll session payment result with bounded backoff.
4. If still pending, return a retryable pending state.
5. If credentials are ready, compare their merchant, amount, and product context with the signed canonical order snapshot. Catalogue drift or one uniquely attributable canonical mismatch skips merchant execution and is safely reported `DECLINED`; ambiguous multi-transaction or multi-line context enters reconciliation without guessing a transaction reference.
6. Only when context is canonical, pass credentials directly in memory to `DemoMerchantAdapter.checkout`.
7. Do not stringify or log the credential object.
8. Report `APPROVED` or `DECLINED` to Prava when one transaction is safely attributable.
9. Re-query or verify the final status and return only sanitized fields.

### Demo merchant adapter

This adapter simulates the merchant-side order acceptance needed to close the Prava sandbox loop. It must:

- accept a verified order plus transient credential object;
- verify merchant and amount context;
- never log or persist the credential object;
- return a synthetic order reference and approved/declined outcome;
- support deterministic forced-decline testing through server-only test configuration;
- be clearly described as a sandbox demo merchant, not a live retailer or acquirer.

### Mock provider

- Use a local Fitora-hosted mock page resembling an external redirect.
- Display “Mock payment mode — Prava credentials are not configured.”
- Exercise the same callback and result UI state machine without generating fake Prava evidence.

## 9. Environment variables

Validate environment variables in `src/lib/config/env.ts`. Required variables depend on selected providers.

- `AI_PROVIDER=rules|gemini|ollama`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `PAYMENT_PROVIDER=mock|prava`
- `PRAVA_SECRET_KEY`
- `PRAVA_BASE_URL`
- `PRAVA_HOSTED_CHECKOUT_ORIGIN`
- `NEXT_PUBLIC_APP_URL`
- `DEMO_MERCHANT_NAME`
- `DEMO_MERCHANT_URL`
- `DEMO_MERCHANT_COUNTRY_CODE`
- `CHECKOUT_SIGNING_SECRET`
- `DEMO_MERCHANT_FORCE_DECLINE`

The application boots in safe local defaults using `rules` and `mock`. Application-level Prava configuration accepts only `https://sandbox.api.prava.space`, `https://sandbox.collect.prava.space`, and an `sk_test_*` key, together with HTTPS Fitora and merchant origins. Production constants in the isolated low-level Prava client are inactive capability scaffolding; application configuration rejects production Prava origins and `sk_live_*` keys.

## 10. Logging and observability

Log structured, sanitized events only:

- request ID;
- route;
- provider name;
- operation;
- duration;
- high-level status;
- Prava response ID if supplied and safe;
- session ID only when needed for troubleshooting.

Never log request bodies containing email unless redacted. Never log authorization headers, session tokens, checkout signed tokens, or one-time card credentials.

## 11. Error model

Use stable application error codes, for example:

- `CATALOG_INVALID`
- `NO_ELIGIBLE_PRODUCTS`
- `NO_OUTFIT_WITHIN_BUDGET`
- `AGENT_PROVIDER_UNAVAILABLE`
- `AGENT_INTENT_INVALID`
- `CHECKOUT_STATE_INVALID`
- `PRAVA_NOT_CONFIGURED`
- `PRAVA_SESSION_FAILED`
- `PRAVA_PENDING`
- `PRAVA_SESSION_EXPIRED`
- `MERCHANT_DECLINED`
- `REPORT_STATUS_FAILED`

Return safe user messages and keep technical details server-side.
