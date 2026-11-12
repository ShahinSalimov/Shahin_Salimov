import { parse, type HTMLElement, type Node } from "node-html-parser";
import { dedupeFacts, makeFact, type FactDraft } from "./fact";
import { factsFromJsonLd, parseJsonLd } from "./json-ld";
import { cleanInline, cleanMultiline } from "./sanitize";
import { extractFromLines, type TextLine } from "./text-patterns";

export interface HtmlExtraction {
  title: string | null;
  description: string | null;
  lang: string | null;
  headings: { level: number; text: string }[];
  text: string;
  facts: FactDraft[];
  warnings: string[];
  stats: { jsonLdBlocks: number; textLines: number; textChars: number };
}

const REMOVE = ["script", "style", "noscript", "template", "svg", "iframe", "object", "embed", "canvas", "head"];
const BLOCK = new Set(["p", "li", "td", "th", "dd", "dt", "h1", "h2", "h3", "h4", "h5", "h6", "div", "section", "article", "header", "footer", "main", "aside", "nav", "address", "blockquote", "figcaption", "caption", "tr", "ul", "ol", "dl", "table", "tbody", "thead", "form", "label", "button", "pre"]);
const MAX_LINES = 3000;
const MAX_JSONLD_BLOCKS = 20;
const MAX_JSONLD_BYTES = 200_000;

function isElement(n: Node): n is HTMLElement {
  return n.nodeType === 1;
}

function tag(el: HTMLElement): string {
  return (el.rawTagName ?? "").toLowerCase();
}

function hidden(el: HTMLElement): boolean {
  if (el.hasAttribute("hidden")) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  const style = (el.getAttribute("style") ?? "").replace(/\s/g, "").toLowerCase();
  return style.includes("display:none") || style.includes("visibility:hidden");
}

/** Short CSS-like path for evidence, e.g. "main > ul > li:nth-of-type(3)". */
function pathOf(el: HTMLElement): string {
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && parts.length < 4 && tag(cur) && tag(cur) !== "body" && tag(cur) !== "html") {
    const t = tag(cur);
    const parent: HTMLElement | null = cur.parentNode as HTMLElement | null;
    const same = parent ? parent.childNodes.filter((c): c is HTMLElement => isElement(c) && tag(c) === t) : [];
    const idx = same.indexOf(cur);
    const id = cur.getAttribute("id");
    parts.unshift(id && /^[\w-]{1,40}$/.test(id) ? `${t}#${id}` : same.length > 1 ? `${t}:nth-of-type(${idx + 1})` : t);
    cur = parent;
  }
  return parts.join(" > ");
}

/** Collects text lines from the innermost block elements, in document order. */
function collectLines(root: HTMLElement): TextLine[] {
  const lines: TextLine[] = [];
  const walk = (el: HTMLElement) => {
    if (lines.length >= MAX_LINES || hidden(el)) return;
    const children = el.childNodes;
    const hasBlockChild = children.some((c) => isElement(c) && BLOCK.has(tag(c)));
    if (BLOCK.has(tag(el)) && !hasBlockChild) {
      const text = cleanInline(el.text, 2000);
      if (text) lines.push({ text, location: { kind: "element", path: pathOf(el) } });
      return;
    }
    // Mixed content: inline text directly inside a container with block children.
    let inline = "";
    const flush = () => {
      const t = cleanInline(inline, 2000);
      if (t) lines.push({ text: t, location: { kind: "element", path: pathOf(el) } });
      inline = "";
    };
    for (const c of children) {
      if (isElement(c)) {
        if (BLOCK.has(tag(c))) {
          flush();
          walk(c);
        } else if (!hidden(c)) inline += ` ${c.text}`;
      } else inline += ` ${c.text}`;
    }
    flush();
  };
  walk(root);
  return lines;
}

/**
 * Extracts readable content and facts from an HTML page.
 * Scripts never run, links are not followed, and hidden elements are ignored.
 */
