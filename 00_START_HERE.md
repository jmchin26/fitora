# Fitora — Codex Execution Pack

This pack is the authoritative build brief for the Fitora hackathon project.

## Confirmed decisions

- Product: **Fitora**, an AI shopping and styling agent.
- Target user: students and young professionals seeking gender-neutral smart-casual outfits.
- User experience: structured preference form plus an agent conversation panel.
- Language: English only.
- Catalogue: exactly 30 demo products — 10 tops, 10 bottoms, 10 pairs of shoes.
- Occasions: interview, presentation, casual event.
- Styles: minimal, smart casual, relaxed.
- Commerce scope: one sandbox merchant, USD, simulated inventory, no scraping.
- Payment: Prava **Hosted Checkout first**.
- Authentication/database: no user account and no external database in the MVP.
- Frontend style: editorial fashion — warm neutral background, dark typography, restrained accent colours, strong product imagery.
- Product images: use safe placeholders first; replace later with 30 locally stored, generated or clearly licensed images.
- Repository: create a new private GitHub repository named `fitora` when GitHub authentication is available.
- Development environment: local Codex desktop app.

## Important distinction: Codex versus Fitora runtime AI

The Codex desktop app can build the repository without placing an OpenAI API key in this project. Fitora itself still needs a runtime model provider for genuine natural-language agent behaviour.

The implementation must support three modes:

1. `gemini` — recommended public demo mode; server-side Gemini API.
2. `ollama` — optional keyless local model mode; not suitable for a normal Vercel deployment unless the model is separately hosted.
3. `rules` — deterministic development fallback; fully testable but must be visibly identified as a fallback and must not be presented as the final AI integration.

The codebase must use provider interfaces so switching providers does not require changing product or commerce logic.

## Payment truthfulness rule

Development may use a `mock` payment provider, but the project is not considered Prava-complete until all of the following have been proven in sandbox:

1. Fitora creates a real Prava hosted session.
2. The user completes the Prava card/passkey flow.
3. Fitora polls the real payment result.
4. One-time credentials are handled only on the server and are never logged or returned to the browser.
5. The demo merchant adapter returns a transaction outcome.
6. Fitora reports `APPROVED` or `DECLINED` to Prava.
7. The final Prava status is displayed in Fitora.

Until that gate passes, the UI and documentation must say that payment is running in mock mode.

## How to use this pack

1. Put these files in a new local folder named `fitora`.
2. Open that folder as a project in the Codex desktop app.
3. Paste the contents of `CODEX_MASTER_PROMPT.txt` into a new Codex thread.
4. Let Codex work through the plan. Routine engineering decisions are delegated to Codex.
5. When Codex reports a human checkpoint, complete only the required login, secret, Passkey, deployment, or submission action.

## Human accounts that can be added later

Codex must not wait for these at the beginning. It must build against adapters and continue with all unblocked work.

- GitHub account / `gh auth login`
- Gemini API key from Google AI Studio
- Prava developer account and sandbox `sk_test_*` key
- Prava allowed-domain configuration
- Vercel account / deployment authentication
- Human card-entry and Passkey approval during the Prava sandbox test

## Files in this pack

- `CODEX_MASTER_PROMPT.txt` — the prompt to paste into Codex.
- `AGENTS.md` — persistent repository instructions.
- `docs/PRODUCT_SPEC.md` — product requirements and acceptance criteria.
- `docs/ARCHITECTURE.md` — technical architecture and security model.
- `docs/EXECUTION_PLAN.md` — phased implementation and test plan.
- `docs/ASSET_PLAN.md` — product-image requirements.
- `.env.example` — configuration contract without secrets.
