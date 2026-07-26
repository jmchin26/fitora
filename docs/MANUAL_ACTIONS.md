# Fitora Manual Actions

This document records only actions that require a human because they involve authentication, secret entry, payment approval, an allowed-domain change, a potentially chargeable action, production deployment, or final submission.

## Current actions

No human action is blocking the next automatic code work. Phase 5 can begin by reading current official Prava documentation and implementing/test-driving the provider contract with sanitized fixtures.

The real Prava sandbox acceptance criterion is blocked at its live gate until a human completes every applicable prerequisite below. None is complete or claimed:

- Sign in to or create the intended Prava developer account.
- Create or select a Prava sandbox secret key.
- Enter `PRAVA_SECRET_KEY` into uncommitted local environment settings; never paste it into source, Git, documentation, screenshots, chat, or browser-exposed variables.
- Enter a strong `CHECKOUT_SIGNING_SECRET` of at least 32 characters into local and, later, Vercel server-only environment settings.
- Add the exact localhost/deployed callback or allowed domains in Prava if its current sandbox configuration requires them.
- Complete the Prava-hosted sandbox card, OTP, biometric, or Passkey step when prompted. Codex must stop before this action.
- Confirm that the action is sandbox-only and cannot create a real charge before authorizing it.

Real Prava session creation, redirect, callback polling, demo-merchant outcome reporting to Prava, terminal confirmation, and sanitized manual evidence have not been run.

## Other deferred gates

- Gemini: provide a genuine server-only API key and approve a live-model manual test. The adapter and mocked tests pass, but the credential gate has not been completed.
- GitHub: install/authenticate GitHub CLI or provide another approved authenticated route before repository creation or push.
- Vercel: authenticate, enter server-only environment values, approve final public deployment, and add the deployed callback domain where required.
- Hackathon submission: approve the final public submission and any external publication.
