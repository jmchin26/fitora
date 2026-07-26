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
