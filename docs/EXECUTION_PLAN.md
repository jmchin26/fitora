# Fitora Execution Plan for Codex

## Delivery strategy

The critical path is:

```text
typed catalogue
→ deterministic outfit engine
→ complete preference/results UI
→ controlled agent revisions
→ mock hosted checkout
→ real Prava hosted checkout
→ tests, deployment, demo evidence
```

Do not spend time on optional polish until the current critical-path exit criteria pass.

## Phase 0 — Workspace and evidence baseline

### Tasks

- Audit Node, npm, Git, GitHub CLI, browser tooling, and permissions.
- Preserve the execution pack.
- Bootstrap Next.js in the current folder.
- Initialize Git and create the baseline commit.
- Add `.gitignore`, `.editorconfig`, `.env.example`, and strict TypeScript configuration.
- Create status/evidence/decision/manual-action documents.
- Add initial README with truthful “planning / implementation in progress” status.
- Attempt official Prava skill installation.

### Exit criteria

- App starts locally.
- Lint, type-check, test placeholder, and build commands exist.
- Baseline commit exists.

### Commit

`chore: initialize fitora workspace`

## Phase 1 — Catalogue and deterministic styling engine

### Tasks

- Define Zod schemas and TypeScript types.
- Create exactly 30 fictional products with coherent tags, sizes, stock, and prices.
- Validate the JSON catalogue at import/startup.
- Implement server catalogue repository.
- Implement hard filtering.
- Implement colour compatibility matrix.
- Implement deterministic scoring and breakdown.
- Implement diversity selection for three outfits.
- Implement no-result diagnostics.
- Implement deterministic explanations.
- Add comprehensive unit tests, including low budget, excluded colour, missing size, zero stock, and tie/diversity behaviour.

### Standard demo fixture

Use a fixture similar to:

- occasion: presentation;
- budget: USD 150;
- top size: M;
- bottom size: M;
- shoe size: EU 42;
- preferred colours: navy, white, black;
- excluded colours: none;
- style: smart casual.

The catalogue must guarantee at least three valid, distinct outfits for this fixture.

### Exit criteria

- Standard fixture returns three valid outfits.
- Every total is server-computed and at or below budget.
- Unit tests pass.

### Commit

`feat: add typed product catalogue and styling engine`

## Phase 2 — Editorial preference and outfit experience

### Tasks

- Implement design tokens and responsive shell.
- Build landing page.
- Build validated preference form.
- Build loading and no-result states.
- Build outfit cards with placeholders and meaningful alt text.
- Build detail/reason breakdown.
- Support selection of one outfit.
- Persist only safe convenience state in localStorage.
- Add accessibility tests where practical.
- Add component/integration tests.

### Visual constraints

- Warm off-white page background.
- Dark editorial typography.
- Muted sage or taupe accent.
- Product imagery is primary; avoid neon AI aesthetics.
- Use restrained motion and respect reduced-motion settings.
- No gradients that reduce readability.

### Exit criteria

- User can move from landing page to three outfit results on mobile and desktop.
- No console errors.
- Keyboard and form validation work.

### Commit

`feat: build preference and outfit experience`

## Phase 3 — Controlled agent orchestration

### Tasks

- Define strict `AgentIntent` discriminated union.
- Implement rules provider first.
- Implement agent orchestrator and tool execution.
- Add suggested revision chips.
- Support at minimum:
  - cheaper shoes;
  - replace top/bottom/shoes;
  - change style;
  - change budget;
  - prefer/exclude colour.
- Implement Gemini provider behind environment configuration.
- Implement optional Ollama adapter without auto-installing a model.
- Fall back safely to rules on provider failure.
- Display provider mode.
- Add unit and API tests for supported and unsupported commands.

### Gemini integration rule

Use the current official Google Gen AI SDK and a free-tier-capable Flash model configured through environment variables. Keep calls server-side. Do not hard-code a preview model without validating current availability.

### Exit criteria

- All critical commands work in rules mode.
- Gemini adapter compiles and is covered by mocked integration tests.
- A genuine Gemini manual test is recorded when the key becomes available.
- The model cannot invent a product or bypass server validation.

### Commit

`feat: add controlled agent orchestration`

## Phase 4 — Checkout review and provider abstraction

### Tasks

- Build checkout review page.
- Rehydrate product IDs on the server and recompute total.
- Add email validation.
- Implement signed checkout token and secure cookies.
- Define payment provider interface.
- Implement mock hosted checkout and callback state machine.
- Implement sanitized result page and local sanitized order history.
- Add tests for tampering, expired token, price mismatch, invalid IDs, duplicate submission, pending, approved, and declined states.

### Exit criteria

- Full mock path passes Playwright:
  preference → outfits → revision → select → review → mock redirect → result.
- Mock mode is impossible to confuse with Prava mode.

### Commit

`feat: add checkout provider architecture`

## Phase 5 — Real Prava Hosted Checkout

This phase starts immediately if credentials are already configured; otherwise Codex creates an exact manual-action item and continues with later unblocked phases.

### Tasks

