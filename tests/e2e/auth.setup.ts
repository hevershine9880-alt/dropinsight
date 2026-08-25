import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DEMO, signIn, STORAGE } from "./helpers";

/**
 * Signs in as each demo role once and saves the session.
 *
 * Individual tests then load the session they need instead of authenticating
 * again — faster, and it keeps the sign-in form under test only where sign-in
 * is actually the subject.
 */
setup("authenticate every role", async ({ browser }) => {
  fs.mkdirSync(path.dirname(STORAGE.owner), { recursive: true });

  for (const role of Object.keys(DEMO) as (keyof typeof DEMO)[]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, role);
    await context.storageState({ path: STORAGE[role] });
    await context.close();
  }
});