export function extractHtml(html: string, opts: { assetName: string; url?: string }): HtmlExtraction {
  const warnings: string[] = [];
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });

  const title = cleanInline(root.querySelector("title")?.text, 300) || null;
  const description = cleanInline(root.querySelector('meta[name="description"]')?.getAttribute("content") ?? root.querySelector('meta[property="og:description"]')?.getAttribute("content"), 1000) || null;
  const lang = cleanInline(root.querySelector("html")?.getAttribute("lang"), 20) || null;
  const pageEntity = title ?? opts.assetName;

  // Structured data first (before scripts are removed).
  const blocks = root.querySelectorAll('script[type="application/ld+json"]');
  const parsed: Parameters<typeof factsFromJsonLd>[0] = [];
  blocks.slice(0, MAX_JSONLD_BLOCKS).forEach((b, i) => {
    const raw = b.rawText ?? b.text;
    if (raw.length > MAX_JSONLD_BYTES) {
      warnings.push(`Structured data block ${i + 1} is larger than 200 KB and was skipped.`);
      return;
    }
    const r = parseJsonLd(raw);
    if (r.ok) parsed.push(r.value);
    else warnings.push(`Structured data block ${i + 1} is not valid JSON and was skipped.`);
  });
  if (blocks.length > MAX_JSONLD_BLOCKS) warnings.push(`Only the first ${MAX_JSONLD_BLOCKS} structured data blocks were read.`);

  for (const t of REMOVE) root.querySelectorAll(t).forEach((n) => n.remove());

  const facts: FactDraft[] = [];
  const push = (f: FactDraft | null) => {
    if (f) facts.push(f);
  };

  push(title ? makeFact(pageEntity, "page title", title, { kind: "meta", path: "title" }, 0.95, "html") : null);
  push(description ? makeFact(pageEntity, "meta description", description, { kind: "meta", path: 'meta[name="description"]' }, 0.9, "html") : null);

  const headings = root
    .querySelectorAll("h1, h2, h3")
    .filter((h) => !hidden(h))
    .slice(0, 60)
    .map((h) => ({ level: Number(tag(h).slice(1)), text: cleanInline(h.text, 300) }))
    .filter((h) => h.text);
  const h1 = headings.find((h) => h.level === 1);
  if (h1) push(makeFact(pageEntity, "main heading", h1.text, { kind: "element", path: "h1" }, 0.85, "html"));

  facts.push(...factsFromJsonLd(parsed));

  // Microdata: itemscope blocks with itemprop="name" and itemprop="price".
  for (const scope of root.querySelectorAll("[itemscope]").slice(0, 500)) {
    const nameEl = scope.querySelector('[itemprop="name"]');
    const priceEl = scope.querySelector('[itemprop="price"]');
    const name = cleanInline(nameEl?.getAttribute("content") ?? nameEl?.text, 300);
    const price = cleanInline(priceEl?.getAttribute("content") ?? priceEl?.text, 100);
    const currency = cleanInline(scope.querySelector('[itemprop="priceCurrency"]')?.getAttribute("content"), 8);
    if (name && price) push(makeFact(name, "price", `${currency ? `${currency} ` : ""}${price}`, { kind: "element", path: pathOf(scope) }, 0.9, "html"));
  }

  // Contact links are explicit, so they get high confidence.
  for (const a of root.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').slice(0, 50)) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("tel:")) push(makeFact(pageEntity, "phone", decodeURIComponent(href.slice(4)).replace(/[^\d+()\s.-]/g, ""), { kind: "link", path: pathOf(a) }, 0.9, "html"));
    else push(makeFact(pageEntity, "email", decodeURIComponent(href.slice(7).split("?")[0] ?? ""), { kind: "link", path: pathOf(a) }, 0.9, "html"));
  }

  const body = root.querySelector("body") ?? root;
  const lines = collectLines(body);
  if (lines.length >= MAX_LINES) warnings.push(`The page is very long; only the first ${MAX_LINES} text blocks were analyzed.`);
  facts.push(...extractFromLines(lines, { method: "html", defaultEntity: pageEntity }));

  const text = cleanMultiline(lines.map((l) => l.text).join("\n"), 20_000);
  if (!text) warnings.push("No visible text was found. The page may be rendered by JavaScript, which the scanner does not run.");

  return {
    title,
    description,
    lang,
    headings,
    text,
    facts: dedupeFacts(facts),
    warnings,
    stats: { jsonLdBlocks: parsed.length, textLines: lines.length, textChars: text.length },
  };
}
