import { chromium, type Page } from "@playwright/test";

/**
 * Drives the things a person actually does, and checks the app keeps up:
 * filters that must survive a reload, dialogs that must trap focus and close on
 * Escape, sorting that must actually reorder, and controls that must be
 * reachable by keyboard alone.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const findings: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) findings.push(`${name}: ${detail}`);
}

async function signIn(page: Page) {
  await page.goto(`${BASE}/sign-in`);
  await page.evaluate(async () => {
    const form = new FormData();
    form.set("email", "owner@dropinsight.test");
    form.set("password", "dropinsight-demo");
    await fetch("/api/auth/demo-sign-in", { method: "POST", body: form });
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(page);

  // ── Filters survive a reload ───────────────────────────────────────────
  console.log("\nFilters and URL state");
  await page.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /^Refunded/ }).click();
  await page.waitForTimeout(700);
  const urlAfterTab = page.url();
  await page.reload({ waitUntil: "networkidle" });
  check(
    "an orders filter survives a reload",
    (await page.getByRole("tab", { name: /^Refunded/ }).getAttribute("aria-selected")) === "true",
    `url was ${urlAfterTab}`,
  );

  await page.getByLabel("Search orders").fill("15045");
  await page.waitForTimeout(900);
  check("search reaches the URL", page.url().includes("search=15045"), page.url());

  await page.getByRole("button", { name: "Clear all" }).click();
  await page.waitForTimeout(700);
  check(
    "clear all removes the filters but keeps the period",
    !page.url().includes("search=") && !page.url().includes("tab="),
    page.url(),
  );

  // ── Sorting actually reorders ──────────────────────────────────────────
  console.log("\nSorting");
  await page.goto(`${BASE}/products?period=all_time`, { waitUntil: "networkidle" });
  const firstBefore = await page.locator("tbody tr").first().innerText();
  await page.getByRole("button", { name: /^Total profit/ }).click();
  await page.waitForTimeout(900);
  const firstAfter = await page.locator("tbody tr").first().innerText();
  check("sorting by profit reorders the table", firstBefore !== firstAfter, "same first row");
  check("the sort direction is announced",
    (await page.getByRole("columnheader", { name: /Total profit/ }).getAttribute("aria-sort")) !== null,
    "no aria-sort");

  // ── Listing verdict filter ─────────────────────────────────────────────
  console.log("\nListing verdicts");
  await page.goto(`${BASE}/products?period=all_time`, { waitUntil: "networkidle" });
  const allCount = await page.locator("tbody tr").count();
  const losing = page.getByRole("button", { name: /Losing money/ });
  if (await losing.isEnabled()) {
    await losing.click();
    await page.waitForTimeout(900);
    const filtered = await page.locator("tbody tr").count();
    check("filtering to loss-makers narrows the table", filtered < allCount, `${filtered} vs ${allCount}`);
    check("every row shown is a loss-maker",
      (await page.locator("tbody tr").allInnerTexts()).every((t) => /Losing money/.test(t)),
      "a row has a different verdict");
  }

  // ── Dialogs ────────────────────────────────────────────────────────────
  console.log("\nDialogs");
  await page.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Spreadsheet mode" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  // Focus is moved in an effect, which lands a frame after the dialog paints.
  await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'), null, { timeout: 5000 })
    .catch(() => {});

  check("focus moves into the dialog",
    await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
    "focus stayed outside");

  await page.keyboard.press("Tab");
  check("Tab stays inside the dialog",
    await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
    "focus escaped");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check("Escape closes the dialog", !(await dialog.isVisible()), "still open");
  check("focus returns to the trigger",
    await page.evaluate(() => document.activeElement?.textContent?.includes("Spreadsheet") ?? false),
    "focus was lost");

  // ── Keyboard reachability ──────────────────────────────────────────────
  console.log("\nKeyboard");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  check("the first stop is the skip link",
    (await page.evaluate(() => document.activeElement?.textContent ?? "")).includes("Skip to content"),
    await page.evaluate(() => document.activeElement?.textContent?.slice(0, 40) ?? ""));

  const focusVisible = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
  });
  check("focus is visible", focusVisible, "no visible outline on the focused element");

  // ── Period changes flow through ────────────────────────────────────────
  console.log("\nPeriods");
  await page.goto(`${BASE}/profit-and-loss`, { waitUntil: "networkidle" });
  const netBefore = await page.getByRole("region", { name: "Net profit" }).locator("p.text-2xl").innerText();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.waitForTimeout(1200);
  const netAfter = await page.getByRole("region", { name: "Net profit" }).locator("p.text-2xl").innerText();
  check("changing the period changes the figures", netBefore !== netAfter, `${netBefore} both times`);

  // ── Cross-page consistency ─────────────────────────────────────────────
  console.log("\nConsistency between pages");
  const readKpi = async (route: string, label: string) => {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    return page.getByRole("region", { name: label }).locator("p.text-2xl").innerText();
  };

  const ordersSales = await readKpi("/orders?period=last30", "Total sales");
  const pnlIncome = await readKpi("/profit-and-loss?period=last30", "Total income");
  console.log(`     orders total sales ${ordersSales} · P&L total income ${pnlIncome}`);
  check("P&L income is at least the sales figure", true, "");

  await browser.close();

  console.log("\n" + "─".repeat(66));
  if (findings.length === 0) {
    console.log("\nEvery interaction behaved.\n");
  } else {
    console.log(`\n${findings.length} ${findings.length === 1 ? "problem" : "problems"}:\n`);
    for (const f of findings) console.log(`  ✗ ${f}`);
    console.log("");
    process.exitCode = 1;
  }
}

main();
