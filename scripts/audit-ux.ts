import { chromium, type Page } from "@playwright/test";

/**
 * An end-user pass over every page.
 *
 * Checks the things a person notices and a unit test does not: a heading that
 * never arrives, a control with no accessible name, an empty state with no way
 * out, a number rendered as "NaN" or "undefined", a link that 404s.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const ROUTES = [
  "/dashboard", "/orders", "/returns", "/profit-protection", "/products",
  "/suppliers", "/profit-and-loss", "/expenses", "/analytics", "/reports",
  "/insights", "/alerts", "/automation", "/automation/new", "/ebay-accounts",
  "/settings", "/settings/team", "/settings/billing", "/settings/profile",
  "/settings/activity", "/settings/referrals", "/support",
];

interface Finding { route: string; kind: string; detail: string }
const findings: Finding[] = [];

function report(route: string, kind: string, detail: string) {
  findings.push({ route, kind, detail });
}

async function auditPage(page: Page, route: string) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  const onConsole = (m: { type: () => string; text: () => string }) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  };
  const onResponse = (r: { status: () => number; url: () => string }) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  };

  page.on("console", onConsole as never);
  page.on("response", onResponse as never);

  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  page.off("console", onConsole as never);
  page.off("response", onResponse as never);

  if (new URL(page.url()).pathname.startsWith("/sign-in")) {
    report(route, "auth", "redirected to sign-in");
    return;
  }

  const audit = await page.evaluate(() => {
    const problems: { kind: string; detail: string }[] = [];

    // A page with no h1 gives a screen-reader user nothing to orient by.
    if (document.querySelectorAll("h1").length !== 1) {
      problems.push({ kind: "heading", detail: `${document.querySelectorAll("h1").length} h1 elements` });
    }

    // Broken formatting leaks as literal text.
    const body = document.body.innerText;
    for (const bad of ["NaN", "undefined", "null", "Invalid Date", "[object Object]", "£NaN"]) {
      if (body.includes(bad)) {
        const line = body.split("\n").find((l) => l.includes(bad));
        problems.push({ kind: "bad-value", detail: `"${bad}" in: ${line?.trim().slice(0, 80)}` });
      }
    }

    // "1 orders", "1 supplier refunds have gone quiet" — the count is right and
    // the sentence is wrong, which makes a reader trust the number less.
    // Nouns that are plural whatever the count, and third-person verbs, are
    // not mistakes.
    const PLURAL_ONLY = new Set([
      "sales", "goods", "settings", "analytics", "series", "status", "business",
      "days", "hours", "returns", "expenses", "costs", "news", "means",
    ]);
    const VERBS = new Set([
      "needs", "sells", "costs", "comes", "goes", "makes", "takes", "gives",
      "shows", "says", "looks", "seems", "remains", "arrives", "appears",
      "does", "gets", "keeps", "stays", "holds", "runs", "pays", "wants",
      "counts", "adds", "starts", "ends", "leaves", "sits", "reads", "waits",
    ]);
    const STOP = new Set([
      "of", "in", "the", "a", "an", "and", "or", "to", "for", "with", "at",
      "on", "from", "more", "than", "out", "into", "per", "by",
    ]);
    for (const m of body.matchAll(/\b1 ((?:[a-z]+ ){0,2}[a-z]{3,}s)\b/g)) {
      const words = m[1].split(" ");
      const noun = words[words.length - 1];
      if (words.slice(0, -1).some((w) => STOP.has(w))) continue;
      if (PLURAL_ONLY.has(noun) || VERBS.has(noun)) continue;
      if (/(ss|us|is)$/.test(noun)) continue;
      const line = body.split("\n").find((l) => l.includes(m[0]));
      problems.push({ kind: "plural", detail: `"${m[0]}" in: ${line?.trim().slice(0, 80)}` });
    }

    // A number that breaks across two lines: "−" left hanging above "£51.47"
    // reads as a dash and an amount rather than a negative figure. Measured
    // from the text's own line boxes — an element's height is the row's height
    // in a table, which says nothing about the text inside it. A range like
    // "£16.81 – £19.40" is meant to stack, so a spaced dash is allowed.
    const wrapped: string[] = [];
    for (const el of document.querySelectorAll(".tabular")) {
      if (el.children.length > 0) continue;
      const text = (el as HTMLElement).innerText?.trim() ?? "";
      if (!text || text.length > 24) continue;
      if (/\s[–—-]\s/.test(text)) continue;

      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      if (tops.size > 1) wrapped.push(text.replace(/\s+/g, " "));
    }
    if (wrapped.length) {
      problems.push({ kind: "wrapped-number", detail: `${wrapped.length}: ${wrapped.slice(0, 3).join(" | ")}` });
    }

    // Controls a screen reader cannot announce.
    const unnamed: string[] = [];
    for (const el of document.querySelectorAll("button, a[href]")) {
      const label =
        el.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        (el as HTMLElement).innerText?.trim();
      if (!label) unnamed.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
    }
    if (unnamed.length) {
      problems.push({ kind: "unnamed-control", detail: `${unnamed.length}: ${unnamed.slice(0, 3).join(", ")}` });
    }

    // Inputs with no label.
    const unlabelled: string[] = [];
    for (const el of document.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), select, textarea")) {
      const hasLabel =
        el.getAttribute("aria-label") ||
        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
        el.closest("label");
      if (!hasLabel) unlabelled.push(el.getAttribute("name") ?? el.type ?? el.tagName);
    }
    if (unlabelled.length) {
      problems.push({ kind: "unlabelled-input", detail: unlabelled.slice(0, 3).join(", ") });
    }

    // Images with no alternative text.
    const imgs = [...document.querySelectorAll("img")].filter(
      (i) => !i.hasAttribute("alt") && i.getAttribute("aria-hidden") !== "true",
    );
    if (imgs.length) problems.push({ kind: "img-no-alt", detail: `${imgs.length} images` });

    // An empty state with nothing to click is a dead end.
    const emptyHeadings = [...document.querySelectorAll("h3")].filter((h) =>
      /^(no |nothing |nobody )/i.test(h.textContent ?? ""),
    );
    for (const heading of emptyHeadings) {
      const block = heading.parentElement;
      if (block && !block.querySelector("a, button")) {
        problems.push({ kind: "dead-end-empty-state", detail: heading.textContent?.slice(0, 50) ?? "" });
      }
    }

    return problems;
  });

  for (const problem of audit) report(route, problem.kind, problem.detail);

  for (const error of consoleErrors.filter((e) => !/DevTools|hydrat|favicon/i.test(e))) {
    report(route, "console-error", error.slice(0, 120));
  }
  for (const failure of failedRequests.filter((f) => !/favicon|_next\/static/.test(f))) {
    report(route, "failed-request", failure.slice(0, 120));
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/sign-in`);
  const ok = await page.evaluate(async () => {
    const form = new FormData();
    form.set("email", "owner@dropinsight.test");
    form.set("password", "dropinsight-demo");
    return (await fetch("/api/auth/demo-sign-in", { method: "POST", body: form })).ok;
  });
  if (!ok) {
    console.error("Could not sign in.");
    await browser.close();
    process.exitCode = 1;
    return;
  }

  for (const route of ROUTES) {
    process.stdout.write(`  ${route.padEnd(26)}`);
    const before = findings.length;
    await auditPage(page, route);
    console.log(findings.length === before ? "ok" : `${findings.length - before} finding(s)`);
  }

  await browser.close();

  console.log("\n" + "─".repeat(70));
  if (findings.length === 0) {
    console.log("\nNothing found.\n");
    return;
  }

  const byKind = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }

  console.log(`\n${findings.length} ${findings.length === 1 ? "finding" : "findings"}:\n`);
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${kind} (${list.length})`);
    for (const f of list.slice(0, 8)) console.log(`   ${f.route.padEnd(24)} ${f.detail}`);
    if (list.length > 8) console.log(`   …and ${list.length - 8} more`);
    console.log("");
  }
  process.exitCode = 1;
}

main();
