/**
 * CSV writing.
 *
 * Two things that matter for a file an accountant will open in Excel:
 *  - fields containing a comma, quote or newline are quoted, with quotes doubled
 *  - a value starting with =, +, - or @ is prefixed so Excel does not execute it
 *    as a formula. That is a real vulnerability, not a nicety.
 */

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);

  // Formula injection guard.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  // A BOM makes Excel read the file as UTF-8, so "£" is not mangled.
  return "﻿" + [csvRow(headers), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Minor units → a plain decimal string for a spreadsheet cell: no symbol, no separators. */
export function csvMoney(minor: number, currency = "GBP"): string {
  const exponent = ["JPY", "KRW"].includes(currency) ? 0 : 2;
  const negative = minor < 0;
  const abs = Math.abs(minor).toString().padStart(exponent + 1, "0");
  const whole = abs.slice(0, abs.length - exponent) || "0";
  const frac = exponent === 0 ? "" : `.${abs.slice(abs.length - exponent)}`;
  return `${negative ? "-" : ""}${whole}${frac}`;
}
