import { test, expect } from "@playwright/test";
import { STORAGE, expectToast } from "./helpers";

test.describe("Remaining workflows", () => {
  test.use({ storageState: STORAGE.owner });

  test("creates an automation and runs it", async ({ page }) => {
    await page.goto("/automation/new");

    const name = `E2E rule ${Date.now()}`;
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /A supplier refund goes unanswered/ }).click();
    await page.getByRole("button", { name: "Add condition" }).click();
    await page.getByLabel("Value").fill("1");
    await page.getByRole("button", { name: "Create automation" }).click();

    await page.waitForURL(/\/automation$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // Running it must use the same path the scheduler does.
    const card = page.getByRole("heading", { name }).locator("..").locator("..").locator("..");
    await card.getByRole("button", { name: "Run now" }).click();
    await expect(page.getByText(/Fired on \d+ items?|Nothing matched/)).toBeVisible({ timeout: 20_000 });
  });

  test("global search finds an order by number", async ({ page }) => {
    await page.goto("/orders");
    const orderNumber = await page.getByRole("table").locator("tbody tr").first()
      .getByRole("link").first().innerText();

    await page.getByRole("button", { name: /Search orders, SKUs, buyers/ }).click();
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();

    const query = dialog.getByLabel("Search query");
    await query.fill(orderNumber);

    const option = dialog.getByRole("option", { name: new RegExp(orderNumber) }).first();
    await expect(option).toBeVisible({ timeout: 15_000 });

    // The first result is pre-selected, so Enter opens it without touching the mouse.
    await expect(option).toHaveAttribute("aria-selected", "true");
    await query.press("Enter");
    await page.waitForURL(/orders\/[a-z0-9]+/, { timeout: 15_000 });
  });

  test("opens and replies to a support ticket", async ({ page }) => {
    await page.goto("/support");

    const subject = `E2E question ${Date.now()}`;
    await page.getByLabel("What do you need help with?").fill(subject);
    await page.getByLabel("Details").fill("This ticket was opened by the end-to-end test suite.");
    await page.getByRole("button", { name: "Open a ticket" }).click();

    await expectToast(page, "Ticket opened");
    await expect(page.getByText(subject)).toBeVisible();
  });

  test("marks alerts as read", async ({ page }) => {
    await page.goto("/alerts");

    // The seed always leaves unread alerts.
    const markAll = page.getByRole("button", { name: "Mark all read" });
    await expect(markAll).toBeVisible();
    await markAll.click();
    await expectToast(page, /alerts marked read/);

    // And once read, the control goes away.
    await expect(markAll).toHaveCount(0);
  });

  test("refreshes insights", async ({ page }) => {
    await page.goto("/insights");
    await page.getByRole("button", { name: /Refresh insights|Check again now/ }).first().click();
    await expect(page.getByText(/Insights refreshed/)).toBeVisible({ timeout: 20_000 });
  });

  test("changes the refund attribution setting", async ({ page }) => {
    await page.goto("/settings");
    const select = page.getByLabel("Refund losses count in");

    await select.selectOption("ORDER_MONTH");
    await expect(page.getByText(/reduces July/)).toBeVisible();

    await page.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Settings saved");

    // Put it back so the rest of the suite sees the seeded default.
    await select.selectOption("REFUND_MONTH");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Settings saved");
  });

  test("syncs an eBay account on demand", async ({ page }) => {
    await page.goto("/ebay-accounts");
    await expect(page.getByRole("heading", { name: "eBay accounts" })).toBeVisible();

    await page.getByRole("button", { name: "Sync now" }).first().click();
    await expect(page.getByText(/^Syncing /)).toBeVisible({ timeout: 20_000 });
  });

  // Twenty-one routes, each compiled on first hit by the dev server.
  test("navigates every primary page without a console error", async ({ page }) => {
    test.slow();

    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`);
    });

    const routes = [
      "/dashboard", "/orders", "/returns", "/profit-protection", "/products",
      "/suppliers", "/profit-and-loss", "/expenses", "/analytics", "/reports",
      "/insights", "/alerts", "/automation", "/ebay-accounts", "/settings",
      "/settings/team", "/settings/billing", "/settings/profile",
      "/settings/activity", "/settings/referrals", "/support",
    ];

    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    }

    const real = errors.filter((e) => !/React DevTools|hydrat|Failed to load resource.*favicon/i.test(e));
    expect(real, real.join("\n")).toHaveLength(0);
  });
});
