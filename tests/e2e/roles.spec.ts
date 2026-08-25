import { test, expect } from "@playwright/test";
import { STORAGE } from "./helpers";

/**
 * Role-based access is only real if the server enforces it. These tests check
 * the enforcement, not just that a button is hidden.
 */
test.describe("As a VA", () => {
  test.use({ storageState: STORAGE.va });

  test("sees orders but not profit totals", async ({ page }) => {
    // The VA has no dashboard.view, so they land on orders.
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

    // No profit column for a role that cannot see totals.
    const table = page.getByRole("table", { name: /Orders,/ });
    await expect(table.getByRole("columnheader", { name: "Profit" })).toHaveCount(0);

    // And the dashboard itself is refused by the server, not just hidden.
    await page.goto("/dashboard");
    await page.waitForURL(/no-access/);
    await expect(page.getByRole("heading", { name: /part of your role/i })).toBeVisible();
  });

  test("can still enter buying prices", async ({ page }) => {
    await page.goto("/orders?tab=awaiting_cost");
    await expect(page.getByRole("button", { name: /^Add a buying price for/ }).first()).toBeVisible();
  });

});

test.describe("As an accountant", () => {
  test.use({ storageState: STORAGE.accountant });

  test("can see the P&L but not enter costs", async ({ page }) => {
    await page.goto("/profit-and-loss");
    await expect(page.getByRole("heading", { name: "Profit & loss" })).toBeVisible();

    await page.goto("/orders");
    await expect(page.getByRole("button", { name: /^Add a buying price for/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Spreadsheet mode" })).toHaveCount(0);
  });

});

test.describe("As an owner", () => {
  test.use({ storageState: STORAGE.owner });

  test("sees a role matrix generated from the enforced rules", async ({ page }) => {
    await page.goto("/settings/team");

    const matrix = page.getByRole("table", { name: /Permissions granted by each role/ });
    await expect(matrix).toBeVisible();
    await expect(matrix.getByRole("columnheader", { name: "Manager" })).toBeVisible();
    await expect(matrix.getByRole("columnheader", { name: "VA" })).toBeVisible();
    await expect(matrix.getByRole("rowheader", { name: "Enter buying prices" })).toBeVisible();
  });
});
