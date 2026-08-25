import { test, expect } from "@playwright/test";
import { signIn, signOut, formAlert, DEMO } from "./helpers";

test.describe("Authentication", () => {
  test("signs in, lands on the dashboard, and signs out", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(DEMO.owner.name.split(" ")[0]);

    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/sign-in/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("rejects a wrong password without saying which field was wrong", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(DEMO.owner.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = formAlert(page);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/don't match an account/i);
    // The same message for a wrong password and an unknown email — no enumeration.
    await expect(alert).not.toContainText(/no account|not registered/i);
  });

  test("gives the same answer for an email that does not exist", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("nobody-here@dropinsight.test");
    await page.getByLabel("Password", { exact: true }).fill("whatever-it-is");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toContainText(/don't match an account/i);
  });

  test("sends an anonymous-looking answer for a password reset", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill("someone-who-does-not-exist@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/Check your inbox/i)).toBeVisible();
  });

  test("redirects a signed-out visitor away from the app", async ({ page }) => {
    await signOut(page);
    await page.goto("/dashboard");
    await page.waitForURL(/sign-in/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("signs up a new workspace and lands in onboarding", async ({ page }) => {
    const unique = Date.now();
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("Test Seller");
    await page.getByLabel("Business name").fill(`E2E Store ${unique}`);
    await page.getByLabel("Email address").fill(`e2e-${unique}@dropinsight.test`);
    await page.getByLabel("Password", { exact: true }).fill("a-long-enough-password-1");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL(/onboarding/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Welcome, Test/ })).toBeVisible();
  });
});
