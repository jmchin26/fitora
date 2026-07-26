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
