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

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  return errors;
}

function unexpectedConsoleErrors(errors: readonly string[]): string[] {
  return errors.filter(
    (message) =>
      !/Failed to load resource: the server responded with a status of 422/.test(
        message,
      ),
  );
}

async function verifiedTotalCents(
  card: ReturnType<Page["getByRole"]>,
): Promise<number> {
  const totalRegion = card
    .getByText("Verified total", { exact: true })
    .locator("..")
    .locator("..");
  const currencyValues = (await totalRegion.innerText()).match(
    /\$[\d,]+\.\d{2}/g,
  );
  const total = currencyValues?.at(-1);

  if (!total) {
    throw new Error("Could not read the verified outfit total.");
  }

  return Number(total.replace(/[$,]/g, "")) * 100;
}

async function shoesName(card: ReturnType<Page["getByRole"]>) {
  return card
    .getByText("Shoes", { exact: true })
    .locator("..")
    .getByRole("heading", { level: 4 })
    .innerText();
}

test("builds, selects, corrects, and rebuilds a complete outfit", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");

  const buildLink = page.getByRole("link", { name: "Build my outfit" });
  await expect(buildLink).toBeVisible();
  await buildLink.click();

  await expect(page).toHaveURL(/\/build$/);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Fit your moment." }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Total outfit budget" }),
  ).toHaveValue("150.00");
  await expect(
    page.getByRole("radio", { name: "Presentation" }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Smart casual" }),
  ).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Top" })).toHaveValue("M");
  await expect(page.getByRole("combobox", { name: "Bottom" })).toHaveValue(
    "M",
  );
  await expect(page.getByRole("combobox", { name: /Shoes/ })).toHaveValue(
    "42",
  );

  await page
    .getByRole("button", { name: "Build outfit options" })
    .click();

  await expect(
    page.getByText("Three verified outfits are ready. Choose one look."),
  ).toBeVisible();

  const choices = page
    .getByRole("group", { name: "Choose one verified outfit" })
    .getByRole("radio", { name: /Select verified outfit/ });

  await expect(choices).toHaveCount(3);
  await choices.nth(1).check();
  await expect(choices.nth(1)).toBeChecked();
  await expect(choices.nth(0)).not.toBeChecked();
  await expect(choices.nth(2)).not.toBeChecked();
  await expect(page.getByText("Outfit selected")).toBeVisible();

  const persistedSelection = await page.evaluate(() => {
    const rawState = window.localStorage.getItem("fitora.build.v1");
    return rawState ? (JSON.parse(rawState) as unknown) : null;
  });

  expect(persistedSelection).toMatchObject({
    version: 1,
    selectedOutfit: {
      reference: {
        top: { productId: expect.stringMatching(/^top-/), selectedSize: "M" },
        bottom: {
          productId: expect.stringMatching(/^bottom-/),
          selectedSize: "M",
        },
        shoes: {
          productId: expect.stringMatching(/^shoes-/),
          selectedSize: "42",
        },
      },
    },
  });
  expect(JSON.stringify(persistedSelection)).not.toContain("priceCents");

  const budgetInput = page.getByRole("textbox", {
    name: "Total outfit budget",
  });
  await budgetInput.fill("20.00");
  await page
    .getByRole("button", { name: "Build outfit options" })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "No complete outfit fits this budget.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Raise your budget to at least \$/),
  ).toBeVisible();

  await budgetInput.fill("150.00");
  await page
    .getByRole("button", { name: "Build outfit options" })
    .click();

  await expect(
    page.getByText("Three verified outfits are ready. Choose one look."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Choose one verified outfit" })
      .getByRole("radio", { name: /Select verified outfit/ }),
  ).toHaveCount(3);
  expect(unexpectedConsoleErrors(consoleErrors)).toEqual([]);
});

