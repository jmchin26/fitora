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
