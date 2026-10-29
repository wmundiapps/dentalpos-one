// Texto formatado dos documentos (negrito, sublinhado, alinhamento, fonte e tamanho). Guardado como HTML simples e sempre limpo antes de exibir/imprimir.
const TAGS = new Set(["P", "DIV", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "H1", "H2", "H3"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT"]);
const FONT_PT = [8, 10, 12, 14, 18, 24, 36];
const FONTS = ["Arial", "Times New Roman", "Calibri", "Georgia", "Verdana", "Courier New"];
const clean = (s: string) => s.replace(/[^\w\s,'"-]/g, "");

function styleOf(el: Element): string {
  const raw = (el as HTMLElement).style;
  const out: string[] = [];
  const ta = raw?.textAlign; if (["left", "right", "center", "justify"].includes(ta)) out.push(`text-align:${ta}`);
  const ff = raw?.fontFamily; if (ff) { const f = FONTS.find((x) => ff.toLowerCase().includes(x.toLowerCase())); if (f) out.push(`font-family:'${f}'`); }
  const fs = raw?.fontSize; if (fs && /^\d+(\.\d+)?pt$/.test(fs)) { const n = parseFloat(fs); if (n >= 6 && n <= 72) out.push(`font-size:${n}pt`); }
  const lst = raw?.listStyleType; if (["lower-alpha", "decimal", "disc", "lower-roman"].includes(lst)) out.push(`list-style-type:${lst}`);
  if (raw?.fontWeight === "bold" || raw?.fontWeight === "700") out.push("font-weight:700");
  if (raw?.fontStyle === "italic") out.push("font-style:italic");
  if ((raw?.textDecorationLine || raw?.textDecoration || "").includes("underline")) out.push("text-decoration:underline");
  return out.join(";");
}

function walk(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  if (DROP.has(el.tagName)) return null;
  let tag = el.tagName;
  let style = styleOf(el);
  if (tag === "FONT") {
    tag = "SPAN";
    const face = el.getAttribute("face"); const size = Number(el.getAttribute("size"));
    const extra: string[] = [];
    if (face) { const f = FONTS.find((x) => x.toLowerCase() === clean(face).toLowerCase()); if (f) extra.push(`font-family:'${f}'`); }
    if (size >= 1 && size <= 7) extra.push(`font-size:${FONT_PT[size - 1]}pt`);
    style = [style, ...extra].filter(Boolean).join(";");
  }
  const align = el.getAttribute("align");
  if (align && ["left", "right", "center", "justify"].includes(align) && !style.includes("text-align")) style = [style, `text-align:${align}`].filter(Boolean).join(";");
  const kids = Array.from(el.childNodes).map((c) => walk(c, doc)).filter(Boolean) as Node[];
  if (!TAGS.has(tag)) { const frag = doc.createDocumentFragment(); kids.forEach((k) => frag.appendChild(k)); return frag; }
  const out = doc.createElement(tag.toLowerCase());
  if (style) out.setAttribute("style", style);
  kids.forEach((k) => out.appendChild(k));
  return out;
}

export function sanitizeRich(html: string): string {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const outDoc = document.implementation.createHTMLDocument("");
  const holder = outDoc.createElement("div");
  Array.from(parsed.body.childNodes).forEach((n) => { const r = walk(n, outDoc); if (r) holder.appendChild(r); });
  return holder.innerHTML;
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const looksRich = (s: string) => /<(p|div|br|span|b|u|i|strong|em|ul|ol|li|font)[\s>/]/i.test(s);
/** Conteúdo guardado (texto simples antigo ou HTML) → HTML seguro. */
export function toRichHtml(content: string): string {
  return looksRich(content) ? sanitizeRich(content) : escHtml(content).replace(/\n/g, "<br>");
}
export function richToText(html: string): string {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return (d.body.textContent || "").replace(/ /g, " ");
}
export const RICH_FONTS = FONTS;
export const RICH_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];