- Read current official Prava docs and verify request/response schemas.
- Create sandbox session on the server with `integration_type: "full_checkout"`.
- Use one merchant and exact server-computed product details.
- Set a callback URL on the Fitora domain.
- Redirect to the returned hosted URL.
- On callback, recover signed state from secure cookies.
- Poll payment result with bounded backoff.
- Handle pending, expired, malformed, declined, and awaiting-result states.
- Keep token/CVV/expiry in a narrow server-only scope.
- Invoke demo merchant adapter.
- Report outcome to Prava.
- Confirm final status.
- Add mocked API contract tests.
- Run one manual end-to-end sandbox payment with human card/Passkey action.
- Record screenshots or sanitized evidence without exposing payment credentials.

### Human prerequisites

1. Create Prava developer account.
2. Create sandbox key.
3. Put secret key into `.env.local` and later Vercel environment variables.
4. Add localhost and deployed domains where required.
5. Complete hosted card and Passkey flow.

### Exit criteria

- Real sandbox session and redirect work.
- Callback works on deployed domain.
- Status is reported and reaches terminal state.
- No sensitive values appear in browser network responses, logs, screenshots, or repository.
- `docs/TEST_EVIDENCE.md` contains session ID only if safe, timestamp, result state, and redacted proof.

### Commit

`feat: integrate prava hosted checkout`

## Phase 6 — Product image integration

### Tasks

- Create `public/products/manifest.json` matching all 30 product IDs.
- Initially use safe local placeholders.
- When supplied with generated/licensed images, validate dimensions, filenames, and mapping.
- Convert to optimized WebP or AVIF where appropriate.
- Add credits/license notes only when required.
- Ensure no visible real brand logos or misleading affiliation.

### Exit criteria

- Every product has a valid local image and fallback.
- No broken image paths.
- Images are optimized and visually consistent.

### Commit

`feat: add product image catalogue`

## Phase 7 — End-to-end hardening

### Unit tests

- catalogue schema;
- size/stock filtering;
- money arithmetic;
- colour compatibility;
- scoring and diversity;
- intent validation;
- rules parsing;
- server order rehydration;
- checkout signing and expiry;
- redaction.

### Integration tests

- outfit API success and failure;
- agent provider fallback;
- client-price tampering rejected;
- mock payment state machine;
- Prava request construction with mocked HTTP;
- pending/awaiting/completed/failed Prava responses;
- report-status success and failure;
- credential object never serialized.

### Playwright tests

1. Standard successful mock journey.
2. Agent replaces shoes with cheaper pair.
3. Budget too low produces corrective state.
4. Invalid form fields.
5. Mock decline.
6. Refresh result page without duplicate checkout.
7. Mobile viewport journey.

### Release checks

- `npm run check`
- `npm run test:e2e`
- secret scan of Git history and working tree;
- no console errors;
- no broken images;
- production-mode configuration warning is accurate;
- README matches actual state.

### Commit

`test: add end-to-end purchase coverage`

## Phase 8 — GitHub, deployment, and submission materials

### GitHub

- Check `gh auth status`.
- If authenticated, create private `fitora` repository and push `main`.
- If not authenticated, create exact manual steps and continue locally.
- Add GitHub Actions CI.

### Vercel

- Prepare deployment.
- Stop for login and final production deployment approval.
- Configure environment variables server-side.
- Set `NEXT_PUBLIC_APP_URL` and demo merchant URL to deployed domain.
- Add the deployed domain to Prava configuration as needed.
- Run smoke tests against deployed URL.

### README

Must include:

- product purpose;
- user journey;
- architecture diagram;
- technology stack;
- local setup;
- provider modes;
- Prava flow;
- catalogue and image sources;
- security decisions;
- known limitations;
- truthful current integration status;
- test commands;
- demo credentials only if they are non-secret and officially intended for sandbox use.

### Demo script

Target a 2–3 minute recording:

1. State the problem in one sentence.
2. Enter the standard presentation outfit request.
3. Show three complete outfits and verified budget/size state.
4. Ask: “Replace the shoes with a cheaper, more relaxed option.”
5. Show the updated verified total and explanation.
6. Select the outfit and review exact items.
7. Continue to Prava Hosted Checkout.
8. Complete the human approval.
9. Return to Fitora and show the terminal transaction result.
10. End on the architecture/status panel showing Gemini + Prava sandbox modes.

### Submission copy

Create `docs/SUBMISSION_COPY.md` containing:

- one-line pitch;
- problem;
- solution;
- what the agent does;
- how Prava is core to the flow;
- technical implementation;
- challenges;
- limitations;
- future work.

### Exit criteria

- Deployed URL works or deployment blocker is explicit.
- Repository pushed or GitHub blocker is explicit.
- README and submission copy are complete.
- Demo script reflects only working features.

### Commit

`docs: finalize demo and submission materials`

## Time-cut rules

If time becomes constrained, remove work in this order:

1. animation and decorative polish;
2. order history;
3. Ollama adapter;
4. advanced agent commands beyond the required set;
5. detailed score breakdown display;
6. multiple result-page variants.

Never remove:

- server-side validation;
- complete outfit generation;
- explicit purchase approval;
- mock/real mode labels;
- Prava real integration effort;
- secret handling;
- core end-to-end test;
- truthful README.

## Required status reporting

`docs/STATUS.md` must always contain:

- current phase;
- last successful commit;
- passing commands;
- failing commands;
- current provider modes;
- real Prava gate: not started / blocked / in progress / passed;
- Gemini gate: not started / blocked / in progress / passed;
- GitHub status;
- deployment status;
- next automatic action;
- human blockers with IDs from `docs/MANUAL_ACTIONS.md`.
