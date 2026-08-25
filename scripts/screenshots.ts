import { chromium } from "@playwright/test";
import fs from "node:fs";

/**
 * Captures every primary screen at desktop and mobile, in both themes, for a
 * visual pass. Written to scripts/.screens/ (gitignored).
 */
const ROUTES = [
  "/dashboard", "/orders", "/returns", "/profit-protection", "/profit-and-loss",
  "/products", "/suppliers", "/expenses", "/analytics", "/reports",
  "/insights", "/alerts", "/automation", "/ebay-accounts", "/settings/team",
  "/settings/billing", "/support",
];

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "scripts/.screens";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const theme of ["light", "dark"] as const) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
    });
    const page = await context.newPage();

    await page.goto(`${BASE}/sign-in`);
    const ok = await page.evaluate(async () => {
      const form = new FormData();
      form.set("email", "owner@dropinsight.test");
      form.set("password", "dropinsight-demo");
      return (await fetch("/api/auth/demo-sign-in", { method: "POST", body: form })).ok;
    });
    if (!ok) throw new Error("Could not sign in — start the server with ALLOW_DEMO_SIGN_IN=true.");

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const name = route.replace(/\//g, "-").replace(/^-/, "");
      await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: false });
      console.log(`${theme} ${route}`);
    }

    await context.close();
  }

  // The signed-out screens matter too.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const route of ["/sign-in", "/sign-up"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/light-${route.slice(1)}.png` });
    console.log(`light ${route}`);
  }
  await context.close();

  await browser.close();
  console.log(`\nWrote ${fs.readdirSync(OUT).length} screenshots to ${OUT}`);
}

main();
