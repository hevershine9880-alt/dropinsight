import { expect, type Page } from "@playwright/test";

/** Where each role's saved session lives. */
export const STORAGE = {
  owner: ".playwright/owner.json",
  va: ".playwright/va.json",
  accountant: ".playwright/accountant.json",
} as const;

export const DEMO = {
  owner: { email: "owner@dropinsight.test", password: "dropinsight-demo", name: "Huzaifa Malik" },
  va: { email: "va@dropinsight.test", password: "dropinsight-demo", name: "Priya Raman" },
  accountant: { email: "accountant@dropinsight.test", password: "dropinsight-demo", name: "Tomás Oliveira" },
};

/** Sign in through the real form, so the auth path is covered by every test. */
export async function signIn(page: Page, who: keyof typeof DEMO = "owner") {
  const user = DEMO[who];
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("sign-in"), { timeout: 20_000 });
}

export async function signOut(page: Page) {
  await page.request.post("/api/auth/sign-out");
  await page.context().clearCookies();
}

/** Parse a currency string like "£1,234.56" into minor units. */
export function toMinor(text: string): number {
  const cleaned = text.replace(/[^0-9.-]/g, "");
  return Math.round(Number(cleaned) * 100);
}

/**
 * The form-level error region.
 *
 * Scoped inside the <form>, because Next.js renders its own empty
 * role="alert" route announcer at the document level.
 */
export function formAlert(page: Page) {
  return page.locator("form").getByRole("alert");
}

export async function expectNoConsoleErrors(page: Page, run: () => Promise<void>) {
  const errors: string[] = [];
  const listener = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") errors.push(message.text());
  };
  page.on("console", listener as never);
  await run();
  page.off("console", listener as never);

  // Next.js dev emits a hydration-timing warning on fast navigations that is
  // not a product defect; everything else is.
  const real = errors.filter((e) => !/Download the React DevTools|hydrat/i.test(e));
  expect(real, `Console errors: ${real.join(" | ")}`).toHaveLength(0);
}

/**
 * Waits for a confirmation toast.
 *
 * A success toast lives on screen for a few seconds, so asserting on it
 * straight after a click is a race between the toast's lifetime and how long
 * the server action takes — which on a cold route can be most of a minute.
 * The generous window here is for the action, not the toast.
 */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text)).toBeVisible({ timeout: 30_000 });
}
