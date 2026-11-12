import * as z from "zod";

const CreditPackSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  credits: z.number().int().positive(),
  price: z.string().min(1),
  url: z.string().url(),
});
export type CreditPack = z.infer<typeof CreditPackSchema>;

/** Parse the GUMROAD_PRODUCTS env JSON. Returns [] when unset; throws on malformed config. */
export function parseCreditPacks(raw: string | undefined): CreditPack[] {
  if (!raw || raw.trim() === "") return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("GUMROAD_PRODUCTS is not valid JSON");
  }
  return z.array(CreditPackSchema).parse(json);
}

export function getCreditPacks(): CreditPack[] {
  return parseCreditPacks(process.env.GUMROAD_PRODUCTS);
}

export function getCreditsPerGeneration(): number {
  const n = Number(process.env.CREDITS_PER_GENERATION ?? "1");
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function getClaudeModel(): string {
  return process.env.CLAUDE_MODEL || "claude-opus-5-5";
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}
