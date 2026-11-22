// AI copywriting: eBay listing content and buyer-message replies, via Claude.
// Without ANTHROPIC_API_KEY a plain template is used so the system still runs.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

export type ListingDraft = {
  title: string;
  description: string;
  aspects: Record<string, string[]>;
};

export type ListingContext = {
  supplierTitle: string;
  supplierDescription: string;
  variantName: string;
  categoryName: string | null;
  aspects: { name: string; required: boolean; values: string[] }[];
  handlingDays: number;
  shippingDays: number | null;
};

const ListingSchema = z.object({
  title: z.string().describe("eBay title, max 80 characters, keyword-rich, no brand names, no ALL CAPS, no emojis"),
  bullet_points: z.array(z.string()).describe("4-6 short benefit-focused bullet points"),
  description_paragraph: z.string().describe("2-3 sentence plain-English product description"),
  specs: z.array(z.object({ name: z.string(), value: z.string() })).describe("Key specifications"),
  aspects: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .describe("Item specifics. Use the exact aspect names given. Use 'Unbranded' for Brand."),
});

const SYSTEM = `You write eBay.com (US) listings for a dropshipping store selling unbranded products.
Rules:
- Never mention or imply any brand, trademark, licensed character or "compatible with <brand>" claims.
- Never mention China, the supplier, AliExpress, CJ, dropshipping, or shipping origin.
- No contact info, URLs, prices, promotions, or guarantees you cannot verify.
- Only state facts present in the supplier data. If a spec is unknown, leave it out.
- US English, clear and honest. Title max 80 characters.`;

function stripHtml(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function truncateTitle(t: string): string {
  const clean = t.replace(/\s+/g, " ").trim();
  if (clean.length <= 80) return clean;
  const cut = clean.slice(0, 80);
  const i = cut.lastIndexOf(" ");
  return (i > 50 ? cut.slice(0, i) : cut).trim();
}

export function renderDescription(p: {
  paragraph: string;
  bullets: string[];
  specs: { name: string; value: string }[];
  handlingDays: number;
}): string {
  const bullets = p.bullets.map((b) => `<li>${esc(b)}</li>`).join("");
  const specs = p.specs.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.value)}</td></tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;max-width:900px">
<p>${esc(p.paragraph)}</p>
${bullets ? `<h3>Features</h3><ul>${bullets}</ul>` : ""}
${specs ? `<h3>Specifications</h3><table cellpadding="6" border="1" style="border-collapse:collapse">${specs}</table>` : ""}
<h3>Shipping</h3><p>Free shipping. Ships within ${p.handlingDays} business days with tracking.</p>
<h3>Returns</h3><p>30-day returns. Message us with any question, we reply within 24 hours.</p>
</div>`;
}

function aspectsMap(list: { name: string; value: string }[], ctx: ListingContext): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const a of list) if (a.name && a.value) out[a.name] = [a.value.slice(0, 65)];
  out["Brand"] = ["Unbranded"];
  for (const a of ctx.aspects) {
    if (a.required && !out[a.name]) out[a.name] = [a.name === "MPN" ? "Does Not Apply" : a.values[0] ?? "Does Not Apply"];
  }
  return out;
}

export function templateListing(ctx: ListingContext): ListingDraft {
  const text = stripHtml(ctx.supplierDescription);
  return {
    title: truncateTitle(ctx.variantName ? `${ctx.supplierTitle} ${ctx.variantName}` : ctx.supplierTitle),
    description: renderDescription({
      paragraph: text.slice(0, 600) || ctx.supplierTitle,
      bullets: [],
      specs: ctx.variantName ? [{ name: "Option", value: ctx.variantName }] : [],
      handlingDays: ctx.handlingDays,
    }),
    aspects: aspectsMap([], ctx),
  };
}

export class ListingWriter {
  private client: Anthropic | null;
  private model: string;

  constructor(opts: { apiKey: string; model: string }) {
    this.client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : null;
    this.model = opts.model;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async write(ctx: ListingContext): Promise<ListingDraft> {
    if (!this.client) return templateListing(ctx);

    const aspectHelp = ctx.aspects
      .map((a) => `- ${a.name}${a.required ? " (REQUIRED)" : ""}${a.values.length ? `: e.g. ${a.values.slice(0, 8).join(", ")}` : ""}`)
      .join("\n");

    // Server-side fallback: if the model declines (safety classifier false
    // positive), the API retries on a fallback model inside the same call.
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ListingSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Supplier title: ${ctx.supplierTitle}
Variant: ${ctx.variantName || "n/a"}
eBay category: ${ctx.categoryName ?? "unknown"}
Supplier description (raw): ${stripHtml(ctx.supplierDescription)}

Item specifics to fill (use these exact names):
${aspectHelp || "- Brand (REQUIRED)\n- Type\n- Color\n- Material"}`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return templateListing(ctx);
    }
    const out = response.parsed_output;
    return {
      title: truncateTitle(out.title),
      description: renderDescription({
        paragraph: out.description_paragraph,
        bullets: out.bullet_points,
        specs: out.specs,
        handlingDays: ctx.handlingDays,
      }),
      aspects: aspectsMap(out.aspects, ctx),
    };
  }

  /** Draft a reply to a buyer message. You review and send it from eBay. */
  async draftReply(input: { buyerMessage: string; orderInfo: string }): Promise<string> {
    if (!this.client) return "AI is off (ANTHROPIC_API_KEY is not set).";
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system:
        "You are a polite, concise eBay seller support agent for a US store. Reply in the buyer's language. Never mention suppliers, China or dropshipping. Do not promise refunds or dates you do not know; offer to check and follow up. Output only the reply text.",
      messages: [{ role: "user", content: `Order info: ${input.orderInfo || "n/a"}\n\nBuyer message:\n${input.buyerMessage}` }],
    });
    return response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }
}
