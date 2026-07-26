import { expect, test, type Page } from "@playwright/test";

test.use({ baseURL: "http://localhost:3000" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  return errors;
}

async function reachMockCheckout(page: Page, refine = false) {
  await page.goto("/build");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Build outfit options" }).click();
  await expect(
    page.getByText("Three verified outfits are ready. Choose one look."),
  ).toBeVisible();

  if (refine) {
    const agent = page.getByRole("region", { name: "Refine with Fitora" });
    await agent
      .getByRole("button", { name: "Replace the shoes with a cheaper option" })
      .click();
    await expect(agent.getByRole("status")).toContainText(
      "I replaced the shoes with",
    );
  }

  await page
    .getByRole("group", { name: "Choose one verified outfit" })
    .getByRole("radio", { name: /Select verified outfit/ })
    .first()
    .check();
  await page
    .getByRole("button", { name: "Review selected outfit" })
    .click();

  await expect(page).toHaveURL(/\/checkout\/review$/);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Review your verified order" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Verified order items" })
      .getByRole("listitem"),
  ).toHaveCount(3);
  await expect(
    page.getByText(
      "Mock payment mode — the next page is a Fitora-hosted simulation, not Prava.",
    ),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Email address" }).fill(
    "demo@example.com",
  );
  await page
    .getByRole("checkbox", { name: /I reviewed the three products/ })
    .check();
  await page.getByRole("button", { name: "Continue to payment" }).click();

  await expect(page).toHaveURL(/\/checkout\/mock$/);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Simulate the hosted payment" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Mock payment mode — Prava credentials are not configured.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
}

test("completes the revised outfit journey through explicit mock approval", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  let finalizeRequests = 0;

  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/checkout/finalize") {
      finalizeRequests += 1;
    }
  });

  await reachMockCheckout(page, true);
  await page.getByRole("button", { name: "Approve mock payment" }).click();

  await expect(page).toHaveURL(/\/checkout\/result$/);
  await expect(
    page.getByRole("heading", { name: "The checkout simulation worked." }),
  ).toBeVisible();
  await expect(page.getByText(/Mock payment result/)).toBeVisible();
  const orderReference = await page
    .getByText("Order reference")
    .locator("..")
    .locator("dd")
    .innerText();
  expect(orderReference).toMatch(/^FITORA-[A-F0-9]{16}$/);
  expect(finalizeRequests).toBe(1);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The checkout simulation worked." }),
  ).toBeVisible();
  await expect(page.getByText(orderReference)).toBeVisible();
  expect(finalizeRequests).toBe(1);

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("fitora:sanitized-order-history:v1"),
      ),
    )
    .not.toBeNull();
  const storedHistory = await page.evaluate(() =>
    window.localStorage.getItem("fitora:sanitized-order-history:v1"),
  );
  expect(storedHistory).toContain(orderReference);
  expect(storedHistory).not.toMatch(
    /demo@example\.com|session|token|card|cvv|expiry/i,
  );
  expect(consoleErrors).toEqual([]);
});

test("renders a truthful declined mock result without an order reference", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);

  await reachMockCheckout(page);
  await page.getByRole("button", { name: "Decline mock payment" }).click();

  await expect(page).toHaveURL(/\/checkout\/result$/);
  await expect(
    page.getByRole("heading", { name: "The order was not placed." }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Sanitized payment summary")
      .getByText("Payment declined", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Order reference")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Start a fresh checkout" }),
  ).toHaveAttribute("href", "/build");
  expect(consoleErrors).toEqual([]);
});
