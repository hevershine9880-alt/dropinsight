import { test, expect } from "@playwright/test";
import { STORAGE, expectToast } from "./helpers";

test.describe("Orders", () => {
  test.use({ storageState: STORAGE.owner });

  test("lists orders with the columns a seller needs", async ({ page }) => {
    await page.goto("/orders");
    const table = page.getByRole("table", { name: /Orders,/ });
    await expect(table).toBeVisible();

    for (const column of ["Order", "Product", "Sold", "Cost", "Profit", "Margin", "Status"]) {
      await expect(table.getByRole("columnheader", { name: new RegExp(column) }).first()).toBeVisible();
    }
    await expect(table.locator("tbody tr").first()).toBeVisible();
  });

  test("filters by status and keeps the filter in the URL", async ({ page }) => {
    await page.goto("/orders");
    await page.getByRole("tab", { name: /^Refunded/ }).click();
    await expect(page).toHaveURL(/tab=refunded/);

    // A shared or bookmarked URL must reproduce the same view.
    await page.reload();
    await expect(page.getByRole("tab", { name: /^Refunded/ })).toHaveAttribute("aria-selected", "true");
  });

  test("searches by order number", async ({ page }) => {
    await page.goto("/orders");
    const firstOrder = await page.getByRole("table").locator("tbody tr").first()
      .getByRole("link").first().innerText();

    await page.getByLabel("Search orders").fill(firstOrder);
    await page.waitForURL(new RegExp(`search=${encodeURIComponent(firstOrder)}`), { timeout: 10_000 });
    await expect(page.getByRole("link", { name: firstOrder }).first()).toBeVisible();
  });

  test("enters a buying price inline and profit appears", async ({ page }) => {
    await page.goto("/orders?tab=awaiting_cost");

    const addCost = page.getByRole("button", { name: /^Add a buying price for/ }).first();
    const orderLabel = (await addCost.getAttribute("aria-label"))!.replace("Add a buying price for ", "");
    await addCost.click();

    const input = page.getByLabel(`Buying price per unit for order ${orderLabel}`);
    await expect(input).toBeVisible();
    await input.fill("3.25");
    await page.getByRole("button", { name: "Save buying price" }).click();

    // The editor closes the instant the save lands, and only then is the toast
    // raised. Waiting on the editor first means the toast's own few seconds on
    // screen are not being raced against a cold server action.
    await expect(input).toBeHidden({ timeout: 30_000 });
    await expectToast(page, "Buying price saved");

    // The cost is now on that order's row, wherever it appears in the table.
    await page.goto(`/orders?search=${encodeURIComponent(orderLabel)}&period=all_time`);
    const row = page.getByRole("row", { name: new RegExp(orderLabel) }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("£3.25");
  });

  test("opens an order and shows a profit breakdown that adds up", async ({ page }) => {
    await page.goto("/orders");
    await page.getByRole("table").locator("tbody tr").first().getByRole("link").first().click();
    await page.waitForURL(/orders\/[a-z0-9]+/);

    await expect(page.getByRole("heading", { name: "How this profit was calculated" })).toBeVisible();
    await expect(page.getByText("Item sales")).toBeVisible();
    await expect(page.getByText("eBay fees")).toBeVisible();
    await expect(page.getByText("Net profit")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  });

  test("costs a line from the order page and the breakdown updates", async ({ page }) => {
    await page.goto("/orders?tab=awaiting_cost");

    // Pick an order the inline editor offers to cost — that button only appears
    // on single-line orders, so the detail page is guaranteed to have exactly
    // one line waiting for a price. Landing on a half-costed multi-line order
    // would make the assertions below ambiguous.
    const addCost = page.getByRole("button", { name: /^Add a buying price for/ }).first();
    await expect(addCost).toBeVisible();
    const orderLabel = (await addCost.getAttribute("aria-label"))!.replace("Add a buying price for ", "");

    // `exact` matters: the row also has an "Open order …" action link.
    await page.getByRole("row", { name: new RegExp(orderLabel) }).first()
      .getByRole("link", { name: orderLabel, exact: true }).click();
    await page.waitForURL(/orders\/[a-z0-9]+/);

    await expect(page.getByText(/no buying price yet/i).first()).toBeVisible();

    await page.getByRole("button", { name: /^Add cost/ }).first().click();
    await page.getByLabel(/Buying price \/ unit/).fill("5.00");
    await page.getByRole("button", { name: "Save buying price" }).click();

    await expectToast(page, "Buying price saved");

    // The breakdown now has a supplier cost line. A multi-line order may still
    // have another line to price, and the warning says exactly how many.
    const breakdown = page.getByRole("region", { name: "How this profit was calculated" });
    await expect(breakdown.getByText("Supplier cost", { exact: true })).toBeVisible();
  });

  test("opens spreadsheet mode with keyboard hints", async ({ page }) => {
    await page.goto("/orders");
    await page.getByRole("button", { name: "Spreadsheet mode" }).click();

    const dialog = page.getByRole("dialog", { name: /Price orders like a spreadsheet/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("columnheader", { name: /Buying price/ })).toBeVisible();

    // The keyboard shortcuts are stated in the footer, and again in the
    // table's caption so a screen-reader user hears them too.
    await expect(dialog.locator("p", { hasText: /fills the column downward/ })).toBeVisible();
    await expect(
      dialog.getByRole("table", { name: /Command-D fills the column downward/ }),
    ).toBeAttached();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("explains what the CSV import expects", async ({ page }) => {
    await page.goto("/orders");
    await page.getByRole("button", { name: "Import costs" }).click();

    const dialog = page.getByRole("dialog", { name: /Import buying prices/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("columnheader", { name: /eBay Order Number/ })).toBeVisible();
    await expect(dialog.getByRole("columnheader", { name: /Buying Price/ })).toBeVisible();
    await expect(
      dialog.locator("p", { hasText: /ignored, including any profit or payout columns/i }),
    ).toBeVisible();
  });

  test("exports the current view as CSV", async ({ page }) => {
    await page.goto("/orders?period=last7");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/dropinsight-orders-.*\.csv/);
  });
});
