/**
 * A minimal PDF writer.
 *
 * Deliberately dependency-free. The monthly P&L is a one-page statement of
 * headings, rules and right-aligned figures — pulling in a 2 MB PDF library and
 * a headless browser to render that would be a poor trade, and would put a
 * binary between the user and a number they need to trust.
 *
 * Produces PDF 1.4 with the standard Helvetica faces, which every reader has.
 * Text is WinAnsi-encoded, so "£" works; characters outside that set are
 * transliterated rather than silently dropped.
 */

const PAGE = { width: 595.28, height: 841.89 }; // A4 in points
const MARGIN = 48;

type Font = "regular" | "bold";

interface Op {
  kind: "text" | "line" | "rect";
  x: number;
  y: number;
  text?: string;
  size?: number;
  font?: Font;
  align?: "left" | "right";
  colour?: [number, number, number];
  x2?: number;
  width?: number;
  height?: number;
}

export class PdfDocument {
  private ops: Op[] = [];
  private cursorY = MARGIN;

  get width(): number { return PAGE.width; }
  get contentWidth(): number { return PAGE.width - MARGIN * 2; }
  get left(): number { return MARGIN; }
  get right(): number { return PAGE.width - MARGIN; }
  get y(): number { return this.cursorY; }

  moveDown(points: number): this {
    this.cursorY += points;
    return this;
  }

  text(
    value: string,
    options: { size?: number; font?: Font; align?: "left" | "right"; x?: number; colour?: [number, number, number] } = {},
  ): this {
    this.ops.push({
      kind: "text",
      x: options.x ?? (options.align === "right" ? this.right : this.left),
      y: this.cursorY,
      text: value,
      size: options.size ?? 10,
      font: options.font ?? "regular",
      align: options.align ?? "left",
      colour: options.colour,
    });
    return this;
  }

  /** A label on the left and a figure on the right, on the same baseline. */
  row(
    label: string,
    value: string,
    options: { size?: number; font?: Font; indent?: number; colour?: [number, number, number] } = {},
  ): this {
    const size = options.size ?? 10;
    this.text(label, { size, font: options.font, x: this.left + (options.indent ?? 0) });
    this.text(value, { size, font: options.font, align: "right", colour: options.colour });
    this.cursorY += size + 6;
    return this;
  }

  rule(options: { thickness?: number; colour?: [number, number, number] } = {}): this {
    this.ops.push({
      kind: "line",
      x: this.left,
      x2: this.right,
      y: this.cursorY,
      width: options.thickness ?? 0.5,
      colour: options.colour ?? [0.85, 0.87, 0.9],
    });
    this.cursorY += 8;
    return this;
  }

  band(height: number, colour: [number, number, number]): this {
    this.ops.push({
      kind: "rect",
      x: this.left - 6,
      y: this.cursorY - 4,
      width: this.contentWidth + 12,
      height,
      colour,
    });
    return this;
  }

  build(title: string): Uint8Array {
    const content = this.ops
      .map((op) => {
        if (op.kind === "line") {
          const [r, g, b] = op.colour ?? [0, 0, 0];
          return `${r} ${g} ${b} RG ${op.width} w ${op.x} ${flip(op.y)} m ${op.x2} ${flip(op.y)} l S`;
        }
        if (op.kind === "rect") {
          const [r, g, b] = op.colour ?? [0.95, 0.95, 0.95];
          return `${r} ${g} ${b} rg ${op.x} ${flip(op.y + (op.height ?? 0))} ${op.width} ${op.height} re f`;
        }

        const size = op.size ?? 10;
        const font = op.font === "bold" ? "/F2" : "/F1";
        const [r, g, b] = op.colour ?? [0.06, 0.09, 0.16];
        const escaped = escapeText(op.text ?? "");
        const x = op.align === "right"
          ? op.x - measure(op.text ?? "", size, op.font ?? "regular")
          : op.x;
        return `BT ${r} ${g} ${b} rg ${font} ${size} Tf ${x} ${flip(op.y + size)} Td (${escaped}) Tj ET`;
      })
      .join("\n");

    return assemble(content, title);
  }
}

function flip(y: number): number {
  return PAGE.height - y;
}

/**
 * Helvetica advance widths, in 1/1000 em, for the printable ASCII range plus a
 * few symbols we use. Good enough to right-align a column of figures.
 */
const WIDTHS_REGULAR: Record<string, number> = {};
const WIDTHS_BOLD: Record<string, number> = {};
(() => {
  const regular = "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584";
  const bold = "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584";
  regular.split(" ").forEach((w, i) => { WIDTHS_REGULAR[String.fromCharCode(32 + i)] = Number(w); });
  bold.split(" ").forEach((w, i) => { WIDTHS_BOLD[String.fromCharCode(32 + i)] = Number(w); });
  WIDTHS_REGULAR["£"] = 556; WIDTHS_BOLD["£"] = 556;
  WIDTHS_REGULAR["€"] = 556; WIDTHS_BOLD["€"] = 556;
  WIDTHS_REGULAR["—"] = 1000; WIDTHS_BOLD["—"] = 1000;
})();

function measure(text: string, size: number, font: Font): number {
  const table = font === "bold" ? WIDTHS_BOLD : WIDTHS_REGULAR;
  let total = 0;
  for (const char of text) total += table[char] ?? 556;
  return (total / 1000) * size;
}

/** WinAnsi code points for the handful of non-ASCII characters we emit. */
const WIN_ANSI: Record<string, number> = {
  "£": 0xa3, "€": 0x80, "—": 0x97, "–": 0x96, "’": 0x92, "‘": 0x91,
  "“": 0x93, "”": 0x94, "·": 0xb7, "…": 0x85,
};

function escapeText(text: string): string {
  let out = "";
  for (const char of text) {
    if (char === "(" || char === ")" || char === "\\") { out += `\\${char}`; continue; }
    const code = char.charCodeAt(0);
    if (code < 128) { out += char; continue; }
    const winAnsi = WIN_ANSI[char];
    if (winAnsi !== undefined) { out += `\\${winAnsi.toString(8).padStart(3, "0")}`; continue; }
    // Anything else is transliterated rather than corrupting the stream.
    out += "?";
  }
  return out;
}

function assemble(content: string, title: string): Uint8Array {
  const encoder = new TextEncoder();
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
  );
  objects.push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.push(
    `<< /Title (${escapeText(title)}) /Producer (DropInsight) /Creator (DropInsight) ` +
      `/CreationDate (D:${pdfDate(new Date())}) >>`,
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  return encoder.encode(pdf);
}

function pdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function pdfResponse(filename: string, bytes: Uint8Array): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
