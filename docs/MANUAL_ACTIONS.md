# Fitora Manual Actions

This document records only actions that require a human because they involve authentication, secret entry, payment approval, an allowed-domain change, a potentially chargeable action, production deployment, or final submission.

## Current actions

The Phase 5 code and mocked tests are complete. Real sandbox acceptance and public deployment still require the human-gated steps below. Nothing in these actions is complete or claimed.

1. Complete the Prava sandbox live gate.

   - Sign in or create the sandbox account at the official [Prava Developer Dashboard](https://dashboard.prava.space). The official [quickstart](https://docs.prava.space/quickstart) describes sandbox key creation and allowed domains; the implemented REST lifecycle follows [create session](https://docs.prava.space/api-reference/create-session), [hosted integration modes](https://docs.prava.space/sdk/integration-modes), [get payment result](https://docs.prava.space/api-reference/get-payment-result), and [report status](https://docs.prava.space/api-reference/report-status).
   - Create a sandbox `sk_test_*` secret key in the dashboard. Put it only in the uncommitted `.env.local` variable `PRAVA_SECRET_KEY`. The Fitora application intentionally rejects `sk_live_*`; production constants in the isolated low-level client are not an activated application capability. Also generate a private random value of at least 32 characters for `CHECKOUT_SIGNING_SECRET`. No key or signing-secret value belongs in chat, source, Git, documentation, screenshots, or any `NEXT_PUBLIC_*` variable.
   - Use these exact non-secret `.env.local` settings: `PAYMENT_PROVIDER=prava`, `PRAVA_BASE_URL=https://sandbox.api.prava.space`, `PRAVA_HOSTED_CHECKOUT_ORIGIN=https://sandbox.collect.prava.space`, `NEXT_PUBLIC_APP_URL=https://<exact-fitora-host>`, `DEMO_MERCHANT_URL=https://<exact-fitora-host>`, `DEMO_MERCHANT_NAME=Fitora Demo Merchant`, `DEMO_MERCHANT_COUNTRY_CODE=US`, and `DEMO_MERCHANT_FORCE_DECLINE=false`. Replace `<exact-fitora-host>` with the same publicly reachable HTTPS origin that serves this Fitora instance; do not use HTTP, `localhost`, a path, query, trailing callback path, or a different merchant origin.
   - In Prava Allowed Domains, enter only the exact HTTPS Fitora origin, for example `https://<exact-fitora-host>`: no path, query, trailing callback, wildcard, alternate host, or HTTP value. Each approved form generates a distinct callback such as `https://<exact-fitora-host>/checkout/callback/<lowercase-RFC-attempt-UUID>`. The bare `/checkout/callback` path deliberately fails closed. If the dashboard separately requires one fixed callback URL, pause and verify that dynamic per-session callback paths are supported; do not incorrectly register the bare callback as a fixed substitute.
   - After saving the local values, run `npm run check`, then start the configured instance with `npm run dev` behind the approved HTTPS origin. Verification before card entry is: `https://<exact-fitora-host>/api/health` returns `status: "ok"` with `providers.payment: "prava"`; the interface shows `Prava sandbox`; explicit review and approval redirects only to `https://sandbox.collect.prava.space` with one `session_token` query parameter.
   - Prava creation has a 10-second server timeout and a 15-second browser boundary. If the UI says the session status is uncertain, do not reload, retry, or start another checkout from any tab; preserve only the sanitized message and wait for the 20-minute attempt lease/tombstone window to expire before investigating.
   - At the provider-hosted card, OTP, biometric, or Passkey prompt, Codex must hand control to the human. Confirm the dashboard and hosted page are sandbox-only and cannot create a real charge before approving. After the browser returns through `/checkout/callback/<attempt-UUID>`, the expected result is a sanitized Fitora approved/declined/pending/reconciliation screen with no session token, one-time card token, dynamic CVV, expiry, secret key, or raw provider payload.
   - Once the human reports completion, Codex will inspect the callback/result behavior and server output without exposing credentials, verify that merchant execution and `APPROVED`/`DECLINED` reporting occurred exactly once as far as the cookie-only/in-process design can prove, record sanitized evidence, and fix any contract mismatch before claiming the live gate.

Until this action succeeds, Prava is accurately described as code-complete and mock-tested but live-unverified.

2. Configure deployment-level session-creation rate limiting before public Vercel deployment.

   - In the Vercel Firewall/WAF controls for the approved Fitora project, add a rule for `POST /api/checkout/create-session` before exposing the deployment publicly.
   - Recommended initial threshold: 20 requests per 10 minutes per source IP. This may be tightened after observing legitimate demo traffic, but it must not be removed merely because the application has local safeguards.
   - Fitora also applies a 20-minute cooperative browser lease and a one-hour HTTP-only random browser-scope UUID. Within one process it atomically combines that browser's active cookie IDs and outstanding reservations across reviews, caps the aggregate at three, prunes stale/terminal state, and separately limits production clients to 20 attempts per 10 minutes. Those controls are process/browser-local and are not authoritative across independent serverless instances; the deployment WAF is the cross-instance boundary.
   - After configuring the rule, verify normal review-to-checkout traffic succeeds and a synthetic excess burst receives a rate-limit response without invoking Prava. Do not use genuine payment credentials for this verification.

## Other deferred gates

- Gemini: provide a genuine server-only API key and approve a live-model manual test. The adapter and mocked tests pass, but the credential gate has not been completed.
- GitHub: install/authenticate GitHub CLI or provide another approved authenticated route before repository creation or push.
- Vercel: authenticate, enter server-only environment values, configure and verify the WAF rule above, approve final public deployment, and add only the exact deployed HTTPS origin to Prava Allowed Domains.
- Hackathon submission: approve the final public submission and any external publication.
