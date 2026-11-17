import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getClaudeModel } from "./config";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { AdPackSchema, type AdPack, type GenerateInput } from "./schema";

export type ProductImage = {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  base64: string;
};

export class GenerationError extends Error {
  constructor(
    message: string,
    /** Safe to show to the end user. */
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export async function generateAdPack(input: GenerateInput, image?: ProductImage): Promise<AdPack> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 },
    });
  }
  content.push({ type: "text", text: buildUserPrompt(input, Boolean(image)) });

  let response;
  try {
    response = await getClient().beta.messages.parse({
      model: getClaudeModel(),
      max_tokens: 16000,
      // Stable system prompt first so it can be cached across requests.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: betaZodOutputFormat(AdPackSchema) },
      // If the primary model declines on policy grounds, the API retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new GenerationError(`rate limited: ${error.message}`, "We're busy right now. Please try again in a minute.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new GenerationError(`bad request: ${error.message}`, "This request could not be processed. Try a different image or description.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new GenerationError(`api error ${error.status}: ${error.message}`, "The AI service had a problem. Please try again.");
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new GenerationError(
      `refusal: ${response.stop_details?.category ?? "unknown"}`,
      "This product or request can't be advertised with our tool.",
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new GenerationError("max_tokens reached", "The result was too long. Try a shorter duration.");
  }
  if (!response.parsed_output) {
    throw new GenerationError("empty parsed_output", "The AI returned an unexpected result. Please try again.");
  }
  return response.parsed_output;
}
