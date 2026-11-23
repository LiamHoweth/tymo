/**
 * Facility-branded email shell: a brand-color header band with the
 * facility name in wide uppercase type, a white body, one accent button,
 * and a plain-text alternative built from the same blocks. Inline styles
 * and tables only (email clients ignore stylesheets); no images.
 */

export type Block =
  | { kind: "p"; text: string; strong?: boolean }
  | { kind: "details"; rows: [label: string, value: string][] }
  | { kind: "button"; label: string; url: string }
  | { kind: "link"; label: string; url: string }
  | { kind: "note"; text: string };

export interface LayoutBrand {
  name: string;
  brandPrimary: string;
  brandAccent: string;
}

export interface LayoutInput {
  brand: LayoutBrand;
  subject: string;
  preheader: string;
  heading: string;
  blocks: Block[];
  footer: string[];
}

const FONT = "Arial, Helvetica, sans-serif";
const WIDE = "'Arial Black', 'Helvetica Neue', Arial, Helvetica, sans-serif";
const TEXT = "#0b1222";
const MUTED = "#586274";
const LINE = "#dfe4ec";
const PAPER = "#f3f5f9";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
}

function contrastWithWhite([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * lr + 0.7152 * lg + 0.0722 * lb + 0.05);
}

/**
 * A brand color that white text can sit on (4.5:1). Fails are darkened
 * step by step, matching the site's BrandScope rule.
 */
export function readableOnWhite(hex: string, fallback: string): string {
  let rgb = parseHex(hex) ?? parseHex(fallback)!;
  for (let i = 0; i < 12 && contrastWithWhite(rgb) < 4.5; i++) {
    rgb = rgb.map((c) => c * 0.85) as [number, number, number];
  }
  return toHex(rgb);
}

function blockHtml(block: Block, accent: string): string {
  switch (block.kind) {
    case "p":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.5;color:${TEXT};${block.strong ? "font-weight:bold;" : ""}">${escapeHtml(block.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(block.text)}</p>`;
    case "details":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border-top:1px solid ${LINE};">${block.rows
        .map(
          ([label, value]) =>
            `<tr><td valign="top" style="padding:10px 12px 10px 0;border-bottom:1px solid ${LINE};width:36%;font-family:${FONT};font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</td><td valign="top" style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;line-height:1.4;font-weight:bold;color:${TEXT};">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td align="center" bgcolor="${accent}" style="border-radius:999px;background:${accent};"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:15px 30px;border-radius:999px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(block.label)}</a></td></tr></table>`;
    case "link":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(block.label)}:<br><a href="${escapeHtml(block.url)}" style="color:${accent};word-break:break-all;">${escapeHtml(block.url)}</a></p>`;
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "details":
      return block.rows.map(([label, value]) => `${label}: ${value}`).join("\n");
    case "button":
    case "link":
      return `${block.label}: ${block.url}`;
  }
}

export function renderLayout(input: LayoutInput): { html: string; text: string } {
  const brand = readableOnWhite(input.brand.brandPrimary, "#0a2d5b");
  const accent = readableOnWhite(input.brand.brandAccent, "#d0353d");
  const name = input.brand.name.toUpperCase();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td bgcolor="${brand}" style="background:${brand};padding:28px 28px 26px;">
<div style="font-family:${WIDE};font-size:20px;line-height:1.2;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;">${escapeHtml(name)}</div>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 18px;font-family:${WIDE};font-size:22px;line-height:1.15;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:${TEXT};">${escapeHtml(input.heading)}</h1>
${input.blocks.map((b) => blockHtml(b, accent)).join("\n")}
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid ${LINE};">
${input.footer.map((line) => `<p style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(line)}</p>`).join("\n")}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [name, "", input.heading, "", ...input.blocks.map((b) => `${blockText(b)}\n`), "--", ...input.footer]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text: `${text}\n` };
}
