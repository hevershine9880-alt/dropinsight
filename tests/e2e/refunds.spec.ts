import { test, expect } from "@playwright/test";
import { STORAGE } from "./helpers";

test.describe("Refunds and supplier recovery", () => {
  test.use({ storageState: STORAGE.owner });

  test("asks the supplier-refund question up front", async ({ page }) => {
    await page.goto("/returns");

    // The seed always leaves unanswered claims, so the question must be there.
    await expect(
      page.getByRole("heading", { name: "Did you receive a supplier refund?" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Yes, received/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Expecting it/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Partly/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^No$/ }).first()).toBeVisible();
  });

  test("records a full recovery and offers an undo", async ({ page }) => {
    await page.goto("/profit-protection?tab=not_asked");

    const received = page.getByRole("button", { name: /^Received/ }).first();
    await expect(received).toBeVisible();
    await received.click();

    await expect(page.getByText(/recovered$/i).first()).toBeVisible({ timeout: 30_000 });
    // Financial changes are undoable straight after, from the toast.
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("requires an amount for a partial recovery and caps it", async ({ page }) => {
    await page.goto("/profit-protection?tab=not_asked");
    await page.getByRole("button", { name: /^Partial/ }).first().click();

    const dialog = page.getByRole("dialog", { name: /How much did the supplier pay back/ });
    await expect(dialog).toBeVisible();

    // More than the refund cost is refused with the real ceiling named.
    await dialog.getByLabel(/Amount recovered/).fill("99999");
    await dialog.getByRole("button", { name: "Record recovery" }).click();
    await expect(dialog.getByText(/The most recoverable here is/)).toBeVisible();
  });

  test("shows the chase queue with age and recoverable amounts", async ({ page }) => {
    await page.goto("/profit-protection");
    await expect(page.getByRole("heading", { name: "Chase queue" })).toBeVisible();
    await expect(page.getByText("Recovered to date")).toBeVisible();
    await expect(page.getByText("Still recoverable")).toBeVisible();

    const table = page.getByRole("table", { name: /Open supplier refund claims/ });
    await expect(table.getByRole("columnheader", { name: "Recoverable" })).toBeVisible();
  });

  test("shows the break-even price floor", async ({ page }) => {
    await page.goto("/profit-protection");
    await expect(
      page.getByRole("heading", { name: /Prices your products can't afford to drop below/ }),
    ).toBeVisible();
  });
});
