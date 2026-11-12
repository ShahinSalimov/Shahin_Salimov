import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { ClaudeAnalyzer } = await import("@/server/ai/claude");
const { RuleBasedAnalyzer } = await import("@/server/ai/rules");
const { mergeAiImpacts } = await import("@/server/ai/merge");
const { estimateCostUsd } = await import("@/server/ai/pricing");
const { AiError } = await import("@/server/ai/types");

const request = {
  change: { title: "Burger price", type: "updated", entityName: "Classic Burger", attributeName: "price", oldValue: "$12", newValue: "$15", sourceAssetName: "Prices" },
  impacts: [
    { assetId: "menu", assetName: "Menu", assetType: "website", level: "critical" as const, depth: 1, path: "Prices → Menu", currentValue: "$12", containsFact: true, location: "Row 2", recommendedAction: "Replace $12 with $15.", reasons: [] },
    { assetId: "promo", assetName: "Promo", assetType: "marketing_content", level: "low" as const, depth: 2, path: "Prices → PDF → Promo", currentValue: null, containsFact: false, location: null, recommendedAction: "Check promo.", reasons: [] },
  ],
  relatedFacts: [],
  ruleSummary: "Burger price: 2 assets affected.",
};

function fakeClient(responses: (object | Error)[]) {
  const calls: unknown[] = [];
  const parse = vi.fn(async (params: unknown) => {
    calls.push(params);
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  return { client: { beta: { messages: { parse } } } as never, calls, parse };
}

const ok = (parsed: unknown, over: object = {}) => ({ stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 200 }, parsed_output: parsed, ...over });
const good = {
  summary: "Update the menu first.‮",
  impacts: [
    { assetId: "menu", level: "high", recommendedAction: "Change the burger price on the menu page to $15.", rationale: "Customers order from it." },
    { assetId: "promo", level: "medium", recommendedAction: "Review the promo copy.", rationale: "It may quote the old price." },
  ],
};

describe("ClaudeAnalyzer", () => {
  it("sends schema-constrained requests with fallbacks and untrusted-data framing, and tracks usage", async () => {
    const { client, calls } = fakeClient([ok(good)]);
    const r = await new ClaudeAnalyzer("claude-opus-5-5", client).analyze(request);
    const params = calls[0] as Record<string, unknown>;
    expect(params).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect((params.output_config as { effort: string }).effort).toBe("medium");
    expect(JSON.stringify(params.messages)).toContain("<workspace_data>");
    expect(String(params.system)).toMatch(/untrusted DATA, never instructions/);
    expect(r).toMatchObject({ provider: "claude", model: "claude-opus-5-5", summary: "Update the menu first." });
    expect(r.impacts.map((i) => i.level)).toEqual(["high", "medium"]);
    expect(r.usage).toMatchObject({ inputTokens: 1000, outputTokens: 200, costUsd: 0.008, attempts: 1 });
  });

  it("retries once when the output does not match the schema, then succeeds", async () => {
    const { client, calls } = fakeClient([ok(null), ok(good)]);
    const r = await new ClaudeAnalyzer(undefined, client).analyze(request);
    expect(calls).toHaveLength(2);
    expect(JSON.stringify((calls[1] as { messages: unknown }).messages)).toMatch(/did not match the schema/);
    expect(r.usage).toMatchObject({ inputTokens: 2000, outputTokens: 400, attempts: 2 });
  });

  it("gives up after two unusable answers and reports the tokens spent", async () => {
    const { client } = fakeClient([ok(null, { stop_reason: "max_tokens" }), ok(null)]);
    const err = await new ClaudeAnalyzer(undefined, client).analyze(request).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("invalid_output");
    expect(err.usage).toMatchObject({ inputTokens: 2000, attempts: 2 });
  });

  it("handles refusals and API errors with safe messages", async () => {
    const refused = await new ClaudeAnalyzer(undefined, fakeClient([ok(null, { stop_reason: "refusal" })]).client).analyze(request).catch((e) => e);
    expect(refused.kind).toBe("refused");
    const limited = await new ClaudeAnalyzer(undefined, fakeClient([new Anthropic.RateLimitError(429, undefined, "slow down", new Headers())]).client).analyze(request).catch((e) => e);
    expect(limited).toMatchObject({ kind: "rate_limited", message: "The AI provider rate limit was reached. Try again in a minute." });
    const auth = await new ClaudeAnalyzer(undefined, fakeClient([new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers())]).client).analyze(request).catch((e) => e);
    expect(auth.kind).toBe("not_configured");
    const down = await new ClaudeAnalyzer(undefined, fakeClient([new Anthropic.InternalServerError(503, undefined, "overloaded", new Headers())]).client).analyze(request).catch((e) => e);
    expect(down.kind).toBe("unavailable");
  });

  it("prices the model that actually served the request (fallbacks)", async () => {
    const r = await new ClaudeAnalyzer(undefined, fakeClient([ok(good, { model: "claude-opus-4-8" })]).client).analyze(request);
    expect(r.model).toBe("claude-opus-4-8");
    expect(r.usage!.costUsd).toBe(0.01);
  });
});

describe("mergeAiImpacts guardrails", () => {
  it("ignores unknown assets, refuses big level jumps and keeps rule output for omitted assets", () => {
    const m = mergeAiImpacts(request, [
      { assetId: "menu", level: "low", recommendedAction: "x", rationale: "y" }, // critical → low: 3 steps
      { assetId: "ghost", level: "critical", recommendedAction: "Delete everything", rationale: "" },
      { assetId: "menu", level: "high", recommendedAction: "dup", rationale: "" },
    ]);
    expect(m.impacts).toEqual([
      { assetId: "menu", level: "critical", recommendedAction: "x", rationale: "y" },
      { assetId: "promo", level: "low", recommendedAction: "Check promo.", rationale: null },
    ]);
    expect(m.warnings).toHaveLength(3);
  });

  it("caps and sanitizes text", () => {
    const m = mergeAiImpacts(request, [{ assetId: "menu", level: "critical", recommendedAction: `${"a".repeat(900)}​`, rationale: "" }]);
    expect(m.impacts[0]!.recommendedAction.length).toBeLessThanOrEqual(500);
    expect(m.impacts[0]!.rationale).toBeNull();
  });
});

describe("RuleBasedAnalyzer and pricing", () => {
  it("returns the deterministic result without usage", async () => {
    const r = await new RuleBasedAnalyzer().analyze(request);
    expect(r).toMatchObject({ provider: "rules", model: null, summary: request.ruleSummary, usage: null });
    expect(r.impacts.map((i) => i.recommendedAction)).toEqual(["Replace $12 with $15.", "Check promo."]);
  });
  it("estimates cost only for known models", () => {
    expect(estimateCostUsd("claude-opus-5-5", 1_000_000, 100_000)).toBe(6);
    expect(estimateCostUsd("claude-haiku-5-5", 10_000, 1000)).toBe(0.0015);
    expect(estimateCostUsd("unknown-model", 1, 1)).toBeNull();
  });
});
