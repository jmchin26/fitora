# Fitora Test Evidence

All evidence in this document must remain sanitized. Never record secret keys, authorization headers, signed checkout tokens, card data, one-time credentials, dynamic CVV, expiry, or unredacted personal data.

## Phase 0 — Workspace baseline

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Execution pack preserved | Pass | Root contains `AGENTS.md`, `00_START_HERE.md`, `CODEX_MASTER_PROMPT.txt`, `.env.example`, and the four authoritative documents under `docs/` |
| Duplicate prompt files | Pass | The two separately supplied files are byte-for-byte identical to their archive counterparts by SHA-256 comparison |
| Archive path safety | Pass | No duplicate or path-traversal entry names detected |
| Git repository | Pass | Empty local repository detected and branch renamed to `main` |
| Port availability | Pass | No listener detected on port 3000 during the baseline audit |
| Browser baseline | Pass | Local Edge and Chrome installations detected; Playwright project dependency is pending |
| Prava skill installation | Not installed | Global external-code installation was rejected by the security review; official documentation will be used instead |

## Phase 0 quality gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint completed with no findings |
| `npm run typecheck` | Pass | TypeScript strict no-emit check completed |
| `npm test` | Pass | Vitest 4.1.10: 1 file and 1 test passed |
| `npm run build` | Pass | Next.js 16.2.12 production build compiled and prerendered `/` and `/build` |
| Local HTTP smoke | Pass | `GET http://127.0.0.1:3000/` returned 200 and contained Fitora plus the mock-mode disclosure |
| In-app browser smoke | Pass | Document title, Fitora heading, “Build my outfit” link, and “Mock payment mode” text detected |

Phase 0 exit criteria are satisfied: the app serves locally, all required scripts exist, the initial unit-test baseline passes, the production build is clean, and a Git baseline exists.

## Phase 1 — Catalogue and deterministic styling

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Catalogue contract | Pass | Exactly 30 unique, schema-valid products: 10 tops, 10 bottoms, and 10 shoes; prices are integer cents and referenced image paths are local |
| Repository immutability | Pass | The trusted catalogue and nested product values are recursively frozen |
| Deterministic generation | Pass | Stable input produces the same ranking and explicit product-ID tie-breaking |
| Commerce validation | Pass | Size, stock, category, budget, duplicate-product, and total checks are server-controlled |
| Canonical rehydration | Pass | Forged client price and stock fields are ignored; unknown IDs and category swaps are rejected |
| Recommendation quality | Pass | Three complete, distinct outfits are returned for the standard fixture, with score breakdowns and truthful explanation codes |
| Edge cases | Pass | Zero budget, impossible budget, no preferred colours, exclusions, scarce candidate reuse, and malformed requests are covered |
| Route contracts | Pass | Health and outfit-generation route handlers return validated success and structured error payloads |

## Phase 1 quality gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint completed with no findings |
| `npm run typecheck` | Pass | TypeScript strict no-emit check completed |
| `npm test` | Pass | Vitest 4.1.10: 8 files and 40 tests passed |
| `npm run build` | Pass | Next.js 16.2.12 production build compiled all static pages and dynamic API routes |
| `git diff --check` | Pass | No whitespace errors detected before the milestone commit |

Phase 1 exit criteria are satisfied: catalogue facts are typed and immutable, recommendations are deterministic and budget-safe, untrusted selections are canonically rehydrated, route contracts are tested, and the complete quality gate passes.

## Phase 2 — Editorial preference and outfit experience

Date: 2026-07-26 (Asia/Kuala_Lumpur)

| Check | Result | Evidence |
| --- | --- | --- |
| Landing journey | Pass | Exact Fitora tagline, primary build action, three required journey steps, fixed-local-catalogue wording, and active provider disclosures are rendered |
| Preference validation | Pass | Occasion, USD budget, separate top/bottom sizes, EU shoe size, style, preferred colours, and excluded colours have labelled controls and precise recovery errors |
| Result contract | Pass | Client validates one to three unique `OutfitSchema` results and rejects duplicate IDs/combinations, malformed totals, malformed payloads, and non-contract errors |
| Outfit presentation | Pass | Each card shows three meaningful local images, product names, requested sizes, stock, prices, verified total, budget remaining, explanation, and score breakdown |
| Selection state | Pass | A native radio group keeps one selection; stale requests/results cannot overwrite current preferences or remain selectable |
| Safe persistence | Pass | Only validated preferences and product IDs/sizes are stored; corrupt/unavailable storage degrades to a truthful session-only state under React Strict Mode |
| Provider truthfulness | Pass | Rules/Gemini/Ollama and Mock/Prava labels resolve from validated server configuration; invalid values are explicitly labelled |
| Product assets | Pass | Exactly 30 4:5 project-authored SVG placeholders exist, all catalogue paths and manifest entries match, and automated checks reject scripts/external/data URLs |
| Responsive keyboard journey | Pass | Playwright verifies landing-to-results-to-selection, low-budget recovery, real skip-link focus, keyboard selection, and no horizontal overflow at 375 px |
| Browser errors | Pass | No page exceptions or unexpected console errors; the known 422 network message for an intentionally impossible budget is explicitly distinguished |

## Phase 2 quality gates

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint completed with no findings |
| `npm run typecheck` | Pass | TypeScript strict no-emit check completed |
| `npm test` | Pass | Vitest 4.1.10: 14 files and 88 tests passed |
| `npm run build` | Pass | Next.js 16.2.12 production build compiled all pages and dynamic routes |
| `npm run test:e2e` | Pass | Playwright 1.61.1: 4 desktop/mobile cases passed; direct runner cleaned up its Windows server process |
| In-app browser structure | Pass | Landing and build pages expose the expected semantic headings, labels, provider modes, simulated-inventory disclosures, and navigation |
| `git diff --check` | Pass | No whitespace errors detected before the milestone commit |

Phase 2 exit criteria are satisfied: the journey works at mobile and desktop widths, keyboard and form validation paths pass, no unexpected browser errors remain, persistence is non-sensitive and failure-safe, and all quality gates are green.
