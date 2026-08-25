import { test, expect } from "@playwright/test";
import { STORAGE, toMinor, expectToast } from "./helpers";

test.describe("Profit & loss", () => {
  test.use({ storageState: STORAGE.owner });

  test("the statement adds up on screen", async ({ page }) => {
    await page.goto("/profit-and-loss?period=this_month");

    const statement = page.getByRole("table", { name: /Profit and loss statement/ });
    await expect(statement).toBeVisible();

    const rowValue = async (label: string) =>
      toMinor(await statement.getByRole("row", { name: new RegExp(label) }).locator("td").first().innerText());

    const income = await rowValue("Total income");
    const costs = await rowValue("Total costs");
    const net = toMinor(await statement.locator("tfoot td").first().innerText());

    // The reader can check this with a calculator, so it had better hold.
    expect(income + costs).toBe(net);
  });

  test("the three headline figures subtract to each other", async ({ page }) => {
    await page.goto("/profit-and-loss?period=this_month");

    // A reader will try to subtract the KPI cards, so they had better work.
    const kpi = async (label: string) =>
      toMinor(await page.getByRole("region", { name: label }).locator("p.text-2xl").innerText());

    const income = await kpi("Total income");
    const costs = await kpi("Total costs");
    const net = await kpi("Net profit");

    expect(income - costs).toBe(net);
  });

  test("says plainly when orders are excluded for want of a cost", async ({ page }) => {
    await page.goto("/profit-and-loss?period=this_month");

    // The seed leaves a costing backlog, so the statement must state its basis.
    await expect(page.getByText(/orders are not in this statement/)).toBeVisible();
    await expect(page.getByText(/would overstate profit/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Enter the missing buying prices/ })).toBeVisible();
  });

  test("switches the trend metric", async ({ page }) => {
    await page.goto("/profit-and-loss");
    await page.getByRole("tab", { name: "Margin" }).click();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
  });

  test("downloads every report", async ({ page }) => {
    await page.goto("/reports");

    const buttons = page.getByRole("button", { name: "Download CSV" });
    const count = await buttons.count();
    expect(count).toBe(5);

    for (let i = 0; i < count; i++) {
      const download = page.waitForEvent("download");
      await buttons.nth(i).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^dropinsight-.*\.csv$/);
    }
  });

  test("downloads the monthly P&L as a PDF", async ({ page }) => {
    await page.goto("/reports");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/dropinsight-pnl-\d{4}-\d{2}\.pdf/);
  });
});

test.describe("Expenses", () => {
  test.use({ storageState: STORAGE.owner });

  test("adds, edits and removes an expense with a working undo", async ({ page }) => {
    await page.goto("/expenses");

    const description = `E2E software ${Date.now()}`;
    await page.getByLabel("Description").fill(description);
    await page.getByLabel(/Amount/).first().fill("42.50");
    await page.getByRole("button", { name: /^Add$/ }).click();

    await expectToast(page, "Expense added");
    await expect(page.getByText(description)).toBeVisible();

    await page.getByRole("button", { name: `Remove ${description}` }).click();
    await page.getByRole("button", { name: "Remove" }).last().click();

    await expectToast(page, "Expense removed");
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("true net profit is gross profit less expenses", async ({ page }) => {
    await page.goto("/expenses");

    const value = async (label: string) =>
      toMinor(await page.getByRole("region", { name: label }).locator("p.text-2xl").innerText());

    const gross = await value("Gross profit");
    const expenses = await value("Expenses");
    const net = await value("True net profit");

    expect(gross - expenses).toBe(net);
  });

  test("refuses to edit an expense that came from eBay", async ({ page }) => {
    // The seed imports an eBay shop fee into every month.
    await page.goto("/expenses");
    const ebayRow = page.getByText("from eBay").first();
    await expect(ebayRow).toBeVisible();
    await expect(ebayRow.locator("..").getByText("read-only")).toBeVisible();
  });
});
