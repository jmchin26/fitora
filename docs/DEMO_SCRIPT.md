# Fitora Demo Script

Target length: 2 minutes 40 seconds. Record the Rules fallback and Mock payment path unless every live-gate prerequisite in the conditional Prava section has been completed.

## Before recording

- Use a clean browser session at desktop width and clear Fitora local storage.
- Start the app with `AI_PROVIDER=rules` and `PAYMENT_PROVIDER=mock` in an uncommitted local environment file.
- Keep the provider badges visible when introducing the product and when entering checkout.
- Do not show environment files, terminal secrets, request headers, cookies, provider tokens, card data, or developer tools.
- Confirm the complete mock path once before recording. Keep a fresh browser tab ready as a recovery option.

## Core 2–3 minute script

### 0:00–0:15 — The problem

**On screen:** Fitora landing page.

**Say:** “Shopping for one event usually means finding three compatible items, checking every size, and tracking one budget. Fitora turns that work into one controlled journey from preferences to an approved checkout.”

Point briefly to the `Rules fallback` and `Mock payment mode` badges. Do not imply that this recording uses live Gemini or Prava.

### 0:15–0:40 — Set the brief

**On screen:** Select **Build my outfit**. Keep the default presentation brief: a $150 total budget, smart-casual style, top M, bottom M, and EU shoes 42. Show the colour controls, then select **Build outfit options**.

**Say:** “I give Fitora the occasion, total budget, exact sizes, colours, and style. This demo uses a fixed 30-product fictional catalogue, so every product and stock value is controlled and reproducible.”

### 0:40–1:05 — Show verified outfits

**On screen:** Show the three outfit cards. Briefly point to the top, bottom, shoes, requested sizes, prices, verified total, remaining budget, and explanation.

**Say:** “Fitora returns three complete looks. Deterministic tools—not a model—check active products, size stock, merchant, excluded colours, and the budget. Explanations can only use those verified facts.”

### 1:05–1:30 — Apply one controlled revision

**On screen:** In **Refine with Fitora**, choose **Replace the shoes with a cheaper option**. Show the changed shoes and lower total.

**Say:** “The agent proposes one constrained intent. The catalogue engine performs the change and recalculates the look. It cannot invent a product, alter a price, or start payment. The response also shows which provider interpreted the request.”

### 1:30–1:55 — Select and review

**On screen:** Select the first verified outfit, choose **Review selected outfit**, and show the three-item order summary and USD total.

**Say:** “At checkout, the browser sends only product IDs and sizes. The server reloads the catalogue, checks stock and merchant again, and recomputes the total. A payment session still does not exist at this point.”

### 1:55–2:25 — Explicit mock payment

**On screen:** Enter `demo@example.com`, check the explicit review confirmation, and select **Continue to payment**. On the separate mock hosted page, pause on the mock label and show that there are no card fields. Select **Approve mock payment**.

**Say:** “Payment requires the final summary, an email, this confirmation, and a visible click. The recorded path is an unmistakably labelled Fitora simulation—not Prava and not a real charge. It preserves the hosted-checkout shape without collecting card data.”

### 2:25–2:40 — Sanitized result

**On screen:** Show the successful mock result, provider, amount, item count, and sanitized order reference. Refresh once to show the same result without another finalization.

**Say:** “The result exposes only a sanitized summary. Signed, short-lived server state makes an ordinary refresh retry-safe. Live Prava and Gemini proof remain separate, explicit verification gates.”

## Conditional real Prava replacement segment

Use this section **instead of** the 1:55–2:40 mock segment only after all of the following are true:

- Fitora is deployed at the final HTTPS origin.
- The exact HTTPS Fitora origin is allowed by Prava, the merchant origin matches it, and the dashboard supports Fitora's per-session `/checkout/callback/<attempt-UUID>` path.
- A Prava sandbox secret and a strong checkout-signing secret are present only in server environment settings.
- The application visibly reports `Prava sandbox`, not an invalid or mock configuration.
- A presenter is available to enter sandbox card details and complete any OTP, biometric, or Passkey step.
- A prior end-to-end sandbox run has confirmed callback polling, one-time credential handling, demo-merchant processing, status reporting, and a sanitized terminal result.

**On screen:** From the verified order review, enter the demo email, check the explicit confirmation, and continue. Show the browser moving to the expected Prava Hosted Checkout origin. The presenter completes the sandbox payment privately, then show the return to Fitora and the sanitized result.

**Say:** “This session was created server-side only after explicit approval. Prava hosts the payment step. On return, Fitora checks the current provider state before any merchant retry, keeps one-time credentials server-only and transient, reports the demo merchant result as approved or declined, and renders only this sanitized status.”

If any prerequisite is missing or the sandbox path is unstable, record the mock segment. Label it verbally and visually; do not splice a mock result into a claimed Prava run.

## Presenter recovery notes

- If generation returns no outfit, restore the $150 default brief and rebuild.
- If a revision cannot be applied, choose the suggested cheaper-shoes command once on a newly generated set.
- If checkout state expires, return to `/build`, select an outfit, and create a fresh review. Do not edit cookies or fabricate a result.
- If Prava returns pending or reconciliation-required, show that truthful state and switch the final submitted demo to the labelled mock path until the live issue is resolved.
