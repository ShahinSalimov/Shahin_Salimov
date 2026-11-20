import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let client = null;
export const aiEnabled = () => Boolean(config.anthropicKey);

function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 2, timeout: 180_000 });
  return client;
}

/**
 * Structured JSON generation with Claude.
 * - output_config.format guarantees schema-valid JSON
 * - server-side fallback keeps the request alive if the main model declines
 */
export async function generateJSON({ system, user, schema, maxTokens = 16000 }) {
  const stream = getClient().beta.messages.stream({
    model: config.claudeModel,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: config.claudeEffort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "refusal") {
    const err = new Error("AI sorğunu rədd etdi");
    err.code = "refusal";
    throw err;
  }
  if (msg.stop_reason === "max_tokens") {
    const err = new Error("AI cavabı yarımçıq qaldı");
    err.code = "truncated";
    throw err;
  }
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { data: JSON.parse(text), usage: msg.usage, model: msg.model };
}
