import { chromium } from "@playwright/test";

/**
 * Sweeps every page at three widths and reports any horizontal overflow.
 *
 * A page that scrolls sideways on a phone is the single most common responsive
 * defect, and the easiest to miss by eye.
 */
const ROUTES = [
  "/dashboard", "/orders", "/returns", "/profit-protection", "/products",
  "/suppliers", "/profit-and-loss", "/expenses", "/analytics", "/reports",
  "/insights", "/alerts", "/automation", "/automation/new", "/ebay-accounts",
  "/settings", "/settings/team", "/settings/billing", "/settings/profile",
  "/settings/activity", "/settings/referrals", "/support",
];

const WIDTHS = [375, 768, 1280];
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Sign in through the demo endpoint so every route is reachable.
  await page.goto(`${BASE}/sign-in`);
  const signedIn = await page.evaluate(async () => {
    const form = new FormData();
    form.set("email", "owner@dropinsight.test");
    form.set("password", "dropinsight-demo");
    const response = await fetch("/api/auth/demo-sign-in", { method: "POST", body: form });
    return response.ok;
  });

  // A silent redirect to /sign-in would make every page "pass". Fail loudly.
  if (!signedIn) {
    console.error(
      "Could not sign in. In production the demo endpoint is disabled — " +
        "start the server with ALLOW_DEMO_SIGN_IN=true to run this check.",
    );
    await browser.close();
    process.exitCode = 1;
    return;
  }

  const problems: string[] = [];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);

      if (new URL(page.url()).pathname.startsWith("/sign-in")) {
        throw new Error(`${route} redirected to sign-in — the session was not established.`);
      }

      const result = await page.evaluate(() => {
        const de = document.documentElement;

        // scrollWidth over-reports: Chrome includes overflow that an inner
        // scroll container has already clipped. What matters is whether the
        // page can actually be scrolled sideways, so try it and see.
        const startX = window.scrollX;
        window.scrollTo(99_999, window.scrollY);
        const first = Math.round(window.scrollX);
        window.scrollTo(startX, window.scrollY);
        window.scrollTo(99_999, window.scrollY);
        const overflow = Math.max(first, Math.round(window.scrollX));
        window.scrollTo(startX, window.scrollY);

        if (overflow <= 1) return { overflow: 0, offenders: [] as string[] };

        // An element cannot widen the document if it is taken out of flow, or
        // if an ancestor already clips or scrolls it. Written inline because
        // esbuild's helper injection breaks named functions inside evaluate().
        const offenders: string[] = [];

        for (const el of document.querySelectorAll<HTMLElement>("*")) {
          if (el.getBoundingClientRect().right <= de.clientWidth + 1) continue;
          if (["fixed", "absolute"].includes(getComputedStyle(el).position)) continue;

          let clipped = false;
          let parent = el.parentElement;
          while (parent && parent !== document.body) {
            const style = getComputedStyle(parent);
            if (["auto", "scroll", "hidden"].includes(style.overflowX) || style.position === "fixed") {
              clipped = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (clipped) continue;

          offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
          if (offenders.length >= 3) break;
        }

        return { overflow, offenders };
      });

      const label = `${String(width).padStart(4)}px ${route.padEnd(26)}`;
      if (result.overflow > 1) {
        problems.push(`${label} overflows by ${result.overflow}px — ${result.offenders.join(", ")}`);
        console.log(`✗ ${label} +${result.overflow}px`);
      } else {
        console.log(`✓ ${label}`);
      }
    }
  }

  await browser.close();

  console.log("");
  if (problems.length === 0) {
    console.log("No horizontal overflow at any width.");
  } else {
    console.log(`${problems.length} pages overflow:`);
    for (const problem of problems) console.log(`  ${problem}`);
    process.exitCode = 1;
  }
}

main();