test("refines verified outfits in rules mode and prepares checkout review without payment", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  const paymentRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());

    if (/\/(?:checkout|payment|prava)(?:\/|$)/i.test(url.pathname)) {
      paymentRequests.push(request.url());
    }
  });

  await page.goto("/build");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: "Build outfit options" })
    .click();

  await expect(
    page.getByText("Three verified outfits are ready. Choose one look."),
  ).toBeVisible();

  const agentPanel = page.getByRole("region", {
    name: "Refine with Fitora",
  });
  await expect(agentPanel).toBeVisible();
  await expect(agentPanel.getByText("No autonomous checkout")).toBeVisible();

  const firstOutfit = page.getByRole("article", {
    name: "Verified outfit 01",
  });
  const originalShoes = await shoesName(firstOutfit);
  const originalTotalCents = await verifiedTotalCents(firstOutfit);

  await agentPanel
    .getByRole("button", {
      name: "Replace the shoes with a cheaper option",
    })
    .click();

  const agentResponse = agentPanel.getByRole("status");
  await expect(agentResponse).toContainText("I replaced the shoes with");
  await expect(agentResponse.getByText("Rules fallback")).toHaveCount(2);
  await expect(agentResponse).toContainText("Fallback");
  await expect(agentResponse).toContainText("None");

  await expect.poll(() => shoesName(firstOutfit)).not.toBe(originalShoes);
  await expect
    .poll(() => verifiedTotalCents(firstOutfit))
    .toBeLessThan(originalTotalCents);

  await agentPanel
    .getByRole("button", { name: "Make this outfit more relaxed" })
    .click();

  await expect(
    page.getByRole("radio", { name: "Relaxed" }),
  ).toBeChecked();
  await expect(agentResponse).toContainText("Style is now relaxed.");
  await expect(agentResponse.getByText("Rules fallback")).toHaveCount(2);

  const choices = page
    .getByRole("group", { name: "Choose one verified outfit" })
    .getByRole("radio", { name: /Select verified outfit/ });
  await choices.first().check();
  await expect(page.getByText("Outfit selected")).toBeVisible();

  const urlBeforeReview = page.url();
  const agentInput = agentPanel.getByRole("textbox", {
    name: "One change for this edit",
  });
  await agentInput.fill("Proceed to checkout");
  await agentPanel.getByRole("button", { name: "Ask Fitora" }).click();

  await expect(agentResponse).toContainText(
    "Checkout review is ready. No payment session was created.",
  );
  await expect(agentResponse).toContainText(
    "No payment session has been created.",
  );
  await expect(agentResponse.getByText("Rules fallback")).toHaveCount(2);
  await expect(
    agentPanel.getByRole("button", { name: /pay|checkout/i }),
  ).toHaveCount(0);
  expect(page.url()).toBe(urlBeforeReview);
  expect(paymentRequests).toEqual([]);
  expect(unexpectedConsoleErrors(consoleErrors)).toEqual([]);
});

test("supports the critical build and selection path by keyboard on mobile", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/build");
  await page.waitForLoadState("networkidle");

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const relaxedStyle = page.getByRole("radio", { name: "Relaxed" });
  await relaxedStyle.focus();
  await page.keyboard.press("Space");
  await expect(relaxedStyle).toBeChecked();

  const submitButton = page.getByRole("button", {
    name: "Build outfit options",
  });
  await submitButton.focus();
  await page.keyboard.press("Enter");

  const choices = page
    .getByRole("group", { name: "Choose one verified outfit" })
    .getByRole("radio", { name: /Select verified outfit/ });

  await expect(choices).toHaveCount(3);

  const agentPanel = page.getByRole("region", {
    name: "Refine with Fitora",
  });
  await expect(agentPanel).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const lastSuggestion = agentPanel.getByRole("button", {
    name: "Lower the budget to $130",
  });
  await lastSuggestion.focus();
  await page.keyboard.press("Tab");
  await expect(
    agentPanel.getByRole("textbox", { name: "One change for this edit" }),
  ).toBeFocused();

  const firstChoice = choices.nth(0);
  await firstChoice.focus();
  await page.keyboard.press("Space");

  await expect(firstChoice).toBeChecked();
  await expect(page.getByText("Outfit selected")).toBeVisible();
  expect(unexpectedConsoleErrors(consoleErrors)).toEqual([]);
});
