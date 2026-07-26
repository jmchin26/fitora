# Fitora — Submission Copy

## Project name

Fitora

## Tagline

Style that fits the moment.

## One-line pitch

Fitora turns an occasion, budget, sizes, colour preferences, and style into complete catalogue-verified outfits, supports controlled revisions, and requires a clear final approval before checkout.

## Short description

Fitora is an English-language shopping and styling agent for students and young professionals who need a coordinated gender-neutral outfit without searching item by item. It builds up to three complete looks—top, bottom, and shoes—from a fixed 30-product demo catalogue, verifies size availability and stock, keeps every total within budget, and explains each recommendation using checked catalogue facts.

Users can request one constrained change at a time, such as cheaper shoes, a more relaxed style, or avoiding a colour. Before checkout, the server reloads the selected products and recomputes the USD total. Payment requires a visible order review, an email address, a confirmation checkbox, and a separate click.

The complete local demo uses a clearly labelled mock hosted-payment page. Prava Hosted Checkout code and mocked contract coverage are complete, but live Prava sandbox payment, deployed callback, and hosted-domain proof still require external credentials and human verification. Gemini is implemented behind a constrained provider boundary and tested with mocked clients only; the verified demo defaults to the deterministic Rules fallback.

## Inspiration

Shopping for one event often means repeating the same work across several product pages: finding compatible items, checking sizes, tracking the total, and deciding whether the combination is appropriate. Many recommendation assistants stop at suggestions or links. Fitora explores a smaller but complete path from a specific need to a reviewed transaction, while keeping product facts and payment authority outside the model.

## What it does

- Collects an occasion, total budget, top and bottom sizes, EU shoe size, preferred and excluded colours, and style.
- Produces up to three complete, distinct outfits from exactly 30 fictional products across tops, bottoms, and shoes.
- Verifies active status, requested size, simulated stock, merchant, excluded colours, and budget before presenting an outfit.
- Supports controlled natural-language revisions without allowing a model to invent products, prices, stock, or payment state.
- Rehydrates every checkout item from the server catalogue and recomputes the total before creating a payment session.
- Requires explicit review and approval, then completes a separate, unmistakably labelled mock hosted-checkout flow.
- Returns only a sanitized result and keeps payment credentials, provider tokens, and authorization data out of client storage and responses.

## How it was built

Fitora uses Next.js App Router, strict TypeScript, React, Tailwind CSS, and Zod. Pure catalogue, filtering, ranking, intent, checkout, and payment-domain functions sit behind small server routes. The AI boundary uses the official Google Gen AI SDK for Gemini and a deterministic Rules fallback. The payment boundary supports the completed mock provider and direct Prava REST contracts for session creation, callback reconciliation, result polling, transient demo-merchant processing, and status reporting.

Vitest and Testing Library cover domain and component behaviour. Playwright covers the responsive build, revision, explicit approval, mock approval and decline, sanitized result, and retry-safe refresh paths.

## Challenges

- Keeping recommendations useful while treating every model response as untrusted input.
- Making the server authoritative when the browser must still display and carry a selected outfit between screens.
- Designing a useful hosted-checkout simulation that cannot be mistaken for a real provider integration.
- Handling one-time payment credentials transiently and making callback retries fail safely without adding a database to the MVP.

## Accomplishments

- A complete local journey from preferences to a sanitized mock order result.
- Deterministic outfit scoring and grounded explanations over a tightly validated catalogue.
- Controlled revisions that cannot authorize payment or introduce unverified products.
- Signed, short-lived, HTTP-only checkout state and server-side order revalidation at payment boundaries.
- Prava REST integration code with mocked contract tests, while keeping live-proof claims explicitly gated.

## What we learned

Agentic commerce works best when language understanding proposes a narrow intent and deterministic tools own the facts and side effects. Clear mode labels and explicit approval are part of correctness, not just interface copy. Payment integration also needs an evidence ladder: mocked contracts prove local behaviour, but only a deployed HTTPS callback and a completed sandbox transaction prove the live provider path.

## What is next

1. Configure a Prava sandbox account, HTTPS Fitora callback, allowed domain, and server-only keys.
2. Complete a human-approved sandbox checkout and record sanitized evidence for session creation, callback polling, merchant status reporting, and the terminal result.
3. Run Gemini with an approved server-only key and record a genuine provider response without exposing prompts or credentials.
4. Deploy the verified build and add the public demo and source links to the final submission.

## Current verification status

| Area | Status |
| --- | --- |
| Local catalogue, styling, revision, review, and mock checkout | Complete and automated-test covered |
| Prava REST implementation and mocked contracts | Complete |
| Live Prava sandbox payment and deployed callback | Not yet verified; external setup and human payment approval required |
| Gemini adapter with mocked client | Complete |
| Genuine Gemini API run | Not yet verified |
| Public deployment | Not yet completed or claimed |

## Links

- Source repository: add after the repository is published.
- Live demo: add only after deployment and the intended demo mode are verified.
- Demo video: add after recording.
