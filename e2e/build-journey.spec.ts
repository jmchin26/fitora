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

  const firstChoice = choices.nth(0);
  await firstChoice.focus();
  await page.keyboard.press("Space");

  await expect(firstChoice).toBeChecked();
  await expect(page.getByText("Outfit selected")).toBeVisible();
  expect(unexpectedConsoleErrors(consoleErrors)).toEqual([]);
});
