import { chromium } from "@playwright/test";

/**
 * Clipping the page must not have clipped the tables themselves: each wide
 * table has to remain scrollable inside its own container, or the columns to
 * the right become unreachable on a phone.
 */
const CASES = [
  { route: "/orders", caption: /^Orders,/ },
  { route: "/profit-protection", caption: /^Open supplier refund claims/ },
  { route: "/settings/team", caption: /^Permissions granted/ },
];

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });

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

  let failures = 0;

  for (const testCase of CASES) {
    await page.goto(`${BASE}${testCase.route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);

    if (new URL(page.url()).pathname.startsWith("/sign-in")) {
      throw new Error(`${testCase.route} redirected to sign-in — the session was not established.`);
    }

    const result = await page.evaluate((captionSource) => {
      const pattern = new RegExp(captionSource);
      const table = [...document.querySelectorAll("table")].find((t) =>
        pattern.test(t.querySelector("caption")?.textContent ?? ""),
      );
      if (!table) return { found: false, scrolled: 0, hidden: 0 };

      const wrapper = table.parentElement as HTMLElement;
      const hidden = wrapper.scrollWidth - wrapper.clientWidth;
      wrapper.scrollLeft = 99_999;
      const scrolled = Math.round(wrapper.scrollLeft);
      wrapper.scrollLeft = 0;
      return { found: true, scrolled, hidden };
    }, testCase.caption.source);

    if (!result.found) {
      console.log(`? ${testCase.route.padEnd(20)} table not on the page`);
      continue;
    }
    if (result.scrolled > 20) {
      console.log(`✓ ${testCase.route.padEnd(20)} scrolls ${result.scrolled}px inside its container`);
    } else {
      console.log(`✗ ${testCase.route.padEnd(20)} does NOT scroll (${result.hidden}px is unreachable)`);
      failures += 1;
    }
  }

  await browser.close();
  if (failures > 0) process.exitCode = 1;
}

main();
