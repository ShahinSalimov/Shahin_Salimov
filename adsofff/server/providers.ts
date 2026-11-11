import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import type { ServerConfig } from './config';
import { providerSchemas, type ProviderTask } from './aiSchemas';

/** Server-side AI provider contract. Add providers here without touching the client. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generate<T extends ProviderTask>(task: T, system: string, user: string, signal: AbortSignal): Promise<z.infer<(typeof providerSchemas)[T]>>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 55_000;
const MAX_OUTPUT_TOKENS = 16_000;

/** Models that accept Anthropic's server-side refusal fallback (`fallbacks: "default"`). */
const ANTHROPIC_FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** Maps SDK errors to safe, user-facing messages. Never includes credentials or raw payloads. */
function mapSdkError(e: unknown, provider: string): ProviderError {
  if (e instanceof ProviderError) return e;
  const name = e instanceof Error ? e.constructor.name : '';
  const status = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : undefined;
  if (name.includes('Timeout') || (e instanceof Error && e.name === 'AbortError')) return new ProviderError(`${provider} took too long to respond.`, 504);
  if (status === 401 || status === 403) return new ProviderError(`${provider} rejected the server's API key. Check AI_API_KEY.`, 502);
  if (status === 404) return new ProviderError(`${provider} does not recognise the model in AI_MODEL.`, 502);
  if (status === 429) return new ProviderError(`${provider} rate limit reached. Try again shortly.`, 429);
  if (status === 400) return new ProviderError(`${provider} rejected the request (400).`, 502);
  if (status && status >= 500) return new ProviderError(`${provider} is temporarily unavailable (${status}).`, 502);
  if (name.includes('Connection')) return new ProviderError(`${provider} could not be reached.`, 502);
  return new ProviderError(`${provider} request failed.`, 502);
}

function anthropicProvider(cfg: ServerConfig): AiProvider {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    // Always explicit: never let an ambient ANTHROPIC_BASE_URL redirect the key elsewhere.
    baseURL: cfg.baseUrl || 'https://api.anthropic.com',
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });
  const useFallback = ANTHROPIC_FALLBACK_MODELS.has(cfg.model) && !cfg.baseUrl;
  return {
    name: 'Anthropic',
    model: cfg.model,
    async generate(task, system, user, signal) {
      try {
        const res = await client.beta.messages.parse(
          {
            model: cfg.model,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            messages: [{ role: 'user', content: user }],
            output_config: { format: betaZodOutputFormat(providerSchemas[task]) },
            ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          },
          { signal },
        );
        if (res.stop_reason === 'refusal') throw new ProviderError('The AI provider declined this request. Edit the brief or use Demo Generation.', 422);
        if (res.stop_reason === 'max_tokens') throw new ProviderError('The AI response was cut off. Try again.', 502);
        if (!res.parsed_output) throw new ProviderError('The AI response did not match the expected format.', 502);
        return res.parsed_output as never;
      } catch (e) {
        throw mapSdkError(e, 'Anthropic');
      }
    },
  };
}

function openAiProvider(cfg: ServerConfig): AiProvider {
  const official = !cfg.baseUrl || /^https:\/\/api\.openai\.com\b/.test(cfg.baseUrl);
  const strict = cfg.structuredOutput === 'on' || (cfg.structuredOutput === 'auto' && official);
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    // Always explicit: never let an ambient OPENAI_BASE_URL redirect the key elsewhere.
    baseURL: cfg.baseUrl || 'https://api.openai.com/v1',
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });
  const label = official ? 'OpenAI' : 'OpenAI-compatible';
  return {
    name: label,
    model: cfg.model,
    async generate(task, system, user, signal) {
      const schema = providerSchemas[task];
      const messages = [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: user },
      ];
      try {
        if (strict) {
          // Strict JSON-schema structured output, parsed and validated by the SDK.
          const res = await client.chat.completions.parse(
            { model: cfg.model, messages, max_completion_tokens: MAX_OUTPUT_TOKENS, response_format: zodResponseFormat(schema, task) },
            { signal },
          );
          const msg = res.choices[0]?.message;
          if (msg?.refusal) throw new ProviderError('The AI provider declined this request. Edit the brief or use Demo Generation.', 422);
          if (res.choices[0]?.finish_reason === 'length') throw new ProviderError('The AI response was cut off. Try again.', 502);
          if (!msg?.parsed) throw new ProviderError('The AI response did not match the expected format.', 502);
          return msg.parsed as never;
        }
        // Compatible endpoints often lack strict schemas: request a JSON object and validate it ourselves.
        const res = await client.chat.completions.create(
          { model: cfg.model, messages, max_completion_tokens: MAX_OUTPUT_TOKENS, response_format: { type: 'json_object' } },
          { signal },
        );
        const text = res.choices[0]?.message?.content;
        if (!text) throw new ProviderError('The provider returned an empty response.');
        const parsed = schema.safeParse(extractJson(text));
        if (!parsed.success) throw new ProviderError('The AI response did not match the expected format.', 502);
        return parsed.data as never;
      } catch (e) {
        throw mapSdkError(e, label);
      }
    },
  };
}

export function createProvider(cfg: ServerConfig): AiProvider | null {
  if (cfg.provider === 'anthropic') return anthropicProvider(cfg);
  if (cfg.provider === 'openai') return openAiProvider(cfg);
  return null;
}

/** Extracts the first JSON object from a model reply (tolerates code fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new ProviderError('The provider reply did not contain JSON.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ProviderError('The provider reply contained invalid JSON.');
  }
}
