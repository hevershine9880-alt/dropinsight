import { test, expect } from "@playwright/test";
import { STORAGE, toMinor } from "./helpers";

test.describe("Dashboard", () => {
  test.use({ storageState: STORAGE.owner });

  test("shows both period cards with real figures", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: /This month summary/i })).toBeVisible();

    const monthCard = page.getByRole("region", { name: /This month summary/i });
    await expect(monthCard.getByText("Net profit")).toBeVisible();
    await expect(monthCard.getByText("Revenue")).toBeVisible();

    // Revenue must be a real amount, not a placeholder.
    const revenue = await monthCard.locator("p.text-3xl").nth(1).innerText();
    expect(toMinor(revenue)).toBeGreaterThan(0);
  });

  test("states how much of the profit rests on priced orders", async ({ page }) => {
    await page.goto("/dashboard");
    const monthCard = page.getByRole("region", { name: /This month summary/i });

    // The seed always leaves a costing backlog — the last few days of orders
    // are deliberately unpriced, as a real workspace would be. So the card must
    // say what its profit figure actually covers.
    await expect(monthCard.getByText(/orders awaiting a buying price/i)).toBeVisible();
    await expect(monthCard.getByText(/across \d+ of \d+ orders/)).toBeVisible();
  });

  test("links the outstanding tiles to the work they represent", async ({ page }) => {
    await page.goto("/dashboard");
    const outstanding = page.getByRole("heading", { name: /Outstanding right now/i });
    await expect(outstanding).toBeVisible();

    await page.getByRole("link", { name: /Awaiting a buying price/i }).first().click();
    await page.waitForURL(/orders\?tab=awaiting_cost/);
    await expect(page.getByRole("tab", { name: /Awaiting cost/ })).toHaveAttribute("aria-selected", "true");
  });

  test("changes the comparison window", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Last 14 days" }).click();
    await expect(page.getByRole("region", { name: /Last 14 days summary/i })).toBeVisible();
    await expect(page).toHaveURL(/period=last14/);
  });

  test("renders the revenue and profit chart", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Revenue and profit" })).toBeVisible();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // Every chart offers a table alternative for anyone who cannot read the SVG.
    await page.getByText("View this chart as a table").first().click();
    await expect(page.getByRole("table", { name: /Chart data/i }).first()).toBeVisible();
  });
});
